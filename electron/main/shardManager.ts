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
import Fuse from 'fuse.js'
import { getAppSetting, setAppSetting, getDataPath } from './config'

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
  is_supported?: number  // 0 = unsupported, 1 = supported
  shardId?: number  // Which shard this result came from
  rank?: number     // BM25 rank for cross-shard sorting
  match_type?: 'content' | 'filename'
}

export interface SearchOptions {
  fileTypes?: string[]
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
  // 由 extractFieldPrefixes 填充
  pathQuery?: string      // path: 前缀后的关键词 → SQL LIKE
  extFilters?: string[]   // ext: 前缀后的扩展名 → 合并到 fileTypes
}

export interface FileRecord {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  is_supported?: boolean
}

// ============ Constants ============

const SHARD_DIR = 'shards'
const SHARD_PREFIX = 'shard_'
const SHARD_EXT = '.db'
const BATCH_SIZE = 100   // Files per insert batch
const SPEED_TEST_SIZE_MB = 256  // 256MB sequential read test

// ============ Paths ============

function getShardsDir(): string {
  return join(getDataPath(), SHARD_DIR)
}

function getShardPath(shardId: number): string {
  return join(getShardsDir(), `${SHARD_PREFIX}${shardId}${SHARD_EXT}`)
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
  const maxSizeMB = Math.max(50, Math.min(profile.diskReadSpeedMBps * 2, 1024))

  // Parallel workers: leave 1 core for main thread, cap at 8
  const parallelWorkers = Math.min(Math.max(profile.cpuCores - 1, 1), 8)

  log.info(`[ShardManager] Shard config: maxSize=${maxSizeMB}MB, parallelWorkers=${parallelWorkers}`)

  return { maxSizeMB, parallelWorkers }
}

// ============ Profile Caching (persist to config.db) ============

const PROFILE_KEY = 'shard_profile'
const CONFIG_KEY = 'shard_config'

interface CachedProfile {
  cpuCores: number
  diskReadSpeedMBps: number
  savedAt: string
}

interface CachedConfig {
  maxSizeMB: number
  parallelWorkers: number
  savedAt: string
}

/**
 * Load cached machine profile from config.db.
 * Returns null if not cached yet.
 */
function loadCachedProfile(): MachineProfile | null {
  try {
    const cached = getAppSetting<CachedProfile | null>(PROFILE_KEY, null)
    if (cached && typeof cached.cpuCores === 'number' && typeof cached.diskReadSpeedMBps === 'number') {
      log.info(`[ShardManager] Loaded cached profile: ${cached.cpuCores} cores, ${cached.diskReadSpeedMBps} MB/s`)
      return { cpuCores: cached.cpuCores, diskReadSpeedMBps: cached.diskReadSpeedMBps }
    }
  } catch {}
  return null
}

/**
 * Save machine profile to config.db for future sessions.
 */
function saveProfileToCache(profile: MachineProfile): void {
  try {
    setAppSetting(PROFILE_KEY, { ...profile, savedAt: new Date().toISOString() })
    log.info(`[ShardManager] Saved profile to cache`)
  } catch (err) {
    log.warn('[ShardManager] Failed to save profile cache:', err)
  }
}

/**
 * Load cached shard config from config.db.
 * Returns null if not cached yet.
 */
function loadCachedConfig(): ShardConfig | null {
  try {
    const cached = getAppSetting<CachedConfig | null>(CONFIG_KEY, null)
    if (cached && typeof cached.maxSizeMB === 'number' && typeof cached.parallelWorkers === 'number') {
      log.info(`[ShardManager] Loaded cached config: maxSize=${cached.maxSizeMB}MB, parallelWorkers=${cached.parallelWorkers}`)
      return { maxSizeMB: cached.maxSizeMB, parallelWorkers: cached.parallelWorkers }
    }
  } catch {}
  return null
}

/**
 * Save shard config to config.db for future sessions.
 */
