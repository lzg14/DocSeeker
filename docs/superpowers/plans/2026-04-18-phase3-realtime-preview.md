# Phase 3: 实时感知 + 多格式预览 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Windows NTFS USN Journal 实时文件监控 + 多格式预览面板 + AnyTXT 高价值功能（搜索延迟/结果过滤/右键集成/隐藏文件扫描）。

**Architecture:**

**Part 1 实时监控：**
- `electron/main/usnWatcher.ts`：Windows USN Journal 读取封装（PowerShell 脚本）
- 每个监控目录对应一个 USN watcher，读取 `$Extend\$UsnJrnl:$J` 获取变更日志
- 文件变更通过 IPC 通知主进程，进入后台增量索引队列
- 监控状态持久化到 `meta.db`，重启后可恢复

**Part 2 文件预览：**
- `electron/main/previewRegistry.ts`：按文件类型路由到对应预览处理器
- `src/components/preview/`：React 预览组件（ImagePreview / PdfPreview / CodePreview / OfficePreview）
- 预览内容通过 IPC `preview-file` 获取，前端按类型渲染

**Part 3 AnyTXT 高价值功能：**
- 搜索延迟 debounce、结果中二次过滤、右键资源管理器集成
- 扫描设置：隐藏文件开关、系统文件开关

**Tech Stack:** TypeScript, Windows USN Journal API (PowerShell), React, highlight.js

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `electron/main/usnWatcher.ts` | USN Journal 读取、目录监控、变更事件发射 |
| 创建 | `electron/main/watchQueue.ts` | 文件变更队列、后台增量入索引 |
| 创建 | `electron/main/previewRegistry.ts` | 按文件类型路由到预览处理器 |
| 创建 | `src/components/preview/ImagePreview.tsx` | 图片文件预览 |
| 创建 | `src/components/preview/PdfPreview.tsx` | PDF 文件预览（iframe） |
| 创建 | `src/components/preview/CodePreview.tsx` | 代码/Markdown 预览（highlight.js） |
| 创建 | `src/components/preview/OfficePreview.tsx` | Office 文档预览（复用提取器） |
| 创建 | `src/components/preview/TextPreview.tsx` | 纯文本预览（fallback） |
| 修改 | `electron/main/ipc.ts` | 注册监控 IPC、preview-file IPC |
| 修改 | `electron/main/index.ts` | 启动时恢复监控、注册 watcher 服务 |
| 修改 | `electron/preload/index.ts` | 暴露 monitor-start/stop/status、preview-file |
| 修改 | `src/components/FileDetail.tsx` | 替换文本预览为 PreviewPanel 组件 |
| 修改 | `src/components/StatusBar.tsx` | 显示实时监控状态指示器 |
| 修改 | `src/styles.css` | 预览面板样式 |
| 修改 | `src/pages/ScanPage.tsx` | 扫描设置：隐藏文件、系统文件开关 |
| 修改 | `src/pages/SearchPage.tsx` | 搜索延迟 + 结果中查找 + 托盘启动开关 |
| 修改 | `src/pages/SettingsPage.tsx` | 新建：设置页面（整合各类开关） |
| 修改 | `electron/main/index.ts` | 开机启动注册、托盘行为 |

---

## Part 1: 实时文件监控

---

### Task 1: Windows USN Journal 监控服务

**Files:**
- Create: `electron/main/usnWatcher.ts`

- [ ] **Step 1: 创建 usnWatcher.ts 基础结构**

