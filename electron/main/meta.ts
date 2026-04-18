/**
 * Meta Database (db/meta.db)
 *
 * Stores folder lists, scan history, and saved searches.
 * This is a small SQLite database separate from the shard files.
 */

import { app } from 'electron'
import { join } from 'path'
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import log from 'electron-log/main'

let metaDb: BetterSqlite3Database | null = null

export function getMetaDbPath(): string {
  return join(app.getPath('userData'), 'db', 'meta.db')
}

export function initMetaDatabase(): void {
  const dbPath = getMetaDbPath()

  metaDb = new Database(dbPath)
  metaDb.pragma('journal_mode = WAL')

  // Scanned folders table
  metaDb.exec(`
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

  // Migration: add last_full_scan_at if missing
  try {
    metaDb.exec(`ALTER TABLE scanned_folders ADD COLUMN last_full_scan_at TEXT DEFAULT NULL`)
  } catch {}

  // Search history table
  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      searched_at TEXT DEFAULT (datetime('now'))
    )
  `)
  metaDb.exec(`CREATE INDEX IF NOT EXISTS idx_history_query ON search_history(query)`)

  // Saved searches table
  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Scan settings table
  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS scan_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings TEXT NOT NULL DEFAULT '{}'
    )
  `)

  // Ensure default settings row exists
  const row = metaDb.prepare('SELECT id FROM scan_settings WHERE id = 1').get()
  if (!row) {
    metaDb.prepare('INSERT INTO scan_settings (id, settings) VALUES (1, ?)').run(['{"timeoutMs":15000,"maxFileSize":104857600,"maxPdfSize":52428800,"skipOfficeInZip":true,"checkZipHeader":true,"checkFileSize":true,"skipRules":[]}'])
  }

  log.info(`[MetaDB] Initialized at ${dbPath}`)
}

export function closeMetaDatabase(): void {
  if (metaDb) {
    metaDb.close()
    metaDb = null
    log.info('[MetaDB] Closed')
  }
}

function getDb(): BetterSqlite3Database {
  if (!metaDb) throw new Error('Meta database not initialized')
  return metaDb
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
  skipRules: []
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
    log.warn('[MetaDB] Failed to save scan settings:', err)
  }
}
