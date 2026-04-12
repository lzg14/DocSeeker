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
  '.pdf'
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
  '.pdf': 'pdf'
}

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
  filePath: string,
  existingFile?: FileRecord
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