```typescript
// electron/main/usnWatcher.ts
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import log from 'electron-log/main'

// USN Journal 常量
const USN_REASON_CREATE = 0x00000001
const USN_REASON_DELETE = 0x00000002
const USN_REASONRename = 0x00000004
const USN_REASON_CONTENT_MODIFY = 0x00000010
const USN_REASON_FILE_NAME_MODIFY = 0x00000020

const RELEVANT_REASONS = USN_REASON_CREATE | USN_REASON_DELETE | USN_REASONRename |
  USN_REASON_CONTENT_MODIFY | USN_REASON_FILE_NAME_MODIFY

export interface FileChange {
  path: string
  reason: 'create' | 'delete' | 'modify' | 'rename'
  timestamp: number
}

export class UsnWatcher extends EventEmitter {
  private folderPath: string
  private intervalMs: number
  private lastUsn: bigint = 0n
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(folderPath: string, intervalMs = 2000) {
    super()
    this.folderPath = folderPath
    this.intervalMs = intervalMs
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.poll()
    log.info(`[USN] Started watching: ${this.folderPath}`)
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    log.info(`[USN] Stopped watching: ${this.folderPath}`)
  }

  isRunning(): boolean {
    return this.running
  }

  private async poll(): Promise<void> {
    if (!this.running) return
    try {
      await this.checkUsnJournal()
    } catch (err) {
      log.warn(`[USN] Poll error for ${this.folderPath}:`, err)
    }
    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.intervalMs)
    }
  }

  private async checkUsnJournal(): Promise<void> {
    // 获取文件夹所在的驱动器根路径
    const root = path.parse(this.folderPath).root
    const volPath = '\\\\?\\' + root.slice(0, -1)  // e.g. \\?\C:

    try {
      const usn = await readUsnJournal(volPath, this.lastUsn)
      if (usn.changes.length > 0) {
        for (const change of usn.changes) {
          // 只处理在监控目录下的文件
          if (change.path.toLowerCase().startsWith(this.folderPath.toLowerCase())) {
            this.emit('change', change)
          }
        }
        this.lastUsn = usn.nextUsn
      }
    } catch (err) {
      // 权限不足或驱动器不支持 USN，跳过
      log.debug(`[USN] Journal read skipped: ${err.message}`)
    }
  }
}

async function readUsnJournal(volumePath: string, startUsn: bigint): Promise<{ nextUsn: bigint; changes: FileChange[] }> {
  // 使用 fs.openFlag 打开卷，调用 FSCTL_READ_USN_JOURNAL
  // Node.js 目前没有原生 USN API，使用 spawn python/native 模块或 PowerShell 脚本
  // 推荐方案：使用 node-ffi-napi + kernel32.dll 或 PowerShell 脚本
  // 临时方案（Task 1 完成后验证可行性）：
  return { nextUsn: startUsn, changes: [] }
}
```

- [ ] **Step 2: 确定 USN Journal 实现方案并实现 readUsnJournal**

USN Journal 需要 Windows Native API，有三种实现路径：

| 方案 | 实现方式 | 优点 | 缺点 |
|------|---------|------|------|
| A. PowerShell 脚本 | `Get-FileUSN -Volume C:` | 无依赖，Node.js 可调用 powershell.exe | 每次调用启动进程，有延迟 |
| B. node-ffi-napi | 调用 kernel32!DeviceIoControl | 高性能，接近原生 | 需要编译 native 模块 |
| C. python-elevated 子进程 | Python win32file.USN_JOURNAL_DATA | 成熟稳定 | 需要 Python 环境 |

**推荐方案 A（Task 1 完成）：** PowerShell 脚本封装
- 创建 `resources/usn-helper.ps1`，接受 volume letter 和 start USN，返回 JSON
- 每次 poll 约 10-50ms 延迟，可接受（轮询间隔 2s）
- 无外部依赖，Electron 打包友好

```powershell
# resources/usn-helper.ps1
param(
    [string]$Volume,
    [long]$StartUsn = 0
)
Add-Type -AssemblyName System.Core
$usn = [System.IO.FileSystem]::ReadUsnJournal($Volume, $StartUsn)
$usn | ConvertTo-Json -Compress
```

> **注意：** USN Journal 方案存在可行性风险。如果 PowerShell 方案延迟过高或权限问题，在 Task 1 结束时评估是否改用 polling（定时 mtime 对比）。核心目标是在 Phase 3 内完成可用的实时监控。

- [ ] **Step 3: 实现 PowerShell USN 读取封装**

```typescript
// electron/main/usnWatcher.ts 补充
import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'

async function readUsnJournal(volumeLetter: string, startUsn: bigint): Promise<{ nextUsn: bigint; changes: FileChange[] }> {
  const scriptPath = join(app.isPackaged ? process.resourcesPath : __dirname, '../resources/usn-helper.ps1')

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Volume', volumeLetter,
      '-StartUsn', startUsn.toString()
    ])

    let stdout = ''
    let stderr = ''
    ps.stdout.on('data', (d) => { stdout += d })
    ps.stderr.on('data', (d) => { stderr += d })
    ps.on('close', () => {
      try {
        if (!stdout.trim()) {
          resolve({ nextUsn: startUsn, changes: [] })
          return
        }
        const entries = JSON.parse(stdout)
        const changes: FileChange[] = entries.map((e: any) => ({
          path: e.Path,
          reason: mapReason(e.Reason),
          timestamp: e.Timestamp || Date.now()
        }))
        const maxUsn = entries.reduce((max: bigint, e: any) => BigInt(e.USN) > max ? BigInt(e.USN) : max, startUsn)
        resolve({ nextUsn: maxUsn, changes })
      } catch {
        resolve({ nextUsn: startUsn, changes: [] })
      }
    })
  })
}

function mapReason(reason: number): FileChange['reason'] {
  if (reason & USN_REASON_CREATE) return 'create'
  if (reason & USN_REASON_DELETE) return 'delete'
  return 'modify'
}
```

- [ ] **Step 4: 提交**

```bash
git add electron/main/usnWatcher.ts resources/usn-helper.ps1
git commit -m "feat(watch): add Windows NTFS USN Journal watcher for real-time monitoring"
```

---

### Task 2: 监控状态管理 + IPC 暴露

