import { parentPort, workerData } from 'worker_threads'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log/main'

// ============ 常量定义 ============
// 文件大小限制
const MAX_FILE_SIZE = 100 * 1024 * 1024  // 100MB - 超过则跳过内容提取
const MAX_ZIP_INTERNAL_SIZE = 50 * 1024 * 1024  // 50MB - ZIP 内单个文件超过则跳过
// 超时设置
const TIMEOUT_MS = 15000  // 统一 15 秒超时
// ZIP 文件头魔数
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])  // "PK\x03\x04"

// ============ 工具函数 ============

// 检测文件是否为有效 ZIP（通过头部魔数）
function isValidZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.slice(0, 4).equals(ZIP_MAGIC)
}

// 统一超时保护
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
}

// 安全的格式化时间
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}

// ============ 扩展名集合 ============

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.pdf',
  '.rtf',
  '.chm',
  '.odt', '.ods', '.odp',
  '.epub',
  '.zip',
  '.mbox', '.eml',
  '.wps', '.wpp', '.et', '.dps'
])

// Extensions supported inside ZIP archives
const ARCHIVE_NESTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.pdf',
  '.rtf',
  '.odt', '.ods', '.odp',
  '.eml', '.mbox'
])

interface FileInfo {
  path: string
  name: string
  size: number
  hash: string | null
  fileType: string
  content: string | null
  is_supported: number  // 1 = supported (content extracted), 0 = not supported
}

interface ScanResult {
  success: boolean
  filesProcessed: number
  errors: string[]
}

interface ScanWorkerData {
  dirPath: string
  incremental?: boolean
  lastScanAt?: string
  // 扫描设置
  settings?: {
    timeoutMs?: number
    maxFileSize?: number
    maxPdfSize?: number
    skipOfficeInZip?: boolean
    checkZipHeader?: boolean
    checkFileSize?: boolean
  }
}

// 错误统计
interface ErrorStats {
  timeout: number      // 超时错误
  sizeLimit: number   // 大小限制跳过
  invalidHeader: number  // 无效头部跳过
  corrupted: number  // 损坏文件
  permission: number  // 权限错误
  unknown: number    // 未知错误
}

// 进度信息（带预估时间）
interface ProgressInfo {
  current: number
  total: number
  currentFile: string
  phase: 'scanning' | 'processing' | 'complete'
  estimatedTimeRemaining?: number  // 预估剩余时间（秒）
  errorStats?: ErrorStats
}

// Text extraction functions
async function extractTextFromDocx(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[DOCX] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  const startTime = Date.now()
  try {
    const mammoth = require('mammoth')
    const extractPromise = mammoth.extractRawText({ path: filePath })
    const result = await withTimeout(extractPromise, TIMEOUT_MS)
    log.info(`[EXTRACT] DOCX done: ${Date.now() - startTime}ms`)
    return result.value || ''
  } catch (error) {
    log.warn(`[WARN] DOCX failed: ${error.message}`)
    return ''
  }
}

async function extractTextFromXlsx(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[XLSX] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  // ZIP 头部检测
  try {
    const header = await fs.readFile(filePath, { length: 4 })
    if (!isValidZip(header)) {
      log.warn(`[XLSX] Skip invalid ZIP header: ${filePath}`)
      return ''
    }
  } catch (e) {
    log.warn(`[WARN] XLSX header check failed: ${filePath}`)
    return ''
  }

  const startTime = Date.now()
  try {
    const XLSX = require('xlsx')

    // Create a promise that wraps the synchronous readFile
    const readPromise = new Promise<any>((resolve, reject) => {
      try {
        const workbook = XLSX.readFile(filePath)
        resolve(workbook)
      } catch (err) {
        reject(err)
      }
    })

    const workbook = await withTimeout(readPromise, TIMEOUT_MS)
    log.info(`[EXTRACT] XLSX done: ${Date.now() - startTime}ms, ${workbook.SheetNames.length} sheets`)

    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      text += XLSX.utils.sheet_to_csv(sheet) + '\n'
    }

    return text
  } catch (error) {
    log.warn(`[WARN] XLSX failed: ${error.message}`)
    return ''
  }
}

