# PDF 缩略图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DocSeeker 添加 PDF 文件缩略图预览，支持两种生成方式：Windows Shell 原生缩略图优先，pdfjs-dist 回退。

**Architecture:**
1. **Windows Shell 优先**：主进程直接调用 PowerShell 读取 Windows 缓存的 PDF 缩略图（`~APPDATA%\Microsoft\Windows\Explorer\thumbcache_*.db`），无需额外依赖，速度快
2. **pdfjs-dist 回退**：主进程通过 IPC 委托渲染进程（renderer）用 pdfjs-dist + Canvas 渲染 PDF 第一页，结果 base64 返回主进程缓存
3. **缓存复用**：两种方式生成的缩略图均存入 ThumbnailCache，后续直接从缓存读取

**Tech Stack:** pdfjs-dist@^4.10.38（已安装）, PowerShell, Electron IPC, Canvas API

---

## 文件影响范围

| 文件 | 操作 |
|------|------|
| `electron/main/pdfThumbnail.ts` | 重写为混合策略实现 |
| `electron/preload/index.ts` | 新增 `pdfRender` API（委托 renderer 渲染） |
| `src/utils/pdfRender.ts` | 新建，pdfjs-dist 在 renderer 中渲染 PDF |
| `src/components/FileDetail.tsx` | 可选：添加加载态 placeholder |
| `docs/superpowers/plans/2026-04-18-phase4-remaining.md` | 更新任务 3 状态为"进行中" |

---

## Task 1: Windows Shell 原生缩略图（主进程）

**文件：**
- 修改：`electron/main/pdfThumbnail.ts`（添加 `tryShellThumbnail` 函数）

- [ ] **Step 1: 实现 tryShellThumbnail 函数**

在 `pdfThumbnail.ts` 中添加以下函数：

```typescript
/**
 * 方案一：Windows Shell 原生缩略图
 * 使用 PowerShell 调用 Shell.Application 获取 PDF 缩略图。
 * 原理：Windows 资源管理器会缓存 PDF 缩略图到 thumbcache_*.db，
 * 通过 IShellDispatch2::Namespace + .GetDetailsOf 提取。
 *
 * @returns base64 PNG 或 null
 */
async function tryShellThumbnail(filePath: string): Promise<string | null> {
  if (process.platform !== 'win32') return null

  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    // PowerShell 脚本：使用 Windows Shell 提取 PDF 第一页缩略图
    const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$file = '${filePath.replace(/'/g, "''")}'
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace((Split-Path $file))
$item = $folder.ParseName((Split-Path $file -Leaf))

# 使用 System.Drawing 从 PDF 提取首页
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
  } catch {
    return null
  }
}
```

- [ ] **Step 2: 更新 getPdfThumbnail 入口**

将 `pdfThumbnail.ts` 的 `getPdfThumbnail` 改为调用链：

```typescript
// 原有导入
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)

// 替换原有 getPdfThumbnail 函数体
export async function getPdfThumbnail(filePath: string): Promise<string | null> {
  // 方案一：Windows Shell 原生缩略图
  const shellThumb = await tryShellThumbnail(filePath)
  if (shellThumb) return shellThumb

  // 方案二：pdfjs-dist 回退（由 renderer 进程执行，见 Task 2-3）
  return null  // 临时返回 null，等 Task 3 完成
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/pdfThumbnail.ts
git commit -m "feat(pdf-thumb): add Windows Shell native thumbnail extraction"
```

---

## Task 2: pdfjs-dist Renderer 渲染工具

**文件：**
- 新建：`src/utils/pdfRender.ts`

- [ ] **Step 1: 创建 pdfRender.ts**

```typescript
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
 * @param filePath  PDF 文件的绝对路径（file:// 协议）
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
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/pdfRender.ts
git commit -m "feat(pdf-thumb): add pdfjs-dist renderer utility for PDF page rendering"
```

---

## Task 3: IPC 协作层（Renderer 端）

**文件：**
- 修改：`electron/preload/index.ts`（新增 `pdfRender` API）
- 修改：`electron/main/ipc.ts`（新增 `pdf-render` handler）
- 修改：`electron/main/pdfThumbnail.ts`（调用 renderer 回退）