**Files:**
- Create: `electron/main/watchManager.ts`
- Modify: `electron/main/ipc.ts`

- [ ] **Step 1: 创建 watchManager.ts 管理多目录监控**

```typescript
// electron/main/watchManager.ts
import { UsnWatcher, FileChange } from './usnWatcher'
import { getAllScannedFoldersMeta, getScannedFolderById } from './meta'
import { queueFileChange } from './watchQueue'
import log from 'electron-log/main'
import path from 'path'

class WatchManager {
  private watchers: Map<string, UsnWatcher> = new Map()

  async startAll(): Promise<void> {
    // 从 meta.db 读取所有已启用监控的目录
    const folders = getAllScannedFoldersMeta()
    for (const folder of folders) {
      if (folder.schedule_enabled) {
        await this.startWatching(folder.path)
      }
    }
    log.info(`[Watch] Started ${this.watchers.size} watchers on startup`)
  }

  async startWatching(folderPath: string): Promise<boolean> {
    if (this.watchers.has(folderPath)) return true
    try {
      const watcher = new UsnWatcher(folderPath, 2000)
      watcher.on('change', (change: FileChange) => {
        log.debug(`[Watch] File ${change.reason}: ${change.path}`)
        queueFileChange(change)
      })
      watcher.start()
      this.watchers.set(folderPath, watcher)
      return true
    } catch (err) {
      log.error(`[Watch] Failed to start watching ${folderPath}:`, err)
      return false
    }
  }

  stopWatching(folderPath: string): void {
    const watcher = this.watchers.get(folderPath)
    if (watcher) {
      watcher.stop()
      this.watchers.delete(folderPath)
    }
  }

  getStatus(folderPath: string): boolean {
    return this.watchers.has(folderPath)
  }

  getAllWatched(): string[] {
    return [...this.watchers.keys()]
  }

  stopAll(): void {
    for (const watcher of this.watchers.values()) {
      watcher.stop()
    }
    this.watchers.clear()
  }
}

export const watchManager = new WatchManager()
```

- [ ] **Step 2: 创建 watchQueue.ts 文件变更队列**

```typescript
// electron/main/watchQueue.ts
import { FileChange } from './usnWatcher'
import { updateOrInsertFileByPath } from './search'
import log from 'electron-log/main'

// 变更队列：去重 + 防抖，避免同一文件频繁变更
const pending = new Map<string, FileChange>()
let flushTimer: NodeJS.Timeout | null = null
const FLUSH_INTERVAL = 1000  // 1 秒批量处理

export function queueFileChange(change: FileChange): void {
  // delete 事件直接处理，不合并
  if (change.reason === 'delete') {
    flushDelete(change.path)
    return
  }
  pending.set(change.path, change)
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPending()
  }, FLUSH_INTERVAL)
}

async function flushPending(): Promise<void> {
  if (pending.size === 0) return
  const changes = [...pending.values()]
  pending.clear()

  for (const change of changes) {
    try {
      if (change.reason === 'create' || change.reason === 'modify') {
        await updateOrInsertFileByPath(change.path)
      }
    } catch (err) {
      log.warn(`[WatchQueue] Failed to index: ${change.path}`, err)
    }
  }
  log.info(`[WatchQueue] Flushed ${changes.length} file changes`)
}

async function flushDelete(filePath: string): Promise<void> {
  try {
    // 调用 search.ts 中已有的 deleteFileByPath
    const { deleteFileByPath } = await import('./search')
    deleteFileByPath(filePath)
  } catch (err) {
    log.warn(`[WatchQueue] Failed to delete: ${filePath}`, err)
  }
}
```

- [ ] **Step 3: 在 ipc.ts 中注册监控 IPC handlers**

找到 `ipcMain.handle` 注册区域，添加：

```typescript
// 启动目录监控
ipcMain.handle('watch-start', async (_, folderPath: string): Promise<boolean> => {
  return watchManager.startWatching(folderPath)
})

// 停止目录监控
ipcMain.handle('watch-stop', async (_, folderPath: string): Promise<void> => {
  watchManager.stopWatching(folderPath)
})

// 获取监控状态
ipcMain.handle('watch-status', async (_, folderPath: string): Promise<boolean> => {
  return watchManager.getStatus(folderPath)
})

// 获取所有监控目录
ipcMain.handle('watch-get-all', async (): Promise<string[]> => {
  return watchManager.getAllWatched()
})
```

- [ ] **Step 4: 在 index.ts 中启动时恢复监控**

在 `app.whenReady()` 内、现有初始化调用附近添加：

```typescript
// 恢复目录监控
watchManager.startAll().catch(err => log.error('Failed to start watchers:', err))
```

- [ ] **Step 5: 提交**

```bash
git add electron/main/watchManager.ts electron/main/watchQueue.ts electron/main/ipc.ts electron/main/index.ts
git commit -m "feat(watch): add watch manager with change queue and IPC handlers"
```

