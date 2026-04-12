import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'file-manager.db')
  log.info('Database path:', dbPath)

  const SQL = await initSqlJs()

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // Create files table
  db.run(`
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
  db.run(`
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_size ON files(size)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type)`)

  saveDatabase()
  log.info('Database tables created/verified')
}

export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
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
  stmt.run([file.path, file.name, file.size, file.hash, file.file_type, file.content])
  stmt.free()

  const result = getDatabase().exec('SELECT last_insert_rowid() as id')
  saveDatabase()
  return result[0]?.values[0]?.[0] as number || 0
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
    stmt.free()
    saveDatabase()
  }
}

export function deleteFile(id: number): void {
  const stmt = getDatabase().prepare('DELETE FROM files WHERE id = ?')
  stmt.run([id])
  stmt.free()
  saveDatabase()
}

export function deleteFileByPath(filePath: string): void {
  const stmt = getDatabase().prepare('DELETE FROM files WHERE path = ?')
  stmt.run([filePath])
  stmt.free()
  saveDatabase()
}

export function getFileByPath(filePath: string): FileRecord | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM files WHERE path = ?')
  stmt.bind([filePath])

  if (stmt.step()) {
    const row = stmt.getAsObject() as FileRecord
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

export function getAllFiles(): FileRecord[] {
  const results = getDatabase().exec('SELECT * FROM files ORDER BY updated_at DESC')
  if (results.length === 0) return []

  const columns = results[0].columns
  return results[0].values.map(row => {
    const file: any = {}
    columns.forEach((col, i) => {
      file[col] = row[i]
    })
    return file as FileRecord
  })
}

export function searchFiles(query: string): FileRecord[] {
  if (!query.trim()) {
    return []
  }

  // Split by whitespace and filter empty strings
  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)

  if (keywords.length === 0) {
    return []
  }

  // Build dynamic SQL with AND conditions for each keyword
  let whereClause = ''
  const params: string[] = []

  for (const keyword of keywords) {
    const pattern = `%${keyword}%`
    if (whereClause) {
      whereClause += ' AND '
    }
    whereClause += '(name LIKE ? OR content LIKE ? OR file_type LIKE ?)'
    params.push(pattern, pattern, pattern)
  }

  const stmt = getDatabase().prepare(`
    SELECT * FROM files
    WHERE ${whereClause}
    ORDER BY updated_at DESC
    LIMIT 200
  `)
  stmt.bind(params)

  const files: FileRecord[] = []
  while (stmt.step()) {
    files.push(stmt.getAsObject() as FileRecord)
  }
  stmt.free()
  return files
}

export function findDuplicates(): FileRecord[][] {
  const results = getDatabase().exec(`
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

  if (results.length === 0) return []

  const columns = results[0].columns
  const allFiles = results[0].values.map(row => {
    const file: any = {}
    columns.forEach((col, i) => {
      file[col] = row[i]
    })
    return file as FileRecord
  })

  const grouped = new Map<string, FileRecord[]>()
  for (const file of allFiles) {
    if (file.hash) {
      const existing = grouped.get(file.hash) || []
      existing.push(file)
      grouped.set(file.hash, existing)
    }
  }

  return Array.from(grouped.values()).filter(group => group.length > 1)
}

export function getFilesBySizeGroup(): Map<number, FileRecord[]> {
  const results = getDatabase().exec(`
    SELECT * FROM files
    WHERE size > 0
    ORDER BY size
  `)

  const grouped = new Map<number, FileRecord[]>()

  if (results.length > 0) {
    const columns = results[0].columns
    const allFiles = results[0].values.map(row => {
      const file: any = {}
      columns.forEach((col, i) => {
        file[col] = row[i]
      })
      return file as FileRecord
    })

    for (const file of allFiles) {
      const existing = grouped.get(file.size) || []
      existing.push(file)
      grouped.set(file.size, existing)
    }
  }

  return grouped
}

export function clearAllFiles(): void {
  getDatabase().run('DELETE FROM files')
  saveDatabase()
}

export function getFileCount(): number {
  const result = getDatabase().exec('SELECT COUNT(*) as count FROM files')
  return result[0]?.values[0]?.[0] as number || 0
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
  stmt.run([folder.path, folder.name, folder.file_count || 0, folder.total_size || 0, folder.schedule_enabled || 0, folder.schedule_day || null, folder.schedule_time || null])
  stmt.free()

  const result = getDatabase().exec('SELECT last_insert_rowid() as id')
  saveDatabase()
  return result[0]?.values[0]?.[0] as number || 0
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
    stmt.free()
    saveDatabase()
  }
}

export function updateFolderScanComplete(id: number, fileCount: number, totalSize: number): void {
  const stmt = getDatabase().prepare(`
    UPDATE scanned_folders SET last_scan_at = datetime('now'), file_count = ?, total_size = ? WHERE id = ?
  `)
  stmt.run([fileCount, totalSize, id])
  stmt.free()
  saveDatabase()
}

export function getScannedFolderByPath(folderPath: string): ScannedFolder | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders WHERE path = ?')
  stmt.bind([folderPath])

  if (stmt.step()) {
    const row = stmt.getAsObject() as ScannedFolder
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

export function getScannedFolderById(id: number): ScannedFolder | undefined {
  const stmt = getDatabase().prepare('SELECT * FROM scanned_folders WHERE id = ?')
  stmt.bind([id])

  if (stmt.step()) {
    const row = stmt.getAsObject() as ScannedFolder
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

export function getAllScannedFolders(): ScannedFolder[] {
  const results = getDatabase().exec('SELECT * FROM scanned_folders ORDER BY last_scan_at DESC')
  if (results.length === 0) return []

  const columns = results[0].columns
  return results[0].values.map(row => {
    const folder: any = {}
    columns.forEach((col, i) => {
      folder[col] = row[i]
    })
    return folder as ScannedFolder
  })
}

export function getScheduledFolders(): ScannedFolder[] {
  const results = getDatabase().exec('SELECT * FROM scanned_folders WHERE schedule_enabled = 1 ORDER BY last_scan_at ASC')
  if (results.length === 0) return []

  const columns = results[0].columns
  return results[0].values.map(row => {
    const folder: any = {}
    columns.forEach((col, i) => {
      folder[col] = row[i]
    })
    return folder as ScannedFolder
  })
}

export function deleteScannedFolder(id: number): void {
  const stmt = getDatabase().prepare('DELETE FROM scanned_folders WHERE id = ?')
  stmt.run([id])
  stmt.free()
  saveDatabase()
}

export function removeFilesByFolderPath(folderPath: string): void {
  const stmt = getDatabase().prepare("DELETE FROM files WHERE path LIKE ?")
  stmt.run([folderPath + '%'])
  stmt.free()
  saveDatabase()
}

export function getFileCountByFolder(folderPath: string): number {
  const stmt = getDatabase().prepare("SELECT COUNT(*) as count FROM files WHERE path LIKE ?")
  stmt.bind([folderPath + '%'])
  let count = 0
  if (stmt.step()) {
    count = stmt.getAsObject().count as number || 0
  }
  stmt.free()
  return count
}

export function getTotalSizeByFolder(folderPath: string): number {
  const stmt = getDatabase().prepare("SELECT SUM(size) as total FROM files WHERE path LIKE ?")
  stmt.bind([folderPath + '%'])
  let total = 0
  if (stmt.step()) {
    total = stmt.getAsObject().total as number || 0
  }
  stmt.free()
  return total
}