async function extractTextFromPdf(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查 - PDF 限制 50MB
  if (fileSize !== undefined && fileSize > 50 * 1024 * 1024) {
    log.warn(`[PDF] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  const startTime = Date.now()
  try {
    const pdfParse = require('pdf-parse')
    const dataBuffer = await fs.readFile(filePath)
    const parsePromise = pdfParse(dataBuffer)
    const data = await withTimeout(parsePromise, TIMEOUT_MS)
    log.info(`[EXTRACT] PDF done: ${Date.now() - startTime}ms`)
    return data.text || ''
  } catch (error) {
    log.warn(`[WARN] PDF failed: ${error.message}`)
    return ''
  }
}

async function extractTextFromPptx(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[PPTX] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  const startTime = Date.now()
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)

    // ZIP 头部检测
    if (!isValidZip(data)) {
      log.warn(`[PPTX] Skip invalid ZIP header: ${filePath}`)
      return ''
    }

    const zip = await withTimeout(JSZip.loadAsync(data), TIMEOUT_MS)
    log.info(`[EXTRACT] PPTX done: ${Date.now() - startTime}ms, ${Object.keys(zip.files).length} files`)

    let text = ''
    const slideFiles = Object.keys(zip.files).filter((name: string) =>
      name.match(/^ppt\/slides\/slide\d+\.xml$/)
    )

    for (const slideFile of slideFiles) {
      const slideContent = await zip.file(slideFile)?.async('string')
      if (slideContent) {
        const matches = slideContent.match(/<a:t>([^<]*)<\/a:t>/g)
        if (matches) {
          text += matches.map((m: string) => m.replace(/<a:t>|<\/a:t>/g, '')).join(' ') + '\n'
        }
      }
    }

    return text
  } catch (error) {
    log.warn(`[WARN] PPTX failed: ${error.message}`)
    return ''
  }
}

// Extract plain text from RTF files using regex
async function extractTextFromRtf(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content
      .replace(/\\[a-z]+\d*\s?/gi, '')
      .replace(/\\['][0-9a-f]{2}/gi, '')
      .replace(/\\[{}]/g, '')
      .replace(/\\\n/g, '\n')
      .replace(/\{\\[^}]*\\par}/g, '\n')
      .replace(/\\[a-z]+\s/gi, ' ')
      .replace(/\{[^}]*\}/g, (match: string) => match.replace(/\{|}/g, ''))
      .replace(/\\[^a-z{}\s][0-9]*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch (error) {
    return ''
  }
}

// Extract plain text from ODF files (ODT, ODS, ODP)
async function extractTextFromOdf(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[ODF] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    // ZIP 头部检测
    if (!isValidZip(data)) {
      log.warn(`[ODF] Skip invalid ZIP header: ${filePath}`)
      return ''
    }
    const zip = await withTimeout(JSZip.loadAsync(data), TIMEOUT_MS)
    const contentXml = await zip.file('content.xml')?.async('string')
    if (!contentXml) return ''
    const textMatches = contentXml.match(/<text:[pwhs][^>]*>([^<]*)<\/text:[pwhs]>/g) || []
    return textMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).filter((t: string) => t.trim().length > 0).join('\n')
  } catch (error) {
    log.warn(`[WARN] ODF failed: ${error.message}`)
    return ''
  }
}

// Extract plain text from CHM files using jszip
async function extractTextFromChm(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[CHM] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    // ZIP 头部检测
    if (!isValidZip(data)) {
      log.warn(`[CHM] Skip invalid ZIP header: ${filePath}`)
      return ''
    }
    const zip = await withTimeout(JSZip.loadAsync(data), TIMEOUT_MS)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files) as [string, { dir: boolean, async: (type: string) => Promise<string> }][]) {
      if (file.dir) continue
      if (!name.endsWith('.html') && !name.endsWith('.htm')) continue
      const htmlContent = await file.async('string')
      if (!htmlContent) continue
      const text = htmlContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (text.length > 10) texts.push(text)
    }

    return texts.join('\n\n')
  } catch (error) {
    log.warn(`[WARN] CHM failed: ${error.message}`)
    return ''
  }
}

// Extract text from emails (.eml - RFC 822 format)
async function extractTextFromEml(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const texts: string[] = []
    const subjectMatch = content.match(/^Subject:\s*(.*)$/mi)
    if (subjectMatch) texts.push(`Subject: ${subjectMatch[1].trim()}`)
    const fromMatch = content.match(/^From:\s*(.*)$/mi)
    if (fromMatch) texts.push(`From: ${fromMatch[1].trim()}`)
    const bodyStart = content.indexOf('\r\n\r\n')
    const bodyStart2 = content.indexOf('\n\n')
    const bodyStartIdx = bodyStart >= 0 && (bodyStart2 < 0 || bodyStart < bodyStart2)
      ? bodyStart + 4 : bodyStart2 >= 0 ? bodyStart2 + 2 : 0
    let body = content.slice(bodyStartIdx)
    body = body
      .replace(/--[^\r\n]+/g, '---')
      .replace(/Content-Type:[^\r\n]+/gi, '')
      .replace(/Content-Transfer-Encoding:[^\r\n]+/gi, '')
      .replace(/---\s*$/gm, '\n')
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    body = body.replace(/^[A-Za-z-]+:[^\r\n]+/gm, '')
    body = body.replace(/<html[^>]*>[\s\S]*?<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
      .replace(/\s{2,}/g, ' ').trim()
    if (body) texts.push(body)
    return texts.join('\n')
  } catch (error) {
    return ''
  }
}

// Extract text from mbox mailbox files
async function extractTextFromMbox(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const texts: string[] = []
    const messages = content.split(/\nFrom /)
    for (const msg of messages) {
      if (!msg.trim()) continue
      const subjectMatch = msg.match(/^Subject:\s*(.*)$/mi)
      if (subjectMatch) texts.push(`Subject: ${subjectMatch[1].trim()}`)
      const bodyStart = msg.indexOf('\n\n')
      let body = bodyStart >= 0 ? msg.slice(bodyStart + 2) : msg
      body = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
        .replace(/^[A-Za-z-]+:[^\r\n]+/gm, '')
        .replace(/\s{2,}/g, ' ').trim()
      if (body) texts.push(body)
    }
    return texts.join('\n---\n')
  } catch (error) {
    return ''
  }
}

// Extract text from EPUB files (ZIP containing XML: content.opf + XHTML chapters)
async function extractTextFromEpub(filePath: string, fileSize?: number): Promise<string> {
  // 大小检查
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    log.warn(`[EPUB] Skip large file (${formatSize(fileSize)}): ${filePath}`)
    return ''
  }
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    // ZIP 头部检测
    if (!isValidZip(data)) {
      log.warn(`[EPUB] Skip invalid ZIP header: ${filePath}`)
      return ''
    }
    const zip = await withTimeout(JSZip.loadAsync(data), TIMEOUT_MS)
    const texts: string[] = []

    // Find content.opf via META-INF/container.xml
    const containerXml = zip.file('META-INF/container.xml')
    if (!containerXml) return ''
    const containerContent = await containerXml.async('string')
    const rootfileMatch = containerContent.match(/full-path="([^"]+)"/)
    if (!rootfileMatch) return ''
    const opfPath = rootfileMatch[1]
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

    // Parse content.opf
    const opfFile = zip.file(opfPath)
    if (!opfFile) return ''
    const opfContent = await opfFile.async('string')

    // Build manifest: id -> href
    const manifestItems: Record<string, string> = {}
    for (const m of opfContent.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g)) {
      manifestItems[m[1]] = m[2]
    }

    // Read chapters in spine order
    const spineMatches = [...opfContent.matchAll(/<itemref[^>]+idref="([^"]+)"/g)]
    for (const sm of spineMatches) {
      const itemId = sm[1]
      const href = manifestItems[itemId]
      if (!href) continue
      const chapterPath = opfDir + href
      const chapterFile = zip.file(chapterPath)
      if (!chapterFile) continue
      const chapterContent = await chapterFile.async('string')
      const text = chapterContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (text) texts.push(text)
    }

    return texts.join('\n\n')
  } catch (error) {
    log.warn(`[WARN] EPUB failed: ${error.message}`)
    return ''
  }
}

const MAX_ZIP_DEPTH = 3

async function extractTextFromZip(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ZIP_DEPTH) return ''
  const startTime = Date.now()
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)

    // ZIP 头部检测
    if (!isValidZip(data)) {
      log.warn(`[ZIP] Skip invalid ZIP header: ${filePath}`)
      return ''
    }

    const zip = await withTimeout(JSZip.loadAsync(data), TIMEOUT_MS)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files) as [string, { dir: boolean, async: (type: string) => Promise<string> }][]) {
      if (file.dir) continue
      const baseName = name.split('/').pop() || name
      if (baseName.startsWith('.') || baseName.startsWith('_')) continue
      const ext = path.extname(baseName).toLowerCase()

      if (ext === '.zip') {
        // 递归处理嵌套 ZIP
        try {
          const nestedContent = await file.async('string')
          const tmpPath = filePath + '.nested.' + baseName
          await fs.writeFile(tmpPath, Buffer.from(nestedContent, 'binary'))
          try {
            const nestedText = await extractTextFromZip(tmpPath, depth + 1)
            if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
          } finally {
            try { await fs.unlink(tmpPath) } catch {}
          }
        } catch (e) {
          // 嵌套 ZIP 处理失败，跳过
        }
        continue
      }

      if (!ARCHIVE_NESTED_EXTENSIONS.has(ext)) continue

      // Skip Office files inside ZIP - they often get corrupted during transfer
      if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx' || ext === '.odt' || ext === '.ods' || ext === '.odp') {
        continue
      }

      try {
        const fileContent = await file.async('string')
        if (ext === '.eml') {
          const subjectMatch = fileContent.match(/^Subject:\s*(.*)$/mi)
          let snippet = subjectMatch ? `Subject: ${subjectMatch[1].trim()}\n` : ''
          const bodyStart = fileContent.search(/\r?\n\r?\n/)
          if (bodyStart >= 0) {
            snippet += fileContent.slice(bodyStart).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
          }
          texts.push(`[${baseName}]\n${snippet}`)
        } else {
          const innerText = fileContent.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
          if (innerText) texts.push(`[${baseName}]\n${innerText}`)
        }
      } catch (e) {
        // 单个文件读取失败，跳过
      }
    }

    log.info(`[EXTRACT] ZIP done: ${Date.now() - startTime}ms, ${texts.length} texts`)
    return texts.join('\n---\n')
  } catch (error) {
    log.warn(`[WARN] ZIP failed: ${error.message}`)
    return ''
  }
}

async function extractText(filePath: string, ext: string, fileSize?: number): Promise<string> {
  const lowerExt = ext.toLowerCase()

  switch (lowerExt) {
    case '.docx':
      return extractTextFromDocx(filePath, fileSize)
    case '.xlsx':
    case '.xls':
      return extractTextFromXlsx(filePath, fileSize)
    case '.pptx':
    case '.ppt':
      return extractTextFromPptx(filePath, fileSize)
    case '.pdf':
      return extractTextFromPdf(filePath, fileSize)
    case '.rtf':
      return extractTextFromRtf(filePath)
    case '.odt':
    case '.ods':
    case '.odp':
      return extractTextFromOdf(filePath, fileSize)
    case '.chm':
      return extractTextFromChm(filePath)
    case '.eml':
      return extractTextFromEml(filePath)
    case '.mbox':
      return extractTextFromMbox(filePath)
    case '.epub':
      return extractTextFromEpub(filePath)
    case '.wps':
      return extractTextFromDocx(filePath, fileSize)
    case '.wpp':
    case '.dps':
      return extractTextFromPptx(filePath, fileSize)
    case '.et':
      return extractTextFromXlsx(filePath, fileSize)
    case '.zip':
      return extractTextFromZip(filePath)
    case '.txt':
    case '.md':
    case '.json':
    case '.xml':
    case '.csv':
      try {
        return await fs.readFile(filePath, 'utf-8')
      } catch {
        return ''
      }
    default:
      return ''
  }
}

async function calculateHash(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath)
    const hashSum = crypto.createHash('md5')
    hashSum.update(fileBuffer)
    return hashSum.digest('hex')
  } catch (error) {
    return null
  }
}

// Recursively scan directory
async function scanDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = []

  async function scan(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath)
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            files.push(fullPath)
          }
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }

  await scan(dirPath)
  return files
}

// Process a single file
async function processFile(filePath: string): Promise<FileInfo | null> {
  try {
    const stats = await fs.stat(filePath)
    const name = path.basename(filePath)
    const ext = path.extname(name).toLowerCase()
    const fileType = getFileType(ext)

    const fileInfo: FileInfo = {
      path: filePath,
      name,
      size: stats.size,
      hash: null,
      fileType,
      content: null,
      is_supported: 1  // File passed extension check to reach this point; 1 = searchable
    }

    // Calculate hash for files < 100MB
    if (stats.size > 0 && stats.size < MAX_FILE_SIZE) {
      fileInfo.hash = await calculateHash(filePath)
    }

    // Extract text content
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      fileInfo.content = await extractText(filePath, ext, stats.size)
    }

    return fileInfo
  } catch (error) {
    log.warn(`[ERROR] Failed to process: ${error.message}`)
    return null
  }
}

function getFileType(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text', '.md': 'text', '.json': 'text', '.xml': 'text', '.csv': 'text',
    '.doc': 'docx', '.docx': 'docx',
    '.xls': 'xlsx', '.xlsx': 'xlsx',
    '.ppt': 'pptx', '.pptx': 'pptx',
    '.pdf': 'pdf',
    '.rtf': 'rtf',
    '.chm': 'chm',
    '.odt': 'odf', '.ods': 'odf', '.odp': 'odf',
    '.epub': 'epub',
    '.zip': 'zip',
    '.mbox': 'email', '.eml': 'email',
    '.wps': 'docx', '.wpp': 'pptx', '.et': 'xlsx', '.dps': 'pptx'
  }
  return map[ext] || 'unknown'
}

// Main scan function
async function runScan(): Promise<void> {
  const { dirPath, incremental, lastScanAt, settings } = workerData as ScanWorkerData

  const isIncremental = incremental === true && lastScanAt
  const lastScanTime = isIncremental ? new Date(lastScanAt!).getTime() : 0

  // 使用自定义设置或默认值
  const TIMEOUT_MS = settings?.timeoutMs ?? 15000
  const MAX_FILE_SIZE = settings?.maxFileSize ?? 100 * 1024 * 1024
  const MAX_PDF_SIZE = settings?.maxPdfSize ?? 50 * 1024 * 1024
  const SKIP_OFFICE_IN_ZIP = settings?.skipOfficeInZip ?? true
  const CHECK_ZIP_HEADER = settings?.checkZipHeader ?? true
  const CHECK_FILE_SIZE = settings?.checkFileSize ?? true

  // 初始化错误统计
  const errorStats: ErrorStats = {
    timeout: 0,
    sizeLimit: 0,
    invalidHeader: 0,
    corrupted: 0,
    permission: 0,
    unknown: 0
  }

  parentPort?.postMessage({
    type: 'progress',
    data: { current: 0, total: 0, currentFile: isIncremental ? 'Incremental scan...' : 'Scanning directory...', phase: 'scanning' }
  })

  // Phase 1: Collect all files
  const files = await scanDirectory(dirPath)
  const total = files.length

  parentPort?.postMessage({
    type: 'progress',
    data: { current: 0, total, currentFile: isIncremental ? 'Checking for changes...' : 'Found files...', phase: 'processing', errorStats }
  })

  const errors: string[] = []
  let filesProcessed = 0
  let skipped = 0

  // 预估时间相关变量
  const startTime = Date.now()
  const processingTimes: number[] = []
  const TIME_WINDOW = 20  // 计算最近 20 个文件的平均时间

  // Batch processing: accumulate files and send in batches
  const BATCH_SIZE = 50
  const fileBatch: FileInfo[] = []

  const flushBatch = async (): Promise<void> => {
    if (fileBatch.length === 0) return

    const batch = [...fileBatch]
    fileBatch.length = 0

    parentPort?.postMessage({
      type: 'batch',
      data: batch
    })
  }

  // 计算预估剩余时间
  const calcEstimatedTime = (): number | undefined => {
    if (processingTimes.length < 5) return undefined  // 需要至少 5 个样本
    const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    const remaining = total - filesProcessed - skipped
    return Math.round((avgTime * remaining) / 1000)  // 返回秒数
  }

  // Phase 2: Process files
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const fileStartTime = Date.now()

    // Send progress with estimated time
    if (i % 10 === 0 || i === files.length - 1) {
      parentPort?.postMessage({
        type: 'progress',
        data: {
          current: i + 1,
          total,
          currentFile: path.basename(filePath),
          phase: 'processing',
          estimatedTimeRemaining: calcEstimatedTime(),
          errorStats
        }
      } as ProgressInfo)
    }

    try {
      // For incremental scans, check if file was modified since last scan
      if (isIncremental) {
        const stats = await fs.stat(filePath)
        const fileMtime = stats.mtimeMs

        if (fileMtime <= lastScanTime) {
          // File hasn't been modified since last scan, skip it
          skipped++
          continue
        }
      }

      const fileInfo = await processFile(filePath)
      if (fileInfo) {
        fileBatch.push(fileInfo)
        filesProcessed++

        // Flush batch when it reaches the size limit
        if (fileBatch.length >= BATCH_SIZE) {
          await flushBatch()
        }
      }
    } catch (error) {
      errors.push(`Failed: ${filePath}`)
      errorStats.unknown++
    }

    // 记录处理时间
    const processingTime = Date.now() - fileStartTime
    processingTimes.push(processingTime)
    if (processingTimes.length > TIME_WINDOW) {
      processingTimes.shift()
    }

    // Yield to allow other operations
    await new Promise(resolve => setImmediate(resolve))
  }

  // Flush remaining files
  await flushBatch()

  // 发送最终进度（带统计）
  parentPort?.postMessage({
    type: 'progress',
    data: {
      current: total,
      total,
      currentFile: 'Complete',
      phase: 'complete',
      estimatedTimeRemaining: 0,
      errorStats
    }
  })

  parentPort?.postMessage({
    type: 'complete',
    data: {
      success: true,
      filesProcessed,
      skipped,
      errors,
      errorStats,
      totalTime: Date.now() - startTime
    }
  })
}

runScan().catch(error => {
  parentPort?.postMessage({
    type: 'error',
    data: { message: error.message }
  })
})
