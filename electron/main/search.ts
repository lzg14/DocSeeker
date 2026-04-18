/**
 * Search database — full-text search and file records.
 * Initialized lazily on first search via a background worker.
 * All search operations wait for the DB to be ready.
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { Worker } from 'worker_threads'
import { join } from 'path'
import log from 'electron-log/main'

let searchDb: Database.Database | null = null
let searchDbPath: string = ''
let _readyPromise: Promise<void> | null = null
let _onReadyCallbacks: Array<() => void> = []

export function isSearchDbReady(): boolean {
  return searchDb !== null
}

function getDbPath(): string {
  return join(app.getPath('userData'), 'file-manager.db')
}

/**
 * Start loading search DB in background (via worker thread).
 * Does NOT block the main thread.
 * Resolves when DB is fully loaded and ready for queries.
 */
export function initSearchDatabaseAsync(): Promise<void> {
  if (_readyPromise) return _readyPromise
  if (searchDb) return Promise.resolve()

  searchDbPath = getDbPath()
  log.info('Starting background search DB load:', searchDbPath)

  _readyPromise = new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'searchDbLoader.js')
    log.info('[search] Spawning searchDbLoader worker')
    const worker = new Worker(workerPath)

    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        log.info('[search] Worker signaled ready, opening main process connection')
        // Worker has initialized the DB file. Now open our own connection.
        try {
          searchDb = new Database(searchDbPath)
          searchDb.pragma('journal_mode = WAL')
          log.info('[search] Main process DB connection ready')
          // Notify all waiters and warmup callbacks
          for (const cb of _onReadyCallbacks) {
            try { cb() } catch (e) { log.error('[search] onReady callback error:', e) }
          }
          _onReadyCallbacks = []
          resolve()
        } catch (err) {
          log.error('[search] Failed to open main process connection:', err)
          reject(err)
        }
      } else if (msg.type === 'error') {
        log.error('[search] Worker error:', msg.error)
        _readyPromise = null
        reject(new Error(msg.error))
      }
    })

    worker.on('error', (err) => {
      log.error('[search] Worker error:', err)
      _readyPromise = null
      reject(err)
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        log.error('[search] Worker exited with code:', code)
        _readyPromise = null
      }
    })
  })

  return _readyPromise
}

/**
 * Wait for search DB to be ready.
 * If already ready, returns immediately. Otherwise blocks until ready.
 */
export async function waitForSearchDb(): Promise<void> {
  if (searchDb) return
  await initSearchDatabaseAsync()
}

/** Register a callback to run when search DB becomes ready. */
export function onSearchDbReady(cb: () => void): void {
  if (searchDb) {
    cb()
  } else {
    _onReadyCallbacks.push(cb)
  }
}

export function getSearchDatabase(): Database.Database {
  if (!searchDb) {
    throw new Error('Search database not initialized — call waitForSearchDb() first')
  }
  return searchDb
}

// ─── File operations ────────────────────────────────────────────────────────

export interface FileRecord {
  id?: number
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  created_at?: string
  updated_at?: string
}

export function insertFile(file: FileRecord): number {
  return getSearchDatabase().prepare(
    `INSERT INTO files (path, name, size, hash, file_type, content) VALUES (?, ?, ?, ?, ?, ?)`
  ).run([file.path, file.name, file.size, file.hash, file.file_type, file.content]).lastInsertRowid as number
}

