import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { Worker } from 'worker_threads'
import { join, extname } from 'path'
import {
  searchFiles,
  searchFilesAdvanced,
  getSearchSnippets,
  SearchOptions,
  getFileCount,
  insertFile,
  getFileByPath,
  updateFile,
  deleteFileByPath,
  removeFilesByFolderPath,
  getFileCountByFolder,
  getTotalSizeByFolder,
  FileRecord,
  ScannedFolder,
  isSearchDbReady,
  getScannedFolderById,
  addScannedFolder,
  waitForSearchDb,
  onSearchDbReady
} from './search'
import {
  addScannedFolderMeta,
  getAllScannedFoldersMeta,
  getScannedFolderByPathMeta,
  updateFolderScanCompleteMeta,
  updateFolderFullScanCompleteMeta,
  deleteScannedFolderMeta,
  addSearchHistoryMeta,
  getSearchHistoryMeta,
  clearSearchHistoryMeta,
  addSavedSearchMeta,
  getSavedSearchesMeta,
  deleteSavedSearchMeta,
  MetaScannedFolder
} from './meta'
import {
  initHotCache,
  getHotResults,
  saveHotResults,
  warmupHotCache,
  setRecentQueriesForWarmup,
  closeHotCache
} from './hotCache'
import { getScanSettings, updateScanSettings } from './scanSettings'

let handlersRegistered = false

