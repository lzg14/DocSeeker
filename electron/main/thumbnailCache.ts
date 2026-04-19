/**
 * ThumbnailCache — LRU disk cache for file thumbnails.
 *
 * Features:
 * - Stores thumbnail images on disk under a configurable cache directory
 * - Uses SHA256(filePath + mtimeMs) truncated to 16 hex chars as the cache key
 * - Evicts the least-recently-accessed (oldest atime) entries when total size exceeds maxSize
 * - Fully synchronous I/O for simplicity and reliability
 *
 * Storage layout:
 *   <cacheDir>/
 *     <hash0>  — raw image bytes
 *     <hash1>
 *     ...
 *
 * The hash is derived from the source file's path and modification time,
 * so the same file always maps to the same cache entry.
 */

import { createHash } from 'crypto'
import { join, resolve } from 'path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmdirSync,
} from 'fs'

export class ThumbnailCache {
  private readonly cacheDir: string
  private readonly maxSize: number

  /**
   * @param cacheDir  Absolute path to the cache root directory.
   *                  Will be created automatically if it does not exist.
   * @param maxSize   Maximum total byte size of all cached files.
   *                  Eviction is triggered after each `set` call.
   */
  constructor(cacheDir: string, maxSize: number) {
    this.cacheDir = resolve(cacheDir)
    this.maxSize = maxSize
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  /**
   * Compute the cache key for a given file.
   * Key = first 16 hex chars of SHA256(filePath + mtimeMs).
   */
  private hashForFile(filePath: string, mtimeMs: number): string {
    const hash = createHash('sha256')
    hash.update(filePath)
    hash.update(String(mtimeMs))
    return hash.digest('hex').slice(0, 16)
  }

  /**
   * Store thumbnail data for a file.
   * Automatically evicts old entries if total size would exceed maxSize.
   *
   * @param filePath  Absolute path to the source file (used for key derivation).
   * @param data      Raw thumbnail bytes (e.g. PNG / JPEG buffer).
   * @returns The 16-char hex cache key that can be passed to `get`.
   */
  set(filePath: string, data: Buffer): string {
    const mtimeMs = statSync(filePath).mtimeMs
    const key = this.hashForFile(filePath, mtimeMs)
    const filePath_ = join(this.cacheDir, key)

    writeFileSync(filePath_, data)

    // Evict if over limit
    this.evictIfOverLimit()

    return key
  }

  /**
   * Retrieve cached thumbnail data by cache key.
   *
   * @param hash  16-char hex key returned by `set`.
   * @returns The stored Buffer, or null if the key does not exist.
   */
  get(hash: string): Buffer | null {
    const filePath_ = join(this.cacheDir, hash)
    if (!existsSync(filePath_)) {
      return null
    }
    // Touch atime (read does this automatically, but be explicit)
    try {
      const mtime = statSync(filePath_).mtime
      // Update atime by rewriting — cross-platform safe
      const data = readFileSync(filePath_)
      writeFileSync(filePath_, data)
      return data
    } catch {
      return null
    }
  }

  /**
   * Remove every cached file inside the cache directory.
   */
  clear(): void {
    if (!existsSync(this.cacheDir)) return
    for (const name of readdirSync(this.cacheDir)) {
      try {
        unlinkSync(join(this.cacheDir, name))
      } catch {}
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Calculate total size of all cache files.
   * Returns 0 if the directory does not exist.
   */
  private totalSize(): number {
    if (!existsSync(this.cacheDir)) return 0
    let size = 0
    for (const name of readdirSync(this.cacheDir)) {
      try {
        size += statSync(join(this.cacheDir, name)).size
      } catch {}
    }
    return size
  }

  /**
   * Remove least-recently-accessed (oldest atime) files until total size <= maxSize.
   *
   * On Windows the atime resolution is limited (~1 hour) but still
   * provides meaningful ordering for cache eviction.
   */
  private evictIfOverLimit(): void {
    let currentSize = this.totalSize()
    if (currentSize <= this.maxSize) return

    interface Entry {
      path: string
      atime: number
      size: number
    }
    const entries: Entry[] = []

    for (const name of readdirSync(this.cacheDir)) {
      try {
        const fullPath = join(this.cacheDir, name)
        const s = statSync(fullPath)
        entries.push({ path: fullPath, atime: s.atimeMs, size: s.size })
      } catch {}
    }

    entries.sort((a, b) => a.atime - b.atime)

    for (const entry of entries) {
      if (currentSize <= this.maxSize) break
      try {
        unlinkSync(entry.path)
        currentSize -= entry.size
      } catch {}
    }
  }
}
