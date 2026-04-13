// 统一的类型定义文件

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

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  phase: 'scanning' | 'processing' | 'complete'
}

export type PageTab = 'scan' | 'search' | 'language' | 'guide'