function saveConfigToCache(config: ShardConfig): void {
  try {
    setAppSetting(CONFIG_KEY, { ...config, savedAt: new Date().toISOString() })
    log.info(`[ShardManager] Saved config to cache`)
  } catch (err) {
    log.warn('[ShardManager] Failed to save config cache:', err)
  }
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
  type: 'ready' | 'loaded' | 'batch-complete' | 'update-complete' | 'delete-complete' | 'rename-complete' | 'cleanup-complete' | 'closed' | 'error'
  shardId: number
  fileCount?: number
  changes?: number
  error?: string
  loadTime?: number
}

// ============ Shard Loading ============

// 根据操作类型获取超时时间
function getTimeoutForOperation(msg: object): number {
  if ('type' in msg) {
    if (msg.type === 'delete-folder') {
      return 120000 // 删除文件夹可能涉及大量文件，120秒
    }
    if (msg.type === 'rename-folder') {
      return 120000 // 重命名文件夹可能涉及大量文件，120秒
    }
  }
  return 30000 // 默认 30 秒
}

function sendToWorker(shardId: number, msg: object, customTimeout?: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = shardWorkers.get(shardId)
    if (!worker) {
      reject(new Error(`No worker for shard ${shardId}`))
      return
    }

    const timeout = customTimeout ?? getTimeoutForOperation(msg)
    const timeoutId = setTimeout(() => {
      cleanup()
      log.warn(`[ShardManager] Worker timeout (${timeout}ms) for shard ${shardId}, operation: ${(msg as { type?: string }).type}`)
      reject(new Error(`Worker message timeout for shard ${shardId}`))
    }, timeout)

    function cleanup() {
      pendingWorkerResults.delete(shardId)
      clearTimeout(timeoutId)
    }

    function handler(result: WorkerResult) {
      if (result.shardId === shardId) {
        cleanup()
        worker.off('message', handler)
        resolve(result)
      }
    }

    worker.on('message', handler)
    worker.postMessage(msg)
  })
}

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
        } else if (result.type === 'batch-complete' || result.type === 'update-complete' || result.type === 'delete-complete' || result.type === 'rename-complete' || result.type === 'closed') {
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
 * 1. Load or detect machine profile (cached in config.db)
 * 2. Load or compute shard config (cached in config.db)
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

    // Ensure data directory exists
    const dataDir = getDataPath()
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    // Try to load cached profile and config first
    const cachedProfile = loadCachedProfile()
    const cachedConfig = loadCachedConfig()

    if (cachedProfile && cachedConfig) {
      profile = cachedProfile
      config = cachedConfig
      log.info(`[ShardManager] Using cached profile/config (no speed test needed)`)
    } else {
      // First run or cache cleared — detect and save
      profile = detectMachineProfile()
      config = computeShardConfig(profile)
      saveProfileToCache(profile)
      saveConfigToCache(config)
    }

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
 * Get the shard with the most remaining space (least loaded).
 * Used for balancing new file writes across shards.
 */
function getLeastLoadedShard(): ShardInfo | null {
  if (!config) return null
  const maxBytes = config.maxSizeMB * 1024 * 1024
  const readyShards = shards.filter(s => s.status === 'ready')
  if (readyShards.length === 0) return null

  return readyShards.reduce((best, s) => {
    const remainingBest = (config!.maxSizeMB * 1024 * 1024) - best.currentSizeBytes
    const remainingCurr = maxBytes - s.currentSizeBytes
    return remainingCurr > remainingBest ? s : best
  })
}

/**
 * Open the best shard for new writes. Prefers the least loaded shard
 * over the last shard, to keep all shards balanced.
 * Creates a new shard when all existing ones are full.
 */
export async function openNextShard(): Promise<ShardInfo | null> {
  await initShardManager()

  // Use the shard with most remaining space instead of always using the last one
  let leastLoaded = getLeastLoadedShard()

  if (leastLoaded && !isShardFull(leastLoaded)) {
    return leastLoaded
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
 * 从用户查询字符串中提取字段限定前缀。
 * 支持: name:report  path:documents  ext:pdf ext:docx
 */
export function extractFieldPrefixes(query: string): {
  nameQuery?: string
  pathQuery?: string
  extFilters: string[]
  remainingQuery: string
} {
  const result = {
    nameQuery: undefined as string | undefined,
    pathQuery: undefined as string | undefined,
    extFilters: [] as string[],
    remainingQuery: query,
  }

  // 提取 ext:（可多次出现）
  const extMatches = [...result.remainingQuery.matchAll(/\bext:([a-zA-Z0-9]+)\b/gi)]
  if (extMatches.length > 0) {
    result.extFilters = extMatches.map(m => m[1].toLowerCase())
    result.remainingQuery = result.remainingQuery.replace(/\bext:[a-zA-Z0-9]+\b/gi, '').trim()
  }

  // 提取 name:（取第一个）
  const nameMatch = result.remainingQuery.match(/\bname:("[^"]+"|[^\s]+)/i)
  if (nameMatch) {
    result.nameQuery = nameMatch[1].replace(/^"|"$/g, '')
    result.remainingQuery = result.remainingQuery
      .replace(/\bname:"[^"]+"\b/i, '')
      .replace(/\bname:[^\s]+\b/i, '')
      .trim()
  }

  // 提取 path:（取第一个）
  const pathMatch = result.remainingQuery.match(/\bpath:("[^"]+"|[^\s]+)/i)
  if (pathMatch) {
    result.pathQuery = pathMatch[1].replace(/^"|"$/g, '')
    result.remainingQuery = result.remainingQuery
      .replace(/\bpath:"[^"]+"\b/i, '')
      .replace(/\bpath:[^\s]+\b/i, '')
      .trim()
  }

  return result
}

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

  // path: 字段 → SQL LIKE（路径不在 FTS5 中）
  if (options?.pathQuery) {
    const escaped = options.pathQuery.replace(/[%_\[\]\\\\]/g, '\\\\$&')
    whereClauses.push('f.path LIKE ?')
    params.push(`%${escaped}%`)
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
      rank: r.rank as number,
      match_type: 'content'
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

  // 调试日志：显示搜索参数
  log.info(`[Search] searchAllShards query="${query}", fileTypes=${JSON.stringify(options?.fileTypes)}`)

  const readyShards = getReadyShards()
  if (readyShards.length === 0) return []

  // 解析字段限定前缀
  const fieldInfo = extractFieldPrefixes(query)

  if (fieldInfo.nameQuery) {
    const nameOnlyResults = await searchByFileName(fieldInfo.nameQuery, {
      ...options,
      fileTypes: [...(options?.fileTypes ?? []), ...fieldInfo.extFilters]
    })
    if (fieldInfo.pathQuery) {
      const lowerPath = r.path.toLowerCase()
      const lowerQuery = fieldInfo.pathQuery!.toLowerCase()
      return lowerPath.includes(lowerQuery)
    }
    return nameOnlyResults
  }

  const ftsQuery = parseFtsQuery(fieldInfo.remainingQuery)
  const effectiveFileTypes = [
    ...(options?.fileTypes ?? []),
    ...fieldInfo.extFilters
  ]
  const effectiveOptions: SearchOptions = {
    ...options,
    fileTypes: effectiveFileTypes.length > 0 ? effectiveFileTypes : undefined,
    pathQuery: fieldInfo.pathQuery,
  }

  // Search each shard in parallel using direct SQLite access
  // (Workers are used for inserts; reads are fast enough for synchronous access)
  const searchPromises = readyShards.map(shard => {
    return (async () => {
      try {
        const db = new Database(shard.dbPath, { readonly: true })
        db.pragma('journal_mode = WAL')
        const results = searchShardDb(db, ftsQuery, effectiveOptions, shard.id)
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

// ─── Fuzzy Search ──────────────────────────────────────────────────────────

export interface FuzzySearchResult {
  id: number
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string
  content: string | null
  created_at: string
  updated_at: string
  is_supported: boolean | null
  match_type?: string
  rank?: number
  fuzzyScore?: number  // 0 = 完美匹配, 1 = 最差
}

/**
 * Fuzzy search across all shards.
 * First performs FTS5 search, then re-ranks with Fuse.js for typo tolerance.
 */
export async function fuzzySearchAllShards(
  query: string,
  threshold = 0.4
): Promise<FuzzySearchResult[]> {
  // First get FTS5 results
  const ftsResults = await searchAllShards(query)

  if (ftsResults.length === 0) return []

  // Apply Fuse.js for fuzzy re-ranking
  const fuse = new Fuse(ftsResults, {
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'content', weight: 0.3 }
    ],
    threshold,
    distance: 100,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  })

  const fuzzyResults = fuse.search(query)

  return fuzzyResults.map(r => ({
    ...r.item,
    fuzzyScore: r.score ?? 0
  }))
}

/**
 * Search files by filename only using FTS.
 * Reuses shard search infrastructure but scopes to name field only.
 */
export async function searchByFileName(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  await initShardManager()

  if (!query.trim()) return []

  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  if (keywords.length === 0) return []

  // Build filename-only FTS query (restrict to name column)
  const ftsQuery = keywords.map(k => `"${k.replace(/"/g, '""')}"*`).join(' AND ')
  log.info(`[Search] searchByFileName query="${query}", fileTypes=${JSON.stringify(options?.fileTypes)}, ftsQuery="${ftsQuery}"`)

  const readyShards = getReadyShards()
  if (readyShards.length === 0) return []

  // Search each shard in parallel with name-only FTS query
  const searchPromises = readyShards.map(shard => {
    return (async () => {
      try {
        const db = new Database(shard.dbPath, { readonly: true })
        db.pragma('journal_mode = WAL')
        const results = searchShardDbNameOnly(db, ftsQuery, options, shard.id)
        db.close()
        return results
      } catch (err) {
        log.warn(`[shardManager] searchByFileName failed on shard ${shard.id}:`, err)
        return []
      }
    })()
  })

  const resultsArrays = await Promise.all(searchPromises)
  const merged = resultsArrays.flat()
  merged.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  return merged.slice(0, 200)
}

/**
 * Search a single shard database for filename matches only.
 * Uses a separate FTS query that targets only the name column.
 */
function searchShardDbNameOnly(
  db: Database,
  ftsQuery: string,
  options?: SearchOptions,
  shardId?: number
): SearchResult[] {
  // For filename-only search: need to prefix each term with name:
  // ftsQuery format: "word1"* AND "word2"* (with wildcards)
  // We need: name:"word1"* AND name:"word2"* (each term prefixed)
  const nameFtsQuery = ftsQuery
    .split(/\s+AND\s+/i)
    .map(term => `name:${term.trim()}`)
    .join(' AND ')

  const whereClauses: string[] = ['shard_files_fts MATCH ?']
  const params: (string | number)[] = [nameFtsQuery]

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
      rank: r.rank as number,
      match_type: 'filename'
    })
  }

  return results
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

// ============ Write Operations (delegated to workers) ============

/**
 * Delete a single file from all shards via workers.
 */
export async function deleteFileFromAllShardsAsync(filePath: string): Promise<number> {
  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'delete-file', shardId: shard.id, path: filePath })
      .then(result => {
        if (result.type === 'delete-complete') {
          // 更新内存中的 fileCount
          if (result.fileCount !== undefined) {
            shard.fileCount = result.fileCount
          }
          log.info(`[ShardManager] Deleted file ${filePath} from shard ${shard.id}`)
          return 1
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to delete file ${filePath} from shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
}

/**
 * Delete all files under a folder from all shards via workers.
 */
export async function deleteFilesByFolderPrefixFromAllShardsAsync(folderPath: string): Promise<number> {
  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'delete-folder', shardId: shard.id, folderPath })
      .then(result => {
        if (result.type === 'delete-complete' && result.changes) {
          // 更新内存中的 fileCount
          if (result.fileCount !== undefined) {
            shard.fileCount = result.fileCount
          }
          log.info(`[ShardManager] Deleted ${result.changes} files under ${folderPath} from shard ${shard.id}`)
          return result.changes
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to delete files under ${folderPath} from shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
}

/**
 * Update file content in all shards via workers.
 * Only updates if content is non-empty.
 */
export async function updateFileContentInAllShardsAsync(filePath: string, content: string | null): Promise<number> {
  // 空内容不更新（避免无效写入）
  if (!content || content.trim() === '') {
    return 0
  }

  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'update-content', shardId: shard.id, path: filePath, content })
      .then(result => {
        if (result.type === 'update-complete' && result.changes) {
          return 1
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to update content for ${filePath} in shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
}

/**
 * Rename a file in all shards via workers.
 */
export async function renameFileInAllShardsAsync(oldPath: string, newPath: string): Promise<number> {
  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'rename-file', shardId: shard.id, oldPath, newPath })
      .then(result => {
        if (result.type === 'rename-complete' && result.changes) {
          log.info(`[ShardManager] Renamed file ${oldPath} → ${newPath} in shard ${shard.id}`)
          return 1
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to rename file in shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
}

/**
 * Rename all files under a folder in all shards via workers.
 */
export async function renameFolderContentsInAllShardsAsync(oldFolderPath: string, newFolderPath: string): Promise<number> {
  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'rename-folder', shardId: shard.id, oldFolderPath, newFolderPath })
      .then(result => {
        if (result.type === 'rename-complete' && result.changes) {
          log.info(`[ShardManager] Renamed ${result.changes} files under ${oldFolderPath} in shard ${shard.id}`)
          return result.changes
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to rename folder in shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
}

/**
 * Cleanup orphaned files from all shards.
 * Deletes files whose path doesn't start with any of the valid prefixes.
 */
export async function cleanupOrphanedFilesAsync(validPrefixes: string[]): Promise<number> {
  if (validPrefixes.length === 0) {
    return 0
  }

  // 归一化前缀
  const normalizedPrefixes = validPrefixes.map(p => p.replace(/\\/g, '/').replace(/\/$/, '') + '/')

  const readyShards = getReadyShards()
  const promises = readyShards.map(shard => {
    return sendToWorker(shard.id, { type: 'cleanup-orphaned', shardId: shard.id, validPrefixes: normalizedPrefixes })
      .then(result => {
        if (result.type === 'cleanup-complete') {
          // 更新内存中的 fileCount
          if (result.fileCount !== undefined) {
            shard.fileCount = result.fileCount
          }
          if (result.changes) {
            log.info(`[ShardManager] Cleanup removed ${result.changes} orphaned files from shard ${shard.id}`)
          }
          return result.changes ?? 0
        }
        return 0
      })
      .catch(err => {
        log.warn(`[ShardManager] Failed to cleanup orphaned files in shard ${shard.id}:`, err)
        return 0
      })
  })
  const results = await Promise.all(promises)
  return results.reduce((sum, count) => sum + count, 0)
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

/**
 * Deduplicate search results by hash.
 * Groups results by hash and keeps the entry with the latest updated_at.
 * Files without a hash are grouped by path (each path is unique anyway).
 */
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>()
  for (const r of results) {
    const key = r.hash || r.path
    if (!key) {
      seen.set(r.path, r)
      continue
    }
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, r)
    } else {
      const existingTime = existing.updated_at || ''
      const newTime = r.updated_at || ''
      if (newTime > existingTime) {
        seen.set(key, r)
      }
    }
  }
  return Array.from(seen.values())
}

// Export types for use by other modules
export type { Database }

/**
 * Get file count and total size for a specific folder path across all shards.
 * Used to sync shard stats back to config.db after a scan completes.
 */
export function getFolderStatsFromShards(folderPath: string): { fileCount: number; totalSize: number } {
  const prefix = folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
  let totalCount = 0
  let totalSize = 0
  const readyShards = getReadyShards()
  log.info(`[ShardManager] getFolderStatsFromShards: folder="${folderPath}", prefix="${prefix}", readyShards=${readyShards.length}`)
  for (const shard of readyShards) {
    try {
      const db = new Database(shard.dbPath, { readonly: true })
      const stmt = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM shard_files WHERE path LIKE ? || '%'")
      const row = stmt.get(prefix) as { count: number; total_size: number } | undefined
      if (row) {
        totalCount += row.count
        totalSize += row.total_size
        log.info(`[ShardManager] getFolderStatsFromShards: shard ${shard.id} matched ${row.count} files`)
      }
      db.close()
    } catch (err) {
      log.warn(`[ShardManager] getFolderStatsFromShards failed on shard ${shard.id}:`, err)
    }
  }
  log.info(`[ShardManager] getFolderStatsFromShards: total=${totalCount} files, size=${totalSize}`)
  return { fileCount: totalCount, totalSize }
}
