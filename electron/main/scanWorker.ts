import { parentPort, workerData } from 'worker_threads'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

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
}

// Text extraction functions
async function extractTextFromDocx(filePath: string): Promise<string> {
  try {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value || ''
  } catch (error) {
    return ''
  }
}

async function extractTextFromXlsx(filePath: string): Promise<string> {
  try {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      text += XLSX.utils.sheet_to_csv(sheet) + '\n'
    }
    return text
  } catch (error) {
    return ''
  }
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const dataBuffer = await fs.readFile(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text || ''
  } catch (error) {
    return ''
  }
}

async function extractTextFromPptx(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(data)
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
async function extractTextFromOdf(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(data)
    const contentXml = await zip.file('content.xml')?.async('string')
    if (!contentXml) return ''
    const textMatches = contentXml.match(/<text:[pwhs][^>]*>([^<]*)<\/text:[pwhs]>/g) || []
    return textMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).filter((t: string) => t.trim().length > 0).join('\n')
  } catch (error) {
    return ''
  }
}

// Extract plain text from CHM files using jszip
async function extractTextFromChm(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files)) {
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
async function extractTextFromEpub(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(data)
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
    log.warn(`Failed to extract text from epub: ${filePath}`, error)
    return ''
  }
}

const MAX_ZIP_DEPTH = 3

async function extractTextFromZip(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ZIP_DEPTH) return ''
  try {
    const JSZip = require('jszip')
    const data = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      const baseName = name.split('/').pop() || name
      if (baseName.startsWith('.') || baseName.startsWith('_')) continue
      const ext = path.extname(baseName).toLowerCase()

      if (ext === '.zip') {
        const nestedContent = await file.async('string')
        const tmpPath = filePath + '.nested.' + baseName
        await fs.writeFile(tmpPath, Buffer.from(nestedContent, 'binary'))
        try {
          const nestedText = await extractTextFromZip(tmpPath, depth + 1)
          if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
        } finally {
          try { await fs.unlink(tmpPath) } catch {}
        }
        continue
      }

      if (!ARCHIVE_NESTED_EXTENSIONS.has(ext)) continue

      const fileContent = await file.async('string')

      if (ext === '.eml') {
        const subjectMatch = fileContent.match(/^Subject:\s*(.*)$/mi)
        let snippet = subjectMatch ? `Subject: ${subjectMatch[1].trim()}\n` : ''
        const bodyStart = fileContent.search(/\r?\n\r?\n/)
        if (bodyStart >= 0) {
          snippet += fileContent.slice(bodyStart).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
        }
        texts.push(`[${baseName}]\n${snippet}`)
      } else if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx' || ext === '.odt' || ext === '.ods' || ext === '.odp') {
        const tmpPath = filePath + '.tmp.' + baseName
        await fs.writeFile(tmpPath, Buffer.from(fileContent, 'binary'))
        try {
          const innerExt = path.extname(baseName)
          const innerText = await extractText(tmpPath, innerExt)
          if (innerText.trim()) texts.push(`[${baseName}]\n${innerText}`)
        } finally {
          try { await fs.unlink(tmpPath) } catch {}
        }
      } else {
        const innerText = fileContent.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
        if (innerText) texts.push(`[${baseName}]\n${innerText}`)
      }
    }

    return texts.join('\n---\n')
  } catch (error) {
    return ''
  }
}

async function extractText(filePath: string, ext: string): Promise<string> {
  const lowerExt = ext.toLowerCase()

  switch (lowerExt) {
    case '.docx':
      return extractTextFromDocx(filePath)
    case '.xlsx':
    case '.xls':
      return extractTextFromXlsx(filePath)
    case '.pptx':
    case '.ppt':
      return extractTextFromPptx(filePath)
    case '.pdf':
      return extractTextFromPdf(filePath)
    case '.rtf':
      return extractTextFromRtf(filePath)
    case '.odt':
    case '.ods':
    case '.odp':
      return extractTextFromOdf(filePath)
    case '.chm':
      return extractTextFromChm(filePath)
    case '.eml':
      return extractTextFromEml(filePath)
    case '.mbox':
      return extractTextFromMbox(filePath)
    case '.epub':
      return extractTextFromEpub(filePath)
    case '.wps':
      return extractTextFromDocx(filePath)
    case '.wpp':
    case '.dps':
      return extractTextFromPptx(filePath)
    case '.et':
      return extractTextFromXlsx(filePath)
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
      content: null
    }

    // Calculate hash for files < 100MB
    if (stats.size > 0 && stats.size < 100 * 1024 * 1024) {
      fileInfo.hash = await calculateHash(filePath)
    }

    // Extract text content
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      fileInfo.content = await extractText(filePath, ext)
    }

    return fileInfo
  } catch (error) {
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
  const { dirPath, incremental, lastScanAt } = workerData as ScanWorkerData

  const isIncremental = incremental === true && lastScanAt
  const lastScanTime = isIncremental ? new Date(lastScanAt!).getTime() : 0

  parentPort?.postMessage({
    type: 'progress',
    data: { current: 0, total: 0, currentFile: isIncremental ? 'Incremental scan...' : 'Scanning directory...', phase: 'scanning' }
  })

  // Phase 1: Collect all files
  const files = await scanDirectory(dirPath)
  const total = files.length

  parentPort?.postMessage({
    type: 'progress',
    data: { current: 0, total, currentFile: isIncremental ? 'Checking for changes...' : 'Found files...', phase: 'processing' }
  })

  const errors: string[] = []
  let filesProcessed = 0
  let skipped = 0

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

  // Phase 2: Process files
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]

    // Send progress
    if (i % 10 === 0 || i === files.length - 1) {
      parentPort?.postMessage({
        type: 'progress',
        data: {
          current: i + 1,
          total,
          currentFile: path.basename(filePath),
          phase: 'processing'
        }
      })
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
    }

    // Yield to allow other operations
    await new Promise(resolve => setImmediate(resolve))
  }

  // Flush remaining files
  await flushBatch()

  parentPort?.postMessage({
    type: 'complete',
    data: { success: true, filesProcessed, skipped, errors }
  })
}

runScan().catch(error => {
  parentPort?.postMessage({
    type: 'error',
    data: { message: error.message }
  })
})