export function updateFile(id: number, file: Partial<FileRecord>): void {
  const fields: string[] = []
  const values: any[] = []
  if (file.path !== undefined) { fields.push('path = ?'); values.push(file.path) }
  if (file.name !== undefined) { fields.push('name = ?'); values.push(file.name) }
  if (file.size !== undefined) { fields.push('size = ?'); values.push(file.size) }
  if (file.hash !== undefined) { fields.push('hash = ?'); values.push(file.hash) }
  if (file.file_type !== undefined) { fields.push('file_type = ?'); values.push(file.file_type) }
  if (file.content !== undefined) { fields.push('content = ?'); values.push(file.content) }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    values.push(id)
    getSearchDatabase().prepare(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`).run(values)
  }
}

export function deleteFileByPath(filePath: string): void {
  getSearchDatabase().prepare('DELETE FROM files WHERE path = ?').run(filePath)
}

export function getFileByPath(filePath: string): FileRecord | undefined {
  return getSearchDatabase().prepare('SELECT * FROM files WHERE path = ?').get(filePath) as FileRecord | undefined
}

export function removeFilesByFolderPath(folderPath: string): void {
  const escaped = folderPath.replace(/[%_]/g, '\\$&')
  getSearchDatabase().prepare("DELETE FROM files WHERE path LIKE ?").run(escaped + '%')
}

export function getFileCountByFolder(folderPath: string): number {
  const escaped = folderPath.replace(/[%_]/g, '\\$&')
  const row = getSearchDatabase().prepare("SELECT COUNT(*) as count FROM files WHERE path LIKE ?").get(escaped + '%') as { count: number }
  return row?.count ?? 0
}

export function getTotalSizeByFolder(folderPath: string): number {
  const escaped = folderPath.replace(/[%_]/g, '\\$&')
  const row = getSearchDatabase().prepare("SELECT SUM(size) as total FROM files WHERE path LIKE ?").get(escaped + '%') as { total: number | null }
  return row?.total ?? 0
}

// ─── Search operations ─────────────────────────────────────────────────────

export interface SearchOptions {
  fileTypes?: string[]
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
}

function parseFtsQuery(query: string): string {
  const hasExplicitOr = /(^|\s)OR(\s|$)/i.test(query)
  const hasExplicitNot = /(^|\s)NOT(\s|$)/i.test(query)
  if (!hasExplicitOr && !hasExplicitNot) {
    return query.trim().split(/\s+/).filter(w => w.length > 0).map(w => {
      if (w.startsWith('"') && w.endsWith('"')) return w
      if (w.endsWith('*')) return `"${w.slice(0, -1).replace(/"/g, '""')}"`
      return `"${w.replace(/"/g, '""')}"`
    }).join(' AND ')
  }
  let result = query.trim()
  result = result.replace(/"([^"]+)"/g, (_, phrase) => `"${phrase.replace(/"/g, '""')}"`)
  result = result.replace(/(?<![*:a-zA-Z0-9_])([a-zA-Z0-9_\u4e00-\u9fff]+)(?![*:])(?=\s|$|[)])/g, (match) => {
    const upper = match.toUpperCase()
    if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'NEAR') return match
    return `"${match}"*`
  })
  return result.replace(/\bNOT\b/gi, '-')
}

export function searchFiles(query: string): FileRecord[] {
  if (!query.trim()) return []
  const ftsQuery = query.trim().split(/\s+/).filter(k => k.length > 0)
    .map(k => `"${k.replace(/"/g, '""')}"*`).join(' AND ')
  const stmt = getSearchDatabase().prepare(`
    SELECT f.*, bm25(files_fts) as rank
    FROM files_fts fts JOIN files f ON fts.rowid = f.id
    WHERE files_fts MATCH ?
    ORDER BY rank
  `)
  stmt.bind([ftsQuery])
  return stmt.all() as FileRecord[]
}

export function searchFilesAdvanced(query: string, options?: SearchOptions): FileRecord[] {
  if (!query.trim()) return []
  const ftsQuery = parseFtsQuery(query)
  const whereClauses: string[] = ['files_fts MATCH ?']
  const params: any[] = [ftsQuery]
  if (options?.fileTypes?.length) {
    whereClauses.push(`f.file_type IN (${options.fileTypes.map(() => '?').join(',')})`)
    params.push(...options.fileTypes)
  }
  if (options?.sizeMin) { whereClauses.push('f.size >= ?'); params.push(options.sizeMin) }
  if (options?.sizeMax) { whereClauses.push('f.size <= ?'); params.push(options.sizeMax) }
  if (options?.dateFrom) { whereClauses.push('f.updated_at >= ?'); params.push(options.dateFrom) }
  if (options?.dateTo) { whereClauses.push('f.updated_at <= ?'); params.push(options.dateTo) }
  const stmt = getSearchDatabase().prepare(`
    SELECT f.*, bm25(files_fts) as rank
    FROM files_fts fts JOIN files f ON fts.rowid = f.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY rank
  `)
  stmt.bind(params)
  return stmt.all() as FileRecord[]
}

