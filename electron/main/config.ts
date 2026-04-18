/**
 * Config Database (db/config.db)
 *
 * Stores all app configuration and user data:
 * - scanned_folders: indexed directories
 * - search_history: recent searches
 * - saved_searches: bookmarked searches
 * - scan_settings: scanning preferences
 * - app_settings: theme, language, hotkey, window state, etc.
 *
 * Design: config + shards are stored under db/ directory.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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

  // Scanned folders table
  configDb.exec(`
    CREATE TABLE IF NOT EXISTS scanned_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      last_scan_at TEXT DEFAULT (datetime('now')),
      last_full_scan_at TEXT DEFAULT NULL,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      schedule_enabled INTEGER DEFAULT 0,
      schedule_day TEXT DEFAULT NULL,
      schedule_time TEXT DEFAULT NULL
    )
  `)
  // Migration: add last_full_scan_at if missing (for databases created before this column existed)
  try {
    configDb.exec(`ALTER TABLE scanned_folders ADD COLUMN last_full_scan_at TEXT DEFAULT NULL`)
  } catch {}

  // Search history table
  configDb.exec(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      searched_at TEXT DEFAULT (datetime('now'))
    )
  `)
  configDb.exec(`CREATE INDEX IF NOT EXISTS idx_history_query ON search_history(query)`)

  // Saved searches table
  configDb.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

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

  // Ensure default settings rows exist
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

// ============ Scanned Folders ============

export interface ScannedFolder {
  id?: number
  path: string
  name: string
  last_scan_at?: string
  last_full_scan_at?: string | null
  file_count?: number
  total_size?: number
  schedule_enabled?: number
  schedule_day?: string | null
  schedule_time?: string | null
}

export function addScannedFolder(folder: ScannedFolder): number {
  const stmt = getDb().prepare(`
    INSERT INTO scanned_folders (path, name, last_scan_at, file_count, total_size, schedule_enabled, schedule_day, schedule_time)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      last_scan_at = datetime('now'),
      file_count = excluded.file_count,
      total_size = excluded.total_size
  `)
  const result = stmt.run([
    folder.path, folder.name,
    folder.file_count ?? 0, folder.total_size ?? 0,
    folder.schedule_enabled ?? 0, folder.schedule_day ?? null, folder.schedule_time ?? null
  ])
  return result.lastInsertRowid as number
}

export function getScannedFolderByPath(folderPath: string): ScannedFolder | undefined {
  const stmt = getDb().prepare('SELECT * FROM scanned_folders WHERE path = ?')
  stmt.bind([folderPath])
  return stmt.get() as ScannedFolder | undefined
}

export function getScannedFolderById(id: number): ScannedFolder | undefined {
  const stmt = getDb().prepare('SELECT * FROM scanned_folders WHERE id = ?')
  stmt.bind([id])
  return stmt.get() as ScannedFolder | undefined
}

export function getAllScannedFolders(): ScannedFolder[] {
  const stmt = getDb().prepare('SELECT * FROM scanned_folders ORDER BY last_scan_at DESC')
  return stmt.all() as ScannedFolder[]
}

export function deleteScannedFolder(id: number): void {
  const stmt = getDb().prepare('DELETE FROM scanned_folders WHERE id = ?')
  stmt.run([id])
}

export function updateFolderScanComplete(id: number, fileCount: number, totalSize: number): void {
  const stmt = getDb().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([fileCount, totalSize, id])
}

export function updateFolderFullScanComplete(id: number, fileCount: number, totalSize: number): void {
  const stmt = getDb().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), last_full_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([fileCount, totalSize, id])
}

export function updateScannedFolder(id: number, updates: Partial<ScannedFolder>): void {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.last_scan_at !== undefined) { fields.push('last_scan_at = ?'); values.push(updates.last_scan_at) }
  if (updates.file_count !== undefined) { fields.push('file_count = ?'); values.push(updates.file_count) }
  if (updates.total_size !== undefined) { fields.push('total_size = ?'); values.push(updates.total_size) }
  if (updates.schedule_enabled !== undefined) { fields.push('schedule_enabled = ?'); values.push(updates.schedule_enabled) }
  if (updates.schedule_day !== undefined) { fields.push('schedule_day = ?'); values.push(updates.schedule_day) }
  if (updates.schedule_time !== undefined) { fields.push('schedule_time = ?'); values.push(updates.schedule_time) }

  if (fields.length > 0) {
    values.push(id)
    const stmt = getDb().prepare(`UPDATE scanned_folders SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(values)
  }
}

// ============ Search History ============

export interface SearchHistoryEntry {
  id?: number
  query: string
  searched_at?: string
}

export function addSearchHistory(query: string): void {
  if (!query.trim()) return
  const del = getDb().prepare('DELETE FROM search_history WHERE query = ?')
  del.run([query.trim()])
  const stmt = getDb().prepare('INSERT INTO search_history (query) VALUES (?)')
  stmt.run([query.trim()])
  getDb().exec(`
    DELETE FROM search_history WHERE id NOT IN (
      SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 50
    )
  `)
}

export function getSearchHistory(limit = 20): SearchHistoryEntry[] {
  const stmt = getDb().prepare('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?')
  stmt.bind([limit])
  return stmt.all() as SearchHistoryEntry[]
}

export function clearSearchHistory(): void {
  getDb().exec('DELETE FROM search_history')
}

// ============ Saved Searches ============

export interface SavedSearch {
  id?: number
  name: string
  query: string
  created_at?: string
}

export function addSavedSearch(name: string, query: string): number {
  const stmt = getDb().prepare('INSERT INTO saved_searches (name, query) VALUES (?, ?)')
  const result = stmt.run([name.trim(), query.trim()])
  return result.lastInsertRowid as number
}

export function getSavedSearches(): SavedSearch[] {
  const stmt = getDb().prepare('SELECT * FROM saved_searches ORDER BY created_at DESC')
  return stmt.all() as SavedSearch[]
}

export function deleteSavedSearch(id: number): void {
  const stmt = getDb().prepare('DELETE FROM saved_searches WHERE id = ?')
  stmt.run([id])
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
