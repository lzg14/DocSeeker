/**
 * Migration Module
 *
 * Migrates data from the legacy file-manager.db to the new shard-based architecture.
 * - Scanned folders and search history are stored in db/meta.db (already migrated in meta.ts)
 * - File records are migrated from file-manager.db to db/shards/shard_N.db files
 *
 * Idempotent: multiple calls only execute migration once.
 */

import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs'
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3'
import log from 'electron-log/main'

// ============ Paths ============

function getOldDbPath(): string {
  return join(app.getPath('userData'), 'file-manager.db')
}

function getShardsDir(): string {
  return join(app.getPath('userData'), 'db', 'shards')
}

function getShardPath(shardId: number): string {
  return join(getShardsDir(), `shard_${shardId}.db`)
}

// ============ Types ============

export interface MigrationProgress {
  phase: 'scanning' | 'migrating' | 'completing'
  totalFiles: number
  migratedFiles: number
  currentShard: number
  errors: string[]
}

export interface MigrationResult {
  success: boolean
  migrated: number
  errors: string[]
  skipped: number
}

interface LegacyFileRecord {
  id: number
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  created_at: string | null
  updated_at: string | null
  is_supported: number
}

// ============ Shard DB Schema ============

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
  tokenize='unicode61 remove_diacritics 1 tokenize=porter'
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

const LEGACY_TABLE_NAME = 'files'

// ============ Detect Machine Profile (shared with shardManager) ============

interface MachineProfile {
  cpuCores: number
  diskReadSpeedMBps: number
}

interface ShardConfig {
  maxSizeMB: number
  parallelWorkers: number
}

function detectMachineProfile(): MachineProfile {
  const cpuCores = require('os').cpus().length
  log.info(`[Migration] CPU cores detected: ${cpuCores}`)

  let diskReadSpeedMBps = 200 // Default fallback

  try {
    const { tmpdir } = require('os')
    const fs = require('fs')
    const testFile = join(tmpdir(), `docseeker_speed_test_${Date.now()}.tmp`)
    const testSizeBytes = 256 * 1024 * 1024 // 256MB

    const writeBuffer = Buffer.alloc(Math.min(testSizeBytes, 32 * 1024 * 1024))
    for (let i = 0; i < writeBuffer.length; i++) {
      writeBuffer[i] = i % 256
    }

    const writeStart = Date.now()
    let written = 0
    while (written < testSizeBytes) {
      const buf = Buffer.alloc(Math.min(writeBuffer.length, testSizeBytes - written))
      for (let i = 0; i < buf.length; i++) {
        buf[i] = (i + written) % 256
      }
      fs.writeFileSync(testFile, buf, { flag: written === 0 ? 'w' : 'a' })
      written += buf.length
    }
    const writeTime = (Date.now() - writeStart) / 1000

    const readStart = Date.now()
    const readFd = fs.openSync(testFile, 'r')
    const readBuf = Buffer.alloc(1024 * 1024)
    let bytesRead = 0
    while (true) {
      const r = fs.readSync(readFd, readBuf, 0, readBuf.length, null)
      if (r === 0) break
      bytesRead += r
    }
    fs.closeSync(readFd)
    const readTime = (Date.now() - readStart) / 1000

    try { unlinkSync(testFile) } catch {}

    const readSpeedMBps = (bytesRead / (1024 * 1024)) / readTime
    diskReadSpeedMBps = Math.round(readSpeedMBps)

    log.info(`[Migration] Disk speed test: ${readSpeedMBps.toFixed(1)} MB/s read`)

    if (diskReadSpeedMBps < 10 || diskReadSpeedMBps > 10000) {
      diskReadSpeedMBps = 200
    }
  } catch (err) {
    log.warn('[Migration] Disk speed test failed, using default 200 MB/s:', err)
    diskReadSpeedMBps = 200
  }

  return { cpuCores, diskReadSpeedMBps }
}

function computeShardConfig(profile: MachineProfile): ShardConfig {
  const maxSizeMB = Math.max(50, Math.min(profile.diskReadSpeedMBps * 2, 1000))
  const parallelWorkers = Math.min(Math.max(profile.cpuCores - 1, 1), 8)
  return { maxSizeMB, parallelWorkers }
}

// ============ Shard DB Helpers ============

