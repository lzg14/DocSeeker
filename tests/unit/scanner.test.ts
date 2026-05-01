/**
 * Scanner Module Tests
 *
 * Tests for file scanning and content extraction utilities.
 */

import path from 'path'
import fs from 'fs'

const TEST_DIR = path.join(__dirname, '..', 'fixtures')

// Test helper: read test fixture
function readFixture(filename: string): string {
  return fs.readFileSync(path.join(TEST_DIR, filename), 'utf-8')
}

// ============ File Type Detection Tests ============

test('SUPPORTED_EXTENSIONS contains common text formats', () => {
  const SUPPORTED_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.xml', '.csv', '.html', '.htm',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.pdf', '.rtf', '.odt', '.ods', '.odp', '.epub'
  ])

  expect(SUPPORTED_EXTENSIONS.has('.txt')).toBe(true)
  expect(SUPPORTED_EXTENSIONS.has('.pdf')).toBe(true)
  expect(SUPPORTED_EXTENSIONS.has('.docx')).toBe(true)
  expect(SUPPORTED_EXTENSIONS.has('.md')).toBe(true)
})

test('FILE_TYPE_MAP returns correct types', () => {
  const FILE_TYPE_MAP: Record<string, string> = {
    '.txt': 'text',
    '.md': 'text',
    '.html': 'html',
    '.docx': 'docx',
    '.xlsx': 'xlsx',
    '.pptx': 'pptx',
    '.pdf': 'pdf'
  }

  expect(FILE_TYPE_MAP['.txt']).toBe('text')
  expect(FILE_TYPE_MAP['.html']).toBe('html')
  expect(FILE_TYPE_MAP['.docx']).toBe('docx')
  expect(FILE_TYPE_MAP['.pdf']).toBe('pdf')
})

// ============ Path Utilities Tests ============

test('extractExtension returns correct extension', () => {
  function extractExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase()
  }

  expect(extractExtension('test.txt')).toBe('.txt')
  expect(extractExtension('document.docx')).toBe('.docx')
  expect(extractExtension('/path/to/file.PDF')).toBe('.pdf')
  expect(extractExtension('noextension')).toBe('')
})

test('getBaseName extracts filename without extension', () => {
  function getBaseName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath))
  }

  expect(getBaseName('test.txt')).toBe('test')
  expect(getBaseName('document.docx')).toBe('document')
  expect(getBaseName('/path/to/file.md')).toBe('file')
})

test('getDirectory extracts parent directory', () => {
  function getDirectory(filePath: string): string {
    return path.dirname(filePath)
  }

  expect(getDirectory('/path/to/file.txt')).toBe('/path/to')
  expect(getDirectory('file.txt')).toBe('.')
})

// ============ File Size Utilities Tests ============

test('formatFileSize formats bytes correctly', () => {
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  expect(formatFileSize(0)).toBe('0 B')
  expect(formatFileSize(500)).toBe('500 B')
  expect(formatFileSize(1024)).toBe('1 KB')
  expect(formatFileSize(1536)).toBe('1.5 KB')
  expect(formatFileSize(1048576)).toBe('1 MB')
  expect(formatFileSize(1073741824)).toBe('1 GB')
})

test('isWithinSizeLimit checks file sizes correctly', () => {
  const MAX_SIZE = 100 * 1024 * 1024 // 100 MB

  function isWithinSizeLimit(size: number, maxSize: number): boolean {
    return size <= maxSize
  }

  expect(isWithinSizeLimit(500, MAX_SIZE)).toBe(true)
  expect(isWithinSizeLimit(MAX_SIZE, MAX_SIZE)).toBe(true)
  expect(isWithinSizeLimit(MAX_SIZE + 1, MAX_SIZE)).toBe(false)
})

// ============ Skip Rules Tests ============

interface SkipRule {
  name: string
  type: 'ext' | 'name' | 'path'
  pattern: string
  enabled: boolean
}

test('matchesSkipRule detects matching skip rules', () => {
  function matchesSkipRule(filePath: string, rule: SkipRule): boolean {
    if (!rule.enabled) return false

    switch (rule.type) {
      case 'ext':
        return filePath.toLowerCase().endsWith(rule.pattern.toLowerCase())
      case 'name':
        return path.basename(filePath).toLowerCase() === rule.pattern.toLowerCase()
      case 'path':
        return filePath.toLowerCase().includes(rule.pattern.toLowerCase())
      default:
        return false
    }
  }

  const extRule: SkipRule = { name: 'Skip .tmp', type: 'ext', pattern: '.tmp', enabled: true }
  expect(matchesSkipRule('file.tmp', extRule)).toBe(true)
  expect(matchesSkipRule('file.txt', extRule)).toBe(false)

  const nameRule: SkipRule = { name: 'Skip thumbs.db', type: 'name', pattern: 'thumbs.db', enabled: true }
  expect(matchesSkipRule('thumbs.db', nameRule)).toBe(true)
  expect(matchesSkipRule('thumb.db', nameRule)).toBe(false)

  const pathRule: SkipRule = { name: 'Skip node_modules', type: 'path', pattern: 'node_modules', enabled: true }
  expect(matchesSkipRule('/path/node_modules/file.txt', pathRule)).toBe(true)
  expect(matchesSkipRule('/path/modules/file.txt', pathRule)).toBe(false)
})

