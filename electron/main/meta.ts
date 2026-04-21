/**
 * Meta Database (db/meta.db)
 *
 * Stores folder metadata and search user data:
 * - scanned_folders: indexed directories with file counts/sizes
 * - search_history: recent searches
 * - saved_searches: bookmarked searches
 *
 * Design: meta.db is the single source of truth for folder metadata.
 *         Shards store file content; meta.db stores folder stats.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import log from 'electron-log/main'

let metaDb: BetterSqlite3Database | null = null

export function getMetaDbPath(): string {
  return join(app.getPath('userData'), 'db', 'meta.db')
}

function ensureDbDir(): void {
  const dir = join(app.getPath('userData'), 'db')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    log.info('[Meta] Created db directory:', dir)
  }
}

export function initMeta(): void {
  ensureDbDir()
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

  // Tags table
  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#2563eb',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // File tags (many-to-many)
  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS file_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(file_path, tag_id)
    )
  `)
  metaDb.exec(`CREATE INDEX IF NOT EXISTS idx_file_tags_path ON file_tags(file_path)`)
  metaDb.exec(`CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id)`)

  log.info(`[Meta] Initialized at ${dbPath}`)
}

export function closeMeta(): void {
  if (metaDb) {
    metaDb.close()
    metaDb = null
    log.info('[Meta] Closed')
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

/**
 * Sync folder stats from shards into meta.db after an incremental scan completes.
 * Queries shards directly to get the authoritative count/size for this folder.
 */
export function syncFolderStatsFromShards(id: number, folderPath: string, stats: { fileCount: number; totalSize: number }): void {
  const stmt = getDb().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([stats.fileCount, stats.totalSize, id])
  log.info(`[Meta] Synced (incremental) ${folderPath}: ${stats.fileCount} files`)
}

/**
 * Sync folder stats from shards into meta.db after a full scan completes.
 */
export function syncFolderStatsFromShardsFull(id: number, folderPath: string, stats: { fileCount: number; totalSize: number }): void {
  const stmt = getDb().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), last_full_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([stats.fileCount, stats.totalSize, id])
  log.info(`[Meta] Synced (full) ${folderPath}: ${stats.fileCount} files`)
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

// ============ Tags ============

export interface Tag {
  id?: number
  name: string
  color: string
  created_at?: string
}

export function addTag(name: string, color = '#2563eb'): number {
  const stmt = getDb().prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
  try {
    const result = stmt.run([name.trim(), color])
    return result.lastInsertRowid as number
  } catch (err) {
    // Tag already exists, return existing id
    const existing = getDb().prepare('SELECT id FROM tags WHERE name = ?').get([name.trim()]) as { id: number } | undefined
    return existing?.id ?? -1
  }
}

export function getAllTags(): Tag[] {
  const stmt = getDb().prepare('SELECT * FROM tags ORDER BY name ASC')
  return stmt.all() as Tag[]
}

export function updateTag(id: number, updates: { name?: string; color?: string }): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()) }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
  if (fields.length > 0) {
    values.push(id)
    const stmt = getDb().prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(values)
  }
}

export function deleteTag(id: number): void {
  getDb().exec('DELETE FROM file_tags WHERE tag_id = ?')
  const stmt = getDb().prepare('DELETE FROM tags WHERE id = ?')
  stmt.run([id])
}

export function addFileTag(filePath: string, tagId: number): void {
  const stmt = getDb().prepare('INSERT OR IGNORE INTO file_tags (file_path, tag_id) VALUES (?, ?)')
  stmt.run([filePath, tagId])
}

export function removeFileTag(filePath: string, tagId: number): void {
  const stmt = getDb().prepare('DELETE FROM file_tags WHERE file_path = ? AND tag_id = ?')
  stmt.run([filePath, tagId])
}

export function getTagsForFile(filePath: string): Tag[] {
  const stmt = getDb().prepare(`
    SELECT t.* FROM tags t
    INNER JOIN file_tags ft ON t.id = ft.tag_id
    WHERE ft.file_path = ?
    ORDER BY t.name
  `)
  stmt.bind([filePath])
  return stmt.all() as Tag[]
}

export function getFilesWithTag(tagId: number): string[] {
  const stmt = getDb().prepare('SELECT file_path FROM file_tags WHERE tag_id = ?')
  stmt.bind([tagId])
  const rows = stmt.all() as { file_path: string }[]
  return rows.map(r => r.file_path)
}

export function getAllFileTags(): Record<string, Tag[]> {
  const stmt = getDb().prepare(`
    SELECT ft.file_path, t.* FROM file_tags ft
    INNER JOIN tags t ON t.id = ft.tag_id
    ORDER BY ft.file_path, t.name
  `)
  const rows = stmt.all() as { file_path: string; id: number; name: string; color: string }[]
  const result: Record<string, Tag[]> = {}
  for (const row of rows) {
    if (!result[row.file_path]) {
      result[row.file_path] = []
    }
    result[row.file_path].push({ id: row.id, name: row.name, color: row.color })
  }
  return result
}
