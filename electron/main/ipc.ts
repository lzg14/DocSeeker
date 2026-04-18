import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { Worker } from 'worker_threads'
import { join, extname } from 'path'
import { getHotResults, setHotResults } from './hotCache'
import {
  deleteFileByPath,
  removeFilesByFolderPath,
  getFileCountByFolder,
  getTotalSizeByFolder,
  FileRecord,
  ScannedFolder,
  SavedSearch,
  SearchHistoryEntry,
  SearchOptions
} from './database'
import {
  openNextShard,
  insertFileBatch,
  searchAllShards,
  searchByFileName as shardSearchByFileName,
  getSearchSnippets as shardGetSearchSnippets,
  getShardInfo,
  getTotalFileCountAsync,
  countFilesInFolder,
  getShardConfigInfo,
  deleteFileFromAllShards,
  deleteFilesByFolderPrefixFromAllShards,
  isShardManagerInitialized,
  deduplicateResults,
  type FileRecord as ShardFileRecord
} from './shardManager'
import {
  addScannedFolder,
  getAllScannedFolders,
  getScannedFolderByPath,
  updateFolderScanComplete,
  updateFolderFullScanComplete,
  deleteScannedFolder,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addSavedSearch,
  getSavedSearches,
  deleteSavedSearch,
  getScanSettings,
  updateScanSettings,
  type ScannedFolder as MetaScannedFolder
} from './config'

let handlersRegistered = false

// Current shard for inserts
let currentShardId = -1

async function getCurrentShard(): Promise<number> {
  if (currentShardId < 0) {
    const shard = await openNextShard()
    currentShardId = shard?.id ?? -1
  }
  return currentShardId
}

