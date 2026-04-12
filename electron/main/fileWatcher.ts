import log from 'electron-log/main'
import { getFileByPath, insertFile, deleteFileByPath, updateFile, getAllScannedFolders } from './database'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { extractContent } from './scanner'

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.pdf'
])

const FILE_TYPE_MAP: Record<string, string> = {
  '.txt': 'text', '.md': 'text', '.json': 'text', '.xml': 'text', '.csv': 'text',
  '.doc': 'docx', '.docx': 'docx',
  '.xls': 'xlsx', '.xlsx': 'xlsx',
  '.ppt': 'pptx', '.pptx': 'pptx',
  '.pdf': 'pdf'
}

type FSWatcher = {
  close: () => Promise<void>
}

let watcher: FSWatcher | null = null

function getFileHash(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(buffer).digest('hex')
  } catch {
    return null
  }
}

async function processFile(filePath: string): Promise<void> {
  try {
    const stats = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) return

    const content = await extractContent(filePath)
    const hash = getFileHash(filePath)
    const fileType = FILE_TYPE_MAP[ext] || 'unknown'

    const existing = getFileByPath(filePath)
    if (existing) {
      if (existing.hash !== hash || existing.content !== content) {
        updateFile(existing.id!, {
          size: stats.size,
          hash,
          content,
          file_type: fileType
        })
      }
    } else {
      insertFile({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        hash,
        file_type: fileType,
        content
      })
    }
    log.info(`File watcher: indexed ${filePath}`)
  } catch (error) {
    log.error(`File watcher: failed to process ${filePath}`, error)
  }
}

export async function startFileWatcher(): Promise<void> {
  const folders = getAllScannedFolders()
  if (folders.length === 0) {
    log.info('File watcher: no folders to watch')
    return
  }

  const paths = folders.map(f => f.path)

  const chokidar = await import('chokidar')

  watcher = chokidar.watch(paths, {
    persistent: true,
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  }) as unknown as FSWatcher

  watcher
    .on('add', (filePath: string) => processFile(filePath))
    .on('change', (filePath: string) => processFile(filePath))
    .on('unlink', (filePath: string) => {
      deleteFileByPath(filePath)
      log.info(`File watcher: removed ${filePath} from index`)
    })
    .on('error', (error: Error) => log.error('File watcher error:', error))

  log.info(`File watcher started for ${paths.length} folders`)
}

export async function stopFileWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
    log.info('File watcher stopped')
  }
}