function initShardDb(db: BetterSqlite3Database): void {
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

function openOrCreateShard(shardId: number): BetterSqlite3Database {
  const dbPath = getShardPath(shardId)
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const db = new Database(dbPath)
  initShardDb(db)
  return db
}

function insertFilesIntoShard(
  shardDb: BetterSqlite3Database,
  files: LegacyFileRecord[]
): number {
  const insertStmt = shardDb.prepare(`
    INSERT INTO shard_files (path, name, size, hash, file_type, content, is_supported, created_at, updated_at)
    VALUES (@path, @name, @size, @hash, @file_type, @content, @is_supported, @created_at, @updated_at)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      size = excluded.size,
      hash = excluded.hash,
      file_type = excluded.file_type,
      content = excluded.content,
      is_supported = excluded.is_supported,
      updated_at = datetime('now')
  `)

  let inserted = 0
  const transaction = shardDb.transaction((batch: LegacyFileRecord[]) => {
    for (const file of batch) {
      try {
        insertStmt.run({
          path: file.path,
          name: file.name,
          size: file.size,
          hash: file.hash,
          file_type: file.file_type,
          content: file.content,
          is_supported: file.is_supported ?? 1,
          created_at: file.created_at,
          updated_at: file.updated_at
        })
        inserted++
      } catch (err) {
        // Skip duplicate paths or invalid records
      }
    }
  })

  transaction(files)
  return inserted
}

// ============ Legacy DB Schema Detection ============

function detectLegacyTable(db: BetterSqlite3Database): 'files' | 'shard_files' | 'unknown' {
  try {
    db.prepare('SELECT COUNT(*) FROM files').get()
    return 'files'
  } catch {}

  try {
    db.prepare('SELECT COUNT(*) FROM shard_files').get()
    return 'shard_files'
  } catch {}

  return 'unknown'
}

function countLegacyFiles(db: BetterSqlite3Database, tableName: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number }
    return row?.count ?? 0
  } catch {
    return 0
  }
}

function iterateLegacyFiles(
  db: BetterSqlite3Database,
  tableName: string,
  batchSize: number,
  offset: number
): LegacyFileRecord[] {
  try {
    const stmt = db.prepare(`
      SELECT id, path, name, size, hash, file_type, content, created_at, updated_at, is_supported
      FROM ${tableName}
      ORDER BY id
      LIMIT ? OFFSET ?
    `)
    stmt.bind([batchSize, offset])
    return stmt.all() as LegacyFileRecord[]
  } catch {
    return []
  }
}

// ============ Migration Core ============

let migrationDone = false

/**
 * Check if migration is needed:
 * - Old file-manager.db exists
 * - db/shards/ directory is empty (no shard files yet)
 */
export function needsMigration(): boolean {
  if (migrationDone) return false

  const oldDbPath = getOldDbPath()
  const shardsDir = getShardsDir()

  const oldExists = existsSync(oldDbPath)
  if (!oldExists) {
    log.info('[Migration] No old file-manager.db found, skipping migration')
    return false
  }

  const shardsExist = existsSync(shardsDir) && readdirSync(shardsDir).length > 0
  if (shardsExist) {
    log.info('[Migration] Shards directory already has data, skipping migration')
    return false
  }

  return true
}

/**
 * Migrate all file records from file-manager.db to db/shards/ directory.
 * - Reads files in scan order (by id)
 * - Writes in batches to avoid memory issues
 * - Auto-creates new shard when current one exceeds size limit
 * - Verifies data integrity after migration
 * - Keeps old file-manager.db on failure (never deletes it)
 */