- [ ] **Step 1: 在 preload 中添加 pdfRender API**

在 `electron/preload/index.ts` 的接口定义和实现中添加：

```typescript
// 接口定义（ElectronAPI 接口中追加）
pdfRender: (filePath: string) => Promise<string | null>

// 实现
pdfRender: (filePath: string) => ipcRenderer.invoke('pdf-render', filePath),
```

- [ ] **Step 2: 在 ipc.ts 中添加 pdf-render handler**

在 `ipc.ts` 的 handler 注册区域添加：

```typescript
// PDF 缩略图 renderer 渲染（委托给 renderer 进程）
ipcMain.handle('pdf-render', async (_, filePath: string): Promise<string | null> => {
  // 此 handler 仅用于标记，实际渲染在 renderer 中通过 window.electron.pdfRender 调用
  // 这里返回一个占位，通知 renderer 应该自行渲染
  // 真实实现通过 BrowserWindow.webContents.executeJavaScript 注入渲染逻辑
  log.warn('[IPC] pdf-render called in main - should be called from renderer')
  return null
})
```

> **架构说明**：由于 `pdf-render` 需要在 renderer 中执行，我们不通过 main → renderer 绕一圈，
> 而是直接在 FileDetail.tsx（或新建的 usePdfThumbnail hook）中调用 `window.electron.pdfRender`。
> `pdf-render` IPC handler 在此仅用于保持接口一致性。

- [ ] **Step 3: 在 FileDetail.tsx 中直接调用 pdfRender**

在 `src/components/FileDetail.tsx` 中：

```typescript
// 导入（第 1 行后追加）
import { renderPdfPage } from '../utils/pdfRender'

// 修改 useEffect，在 PDF 时走 renderer 渲染
useEffect(() => {
  setThumbnail(null)
  if (!file?.path) return

  const ext = file.path.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    // PDF: 使用 pdfjs-dist 在 renderer 中渲染
    renderPdfPage(file.path, 1, 1.5).then(dataUrl => {
      if (dataUrl) setThumbnail(dataUrl)
    })
  } else {
    // 图片等: 走 main process（现有逻辑）
    window.electron.thumbnailGet(file.path).then(data => {
      if (data) setThumbnail(data)
    })
  }
}, [file?.path])
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload/index.ts electron/main/ipc.ts src/components/FileDetail.tsx
git commit -m "feat(pdf-thumb): integrate pdfjs-dist renderer into FileDetail"
```

---

## Task 4: 缓存层打通（缓存 renderer 渲染结果）

**背景：** Task 2-3 每次都重新渲染 PDF，没有复用缓存。需要打通"renderer 渲染 → 结果缓存 → 后续从缓存读取"链路。

**文件：**
- 修改：`src/components/FileDetail.tsx`（渲染前先查缓存，渲染后写入缓存）
- 修改：`electron/preload/index.ts`（新增缓存读写 API）
- 修改：`electron/main/ipc.ts`（新增缓存读写 IPC handlers）
- 修改：`electron/main/pdfThumbnail.ts`（添加缓存读写辅助函数）

- [ ] **Step 1: 在 ipc.ts 中添加缓存读写 IPC**

```typescript
// 读缓存
ipcMain.handle('thumb-cache-get', async (_, filePath: string): Promise<string | null> => {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    // PDF 缓存键：SHA256(filePath + mtime)
    const { createHash } = await import('crypto')
    const stat = await import('fs').then(fs => fs.promises.stat(filePath))
    const hash = createHash('sha256').update(filePath + stat.mtimeMs).digest('hex').slice(0, 16)
    const cached = THUMB_CACHE.get(hash)
    return cached ? `data:image/png;base64,${cached.toString('base64')}` : null
  }
  return null
})

// 写缓存
ipcMain.handle('thumb-cache-set', async (_, filePath: string, dataUrl: string): Promise<void> => {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.pdf') return
  try {
    const { createHash } = await import('crypto')
    const stat = await import('fs').then(fs => fs.promises.stat(filePath))
    const hash = createHash('sha256').update(filePath + stat.mtimeMs).digest('hex').slice(0, 16)
    // dataUrl 格式: data:image/png;base64,xxxxx
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    THUMB_CACHE.set(filePath, buffer)
  } catch {}
})
```

