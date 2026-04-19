# RAR 压缩包全文搜索实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 DocSeeker 支持 RAR 压缩包内文档的全文搜索，复用 ZIP 的嵌套递归逻辑。

**Architecture:** 在 `scanner.ts` 中新增 `extractTextFromRar()` 函数，底层使用 `node-unrar-js`（纯 JS WASM，无 native 依赖）。RAR 内嵌套的 Office 文档走已有解析函数，嵌套 ZIP/RAR 递归处理。与 ZIP 完全平级的实现。

**Tech Stack:** `node-unrar-js`（WASM，纯 JS），复用手写 `extractTextFromDocx/xlsx/pptx` 等已有解析函数。

---

## 文件结构

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `package.json` | 添加 `node-unrar-js` 依赖 |
| Modify | `electron/main/scanner.ts` | 添加 RAR 提取逻辑和扩展名注册 |
| Modify | `src/pages/SearchPage.tsx` | UI 过滤器添加 RAR 选项 |
| Modify | `src/context/LanguageContext.tsx` | 更新功能描述，添加 RAR |
| Modify | `docs/PROGRESS.md` | 格式表格更新 |
| Modify | `docs/ROADMAP.md` | ZIP/RAR 行更新 |

---

## 一、安装依赖

**文件:** `package.json`

- [ ] **Step 1: 添加 node-unrar-js 依赖**

将 `"node-unrar-js": "^1.0.1"` 添加到 `dependencies` 中：

```json
"dependencies": {
  "better-sqlite3": "^12.9.0",
  "chokidar": "^5.0.0",
  "electron-log": "^5.2.0",
  "electron-updater": "^6.8.3",
  "jszip": "^3.10.1",
  "mammoth": "^1.8.0",
  "node-unrar-js": "^1.0.1",
  "pdf-parse": "^1.1.1",
  "pdfjs-dist": "^4.10.38",
  "xlsx": "^0.18.5"
}
```

**验证命令:** `npm install`

---

## 二、后端：scanner.ts 修改

**文件:** `electron/main/scanner.ts`

### 2.1 添加导入和常量

在文件顶部（`import` 区附近，常量定义区）添加：

```typescript
// RAR 文件头魔数（第一个块：签名块）
const RAR_MAGIC = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])  // "Rar!\x1a\x07\x01\x00"
// RAR5 文件头魔数
const RAR5_MAGIC = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])  // RAR 5.x 签名相同

// 最大递归深度（与 ZIP 保持一致）
const MAX_ARCHIVE_DEPTH = 3
```

在 `import` 区添加：

```typescript
import { createExtractorFromData } from 'node-unrar-js'
```

### 2.2 添加 RAR 头检测函数

在 `isValidZip` 附近添加：

```typescript
// 检测文件是否为有效 RAR（通过签名块魔数）
function isValidRar(buffer: Buffer): boolean {
  return buffer.length >= 7 && buffer.slice(0, 7).equals(RAR_MAGIC)
}
```

### 2.3 添加 extractTextFromRar 函数

在 `extractTextFromZip` 函数后面（文件约 545 行附近）添加：

```typescript
// Extract plain text from RAR archives (supports nested archives)
// node-unrar-js returns ArrayBuffer; we write to temp file for nested processing
async function extractTextFromRar(filePath: string, depth = 0): Promise<string> {
  if (depth >= MAX_ARCHIVE_DEPTH) return ''
  const startTime = Date.now()
  try {
    const data = await fs.readFile(filePath)

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
            await fs.writeFile(tmpPath, Buffer.from(uint8))
            try {
              const nestedText = await extractTextFromRar(tmpPath, depth + 1)
              if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
            } finally {
              try { await fs.unlink(tmpPath) } catch {}
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
            await fs.writeFile(tmpPath, Buffer.from(uint8))
            try {
              const nestedText = await extractTextFromZip(tmpPath, depth + 1)
              if (nestedText.trim()) texts.push(`[${baseName}]\n${nestedText}`)
            } finally {
              try { await fs.unlink(tmpPath) } catch {}
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
          await fs.writeFile(tmpPath, buf)
          try {
            const content = await extractText(tmpPath, ext)
            if (content.trim()) texts.push(`[${baseName}]\n${content}`)
          } finally {
            try { await fs.unlink(tmpPath) } catch {}
          }
        }
      } catch (e) {
        // 单文件解压失败，跳过
      }
    }

    log.info(`[EXTRACT] RAR done: ${Date.now() - startTime}ms, ${texts.length} texts`)
    return texts.join('\n---\n')
  } catch (error) {
    log.warn(`[WARN] RAR failed: ${error.message}`)
    return ''
  }
}
```

### 2.4 将 .rar 添加到 SUPPORTED_EXTENSIONS

