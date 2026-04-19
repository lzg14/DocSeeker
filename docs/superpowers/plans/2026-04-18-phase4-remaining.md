# Phase 4 剩余功能实施计划

> 维护人：lizhgb
> 更新日期：2026-04-19
> 状态：部分完成
>
> **说明：** 图片缩略图和去重功能已在集成阶段实现。PDF 缩略图实施中（见 `2026-04-19-pdf-thumbnail.md`）。

---

## 一、图片缩略图预览（已完成 ✅）

### 实现状态

| 文件 | 操作 | 状态 |
|------|------|------|
| `electron/main/thumbnailCache.ts` | ThumbnailCache LRU 磁盘缓存 | ✅ 已实现 |
| `electron/main/thumbnail.ts` | getImageThumbnail + isImageFile | ✅ 已实现 |
| `electron/main/ipc.ts` | thumbnail-get / thumbnail-clear handlers | ✅ 已实现 |
| `electron/preload/index.ts` | thumbnailGet / thumbnailClear API | ✅ 已实现 |
| `src/components/FileDetail.tsx` | 缩略图展示 | ✅ 已实现 |

### 缓存策略

- 缓存键：`SHA256(filePath + mtimeMs)` 截取 16 位十六进制
- 存储路径：`AppData/Roaming/DocSeeker/thumbnails/`
- 磁盘上限：50MB，按访问时间 LRU 淘汰
- 支持格式：JPG、JPEG、PNG、GIF、BMP、WebP、ICO、TIFF

---

## 二、去重功能（已完成 ✅）

### 实现状态

| 文件 | 操作 | 状态 |
|------|------|------|
| `electron/main/shardManager.ts` | deduplicateResults 函数 | ✅ 已实现 |
| `electron/main/ipc.ts` | search-deduplicate IPC handler | ✅ 已实现 |
| `electron/preload/index.ts` | searchDeduplicate API | ✅ 已实现 |
| `src/pages/SearchPage.tsx` | 去重 toggle 按钮 | ✅ 已实现 |
| `src/context/LanguageContext.tsx` | i18n 翻译 | ✅ 已实现 |

### 去重策略

- 按文件 `hash`（MD5）分组，无 hash 时按 `path` 分组
- 同 hash 文件保留 `updated_at` 最新的条目
- 前端 Toolbar 有 🔗 去重按钮，启用后调用 `searchDeduplicate`

---

## 三、PDF 缩略图（待实现 ❌）

### 推荐方案：混合策略

**结论：采用"系统原生优先 + pdfjs-dist renderer 回退"的混合方案。**

#### 方案对比

| 方案 | 依赖 | 质量 | 复杂度 | 可靠性 |
|------|------|------|--------|--------|
| Windows ShellThumbnail API | 系统 PDF handler | 中等 | 低 | ⚠️ 依赖 Edge/Adobe |
| pdfjs-dist renderer | npm 包 | 高 | 中 | ✅ 纯 JS |
| sharp + LibreOffice | LibreOffice 安装 | 高 | 高 | ⚠️ 需安装额外软件 |
| node-canvas | native addon | 高 | 高 | ⚠️ 编译依赖 |

#### 实施步骤

**Step 1：先尝试 Windows Shell 原生缩略图（主进程）**

```powershell
# PowerShell 命令，使用 Windows ShellThumbnailProvider 生成 PDF 缩略图
Add-Type -AssemblyName System.Drawing
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace((Split-Path $filePath))
$item = $folder.ParseName((Split-Path $filePath -Leaf))
$size = 256
$picture = $item.ExtendedProperty("System.Thumbnail.{E4F4EADE-1337-4E0F-9E2B-8E94CC1C4F16}")
# 或者用 IShellItemImageFactory
```

> ⚠️ 问题：PowerShell 调用每个 PDF 都启动新进程，开销大。需考虑缓存或用 `IWICBitmapDecoder` 原生调用。

**Step 2：pdfjs-dist 回退（推荐，跨平台可靠）**

```bash
npm install pdfjs-dist@^4.0.0
```

在渲染进程（renderer）中加载 pdfjs-dist，渲染第一页到 Canvas：