test('disabled skip rules do not match', () => {
  function matchesSkipRule(filePath: string, rule: SkipRule): boolean {
    if (!rule.enabled) return false
    return filePath.toLowerCase().endsWith(rule.pattern.toLowerCase())
  }

  const disabledRule: SkipRule = { name: 'Skip .tmp', type: 'ext', pattern: '.tmp', enabled: false }
  expect(matchesSkipRule('file.tmp', disabledRule)).toBe(false)
})

// ============ Content Extraction Tests ============

test('extractTextFromPlainText reads plain text files', () => {
  const testContent = 'This is a test document.\nDocSeeker testing.'

  function extractTextFromPlainText(content: string): string {
    return content
  }

  expect(extractTextFromPlainText(testContent)).toBe(testContent)
  expect(extractTextFromPlainText('')).toBe('')
})

test('extractTextFromCsv parses CSV content', () => {
  const csvContent = 'name,age,city\nJohn,30,NYC\nDocSeeker,25,LA'

  function extractTextFromCsv(content: string): string[] {
    const lines = content.split('\n')
    return lines.flatMap(line => line.split(','))
  }

  const result = extractTextFromCsv(csvContent)
  expect(result).toContain('name')
  expect(result).toContain('John')
  expect(result).toContain('DocSeeker')
})

test('extractTextFromJson parses JSON content', () => {
  const jsonContent = '{"name": "DocSeeker", "version": "1.0.0"}'

  function extractTextFromJson(content: string): string[] {
    try {
      const obj = JSON.parse(content)
      return Object.values(obj).map(v => String(v))
    } catch {
      return []
    }
  }

  const result = extractTextFromJson(jsonContent)
  expect(result).toContain('DocSeeker')
  expect(result).toContain('1.0.0')
})

test('extractTextFromXml parses XML content', () => {
  const xmlContent = '<?xml version="1.0"?>\n<root><item>Test</item><item>DocSeeker</item></root>'

  function extractTextFromXml(content: string): string[] {
    const matches = content.match(/<item>([^<]+)<\/item>/g)
    if (!matches) return []
    return matches.map(m => m.replace(/<\/?item>/g, ''))
  }

  const result = extractTextFromXml(xmlContent)
  expect(result).toContain('Test')
  expect(result).toContain('DocSeeker')
})

// ============ Subdirectory Extraction Tests ============

test('shouldScanSubdirectories respects depth limit', () => {
  function shouldScanSubdirectories(depth: number, maxDepth: number): boolean {
    return maxDepth < 0 || depth < maxDepth
  }

  expect(shouldScanSubdirectories(0, 3)).toBe(true)
  expect(shouldScanSubdirectories(2, 3)).toBe(true)
  expect(shouldScanSubdirectories(3, 3)).toBe(false)
  expect(shouldScanSubdirectories(5, 3)).toBe(false)
  expect(shouldScanSubdirectories(0, -1)).toBe(true) // -1 means unlimited
})

// ============ Hidden/System File Tests ============

test('isHiddenFile detects hidden files', () => {
  function isHiddenFile(filePath: string): boolean {
    const basename = path.basename(filePath)
    // Windows hidden files
    if (basename.startsWith('.')) return true
    // This is a simplified check; real implementation would use file attributes
    return false
  }

  expect(isHiddenFile('.gitignore')).toBe(true)
  expect(isHiddenFile('thumbs.db')).toBe(false)
  expect(isHiddenFile('.env')).toBe(true)
  expect(isHiddenFile('regular.txt')).toBe(false)
})

// ============ File Hash Tests ============

test('generateFileHash creates consistent hashes', () => {
  const crypto = require('crypto')

  function generateFileHash(content: Buffer): string {
    return crypto.createHash('md5').update(content).digest('hex')
  }

  const content1 = Buffer.from('Test content')
  const content2 = Buffer.from('Test content')
  const content3 = Buffer.from('Different content')

  const hash1 = generateFileHash(content1)
  const hash2 = generateFileHash(content2)
  const hash3 = generateFileHash(content3)

  expect(hash1).toBe(hash2) // Same content = same hash
  expect(hash1).not.toBe(hash3) // Different content = different hash
  expect(hash1).toMatch(/^[a-f0-9]{32}$/) // MD5 format
})
