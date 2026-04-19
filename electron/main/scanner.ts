import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log/main'
import { createExtractorFromData } from 'node-unrar-js'
import exifr from 'exifr'
import { parseFile as parseAudioFile } from 'music-metadata'
import {
  insertFile,
  getFileByPath,
  updateFile,
  deleteFileByPath,
  FileRecord
} from './database'

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.mdown', '.json', '.xml', '.csv', '.html', '.htm', '.svg',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.pdf', '.xps',
  '.rtf',
  '.chm',
  '.odt', '.ods', '.odp',
  '.epub',
  '.zip', '.rar',
  '.mbox', '.eml',
  '.wps', '.wpp', '.et', '.dps',
  // Image / Audio / Video (metadata extraction)
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a',
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'
])

// File type mapping
const FILE_TYPE_MAP: Record<string, string> = {
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.mdown': 'text',
  '.json': 'text',
  '.xml': 'text',
  '.csv': 'text',
  '.html': 'html',
  '.htm': 'html',
  '.svg': 'svg',
  '.doc': 'docx',
  '.docx': 'docx',
  '.xls': 'xlsx',
  '.xlsx': 'xlsx',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.pdf': 'pdf',
  '.xps': 'xps',
  '.rtf': 'rtf',
  '.chm': 'chm',
  '.odt': 'odf',
  '.ods': 'odf',
  '.odp': 'odf',
  '.epub': 'epub',
  '.zip': 'zip', '.rar': 'rar',
  '.mbox': 'email',
  '.eml': 'email',
  '.wps': 'docx', '.wpp': 'pptx', '.et': 'xlsx', '.dps': 'pptx',
  // Image / Audio / Video metadata
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.bmp': 'image', '.tiff': 'image', '.tif': 'image',
  '.mp3': 'media', '.flac': 'media', '.ogg': 'media', '.wav': 'media', '.aac': 'media', '.m4a': 'media',
  '.mp4': 'media', '.avi': 'media', '.mkv': 'media', '.mov': 'media', '.wmv': 'media', '.flv': 'media', '.webm': 'media'
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

// Extract text from XPS files (ZIP+XML, Microsoft PDF alternative)
async function extractTextFromXps(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    // XPS document structure: Documents/1/Pages/*.fpage contain page XML
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir || !name.endsWith('.fpage')) continue
      const pageXml = await file.async('string')
      // Extract text from Glyphs elements (XPS text rendering unit)
      const glyphMatches = pageXml.match(/<Glyphs[^>]*UnicodeString="([^"]*)"[^>]*>/gi) || []
      for (const m of glyphMatches) {
        const match = m.match(/UnicodeString="([^"]*)"/i)
        if (match && match[1]) texts.push(match[1])
      }
      // Also extract from TextBlock > Run elements
      const runMatches = pageXml.match(/<Run[^>]*>([^<]*)<\/Run>/gi) || []
      for (const m of runMatches) {
        const t = m.replace(/<[^>]+>/g, '').trim()
        if (t) texts.push(t)
      }
    }

    return texts.join('\n')
  } catch (error) {
    log.warn(`[WARN] XPS failed: ${filePath}`, error)
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
    for (const [name, file] of Object.entries(zip.files) as [string, { dir: boolean, async: (type: string) => Promise<string> }][]) {
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
    const data = fs.readFileSync(filePath)
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

// RAR 文件头魔数（RAR 4.x / 5.x 签名相同）
const RAR_MAGIC = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])

// 检测文件是否为有效 RAR
function isValidRar(buffer: Buffer): boolean {
  return buffer.length >= 7 && buffer.slice(0, 7).equals(RAR_MAGIC)
}

async function extractTextFromZip(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ZIP_DEPTH) return ''

  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(data)
    const texts: string[] = []

    for (const [name, file] of Object.entries(zip.files) as [string, { dir: boolean, async: (type: string) => Promise<string> }][]) {
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

// Extract plain text from RAR archives (supports nested RAR/ZIP)
async function extractTextFromRar(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ZIP_DEPTH) return ''
  try {
    const data = fs.readFileSync(filePath)

    // RAR 头部检测
    if (!isValidRar(data)) {
      log.warn(`[RAR] Skip invalid RAR signature: ${filePath}`)
      return ''
    }

    // 解压 RAR
    const extractor = await createExtractorFromData(data)
    const list = extractor.getFileList()
    const files = [...list.fileHeaders]
    const texts: string[] = []

    for (const header of files) {
      if (header.flags.dir) continue  // 跳过目录
      const name = header.name
      const baseName = name.split('/').pop() || name
      if (baseName.startsWith('.')) continue
      const ext = path.extname(baseName).toLowerCase()

      // 递归处理嵌套 RAR
      if (ext === '.rar') {
        try {
          const extracted = extractor.extract({ files: [name] })
          if (extracted.files[0]) {
            const uint8 = new Uint8Array(extracted.files[0].stream)
            const tmpPath = filePath + '.nested.' + baseName
            fs.writeFileSync(tmpPath, Buffer.from(uint8))
            try {
              const nestedText = await extractTextFromRar(tmpPath, depth + 1)
              if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
            } finally {
              try { fs.unlinkSync(tmpPath) } catch {}
            }
          }
        } catch (e) {
          // 嵌套 RAR 处理失败，跳过
        }
        continue
      }

      // 递归处理嵌套 ZIP
      if (ext === '.zip') {
        try {
          const extracted = extractor.extract({ files: [name] })
          if (extracted.files[0]) {
            const uint8 = new Uint8Array(extracted.files[0].stream)
            const tmpPath = filePath + '.nested.' + baseName
            fs.writeFileSync(tmpPath, Buffer.from(uint8))
            try {
              const nestedText = await extractTextFromZip(tmpPath, depth + 1)
              if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
            } finally {
              try { fs.unlinkSync(tmpPath) } catch {}
            }
          }
        } catch (e) {
          // 嵌套 ZIP 处理失败，跳过
        }
        continue
      }

      // 只处理支持的嵌套扩展名
      if (!ARCHIVE_NESTED_EXTENSIONS.has(ext)) continue

      // Office 文件在 RAR 内跳过（容易损坏）
      if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx' || ext === '.odt' || ext === '.ods' || ext === '.odp') {
        continue
      }

      try {
        const extracted = extractor.extract({ files: [name] })
        if (extracted.files[0]) {
          const uint8 = new Uint8Array(extracted.files[0].stream)
          const buf = Buffer.from(uint8)
          const tmpPath = filePath + '.extracted.' + baseName.replace(/[^a-zA-Z0-9.]/, '_')
          fs.writeFileSync(tmpPath, buf)
          try {
            const content = await extractText(tmpPath, ext)
            if (content.trim()) texts.push(`[${baseName}]\n${content}`)
          } finally {
            try { fs.unlinkSync(tmpPath) } catch {}
          }
        }
      } catch (e) {
        // 单文件解压失败，跳过
      }
    }

    log.info(`[RAR] Extracted from: ${filePath}, ${texts.length} texts`)
    return texts.join('\n---\n')
  } catch (error) {
    log.warn(`[RAR] Failed to extract text from rar: ${filePath}`, error)
    return ''
  }
}

