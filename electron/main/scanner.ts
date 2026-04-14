import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log/main'
import {
  insertFile,
  getFileByPath,
  updateFile,
  deleteFileByPath,
  FileRecord
} from './database'

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
  '.mbox', '.eml'
])

// File type mapping
const FILE_TYPE_MAP: Record<string, string> = {
  '.txt': 'text',
  '.md': 'text',
  '.json': 'text',
  '.xml': 'text',
  '.csv': 'text',
  '.doc': 'docx',
  '.docx': 'docx',
  '.xls': 'xlsx',
  '.xlsx': 'xlsx',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.pdf': 'pdf',
  '.rtf': 'rtf',
  '.chm': 'chm',
  '.odt': 'odf',
  '.ods': 'odf',
  '.odp': 'odf',
  '.epub': 'epub',
  '.zip': 'zip',
  '.mbox': 'email',
  '.eml': 'email'
}

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

export interface ScanProgress {
  current: number
  total: number
  currentFile: string
  phase: 'scanning' | 'processing' | 'complete'
}

export type ProgressCallback = (progress: ScanProgress) => void

// Text extraction functions
export async function extractContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  return extractText(filePath, ext)
}

async function extractTextFromDocx(filePath: string): Promise<string> {
  try {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value || ''
  } catch (error) {
    log.warn(`Failed to extract text from docx: ${filePath}`, error)
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
    log.warn(`Failed to extract text from xlsx: ${filePath}`, error)
    return ''
  }
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const dataBuffer = fs.readFileSync(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text || ''
  } catch (error) {
    log.warn(`Failed to extract text from pdf: ${filePath}`, error)
    return ''
  }
}

async function extractTextFromPptx(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)
    let text = ''

    // Extract text from all slides
    const slideFiles = Object.keys(zip.files).filter((name: string) =>
      name.match(/^ppt\/slides\/slide\d+\.xml$/)
    )

    for (const slideFile of slideFiles) {
      const slideContent = await zip.file(slideFile)?.async('string')
      if (slideContent) {
        // Simple XML text extraction
        const matches = slideContent.match(/<a:t>([^<]*)<\/a:t>/g)
        if (matches) {
          text += matches.map((m: string) => m.replace(/<a:t>|<\/a:t>/g, '')).join(' ') + '\n'
        }
      }
    }

    return text
  } catch (error) {
    log.warn(`Failed to extract text from pptx: ${filePath}`, error)
    return ''
  }
}

// Extract plain text from RTF files using regex
async function extractTextFromRtf(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    // Strip RTF control words and groups
    return content
      .replace(/\\[a-z]+\d*\s?/gi, '') // control words like \fonttbl, \f0, etc.
      .replace(/\\['][0-9a-f]{2}/gi, '') // special chars like \'e9
      .replace(/\\[{}]/g, '')            // escaped braces
      .replace(/\\\n/g, '\n')            // escaped newlines
      .replace(/\{\\[^}]*\\par}/g, '\n') // paragraph marks
      .replace(/\\[a-z]+\s/gi, ' ')     // control symbols with space
      .replace(/\{[^}]*\}/g, (match) => {
        // Keep content of groups without control words
        return match.replace(/\{|}/g, '')
      })
      .replace(/\\[^a-z{}\s][0-9]*/g, '') // remaining control symbols
      .replace(/\n{3,}/g, '\n\n')       // normalize multiple newlines
      .trim()
  } catch (error) {
    log.warn(`Failed to extract text from rtf: ${filePath}`, error)
    return ''
  }
}

// Extract plain text from ODF files (ODT, ODS, ODP) using jszip
async function extractTextFromOdf(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)

    // ODF files have content.xml with the main text
    const contentXml = await zip.file('content.xml')?.async('string')
    if (!contentXml) return ''

    // Extract text from XML: <text:p>...</text:p>, <text:h>...</text:h>, <text:span>...</text:span>
    const textMatches = contentXml.match(/<text:[pwhs][^>]*>([^<]*)<\/text:[pwhs]>/g) || []
    const texts = textMatches.map((m: string) =>
      m.replace(/<[^>]+>/g, '')
    ).filter((t: string) => t.trim().length > 0)

    return texts.join('\n')
  } catch (error) {
    log.warn(`Failed to extract text from odf: ${filePath}`, error)
    return ''
  }
}

