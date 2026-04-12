import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'

let db: BetterSqlite3Database | null = null
let dbPath: string = ''

export function getDatabase(): BetterSqlite3Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'file-manager.db')
  log.info('Database path:', dbPath)

  // Always start fresh - delete existing database (no migration needed)
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
    log.info('Old database deleted, creating fresh database')
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Create files table
  db.exec(`
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

  // Create scanned_folders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scanned_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      last_scan_at TEXT DEFAULT (datetime('now')),
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      schedule_enabled INTEGER DEFAULT 0,
      schedule_day TEXT DEFAULT NULL,
      schedule_time TEXT DEFAULT NULL
    )
  `)

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_size ON files(size)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type)`)

  // Create FTS5 virtual table (full-text search index)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      name,
      content,
      file_type,
      content='files',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 1'
    )
  `)

  // Trigger: sync FTS on INSERT
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, name, content, file_type)
      VALUES (new.id, new.name, new.content, new.file_type);
    END
  `)

  // Trigger: sync FTS on DELETE
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, content, file_type)
      VALUES ('delete', old.id, old.name, old.content, old.file_type);
    END
  `)

  // Trigger: sync FTS on UPDATE
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, content, file_type)
      VALUES ('delete', old.id, old.name, old.content, old.file_type);
      INSERT INTO files_fts(rowid, name, content, file_type)
      VALUES (new.id, new.name, new.content, new.file_type);
    END
  `)

  // Rebuild FTS index to ensure existing data is indexed
  db.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')")

  log.info('Database tables created/verified')
}

// better-sqlite3 auto-persists changes, no manual save needed

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

// File operations
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
  const stmt = getDatabase().prepare(`
    INSERT INTO files (path, name, size, hash, file_type, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run([file.path, file.name, file.size, file.hash, file.file_type, file.content])
  
  return result.lastInsertRowid as number
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
    const stmt = getDatabase().prepare(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(values)
    
  }
}

export function deleteFile(id: number): void {
  const stmt = getDatabase().prepare('DELETE FROM files WHERE id = ?')
  stmt.run([id])
  
}

export function deleteFileByPath(filePath: string): void {
  const stmt = getDatabase().prepare('DELETE FROM files WHERE path = ?')
  stmt.run([filePath])
  
}

export function getFileByPath(filePath: string): FileRecord | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM files WHERE path = ?')
  stmt.bind([filePath])
  const row = stmt.getAsObject() as FileRecord | undefined
  
  return row
}

export function getAllFiles(): FileRecord[] {
  const stmt = getDatabase().prepare('SELECT * FROM files ORDER BY updated_at DESC')
  const rows = stmt.all() as FileRecord[]
  
  return rows
}

export function searchFiles(query: string): FileRecord[] {
  if (!query.trim()) {
    return []
  }

  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  if (keywords.length === 0) {
    return []
  }

  // Build FTS5 MATCH query (each keyword with AND, supports prefix search)
  const ftsQuery = keywords.map(k => `"${k.replace(/"/g, '""')}"*`).join(' AND ')

  const stmt = getDatabase().prepare(`
    SELECT f.*, bm25(files_fts) as rank
    FROM files_fts fts
    JOIN files f ON fts.rowid = f.id
    WHERE files_fts MATCH ?
    ORDER BY rank
    LIMIT 200
  `)

  stmt.bind([ftsQuery])
  const rows = stmt.all() as FileRecord[]

  return rows
}

export function getSearchSnippets(query: string, fileIds: number[]): Map<number, string> {
  if (!query.trim() || fileIds.length === 0) {
    return new Map()
  }

  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  const snippets = new Map<number, string>()

  const placeholders = fileIds.map(() => '?').join(', ')
  const stmt = getDatabase().prepare(`
    SELECT id, content FROM files WHERE id IN (${placeholders}) AND content IS NOT NULL
  `)
  stmt.bind(fileIds)

  const rows = stmt.all() as { id: number; content: string }[]
  

  for (const row of rows) {
    for (const keyword of keywords) {
      const idx = row.content.toLowerCase().indexOf(keyword.toLowerCase())
      if (idx !== -1) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(row.content.length, idx + keyword.length + 60)
        const snippet = (start > 0 ? '...' : '') +
          row.content.slice(start, end).replace(/</g, '&lt;').replace(/>/g, '&gt;') +
          (end < row.content.length ? '...' : '')
        const highlighted = snippet.replace(
          new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
          '<mark>$1</mark>'
        )
        snippets.set(row.id, highlighted)
        break
      }
    }
  }

  return snippets
}

export function findDuplicates(): FileRecord[][] {
  const stmt = getDatabase().prepare(`
    SELECT f.* FROM files f
    WHERE f.hash IS NOT NULL
    AND f.size > 0
    AND EXISTS (
      SELECT 1 FROM files f2
      WHERE f2.hash = f.hash
      AND f2.id != f.id
    )
    ORDER BY f.hash, f.size
  `)
  const rows = stmt.all() as FileRecord[]
  

  const grouped = new Map<string, FileRecord[]>()
  for (const file of rows) {
    if (file.hash) {
      const existing = grouped.get(file.hash) || []
      existing.push(file)
      grouped.set(file.hash, existing)
    }
  }

  return Array.from(grouped.values()).filter(group => group.length > 1)
}

