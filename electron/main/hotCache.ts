/**
 * Hot Cache (db/hot-cache.json)
 *
 * Stores frequently-searched results for fast retrieval without hitting shards.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
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
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getHotCachePath(): string {
  return join(app.getPath('userData'), 'db', 'hot-cache.json')
}

function readCache(): HotCache {
  try {
    const cachePath = getHotCachePath()
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, 'utf-8')
      return JSON.parse(raw) as HotCache
    }
  } catch {}
  return {}
}

function writeCache(cache: HotCache): void {
  try {
    const cachePath = getHotCachePath()
    const dir = join(app.getPath('userData'), 'db')
    if (!existsSync(dir)) {
      const { mkdirSync } = require('fs')
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
  } catch (err) {
    log.warn('[HotCache] Failed to write hot cache:', err)
  }
}

/**
 * Get cached search results for a query.
 * Returns undefined if not in cache or cache is stale.
 */
export function getHotResults(query: string): HotCacheEntry[] | undefined {
  const cache = readCache()
  const entry = cache[query]
  return entry
}

/**
 * Store search results for a query.
 */
export function setHotResults(query: string, results: HotCacheEntry[]): void {
  const cache = readCache()

  // Limit entries per query
  cache[query] = results.slice(0, MAX_ENTRIES_PER_QUERY)

  // Prune old entries if cache is too large
  const queries = Object.keys(cache)
  if (queries.length > MAX_CACHED_QUERIES) {
    const sorted = queries.sort((a, b) => 0) // Keep existing order
    const toRemove = queries.slice(MAX_CACHED_QUERIES)
    for (const key of toRemove) {
      delete cache[key]
    }
  }

  writeCache(cache)
}

/**
 * Clear all hot cache entries.
 */
export function clearHotCache(): void {
  writeCache({})
  log.info('[HotCache] Cleared')
}
