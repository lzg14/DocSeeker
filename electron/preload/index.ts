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
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  searchFiles: (query: string) => Promise<FileRecord[]>
  deleteFile: (filePath: string) => Promise<boolean>
  getFileCount: () => Promise<number>
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
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
