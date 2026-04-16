import { autoUpdater, UpdateCheckResult } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import log from 'electron-log/main'

// Check dates: 5th and 15th of each month
const CHECK_DAYS = [5, 15]
const STARTUP_CHECK_DELAY_MS = 5 * 1000
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let checkInterval: NodeJS.Timeout | null = null
let mainWindowRef: BrowserWindow | null = null

function shouldCheckToday(): boolean {
  const day = new Date().getDate()
  return CHECK_DAYS.includes(day)
}

function notifyRenderer(status: string, info?: { version?: string; error?: string }): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return
  mainWindowRef.webContents.send('update-status', { status, ...info })
}

async function checkForUpdates(silent = true): Promise<string | null> {
  try {
    log.info('Checking for updates...')
    const result: UpdateCheckResult = await autoUpdater.checkForUpdates()
    if (result?.updateInfo?.version) {
      log.info(`Update available: v${result.updateInfo.version}`)
      return result.updateInfo.version
    }
    if (!silent) {
      log.info('No updates available')
      notifyRenderer('up-to-date')
    }
    return null
  } catch (error) {
    log.error('Update check failed:', error)
    if (!silent) {
      notifyRenderer('error', { error: (error as Error).message })
    }
    return null
  }
}

async function scheduledCheck(): Promise<void> {
  if (!shouldCheckToday()) return
  await checkForUpdates(false)
}

export function startUpdater(win: BrowserWindow): void {
  mainWindowRef = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('autoUpdater: checking-for-update')
    notifyRenderer('checking')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`autoUpdater: update-available v${info.version}`)
    notifyRenderer('available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('autoUpdater: update-not-available')
    notifyRenderer('up-to-date')
  })

  autoUpdater.on('download-progress', () => {
    notifyRenderer('downloading')
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`autoUpdater: update-downloaded v${info.version}`)
    notifyRenderer('downloaded', { version: info.version })
    if (!mainWindowRef || mainWindowRef.isDestroyed()) return
    dialog.showMessageBox(mainWindowRef, {
      type: 'info',
      title: '发现新版本',
      message: `DocSeeker v${info.version} 已下载完成，是否现在重启安装？`,
      buttons: ['立即重启', '稍后'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('error', (error) => {
    log.error('autoUpdater error:', error)
    notifyRenderer('error', { error: error.message })
  })

  // Initial check on startup (if today is a check day)
  if (shouldCheckToday()) {
    setTimeout(() => checkForUpdates(false), STARTUP_CHECK_DELAY_MS)
  }

  // Check every hour; the date gate is inside scheduledCheck()
  checkInterval = setInterval(scheduledCheck, CHECK_INTERVAL_MS)
  log.info('Update checker started (checks on the 5th and 15th of each month)')
}

export function stopUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  mainWindowRef = null
  log.info('Update checker stopped')
}

export async function handleManualCheck(): Promise<string | null> {
  return checkForUpdates(false)
}

export async function handleDownloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    log.error('Failed to download update:', error)
  }
}

export function handleQuitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true)
}