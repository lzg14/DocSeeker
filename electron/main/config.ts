/**
 * Config Database (db/config.db)
 *
 * Stores ONLY app-level settings:
 * - scan_settings: scanning preferences (file size limits, skip rules, etc.)
 * - app_settings: theme, language, hotkey, window state, etc.
 *
 * Folder metadata and search history are stored in meta.db (see meta.ts).
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import log from 'electron-log/main'

let configDb: BetterSqlite3Database | null = null

export function getConfigDbPath(): string {
  return join(app.getPath('userData'), 'db', 'config.db')
}

function ensureDbDir(): void {
  const dir = join(app.getPath('userData'), 'db')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    log.info('[Config] Created db directory:', dir)
  }
}

export function initConfig(): void {
  ensureDbDir()
  const dbPath = getConfigDbPath()

  configDb = new Database(dbPath)
  configDb.pragma('journal_mode = WAL')

  // Scan settings table
  configDb.exec(`
    CREATE TABLE IF NOT EXISTS scan_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings TEXT NOT NULL DEFAULT '{}'
    )
  `)

  // App settings table (theme, language, hotkey, window, etc.)
  configDb.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Ensure default scan settings row exists
  const row = configDb.prepare('SELECT id FROM scan_settings WHERE id = 1').get()
  if (!row) {
    configDb.prepare('INSERT INTO scan_settings (id, settings) VALUES (1, ?)').run(['{"timeoutMs":15000,"maxFileSize":104857600,"maxPdfSize":52428800,"skipOfficeInZip":true,"checkZipHeader":true,"checkFileSize":true,"skipRules":[],"includeHidden":false,"includeSystem":false}'])
  }

  log.info(`[Config] Initialized at ${dbPath}`)
}

export function closeConfig(): void {
  if (configDb) {
    configDb.close()
    configDb = null
    log.info('[Config] Closed')
  }
}

function getDb(): BetterSqlite3Database {
  if (!configDb) throw new Error('Config database not initialized')
  return configDb
}

// ============ Scan Settings ============

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

let currentScanSettings: ScanSettings = { ...DEFAULT_SCAN_SETTINGS }

export function getScanSettings(): ScanSettings {
  try {
    const row = getDb().prepare('SELECT settings FROM scan_settings WHERE id = 1').get() as { settings: string } | undefined
    if (row) {
      const parsed = JSON.parse(row.settings)
      currentScanSettings = { ...DEFAULT_SCAN_SETTINGS, ...parsed }
    }
  } catch {}
  return { ...currentScanSettings }
}

export function updateScanSettings(settings: Partial<ScanSettings>): void {
  currentScanSettings = { ...currentScanSettings, ...settings }
  try {
    const stmt = getDb().prepare('UPDATE scan_settings SET settings = ? WHERE id = 1')
    stmt.run([JSON.stringify(currentScanSettings)])
  } catch (err) {
    log.warn('[Config] Failed to save scan settings:', err)
  }
}

// ============ App Settings (theme, language, hotkey, etc.) ============

export interface AppSettings {
  themeId?: string
  language?: string
  hotkey?: string
  autoLaunch?: boolean
  windowBounds?: { x: number; y: number; width: number; height: number }
  minimizeToTray?: boolean
  [key: string]: unknown
}

export function getAppSetting<T = unknown>(key: string, defaultValue: T): T {
  try {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get() as { value: string } | undefined
    if (row) {
      return JSON.parse(row.value) as T
    }
  } catch {}
  return defaultValue
}

export function setAppSetting(key: string, value: unknown): void {
  try {
    const stmt = getDb().prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `)
    stmt.run([key, JSON.stringify(value)])
  } catch (err) {
    log.warn('[Config] Failed to save app setting:', err)
  }
}

export function getAllAppSettings(): AppSettings {
  try {
    const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
    const settings: AppSettings = {}
    for (const row of rows) {
      try {
        (settings as Record<string, unknown>)[row.key] = JSON.parse(row.value)
      } catch {}
    }
    return settings
  } catch {}
  return {}
}
