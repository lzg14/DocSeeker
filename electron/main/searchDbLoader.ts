/**
 * Worker thread: loads the search database (file-manager.db, ~2GB)
 * in the background without blocking the main thread.
 * Post a 'ready' message when done, or 'error' on failure.
 */
import { parentPort } from 'worker_threads'
import Database from 'better-sqlite3'
import path from 'path'
import log from 'electron-log/main'

log.initialize()

// Use env var to avoid needing electron app instance in worker
const appDataPath = process.env.APPDATA || process.env.HOME || ''
const searchDbPath = path.join(appDataPath, 'docseeker', 'file-manager.db')

log.info('[searchDbLoader] Starting, path:', searchDbPath)

try {
  const t0 = Date.now()
  const searchDb = new Database(searchDbPath)
  searchDb.pragma('journal_mode = WAL')
  log.info(`[searchDbLoader] DB opened: ${Date.now() - t0}ms`)

  // Create tables
  searchDb.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      size INTEGER,
      hash TEXT,
      file_type TEXT,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  searchDb.exec(`
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
  searchDb.exec(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`)
  searchDb.exec(`CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash)`)
  searchDb.exec(`CREATE INDEX IF NOT EXISTS idx_files_size ON files(size)`)
  searchDb.exec(`CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type)`)

  // FTS setup
  const tableCount = (searchDb.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count
  let ftsCount = 0
  try {
    ftsCount = (searchDb.prepare('SELECT COUNT(*) as count FROM files_fts').get() as { count: number }).count
  } catch {}

  const tFts = Date.now()
  try {
    searchDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        name, content, file_type,
        content='files', content_rowid='id',
        tokenize='unicode61 remove_diacritics 1'
      )
    `)
  } catch {}
  log.info(`[searchDbLoader] FTS table ready: ${Date.now() - tFts}ms`)

  if (tableCount > 0 && ftsCount === 0) {
    const tRebuild = Date.now()
    searchDb.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')")
    log.info(`[searchDbLoader] FTS rebuild done: ${Date.now() - tRebuild}ms`)
  }

  // Triggers
  searchDb.exec(`CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN INSERT INTO files_fts(rowid, name, content, file_type) VALUES (new.id, new.name, new.content, new.file_type); END`)
  searchDb.exec(`CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN INSERT INTO files_fts(files_fts, rowid, name, content, file_type) VALUES ('delete', old.id, old.name, old.content, old.file_type); END`)
  searchDb.exec(`CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN INSERT INTO files_fts(files_fts, rowid, name, content, file_type) VALUES ('delete', old.id, old.name, old.content, old.file_type); INSERT INTO files_fts(rowid, name, content, file_type) VALUES (new.id, new.name, new.content, new.file_type); END`)
  searchDb.exec(`CREATE TABLE IF NOT EXISTS search_history (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, searched_at TEXT DEFAULT (datetime('now')))`)
  searchDb.exec(`CREATE INDEX IF NOT EXISTS idx_history_query ON search_history(query)`)
  searchDb.exec(`CREATE TABLE IF NOT EXISTS saved_searches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, query TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`)

  log.info(`[searchDbLoader] Total init: ${Date.now() - t0}ms`)
  parentPort?.postMessage({ type: 'ready' })
} catch (err) {
  log.error('[searchDbLoader] Failed:', err)
  parentPort?.postMessage({ type: 'error', error: String(err) })
}