export function getFilesBySizeGroup(): Map<number, FileRecord[]> {
  const stmt = getDatabase().prepare('SELECT * FROM files WHERE size > 0 ORDER BY size')
  const rows = stmt.all() as FileRecord[]
  

  const grouped = new Map<number, FileRecord[]>()
  for (const file of rows) {
    const existing = grouped.get(file.size) || []
    existing.push(file)
    grouped.set(file.size, existing)
  }

  return grouped
}

export function clearAllFiles(): void {
  getDatabase().exec('DELETE FROM files')
}

export function getFileCount(): number {
  const stmt = getDatabase().prepare('SELECT COUNT(*) as count FROM files')
  const row = stmt.getAsObject() as { count: number }
  
  return row.count || 0
}

// Scanned folders operations
export interface ScannedFolder {
  id?: number
  path: string
  name: string
  last_scan_at?: string
  file_count?: number
  total_size?: number
  schedule_enabled?: number
  schedule_day?: string | null
  schedule_time?: string | null
}

export function addScannedFolder(folder: ScannedFolder): number {
  const stmt = getDatabase().prepare(`
    INSERT INTO scanned_folders (path, name, last_scan_at, file_count, total_size, schedule_enabled, schedule_day, schedule_time)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      last_scan_at = datetime('now'),
      file_count = excluded.file_count,
      total_size = excluded.total_size
  `)
  const result = stmt.run([folder.path, folder.name, folder.file_count || 0, folder.total_size || 0, folder.schedule_enabled || 0, folder.schedule_day || null, folder.schedule_time || null])
  
  return result.lastInsertRowid as number
}

export function updateScannedFolder(id: number, updates: Partial<ScannedFolder>): void {
  const fields: string[] = []
  const values: any[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.last_scan_at !== undefined) { fields.push('last_scan_at = ?'); values.push(updates.last_scan_at) }
  if (updates.file_count !== undefined) { fields.push('file_count = ?'); values.push(updates.file_count) }
  if (updates.total_size !== undefined) { fields.push('total_size = ?'); values.push(updates.total_size) }
  if (updates.schedule_enabled !== undefined) { fields.push('schedule_enabled = ?'); values.push(updates.schedule_enabled) }
  if (updates.schedule_day !== undefined) { fields.push('schedule_day = ?'); values.push(updates.schedule_day) }
  if (updates.schedule_time !== undefined) { fields.push('schedule_time = ?'); values.push(updates.schedule_time) }

  if (fields.length > 0) {
    values.push(id)
    const stmt = getDatabase().prepare(`UPDATE scanned_folders SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(values)
    
  }
}

export function updateFolderScanComplete(id: number, fileCount: number, totalSize: number): void {
  const stmt = getDatabase().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([fileCount, totalSize, id])
  
}

export function getScannedFolderByPath(folderPath: string): ScannedFolder | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders WHERE path = ?')
  stmt.bind([folderPath])
  const row = stmt.getAsObject() as ScannedFolder | undefined
  
  return row
}

export function getScannedFolderById(id: number): ScannedFolder | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders WHERE id = ?')
  stmt.bind([id])
  const row = stmt.getAsObject() as ScannedFolder | undefined
  
  return row
}

export function getAllScannedFolders(): ScannedFolder[] {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders ORDER BY last_scan_at DESC')
  const rows = stmt.all() as ScannedFolder[]
  
  return rows
}

export function getScheduledFolders(): ScannedFolder[] {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders WHERE schedule_enabled = 1 ORDER BY last_scan_at ASC')
  const rows = stmt.all() as ScannedFolder[]
  
  return rows
}

export function deleteScannedFolder(id: number): void {
  const stmt = getDatabase().prepare('DELETE FROM scanned_folders WHERE id = ?')
  stmt.run([id])
  
}

export function removeFilesByFolderPath(folderPath: string): void {
  const stmt = getDatabase().prepare("DELETE FROM files WHERE path LIKE ?")
  stmt.run([folderPath + '%'])
  
}

export function getFileCountByFolder(folderPath: string): number {
  const stmt = getDatabase().prepare("SELECT COUNT(*) as count FROM files WHERE path LIKE ?")
  stmt.bind([folderPath + '%'])
  const row = stmt.getAsObject() as { count: number }
  
  return row.count || 0
}

export function getTotalSizeByFolder(folderPath: string): number {
  const stmt = getDatabase().prepare("SELECT SUM(size) as total FROM files WHERE path LIKE ?")
  stmt.bind([folderPath + '%'])
  const row = stmt.getAsObject() as { total: number | null }
  
  return row.total || 0
}
