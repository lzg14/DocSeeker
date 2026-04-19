import { execFile } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log/main'

const execFileAsync = promisify(execFile)

/**
 * 方案一：Windows Shell 原生缩略图
 * 使用 PowerShell 调用 System.Drawing 从 PDF 提取首页。
 *
 * @returns base64 PNG 或 null
 */
async function tryShellThumbnail(filePath: string): Promise<string | null> {
  if (process.platform !== 'win32') return null

  try {
    const psScript = `
Add-Type -AssemblyName System.Drawing

$file = '${filePath.replace(/'/g, "''")}'
try {
    $bitmap = [System.Drawing.Bitmap]::FromFile($file)
    $thumb = New-Object System.Drawing.Bitmap($bitmap, [System.Drawing.Size]::new(200, 200))
    $ms = New-Object System.IO.MemoryStream
    $thumb.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Close()
    $bitmap.Dispose()
    $thumb.Dispose()
    [Convert]::ToBase64String($bytes)
} catch {
    'ERROR'
}
`
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 5000 }
    )
    const result = stdout.trim()
    if (result && result !== 'ERROR' && !result.startsWith('<')) {
      return `data:image/png;base64,${result}`
    }
    return null
  } catch (err) {
    log.warn('[pdfThumbnail] Shell thumbnail failed:', err)
    return null
  }
}

/**
 * PDF 缩略图生成
 *
 * 方案一：Windows Shell 原生缩略图 (System.Drawing) — 主进程调用
 * 方案二：macOS / Linux — 渲染进程 pdfjs-dist Canvas（见 pdfRender.ts）
 */

export async function getPdfThumbnail(filePath: string): Promise<string | null> {
  // 方案一：Windows Shell 原生缩略图
  const shellThumb = await tryShellThumbnail(filePath)
  if (shellThumb) return shellThumb

  // macOS / Linux 由渲染进程 pdfRender.ts 处理
  return null
}