// Extract plain text from HTML files (strip tags, preserve body text)
async function extractTextFromHtml(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    // Remove script and style blocks entirely
    let text = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '')
    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ')
    text = text.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    text = text.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    text = text.replace(/&#39;/gi, "'")
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim()
    return text
  } catch {
    return ''
  }
}

// Extract text from SVG files (SVG is XML with graphic elements)
async function extractTextFromSvg(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    // Remove SVG namespace noise and extract text elements
    let text = content.replace(/<svg[^>]*>/gi, '')
    // Extract text between <text> tags (with optional attributes)
    const textMatches = text.match(/<text[^>]*>([^<]*)<\/text>/gi) || []
    const texts = textMatches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(t => t)
    // Also extract <tspan> and <title> content
    const tspanMatches = content.match(/<tspan[^>]*>([^<]*)<\/tspan>/gi) || []
    tspanMatches.forEach(m => {
      const t = m.replace(/<[^>]+>/g, '').trim()
      if (t) texts.push(t)
    })
    const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i)
    if (titleMatch && titleMatch[1]) texts.unshift(titleMatch[1].trim())
    return texts.join(' ')
  } catch {
    return ''
  }
}

// Extract metadata from image files (EXIF, IPTC, XMP)
async function extractTextFromImage(filePath: string): Promise<string> {
  try {
    const data = await exifr.parse(filePath, {
      // Only pick text-like fields
      pick: [
        'ObjectName', 'Caption', 'Description', 'Title', 'Keywords',
        'DateTimeOriginal', 'DateTimeDigitized', 'DateTime',
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
        'Make', 'Model', 'Software',
        'Artist', 'Copyright', 'Creator', 'Author',
        'ImageDescription', 'UserComment',
        'Location', 'City', 'State', 'Country',
        'Headline', 'Credit', 'Source', 'SpecialInstructions',
      ]
    })
    if (!data) return ''
    const texts: string[] = []
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== '') {
        texts.push(`${key}: ${String(value)}`)
      }
    }
    return texts.join(' | ')
  } catch {
    return ''
  }
}

// Extract metadata from audio / video files (ID3, Vorbis, etc.)
async function extractTextFromMedia(filePath: string): Promise<string> {
  try {
    const metadata = await parseAudioFile(filePath)
    const { common, format } = metadata
    const texts: string[] = []
    if (common.title) texts.push(`标题: ${common.title}`)
    if (common.artist) texts.push(`歌手: ${common.artist}`)
    if (common.album) texts.push(`专辑: ${common.album}`)
    if (common.year) texts.push(`年份: ${common.year}`)
    if (common.genre?.length) texts.push(`风格: ${common.genre.join(', ')}`)
    if (common.track?.no) texts.push(`曲号: ${common.track.no}`)
    if (common.disk?.no) texts.push(`碟号: ${common.disk.no}`)
    if (common.label) texts.push(`厂牌: ${common.label}`)
    if (common.copyright) texts.push(`版权: ${common.copyright}`)
    if (common.comment) texts.push(`备注: ${common.comment}`)
    if (format.duration) texts.push(`时长: ${Math.round(format.duration)}秒`)
    if (format.codec) texts.push(`编码: ${format.codec}`)
    return texts.join(' | ')
  } catch {
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
    case '.xps':
      return extractTextFromXps(filePath)
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
    case '.rar':
      return extractTextFromRar(filePath)
    case '.txt':
    case '.md':
    case '.markdown':
    case '.mdown':
    case '.json':
    case '.xml':
    case '.csv':
      try {
        return fs.readFileSync(filePath, 'utf-8')
      } catch {
        return ''
      }
    case '.html':
    case '.htm':
      return extractTextFromHtml(filePath)
    case '.svg':
      return extractTextFromSvg(filePath)
    // Image metadata (EXIF/IPTC/XMP)
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
    case '.bmp':
    case '.tiff':
    case '.tif':
      return extractTextFromImage(filePath)
    // Audio / Video metadata (ID3 / Vorbis / etc.)
    case '.mp3':
    case '.flac':
    case '.ogg':
    case '.wav':
    case '.aac':
    case '.m4a':
    case '.mp4':
    case '.avi':
    case '.mkv':
    case '.mov':
    case '.wmv':
    case '.flv':
    case '.webm':
      return extractTextFromMedia(filePath)
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
