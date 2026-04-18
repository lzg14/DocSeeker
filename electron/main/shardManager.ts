/**
 * Shard Manager
 *
 * Manages multiple shard.db files with parallel loading and querying.
 *
 * Architecture:
 *   - Machine profile detection (CPU cores + disk read speed)
 *   - Parallel Worker-based shard loading
 *   - Round-robin file distribution across shards
 *   - Parallel search across all ready shards with BM25 merging
 */

import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { Worker } from 'worker_threads'
import log from 'electron-log/main'
import Database from 'better-sqlite3'

// ============ Types ============

export interface ShardInfo {
  id: number           // Sequential: 0, 1, 2, ...
  dbPath: string
  status: 'pending' | 'loading' | 'ready' | 'error'
  fileCount: number
  loadTime?: number
  error?: string
  currentSizeBytes: number
}

export interface MachineProfile {
  cpuCores: number
  diskReadSpeedMBps: number
}

export interface ShardConfig {
  maxSizeMB: number
  parallelWorkers: number
}

export interface SearchResult {
  id?: number
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  created_at?: string
  updated_at?: string
  shardId?: number  // Which shard this result came from
  rank?: number     // BM25 rank for cross-shard sorting
}

export interface SearchOptions {
  fileTypes?: string[]
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
}

export interface FileRecord {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  is_supported?: number
}

// ============ Constants ============

const SHARD_DIR = 'shards'
const SHARD_PREFIX = 'shard_'
const SHARD_EXT = '.db'
const META_DB_DIR = 'db'
const META_DB_NAME = 'meta.db'
const HOT_CACHE_NAME = 'hot-cache.json'
const BATCH_SIZE = 100   // Files per insert batch
const SPEED_TEST_SIZE_MB = 256  // 256MB sequential read test

// ============ Paths ============

function getShardsDir(): string {
  return join(app.getPath('userData'), META_DB_DIR, SHARD_DIR)
}

function getShardPath(shardId: number): string {
  return join(getShardsDir(), `${SHARD_PREFIX}${shardId}${SHARD_EXT}`)
}

function getMetaDbPath(): string {
  return join(app.getPath('userData'), META_DB_DIR, META_DB_NAME)
}

function getHotCachePath(): string {
  return join(app.getPath('userData'), META_DB_DIR, HOT_CACHE_NAME)
}

// ============ Machine Profile Detection ============

/**
 * Detect CPU core count and disk sequential read speed.
 * Disk speed is measured by writing and sequentially reading a test file.
 * Test file is created in temp directory and deleted after test.
 */
export function detectMachineProfile(): MachineProfile {
  const cpuCores = require('os').cpus().length
  log.info(`[ShardManager] CPU cores detected: ${cpuCores}`)

  let diskReadSpeedMBps = 200 // Default fallback

  try {
    const { tmpdir } = require('os')
    const fs = require('fs')
    const testFile = join(tmpdir(), `docseeker_speed_test_${Date.now()}.tmp`)
    const testSizeBytes = SPEED_TEST_SIZE_MB * 1024 * 1024

    // Write test data (use random-ish data pattern to avoid compression)
    const writeBuffer = Buffer.alloc(Math.min(testSizeBytes, 32 * 1024 * 1024))
    for (let i = 0; i < writeBuffer.length; i++) {
      writeBuffer[i] = i % 256
    }

    const totalStart = Date.now()
    const writeStream = fs.createWriteStream(testFile)
    let written = 0

    // Synchronous write simulation for timing accuracy
    const writeSync = () => {
      const buf = Buffer.alloc(Math.min(writeBuffer.length, testSizeBytes - written))
      for (let i = 0; i < buf.length; i++) {
        buf[i] = (i + written) % 256
      }
      fs.writeFileSync(testFile, buf, { flag: written === 0 ? 'w' : 'a' })
      written += buf.length
    }

    // Quick timing: write 256MB
    const writeStart = Date.now()
    while (written < testSizeBytes) {
      writeSync()
    }
    const writeTime = (Date.now() - writeStart) / 1000

    // Sequential read test
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

    // Clean up
    try { unlinkSync(testFile) } catch {}

    // Calculate write and read speeds
    const writeSpeedMBps = (testSizeBytes / (1024 * 1024)) / writeTime
    const readSpeedMBps = (bytesRead / (1024 * 1024)) / readTime

    // Use read speed as the authoritative metric
    diskReadSpeedMBps = Math.round(readSpeedMBps)

    log.info(`[ShardManager] Disk speed test: ${writeSpeedMBps.toFixed(1)} MB/s write, ${readSpeedMBps.toFixed(1)} MB/s read (${testSizeBytes / (1024 * 1024)}MB test)`)

    // Sanity check: if speed is unrealistic, fall back
    if (diskReadSpeedMBps < 10 || diskReadSpeedMBps > 10000) {
      diskReadSpeedMBps = 200
    }
  } catch (err) {
    log.warn('[ShardManager] Disk speed test failed, using default 200 MB/s:', err)
    diskReadSpeedMBps = 200
  }

  return { cpuCores, diskReadSpeedMBps }
}

