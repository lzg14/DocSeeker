/**
 * Database Module (shard-compatible)
 *
 * With the shard architecture, file data is stored in shards/shard_N.db files.
 * App settings are stored in config.json (config.ts).
 * Folder metadata and search history are stored in meta.db (meta.ts).
 *
 * Storage layout:
 *   - config.json  — scan settings, app settings (theme, language, hotkey, etc.)
 *   - meta.db      — scanned folders, search history, saved searches
 *   - shards/      — file records split across multiple shard_N.db files
 */

import { initConfig, closeConfig } from './config'
import { initMeta, closeMeta } from './meta'
import {
  initShardManager,
  searchAllShards,
  getSearchSnippets as shardGetSearchSnippets,
  getTotalFileCount,
  deleteFileFromAllShardsAsync,
  deleteFilesByFolderPrefixFromAllShardsAsync,
  closeAllShards,
  getFolderStatsFromShards,
  type SearchOptions,
  type SearchResult,
  type FileRecord
} from './shardManager'
import {
  getAllScannedFolders,
  getScannedFolderByPath,
  getScannedFolderById,
  addScannedFolder,
  deleteScannedFolder,
  updateFolderScanComplete,
  updateFolderFullScanComplete,
  updateScannedFolder,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addSavedSearch,
  getSavedSearches,
  deleteSavedSearch,
  type ScannedFolder,
  type SavedSearch,
  type SearchHistoryEntry
} from './meta'
import { getScanSettings, updateScanSettings } from './config'
import log from 'electron-log/main'

export async function initDatabase(): Promise<void> {
  log.info('[Database] Initializing...')

  // Initialize config database first (scan settings, app settings including dataPath)
  initConfig()

  // Initialize meta database (scanned folders, search history, saved searches)
  // NOTE: initConfig() must run BEFORE initMeta() so getDataPath() returns the correct path
  initMeta()

  // NOTE: do NOT await initShardManager() here — shard loading is lazy,
  // it happens on first search in searchAllShards() to keep UI responsive.

  log.info('[Database] Database initialized')
}

export function closeDatabase(): void {
  closeAllShards()
  closeConfig()
  closeMeta()
  log.info('[Database] Closed')
}

// ============ Re-export types and functions ============

// Types from shardManager (re-exported here for backward compatibility)
export type { SearchResult, SearchOptions, FuzzySearchResult } from './shardManager'

// Types from meta
export type { ScannedFolder, SavedSearch, SearchHistoryEntry, Tag } from './meta'

export {
  searchByFileName
} from './shardManager'

// Note: scanned_folders operations are in meta.ts
// These are re-exported here for backward compatibility with ipc.ts
export {
  getAllScannedFolders,
  getScannedFolderByPath,
  getScannedFolderById,
  addScannedFolder,
  deleteScannedFolder,
  updateFolderScanComplete,
  updateFolderFullScanComplete,
  updateScannedFolder,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addSavedSearch,
  getSavedSearches,
  deleteSavedSearch,
  addTag,
  getAllTags,
  updateTag,
  deleteTag,
  addFileTag,
  removeFileTag,
  getTagsForFile,
  getFilesWithTag,
  getAllFileTags
} from './meta'

export { getScanSettings, updateScanSettings } from './config'

// Re-export FileRecord from shardManager for backward compatibility
export type { FileRecord } from './shardManager'

// ============ File operations (via shard manager) ============

export function insertFile(file: FileRecord): number {
  // In shard mode, inserts go through the IPC handler which manages shards.
  // This function is kept for backward compatibility with legacy code paths.
  log.warn('[Database] insertFile called — single-file insert in shard mode is not efficient, use batching')
  return 0
}

export function updateFile(id: number, file: Partial<FileRecord>): void {
  // Shard-based architecture doesn't support in-place updates easily
  // For now, we log a warning; the scan worker handles updates via delete + insert
  log.warn('[Database] updateFile called in shard mode — updates require re-scan')
}

export function deleteFile(id: number): void {
  log.warn('[Database] deleteFile not yet implemented in shard mode')
}

export async function deleteFileByPath(filePath: string): Promise<void> {
  const count = await deleteFileFromAllShardsAsync(filePath)
  if (count > 0) {
    log.info(`[Database] Deleted file ${filePath} from ${count} shard(s)`)
  }
}

export function getFileByPath(filePath: string): FileRecord | undefined {
  // Not directly supported in shard architecture
  // This would require searching all shards
  return undefined
}

export function getAllFiles(): FileRecord[] {
  // Not supported in shard architecture
  return []
}

export function clearAllFiles(): void {
  log.warn('[Database] clearAllFiles not yet implemented in shard mode')
}

export function getFileCount(): number {
  return getTotalFileCount()
}

// Shard-aware search
export function searchFiles(query: string): FileRecord[] {
  // This is async but we return Promise; ipc.ts already handles async
  // We'll make it work by returning empty array and using searchFilesAsync
  return []
}

export async function searchFilesAsync(query: string): Promise<FileRecord[]> {
  const results = await searchAllShards(query)
  return results.map(r => ({
    id: r.id,
    path: r.path,
    name: r.name,
    size: r.size,
    hash: r.hash,
    file_type: r.file_type,
    content: r.content,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
    match_type: r.match_type
  }))
}

export function searchFilesAdvanced(query: string, options?: SearchOptions): FileRecord[] {
  return []
}

export async function searchFilesAdvancedAsync(query: string, options?: SearchOptions): Promise<FileRecord[]> {
  const results = await searchAllShards(query, options)
  return results.map(r => ({
    id: r.id,
    path: r.path,
    name: r.name,
    size: r.size,
    hash: r.hash,
    file_type: r.file_type,
    content: r.content,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_supported: r.is_supported === 1 ? true : r.is_supported === 0 ? false : undefined,
    match_type: r.match_type
  }))
}

export function getSearchSnippets(query: string, fileIds: number[]): Map<number, string> {
  // fileIds are not useful in shard architecture — use paths instead
  // This is a simplified implementation
  return new Map()
}

export async function getSearchSnippetsAsync(filePaths: string[], query: string): Promise<Record<string, string>> {
  return shardGetSearchSnippets(query, filePaths)
}

export async function removeFilesByFolderPath(folderPath: string): Promise<void> {
  const total = await deleteFilesByFolderPrefixFromAllShardsAsync(folderPath)
  if (total > 0) {
    log.info(`[Database] Deleted ${total} files under ${folderPath}`)
  }
}

export function getFileCountByFolder(folderPath: string): number {
  // Not directly supported; would require scanning all shards
  return 0
}

export function getTotalSizeByFolder(folderPath: string): number {
  return 0
}

/**
 * Sum file_count from all scanned folders in meta.db — the single source of truth
 * for the total file count shown in the UI.
 */
export function getTotalFileCountFromConfig(): number {
  const folders = getAllScannedFolders()
  return folders.reduce((sum, f) => sum + (f.file_count ?? 0), 0)
}

/**
 * Re-export getFolderStatsFromShards for use by ipc.ts without circular imports.
 */
export { getFolderStatsFromShards }
