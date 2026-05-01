/**
 * Config Store (config.json)
 *
 * Stores app-level settings as JSON:
 * - scan_settings: scanning preferences (file size limits, skip rules, etc.)
 * - app_settings: shard profile/config cache, etc.
 *
 * Folder metadata and search history are stored in meta.db (see meta.ts).
 *
 * Migration: On first run, if config.db exists, migrate data to config.json
 * then delete config.db.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import log from 'electron-log/main'

// ============ Scan Settings ============

/**
 * Get data storage path.
 * - If user has set a custom path, return that path
 * - Otherwise, return the default userData/db path
 */
export function getDataPath(): string {
  const customPath = store.app_settings.dataPath as string | undefined
  if (customPath && existsSync(customPath)) {
    return customPath
  }
  // Fallback to default
  return getDefaultDataPath()
}

export function getDefaultDataPath(): string {
  return join(app.getPath('userData'), 'db')
}

/**
 * Set custom data storage path.
 * Returns true if path is valid and saved.
 */
export function setDataPath(dataPath: string): boolean {
  if (!dataPath || !existsSync(dataPath)) {
    log.warn('[Config] Invalid data path:', dataPath)
    return false
  }
  store.app_settings.dataPath = dataPath

  // Ensure custom path directory exists
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true })
  }

  try {
    // Save full config to CUSTOM path
    const customConfigPath = join(dataPath, 'config.json')
    writeFileSync(customConfigPath, JSON.stringify(store, null, 2), 'utf-8')
    log.info('[Config] Config saved to custom path:', customConfigPath)

    // ALSO save a pointer config to DEFAULT path so we can find the custom path on restart
    const defaultPath = getDefaultDataPath()
    if (!existsSync(defaultPath)) {
      mkdirSync(defaultPath, { recursive: true })
    }
    const defaultConfigPath = join(defaultPath, 'config.json')
    const pointerConfig = {
      app_settings: {
        dataPath: dataPath  // Only need to remember the custom path
      }
    }
    writeFileSync(defaultConfigPath, JSON.stringify(pointerConfig, null, 2), 'utf-8')
    log.info('[Config] Pointer saved to default path:', defaultConfigPath)

    return true
  } catch (err) {
    log.warn('[Config] Failed to save config.json:', err)
    return false
  }
}

export interface ScanSettings {
  timeoutMs: number
  maxFileSize: number
  maxPdfSize: number
  skipOfficeInZip: boolean
  checkZipHeader: boolean
  checkFileSize: boolean
  skipRules: SkipRule[]
  includeHidden: boolean
  includeSystem: boolean
}

export interface SkipRule {
  name: string
  type: 'ext' | 'name' | 'path'
  pattern: string
  enabled: boolean
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  timeoutMs: 15000,
  maxFileSize: 100 * 1024 * 1024,
  maxPdfSize: 50 * 1024 * 1024,
  skipOfficeInZip: true,
  checkZipHeader: true,
  checkFileSize: true,
  skipRules: [],
  includeHidden: false,
  includeSystem: false
}

// ============ In-Memory State ============

interface ConfigStore {
  scan_settings: ScanSettings
  app_settings: Record<string, unknown>
}

let store: ConfigStore = {
  scan_settings: { ...DEFAULT_SCAN_SETTINGS },
  app_settings: {}
}

// ============ Paths ============

export function getConfigPath(): string {
  return join(getDataPath(), 'config.json')
}

function getConfigDir(): string {
  return getDataPath()
}

function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// ============ Persist ============

function saveStore(): void {
  try {
    ensureConfigDir()
    writeFileSync(getConfigPath(), JSON.stringify(store, null, 2), 'utf-8')
  } catch (err) {
    log.warn('[Config] Failed to save config.json:', err)
  }
}

// ============ Migration from config.db ============

function migrateFromDb(dbPath: string): void {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    try {
      const row = db.prepare('SELECT settings FROM scan_settings WHERE id = 1').get() as { settings: string } | undefined
      if (row) {
        store.scan_settings = { ...DEFAULT_SCAN_SETTINGS, ...JSON.parse(row.settings) }
      }
    } catch {}

    try {
      const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
      for (const row of rows) {
        try {
          store.app_settings[row.key] = JSON.parse(row.value)
        } catch {}
      }
    } catch {}

    db.close()
    saveStore()
    log.info('[Config] Migrated config.db → config.json')
  } catch (err) {
    log.warn('[Config] migrateFromDb failed:', err)
  }
}

// ============ Init ============

export function initConfig(): void {
  const defaultPath = getDefaultDataPath()
  const defaultConfigPath = join(defaultPath, 'config.json')

  // Step 1: Read from DEFAULT path to find custom data path
  let customDataPath: string | undefined
  if (existsSync(defaultConfigPath)) {
    try {
      const raw = readFileSync(defaultConfigPath, 'utf-8')
      const parsed = JSON.parse(raw)
      customDataPath = parsed.app_settings?.dataPath as string | undefined
      log.info('[Config] Found custom data path in default config:', customDataPath)
    } catch {}
  }

  // Step 2: Determine where to load config from
  let configDir: string
  let configPath: string

  if (customDataPath && existsSync(customDataPath)) {
    // Custom path is valid, use it
    configDir = customDataPath
    configPath = join(configDir, 'config.json')
  } else {
    // Use default path
    configDir = defaultPath
    configPath = defaultConfigPath
  }

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Step 3: Check for legacy config.db in configDir
  const dbPath = join(configDir, 'config.db')
  if (existsSync(dbPath)) {
    migrateFromDb(dbPath)
    try { unlinkSync(dbPath) } catch {}
    try { unlinkSync(dbPath + '-wal') } catch {}
    try { unlinkSync(dbPath + '-shm') } catch {}
    return
  }

  // Step 4: Load config.json from the determined configDir
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.scan_settings) {
        store.scan_settings = { ...DEFAULT_SCAN_SETTINGS, ...parsed.scan_settings }
      }
      if (parsed.app_settings) {
        store.app_settings = { ...parsed.app_settings }
      }
      log.info('[Config] Loaded from config.json at:', configPath)
    } catch (err) {
      log.warn('[Config] Failed to parse config.json, using defaults:', err)
    }
  } else {
    log.info('[Config] No config.json found at', configPath, ', saving defaults')
    saveStore()
  }
}

export function closeConfig(): void {
  // Nothing to close for JSON store
}

// ============ Scan Settings API ============

export function getScanSettings(): ScanSettings {
  return { ...store.scan_settings }
}

export function updateScanSettings(settings: Partial<ScanSettings>): void {
  store.scan_settings = { ...store.scan_settings, ...settings }
  saveStore()
}

// ============ App Settings ============

export interface AppSettings {
  themeId?: string
  language?: string
  hotkey?: string
  autoLaunch?: boolean
  windowBounds?: { x: number; y: number; width: number; height: number }
  minimizeToTray?: boolean
  realtimeMonitor?: {
    enabled: boolean
    dirs: string[]
  }
  [key: string]: unknown
}

export function getAppSetting<T = unknown>(key: string, defaultValue: T): T {
  if (Object.prototype.hasOwnProperty.call(store.app_settings, key)) {
    return store.app_settings[key] as T
  }
  if (key === 'realtimeMonitor') {
    return { enabled: false, dirs: [] } as unknown as T
  }
  if (key === 'doubleCtrlEnabled') {
    return true as unknown as T
  }
  return defaultValue
}

export function setAppSetting(key: string, value: unknown): void {
  store.app_settings[key] = value
  saveStore()
}

export function getAllAppSettings(): AppSettings {
  return { ...store.app_settings } as AppSettings
}
