import log from 'electron-log/main'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {
  deleteFileFromAllShards,
  renameFileInAllShards,
  updateFileContentInAllShards,
  renameFolderContentsInAllShards,
  deleteFilesByFolderPrefixFromAllShards,
  openNextShard,
  insertFileBatch,
} from './shardManager'
import { extractContent } from './scanner'

type UsnEventType =
  | 'created' | 'modified' | 'deleted' | 'renamed'
  | 'folder_created' | 'folder_deleted' | 'folder_renamed'

interface UsnEvent {
  event: UsnEventType
  path: string
  volume: string
  timestamp: number
  oldPath?: string
}

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.pdf', '.rtf', '.chm', '.odt', '.ods', '.odp',
  '.epub', '.zip', '.mbox', '.eml',
  '.wps', '.wpp', '.et', '.dps',
])

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

function getFileType(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text', '.md': 'text', '.json': 'text', '.xml': 'text', '.csv': 'text',
    '.doc': 'docx', '.docx': 'docx',
    '.xls': 'xlsx', '.xlsx': 'xlsx',
    '.ppt': 'pptx', '.pptx': 'pptx',
    '.pdf': 'pdf', '.rtf': 'rtf', '.chm': 'chm',
    '.odt': 'odf', '.ods': 'odf', '.odp': 'odf',
    '.epub': 'epub',
    '.zip': 'archive', '.mbox': 'mail', '.eml': 'mail',
    '.wps': 'wps', '.wpp': 'wps', '.et': 'wps', '.dps': 'wps',
  }
  return map[ext] || 'unsupported'
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function notifyRenderer(ev: UsnEvent): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('usn-update', ev)
}

export async function handleUsnEvent(ev: UsnEvent): Promise<void> {
  log.debug(`[usnHandler] ${ev.event}: ${ev.path}`)

  try {
    switch (ev.event) {
      case 'created':
        await handleCreated(ev.path)
        break
      case 'modified':
        await handleModified(ev.path)
        break
      case 'deleted':
        handleDeleted(ev.path)
        break
      case 'renamed':
        await handleRenamed(ev.oldPath!, ev.path)
        break
      case 'folder_created':
        // folder name index is a separate feature, ignore here
        break
      case 'folder_deleted':
        handleFolderDeleted(ev.path)
        break
      case 'folder_renamed':
        await handleFolderRenamed(ev.oldPath!, ev.path)
        break
    }
  } catch (e) {
    log.error(`[usnHandler] error handling ${ev.event} ${ev.path}:`, e)
  }

  notifyRenderer(ev)
}

// Simple/exts that should be extracted synchronously (immediately)
const SIMPLE_EXTS = new Set(['.txt', '.md', '.markdown', '.json'])

async function handleCreated(filePath: string): Promise<void> {
  const fileInfo = await processFileSimple(filePath)
  if (!fileInfo) return
  // If the file is a simple text-like file, extract content immediately
  const ext = path.extname(filePath).toLowerCase()
  if (SIMPLE_EXTS.has(ext)) {
    try {
      const content = await extractContent(filePath)
      fileInfo.content = content ?? null
    } catch {
      // Ignore extraction failure and fall back to metadata only
      fileInfo.content = null
    }
  }
  const shard = await openNextShard()
  if (!shard) return
  await insertFileBatch(shard.id, [fileInfo])
  log.info(`[usnHandler] indexed new file: ${filePath}`)
}

async function handleModified(filePath: string): Promise<void> {
  const content = await extractContentSimple(filePath)
  updateFileContentInAllShards(filePath, content)
  log.debug(`[usnHandler] updated content: ${filePath}`)
}

function handleDeleted(filePath: string): void {
  const count = deleteFileFromAllShards(filePath)
  if (count > 0) log.info(`[usnHandler] deleted from ${count} shard(s): ${filePath}`)
}

async function handleRenamed(oldPath: string, newPath: string): Promise<void> {
  renameFileInAllShards(oldPath, newPath)
  const content = await extractContentSimple(newPath)
  updateFileContentInAllShards(newPath, content)
  log.info(`[usnHandler] renamed: ${oldPath} → ${newPath}`)
}

function handleFolderDeleted(folderPath: string): void {
  const count = deleteFilesByFolderPrefixFromAllShards(folderPath)
  log.info(`[usnHandler] cascade deleted ${count} files under: ${folderPath}`)
}

async function handleFolderRenamed(oldPath: string, newPath: string): Promise<void> {
  const count = renameFolderContentsInAllShards(oldPath, newPath)
  log.info(`[usnHandler] renamed ${count} files under folder: ${oldPath} → ${newPath}`)
}

interface SimpleFileInfo {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string
  content: string | null
  is_supported: number
}

async function processFileSimple(filePath: string): Promise<SimpleFileInfo | null> {
  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(filePath)
  } catch {
    return null
  }

  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase()
  const isSupported = SUPPORTED_EXTENSIONS.has(ext)
  const fileType = getFileType(ext)

  const info: SimpleFileInfo = {
    path: filePath.replace(/\\/g, '/'),
    name,
    size: stats.size,
    hash: null,
    file_type: fileType,
    content: null,
    is_supported: isSupported ? 1 : 0,
  }

  if (stats.size > 0 && stats.size < MAX_FILE_SIZE) {
    try {
      const buf = await fs.promises.readFile(filePath)
      info.hash = crypto.createHash('md5').update(buf).digest('hex')
    } catch {
      // ignore
    }
  }

  return info
}

async function extractContentSimple(filePath: string): Promise<string | null> {
  try {
    const content = await extractContent(filePath)
    return content || null
  } catch (error) {
    log.warn(`[usnHandler] Failed to extract content: ${filePath}`, error)
    return null
  }
}
