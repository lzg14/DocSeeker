/**
 * PDF 缩略图渲染工具（Renderer 进程）
 *
 * 使用 pdfjs-dist 在浏览器 Canvas 中渲染 PDF 第一页为 PNG。
 * 此文件运行在 renderer 进程中，可以访问 DOM Canvas API。
 *
 * 使用方式：
 *   import { renderPdfPage } from '../utils/pdfRender'
 *   const dataUrl = await renderPdfPage('/path/to/file.pdf')
 */

import * as pdfjsLib from 'pdfjs-dist'

// 配置 worker：从 CDN 加载，避免本地文件路径问题
// 使用稳定的 jsDelivr CDN
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

/**
 * 渲染 PDF 指定页为 base64 PNG。
 *
 * @param filePath  PDF 文件的绝对路径
 * @param page      页码，从 1 开始，默认 1
 * @param scale     缩放比例，默认 1.5（输出约 200px 高）
 * @returns base64 PNG data URL 或 null
 */
export async function renderPdfPage(
  filePath: string,
  page: number = 1,
  scale: number = 1.5
): Promise<string | null> {
  try {
    const url = `file:///${filePath.replace(/\\/g, '/')}`

    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    })

    const pdf = await loadingTask.promise
    if (page < 1 || page > pdf.numPages) return null

    const pdfPage = await pdf.getPage(page)
    const viewport = pdfPage.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)

    const ctx = canvas.getContext('2d')!
    await pdfPage.render({
      canvasContext: ctx,
      viewport,
    }).promise

    // 释放 PDF 文档内存
    pdf.destroy()

    return canvas.toDataURL('image/png')
  } catch (err) {
    console.error('[pdfRender] Failed to render PDF:', err)
    return null
  }
}
