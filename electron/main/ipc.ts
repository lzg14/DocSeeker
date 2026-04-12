import { ipcMain, dialog, shell } from 'electron'
import log from 'electron-log/main'
import { Worker } from 'worker_threads'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import {
  getAllFiles,
  searchFiles,
  findDuplicates,
  clearAllFiles,
  getFileCount,
  insertFile,
  getFileByPath,
  updateFile,
  deleteFileByPath,
  removeFilesByFolderPath,
  getFileCountByFolder,
  getTotalSizeByFolder,
  getSearchSnippets,
  FileRecord,
  addScannedFolder,
  updateScannedFolder,
  updateFolderScanComplete,
  getScannedFolderByPath,
  getScannedFolderById,
  getAllScannedFolders,
  getScheduledFolders,
  deleteScannedFolder,
  ScannedFolder
} from './database'

// Worker management for pause/resume/cancel
let currentWorker: Worker | null = null
let isPaused = false

function cleanupWorker(): void {
  if (currentWorker) {
    try {
      currentWorker.terminate()
    } catch (e) {
      // Ignore errors during cleanup
    }
    currentWorker = null
    isPaused = false
  }
}

export function registerIpcHandlers(): void {
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

  // Scan directory - runs in worker thread
  ipcMain.handle(
    'scan-directory',
    async (event, dirPath: string): Promise<{ success: boolean; filesProcessed: number; errors: string[]; cancelled?: boolean }> => {
      log.info(`IPC: scan-directory called for ${dirPath}`)

      // Clean up any existing worker
      cleanupWorker()

      return new Promise((resolve) => {
        const workerPath = join(__dirname, 'scanWorker.js')
        let filesProcessed = 0
        const errors: string[] = []
        let cancelled = false

        try {
          currentWorker = new Worker(workerPath, {
            workerData: { dirPath }
          })

          currentWorker.on('message', (message) => {
            if (isPaused) {
              // Skip processing while paused
              return
            }

            switch (message.type) {
              case 'progress':
                event.sender.send('scan-progress', { ...message.data, paused: isPaused })
                break
              case 'batch': {
                // Process batch of files
                const batch: FileRecord[] = []
                for (const fileInfo of message.data) {
                  const fileRecord: FileRecord = {
                    path: fileInfo.path,
                    name: fileInfo.name,
                    size: fileInfo.size,
                    hash: fileInfo.hash,
                    file_type: fileInfo.fileType,
                    content: fileInfo.content
                  }
                  batch.push(fileRecord)
                }

                // Batch database operations
                for (const fileRecord of batch) {
                  const existing = getFileByPath(fileRecord.path)
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
                log.info(`Scan complete: ${message.data.filesProcessed} files, cancelled: ${cancelled}`)
                cleanupWorker()
                resolve({ success: true, filesProcessed, errors, cancelled })
                break
              case 'error':
                log.error('Scan worker error:', message.data.message)
                errors.push(message.data.message)
                cleanupWorker()
                resolve({ success: false, filesProcessed, errors, cancelled })
                break
            }
          })

          currentWorker.on('error', (error) => {
            log.error('Worker error:', error)
            cleanupWorker()
            resolve({ success: false, filesProcessed, errors: [error.message], cancelled })
          })

          currentWorker.on('exit', (code) => {
            if (code !== 0 && !cancelled) {
              log.error(`Worker exited with code ${code}`)
            }
          })
        } catch (error) {
          log.error('Failed to start scan worker:', error)
          cleanupWorker()
          resolve({ success: false, filesProcessed: 0, errors: [(error as Error).message], cancelled })
        }
      })
    }
  )

  // Pause scan
  ipcMain.handle('pause-scan', async (event): Promise<void> => {
    if (currentWorker) {
      isPaused = true
      event.sender.send('scan-paused', { paused: true })
      log.info('Scan paused')
    }
  })

  // Resume scan
  ipcMain.handle('resume-scan', async (event): Promise<void> => {
    if (currentWorker && isPaused) {
      isPaused = false
      event.sender.send('scan-paused', { paused: false })
      log.info('Scan resumed')
    }
  })

  // Cancel/stop scan
  ipcMain.handle('cancel-scan', async (event): Promise<{ success: boolean; filesProcessed: number }> => {
    let filesProcessed = 0
    if (currentWorker) {
      log.info('Scan cancelled by user')
      cleanupWorker()
      event.sender.send('scan-cancelled', { cancelled: true })
    }
    return { success: true, filesProcessed }
  })

  // Check if scan is in progress
  ipcMain.handle('is-scanning', async (): Promise<{ scanning: boolean; paused: boolean }> => {
    return { scanning: currentWorker !== null, paused: isPaused }
  })

  // Get all files
  ipcMain.handle('get-all-files', async (): Promise<FileRecord[]> => {
    return getAllFiles()
  })

  // Search files
  ipcMain.handle('search-files', async (_, query: string, options?: any): Promise<FileRecord[]> => {
    return searchFiles(query, options)
  })

  // Get search snippets with highlighted keywords
  ipcMain.handle('get-search-snippets', async (_, query: string, fileIds: number[]): Promise<Record<number, string>> => {
    const snippets = getSearchSnippets(query, fileIds)
    const result: Record<number, string> = {}
    snippets.forEach((snippet, id) => {
      result[id] = snippet
    })
    return result
  })

  // Delete a file (move to trash)
  ipcMain.handle('delete-file', async (_, filePath: string): Promise<boolean> => {
    try {
      const success = await shell.trashItem(filePath)
      if (success) {
        deleteFileByPath(filePath)
      }
      return success
    } catch (error) {
      log.error('Failed to delete file:', error)
      return false
    }
  })

  // Find duplicates
  ipcMain.handle('find-duplicates', async (): Promise<FileRecord[][]> => {
    return findDuplicates()
  })

  // Clear all files
  ipcMain.handle('clear-all-files', async (): Promise<void> => {
    clearAllFiles()
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

  // Get scheduled folders
  ipcMain.handle('get-scheduled-folders', async (): Promise<ScannedFolder[]> => {
    return getScheduledFolders()
  })

  // Add or update a scanned folder
  ipcMain.handle('add-scanned-folder', async (_, folderPath: string): Promise<ScannedFolder | null> => {
    const existing = getScannedFolderByPath(folderPath)
    if (existing) {
      return existing
    }

    const name = path.basename(folderPath)
    addScannedFolder({
      path: folderPath,
      name,
      file_count: 0,
      total_size: 0,
      schedule_enabled: 0
    })

    return getScannedFolderByPath(folderPath)
  })

  // Update folder schedule settings
  ipcMain.handle('update-folder-schedule', async (_, id: number, enabled: boolean, day: string | null, time: string | null): Promise<void> => {
    updateScannedFolder(id, {
      schedule_enabled: enabled ? 1 : 0,
      schedule_day: day,
      schedule_time: time
    })
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

  // Update scanned folder after scan complete
  ipcMain.handle('update-folder-after-scan', async (_, folderPath: string, scanResult: { filesProcessed: number }): Promise<void> => {
    const folder = getScannedFolderByPath(folderPath)
    if (folder) {
      const fileCount = getFileCountByFolder(folderPath)
      const totalSize = getTotalSizeByFolder(folderPath)
      updateFolderScanComplete(folder.id!, fileCount, totalSize)
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

  log.info('All IPC handlers registered')
}
