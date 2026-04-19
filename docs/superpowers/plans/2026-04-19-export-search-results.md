# 搜索结果导出功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DocSeeker 添加搜索结果导出功能，支持 CSV / HTML / TXT 三种格式。

**Architecture:** 前端纯 JS 生成导出内容，通过 Blob + URL.createObjectURL 触发浏览器下载，无需主进程参与。

**Tech Stack:** 纯前端实现，无新依赖。

---

## 文件影响范围

| 文件 | 操作 |
|------|------|
| `src/utils/exportResults.ts` | 新建 — 导出核心逻辑 |
| `src/pages/SearchPage.tsx` | 修改 — 添加导出按钮和下拉菜单 |
| `src/context/LanguageContext.tsx` | 修改 — 添加中英文字符串 |

---

## Task 1: 导出工具模块

**Files:**
- Create: `src/utils/exportResults.ts`

- [ ] **Step 1: 创建导出工具模块**

```typescript
// src/utils/exportResults.ts

import { FileRecord } from '../types'

export type ExportFormat = 'csv' | 'html' | 'txt'

interface ExportOptions {
  query: string
  files: FileRecord[]
  snippets?: Record<string, string>
  formatSize: (bytes: number) => string
}

/**
 * 格式化文件大小，若为 0 或负数返回 "-"
 */
function formatSizeSafe(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '-'
  const mb = bytes / (1024 * 1024)
  const kb = bytes / 1024
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  if (kb >= 1) return `${kb.toFixed(2)} KB`
  return `${bytes} B`
}

/**
 * 格式化日期字符串
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN')
  } catch {
    return '-'
  }
}

/**
 * 转义 CSV 单元格内容（处理引号和逗号）
 */
function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * 导出为 CSV 格式
 */
function toCsv(options: ExportOptions): string {
  const lines: string[] = []
  lines.push('文件名,路径,类型,大小,修改时间,匹配类型')

  for (const file of options.files) {
    const name = escapeCsvCell(file.name || '')
    const path = escapeCsvCell(file.path || '')
    const type = escapeCsvCell(file.file_type || '-')
    const size = formatSizeSafe(file.size)
    const date = formatDate(file.updated_at)
    const matchType = file.match_type || '-'
    lines.push(`${name},${path},${type},${size},${date},${matchType}`)
  }

  return lines.join('\r\n')
}

/**
 * 导出为 HTML 格式
 */
function toHtml(options: ExportOptions): string {
  const rows = options.files.map(file => {
    const snippet = options.snippets?.[file.path] || ''
    return `
    <tr>
      <td>${escapeHtml(file.name || '')}</td>
      <td>${escapeHtml(file.path || '')}</td>
      <td>${escapeHtml(file.file_type || '-')}</td>
      <td>${escapeHtml(formatSizeSafe(file.size))}</td>
      <td>${escapeHtml(formatDate(file.updated_at))}</td>
      <td>${escapeHtml(file.match_type || '-')}</td>
      <td>${snippet}</td>
    </tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>DocSeeker 搜索结果 - ${escapeHtml(options.query)}</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; }