// Extract plain text from CHM files using jszip (CHM is a ZIP-like archive)
async function extractTextFromChm(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    // CHM contains HTML files - extract text from all .html/.htm files
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      if (!name.endsWith('.html') && !name.endsWith('.htm')) continue
      if (name.includes('/') && !name.endsWith('.html') && !name.endsWith('.htm')) continue

      const htmlContent = await file.async('string')
      if (!htmlContent) continue

      // Strip HTML tags and extract text
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

      if (text.length > 10) {
        texts.push(text)
      }
    }

    return texts.join('\n\n')
  } catch (error) {
    log.warn(`Failed to extract text from chm: ${filePath}`, error)
    return ''
  }
}

// Extract text from emails (.eml - RFC 822 format)
async function extractTextFromEml(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const texts: string[] = []

    // Extract Subject header
    const subjectMatch = content.match(/^Subject:\s*(.*)$/mi)
    if (subjectMatch) texts.push(`Subject: ${subjectMatch[1].trim()}`)

    // Extract From/To/Date headers
    const fromMatch = content.match(/^From:\s*(.*)$/mi)
    if (fromMatch) texts.push(`From: ${fromMatch[1].trim()}`)

    // Strip email headers (everything before first blank line)
    const bodyStart = content.indexOf('\r\n\r\n')
    const bodyStart2 = content.indexOf('\n\n')
    const bodyStartIdx = bodyStart >= 0 && (bodyStart2 < 0 || bodyStart < bodyStart2)
      ? bodyStart + 4 : bodyStart2 >= 0 ? bodyStart2 + 2 : 0

    let body = content.slice(bodyStartIdx)

    // Handle multipart MIME: strip boundary markers and keep text/plain
    body = body
      .replace(/--[^\r\n]+/g, '---')         // MIME boundaries
      .replace(/Content-Type:[^\r\n]+/gi, '') // content type headers
      .replace(/Content-Transfer-Encoding:[^\r\n]+/gi, '')
      .replace(/---\s*$/gm, '\n')             // trailing boundaries
      .replace(/=\r?\n/g, '')                // quoted-printable soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

    // Strip remaining headers
    body = body.replace(/^[A-Za-z-]+:[^\r\n]+/gm, '')

    // Strip HTML
    body = body
      .replace(/<html[^>]*>[\s\S]*?<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (body) texts.push(body)
    return texts.join('\n')
  } catch (error) {
    log.warn(`Failed to extract text from eml: ${filePath}`, error)
    return ''
  }
}

// Extract text from mbox mailbox files (Unix mail format)
async function extractTextFromMbox(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const texts: string[] = []

    // Split messages by "From " separator (at line start)
    const messages = content.split(/\nFrom /)

    for (const msg of messages) {
      if (!msg.trim()) continue

      // Extract Subject from this message
      const subjectMatch = msg.match(/^Subject:\s*(.*)$/mi)
      if (subjectMatch) texts.push(`Subject: ${subjectMatch[1].trim()}`)

      // Strip headers (find blank line separator)
      const bodyStart = msg.indexOf('\n\n')
      let body = bodyStart >= 0 ? msg.slice(bodyStart + 2) : msg

      // Basic text extraction
      body = body
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
        .replace(/^[A-Za-z-]+:[^\r\n]+/gm, '')
        .replace(/\s{2,}/g, ' ')
        .trim()

      if (body) texts.push(body)
    }

    return texts.join('\n---\n')
  } catch (error) {
    log.warn(`Failed to extract text from mbox: ${filePath}`, error)
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
    return ''
  }
}

// Extract text from ZIP archives (recursively scanning embedded documents)
const MAX_ZIP_DEPTH = 3

