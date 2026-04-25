import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { Worker } from 'worker_threads'
import { join } from 'path'
import {
  deleteFileFromAllShardsAsync,
  renameFileInAllShardsAsync,
  updateFileContentInAllShardsAsync,
  renameFolderContentsInAllShardsAsync,
  deleteFilesByFolderPrefixFromAllShardsAsync,
  openNextShard,
  insertFileBatch,
} from './shardManager'

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

// ============ 文件变化队列 ============
const pendingContentUpdates = new Set<string>()
let flushTimer: NodeJS.Timeout | null = null
let contentWorker: Worker | null = null
const FLUSH_INTERVAL_MS = 15 * 60 * 1000 // 15分钟

// 正在处理的队列（用于崩溃恢复）
let currentProcessingFiles: string[] = []

function scheduleFlush(): void {
  if (flushTimer) return

  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPendingUpdates()
  }, FLUSH_INTERVAL_MS)
}

function flushPendingUpdates(): void {
  if (pendingContentUpdates.size === 0) return

  // 如果已经有worker在运行，跳过这次调度
  if (contentWorker) {
    log.info(`[usnHandler] Worker already running, skipping this flush`)
    return
  }

  const files = Array.from(pendingContentUpdates)
  pendingContentUpdates.clear()

  // 记录正在处理的文件，用于崩溃恢复
  currentProcessingFiles = files

  log.info(`[usnHandler] Starting batch content update for ${files.length} files`)

  // 使用 worker 处理内容提取
  contentWorker = new Worker(join(__dirname, 'contentWorker.js'), {
    workerData: { filePaths: files }
  })

  contentWorker.on('message', async (msg) => {
    if (msg.type === 'progress') {
      log.debug(`[usnHandler] Content update progress: ${msg.data.current}/${msg.data.total}`)
    } else if (msg.type === 'complete') {
      const results = msg.data as { path: string; content: string }[]
      log.info(`[usnHandler] Content extracted for ${results.length} files, updating database`)

      // 清空处理中的队列
      currentProcessingFiles = []

      // 并行更新数据库（通过 worker）
      await Promise.all(results.map(r =>
        updateFileContentInAllShardsAsync(r.path, r.content)
      ))
      log.info(`[usnHandler] Batch content update complete`)

      contentWorker?.terminate()
      contentWorker = null
    } else if (msg.type === 'error') {
      log.error(`[usnHandler] Content worker error:`, msg.data)
      // 崩溃恢复：重新将未处理的文件加入队列
      if (currentProcessingFiles.length > 0) {
        log.info(`[usnHandler] Recovering ${currentProcessingFiles.length} files to queue`)
        for (const f of currentProcessingFiles) {
          pendingContentUpdates.add(f)
        }
        currentProcessingFiles = []
        scheduleFlush()
      }
      contentWorker?.terminate()
      contentWorker = null
    }
  })

  contentWorker.on('error', (err) => {
    log.error(`[usnHandler] Content worker crashed:`, err)
    // 崩溃恢复：重新将未处理的文件加入队列
    if (currentProcessingFiles.length > 0) {
      log.info(`[usnHandler] Recovering ${currentProcessingFiles.length} files to queue`)
      for (const f of currentProcessingFiles) {
        pendingContentUpdates.add(f)
      }
      currentProcessingFiles = []
      scheduleFlush()
    }
    contentWorker = null
  })
}

// ============ 导出函数 ============

export function registerUsnHandlerIpc(): void {
  ipcMain.handle('flush-pending-updates', async () => {
    flushPendingUpdates()
    return true
  })

  ipcMain.handle('get-pending-update-count', async () => {
    return pendingContentUpdates.size
  })
}

export async function handleUsnEvent(ev: UsnEvent): Promise<void> {
  log.debug(`[usnHandler] ${ev.event}: ${ev.path}`)

  try {
    switch (ev.event) {
      case 'created':
        await handleCreated(ev.path)
        break
      case 'modified':
        handleModified(ev.path)
        break
      case 'deleted':
        handleDeleted(ev.path)
        break
      case 'renamed':
        handleRenamed(ev.oldPath!, ev.path)
        break
      case 'folder_created':
        break
      case 'folder_deleted':
        handleFolderDeleted(ev.path)
        break
      case 'folder_renamed':
        handleFolderRenamed(ev.oldPath!, ev.path)
        break
    }
  } catch (e) {
    log.error(`[usnHandler] error handling ${ev.event} ${ev.path}:`, e)
  }

  notifyRenderer(ev)
}

async function handleCreated(filePath: string): Promise<void> {
  const fileInfo = await processFileSimple(filePath)
  if (!fileInfo) return

  const shard = await openNextShard()
  if (!shard) return
  await insertFileBatch(shard.id, [fileInfo])

  // 新文件加入待更新队列
  pendingContentUpdates.add(filePath)
  scheduleFlush()

  log.info(`[usnHandler] indexed new file: ${filePath}`)
}

function handleModified(filePath: string): void {
  pendingContentUpdates.add(filePath)
  scheduleFlush()
}

async function handleDeleted(filePath: string): Promise<void> {
  pendingContentUpdates.delete(filePath)
  const count = await deleteFileFromAllShardsAsync(filePath)
  if (count > 0) log.info(`[usnHandler] deleted from ${count} shard(s): ${filePath}`)
}

async function handleRenamed(oldPath: string, newPath: string): Promise<void> {
  pendingContentUpdates.delete(oldPath)
  await renameFileInAllShardsAsync(oldPath, newPath)
  pendingContentUpdates.add(newPath)
  scheduleFlush()
  log.info(`[usnHandler] renamed: ${oldPath} → ${newPath}`)
}

async function handleFolderDeleted(folderPath: string): Promise<void> {
  const count = await deleteFilesByFolderPrefixFromAllShardsAsync(folderPath)
  log.info(`[usnHandler] cascade deleted ${count} files under: ${folderPath}`)
}

async function handleFolderRenamed(oldPath: string, newPath: string): Promise<void> {
  const count = await renameFolderContentsInAllShardsAsync(oldPath, newPath)
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