---

### Task 3: 搜索数据库的 updateOrInsertFileByPath

> **前置依赖：** Task 2 依赖 `search.ts` 中的 `updateOrInsertFileByPath` 函数。
> 如果 Phase 2（master-plan）已完成，`search.ts` 已有该函数或等价实现，跳过此 Task。
> 如果未完成，需要在 `search.ts` 中补充实现。

**Files:**
- Modify: `electron/main/search.ts`

- [ ] **Step 1: 如果 search.ts 中无 updateOrInsertFileByPath，补充实现**

在 `search.ts` 中搜索 `updateOrInsertFileByPath`。如果不存在，添加：

```typescript
import { insertFile, updateFile, getFileByPath } from './database'
import { extractTextFromFile } from './scanWorker'  // 提取函数需要独立出来

export async function updateOrInsertFileByPath(filePath: string): Promise<void> {
  const fs = require('fs')
  const path = require('path')
  const crypto = require('crypto')

  const stats = fs.statSync(filePath)
  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase()
  const isSupported = SUPPORTED_EXTENSIONS.has(ext)

  let content: string | null = null
  if (isSupported) {
    try {
      content = await extractTextFromFile(filePath, ext, stats.size)
    } catch { /* ignore */ }
  }

  const hash = stats.size > 0 && stats.size < 100 * 1024 * 1024
    ? crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
    : null

  const fileRecord = {
    path: filePath, name, size: stats.size,
    hash, file_type: getFileType(ext), content,
    is_supported: isSupported ? 1 : 0
  }

  const existing = getFileByPath(filePath)
  if (existing) {
    if (existing.hash !== hash || existing.content !== content) {
      updateFile(existing.id!, fileRecord)
    }
  } else {
    insertFile(fileRecord)
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add electron/main/search.ts
git commit -m "feat(watch): add updateOrInsertFileByPath for real-time indexing"
```

---

### Task 4: 前端监控状态指示器

**Files:**
- Modify: `src/components/StatusBar.tsx`
- Modify: `electron/preload/index.ts`

- [ ] **Step 1: 在 preload 中暴露监控状态 IPC**

在 `electron/preload/index.ts` 的 `ElectronAPI` 接口中添加：

```typescript
watchGetAll: () => Promise<string[]>
onWatchChanged: (callback: (watched: string[]) => void) => () => void
```

在 `electronAPI` 对象中添加：

```typescript
watchGetAll: () => ipcRenderer.invoke('watch-get-all'),

onWatchChanged: (callback) => {
  const handler = (_: any, watched: string[]) => callback(watched)
  ipcRenderer.on('watch-changed', handler)
  return () => ipcRenderer.removeListener('watch-changed', handler)
},
```

- [ ] **Step 2: 在 ipc.ts 中发送 watch-changed 事件**

在 `watchManager.startWatching` / `stopWatching` 成功后，添加：

```typescript
// 在 BrowserWindow 存在时通知前端
const { getFocusedWindow } = require('electron')
const win = getFocusedWindow()
if (win) {
  win.webContents.send('watch-changed', watchManager.getAllWatched())
}
```

- [ ] **Step 3: 在 StatusBar.tsx 中显示监控状态指示器**

在 `StatusBar.tsx` 的状态区域添加：

```tsx
const [watchedCount, setWatchedCount] = useState(0)

useEffect(() => {
  const load = async () => {
    const watched = await window.electron.watchGetAll()
    setWatchedCount(watched.length)
  }
  load()
  const unsubscribe = window.electron.onWatchChanged((watched) => {
    setWatchedCount(watched.length)
  })
  return unsubscribe
}, [])

// 在 JSX 中渲染（放在文件数量旁边）：
{watchedCount > 0 && (
  <span style={{ color: '#4caf50', marginLeft: '8px' }} title={`${watchedCount} 个目录正在实时监控`}>
    ● {watchedCount} 监控中
  </span>
)}
```

- [ ] **Step 4: 提交**

```bash
git add electron/preload/index.ts electron/main/ipc.ts src/components/StatusBar.tsx
git commit -m "feat(watch): add watch status indicator in StatusBar"
```

---

## Part 2: 多格式文件预览

---

### Task 5: 预览注册中心

**Files:**
- Create: `electron/main/previewRegistry.ts`
- Modify: `electron/main/ipc.ts`

- [ ] **Step 1: 创建 previewRegistry.ts**