/** Called by index.ts to trigger hot cache warmup after search DB is ready. */
export function triggerHotCacheWarmup(): void {
  const recentHistory = getSearchHistoryMeta(20).map(h => h.query)
  setRecentQueriesForWarmup(recentHistory)
  warmupHotCache((query: string) => {
    try {
      return searchFiles(query).map(r => ({
        path: r.path, name: r.name, file_type: r.file_type, size: r.size
      }))
    } catch {
      return []
    }
  })
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

  // Search files — waits for search DB to be ready if still loading
  ipcMain.handle('search-files', async (_, query: string): Promise<FileRecord[]> => {
    await waitForSearchDb()
    if (query.trim()) addSearchHistoryMeta(query)
    const results = searchFiles(query)
    // Cache top results for instant display next time
    if (query.trim() && results.length > 0) {
      saveHotResults(query, results.slice(0, 10).map((r, i) => ({
        path: r.path, name: r.name, file_type: r.file_type, size: r.size, rank: i
      })))
    }
    return results
  })

  // Advanced search with filters
  ipcMain.handle('search-files-advanced', async (_, query: string, options?: SearchOptions): Promise<FileRecord[]> => {
    await waitForSearchDb()
    if (query.trim()) addSearchHistoryMeta(query)
    return searchFilesAdvanced(query, options)
  })

  // Search history — from meta.db (instant, no search DB needed)
  ipcMain.handle('get-search-history', async (): Promise<SearchHistoryEntry[]> => {
    return getSearchHistoryMeta(20)
  })

  ipcMain.handle('clear-search-history', async (): Promise<void> => {
    clearSearchHistoryMeta()
  })

  // Get search snippets for highlighting
  ipcMain.handle('get-search-snippets', async (_, query: string, fileIds: number[]): Promise<Record<number, string>> => {
    await waitForSearchDb()
    const snippets = getSearchSnippets(query, fileIds)
    const result: Record<number, string> = {}
    snippets.forEach((value, key) => { result[key] = value })
    return result
  })

  // Saved searches — from meta.db (instant, no search DB needed)
  ipcMain.handle('get-saved-searches', async (): Promise<SavedSearch[]> => {
    return getSavedSearchesMeta()
  })

  ipcMain.handle('add-saved-search', async (_, name: string, query: string): Promise<number> => {
    return addSavedSearchMeta(name, query)
  })

  ipcMain.handle('delete-saved-search', async (_, id: number): Promise<void> => {
    deleteSavedSearchMeta(id)
  })

  // Delete a file (move to trash)
  ipcMain.handle('delete-file', async (_, filePath: string): Promise<boolean> => {
    try {
      await shell.trashItem(filePath)
      await waitForSearchDb()
      deleteFileByPath(filePath)
      return true
    } catch (error) {
      log.error('Failed to delete file:', error)
      return false
    }
  })

  // Get file count
  ipcMain.handle('get-file-count', async (): Promise<number> => {
    return getFileCount()
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
    return getAllScannedFoldersMeta()
  })

  // Add or update a scanned folder
  ipcMain.handle('add-scanned-folder', async (_, folderPath: string): Promise<MetaScannedFolder | null> => {
    const existing = getScannedFolderByPathMeta(folderPath)
    if (existing) {
      return existing
    }
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    const folder = {
      path: folderPath,
      name,
      file_count: 0,
      total_size: 0,
      schedule_enabled: 0
    }
    addScannedFolderMeta(folder)
    // Also add to search DB if ready
    if (isSearchDbReady()) {
      addScannedFolder(folder)
    }
    return getScannedFolderByPathMeta(folderPath) ?? null
  })

  // Delete a scanned folder and its files
  ipcMain.handle('delete-scanned-folder', async (_, id: number): Promise<void> => {
    const folder = getScannedFolderById(id)
    if (folder) {
      // Remove all files from search DB
      removeFilesByFolderPath(folder.path)
      // Delete from search DB
      deleteScannedFolder(id)
    }
    // Always delete from meta DB too
    deleteScannedFolderMeta(id)
  })

  // Get scan settings
  ipcMain.handle('get-scan-settings', async (): Promise<any> => {
    return getScanSettings()
  })

  // Update scan settings
  ipcMain.handle('update-scan-settings', async (_, settings: any): Promise<void> => {
    updateScanSettings(settings)
  })

  // Get auto-launch status
  ipcMain.handle('get-auto-launch', async (): Promise<boolean> => {
    return app.getLoginItemSettings().openAtLogin
  })

  // Set auto-launch
  ipcMain.handle('set-auto-launch', async (_, enabled: boolean): Promise<void> => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, path: process.execPath })
  })

  // Check if search database is ready (used by renderer for polling)
  ipcMain.handle('db-is-ready', async (): Promise<boolean> => {
    return isSearchDbReady()
  })

  // Run incremental scan on a folder
  ipcMain.handle('incremental-scan', async (event, folderPath: string, settings?: any): Promise<{ success: boolean; filesProcessed: number; skipped: number; errors: string[] }> => {
    log.info(`IPC: incremental-scan called for ${folderPath}`)
    await waitForSearchDb()
    const folder = getScannedFolderByPath(folderPath)
    if (!folder) {
      return { success: false, filesProcessed: 0, skipped: 0, errors: ['Folder not found in scan records'] }
    }

    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'scanWorker.js')

      try {
        const worker = new Worker(workerPath, {
          workerData: { dirPath: folderPath, incremental: true, lastScanAt: folder.last_scan_at, settings }
        })

        let filesProcessed = 0
        let skipped = 0
        const errors: string[] = []

        worker.on('message', (message) => {
          switch (message.type) {
            case 'progress':
              event.sender.send('scan-progress', message.data)
              break
            case 'batch': {
              for (const fileInfo of message.data) {
                const fileRecord: FileRecord = {
                  path: fileInfo.path,
                  name: fileInfo.name,
                  size: fileInfo.size,
                  hash: fileInfo.hash,
                  file_type: fileInfo.fileType,
                  content: fileInfo.content
                }

                const existing = getFileByPath(fileInfo.path)
                if (existing) {
                  if (existing.hash !== fileRecord.hash || existing.content !== fileRecord.content) {
                    updateFile(existing.id!, fileRecord)
                  }
                } else {
                  insertFile(fileRecord)
                }
                filesProcessed++
              }
              break
            }
            case 'complete':
              log.info(`Incremental scan complete: ${filesProcessed} files updated, time: ${message.data.totalTime}ms`)
              // Update folder stats in both search DB and meta DB
              if (folder && folder.id) {
                const fileCount = getFileCountByFolder(folderPath)
                const totalSize = getTotalSizeByFolder(folderPath)
                updateFolderScanComplete(folder.id, fileCount, totalSize)
                updateFolderScanCompleteMeta(folder.id, fileCount, totalSize)
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
  ipcMain.handle('full-rescan', async (event, folderPath: string, settings?: any): Promise<{ success: boolean; filesProcessed: number; errors: string[] }> => {
    log.info(`IPC: full-rescan called for ${folderPath}`)
    await waitForSearchDb()
    const folder = getScannedFolderByPathMeta(folderPath)
    if (!folder) {
      return { success: false, filesProcessed: 0, errors: ['Folder not found in scan records'] }
    }

    // Sync folder to search DB if needed
    const searchFolder = getScannedFolderById(folder.id!)
    if (!searchFolder) {
      addScannedFolder({ path: folder.path, name: folder.name, file_count: 0, total_size: 0, schedule_enabled: folder.schedule_enabled ?? 0 })
    }

    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'scanWorker.js')
      try {
        const worker = new Worker(workerPath, { workerData: { dirPath: folderPath, settings } })
        let filesProcessed = 0
        const errors: string[] = []

        worker.on('message', (message) => {
          if (message.type === 'progress') {
            event.sender.send('scan-progress', message.data)
          } else if (message.type === 'batch') {
            for (const fileInfo of message.data) {
              const fileRecord: FileRecord = {
                path: fileInfo.path, name: fileInfo.name, size: fileInfo.size,
                hash: fileInfo.hash, file_type: fileInfo.fileType, content: fileInfo.content
              }
              const existing = getFileByPath(fileInfo.path)
              if (existing) {
                if (existing.hash !== fileRecord.hash || existing.content !== fileRecord.content) {
                  updateFile(existing.id!, fileRecord)
                }
              } else {
                insertFile(fileRecord)
              }
              filesProcessed++
            }
          } else if (message.type === 'complete') {
            log.info(`Full rescan complete: ${filesProcessed} files, time: ${message.data.totalTime}ms`)
            if (folder.id) {
              const fileCount = getFileCountByFolder(folderPath)
              const totalSize = getTotalSizeByFolder(folderPath)
              updateFolderFullScanComplete(folder.id, fileCount, totalSize)
              updateFolderFullScanCompleteMeta(folder.id, fileCount, totalSize)
            }
            event.sender.send('scan-progress', {
              current: filesProcessed, total: filesProcessed, currentFile: '扫描完成',
              phase: 'complete', errorStats: message.data.errorStats, totalTime: message.data.totalTime
            })
            resolve({ success: true, filesProcessed, errors })
            worker.terminate()
          } else if (message.type === 'error') {
            log.error('Full rescan worker error:', message.data.message)
            errors.push(message.data.message)
            resolve({ success: false, filesProcessed, errors })
            worker.terminate()
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
      // 已确认关闭，直接退出
      win.close()
    } else {
      // 第一次关闭，弹出对话框
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
      log.warn('Failed to extract file content:', error)
      return null
    }
  })

  log.info('All IPC handlers registered')
}
