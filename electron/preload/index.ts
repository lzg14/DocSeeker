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
}

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  phase: 'scanning' | 'processing' | 'complete'
}

export interface ScanResult {
  success: boolean
  filesProcessed: number
  errors: string[]
  skipped?: number
}

export interface ScannedFolder {
  id?: number
  path: string
  name: string
  last_scan_at?: string
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

export interface SearchOptions {
  fileTypes?: string[]
  dateFrom?: string
  dateTo?: string
  limit?: number
}

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  scanDirectory: (dirPath: string) => Promise<ScanResult>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  getAllFiles: () => Promise<FileRecord[]>
  searchFiles: (query: string, options?: SearchOptions) => Promise<FileRecord[]>
  deleteFile: (filePath: string) => Promise<boolean>
  findDuplicates: () => Promise<FileRecord[][]>
  clearAllFiles: () => Promise<void>
  getFileCount: () => Promise<number>
  showInFolder: (filePath: string) => Promise<void>
  openFile: (filePath: string) => Promise<void>
  getScannedFolders: () => Promise<ScannedFolder[]>
  getScheduledFolders: () => Promise<ScannedFolder[]>
  addScannedFolder: (folderPath: string) => Promise<ScannedFolder | null>
  updateFolderSchedule: (id: number, enabled: boolean, day: string | null, time: string | null) => Promise<void>
  deleteScannedFolder: (id: number) => Promise<void>
  updateFolderAfterScan: (folderPath: string, scanResult: { filesProcessed: number }) => Promise<void>
  incrementalScan: (folderPath: string) => Promise<IncrementalScanResult>
  fullRescan: (folderPath: string) => Promise<ScanResult>
  onScheduledScanComplete: (callback: (data: { folderPath: string; newFiles: number; modifiedFiles: number }) => void) => () => void
  pauseScan: () => Promise<void>
  resumeScan: () => Promise<void>
  cancelScan: () => Promise<{ success: boolean; filesProcessed: number }>
  isScanning: () => Promise<{ scanning: boolean; paused: boolean }>
  onScanPaused: (callback: (data: { paused: boolean }) => void) => () => void
  onScanCancelled: (callback: (data: { cancelled: boolean }) => void) => () => void
}

const electronAPI: ElectronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  scanDirectory: (dirPath: string) => ipcRenderer.invoke('scan-directory', dirPath),

  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('scan-progress', handler)
    }
  },

  getAllFiles: () => ipcRenderer.invoke('get-all-files'),

  searchFiles: (query: string, options?: SearchOptions) => ipcRenderer.invoke('search-files', query, options),

  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),

  findDuplicates: () => ipcRenderer.invoke('find-duplicates'),

  clearAllFiles: () => ipcRenderer.invoke('clear-all-files'),

  getFileCount: () => ipcRenderer.invoke('get-file-count'),

  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),

  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),

  getScannedFolders: () => ipcRenderer.invoke('get-scanned-folders'),

  getScheduledFolders: () => ipcRenderer.invoke('get-scheduled-folders'),

  addScannedFolder: (folderPath: string) => ipcRenderer.invoke('add-scanned-folder', folderPath),

  updateFolderSchedule: (id: number, enabled: boolean, day: string | null, time: string | null) =>
    ipcRenderer.invoke('update-folder-schedule', id, enabled, day, time),

  deleteScannedFolder: (id: number) => ipcRenderer.invoke('delete-scanned-folder', id),

  updateFolderAfterScan: (folderPath: string, scanResult: { filesProcessed: number }) =>
    ipcRenderer.invoke('update-folder-after-scan', folderPath, scanResult),

  incrementalScan: (folderPath: string) => ipcRenderer.invoke('incremental-scan', folderPath),

  fullRescan: (folderPath: string) => ipcRenderer.invoke('full-rescan', folderPath),

  onScheduledScanComplete: (callback: (data: { folderPath: string; newFiles: number; modifiedFiles: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { folderPath: string; newFiles: number; modifiedFiles: number }): void => {
      callback(data)
    }
    ipcRenderer.on('scheduled-scan-complete', handler)
    return () => {
      ipcRenderer.removeListener('scheduled-scan-complete', handler)
    }
  },

  pauseScan: () => ipcRenderer.invoke('pause-scan'),

  resumeScan: () => ipcRenderer.invoke('resume-scan'),

  cancelScan: () => ipcRenderer.invoke('cancel-scan'),

  isScanning: () => ipcRenderer.invoke('is-scanning'),

  onScanPaused: (callback: (data: { paused: boolean }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { paused: boolean }): void => {
      callback(data)
    }
    ipcRenderer.on('scan-paused', handler)
    return () => {
      ipcRenderer.removeListener('scan-paused', handler)
    }
  },

  onScanCancelled: (callback: (data: { cancelled: boolean }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { cancelled: boolean }): void => {
      callback(data)
    }
    ipcRenderer.on('scan-cancelled', handler)
    return () => {
      ipcRenderer.removeListener('scan-cancelled', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