/**
 * Compute shard configuration from machine profile.
 * - maxSizeMB: shard size limit = diskReadSpeed × 2 (ensures 2s load time)
 * - parallelWorkers: min(cpuCores - 1, 8)
 */
export function computeShardConfig(profile: MachineProfile): ShardConfig {
  // Shard size limit: ensure it can be loaded within 2 seconds
  const maxSizeMB = Math.max(50, Math.min(profile.diskReadSpeedMBps * 2, 2000))

  // Parallel workers: leave 1 core for main thread, cap at 8
  const parallelWorkers = Math.min(Math.max(profile.cpuCores - 1, 1), 8)

  log.info(`[ShardManager] Shard config: maxSize=${maxSizeMB}MB, parallelWorkers=${parallelWorkers}`)

  return { maxSizeMB, parallelWorkers }
}

// ============ Shard Manager State ============

let profile: MachineProfile | null = null
let config: ShardConfig | null = null
let shards: ShardInfo[] = []
let shardWorkers: Map<number, Worker> = new Map()
let pendingWorkerResults: Map<number, WorkerResult> = new Map()
let initialized = false
let initPromise: Promise<void> | null = null
let totalFilesInserted = 0

interface WorkerResult {
  type: 'ready' | 'loaded' | 'batch-complete' | 'closed' | 'error'
  shardId: number
  fileCount?: number
  error?: string
  loadTime?: number
}

// ============ Shard Loading ============

function loadShardWorker(shardId: number, dbPath: string): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'shardLoader.js')

    try {
      const worker = new Worker(workerPath, {
        workerData: { shardId, dbPath, mode: existsSync(dbPath) ? 'open' : 'create' }
      })

      shardWorkers.set(shardId, worker)

      worker.on('message', (result: WorkerResult) => {
        if (result.type === 'ready') {
          resolve(result)
        } else if (result.type === 'error') {
          resolve(result) // Resolve with error, don't reject
        } else if (result.type === 'batch-complete' || result.type === 'closed') {
          pendingWorkerResults.set(result.shardId, result)
        }
      })

      worker.on('error', (err) => {
        log.error(`[ShardManager] Worker ${shardId} error:`, err)
        shardWorkers.delete(shardId)
        resolve({ type: 'error', shardId, error: err.message })
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          log.warn(`[ShardManager] Worker ${shardId} exited with code ${code}`)
        }
        shardWorkers.delete(shardId)
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      log.error(`[ShardManager] Failed to start worker for shard ${shardId}:`, err)
      reject(new Error(error))
    }
  })
}

async function loadExistingShards(): Promise<void> {
  const dir = getShardsDir()
  if (!existsSync(dir)) return

  const { readdirSync } = require('fs')
  const files = readdirSync(dir).filter(f => f.startsWith(SHARD_PREFIX) && f.endsWith(SHARD_EXT))

  for (const file of files) {
    const match = file.match(/^shard_(\d+)\.db$/)
    if (!match) continue
    const shardId = parseInt(match[1], 10)

    const dbPath = join(dir, file)
    const shardInfo: ShardInfo = {
      id: shardId,
      dbPath,
      status: 'pending',
      fileCount: 0,
      currentSizeBytes: 0
    }

    shards.push(shardInfo)
  }

  shards.sort((a, b) => a.id - b.id)
  log.info(`[ShardManager] Found ${shards.length} existing shards`)

  // Load shards in parallel up to config.parallelWorkers
  if (config && shards.length > 0) {
    const maxParallel = config.parallelWorkers
    for (let i = 0; i < shards.length; i += maxParallel) {
      const batch = shards.slice(i, i + maxParallel)
      const promises = batch.map(s => {
        s.status = 'loading'
        return loadShardWorker(s.id, s.dbPath)
      })

      const results = await Promise.allSettled(promises)

      for (let j = 0; j < batch.length; j++) {
        const s = batch[j]
        const result = (results[j] as PromiseFulfilledResult<WorkerResult>).value

        if (result.type === 'ready') {
          s.status = 'ready'
          s.fileCount = result.fileCount ?? 0
          s.loadTime = result.loadTime
          s.currentSizeBytes = require('fs').statSync(s.dbPath).size
          log.info(`[ShardManager] Loaded existing shard ${s.id}: ${s.fileCount} files`)
        } else {
          s.status = 'error'
          s.error = result.error ?? 'Unknown error'
          log.error(`[ShardManager] Failed to load shard ${s.id}:`, result.error)
        }
      }
    }
  }
}

