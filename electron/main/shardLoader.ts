/**
 * Shard Loader Worker
 *
 * Worker thread that loads a single shard.db file and initializes its FTS5 table.
 * Each shard is an independent SQLite database with:
 *   - shard_files: main file records
 *   - shard_files_fts: FTS5 virtual table for full-text search
 */

import { parentPort, workerData } from 'worker_threads'
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'

interface ShardFileRecord {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  is_supported: number
}

interface InsertBatchMessage {
  type: 'insert-batch'
  shardId: number
  files: ShardFileRecord[]
}

interface CloseMessage {
  type: 'close'
  shardId: number
}

interface UpdateContentMessage {
  type: 'update-content'
  shardId: number
  path: string
  content: string
}

interface DeleteFileMessage {
  type: 'delete-file'
  shardId: number
  path: string
}

interface DeleteFolderMessage {
  type: 'delete-folder'
  shardId: number
  folderPath: string
}

interface RenameFileMessage {
  type: 'rename-file'
  shardId: number
  oldPath: string
  newPath: string
}

interface RenameFolderMessage {
  type: 'rename-folder'
  shardId: number
  oldFolderPath: string
  newFolderPath: string
}

interface CleanupOrphanedMessage {
  type: 'cleanup-orphaned'
  shardId: number
  validPrefixes: string[]  // 扫描目录前缀列表
}

type WorkerMessage = InsertBatchMessage | CloseMessage | UpdateContentMessage | DeleteFileMessage | DeleteFolderMessage | RenameFileMessage | RenameFolderMessage | CleanupOrphanedMessage

interface WorkerResult {
  type: 'ready' | 'loaded' | 'batch-complete' | 'closed' | 'error' | 'update-complete' | 'delete-complete' | 'rename-complete' | 'cleanup-complete'
  shardId: number
  fileCount?: number
  changes?: number
  error?: string
  loadTime?: number
}

// Shard table schemas
const CREATE_SHARD_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS shard_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  size INTEGER,
  hash TEXT,
  file_type TEXT,
  content TEXT,
  is_supported INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
`

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_shard_files_path ON shard_files(path);
CREATE INDEX IF NOT EXISTS idx_shard_files_hash ON shard_files(hash);
CREATE INDEX IF NOT EXISTS idx_shard_files_size ON shard_files(size);
CREATE INDEX IF NOT EXISTS idx_shard_files_file_type ON shard_files(file_type);
`

const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS shard_files_fts USING fts5(
  name,
  content,
  file_type,
  content='shard_files',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 1'
)
`

const CREATE_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS shard_files_ai AFTER INSERT ON shard_files BEGIN
  INSERT INTO shard_files_fts(rowid, name, content, file_type)
  VALUES (new.id, new.name, new.content, new.file_type);
END;

CREATE TRIGGER IF NOT EXISTS shard_files_ad AFTER DELETE ON shard_files BEGIN
  INSERT INTO shard_files_fts(shard_files_fts, rowid, name, content, file_type)
  VALUES ('delete', old.id, old.name, old.content, old.file_type);
END;

CREATE TRIGGER IF NOT EXISTS shard_files_au AFTER UPDATE ON shard_files BEGIN
  INSERT INTO shard_files_fts(shard_files_fts, rowid, name, content, file_type)
  VALUES ('delete', old.id, old.name, old.content, old.file_type);
  INSERT INTO shard_files_fts(rowid, name, content, file_type)
  VALUES (new.id, new.name, new.content, new.file_type);
END;
`

function initShardDatabase(db: BetterSqlite3Database): void {
  db.pragma('journal_mode = WAL')
  db.exec(CREATE_SHARD_FILES_TABLE)
  db.exec(CREATE_INDEXES)
  db.exec(CREATE_FTS_TABLE)

  // Rebuild FTS if needed
  const ftsCount = (db.prepare('SELECT COUNT(*) as count FROM shard_files_fts').get() as { count: number }).count
  const tableCount = (db.prepare('SELECT COUNT(*) as count FROM shard_files').get() as { count: number }).count
  if (tableCount > 0 && ftsCount === 0) {
    db.exec("INSERT INTO shard_files_fts(shard_files_fts) VALUES('rebuild')")
  }

  try {
    db.exec(CREATE_TRIGGERS)
  } catch {
    // Triggers may already exist
  }
}