export function getSearchSnippets(query: string, fileIds: number[]): Map<number, string> {
  if (!query.trim() || !fileIds.length) return new Map()
  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  const snippets = new Map<number, string>()
  const stmt = getSearchDatabase().prepare(
    `SELECT id, content FROM files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND content IS NOT NULL`
  )
  stmt.bind(fileIds)
  for (const row of stmt.all() as { id: number; content: string }[]) {
    for (const kw of keywords) {
      const idx = row.content.toLowerCase().indexOf(kw.toLowerCase())
      if (idx !== -1) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(row.content.length, idx + kw.length + 60)
        const snippet = (start > 0 ? '...' : '') + row.content.slice(start, end).replace(/</g, '&lt;').replace(/>/g, '&gt;') + (end < row.content.length ? '...' : '')
        const highlighted = snippet.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
        snippets.set(row.id, highlighted)
        break
      }
    }
  }
  return snippets
}

export function getFileCount(): number {
  if (!searchDb) return 0
  const row = getSearchDatabase().prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }
  return row?.count ?? 0
}

// ─── Search history ────────────────────────────────────────────────────────

export interface SearchHistoryEntry { id?: number; query: string; searched_at?: string }
export interface SavedSearch { id?: number; name: string; query: string; created_at?: string }

export function addSearchHistory(query: string): void {
  if (!query.trim()) return
  const db = getSearchDatabase()
  db.prepare('DELETE FROM search_history WHERE query = ?').run(query.trim())
  db.prepare('INSERT INTO search_history (query) VALUES (?)').run(query.trim())
  db.exec(`DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 50)`)
}

export function getSearchHistory(limit = 20): SearchHistoryEntry[] {
  return getSearchDatabase().prepare('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?').all(limit) as SearchHistoryEntry[]
}

export function clearSearchHistory(): void {
  getSearchDatabase().exec('DELETE FROM search_history')
}

export function addSavedSearch(name: string, query: string): number {
  return getSearchDatabase().prepare('INSERT INTO saved_searches (name, query) VALUES (?, ?)').run([name.trim(), query.trim()]).lastInsertRowid as number
}

export function getSavedSearches(): SavedSearch[] {
  return getSearchDatabase().prepare('SELECT * FROM saved_searches ORDER BY created_at DESC').all() as SavedSearch[]
}

export function deleteSavedSearch(id: number): void {
  getSearchDatabase().prepare('DELETE FROM saved_searches WHERE id = ?').run(id)
}

// ─── Scanned folders ──────────────────────────────────────────────────────

export interface ScannedFolder {
  id?: number; path: string; name: string
  last_scan_at?: string; last_full_scan_at?: string | null
  file_count?: number; total_size?: number
  schedule_enabled?: number; schedule_day?: string | null; schedule_time?: string | null
}

export function addScannedFolder(folder: ScannedFolder): number {
  return getSearchDatabase().prepare(`
    INSERT INTO scanned_folders (path, name, last_scan_at, file_count, total_size, schedule_enabled, schedule_day, schedule_time)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET last_scan_at = datetime('now'), file_count = excluded.file_count, total_size = excluded.total_size
  `).run([folder.path, folder.name, folder.file_count ?? 0, folder.total_size ?? 0,
    folder.schedule_enabled ?? 0, folder.schedule_day ?? null, folder.schedule_time ?? null]).lastInsertRowid as number
}

export function getScannedFolderByPath(folderPath: string): ScannedFolder | undefined {
  return getSearchDatabase().prepare('SELECT * FROM scanned_folders WHERE path = ?').get(folderPath) as ScannedFolder | undefined
}

export function getScannedFolderById(id: number): ScannedFolder | undefined {
  return getSearchDatabase().prepare('SELECT * FROM scanned_folders WHERE id = ?').get(id) as ScannedFolder | undefined
}

export function updateFolderScanComplete(id: number, fileCount: number, totalSize: number): void {
  getSearchDatabase().prepare(`UPDATE scanned_folders SET last_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?`).run(fileCount, totalSize, id)
}

export function updateFolderFullScanComplete(id: number, fileCount: number, totalSize: number): void {
  getSearchDatabase().prepare(`UPDATE scanned_folders SET last_scan_at = datetime('now'), last_full_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?`).run(fileCount, totalSize, id)
}

export function deleteScannedFolder(id: number): void {
  getSearchDatabase().prepare('DELETE FROM scanned_folders WHERE id = ?').run(id)
}

export function closeSearchDatabase(): void {
  if (searchDb) {
    searchDb.close()
    searchDb = null
    _readyPromise = null
    log.info('Search DB closed')
  }
}
