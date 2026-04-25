import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { initDatabase, closeDatabase } from './database'
import { closeAllShards, initShardManager } from './shardManager'
import { initHotCache, closeHotCache } from './hotCache'
import { usnWatcher, onDoubleCtrl, onMonitorStatusChange } from './usnWatcher'
import { registerIpcHandlers } from './ipc'
import { getAppSetting, setAppSetting } from './config'

// Extend Electron App interface with custom property
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}

// Inline electron-toolkit utils to avoid bundling issue
const isDev = !app.isPackaged

const electronApp = {
  setAppUserModelId(id: string) {
    if (process.platform === 'win32') {
      app.setAppUserModelId(isDev ? process.execPath : id)
    }
  },
  setAutoLaunch(auto: boolean) {
    if (process.platform === 'linux') return false
    const isOpenAtLogin = () => app.getLoginItemSettings().openAtLogin
    if (isOpenAtLogin() !== auto) {
      app.setLoginItemSettings({ openAtLogin: auto, path: process.execPath })
      return isOpenAtLogin() === auto
    }
    return true
  },
  skipProxy() {
    // @ts-ignore
    return import('electron').then(({ session }) =>
      session.defaultSession.setProxy({ mode: 'direct' })
    )
  }
}

const optimizer = {
  watchWindowShortcuts(window: BrowserWindow, shortcutOptions?: { escToCloseWindow?: boolean; zoom?: boolean }) {
    if (!window) return
    const { webContents } = window
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {}
    webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (!isDev) {
          if (input.code === 'KeyR' && (input.control || input.meta)) {
            event.preventDefault()
          }
        } else {
          if (input.code === 'F12') {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools()
            } else {
              webContents.openDevTools({ mode: 'undocked' })
              log.info('Open dev tool...')
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === 'Escape' && input.key !== 'Process') {
            window.close()
            event.preventDefault()
          }
        }
        if (!zoom) {
          if (input.code === 'Minus' && (input.control || input.meta)) {
            event.preventDefault()
          }
          if (input.code === 'Equal' && input.shift && (input.control || input.meta)) {
            event.preventDefault()
          }
        }
      }
    })
  }
}

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

// Parse --search argument for context menu integration
const searchArgIndex = process.argv.indexOf('--search')
const initialSearchQuery = searchArgIndex >= 0 ? process.argv[searchArgIndex + 1] : null

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  log.info('Another instance is running, quitting...')
  app.quit()
} else {
  app.on('second-instance', (_, commandLine) => {
    // When another instance launches with --search, focus main window and send search
    const idx = commandLine.indexOf('--search')
    const query = idx >= 0 ? commandLine[idx + 1] : null

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()

      if (query) {
        log.info(`[Second Instance] Received search query: ${query}`)
        mainWindow.webContents.send('context-menu-search', query)
      }
    }
  })
}

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
  const parts = hotkey.split('+')
  const keyPart = parts[parts.length - 1]
  if (VALID_MODIFIERS.has(keyPart)) {
    log.warn(`Invalid hotkey "${hotkey}": last part "${keyPart}" is a modifier, not a key`)
    return
  }
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

function unregisterCurrentHotkey(): void {
  globalShortcut.unregisterAll()
  log.info('Global shortcut unregistered (for hotkey setting mode)')
}