function insertBatch(
  db: BetterSqlite3Database,
  files: ShardFileRecord[]
): number {
  const insertStmt = db.prepare(`
    INSERT INTO shard_files (path, name, size, hash, file_type, content, is_supported)
    VALUES (@path, @name, @size, @hash, @file_type, @content, @is_supported)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      size = excluded.size,
      hash = excluded.hash,
      file_type = excluded.file_type,
      content = excluded.content,
      is_supported = excluded.is_supported,
      updated_at = datetime('now')
  `)

  const transaction = db.transaction((batch: ShardFileRecord[]) => {
    for (const file of batch) {
      try {
        insertStmt.run({
          path: file.path,
          name: file.name,
          size: file.size,
          hash: file.hash,
          file_type: file.file_type,
          content: file.content,
          is_supported: file.is_supported
        })
      } catch (err) {
        log.warn(`[ShardLoader] Failed to insert file ${file.path}:`, err)
      }
    }
  })

  transaction(files)
  return files.length
}

function getFileCount(db: BetterSqlite3Database): number {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM shard_files').get() as { count: number }
    return row?.count ?? 0
  } catch {
    return 0
  }
}

function getDatabaseSize(dbPath: string): number {
  try {
    const stats = fs.statSync(dbPath)
    return stats.size
  } catch {
    return 0
  }
}

// ============ Main Worker Logic ============

interface ShardLoaderData {
  shardId: number
  dbPath: string
  mode: 'create' | 'open'
}

let currentDb: BetterSqlite3Database | null = null
let currentShardId: number = -1
let currentDbPath: string = ''

function sendResult(result: WorkerResult): void {
  parentPort?.postMessage(result)
}