async function extractTextFromZip(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ZIP_DEPTH) return ''

  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue

      // Skip hidden and system files
      const baseName = name.split('/').pop() || name
      if (baseName.startsWith('.') || baseName.startsWith('_')) continue

      const ext = path.extname(baseName).toLowerCase()

      // Recurse into nested ZIPs
      if (ext === '.zip') {
        const nestedContent = await file.async('string')
        const tmpPath = filePath + '.nested.' + baseName
        fs.writeFileSync(tmpPath, Buffer.from(nestedContent, 'binary'))
        try {
          const nestedText = await extractTextFromZip(tmpPath, depth + 1)
          if (nestedText.trim()) {
            texts.push(`[${baseName}]\n${nestedText}`)
          }
        } finally {
          try { fs.unlinkSync(tmpPath) } catch {}
        }
        continue
      }

      if (!ARCHIVE_NESTED_EXTENSIONS.has(ext)) continue

      const fileContent = await file.async('string')

      if (ext === '.eml') {
        // Parse embedded email as plain text (already has headers)
        const subjectMatch = fileContent.match(/^Subject:\s*(.*)$/mi)
        let snippet = subjectMatch ? `Subject: ${subjectMatch[1].trim()}\n` : ''
        const bodyStart = fileContent.search(/\r?\n\r?\n/)
        if (bodyStart >= 0) {
          snippet += fileContent.slice(bodyStart).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
        }
        texts.push(`[${baseName}]\n${snippet}`)
      } else if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx' || ext === '.odt' || ext === '.ods' || ext === '.odp') {
        // Write temp file and use existing parser
        const tmpPath = filePath + '.tmp.' + baseName
        fs.writeFileSync(tmpPath, Buffer.from(fileContent, 'binary'))
        try {
          const innerExt = path.extname(baseName)
          const innerText = await extractText(tmpPath, innerExt)
          if (innerText.trim()) {
            texts.push(`[${baseName}]\n${innerText}`)
          }
        } finally {
          try { fs.unlinkSync(tmpPath) } catch {}
        }
      } else {
        // Plain text inside ZIP
        const innerText = fileContent.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
        if (innerText) {
          texts.push(`[${baseName}]\n${innerText}`)
        }
      }
    }

    return texts.join('\n---\n')
  } catch (error) {
    log.warn(`Failed to extract text from zip: ${filePath}`, error)
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
    case '.zip':
      return extractTextFromZip(filePath)
    case '.txt':
    case '.md':
    case '.json':
    case '.xml':
    case '.csv':
      try {
        return fs.readFileSync(filePath, 'utf-8')
      } catch {
        return ''
      }
    default:
      return ''
  }
}

// Calculate file hash
function calculateHash(filePath: string): string | null {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const hashSum = crypto.createHash('md5')
    hashSum.update(fileBuffer)
    return hashSum.digest('hex')
  } catch (error) {
    log.warn(`Failed to calculate hash: ${filePath}`, error)
    return null
  }
}

// Recursively scan directory
function scanDirectory(
  dirPath: string,
  files: string[],
  onProgress?: ProgressCallback
): void {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        // Skip hidden directories and system directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDirectory(fullPath, files, onProgress)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath)
        }
      }
    }
  } catch (error) {
    log.warn(`Failed to scan directory: ${dirPath}`, error)
  }
}

// Process a single file
async function processFile(
  filePath: string
): Promise<FileRecord | null> {
  try {
    const stats = fs.statSync(filePath)
    const name = path.basename(filePath)
    const ext = path.extname(name).toLowerCase()
    const fileType = FILE_TYPE_MAP[ext] || 'unknown'

    const fileRecord: FileRecord = {
      path: filePath,
      name,
      size: stats.size,
      hash: null,
      file_type: fileType,
      content: null
    }

    // Calculate hash for files larger than 0 bytes
    if (stats.size > 0) {
      fileRecord.hash = calculateHash(filePath)
    }

    // Extract text content
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      fileRecord.content = await extractText(filePath, ext)
    }

    return fileRecord
  } catch (error) {
    log.warn(`Failed to process file: ${filePath}`, error)
    return null
  }
}

// Main scan function
export async function scanDirectoryAndIndex(
  dirPath: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; filesProcessed: number; errors: string[] }> {
  log.info(`Starting scan of directory: ${dirPath}`)

  const errors: string[] = []
  let filesProcessed = 0

  // Phase 1: Scan directory
  onProgress?.({
    current: 0,
    total: 0,
    currentFile: 'Scanning directory...',
    phase: 'scanning'
  })

  const files: string[] = []
  scanDirectory(dirPath, files, onProgress)

  const total = files.length
  log.info(`Found ${total} files to process`)

  // Phase 2: Process files
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]

    onProgress?.({
      current: i + 1,
      total,
      currentFile: path.basename(filePath),
      phase: 'processing'
    })

    try {
      const fileRecord = await processFile(filePath)

      if (fileRecord) {
        // Check if file already exists in database
        const existing = getFileByPath(filePath)

        if (existing) {
          // Update existing record
          if (existing.hash !== fileRecord.hash || existing.content !== fileRecord.content) {
            updateFile(existing.id!, fileRecord)
          }
        } else {
          // Insert new record
          insertFile(fileRecord)
        }

        filesProcessed++
      }
    } catch (error) {
      const errorMsg = `Failed to process: ${filePath}`
      log.error(errorMsg, error)
      errors.push(errorMsg)
    }
  }

  onProgress?.({
    current: total,
    total,
    currentFile: 'Complete',
    phase: 'complete'
  })

  log.info(`Scan complete. Processed ${filesProcessed} files, ${errors.length} errors`)

  return {
    success: errors.length === 0,
    filesProcessed,
    errors
  }
}