/**
 * Initialize the shard manager:
 * 1. Detect machine profile
 * 2. Compute shard config
 * 3. Load existing shards in parallel
 */
export async function initShardManager(): Promise<void> {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    log.info('[ShardManager] Initializing...')

    // Ensure directory structure exists
    const dir = getShardsDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Ensure parent db/ directory exists
    const dbDir = join(app.getPath('userData'), META_DB_DIR)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    // Detect machine profile
    profile = detectMachineProfile()

    // Compute shard config
    config = computeShardConfig(profile)

    // Load existing shards
    await loadExistingShards()

    initialized = true
    log.info(`[ShardManager] Ready. Profile: ${JSON.stringify(profile)}, Config: ${JSON.stringify(config)}`)
  })()

  return initPromise
}

// ============ Open / Create Next Shard ============

function getShardWorker(shardId: number): Worker | undefined {
  return shardWorkers.get(shardId)
}

export function getReadyShards(): ShardInfo[] {
  return shards.filter(s => s.status === 'ready')
}

function getCurrentShard(): ShardInfo | undefined {
  return shards[shards.length - 1]
}

function isShardFull(shard: ShardInfo): boolean {
  if (!config) return false
  const maxBytes = config.maxSizeMB * 1024 * 1024
  return shard.currentSizeBytes >= maxBytes
}

/**
 * Open the next shard. If the current shard is full or doesn't exist,
 * create and load a new one.
 */