export function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  // Select directory
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // Search files (via shard manager)
  ipcMain.handle('search-files', async (_, query: string): Promise<FileRecord[]> => {
    if (!query.trim()) return []

    // Always record search history (before cache check to avoid regression)
    addSearchHistory(query)

    // LFU hot cache: check cache first
    const cached = getHotResults(query)
    if (cached !== undefined) {
      log.info(`[IPC] search-files: cache hit for "${query}" (${cached.length} results)`)
      return cached.map(e => ({
        path: e.path,
        name: e.name,
        size: e.size,
        hash: e.hash,
        file_type: e.file_type,
        content: e.content,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }))
    }
    try {
      const results = await searchAllShards(query)
      const mapped = results.map(r => ({
        id: r.id,
        path: r.path,
        name: r.name,
        size: r.size,
        hash: r.hash,
        file_type: r.file_type,
        content: r.content,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
        match_type: r.match_type ?? 'content'
      }))

      // Cache non-empty results with LFU strategy
      if (results.length > 0) {
        setHotResults(query, results.map(r => ({
          path: r.path,
          name: r.name,
          size: r.size,
          hash: r.hash,
          file_type: r.file_type,
          content: r.content,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })))
      }

      return mapped
    } catch (err) {
      log.error('[IPC] search-files error:', err)
      return []
    }
  })

  // Search by filename only
  ipcMain.handle('search-by-filename', async (_, query: string, options?: SearchOptions): Promise<FileRecord[]> => {
    if (query.trim()) addSearchHistory(query)
    try {
      const results = await shardSearchByFileName(query, options)
      return results.map(r => ({
        id: r.id,
        path: r.path,
        name: r.name,
        size: r.size,
        hash: r.hash,
        file_type: r.file_type,
        content: r.content,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
        match_type: r.match_type ?? 'filename'
      }))
    } catch (err) {
      log.error('[IPC] search-by-filename error:', err)
      return []
    }
  })

  // Advanced search (via shard manager)
  ipcMain.handle('search-files-advanced', async (_, query: string, options?: SearchOptions): Promise<FileRecord[]> => {
    if (query.trim()) addSearchHistory(query)
    try {
      const results = await searchAllShards(query, options)
      return results.map(r => ({
        id: r.id,
        path: r.path,
        name: r.name,
        size: r.size,
        hash: r.hash,
        file_type: r.file_type,
        content: r.content,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
        match_type: r.match_type ?? 'content'
      }))
    } catch (err) {
      log.error('[IPC] search-files-advanced error:', err)
      return []
    }
  })

  // Search with deduplication
  ipcMain.handle('search-deduplicate', async (_, query: string, options?: SearchOptions): Promise<FileRecord[]> => {
    if (query.trim()) addSearchHistory(query)
    try {
      const results = await searchAllShards(query, options)
      const deduped = deduplicateResults(results)
      return deduped.map(r => ({
        id: r.id,
        path: r.path,
        name: r.name,
        size: r.size,
        hash: r.hash,
        file_type: r.file_type,
        content: r.content,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
        match_type: r.match_type ?? 'content'
      }))
    } catch (err) {
      log.error('[IPC] search-deduplicate error:', err)
      return []
    }
  })

  // Search history — from meta.db (instant, no search DB needed)
  ipcMain.handle('get-search-history', async (): Promise<SearchHistoryEntry[]> => {
    return getSearchHistory(20)
  })

  ipcMain.handle('clear-search-history', async (): Promise<void> => {
    clearSearchHistory()
  })

  // Get search snippets (returns Record<string,string> keyed by file path)
  ipcMain.handle('get-search-snippets', async (_, query: string, filePaths: string[]): Promise<Record<string, string>> => {
    try {
      return await shardGetSearchSnippets(query, filePaths)
    } catch (err) {
      log.warn('[IPC] get-search-snippets error:', err)
      return {}
    }
  })

  // Saved searches — from meta.db (instant, no search DB needed)
  ipcMain.handle('get-saved-searches', async (): Promise<SavedSearch[]> => {
    return getSavedSearches()
  })

  ipcMain.handle('add-saved-search', async (_, name: string, query: string): Promise<number> => {
    return addSavedSearch(name, query)
  })

  ipcMain.handle('delete-saved-search', async (_, id: number): Promise<void> => {
    deleteSavedSearch(id)
  })

  // Delete a file (move to trash and remove from shards)
  ipcMain.handle('delete-file', async (_, filePath: string): Promise<boolean> => {
    try {
      await shell.trashItem(filePath)
      deleteFileFromAllShards(filePath)
      return true
    } catch (error) {
      log.error('[IPC] Failed to delete file:', error)
      return false
    }
  })

  // Get file count (triggers lazy loading if needed)
  ipcMain.handle('get-file-count', async (): Promise<number> => {
    return getTotalFileCountAsync()
  })

  // Get shard info (diagnostics)
  ipcMain.handle('get-shard-info', async () => {
    return getShardInfo()
  })

  // Open file in explorer
  ipcMain.handle('show-in-folder', async (_, filePath: string): Promise<void> => {
    shell.showItemInFolder(filePath)
  })

  // Open file with default application
  ipcMain.handle('open-file', async (_, filePath: string): Promise<void> => {
    shell.openPath(filePath)
  })

  // Get all scanned folders
  ipcMain.handle('get-scanned-folders', async (): Promise<MetaScannedFolder[]> => {
    return getAllScannedFolders()
  })

  // Add or update a scanned folder
  ipcMain.handle('add-scanned-folder', async (_, folderPath: string): Promise<MetaScannedFolder | null> => {
    const existing = getScannedFolderByPath(folderPath)
    if (existing) return existing
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    const folder = {
      path: folderPath,
      name,
      file_count: 0,
      total_size: 0,
      schedule_enabled: 0
    }
    addScannedFolder(folder)
    return getScannedFolderByPath(folderPath) ?? null
  })

  // Delete a scanned folder and its files
  ipcMain.handle('delete-scanned-folder', async (_, id: number): Promise<void> => {
    const folder = getAllScannedFolders().find(f => f.id === id)
    if (folder) {
      deleteFilesByFolderPrefixFromAllShards(folder.path)
    }
    deleteScannedFolder(id)
  })

  // Get scan settings
  ipcMain.handle('get-scan-settings', async (): Promise<any> => {
    return getScanSettings()
  })

  // Update scan settings
  ipcMain.handle('update-scan-settings', async (_, settings: any): Promise<void> => {
    updateScanSettings(settings)
  })

  // Check if shards are ready (used by renderer for polling)
  ipcMain.handle('db-is-ready', async (): Promise<boolean> => {
    // Return true once shard manager is initialized (profile/config ready, shards discovered)
    // Shard DB files are loaded lazily on first search, not at startup
    return isShardManagerInitialized()
  })

  // Run incremental scan on a folder
  ipcMain.handle('incremental-scan', async (event, folderPath: string): Promise<{ success: boolean; filesProcessed: number; skipped: number; errors: string[] }> => {
    log.info(`IPC: incremental-scan called for ${folderPath}`)

    const folder = getScannedFolderByPath(folderPath)
    const lastScanAt = folder?.last_scan_at ?? folder?.last_full_scan_at ?? undefined

    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'scanWorker.js')
      const scanSettings = getScanSettings()

      try {
        const worker = new Worker(workerPath, {
          workerData: {
            dirPath: folderPath,
            incremental: true,
            lastScanAt,
            settings: {
              includeHidden: scanSettings.includeHidden,
              includeSystem: scanSettings.includeSystem
            }
          }
        })

        let filesProcessed = 0
        let skipped = 0
        let totalSize = 0
        const errors: string[] = []
        let shardId = -1

        worker.on('message', (message) => {
          switch (message.type) {
            case 'progress':
              event.sender.send('scan-progress', message.data)
              break
            case 'batch': {
              ;(async () => {
                try {
                  shardId = await getCurrentShard()
                  if (shardId < 0) {
                    errors.push('No shard available')
                    return
                  }

                  const records: ShardFileRecord[] = message.data.map((fileInfo: any) => ({
                    path: fileInfo.path,
                    name: fileInfo.name,
                    size: fileInfo.size,
                    hash: fileInfo.hash,
                    file_type: fileInfo.fileType,
                    content: fileInfo.content,
                    is_supported: fileInfo.is_supported ?? 1
                  }))

                  const result = await insertFileBatch(shardId, records)
                  filesProcessed += result.fileCount

                  // Track total size of processed files for metadata update
                  totalSize += records.reduce((sum, r) => sum + (r.size || 0), 0)

                  // Check if current shard is full; open next shard if so
                  const shardInfo = getShardInfo().find(s => s.id === shardId)
                  const shardConfig = getShardConfigInfo()
                  if (shardInfo && shardConfig) {
                    const maxBytes = Math.min(shardConfig.maxSizeMB, 1000) * 1024 * 1024
                    if (shardInfo.currentSizeBytes >= maxBytes) {
                      const nextShard = await openNextShard()
                      currentShardId = nextShard?.id ?? -1
                    }
                  }
                } catch (err) {
                  log.error('[IPC] Batch insert error:', err)
                  errors.push((err as Error).message)
                }
              })()
              break
            }
            case 'complete':
              log.info(`Incremental scan complete: ${filesProcessed} files, skipped: ${message.data.skipped}, time: ${message.data.totalTime}ms`)
              // Update folder metadata with files processed in this scan
              if (folder && folder.id) {
                // Count total files in folder from shards and store
                const totalInFolder = countFilesInFolder(folderPath)
                updateFolderScanComplete(folder.id, totalInFolder, totalSize)
              }
              event.sender.send('scan-progress', {
                current: filesProcessed,
                total: filesProcessed,
                currentFile: '扫描完成',
                phase: 'complete',
                errorStats: message.data.errorStats,
                totalTime: message.data.totalTime
              })
              resolve({ success: true, filesProcessed, skipped, errors })
              worker.terminate()
              break
            case 'error':
              log.error('Incremental scan worker error:', message.data.message)
              errors.push(message.data.message)
              resolve({ success: false, filesProcessed, skipped, errors })
              worker.terminate()
              break
          }
        })

        worker.on('error', (error) => {
          log.error('Worker error:', error)
          resolve({ success: false, filesProcessed: 0, skipped: 0, errors: [error.message] })
        })
      } catch (error) {
        log.error('Failed to start incremental scan worker:', error)
        resolve({ success: false, filesProcessed: 0, skipped: 0, errors: [(error as Error).message] })
      }
    })
  })

  // Run full rescan on a folder
  ipcMain.handle('full-rescan', async (event, folderPath: string): Promise<{ success: boolean; filesProcessed: number; errors: string[] }> => {
    log.info(`IPC: full-rescan called for ${folderPath}`)
    const folder = getScannedFolderByPath(folderPath)
    if (!folder) {
      return { success: false, filesProcessed: 0, errors: ['Folder not found in scan records'] }
    }

    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'scanWorker.js')
      const scanSettings = getScanSettings()
      try {
        const worker = new Worker(workerPath, {
          workerData: {
            dirPath: folderPath,
            settings: {
              includeHidden: scanSettings.includeHidden,
              includeSystem: scanSettings.includeSystem
            }
          }
        })

        let filesProcessed = 0
        let totalSize = 0
        const errors: string[] = []
        let shardId = -1

        worker.on('message', (message) => {
          switch (message.type) {
            case 'progress':
              event.sender.send('scan-progress', message.data)
              break
            case 'batch': {
              ;(async () => {
                try {
                  shardId = await getCurrentShard()
                  if (shardId < 0) {
                    errors.push('No shard available')
                    return
                  }

                  const records: ShardFileRecord[] = message.data.map((fileInfo: any) => ({
                    path: fileInfo.path,
                    name: fileInfo.name,
                    size: fileInfo.size,
                    hash: fileInfo.hash,
                    file_type: fileInfo.fileType,
                    content: fileInfo.content,
                    is_supported: fileInfo.is_supported ?? 1
                  }))

                  const result = await insertFileBatch(shardId, records)
                  filesProcessed += result.fileCount
                  totalSize += records.reduce((sum, r) => sum + (r.size || 0), 0)

                  // Check if shard is full (apply 2000MB cap regardless of config)
                  const shardInfo = getShardInfo().find(s => s.id === shardId)
                  const shardConfig = getShardConfigInfo()
                  if (shardInfo && shardConfig) {
                    const maxBytes = Math.min(shardConfig.maxSizeMB, 1000) * 1024 * 1024
                    if (shardInfo.currentSizeBytes >= maxBytes) {
                      const nextShard = await openNextShard()
                      currentShardId = nextShard?.id ?? -1
                    }
                  }
                } catch (err) {
                  log.error('[IPC] Batch insert error:', err)
                  errors.push((err as Error).message)
                }
              })()
              break
            }
            case 'complete':
              log.info(`Full rescan complete: ${filesProcessed} files, time: ${message.data.totalTime}ms`)
              if (folder && folder.id) {
                // Count total files in folder from shards and store
                const totalInFolder = countFilesInFolder(folderPath)
                updateFolderFullScanComplete(folder.id, totalInFolder, totalSize)
              }
              event.sender.send('scan-progress', {
                current: filesProcessed,
                total: filesProcessed,
                currentFile: '扫描完成',
                phase: 'complete',
                errorStats: message.data.errorStats,
                totalTime: message.data.totalTime
              })
              resolve({ success: true, filesProcessed, errors })
              worker.terminate()
              break
            case 'error':
              log.error('Full rescan worker error:', message.data.message)
              errors.push(message.data.message)
              resolve({ success: false, filesProcessed, errors })
              worker.terminate()
              break
          }
        })

        worker.on('error', (error) => {
          log.error('Worker error:', error)
          resolve({ success: false, filesProcessed: 0, errors: [error.message] })
        })
      } catch (error) {
        log.error('Failed to start full rescan worker:', error)
        resolve({ success: false, filesProcessed: 0, errors: [(error as Error).message] })
      }
    })
  })

  ipcMain.handle('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
      win.webContents.send('window-maximized-changed', false)
    } else {
      win.maximize()
      win.webContents.send('window-maximized-changed', true)
    }
  })

  ipcMain.handle('window-close', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return

    if ((app as any).isQuitting) {
      win.close()
    } else {
      ;(app as any).isQuitting = true
      win.webContents.send('show-close-confirm')
    }
  })

  ipcMain.handle('window-is-maximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })

  ipcMain.handle('window-minimize-to-tray', (): void => {
    BrowserWindow.getFocusedWindow()?.hide()
  })

  // Extract text content from a dropped file
  ipcMain.handle('extract-file-content', async (_, filePath: string): Promise<string | null> => {
    try {
      const { extractContent } = await import('./scanner')
      const ext = extname(filePath).toLowerCase()
      const content = await extractContent(filePath)
      return content || null
    } catch (error) {
      log.warn('[IPC] Failed to extract file content:', error)
      return null
    }
  })

  // Get auto-launch status
  ipcMain.handle('get-auto-launch', async (): Promise<boolean> => {
    return app.getLoginItemSettings().openAtLogin
  })

  // Set auto-launch
  ipcMain.handle('set-auto-launch', async (_, enabled: boolean): Promise<void> => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, path: process.execPath })
  })

  // Get system paths (Documents, Desktop)
  ipcMain.handle('get-system-paths', async (): Promise<{ documents: string; desktop: string }> => {
    return {
      documents: app.getPath('documents'),
      desktop: app.getPath('desktop')
    }
  })

  log.info('[IPC] All handlers registered')
}
