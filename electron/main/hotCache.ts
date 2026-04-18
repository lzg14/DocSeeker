/**
 * Hot Cache (db/hot-cache.json)
 *
 * Stores frequently-searched results for fast retrieval without hitting shards.
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

const MAX_ENTRIES_PER_QUERY = 50
const MAX_CACHED_QUERIES = 100

let cache: HotCache = {}

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
  try {
    ensureDir()
    writeFileSync(getHotCachePath(), JSON.stringify(cache), 'utf-8')
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
      cache = JSON.parse(raw) as HotCache
    }
  } catch {}
  log.info(`[HotCache] Initialized, ${Object.keys(cache).length} entries`)
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
 */
export function getHotResults(query: string): HotCacheEntry[] | undefined {
  return cache[query]
}

/**
 * Store search results for a query.
 */
export function setHotResults(query: string, results: HotCacheEntry[]): void {
  cache[query] = results.slice(0, MAX_ENTRIES_PER_QUERY)

  const queries = Object.keys(cache)
  if (queries.length > MAX_CACHED_QUERIES) {
    const toRemove = queries.slice(MAX_CACHED_QUERIES)
    for (const key of toRemove) {
      delete cache[key]
    }
  }

  persist()
}

/**
 * Clear all hot cache entries.
 */
export function clearHotCache(): void {
  cache = {}
  persist()
  log.info('[HotCache] Cleared')
}