export async function openNextShard(): Promise<ShardInfo | null> {
  await initShardManager()

  let currentShard = getCurrentShard()

  // Check if current shard is full
  if (currentShard && currentShard.status === 'ready' && !isShardFull(currentShard)) {
    return currentShard
  }

  // Need a new shard
  const newId = shards.length
  const newDbPath = getShardPath(newId)

  const newShard: ShardInfo = {
    id: newId,
    dbPath: newDbPath,
    status: 'loading',
    fileCount: 0,
    currentSizeBytes: 0
  }

  shards.push(newShard)

  try {
    const result = await loadShardWorker(newId, newDbPath)

    if (result.type === 'ready') {
      newShard.status = 'ready'
      newShard.fileCount = result.fileCount ?? 0
      newShard.loadTime = result.loadTime
      newShard.currentSizeBytes = require('fs').statSync(newDbPath).size
      log.info(`[ShardManager] Created and loaded new shard ${newId}`)
      return newShard
    } else {
      newShard.status = 'error'
      newShard.error = result.error ?? 'Failed to load new shard'
      log.error(`[ShardManager] Failed to load new shard ${newId}:`, newShard.error)
      return null
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    newShard.status = 'error'
    newShard.error = error
    log.error(`[ShardManager] Exception loading new shard ${newId}:`, err)
    return null
  }
}

/**
 * Insert a batch of files into the current shard.
 * Routes to the correct worker based on shardId.
 */
export async function insertFileBatch(
  shardId: number,
  files: FileRecord[]
): Promise<{ success: boolean; fileCount: number }> {
  await initShardManager()

  const shard = shards.find(s => s.id === shardId)
  if (!shard) {
    log.error(`[ShardManager] insertFileBatch: shard ${shardId} not found`)
    return { success: false, fileCount: 0 }
  }

  const worker = getShardWorker(shardId)
  if (!worker) {
    log.error(`[ShardManager] insertFileBatch: no worker for shard ${shardId}`)
    return { success: false, fileCount: 0 }
  }

  return new Promise((resolve) => {
    const handler = (result: WorkerResult) => {
      if (result.shardId === shardId) {
        worker.off('message', handler)
        if (result.type === 'batch-complete') {
          shard.fileCount = result.fileCount ?? shard.fileCount
          shard.currentSizeBytes = require('fs').statSync(shard.dbPath).size
          totalFilesInserted += files.length
          resolve({ success: true, fileCount: result.fileCount ?? 0 })
        } else {
          resolve({ success: false, fileCount: 0 })
        }
      }
    }

    worker.on('message', handler)

    const records = files.map(f => ({
      path: f.path,
      name: f.name,
      size: f.size,
      hash: f.hash,
      file_type: f.file_type,
      content: f.content,
      is_supported: f.is_supported ?? 1
    }))

    worker.postMessage({ type: 'insert-batch', shardId, files: records })
  })
}

// ============ Search ============

/**
 * Parse FTS query from user query string.
 */
function parseFtsQuery(query: string): string {
  const hasExplicitOr = /(^|\s)OR(\s|$)/i.test(query)
  const hasExplicitNot = /(^|\s)NOT(\s|$)/i.test(query)

  if (!hasExplicitOr && !hasExplicitNot) {
    const words = query.trim().split(/\s+/).filter(w => w.length > 0)
    return words.map(w => {
      if (w.startsWith('"') && w.endsWith('"')) {
        return w
      }
      if (w.endsWith('*')) {
        return `"${w.slice(0, -1).replace(/"/g, '""')}"`
      }
      return `"${w.replace(/"/g, '""')}"*`
    }).join(' AND ')
  }

  let result = query.trim()
  result = result.replace(/"([^"]+)"/g, (_, phrase) => `"${phrase.replace(/"/g, '""')}"`)
  result = result.replace(/(?<![*:a-zA-Z0-9_])([a-zA-Z0-9_\u4e00-\u9fff]+)(?![*:])(?=\s|$|[)])/g, (match) => {
    const upper = match.toUpperCase()
    if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'NEAR') return match
    return `"${match}"*`
  })
  result = result.replace(/\bNOT\b/gi, '-')

  return result
}

/**
 * Search a single shard database (synchronous, called from worker context).
 */
function searchShardDb(
  db: Database,
  ftsQuery: string,
  options?: SearchOptions,
  shardId?: number
): SearchResult[] {
  const whereClauses: string[] = ['shard_files_fts MATCH ?']
  const params: (string | number)[] = [ftsQuery]

  if (options?.fileTypes && options.fileTypes.length > 0) {
    const placeholders = options.fileTypes.map(() => '?').join(', ')
    whereClauses.push(`f.file_type IN (${placeholders})`)
    params.push(...options.fileTypes)
  }

  if (options?.sizeMin !== undefined && options.sizeMin > 0) {
    whereClauses.push('f.size >= ?')
    params.push(options.sizeMin)
  }
  if (options?.sizeMax !== undefined && options.sizeMax > 0) {
    whereClauses.push('f.size <= ?')
    params.push(options.sizeMax)
  }
  if (options?.dateFrom) {
    whereClauses.push('f.updated_at >= ?')
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    whereClauses.push('f.updated_at <= ?')
    params.push(options.dateTo)
  }

  // Only search supported files
  whereClauses.push('f.is_supported = 1')

  const whereClause = whereClauses.join(' AND ')

  const stmt = db.prepare(`
    SELECT f.*, bm25(shard_files_fts) as rank
    FROM shard_files_fts fts
    JOIN shard_files f ON fts.rowid = f.id
    WHERE ${whereClause}
    ORDER BY rank
  `)

  stmt.bind(params)

  const results: SearchResult[] = []
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    const r = row as Record<string, unknown>
    results.push({
      id: r.id as number,
      path: r.path as string,
      name: r.name as string,
      size: r.size as number,
      hash: r.hash as string | null,
      file_type: r.file_type as string | null,
      content: r.content as string | null,
      created_at: r.created_at as string | undefined,
      updated_at: r.updated_at as string | undefined,
      shardId,
      rank: r.rank as number
    })
  }

  return results
}

/**
 * Search all ready shards in parallel and merge BM25-ranked results.
 * This is the main search API.
 */
export async function searchAllShards(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  await initShardManager()

  if (!query.trim()) return []

  const readyShards = getReadyShards()
  if (readyShards.length === 0) return []

  const ftsQuery = parseFtsQuery(query)

  // Search each shard in parallel using direct SQLite access
  // (Workers are used for inserts; reads are fast enough for synchronous access)
  const searchPromises = readyShards.map(shard => {
    return (async () => {
      try {
        const db = new Database(shard.dbPath, { readonly: true })
        db.pragma('journal_mode = WAL')
        const results = searchShardDb(db, ftsQuery, options, shard.id)
        db.close()
        return results
      } catch (err) {
        log.warn(`[shardManager] Search failed for shard ${shard.id}:`, err)
        return []
      }
    })()
  })

  const resultsArrays = await Promise.all(searchPromises)
  const allResults = resultsArrays

  // Merge all results, sort by BM25 rank
  const merged = allResults.flat()
  merged.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  return merged.slice(0, 200) // Limit to top 200 results
}

/**
 * Get all ready shards info.
 */
export function getShardInfo(): ShardInfo[] {
  return [...shards]
}

/**
 * Get hot search results from cache.
 */
export function getHotCache(): Record<string, SearchResult[]> {
  try {
    const cachePath = getHotCachePath()
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {}
  return {}
}

/**
 * Update hot search cache.
 */
export function setHotCache(cache: Record<string, SearchResult[]>): void {
  try {
    const cachePath = getHotCachePath()
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
  } catch (err) {
    log.warn('[ShardManager] Failed to write hot cache:', err)
  }
}

/**
 * Close all shard workers and clean up resources.
 */
export function closeAllShards(): void {
  log.info('[ShardManager] Closing all shard workers...')

  for (const [shardId, worker] of shardWorkers.entries()) {
    try {
      worker.postMessage({ type: 'close', shardId })
    } catch {}
  }

  // Wait briefly then terminate any remaining workers
  setTimeout(() => {
    for (const [shardId, worker] of shardWorkers.entries()) {
      try {
        worker.terminate()
      } catch {}
    }
    shardWorkers.clear()
  }, 1000)

  shards = []
  initialized = false
  initPromise = null
  log.info('[ShardManager] All shards closed')
}

/**
 * Get search snippets for highlighting.
 */
export function getSearchSnippets(
  query: string,
  filePaths: string[]
): Record<string, string> {
  const result: Record<string, string> = {}

  if (!query.trim() || filePaths.length === 0) return result

  const readyShards = getReadyShards()
  if (readyShards.length === 0) return result

  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)

  for (const shard of readyShards) {
    try {
      const db = new Database(shard.dbPath, { readonly: true })

      const placeholders = filePaths.map(() => '?').join(', ')
      const stmt = db.prepare(`
        SELECT path, content FROM shard_files
        WHERE path IN (${placeholders}) AND content IS NOT NULL AND is_supported = 1
      `)
      stmt.bind(filePaths)

      for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
        const r = row as { path: string; content: string }
        for (const keyword of keywords) {
          const idx = r.content.toLowerCase().indexOf(keyword.toLowerCase())
          if (idx !== -1) {
            const start = Math.max(0, idx - 40)
            const end = Math.min(r.content.length, idx + keyword.length + 60)
            const snippet = (start > 0 ? '...' : '') +
              r.content.slice(start, end).replace(/</g, '&lt;').replace(/>/g, '&gt;') +
              (end < r.content.length ? '...' : '')
            const highlighted = snippet.replace(
              new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
              '<mark>$1</mark>'
            )
            result[r.path] = highlighted
            break
          }
        }
      }

      db.close()
    } catch (err) {
      log.warn(`[ShardManager] getSearchSnippets failed on shard ${shard.id}:`, err)
    }
  }

  return result
}

/**
 * Get total file count across all shards.
 */
export function getTotalFileCount(): number {
  return shards.reduce((sum, s) => sum + s.fileCount, 0)
}

/**
 * Get machine profile (for diagnostics).
 */
export function getMachineProfile(): MachineProfile | null {
  return profile ? { ...profile } : null
}

/**
 * Get shard config (for diagnostics).
 */
export function getShardConfigInfo(): ShardConfig | null {
  return config ? { ...config } : null
}

// Export types for use by other modules
export type { Database }
