/**
 * PDF 缩略图生成
 *
 * Windows Electron 主进程暂不支持，原因：
 * - pdfjs-dist 的 node12.18+ 分发包依赖 canvas native addon
 * - 跨平台方案：使用 sharp + 外部 LibreOffice 转换，或 @pdfme/pdfjs-browser
 *
 * TODO: 后续迭代时考虑以下方案之一：
 * 1. sharp + libreoffice: libreoffice --headless --convert-to pdf page1.png && sharp page1.png
 * 2. @pdfme/pdfjs-browser: 在 BrowserWindow 中渲染后截图
 * 3. Windows ShellThumbnail API (IWICBitmapDecoder)
 */

export async function getPdfThumbnail(filePath: string): Promise<string | null> {
  // 当前返回 null，缩略图区域不显示
  return null
}