```typescript
// src/utils/pdfRender.ts
import * as pdfjsLib from 'pdfjs-dist'

// 设置 worker 路径（从 node_modules 复制到 public/）
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export async function renderPdfPage(
  filePath: string,
  page: number = 1,
  scale: number = 1.5
): Promise<string | null> {
  const data = await fetch(`file://${filePath}`)
  const pdf = await pdfjsLib.getDocument(await data.arrayBuffer()).promise
  const page_ = await pdf.getPage(page)
  const viewport = page_.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page_.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

  return canvas.toDataURL('image/png')
}
```

**Step 3：IPC 协作（推荐架构）**

```
renderer                  main process
  |                             |
  | thumbnail-get (filePath)    |
  |────────────────────────────>|
  |                             |
  |   thumbnail-render-pdf     |
  |  (filePath, ask renderer)  |
  |<────────────────────────────|
  |                             |
  | renderPdfPage(filePath)    |
  | (uses pdfjs-dist in DOM)   |
  |                             |
  | returns dataUrl            |
  |────────────────────────────>|
  |                             |
  |   [dataUrl from renderer]   |
  |   save to ThumbnailCache    |
  |   return dataUrl to caller |
```

即：缩略图请求从 main process 发起，但 PDF 渲染交给 renderer（因为 renderer 有 DOM Canvas），结果通过 IPC 返回。

#### 推荐理由

- **系统原生优先**：Windows 10/11 自带 PDF 预览（Edge），无需额外依赖，速度快
- **pdfjs-dist 回退**：纯 JS，无 native addon，跨平台可靠，不依赖用户安装特定软件
- **混合架构**：两种方案互补，覆盖绝大多数用户场景

---

## 四、文件夹名称索引（待实现 ❌）

### 背景

当前只索引文件，不索引文件夹名称，导致搜索文件夹名时搜不到结果。

### 架构设计

**方案：在 shard 中新增 `shard_folders` 表**

```sql
CREATE TABLE IF NOT EXISTS shard_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)

CREATE INDEX IF NOT EXISTS idx_shard_folders_name ON shard_folders(name);
CREATE INDEX IF NOT EXISTS idx_shard_folders_parent ON shard_folders(parent_path);

CREATE VIRTUAL TABLE IF NOT EXISTS shard_folders_fts USING fts5(name, parent_path);
```

### 待实施任务

| 任务 | 功能 | 状态 |
|------|------|------|
| 任务 1 | shardFolderIndex.ts 文件夹索引核心逻辑 | ❌ 待实施 |
| 任务 2 | scanWorker.ts 扫描时记录文件夹 | ❌ 待实施 |
| 任务 3 | shardManager.ts 搜索时包含文件夹结果 | ❌ 待实施 |
| 任务 4 | IPC handlers（search-folders / get-folder-tree） | ❌ 待实施 |
| 任务 5 | 前端支持（FolderResult 组件 + i18n） | ❌ 待实施 |

### 验收标准

- [ ] 搜索 `folder:Desktop` 能返回名为 Desktop 的文件夹
- [ ] 搜索结果中文件夹与文件分别展示，有明确视觉区分
- [ ] 增量扫描时自动索引新增文件夹

---

## 五、任务总览

| 任务 | 功能 | 状态 |
|------|------|------|
| 1 | ThumbnailCache LRU 磁盘缓存 | ✅ 已完成 |
| 2 | 图片缩略图生成 + FileDetail 展示 | ✅ 已完成 |
| 3 | PDF 缩略图（混合策略：Shell原生优先 + pdfjs-dist 回退） | ❌ 待实施 |
| 4 | 去重后端 deduplicateResults + IPC | ✅ 已完成 |
| 5 | 去重前端 toggle + i18n | ✅ 已完成 |
| 6 | 文件夹索引后端（shardFolderIndex.ts） | ❌ 待实施 |
| 7 | 文件夹搜索 IPC | ❌ 待实施 |
| 8 | 文件夹搜索前端支持 | ❌ 待实施 |
| 9 | 跨平台评估报告（docs/CROSSPLATFORM.md） | ❌ 待实施 |

---

## 六、验收标准

- [x] M4.1: 图片文件在 FileDetail 中显示缩略图，hover 触发加载，缓存命中不再重新生成
- [x] M4.6: SearchPage 工具栏显示去重按钮，勾选后搜索结果按 hash 过滤
- [ ] PDF 文件在 FileDetail 中显示缩略图（首页预览）
- [ ] 搜索 `folder:Desktop` 能返回名为 Desktop 的文件夹
- [ ] `docs/CROSSPLATFORM.md` 包含 macOS/Linux 可行性评估和实施建议
