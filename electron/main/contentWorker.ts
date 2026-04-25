import { parentPort, workerData } from 'worker_threads'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'

// 超时设置
const TIMEOUT_MS = 30000 // 30秒超时

// 统一超时保护
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
}

// 从文件提取文本内容
async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  try {
    switch (ext) {
      case '.txt':
      case '.md':
      case '.markdown':
      case '.json':
      case '.xml':
      case '.csv':
      case '.html':
      case '.htm':
      case '.js':
      case '.ts':
      case '.css':
      case '.yaml':
      case '.yml':
      case '.log':
      case '.ini':
      case '.conf':
      case '.cfg':
        // 简单文本文件，直接读取
        return await fs.promises.readFile(filePath, 'utf-8')

      case '.docx':
        return await extractFromDocx(filePath)
      case '.xlsx':
      case '.xls':
        return await extractFromXlsx(filePath)
      case '.pptx':
      case '.ppt':
        return await extractFromPptx(filePath)
      case '.pdf':
        return await extractFromPdf(filePath)
      case '.rtf':
        return await extractFromRtf(filePath)

      default:
        // 不支持的格式，返回空
        return ''
    }
  } catch (error) {
    log.warn(`[contentWorker] Failed to extract: ${filePath}`, error)
    return ''
  }
}

async function extractFromDocx(filePath: string): Promise<string> {
  try {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value || ''
  } catch {
    return ''
  }
}

async function extractFromXlsx(filePath: string): Promise<string> {
  try {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      text += XLSX.utils.sheet_to_csv(sheet) + '\n'
    }
    return text
  } catch {
    return ''
  }
}

async function extractFromPptx(filePath: string): Promise<string> {
  try {
    const JSZip = require('jszip')
    const data = fs.readFileSync(filePath)
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
  } catch {
    return ''
  }
}

async function extractFromPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const dataBuffer = fs.readFileSync(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text || ''
  } catch {
    return ''
  }
}

async function extractFromRtf(filePath: string): Promise<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content
      .replace(/\\[a-z]+\d*\s?/gi, '')
      .replace(/\\['][0-9a-f]{2}/gi, '')
      .replace(/\\[{}]/g, '')
      .replace(/\\\n/g, '\n')
      .replace(/\{\\[^}]*\\par}/g, '\n')
      .replace(/\\[a-z]+\s/gi, ' ')
      .replace(/\{[^}]*\}/g, (match) => match.replace(/\{|\}/g, ''))
      .replace(/\\[^a-z{}\s][0-9]*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return ''
  }
}

// 处理单个文件
async function processFile(filePath: string): Promise<{ path: string; content: string } | null> {
  try {
    const content = await withTimeout(extractText(filePath), TIMEOUT_MS)
    return { path: filePath, content }
  } catch (error) {
    log.warn(`[contentWorker] Failed to process: ${filePath}`, error)
    return null
  }
}

// 主函数
async function main(): Promise<void> {
  const { filePaths } = workerData as { filePaths: string[] }

  log.info(`[contentWorker] Processing ${filePaths.length} files`)

  const results: { path: string; content: string }[] = []
  let processed = 0

  for (const filePath of filePaths) {
    const result = await processFile(filePath)
    if (result) {
      results.push(result)
    }

    processed++
    if (processed % 10 === 0 || processed === filePaths.length) {
      parentPort?.postMessage({
        type: 'progress',
        data: { current: processed, total: filePaths.length }
      })
    }
  }

  parentPort?.postMessage({
    type: 'complete',
    data: results
  })
}

main().catch(error => {
  log.error('[contentWorker] Fatal error:', error)
  parentPort?.postMessage({
    type: 'error',
    data: error.message
  })
})