h2 { color: #333; }
table { border-collapse: collapse; width: 100%; margin-top: 16px; }
th { background: #1976d2; color: white; padding: 8px 12px; text-align: left; }
td { padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
tr:hover { background: #f5f5f5; }
.keyword { color: #e91e63; font-weight: bold; }
tr { vertical-align: top; }
</style>
</head>
<body>
<h2>搜索结果: ${escapeHtml(options.query)}</h2>
<p>共 ${options.files.length} 个结果</p>
<table>
<thead>
<tr>
  <th>文件名</th>
  <th>路径</th>
  <th>类型</th>
  <th>大小</th>
  <th>修改时间</th>
  <th>匹配</th>
  <th>片段</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`
}

/**
 * HTML 转义
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 导出为 TXT 格式
 */
function toTxt(options: ExportOptions): string {
  const lines: string[] = []
  lines.push(`DocSeeker 搜索结果: ${options.query}`)
  lines.push(`共 ${options.files.length} 个结果\n`)
  lines.push('='.repeat(80))

  for (let i = 0; i < options.files.length; i++) {
    const file = options.files[i]
    lines.push(`[${i + 1}] ${file.name}`)
    lines.push(`    路径: ${file.path}`)
    lines.push(`    类型: ${file.file_type || '-'}  大小: ${formatSizeSafe(file.size)}  修改: ${formatDate(file.updated_at)}`)
    lines.push(`    匹配: ${file.match_type || '-'}`)
    const snippet = options.snippets?.[file.path]
    if (snippet) {
      // 去除 HTML 标签后的纯文本片段
      const plainSnippet = snippet.replace(/<[^>]+>/g, '')
      lines.push(`    片段: ${plainSnippet}`)
    }
    lines.push('')
  }

  return lines.join('\r\n')
}

/**
 * 触发文件下载
 */
function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * 主导出函数
 */
export function exportResults(options: ExportOptions, format: ExportFormat): void {
  let content: string
  let filename: string
  let mimeType: string

  const safeQuery = (options.query || 'search').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50)
  const timestamp = new Date().toISOString().slice(0, 10)

  switch (format) {
    case 'csv':
      content = toCsv(options)
      filename = `docseeker-${safeQuery}-${timestamp}.csv`
      mimeType = 'text/csv'
      break
    case 'html':
      content = toHtml(options)
      filename = `docseeker-${safeQuery}-${timestamp}.html`
      mimeType = 'text/html'
      break
    case 'txt':
      content = toTxt(options)
      filename = `docseeker-${safeQuery}-${timestamp}.txt`
      mimeType = 'text/plain'
      break
    default:
      return
  }

  downloadBlob(content, filename, mimeType)
}
```

- [ ] **Step 2: 提交**

```bash
git add src/utils/exportResults.ts
git commit -m "feat(export): add export utility for CSV/HTML/TXT search results"
```

---

## Task 2: SearchPage 导出按钮 UI

**Files:**
- Modify: `src/pages/SearchPage.tsx:1-5`（import 部分）
- Modify: `src/pages/SearchPage.tsx`（toolbar 添加导出按钮）

- [ ] **Step 1: 添加 import**

在 `SearchPage.tsx` 第 1-6 行 `import { formatSize }` 后添加：

```typescript
import { exportResults, ExportFormat } from '../utils/exportResults'
```

- [ ] **Step 2: 添加状态和辅助函数**

在 `SearchPage.tsx` 的 `useState` 声明区域（大约第 64-69 行附近）添加：

```typescript
const [showExportMenu, setShowExportMenu] = useState(false)
```

在 `formatSize` 附近添加（大约第 71 行后）：

```typescript
const exportMenuRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: 添加工具函数**

在 `SearchPage.tsx` 的 `hasActiveFilters` 计算后添加（约第 335 行后）：

```typescript
// 关闭导出菜单的点击外部处理
useEffect(() => {
  if (!showExportMenu) return
  const handleClickOutside = (e: MouseEvent) => {
    if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
      setShowExportMenu(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [showExportMenu])

const handleExport = (format: ExportFormat) => {
  exportResults({ query: searchQuery, files, snippets, formatSize }, format)
  setShowExportMenu(false)
}
```

- [ ] **Step 4: 在工具栏添加导出按钮**

在 `SearchPage.tsx` 的 toolbar 区域（`search-toolbar` div 内），在 `?` 按钮后添加：

```tsx
{/* 导出按钮 */}
{files.length > 0 && (
  <div className="export-wrapper" ref={exportMenuRef} style={{ position: 'relative' }}>
    <button
      className={`toolbar-btn ${showExportMenu ? 'active' : ''}`}
      onClick={() => setShowExportMenu(v => !v)}
      title={t('search.export') || '导出结果'}
    >
      {t('search.export') || '导出'}
    </button>
    {showExportMenu && (
      <div className="export-dropdown">
        <div className="export-dropdown-item" onClick={() => handleExport('csv')}>
          <span>📊</span> {t('search.exportCsv')} || 'CSV 表格'
        </div>
        <div className="export-dropdown-item" onClick={() => handleExport('html')}>
          <span>🌐</span> {t('search.exportHtml')} || 'HTML 网页'
        </div>
        <div className="export-dropdown-item" onClick={() => handleExport('txt')}>
          <span>📝</span> {t('search.exportTxt')} || 'TXT 文本'
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: 提交**

```bash
git add src/pages/SearchPage.tsx
git commit -m "feat(export): add export button and dropdown to SearchPage toolbar"
```

---

## Task 3: 样式

**Files:**
- Modify: `src/App.css` 或对应样式文件

- [ ] **Step 1: 添加导出下拉菜单样式**

在 `App.css` 末尾添加：

```css
/* 导出下拉菜单 */
.export-wrapper {
  display: inline-block;
}

.export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  min-width: 160px;
  z-index: 200;
  overflow: hidden;
}

.export-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #333);
  transition: background 0.15s;
}

.export-dropdown-item:hover {
  background: var(--bg-hover, #f5f5f5);
}
```

- [ ] **Step 2: 提交**

```bash
git add src/App.css
git commit -m "feat(export): add export dropdown styles to App.css"
```

---

## Task 4: i18n 翻译

**Files:**
- Modify: `src/context/LanguageContext.tsx`

- [ ] **Step 1: 添加翻译字符串**

在 `translations` 对象的 `zh` 和 `en` 中分别添加：

中文部分（zh 对象中，与 `search` 同级）：

```typescript
search: { ... },
filelist: { ... },
detail: { ... },
contextMenu: { ... },
// 新增 export 部分
export: {
  export: '导出',
  exportCsv: 'CSV 表格',
  exportHtml: 'HTML 网页',
  exportTxt: 'TXT 文本',
},
```

英文部分（en 对象中）：

```typescript
export: {
  export: 'Export',
  exportCsv: 'CSV Spreadsheet',
  exportHtml: 'HTML Page',
  exportTxt: 'TXT Text',
},
```

**说明：** 如果 `export` 作为 `search.export` 形式嵌入 search 对象中，则在 `search` 对象内部添加对应 key。

- [ ] **Step 2: 提交**

```bash
git add src/context/LanguageContext.tsx
git commit -m "feat(export): add i18n strings for export feature"
```

---

## Task 5: 功能验证

**验证步骤：**

1. 启动应用，执行一次搜索，确保有结果
2. 工具栏出现"导出"按钮 ✅
3. 点击"导出"按钮，下拉显示 CSV / HTML / TXT 三个选项 ✅
4. 点击 CSV → 浏览器下载 `.csv` 文件 ✅
5. 打开 CSV 文件，中文字符正确、无乱码 ✅
6. 点击 HTML → 浏览器下载 `.html` 文件 ✅
7. 用浏览器打开 HTML 文件，表格正常显示、关键词高亮 ✅
8. 点击 TXT → 浏览器下载 `.txt` 文件 ✅
9. 用记事本打开 TXT 文件，中文正常显示 ✅
10. 关闭导出菜单后，点击外部自动关闭 ✅

---

## 依赖关系

```
Task 1 (导出工具) → Task 3 (样式) → Task 4 (i18n)
          ↓
    Task 2 (SearchPage 集成上述三个)
          ↓
    Task 5 (验证)
```

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-export-search-results.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