```typescript
// electron/main/previewRegistry.ts
import fs from 'fs/promises'
import path from 'path'
import log from 'electron-log/main'

export type PreviewType = 'text' | 'image' | 'pdf' | 'code' | 'office' | 'unknown'

export interface PreviewResult {
  type: PreviewType
  content?: string       // text / code / office 提取的文本
  imageData?: string     // image: base64 data URL
  pdfUrl?: string        // pdf: file:// URL
  error?: string
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'])
const CODE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html', '.xml', '.json', '.yaml', '.yml', '.sh', '.bat', '.ps1', '.sql'])
const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mdown'])
const PDF_EXTS = new Set(['.pdf'])
const OFFICE_EXTS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.pdf', '.txt', '.md', '.rtf'])

export function detectPreviewType(ext: string): PreviewType {
  const e = ext.toLowerCase()
  if (IMAGE_EXTS.has(e)) return 'image'
  if (PDF_EXTS.has(e)) return 'pdf'
  if (MARKDOWN_EXTS.has(e)) return 'code'  // markdown 用 code 渲染
  if (CODE_EXTS.has(e)) return 'code'
  if (OFFICE_EXTS.has(e)) return 'office'
  return 'text'
}

export async function getFilePreview(filePath: string): Promise<PreviewResult> {
  const ext = path.extname(filePath).toLowerCase()
  const type = detectPreviewType(ext)

  try {
    switch (type) {
      case 'image':
        return await previewImage(filePath)
      case 'pdf':
        return { type: 'pdf', pdfUrl: `file://${filePath}` }
      case 'code':
        return await previewCode(filePath)
      case 'office':
        return await previewOffice(filePath, ext)
      default:
        return await previewText(filePath)
    }
  } catch (err) {
    log.warn(`[Preview] Failed for ${filePath}:`, err)
    return { type, error: (err as Error).message }
  }
}

async function previewImage(filePath: string): Promise<PreviewResult> {
  const buf = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml'
  }
  const mime = mimeMap[ext] || 'image/png'
  const base64 = buf.toString('base64')
  return { type: 'image', imageData: `data:${mime};base64,${base64}` }
}

async function previewCode(filePath: string): Promise<PreviewResult> {
  // 限制预览文件大小 500KB
  const stats = await fs.stat(filePath)
  if (stats.size > 512 * 1024) {
    const buf = await fs.readFile(filePath.slice(0, 512 * 1024), 'utf-8')
    return { type: 'code', content: buf + '\n\n... (文件过大，已截断)' }
  }
  const content = await fs.readFile(filePath, 'utf-8')
  return { type: 'code', content }
}

async function previewText(filePath: string): Promise<PreviewResult> {
  const stats = await fs.stat(filePath)
  if (stats.size > 100 * 1024) {
    const buf = await fs.readFile(filePath.slice(0, 100 * 1024), 'utf-8')
    return { type: 'text', content: buf + '\n\n... (文件过大，已截断)' }
  }
  const content = await fs.readFile(filePath, 'utf-8')
  return { type: 'text', content }
}

async function previewOffice(filePath: string, ext: string): Promise<PreviewResult> {
  // 复用已有的提取逻辑（通过 IPC 调用 extractFileContent）
  // 这里直接调用会有循环依赖风险，改由 IPC handler 统一处理
  return { type: 'office', content: '' }  // 占位，后续 Task 9 实现
}
```

- [ ] **Step 2: 在 ipc.ts 中注册 preview-file IPC handler**

```typescript
import { getFilePreview } from './previewRegistry'

// 文件预览
ipcMain.handle('preview-file', async (_, filePath: string) => {
  return getFilePreview(filePath)
})
```

- [ ] **Step 3: 提交**

```bash
git add electron/main/previewRegistry.ts electron/main/ipc.ts
git commit -m "feat(preview): add preview registry with type detection"
```

---

### Task 6: 文本/代码预览组件

**Files:**
- Create: `src/components/preview/TextPreview.tsx`
- Create: `src/components/preview/CodePreview.tsx`

> 注意：需要安装 `highlight.js`。如果 package.json 中已有，跳过安装步骤。

- [ ] **Step 1: 检查 highlight.js 是否已安装**

```bash
grep -n "highlight.js" D:/ProjectFile/docSeeker/package.json
```

如果未安装：
```bash
cd D:/ProjectFile/docSeeker && npm install highlight.js
```

- [ ] **Step 2: 创建 CodePreview.tsx**

```tsx
// src/components/preview/CodePreview.tsx
import React, { useEffect, useRef } from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'  // 使用暗色主题

interface CodePreviewProps {
  content: string
  fileName: string
}

function CodePreview({ content, fileName }: CodePreviewProps): JSX.Element {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current)
    }
  }, [content])

  const ext = fileName.includes('.') ? fileName.split('.').pop() : ''
  const langMap: Record<string, string> = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript',
    tsx: 'typescript', py: 'python', java: 'java', c: 'c',
    cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby',
    php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala',
    sh: 'bash', bat: 'batch', ps1: 'powershell',
    sql: 'sql', json: 'json', xml: 'xml', yaml: 'yaml',
    yml: 'yaml', css: 'css', html: 'html', md: 'markdown',
  }
  const lang = langMap[ext?.toLowerCase() || ''] || 'plaintext'

  return (
    <pre style={{
      margin: 0, padding: '12px', overflow: 'auto',
      maxHeight: '60vh', fontSize: '13px', lineHeight: 1.5,
      background: '#0d1117', borderRadius: '4px'
    }}>
      <code ref={codeRef} className={`language-${lang}`}>
        {content}
      </code>
    </pre>
  )
}

