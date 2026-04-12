import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { startScheduler, stopScheduler } from './scheduler'
import { startFileWatcher, stopFileWatcher } from './fileWatcher'

// Initialize logging
log.initialize()
log.info('Application starting...')

// Global exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error)
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    log.info('Main window ready to show')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  log.info('App ready, initializing...')

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.docseeker.app')

  // Initialize database
  try {
    await initDatabase()
    await startFileWatcher()
    log.info('Database initialized successfully')
  } catch (error) {
    log.error('Failed to initialize database:', error)
    dialog.showErrorBox('数据库错误', '无法初始化数据库，应用将退出')
    app.quit()
    return
  }

  // Register IPC handlers
  registerIpcHandlers()
  log.info('IPC handlers registered')

  // Start the scheduled scan scheduler
  startScheduler()
  log.info('Scheduled scan scheduler started')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log.info('Application quitting...')
  stopFileWatcher()
  stopScheduler()
  closeDatabase()
})
