/**
 * Image thumbnail generation module.
 *
 * Uses Electron's nativeImage to load image files, resize them to a
 * fixed maximum dimension (200px), and cache the result on disk via
 * ThumbnailCache (LRU, max 50 MB).
 *
 * Public API:
 *   isImageFile(ext)  — check if extension is supported
 *   getImageThumbnail(filePath) — get base64 PNG or null
 */

import { nativeImage, app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import { ThumbnailCache } from './thumbnailCache'

const THUMB_DIR = join(app.getPath('userData'), 'thumbnails')
export const THUMB_CACHE = new ThumbnailCache(THUMB_DIR, 50 * 1024 * 1024)

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.webp', '.ico', '.tiff', '.tif'
])

/**
 * Returns true when the given file extension (including the leading dot)
 * corresponds to a supported image format.
 */
export function isImageFile(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase())
}

/**
 * Compute the 16-char hex cache key for a file.
 * Matches ThumbnailCache.hashForFile: SHA256(filePath + mtimeMs) truncated to 16 hex chars.
 */
function hashForFile(filePath: string, mtimeMs: number): string {
  const hash = createHash('sha256')
  hash.update(filePath)
  hash.update(String(mtimeMs))
  return hash.digest('hex').slice(0, 16)
}

/**
 * Returns a data URL (data:image/png;base64,...) for the given image file,
 * or null if the file cannot be loaded / is not an image.
 *
 * Cache strategy:
 *   1. Look up by hash(filePath + mtimeMs). If hit, return cached base64 directly.
 *   2. Load with nativeImage, resize to 200x200 (quality: 'good'), convert to PNG.
 *   3. Store PNG bytes in ThumbnailCache (key = 16-char hash).
 *   4. Return base64 data URL.
 */
export function getImageThumbnail(filePath: string): string | null {
  try {
    const mtimeMs = fs.statSync(filePath).mtimeMs
    const key = hashForFile(filePath, mtimeMs)

    // 1. Cache hit
    const cached = THUMB_CACHE.get(key)
    if (cached !== null) {
      return `data:image/png;base64,${cached.toString('base64')}`
    }

    // 2. Load and resize
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return null

    const resized = image.resize({ width: 200, height: 200, quality: 'good' })
    const pngBuffer = resized.toPNG()

    // 3. Store in cache
    THUMB_CACHE.set(filePath, pngBuffer)

    // 4. Return data URL
    return `data:image/png;base64,${pngBuffer.toString('base64')}`
  } catch {
    return null
  }
}
