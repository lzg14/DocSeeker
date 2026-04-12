import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'
import { getScheduledFolders, updateFolderScanComplete, ScannedFolder } from './database'

// Weekday names mapping
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

let schedulerInterval: NodeJS.Timeout | null = null
let lastScanDates: Map<number, string> = new Map()

// Get the worker path
function getWorkerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'scanWorker.js')
  }
  return path.join(__dirname, 'scanWorker.js')
}

// Check if a folder should be scanned today
function shouldScanToday(folder: ScannedFolder): boolean {
  if (!folder.schedule_enabled) return false

  const now = new Date()
  const currentDay = WEEKDAYS[now.getDay()]
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  // Check if today matches the scheduled day
  if (folder.schedule_day !== currentDay) return false

  // Check if the time matches (within the same minute)
  if (folder.schedule_time !== currentTime) return false

  // Check if we already scanned today
  const lastScan = lastScanDates.get(folder.id!)
  const todayStr = now.toISOString().split('T')[0]
  if (lastScan === todayStr) return false

  return true
}

// Run incremental scan on a folder
async function runIncrementalScan(folder: ScannedFolder): Promise<void> {
  log.info(`Starting scheduled incremental scan for: ${folder.path}`)

  return new Promise((resolve) => {
    const workerPath = getWorkerPath()

    if (!fs.existsSync(workerPath)) {
      log.error('Scan worker not found:', workerPath)
      resolve()
      return
    }

    try {
      const { Worker } = require('worker_threads')
      const worker = new Worker(workerPath, {
        workerData: { dirPath: folder.path, incremental: true, lastScanAt: folder.last_scan_at }
      })

      let newFiles = 0
      let modifiedFiles = 0
      let totalSize = folder.total_size || 0

      worker.on('message', (message: any) => {
        switch (message.type) {
          case 'file':
            newFiles++
            if (message.data.size) {
              totalSize += message.data.size
            }
            break
          case 'modified':
            modifiedFiles++
            break
          case 'complete': {
            const todayStr = new Date().toISOString().split('T')[0]
            lastScanDates.set(folder.id!, todayStr)

            log.info(`Scheduled scan complete: ${folder.path}, new: ${newFiles}, modified: ${modifiedFiles}`)

            // Notify renderer if window exists
            const windows = BrowserWindow.getAllWindows()
            if (windows.length > 0) {
              windows[0].webContents.send('scheduled-scan-complete', {
                folderPath: folder.path,
                newFiles,
                modifiedFiles
              })
            }

            worker.terminate()
            resolve()
            break
          }
          case 'error':
            log.error('Scheduled scan error:', message.data.message)
            worker.terminate()
            resolve()
            break
        }
      })

      worker.on('error', (error: Error) => {
        log.error('Worker error during scheduled scan:', error)
        resolve()
      })
    } catch (error) {
      log.error('Failed to start scheduled scan worker:', error)
      resolve()
    }
  })
}

// Check and run scheduled scans
async function checkScheduledScans(): Promise<void> {
  try {
    const folders = getScheduledFolders()

    for (const folder of folders) {
      if (shouldScanToday(folder)) {
        await runIncrementalScan(folder)
      }
    }
  } catch (error) {
    log.error('Error checking scheduled scans:', error)
  }
}

// Start the scheduler
export function startScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
  }

  // Check every minute
  schedulerInterval = setInterval(checkScheduledScans, 60 * 1000)

  log.info('File scan scheduler started')

  // Initial check
  checkScheduledScans()
}

// Stop the scheduler
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    log.info('File scan scheduler stopped')
  }
}
