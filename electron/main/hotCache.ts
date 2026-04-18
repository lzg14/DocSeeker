/**
 * Hot Cache (db/hot-cache.json)
 *
 * LFU (Least Frequently Used) cache for frequently-searched results.
 * - Tracks access frequency per query
 * - Evicts least-frequently-used queries when limit exceeded
 * - Persists both cached results and access stats
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log/main'

export interface HotCacheEntry {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  created_at?: string
  updated_at?: string
}

export interface HotCache {
  [query: string]: HotCacheEntry[]
}

interface PersistedCache {
  cache: HotCache
  stats: Record<string, number>  // query → access count
}

const MAX_ENTRIES_PER_QUERY = 50
const MAX_CACHED_QUERIES = 100

let cache: HotCache = {}
let queryStats: Record<string, number> = {}  // query → access count
let statsDirty = false  // only persist when stats actually change

function getHotCachePath(): string {
  return join(app.getPath('userData'), 'db', 'hot-cache.json')
}

function ensureDir(): void {
  const dir = join(app.getPath('userData'), 'db')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function persist(): void {
  if (!statsDirty) return
  try {
    ensureDir()
    const data: PersistedCache = { cache, stats: queryStats }
    writeFileSync(getHotCachePath(), JSON.stringify(data), 'utf-8')
    statsDirty = false
  } catch (err) {
    log.warn('[HotCache] Failed to write hot cache:', err)
  }
}

/**
 * Initialize hot cache — load from JSON file into memory.
 */
export function initHotCache(): void {
  const cachePath = getHotCachePath()
  try {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, 'utf-8')
      const data = JSON.parse(raw) as PersistedCache
      cache = data.cache ?? {}
      queryStats = data.stats ?? {}
    }
  } catch {}
  log.info(`[HotCache] Initialized, ${Object.keys(cache).length} cached queries, LFU strategy`)
}

/**
 * Persist and close hot cache.
 */
export function closeHotCache(): void {
  persist()
  log.info('[HotCache] Closed')
}

/**
 * Get cached search results for a query.
 * Increments the access frequency for this query (LFU tracking).
 */
export function getHotResults(query: string): HotCacheEntry[] | undefined {
  const results = cache[query]
  if (results) {
    // Increment access frequency (LFU)
    queryStats[query] = (queryStats[query] ?? 0) + 1
    statsDirty = true
    // Async persist to avoid blocking
    setImmediate(() => persist())
  }
  return results
}

/**
 * Store search results for a query.
 * Uses LFU eviction: removes the least-frequently-used query when limit exceeded.
 */
export function setHotResults(query: string, results: HotCacheEntry[]): void {
  cache[query] = results.slice(0, MAX_ENTRIES_PER_QUERY)

  const queries = Object.keys(cache)
  if (queries.length > MAX_CACHED_QUERIES) {
    // Find the query with the lowest access frequency
    let minFreq = Infinity
    let lfuQuery = queries[0]
    for (const q of queries) {
      const freq = queryStats[q] ?? 0
      if (freq < minFreq) {
        minFreq = freq
        lfuQuery = q
      }
    }
    // Evict the LFU entry
    delete cache[lfuQuery]
    delete queryStats[lfuQuery]
    log.info(`[HotCache] LFU eviction: "${lfuQuery}" (freq=${minFreq})`)
  }

  statsDirty = true
  persist()
}

/**
 * Clear all hot cache entries.
 */
export function clearHotCache(): void {
  cache = {}
  queryStats = {}
  persist()
  log.info('[HotCache] Cleared')
}
