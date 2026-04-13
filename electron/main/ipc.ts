import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { Worker } from 'worker_threads'
import { join } from 'path'
import {
  searchFiles,
  getFileCount,
  insertFile,
  getFileByPath,
  updateFile,
  deleteFileByPath,
  removeFilesByFolderPath,
  getFileCountByFolder,
  getTotalSizeByFolder,
  FileRecord,
  addScannedFolder,
  updateFolderScanComplete,
  getScannedFolderByPath,
  getScannedFolderById,
  getAllScannedFolders,
  deleteScannedFolder,
  ScannedFolder
} from './database'

let handlersRegistered = false

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

  // Search files
  ipcMain.handle('search-files', async (_, query: string): Promise<FileRecord[]> => {
    return searchFiles(query)
  })

  // Delete a file (move to trash)
  ipcMain.handle('delete-file', async (_, filePath: string): Promise<boolean> => {
    try {
      await shell.trashItem(filePath)
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
  ipcMain.handle('get-scanned-folders', async (): Promise<ScannedFolder[]> => {
    return getAllScannedFolders()
  })

  // Add or update a scanned folder
  ipcMain.handle('add-scanned-folder', async (_, folderPath: string): Promise<ScannedFolder | null> => {
    const existing = getScannedFolderByPath(folderPath)
    if (existing) {
      return existing
    }

    const name = folderPath.split(/[/\\]/).pop() || folderPath
    addScannedFolder({
      path: folderPath,
      name,
      file_count: 0,
      total_size: 0,
      schedule_enabled: 0
    })

    return getScannedFolderByPath(folderPath) ?? null
  })

  // Delete a scanned folder and its files
  ipcMain.handle('delete-scanned-folder', async (_, id: number): Promise<void> => {
    const folder = getScannedFolderById(id)
    if (folder) {
      // Remove all files from this folder from database
      removeFilesByFolderPath(folder.path)
      // Delete the folder record
      deleteScannedFolder(id)
    }
  })

  // Run incremental scan on a folder
  ipcMain.handle('incremental-scan', async (event, folderPath: string): Promise<{ success: boolean; filesProcessed: number; skipped: number; errors: string[] }> => {
    log.info(`IPC: incremental-scan called for ${folderPath}`)

    const folder = getScannedFolderByPath(folderPath)
    if (!folder) {
      return { success: false, filesProcessed: 0, skipped: 0, errors: ['Folder not found in scan records'] }
    }

    return new Promise((resolve) => {
      const workerPath = join(__dirname, 'scanWorker.js')

      try {
        const worker = new Worker(workerPath, {
          workerData: { dirPath: folderPath, incremental: true, lastScanAt: folder.last_scan_at }
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
              log.info(`Incremental scan complete: ${filesProcessed} files updated`)
              // Update folder stats
              if (folder && folder.id) {
                const fileCount = getFileCountByFolder(folderPath)
                const totalSize = getTotalSizeByFolder(folderPath)
                updateFolderScanComplete(folder.id, fileCount, totalSize)
              }
              event.sender.send('scan-progress', {
                current: filesProcessed,
                total: filesProcessed,
                currentFile: '扫描完成',
                phase: 'complete'
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

      try {
        const worker = new Worker(workerPath, {
          workerData: { dirPath: folderPath }
        })

        let filesProcessed = 0
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
              log.info(`Full rescan complete: ${filesProcessed} files`)
              // Update folder stats
              if (folder && folder.id) {
                const fileCount = getFileCountByFolder(folderPath)
                const totalSize = getTotalSizeByFolder(folderPath)
                updateFolderScanComplete(folder.id, fileCount, totalSize)
              }
              event.sender.send('scan-progress', {
                current: filesProcessed,
                total: filesProcessed,
                currentFile: '扫描完成',
                phase: 'complete'
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

  log.info('All IPC handlers registered')
}