function handleMessage(msg: WorkerMessage): void {
  if (msg.type === 'insert-batch') {
    if (!currentDb) {
      sendResult({ type: 'error', shardId: msg.shardId, error: 'No database connection' })
      return
    }

    try {
      const count = insertBatch(currentDb, msg.files)
      sendResult({
        type: 'batch-complete',
        shardId: msg.shardId,
        fileCount: getFileCount(currentDb)
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      log.error(`[ShardLoader:${msg.shardId}] Batch insert failed:`, err)
      sendResult({ type: 'error', shardId: msg.shardId, error })
    }
  } else if (msg.type === 'close') {
    handleClose(msg.shardId)
  } else if (msg.type === 'update-content') {
    handleUpdateContent(msg.shardId, msg.path, msg.content)
  } else if (msg.type === 'delete-file') {
    handleDeleteFile(msg.shardId, msg.path)
  } else if (msg.type === 'delete-folder') {
    handleDeleteFolder(msg.shardId, msg.folderPath)
  } else if (msg.type === 'rename-file') {
    handleRenameFile(msg.shardId, msg.oldPath, msg.newPath)
  } else if (msg.type === 'rename-folder') {
    handleRenameFolder(msg.shardId, msg.oldFolderPath, msg.newFolderPath)
  } else if (msg.type === 'cleanup-orphaned') {
    handleCleanupOrphaned(msg.shardId, msg.validPrefixes)
  }
}

function handleClose(shardId: number): void {
  try {
    if (currentDb) {
      currentDb.close()
      currentDb = null
    }
    sendResult({ type: 'closed', shardId })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleUpdateContent(shardId: number, path: string, content: string): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }
  try {
    const normalizedPath = path.replace(/\\/g, '/')
    const result = currentDb.prepare(`
      UPDATE shard_files
      SET content = ?, updated_at = datetime('now')
      WHERE path = ?
    `).run(content, normalizedPath)
    sendResult({ type: 'update-complete', shardId, changes: result.changes })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Update content failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleDeleteFile(shardId: number, path: string): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }
  try {
    const normalizedPath = path.replace(/\\/g, '/')
    const result = currentDb.prepare('DELETE FROM shard_files WHERE path = ?').run(normalizedPath)
    const fileCount = getFileCount(currentDb)
    sendResult({ type: 'delete-complete', shardId, changes: result.changes, fileCount })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Delete file failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleDeleteFolder(shardId: number, folderPath: string): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }
  try {
    const prefix = folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
    const result = currentDb.prepare("DELETE FROM shard_files WHERE path LIKE ? || '%'").run(prefix)
    const fileCount = getFileCount(currentDb)
    sendResult({ type: 'delete-complete', shardId, changes: result.changes, fileCount })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Delete folder failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleRenameFile(shardId: number, oldPath: string, newPath: string): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }
  try {
    const normalizedOldPath = oldPath.replace(/\\/g, '/')
    const normalizedNewPath = newPath.replace(/\\/g, '/')
    const newName = normalizedNewPath.split('/').pop() || ''
    const result = currentDb.prepare(`
      UPDATE shard_files
      SET path = ?, name = ?, updated_at = datetime('now')
      WHERE path = ?
    `).run(normalizedNewPath, newName, normalizedOldPath)
    sendResult({ type: 'rename-complete', shardId, changes: result.changes })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Rename file failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleRenameFolder(shardId: number, oldFolderPath: string, newFolderPath: string): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }
  try {
    const oldPrefix = oldFolderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
    const newPrefix = newFolderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
    const oldFolderName = oldFolderPath.replace(/\\/g, '/').split('/').pop() || ''
    const newFolderName = newFolderPath.replace(/\\/g, '/').split('/').pop() || ''
    const result = currentDb.prepare(`
      UPDATE shard_files
      SET path = (? || SUBSTR(path, ?)),
          name = (? || SUBSTR(name, ?)),
          updated_at = datetime('now')
      WHERE path LIKE ?
    `).run(newPrefix, oldPrefix.length + 1, newFolderName, oldFolderName.length + 1, oldPrefix + '%')
    sendResult({ type: 'rename-complete', shardId, changes: result.changes })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Rename folder failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

function handleCleanupOrphaned(shardId: number, validPrefixes: string[]): void {
  if (!currentDb) {
    sendResult({ type: 'error', shardId, error: 'No database connection' })
    return
  }

  try {
    // 如果没有有效前缀，不清理任何文件
    if (validPrefixes.length === 0) {
      sendResult({ type: 'cleanup-complete', shardId, changes: 0 })
      return
    }

    // 构建 SQL：删除路径不以任何有效前缀开头的文件
    const conditions = validPrefixes.map(() => "path NOT LIKE ? || '%'").join(' AND ')
    const deleteSql = `DELETE FROM shard_files WHERE ${conditions}`

    // 使用 transaction 保证一致性
    const transaction = currentDb.transaction(() => {
      const result = currentDb.prepare(deleteSql).run(...validPrefixes)
      return result.changes
    })

    const deletedCount = transaction()
    const fileCount = getFileCount(currentDb)
    log.info(`[ShardLoader:${shardId}] Cleanup: deleted ${deletedCount} orphaned files, ${fileCount} remaining`)
    sendResult({ type: 'cleanup-complete', shardId, changes: deletedCount, fileCount })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Cleanup orphaned failed:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

// ============ Startup ============

function main(): void {
  const data = workerData as ShardLoaderData
  const { shardId, dbPath, mode } = data
  currentShardId = shardId
  currentDbPath = dbPath

  const loadStart = Date.now()

  try {
    // Ensure parent directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Open or create database
    currentDb = new Database(dbPath)
    initShardDatabase(currentDb)

    const loadTime = Date.now() - loadStart
    const fileCount = getFileCount(currentDb)

    log.info(`[ShardLoader:${shardId}] Opened ${dbPath} (${fileCount} files, ${loadTime}ms)`)

    sendResult({
      type: 'ready',
      shardId,
      fileCount,
      loadTime
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(`[ShardLoader:${shardId}] Failed to open ${dbPath}:`, err)
    sendResult({ type: 'error', shardId, error })
  }
}

parentPort?.on('message', handleMessage)
main()