export default CodePreview
```

- [ ] **Step 3: 创建 TextPreview.tsx**

```tsx
// src/components/preview/TextPreview.tsx
import React from 'react'

interface TextPreviewProps {
  content: string
}

function TextPreview({ content }: TextPreviewProps): JSX.Element {
  return (
    <pre style={{
      margin: 0, padding: '12px', overflow: 'auto',
      maxHeight: '60vh', fontSize: '13px', lineHeight: 1.6,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: 'var(--text-secondary)'
    }}>
      {content}
    </pre>
  )
}

export default TextPreview
```

- [ ] **Step 4: 提交**

```bash
git add src/components/preview/TextPreview.tsx src/components/preview/CodePreview.tsx
git commit -m "feat(preview): add text and code preview components with syntax highlighting"
```

---

### Task 7: 图片预览组件

**Files:**
- Create: `src/components/preview/ImagePreview.tsx`

- [ ] **Step 1: 创建 ImagePreview.tsx**

```tsx
// src/components/preview/ImagePreview.tsx
import React, { useState } from 'react'

interface ImagePreviewProps {
  imageData: string  // base64 data URL
  fileName: string
}

function ImagePreview({ imageData, fileName }: ImagePreviewProps): JSX.Element {
  const [zoom, setZoom] = useState(1)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px', gap: '8px'
    }}>
      <div style={{
        maxWidth: '100%', overflow: 'auto', maxHeight: '55vh',
        border: '1px solid var(--border-color)', borderRadius: '4px'
      }}>
        <img
          src={imageData}
          alt={fileName}
          style={{
            maxWidth: `${zoom * 100}%`,
            maxHeight: '55vh',
            display: 'block',
            cursor: 'zoom-in',
            transition: 'max-width 0.2s ease'
          }}
          onClick={() => setZoom(z => z === 1 ? 2 : 1)}
          onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
          title="单击或双击切换缩放"
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} style={btnStyle}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} style={btnStyle}>+</button>
        <button onClick={() => setZoom(1)} style={btnStyle}>重置</button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '2px 8px', border: '1px solid var(--border-color)',
  borderRadius: '3px', background: 'var(--bg-secondary)', cursor: 'pointer'
}

export default ImagePreview
```

- [ ] **Step 2: 提交**

```bash
git add src/components/preview/ImagePreview.tsx
git commit -m "feat(preview): add image preview with zoom support"
```

---

### Task 8: PDF 预览组件

**Files:**
- Create: `src/components/preview/PdfPreview.tsx`

- [ ] **Step 1: 创建 PdfPreview.tsx**

```tsx
// src/components/preview/PdfPreview.tsx
import React from 'react'

interface PdfPreviewProps {
  pdfUrl: string  // file:// URL
  fileName: string
}

function PdfPreview({ pdfUrl, fileName }: PdfPreviewProps): JSX.Element {
  return (
    <div style={{
      width: '100%', height: '60vh', display: 'flex',
      flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '0 4px' }}>
        PDF 文件，使用系统 PDF 阅读器打开更佳。
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: '8px' }}
        >
          在浏览器中打开 →
        </a>
      </div>
      <iframe
        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`}
        title={fileName}
        style={{
          flex: 1,
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          background: '#fff'
        }}
      />
    </div>
  )
}

export default PdfPreview
```

- [ ] **Step 2: 提交**

```bash
git add src/components/preview/PdfPreview.tsx
git commit -m "feat(preview): add PDF preview component"
```

---

### Task 9: Office 文档预览（复用提取器）

**Files:**
- Modify: `electron/main/previewRegistry.ts`
- Create: `src/components/preview/OfficePreview.tsx`

- [ ] **Step 1: 在 previewRegistry 中实现 Office 文档预览**

找到 `previewOffice` 函数，替换为：

```typescript
async function previewOffice(filePath: string, ext: string): Promise<PreviewResult> {
  // 直接调用已有的内容提取函数
  // 由于 extractText 在 scanWorker 中，通过 IPC 调用更安全
  // 这里使用 require 避免循环依赖（scanWorker 在 Worker 线程，不直接可用）
  try {
    const extractText = require('./scanWorker')
    const content = await extractText.extractText(filePath, ext)
    return { type: 'office', content: content || '' }
  } catch (err) {
    return { type: 'office', content: '', error: (err as Error).message }
  }
}
```

> **备选方案（如果上述有循环依赖问题）：** 在 `ipc.ts` 的 `preview-file` handler 中直接调用提取函数，通过 IPC 返回完整 PreviewResult。

