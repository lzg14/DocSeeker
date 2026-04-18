/**
 * Database Module (shard-compatible)
 *
 * With the shard architecture, file data is stored in db/shards/shard_N.db files.
 * This module provides the old API surface by routing to the shard manager,
 * while also managing the meta database (scanned folders, search history, settings).
 *
 * The old file-manager.db is replaced by multiple shard_N.db files.
 * The scanned_folders, search_history, saved_searches, and scan_settings tables
 * are now stored in db/meta.db (managed by meta.ts).
 */

import { initMetaDatabase, closeMetaDatabase } from './meta'
import {
  initShardManager,
  searchAllShards,
  getSearchSnippets as shardGetSearchSnippets,
  getTotalFileCount,
  closeAllShards,
  type SearchOptions
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
  getScanSettings,
  updateScanSettings,
  type ScannedFolder,
  type SavedSearch,
  type SearchHistoryEntry
} from './meta'
import log from 'electron-log/main'

export async function initDatabase(): Promise<void> {
  log.info('[Database] Initializing shard-compatible database...')

  // Initialize meta database (scanned folders, settings, history)
  initMetaDatabase()

  // Initialize shard manager and load existing shards
  await initShardManager()

  log.info('[Database] Database initialized')
}

export function closeDatabase(): void {
  closeAllShards()
  closeMetaDatabase()
  log.info('[Database] Database closed')
}

// ============ Re-export types and functions from meta ============

export type { ScannedFolder, SavedSearch, SearchHistoryEntry, SearchOptions, SearchResult }

export {
  searchByFileName
} from './shardManager'

// Note: scanned_folders operations are now in meta.ts
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
  getScanSettings,
  updateScanSettings
} from './meta'

// ============ File operations (via shard manager) ============

export interface FileRecord {
  id?: number
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string | null
  content: string | null
  created_at?: string
  updated_at?: string
  is_supported?: boolean
  match_type?: 'content' | 'filename' | 'both'
}

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

export function deleteFileByPath(filePath: string): void {
  log.warn('[Database] deleteFileByPath not yet implemented in shard mode')
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

export function removeFilesByFolderPath(folderPath: string): void {
  log.warn('[Database] removeFilesByFolderPath not yet implemented in shard mode')
}

export function getFileCountByFolder(folderPath: string): number {
  // Not directly supported; would require scanning all shards
  return 0
}

export function getTotalSizeByFolder(folderPath: string): number {
  return 0
}