```typescript
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
  '.zip', '.rar',    // ← 添加 .rar
  '.mbox', '.eml',
  '.wps', '.wpp', '.et', '.dps'
])
```

### 2.5 将 .rar 添加到 getFileType map

```typescript
const fileTypeMap: Record<string, string> = {
  // ... 现有映射
  '.zip': 'zip',
  '.rar': 'rar',    // ← 添加
  '.mbox': 'email', '.eml': 'email',
  '.wps': 'docx', '.wpp': 'pptx', '.et': 'xlsx', '.dps': 'pptx'
}
```

### 2.6 在 extractText switch 中添加 .rar 分支

在 `extractText()` 函数（switch 语句，约 503 行附近）添加：

```typescript
    case '.zip':
      return extractTextFromZip(filePath)
    case '.rar':      // ← 新增
      return extractTextFromRar(filePath)
    case '.txt':
```

---

## 三、前端：SearchPage.tsx 过滤器

**文件:** `src/pages/SearchPage.tsx`

在 `FILE_TYPE_OPTIONS` 数组中添加 RAR 选项（放在 ZIP 后面）：

```typescript
const FILE_TYPE_OPTIONS = [
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pptx', label: 'PPT' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: '文本' },
  { value: 'rtf', label: 'RTF' },
  { value: 'chm', label: 'CHM' },
  { value: 'odf', label: 'ODF' },
  { value: 'email', label: '邮件' },
  { value: 'epub', label: 'EPUB' },
  { value: 'zip', label: 'ZIP' },
  { value: 'rar', label: 'RAR' },   // ← 新增
]
```

---

## 四、i18n 更新

**文件:** `src/context/LanguageContext.tsx`

### 4.1 更新 guide.overviewDesc（中文）

约 189 行，将 `ZIP · Email` 改为 `ZIP · RAR · Email`：

```typescript
'guide.overviewDesc': 'DocSeeker 是一款高效的本地文档全文搜索工具，基于 Electron + SQLite FTS5 + BM25 构建，支持 AND/OR/NOT/正则/前缀等多种搜索语法，按相关性排序。所有数据存储在本地，隐私安全。支持以下文档格式的全文索引与搜索：Word · Excel · PowerPoint · PDF · Text/MD/JSON/CSV · RTF · CHM · ODF · EPUB · ZIP · RAR · Email · WPS',
```

### 4.2 更新 guide.overviewDesc（英文）

约 365 行，将 `ZIP · Email` 改为 `ZIP · RAR · Email`：

```typescript
'guide.overviewDesc': 'DocSeeker is an efficient local full-text search tool built on Electron + SQLite FTS5 + BM25, supporting AND/OR/NOT/regex/prefix search with relevance ranking. All data stored locally for privacy. Indexes and searches: Word · Excel · PowerPoint · PDF · Text/MD/JSON/CSV · RTF · CHM · ODF · EPUB · ZIP · RAR · Email · WPS',
```

---

## 五、文档更新

### 5.1 PROGRESS.md

**文件:** `docs/PROGRESS.md`

更新格式表格，将 `ZIP` 改为 `ZIP / RAR`：

```markdown
| ZIP | .zip（内部文档） | ✅ | ✅ ZIP |
```

更新待完善功能表，将 `RAR 待实现` 改为已完成：

```markdown
| RAR 压缩包支持 | ✅ | ZIP 已完成；RAR 待实现 |   ← 删除这一行
```

### 5.2 ROADMAP.md

**文件:** `docs/ROADMAP.md`

更新格式表格（约第 20 行）：

```markdown
| ZIP/RAR | .zip .rar（内部文档） | ✅ | ✅ ZIP |
```

更新 Phase 3 里程碑（约第 114 行）：

```markdown
- [x] **M3.1** ZIP / RAR 压缩包内全文搜索
```

### 5.3 phase4-remaining.md

**文件:** `docs/superpowers/plans/2026-04-18-phase4-remaining.md`

将 RAR 从待完善移到已完成，并添加说明。

---

## 六、验证

构建测试：

```bash
npm run build
```

预期：无编译错误，`out/` 目录生成正常。

---

## 七、任务总览

| 任务 | 说明 | 状态 |
|------|------|------|
| 1 | 安装 node-unrar-js 依赖 | ❌ |
| 2 | scanner.ts: RAR 头检测 + extractTextFromRar | ❌ |
| 3 | scanner.ts: .rar 加入 SUPPORTED_EXTENSIONS + getFileType + extractText switch | ❌ |
| 4 | SearchPage.tsx: UI 过滤器添加 RAR | ❌ |
| 5 | LanguageContext.tsx: 更新功能描述（中文 + 英文） | ❌ |
| 6 | 文档更新（PROGRESS.md / ROADMAP.md） | ❌ |
| 7 | `npm run build` 验证编译通过 | ❌ |
