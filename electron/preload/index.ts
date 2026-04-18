import { contextBridge, ipcRenderer } from 'electron'

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
  match_type?: 'filename' | 'content' | 'both'
}

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  phase: 'scanning' | 'processing' | 'complete'
  estimatedTimeRemaining?: number
  errorStats?: ErrorStats
}

export interface ErrorStats {
  timeout: number
  sizeLimit: number
  invalidHeader: number
  corrupted: number
  permission: number
  unknown: number
}

export interface ScanResult {
  success: boolean
  filesProcessed: number
  errors: string[]
  skipped?: number
  errorStats?: ErrorStats
  totalTime?: number
}

export interface ScannedFolder {
  id?: number
  path: string
  name: string
  last_scan_at?: string
  last_full_scan_at?: string | null
  file_count?: number
  total_size?: number
  schedule_enabled?: number
  schedule_day?: string | null
  schedule_time?: string | null
}

export interface IncrementalScanResult {
  success: boolean
  filesProcessed: number
  skipped: number
  errors: string[]
}

export interface SearchHistoryEntry {
  id?: number
  query: string
  searched_at?: string
}

export interface SavedSearch {
  id?: number
  name: string
  query: string
  created_at?: string
}

export interface SearchOptions {
  fileTypes?: string[]
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
}

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  searchFiles: (query: string) => Promise<FileRecord[]>
  searchFilesAdvanced: (query: string, options?: SearchOptions) => Promise<FileRecord[]>
  searchByFileName: (query: string, options?: SearchOptions) => Promise<FileRecord[]>
  deleteFile: (filePath: string) => Promise<boolean>
  getFileCount: () => Promise<number>
  getFilesByFolder: () => Promise<Record<string, number>>
  showInFolder: (filePath: string) => Promise<void>
  openFile: (filePath: string) => Promise<void>
  getScannedFolders: () => Promise<ScannedFolder[]>
  addScannedFolder: (folderPath: string) => Promise<ScannedFolder | null>
  deleteScannedFolder: (id: number) => Promise<void>
  incrementalScan: (folderPath: string) => Promise<IncrementalScanResult>
  fullRescan: (folderPath: string) => Promise<ScanResult>
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => () => void
  onShowCloseConfirm: (callback: () => void) => () => void
  // Search history & saved searches
  getSearchHistory: () => Promise<SearchHistoryEntry[]>
  clearSearchHistory: () => Promise<void>
  getSearchSnippets: (query: string, filePaths: string[]) => Promise<Record<string, string>>
  getSavedSearches: () => Promise<SavedSearch[]>
  addSavedSearch: (name: string, query: string) => Promise<number>
  deleteSavedSearch: (id: number) => Promise<void>
  extractFileContent: (filePath: string) => Promise<string | null>
  // Floating window
  hideFloatingWindow: () => Promise<void>
  // Global hotkey
  getGlobalHotkey: () => Promise<string>
  setGlobalHotkey: (hotkey: string) => Promise<void>
  // Scan settings
  getScanSettings: () => Promise<any>
  updateScanSettings: (settings: any) => Promise<void>
  // Auto update
  checkForUpdate: () => Promise<string | null>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  isDatabaseReady: () => Promise<boolean>
  onUpdateStatus: (callback: (info: { status: string; version?: string; error?: string }) => void) => () => void
  // Silent start
  isSilentStart: () => boolean
  // Window
  minimizeToTray: () => Promise<void>
  // Shard info (diagnostics)
  getShardInfo: () => Promise<any>
  // System paths
  getSystemPaths: () => Promise<{ documents: string; desktop: string }>
}

const electronAPI: ElectronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('scan-progress', handler)
    }
  },

  searchFiles: (query: string) => ipcRenderer.invoke('search-files', query),

  searchFilesAdvanced: (query: string, options?: SearchOptions) => ipcRenderer.invoke('search-files-advanced', query, options),

  searchByFileName: (query: string, options?: SearchOptions) => ipcRenderer.invoke('search-by-filename', query, options),

  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),

  getFileCount: () => ipcRenderer.invoke('get-file-count'),

  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),

  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),

  getScannedFolders: () => ipcRenderer.invoke('get-scanned-folders'),

  addScannedFolder: (folderPath: string) => ipcRenderer.invoke('add-scanned-folder', folderPath),

  deleteScannedFolder: (id: number) => ipcRenderer.invoke('delete-scanned-folder', id),

  incrementalScan: (folderPath: string) => ipcRenderer.invoke('incremental-scan', folderPath),

  fullRescan: (folderPath: string) => ipcRenderer.invoke('full-rescan', folderPath),

  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),

  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),

  closeWindow: () => ipcRenderer.invoke('window-close'),

  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  onWindowMaximized: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximized-changed', handler)
    return () => {
      ipcRenderer.removeListener('window-maximized-changed', handler)
    }
  },

  onShowCloseConfirm: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on('show-close-confirm', handler)
    return () => {
      ipcRenderer.removeListener('show-close-confirm', handler)
    }
  },

  getSearchHistory: () => ipcRenderer.invoke('get-search-history'),

  clearSearchHistory: () => ipcRenderer.invoke('clear-search-history'),

  getSearchSnippets: (query: string, filePaths: string[]) => ipcRenderer.invoke('get-search-snippets', query, filePaths),

  getSavedSearches: () => ipcRenderer.invoke('get-saved-searches'),

  addSavedSearch: (name: string, query: string) => ipcRenderer.invoke('add-saved-search', name, query),

  deleteSavedSearch: (id: number) => ipcRenderer.invoke('delete-saved-search', id),

  extractFileContent: (filePath: string) => ipcRenderer.invoke('extract-file-content', filePath),

  hideFloatingWindow: () => ipcRenderer.invoke('window-hide-floating'),

  getGlobalHotkey: () => ipcRenderer.invoke('get-global-hotkey'),

  setGlobalHotkey: (hotkey: string) => ipcRenderer.invoke('set-global-hotkey', hotkey),

  getScanSettings: () => ipcRenderer.invoke('get-scan-settings'),

  updateScanSettings: (settings: any) => ipcRenderer.invoke('update-scan-settings', settings),

  checkForUpdate: () => ipcRenderer.invoke('update-check'),

  downloadUpdate: () => ipcRenderer.invoke('update-download'),

  quitAndInstall: () => ipcRenderer.invoke('update-install'),

  onUpdateStatus: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, info: { status: string; version?: string; error?: string }) => {
      callback(info)
    }
    ipcRenderer.on('update-status', handler)
    return () => {
      ipcRenderer.removeListener('update-status', handler)
    }
  },

  isDatabaseReady: () => ipcRenderer.invoke('db-is-ready'),

  minimizeToTray: () => ipcRenderer.invoke('window-minimize-to-tray'),

  isSilentStart: () => process.argv.includes('--startup'),

  getShardInfo: () => ipcRenderer.invoke('get-shard-info'),

  getSystemPaths: () => ipcRenderer.invoke('get-system-paths'),
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