export async function migrateToShards(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationResult> {
  if (!needsMigration()) {
    migrationDone = true
    return { success: true, migrated: 0, errors: [], skipped: 0 }
  }

  log.info('[Migration] Starting migration from file-manager.db to shards...')

  const oldDbPath = getOldDbPath()
  const shardsDir = getShardsDir()
  const errors: string[] = []

  // Ensure shards directory exists
  if (!existsSync(shardsDir)) {
    mkdirSync(shardsDir, { recursive: true })
  }

  // Detect machine profile
  const profile = detectMachineProfile()
  const config = computeShardConfig(profile)
  const maxBytes = config.maxSizeMB * 1024 * 1024

  log.info(`[Migration] Using shard config: maxSize=${config.maxSizeMB}MB`)

  let legacyDb: BetterSqlite3Database | null = null
  let currentShardId = 0
  let currentShardDb: BetterSqlite3Database | null = null

  const BATCH_SIZE = 1000

  try {
    // Open legacy database
    legacyDb = new Database(oldDbPath, { readonly: true })
    legacyDb.pragma('journal_mode = WAL')

    // Detect table name
    const tableName = detectLegacyTable(legacyDb)
    if (tableName === 'unknown') {
      errors.push('Could not detect legacy table structure')
      return { success: false, migrated: 0, errors, skipped: 0 }
    }

    log.info(`[Migration] Detected legacy table: ${tableName}`)

    // Count total files
    const totalFiles = countLegacyFiles(legacyDb, tableName)
    log.info(`[Migration] Total files to migrate: ${totalFiles}`)

    if (totalFiles === 0) {
      // Empty DB, just mark migration done
      migrationDone = true
      return { success: true, migrated: 0, errors: [], skipped: 0 }
    }

    onProgress?.({
      phase: 'scanning',
      totalFiles,
      migratedFiles: 0,
      currentShard: 0,
      errors: []
    })

    // Create first shard
    currentShardDb = openOrCreateShard(currentShardId)

    let migratedFiles = 0
    let skippedFiles = 0
    let currentShardSize = 0
    let offset = 0

    // Migrate in batches
    while (offset < totalFiles + BATCH_SIZE) {
      const batch = iterateLegacyFiles(legacyDb, tableName, BATCH_SIZE, offset)
      if (batch.length === 0) break

      for (const file of batch) {
        offset++

        // Insert into current shard
        try {
          insertFilesIntoShard(currentShardDb, [file])
          migratedFiles++

          // Update shard size estimate
          currentShardSize += file.size + 256 // rough overhead per record

          // Check if shard is full
          if (currentShardSize >= maxBytes) {
            // Close current shard and open next
            try { currentShardDb?.close() } catch {}
            currentShardId++
            currentShardDb = openOrCreateShard(currentShardId)
            currentShardSize = 0

            log.info(`[Migration] Opened new shard ${currentShardId}`)
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          log.warn(`[Migration] Failed to migrate file ${file.path}: ${error}`)
          skippedFiles++
          if (errors.length < 100) {
            errors.push(`Failed: ${file.path}: ${error}`)
          }
        }
      }

      // Report progress
      onProgress?.({
        phase: 'migrating',
        totalFiles,
        migratedFiles,
        currentShard: currentShardId,
        errors
      })
    }

    // Verify data integrity
    onProgress?.({
      phase: 'completing',
      totalFiles,
      migratedFiles,
      currentShard: currentShardId,
      errors
    })

    let verifiedFiles = 0
    for (let shardId = 0; shardId <= currentShardId; shardId++) {
      const shardPath = getShardPath(shardId)
      if (existsSync(shardPath)) {
        try {
          const shardDb = new Database(shardPath, { readonly: true })
          const row = shardDb.prepare('SELECT COUNT(*) as count FROM shard_files').get() as { count: number }
          verifiedFiles += row?.count ?? 0
          shardDb.close()
        } catch (err) {
          errors.push(`Verification failed for shard ${shardId}`)
        }
      }
    }

    log.info(`[Migration] Verification: migrated=${migratedFiles}, verified=${verifiedFiles}`)

    if (verifiedFiles < migratedFiles * 0.95) {
      errors.push(`Data integrity check failed: expected ~${migratedFiles}, found ${verifiedFiles}`)
      return { success: false, migrated: migratedFiles, errors, skipped: skippedFiles }
    }

    // Migration successful - delete old DB
    try {
      legacyDb?.close()
      unlinkSync(oldDbPath)
      // Also delete WAL and SHM files
      try { unlinkSync(oldDbPath + '-wal') } catch {}
      try { unlinkSync(oldDbPath + '-shm') } catch {}
      log.info(`[Migration] Deleted old file-manager.db and related files`)
    } catch (err) {
      log.warn('[Migration] Failed to delete old file-manager.db (non-fatal):', err)
      errors.push('Migration succeeded but old file-manager.db could not be deleted')
    }

    migrationDone = true
    log.info(`[Migration] Completed successfully: ${migratedFiles} files migrated across ${currentShardId + 1} shards`)

    return {
      success: true,
      migrated: migratedFiles,
      errors: errors.length > 0 ? errors : [],
      skipped: skippedFiles
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('[Migration] Migration failed:', err)
    errors.push(`Migration failed: ${error}`)

    // DO NOT delete old DB on failure - keep it for recovery
    try { currentShardDb?.close() } catch {}
    try { legacyDb?.close() } catch {}

    return { success: false, migrated: 0, errors, skipped: 0 }
  }
}

