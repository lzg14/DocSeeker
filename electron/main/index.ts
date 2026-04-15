import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { startScheduler, stopScheduler } from './scheduler'

// Initialize logging
log.initialize()
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB per file
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
let tray: Tray | null = null
let isClosingFromIPC = false
let floatingWindow: BrowserWindow | null = null
let currentHotkey = 'CommandOrControl+Shift+F'

function registerGlobalShortcut(hotkey: string): void {
  globalShortcut.unregisterAll()
  // Convert CommandOrControl -> Ctrl for Windows globalShortcut API
  const nativeHotkey = hotkey.replace(/CommandOrControl/gi, 'Ctrl')
  try {
    globalShortcut.register(nativeHotkey, () => {
      if (floatingWindow) {
        floatingWindow.show()
        floatingWindow.focus()
      }
    })
    currentHotkey = hotkey
    log.info(`Global shortcut registered: ${nativeHotkey}`)
  } catch (err) {
    log.error(`Failed to register global shortcut "${nativeHotkey}":`, err)
  }
}

function createFloatingWindow(): void {
  floatingWindow = new BrowserWindow({
    width: 600,
    height: 360,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  floatingWindow.on('blur', () => {
    floatingWindow?.hide()
  })

  floatingWindow.on('closed', () => {
    floatingWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatingWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/floating')
  } else {
    floatingWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/floating' })
  }
}

function createTray(): void {
  const iconPath = join(__dirname, '../../build/icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    log.warn('Tray icon not found, skipping tray creation')
    return
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('DocSeeker')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })

  log.info('System tray created')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
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

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', false)
  })

  // 最小化到托盘
  mainWindow.on('minimize', () => {
    mainWindow?.hide()
  })

  // 非 IPC 触发的关闭（托盘 X、系统关闭）则隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting && !isClosingFromIPC) {
      event.preventDefault()
      mainWindow?.webContents.send('show-close-confirm')
    }
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
    const t0 = Date.now()
    await initDatabase()
    log.info(`Database initialized in ${Date.now() - t0}ms`)
  } catch (error) {
    log.error('Failed to initialize database:', error)
    dialog.showErrorBox('数据库错误', '无法初始化数据库，应用将退出')
    app.quit()
    return
  }

  // Register IPC handlers
  registerIpcHandlers()
  log.info('IPC handlers registered')

  // IPC handler for hiding floating window
  ipcMain.handle('window-hide-floating', async () => {
    if (floatingWindow) floatingWindow.hide()
  })

  // Start the scheduled scan scheduler
  const ts0 = Date.now()
  startScheduler()
  log.info(`Scheduler started in ${Date.now() - ts0}ms`)

  // File watcher disabled for performance (chokidar causes high CPU on large dirs)
  // setTimeout(() => {
  //   startFileWatcher().catch((err: Error) => log.error('File watcher init failed:', err))
  // }, 3000)

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
  createFloatingWindow()

  registerGlobalShortcut('CommandOrControl+Shift+F')

  // Global hotkey IPC handlers
  ipcMain.handle('get-global-hotkey', () => currentHotkey)

  ipcMain.handle('set-global-hotkey', (_, hotkey: string) => {
    registerGlobalShortcut(hotkey)
  })

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
  ;(app as any).isQuitting = true
  globalShortcut.unregisterAll()
  stopScheduler()
  closeDatabase()
})