- [ ] **Step 2: 创建 OfficePreview.tsx**

```tsx
// src/components/preview/OfficePreview.tsx
import React from 'react'
import CodePreview from './CodePreview'

interface OfficePreviewProps {
  content: string
  fileName: string
}

function OfficePreview({ content, fileName }: OfficePreviewProps): JSX.Element {
  if (!content.trim()) {
    return (
      <div style={{
        padding: '16px', color: 'var(--text-secondary)', fontSize: '13px'
      }}>
        无法预览此文件内容。请点击"打开文件"查看完整内容。
      </div>
    )
  }
  // Office 提取的文本使用 CodePreview 展示（无语法高亮）
  return <CodePreview content={content} fileName={fileName} />
}

export default OfficePreview
```

- [ ] **Step 3: 提交**

```bash
git add electron/main/previewRegistry.ts src/components/preview/OfficePreview.tsx
git commit -m "feat(preview): add office document preview reusing text extractors"
```

---

### Task 10: FileDetail 集成预览面板

**Files:**
- Modify: `src/components/FileDetail.tsx`
- Modify: `electron/preload/index.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: 在 preload 中暴露 preview-file 和 PreviewType**

```typescript
// electron/preload/index.ts

export interface PreviewResult {
  type: 'text' | 'image' | 'pdf' | 'code' | 'office' | 'unknown'
  content?: string
  imageData?: string
  pdfUrl?: string
  error?: string
}

export interface ElectronAPI {
  // ... existing ...
  previewFile: (filePath: string) => Promise<PreviewResult>
}

// 添加实现：
previewFile: (filePath: string) => ipcRenderer.invoke('preview-file', filePath),
```

- [ ] **Step 2: 创建统一的 PreviewPanel 组件**

```tsx
// src/components/preview/PreviewPanel.tsx
import React, { useState, useEffect } from 'react'
import ImagePreview from './ImagePreview'
import PdfPreview from './PdfPreview'
import CodePreview from './CodePreview'
import TextPreview from './TextPreview'
import OfficePreview from './OfficePreview'

interface PreviewPanelProps {
  filePath: string
  fileName: string
}

function PreviewPanel({ filePath, fileName }: PreviewPanelProps): JSX.Element {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.electron.previewFile(filePath).then(r => {
      setResult(r)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filePath])

  if (loading) {
    return <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>加载预览中...</div>
  }
  if (!result) {
    return <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>预览加载失败</div>
  }

  switch (result.type) {
    case 'image':
      return <ImagePreview imageData={result.imageData} fileName={fileName} />
    case 'pdf':
      return <PdfPreview pdfUrl={result.pdfUrl} fileName={fileName} />
    case 'code':
      return <CodePreview content={result.content} fileName={fileName} />
    case 'office':
      return <OfficePreview content={result.content} fileName={fileName} />
    case 'text':
      return <TextPreview content={result.content} />
    default:
      return (
        <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>
          {result.error || '不支持预览此文件类型'}
        </div>
      )
  }
}

export default PreviewPanel
```

- [ ] **Step 3: 修改 FileDetail.tsx，替换预览区域**

在 `FileDetail.tsx` 中：

1. 添加 `useState` 引入
2. 添加导入：
```tsx
import PreviewPanel from './preview/PreviewPanel'
```
3. 替换预览卡片：
```tsx
<div className="detail-card">
  <div className="detail-card-title">{t('detail.preview')}</div>
  <div className="detail-content-preview">
    <PreviewPanel filePath={file.path} fileName={file.name} />
  </div>
</div>
```

- [ ] **Step 4: 添加预览面板样式到 styles.css**

```css
/* FileDetail 预览面板 */
.detail-content-preview {
  max-height: 65vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.detail-content-preview::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.detail-content-preview::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
```

- [ ] **Step 5: 提交**

```bash
git add src/components/FileDetail.tsx src/components/preview/PreviewPanel.tsx src/styles.css electron/preload/index.ts
git commit -m "feat(preview): integrate multi-format preview panel into FileDetail"
```

---

---

## Part 3: AnyTXT 高价值功能（参考截图新增）

> 来源：AnyTXT Searcher 设置面板，均为用户高频需求，实现成本低。

---

### Task 11: 搜索延迟（自动搜索）

**Files:**
- Modify: `src/pages/SearchPage.tsx`

- [ ] **Step 1: 在 SearchPage 增加 debounce 状态和延迟设置**

在 `SearchPage` 的 `useState` 区域添加：

```tsx
const [searchDelay, setSearchDelay] = useState(300)  // ms，默认 300ms

// 在 handleSearch 调用外包装 debounce
const debounceRef = useRef<NodeJS.Timeout | null>(null)

const debouncedSearch = useCallback((query: string) => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    performSearch(query)
  }, searchDelay)
}, [searchDelay, performSearch])
```

将搜索输入框的 `onChange` 从直接调用 `setSearchQuery` 改为触发 `debouncedSearch`。

---

### Task 12: 结果中查找（Filter in Results）

**Files:**
- Modify: `src/pages/SearchPage.tsx`
- Modify: `src/components/FileList.tsx`

- [ ] **Step 1: 在 SearchPage 结果区域增加二次过滤输入框**

在搜索结果列表上方添加：

```tsx
const [filterQuery, setFilterQuery] = useState('')

