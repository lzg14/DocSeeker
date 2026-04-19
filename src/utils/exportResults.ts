import { FileRecord } from '../types'

export type ExportFormat = 'csv' | 'html' | 'txt'

interface ExportOptions {
  query: string
  files: FileRecord[]
  snippets?: Record<string, string>
  formatSize: (bytes: number) => string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatSizeSafe(bytes?: number | null): string {
  if (bytes == null || bytes < 0) return '-'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function toCsv(options: ExportOptions): string {
  const { files } = options
  const header = '\ufeff文件名,路径,类型,大小,修改时间,匹配类型\r\n'
  const rows = files
    .map((f) => {
      const cells = [
        escapeCsvCell(f.name),
        escapeCsvCell(f.path),
        escapeCsvCell(f.file_type ?? ''),
        escapeCsvCell(formatSizeSafe(f.size)),
        escapeCsvCell(formatDate(f.updated_at)),
        escapeCsvCell(f.match_type ?? ''),
      ]
      return cells.join(',') + '\r\n'
    })
    .join('')
  return header + rows
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function toHtml(options: ExportOptions): string {
  const { query, files, snippets = {} } = options
  const esc = (v: unknown) => escapeHtml(String(v ?? ''))

  const rows = files
    .map((f) => {
      const rawSnippet = snippets[f.path]
      const snippet = rawSnippet
        ? /<[^>]+>/.test(rawSnippet)
          ? esc(rawSnippet)
          : rawSnippet  // already has mark.hl highlight tags, safe to inject
        : `<span class="file-path">${esc(f.path)}</span>`
      return `<tr>
  <td>${esc(f.name)}</td>
  <td class="file-path">${esc(f.path)}</td>
  <td>${esc(f.file_type ?? '')}</td>
  <td>${formatSizeSafe(f.size)}</td>
  <td>${formatDate(f.updated_at)}</td>
  <td>${esc(f.match_type ?? '')}</td>
</tr>
<tr class="snippet-row"><td colspan="6" class="snippet-cell">${snippet}</td></tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>DocSeeker - 搜索结果: ${esc(query)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; background: #f9f9f9; }
  h1 { font-size: 1.2rem; color: #333; }
  .query { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th { background: #4a90e2; color: #fff; padding: 8px 12px; text-align: left; font-size: 0.85rem; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 0.85rem; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .file-path { color: #555; word-break: break-all; }
  .snippet-row td { padding-top: 0; border-bottom: 2px solid #e0e0e0; }
  .snippet-cell { color: #333; font-size: 0.8rem; background: #f5f5f5; padding: 6px 12px 10px; }
  mark.hl { background: #ffe066; color: #333; padding: 0 2px; border-radius: 2px; }
</style>
</head>
<body>
<h1>DocSeeker 搜索结果</h1>
<p class="query">关键词: <strong>${esc(query)}</strong> &nbsp;|&nbsp; 结果数: ${files.length}</p>
<table>
<thead>
<tr>
  <th>文件名</th>
  <th>路径</th>
  <th>类型</th>
  <th>大小</th>
  <th>修改时间</th>
  <th>匹配类型</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// TXT
// ---------------------------------------------------------------------------

export function toTxt(options: ExportOptions): string {
  const { query, files } = options
  const sep = '-'.repeat(80)
  const header = `DocSeeker 搜索结果
关键词: ${query}
结果数: ${files.length}
${sep}
`
  const entries = files
    .map(
      (f, i) =>
        `[${i + 1}] ${f.name}
路径: ${f.path}
类型: ${f.file_type ?? '-'} | 大小: ${formatSizeSafe(f.size)} | 修改: ${formatDate(f.updated_at)} | 匹配: ${f.match_type ?? '-'}
`,
    )
    .join(`${sep}\n`)
  return header + entries + sep
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadBlob(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export function exportResults(options: ExportOptions, format: ExportFormat): void {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)

  switch (format) {
    case 'csv':
      downloadBlob(toCsv(options), `docseeker-results-${timestamp}.csv`, 'text/csv;charset=utf-8')
      break
    case 'html':
      downloadBlob(toHtml(options), `docseeker-results-${timestamp}.html`, 'text/html;charset=utf-8')
      break
    case 'txt':
      downloadBlob(toTxt(options), `docseeker-results-${timestamp}.txt`, 'text/plain;charset=utf-8')
      break
  }
}
