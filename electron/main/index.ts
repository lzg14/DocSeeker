import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { initMetaDatabase, closeMetaDatabase } from './meta'
import { initSearchDatabaseAsync, closeSearchDatabase, onSearchDbReady } from './search'
import { initHotCache, closeHotCache } from './hotCache'
import { triggerHotCacheWarmup } from './ipc'
import { registerIpcHandlers } from './ipc'
import { startUpdater, stopUpdater, handleManualCheck, handleDownloadUpdate, handleQuitAndInstall } from './updater'

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
const isSilentStart = process.argv.includes('--startup')

const VALID_MODIFIERS = new Set(['Ctrl', 'Shift', 'Alt', 'Meta'])
const MODIFIER_REPLACE: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Control: 'Ctrl'
}

function isAutoLaunchEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
  })
  log.info(`[AutoLaunch] ${enabled ? 'Enabled' : 'Disabled'}`)
}

function registerGlobalShortcut(hotkey: string): void {
  globalShortcut.unregisterAll()
  // Validate: must have at least one non-modifier key
  const parts = hotkey.split('+')
  const keyPart = parts[parts.length - 1]
  if (VALID_MODIFIERS.has(keyPart)) {
    log.warn(`Invalid hotkey "${hotkey}": last part "${keyPart}" is a modifier, not a key`)
    return
  }
  // Convert CommandOrControl -> Ctrl for Windows
  const nativeHotkey = parts.map(p => MODIFIER_REPLACE[p] || p).join('+')
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
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '全局搜索',
      accelerator: currentHotkey,
      click: () => {
        if (floatingWindow) {
          floatingWindow.show()
          floatingWindow.focus()
        } else {
          createFloatingWindow()
          setTimeout(() => floatingWindow?.show(), 100)
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // Bypass close confirmation
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('DocSeeker')
  tray.setContextMenu(contextMenu)

  // Replace single-click behavior with double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
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

  // Load React app immediately — it shows a loading spinner while DB initializes
  const mainHtml = join(__dirname, '../renderer/index.html')
  mainWindow.loadFile(mainHtml)

  mainWindow.webContents.on('did-finish-load', () => {
    if (!isSilentStart) {
      log.info('React app loaded, showing window')
      mainWindow?.show()
    } else {
      log.info('React app loaded, silent start — window hidden')
    }
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    log.error('Renderer process gone:', details.reason, details.exitCode)
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    log.error(`Renderer failed to load: ${errorCode} - ${errorDescription}`)
  })

  mainWindow.on('ready-to-show', () => {
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
}

app.whenReady().then(async () => {
  log.info('App ready, initializing...')

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.docseeker.app')

  // Init meta DB immediately — it's tiny (<100KB), loads in <100ms
  try {
    initMetaDatabase()
    log.info('Meta DB ready')
  } catch (error) {
    log.error('Failed to init meta DB:', error)
    dialog.showErrorBox('数据库错误', '无法初始化元数据，应用将退出')
    app.quit()
    return
  }

  // Init hot cache immediately — small JSON file, loads instantly
  initHotCache()

  // When search DB finishes loading, warm up the hot cache with recent searches
  onSearchDbReady(() => {
    log.info('Search DB ready, warming up hot cache...')
    triggerHotCacheWarmup()
  })

  // Register IPC handlers
  registerIpcHandlers()
  log.info('IPC handlers registered')

  // IPC handler for hiding floating window
  ipcMain.handle('window-hide-floating', async () => {
    if (floatingWindow) floatingWindow.hide()
  })

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create window immediately — meta DB is ready, UI shows instantly
  createWindow()

  // Start loading search DB in background (via worker thread, non-blocking)
  // Search DB will be ready by the time user tries to search (~30s warm-up)
  initSearchDatabaseAsync().catch((err) => {
    log.error('Search DB background load failed:', err)
  })

  // Auto updater (checks on 5th and 15th each month)
  try { startUpdater(mainWindow!) } catch (e) { log.error('startUpdater failed:', e) }
  try { createTray() } catch (e) { log.error('createTray failed:', e) }
  try { createFloatingWindow() } catch (e) { log.error('createFloatingWindow failed:', e) }

  registerGlobalShortcut('CommandOrControl+Shift+F')

  // Global hotkey IPC handlers
  ipcMain.handle('get-global-hotkey', () => currentHotkey)

  ipcMain.handle('set-global-hotkey', (_, hotkey: string) => {
    registerGlobalShortcut(hotkey)
  })

  ipcMain.handle('update-check', async () => {
    return handleManualCheck()
  })

  ipcMain.handle('update-download', async () => {
    await handleDownloadUpdate()
  })

  ipcMain.handle('update-install', async () => {
    handleQuitAndInstall()
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  closeHotCache()
  closeSearchDatabase()
  closeMetaDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log.info('Application quitting...')
  ;(app as any).isQuitting = true
  globalShortcut.unregisterAll()
  stopUpdater()
  closeHotCache()
  closeSearchDatabase()
  closeMetaDatabase()
})