const filteredFiles = useMemo(() => {
  if (!filterQuery.trim()) return files
  const lower = filterQuery.toLowerCase()
  return files.filter(f =>
    f.name.toLowerCase().includes(lower) ||
    f.path.toLowerCase().includes(lower)
  )
}, [files, filterQuery])

// 在文件列表上方添加：
{hasSearched && files.length > 10 && (
  <div style={{ marginBottom: '8px' }}>
    <input
      type="text"
      placeholder="在结果中筛选..."
      value={filterQuery}
      onChange={e => setFilterQuery(e.target.value)}
      style={{ width: '200px', padding: '4px 8px', fontSize: '13px' }}
    />
    <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
      {filteredFiles.length} / {files.length}
    </span>
  </div>
)}
```

---

### Task 13: 右键资源管理器集成（用 DocSeeker 搜索选中文件）

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `src/pages/FloatingSearch.tsx`

- [ ] **Step 1: 从命令行参数读取选中文件路径**

在 `index.ts` 中，当应用通过右键菜单调用时，传入选中文件路径作为参数。Windows Shell 扩展可通过命令行传递：

```typescript
// index.ts 中，当 args 包含 --search-file 时，直接打开浮动窗口并填充内容
const searchFileArg = process.argv.find(arg => arg.startsWith('--search-file='))
if (searchFileArg) {
  const filePath = searchFileArg.replace('--search-file=', '')
  const fileName = path.basename(filePath)
  // 打开浮动窗口并设置搜索内容
  if (!floatingWindow) createFloatingWindow()
  if (floatingWindow) {
    floatingWindow.show()
    floatingWindow.webContents.send('set-search-query', fileName)
  }
}
```

- [ ] **Step 2: 注册右键菜单**

通过 Electron 的 `shell.openPath` 或安装时写入注册表：

```typescript
// 在 Windows 上，注册右键菜单
const regKey = 'HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\DocSeeker'
// 或通过 installer 脚本在打包时写入
```

---

### Task 14: 扫描设置 — 隐藏文件 / 系统文件开关

**Files:**
- Modify: `electron/main/scanSettings.ts`
- Modify: `electron/main/scanWorker.ts`
- Modify: `src/pages/ScanPage.tsx`

- [ ] **Step 1: 在 scanSettings 中增加开关**

```typescript
interface ScanSettings {
  // ... existing fields ...
  includeHidden: boolean   // 索引隐藏文件，默认 false
  includeSystem: boolean  // 索引系统文件，默认 false
}
```

- [ ] **Step 2: 在 scanWorker.ts 的 scanDirectory 中读取设置并应用**

找到 `scanDirectory` 函数：

```typescript
async function scan(dir: string): Promise<void> {
  const settings = workerData?.settings || {}
  const includeHidden = settings.includeHidden ?? false
  const includeSystem = settings.includeSystem ?? false

  if (entry.isDirectory()) {
    // 移除硬编码的跳过逻辑
    const shouldSkip = (!includeHidden && entry.name.startsWith('.')) ||
                       entry.name === 'node_modules' ||
                       (!includeSystem && isSystemFile(entry.name))
    if (!shouldSkip) await scan(fullPath)
  }
}
```

- [ ] **Step 3: 在 ScanPage 增加 UI 开关**

在扫描设置面板添加两个 Toggle 开关。

---

## 验证

- [ ] **Step 1: TypeScript 编译检查**

Run: `cd D:/ProjectFile/docSeeker && npx tsc --noEmit`
Expected: 无编译错误（仅 USN PowerShell 脚本在打包后可能需要调整路径）

- [ ] **Step 2: 手动功能测试**

**实时监控测试：**
1. 扫描一个目录（包含 .txt / .docx / .jpg / .exe 等多种类型）
2. 在扫描期间，用资源管理器在该目录下新建一个 .txt 文件
3. 等待 2-3 秒（USN 轮询间隔）
4. 执行文件名搜索，验证新建文件出现在结果中

**预览测试：**
1. 搜索一个图片文件 → 点击结果 → 验证图片预览（缩放可用）
2. 搜索一个 .pdf 文件 → 点击结果 → 验证 iframe 预览
3. 搜索一个 .js 代码文件 → 点击结果 → 验证语法高亮
4. 搜索一个 .docx 文件 → 点击结果 → 验证提取的文本显示

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: Phase 3 - real-time file monitoring + multi-format preview"
```