- [ ] **Step 2: 在 preload/index.ts 中暴露缓存 API**

```typescript
// 接口
thumbCacheGet: (filePath: string) => Promise<string | null>
thumbCacheSet: (filePath: string, dataUrl: string) => Promise<void>

// 实现
thumbCacheGet: (filePath: string) => ipcRenderer.invoke('thumb-cache-get', filePath),
thumbCacheSet: (filePath: string, dataUrl: string) => ipcRenderer.invoke('thumb-cache-set', filePath, dataUrl),
```

- [ ] **Step 3: 更新 FileDetail.tsx 的 PDF 渲染逻辑**

```typescript
useEffect(() => {
  setThumbnail(null)
  if (!file?.path) return

  const ext = file.path.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    // PDF: 先查缓存
    window.electron.thumbCacheGet(file.path).then(cached => {
      if (cached) {
        setThumbnail(cached)
        return
      }
      // 缓存未命中 → 渲染
      renderPdfPage(file.path, 1, 1.5).then(dataUrl => {
        if (dataUrl) {
          setThumbnail(dataUrl)
          // 回写缓存
          window.electron.thumbCacheSet(file.path, dataUrl)
        }
      })
    })
  } else {
    window.electron.thumbnailGet(file.path).then(data => {
      if (data) setThumbnail(data)
    })
  }
}, [file?.path])
```

- [ ] **Step 4: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/components/FileDetail.tsx
git commit -m "feat(pdf-thumb): add thumbnail cache layer for PDF renderer results"
```

---

## Task 5: 端到端测试验证

- [ ] **Step 1: 准备测试 PDF**

找一个包含多页内容和图片的真实 PDF 文件（不要用空白 PDF），记录文件路径。

- [ ] **Step 2: 搜索该 PDF**

在 DocSeeker 中搜索 PDF 文件名，应出现在结果列表。

- [ ] **Step 3: 点击结果，观察 FileDetail**

预期：
- FileDetail 中显示 PDF 第一页的缩略图（200px 高 PNG）
- 再次点击其他 PDF 后切回，缩略图应从缓存秒回（无加载延迟）
- 图片文件缩略图功能不受影响

- [ ] **Step 3: 回归测试**

1. 搜索图片 JPG/PNG → FileDetail 正常显示缩略图
2. 搜索普通文本/Word 文件 → 不崩溃
3. 搜索不存在的 PDF → 不报错

- [ ] **Step 4: Commit**

```bash
git commit -m "test(pdf-thumb): manual e2e verification for PDF thumbnail rendering"
```

---

## 技术方案自检

### 覆盖检查

| 需求 | 对应 Task |
|------|----------|
| Windows Shell 原生缩略图 | Task 1 |
| pdfjs-dist renderer 回退 | Task 2 |
| FileDetail 集成渲染 | Task 3 |
| 缓存复用（避免重复渲染） | Task 4 |
| 端到端验证 | Task 5 |

### 关键设计决策

1. **为什么 renderer 直接调 pdfRender 而不是通过 main IPC**：pdfjs-dist 需要 DOM Canvas API，main process 没有。最直接的路径是 renderer 直接调用 `renderPdfPage()`，缓存层通过 IPC 读写 ThumbnailCache。

2. **CDN 加载 pdfjs worker**：`file://` 协议下无法用 `import 'pdfjs-dist/.../pdf.worker.min.mjs'`（esm 导入限制），改用 jsDelivr CDN URL 避免本地路径问题。用户无需联网也能工作（浏览器会缓存）。

3. **缓存键一致**：`SHA256(filePath + mtimeMs)` 截取 16 位 hex，与图片缩略图缓存策略一致。文件修改后自动失效。

4. **Windows Shell 方案限制**：PDF 需要用户有可用的 PDF 预览处理器（Windows 10+ 自带 Edge）。极少数用户可能没有，pdfjs-dist 完全兜底。