function restoreHotkey(): void {
  // Restore the saved hotkey from config
  const savedHotkey = getAppSetting<string>('hotkey', 'CommandOrControl+Shift+F')
  registerGlobalShortcut(savedHotkey)
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

  // Enable ESC to close the floating window
  optimizer.watchWindowShortcuts(floatingWindow, { escToCloseWindow: true })

  floatingWindow.on('blur', () => {
    floatingWindow?.hide()
  })

  floatingWindow.on('closed', () => {
    floatingWindow = null
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
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

  updateTrayMenu()

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  log.info('System tray created')
}

function getTrayLabels(): { showWindow: string; globalSearch: string; exit: string } {
  // Get language from settings
  const lang = getAppSetting<string>('language', 'zh-CN')
  if (lang === 'en') {
    return {
      showWindow: 'Show Window',
      globalSearch: 'Global Search',
      exit: 'Exit'
    }
  }
  return {
    showWindow: '显示窗口',
    globalSearch: '全局搜索',
    exit: '退出'
  }
}

export function updateTrayMenu(): void {
  if (!tray) return

  const labels = getTrayLabels()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: labels.showWindow,
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: labels.globalSearch,
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
      label: labels.exit,
      click: () => {
        ;app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../build/icon.png')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const mainHtml = join(__dirname, '../renderer/index.html')
  mainWindow.loadFile(mainHtml)

  mainWindow.webContents.on('did-finish-load', () => {
    if (!isSilentStart) {
      log.info('React app loaded, showing window')
      mainWindow?.show()

      // Send initial search query if passed via --search argument
      if (initialSearchQuery) {
        log.info(`[Context Menu] Initial search query: ${initialSearchQuery}`)
        mainWindow?.webContents.send('context-menu-search', initialSearchQuery)
      }
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

  mainWindow.on('minimize', () => {
    mainWindow?.hide()
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting && !isClosingFromIPC) {
      event.preventDefault()
      mainWindow?.webContents.send('show-close-confirm')
    }
  })

  // Security: Only allow http/https URLs to be opened externally
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const url = details.url
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    } else {
      log.warn('Blocked opening non-http(s) URL:', url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  log.info('App ready, initializing...')

  electronApp.setAppUserModelId('com.docseeker.app')

  // Init hot cache (loads instantly, <10ms)
  initHotCache()

  // Init database (meta + shards) — non-blocking
  try {
    await initDatabase()
    log.info('Database initialized')
  } catch (error) {
    log.error('Failed to init database:', error)
    dialog.showErrorBox('数据库错误', '无法初始化数据库，应用将退出')
    app.quit()
    return
  }

  // Register IPC handlers
  registerIpcHandlers()
  log.info('IPC handlers registered')

  ipcMain.handle('window-hide-floating', async () => {
    if (floatingWindow) floatingWindow.hide()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create window immediately — meta DB is ready, UI shows instantly
  createWindow()

  // Load shards in background while UI is already showing
  initShardManager().then(() => log.info('Shards loaded in background'))

  // Start USN realtime monitor if enabled
  // Register double-ctrl callback to toggle floating window
  onDoubleCtrl(() => {
    if (floatingWindow) {
      if (floatingWindow.isVisible()) {
        floatingWindow.hide()
      } else {
        floatingWindow.show()
        floatingWindow.focus()
      }
    }
  })

  // Register monitor status change callback
  onMonitorStatusChange((status, message) => {
    // Notify renderer of status change
    mainWindow?.webContents.send('monitor-status-changed', { status, message })
  })

  usnWatcher.start().catch((e) => log.error('[UsnWatcher] failed to start:', e))

  // Initialize tray and floating window
  try { createTray() } catch (e) { log.error('createTray failed:', e) }
  try { createFloatingWindow() } catch (e) { log.error('createFloatingWindow failed:', e) }

  // Load saved hotkey from config, or use default
  const savedHotkey = getAppSetting<string>('hotkey', 'CommandOrControl+Shift+F')
  registerGlobalShortcut(savedHotkey)

  ipcMain.handle('get-global-hotkey', () => currentHotkey)

  ipcMain.handle('set-global-hotkey', (_, hotkey: string) => {
    registerGlobalShortcut(hotkey)
    setAppSetting('hotkey', hotkey)
  })

  // Disable hotkey temporarily (when user is setting a new hotkey)
  ipcMain.handle('disable-hotkey', () => {
    unregisterCurrentHotkey()
  })

  // Enable/restpre hotkey
  ipcMain.handle('enable-hotkey', () => {
    restoreHotkey()
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  closeAllShards()
  closeDatabase()
  closeHotCache()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log.info('Application quitting...')
  ;app.isQuitting = true
  globalShortcut.unregisterAll()
  stopUpdater()
  usnWatcher.stop()
  closeAllShards()
  closeDatabase()
  closeHotCache()
})
