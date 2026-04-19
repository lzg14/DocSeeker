# Phase 4 剩余功能实施计划

> 维护人：lizhgb
> 更新日期：2026-04-18
> 状态：规划中

---

## 一、M4.1 缩略图预览

### 背景

当前 `FileList` 仅显示文件类型图标，搜索结果无法直观预览内容。本任务为图片和 PDF 文件生成缩略图，在结果列表 hover 和详情面板中展示。

### 架构设计

```
electron/main/
  thumbnail.ts         ← 缩略图生成服务（主进程）
  thumbnailCache.ts    ← 缩略图 LRU 缓存（内存 + 磁盘）
```

**生成策略：**
- 图片（jpg/png/gif/bmp/webp）：Electron `nativeImage.resize()`，最大 200×200
- PDF：pdf.js 提取首页渲染为 Canvas，转 base64 PNG
- 缓存键：`SHA256(path + mtime)` → 避免重复生成
- 缓存存储：`AppData/Roaming/DocSeeker/thumbnails/{hash}.png`
- 缓存上限：磁盘 50MB，超出按访问时间淘汰

**IPC 接口：**
```
thumbnail-get  →  { path: string } → { dataUrl: string } | null
thumbnail-clear →  清理磁盘缓存
```

---

### 任务 1：thumbnailCache.ts 缓存层

**文件：**
- 新建：`electron/main/thumbnailCache.ts`
- 测试：`electron/main/__tests__/thumbnailCache.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// electron/main/__tests__/thumbnailCache.test.ts
import {ThumbnailCache} from '../thumbnailCache'
import fs from 'fs'
import path from 'path'

const TEST_DIR = path.join(__dirname, 'test_thumb_cache')

async function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, {recursive: true})
  }
}

test('set and get returns same data', async () => {
  await cleanup()
  const cache = new ThumbnailCache(TEST_DIR, 10 * 1024 * 1024)
  const data = Buffer.from('fake png data')
  const key = await cache.set('test.png', data)
  const result = await cache.get(key)
  expect(result).toEqual(data)
  await cleanup()
})

test('returns null for unknown key', async () => {
  await cleanup()
  const cache = new ThumbnailCache(TEST_DIR, 10 * 1024 * 1024)
  const result = await cache.get('nonexistent')
  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron/main && npx jest __tests__/thumbnailCache.test.ts --no-coverage`
Expected: FAIL (thumbnailCache.ts does not exist)

- [ ] **Step 3: 实现 ThumbnailCache 类**

```typescript
// electron/main/thumbnailCache.ts
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export class ThumbnailCache {
  private cacheDir: string
  private maxSize: number // bytes

  constructor(cacheDir: string, maxSize: number) {
    this.cacheDir = cacheDir
    this.maxSize = maxSize
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
  }

  async set(filePath: string, data: Buffer): Promise<string> {
    const hash = this.computeKey(filePath)
    const filePath_ = path.join(this.cacheDir, `${hash}.png`)
    fs.writeFileSync(filePath_, data)
    this.enforceMaxSize()
    return hash
  }

  async get(hash: string): Promise<Buffer | null> {
    const filePath_ = path.join(this.cacheDir, `${hash}.png`)
    if (!fs.existsSync(filePath_)) return null
    return fs.readFileSync(filePath_)
  }

  private computeKey(filePath: string): string {
    const stat = fs.statSync(filePath)
    return crypto.createHash('sha256').update(filePath + stat.mtimeMs).digest('hex').slice(0, 16)
  }

  private enforceMaxSize(): void {
    const files = fs.readdirSync(this.cacheDir)
      .map(f => ({
        name: f,
        stat: fs.statSync(path.join(this.cacheDir, f)),
        atime: fs.statSync(path.join(this.cacheDir, f)).atime
      }))
      .sort((a, b) => a.atime.getTime() - b.atime.getTime())

    let totalSize = files.reduce((acc, f) => acc + f.stat.size, 0)
    for (const file of files) {
      if (totalSize <= this.maxSize) break
      const filePath_ = path.join(this.cacheDir, file.name)
      totalSize -= file.stat.size
      fs.unlinkSync(filePath_)
    }
  }

  async clear(): Promise<void> {
    if (fs.existsSync(this.cacheDir)) {
      for (const file of fs.readdirSync(this.cacheDir)) {
        fs.unlinkSync(path.join(this.cacheDir, file))
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron/main && npx jest __tests__/thumbnailCache.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/thumbnailCache.ts electron/main/__tests__/thumbnailCache.test.ts
git commit -m "feat(thumbnail): add ThumbnailCache LRU disk cache"
```

---

### 任务 2：thumbnail.ts 主服务

**文件：**
- 新建：`electron/main/thumbnail.ts`
- 修改：`electron/main/ipc.ts`（注册 thumbnail-get / thumbnail-clear handlers）
- 修改：`electron/preload/index.ts`（暴露 thumbnail API）
- 修改：`src/types.ts`（添加 thumbnail 字段）
- 修改：`src/components/FileDetail.tsx`（显示缩略图）
- 修改：`src/components/FileList.tsx`（hover 显示缩略图）
- 修改：`src/styles.css`（缩略图样式）

- [ ] **Step 1: 实现 thumbnail.ts 图片缩略图**

```typescript
// electron/main/thumbnail.ts
import { nativeImage, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { ThumbnailCache } from './thumbnailCache'

const THUMB_DIR = path.join(app.getPath('userData'), 'thumbnails')
const THUMB_CACHE = new ThumbnailCache(THUMB_DIR, 50 * 1024 * 1024)

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif'])
const PDF_EXT = '.pdf'

export async function getThumbnail(filePath: string, ext: string): Promise<string | null> {
  try {
    if (IMAGE_EXTS.has(ext.toLowerCase())) {
      return getImageThumbnail(filePath)
    }
    if (ext.toLowerCase() === PDF_EXT) {
      return getPdfThumbnail(filePath)
    }
    return null
  } catch (err) {
    console.error('Thumbnail error:', err)
    return null
  }
}

async function getImageThumbnail(filePath: string): Promise<string | null> {
  const stat = fs.statSync(filePath)
  const keyInput = filePath + stat.mtimeMs
  const hash = require('crypto').createHash('sha256').update(keyInput).digest('hex').slice(0, 16)
  const cached = await THUMB_CACHE.get(hash)
  if (cached) {
    return `data:image/png;base64,${cached.toString('base64')}`
  }

  const img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) return null

  const resized = img.resize({ width: 200, height: 200, quality: 'good' })
  const buffer = resized.toPNG()
  await THUMB_CACHE.set(filePath, buffer)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

async function getPdfThumbnail(filePath: string): Promise<string | null> {
  // pdf.js lazy load — see Task 3
  return null
}

export async function clearThumbnailCache(): Promise<void> {
  await THUMB_CACHE.clear()
}
```

- [ ] **Step 2: 注册 IPC handlers in ipc.ts**

在 ipc.ts 中添加：

```typescript
import { getThumbnail, clearThumbnailCache } from './thumbnail'

ipcMain.handle('thumbnail-get', async (_event, filePath: string) => {
  const ext = path.extname(filePath)
  return await getThumbnail(filePath, ext)
})

ipcMain.handle('thumbnail-clear', async () => {
  await clearThumbnailCache()
  return { success: true }
})
```

- [ ] **Step 3: 暴露 preload API**

在 `electron/preload/index.ts` 中添加：

```typescript
thumbnailGet: (filePath: string) => ipcRenderer.invoke('thumbnail-get', filePath),
thumbnailClear: () => ipcRenderer.invoke('thumbnail-clear'),
```

- [ ] **Step 4: FileDetail.tsx 显示缩略图**

在 `src/components/FileDetail.tsx` 中：

```tsx
// 添加 state
const [thumbnail, setThumbnail] = useState<string | null>(null)

useEffect(() => {
  if (file?.path) {
    setThumbnail(null)
    window.electron.thumbnailGet(file.path).then(data => {
      if (data) setThumbnail(data)
    })
  }
}, [file?.path])

// 在文件信息区域上方添加缩略图
{thumbnail && (
  <div className="file-thumbnail-container">
    <img src={thumbnail} alt="preview" className="file-thumbnail-img" />
  </div>
)}
```

- [ ] **Step 5: Add CSS styles**

在 `src/styles.css` 中添加：

```css
.file-thumbnail-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 12px;
}

.file-thumbnail-img {
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
  border-radius: 4px;
}
```

- [ ] **Step 6: Commit**

```bash
git add electron/main/thumbnail.ts electron/main/ipc.ts electron/preload/index.ts src/components/FileDetail.tsx src/styles.css
git commit -m "feat(thumbnail): add image thumbnail generation with disk cache"
```

---

### 任务 3：PDF 缩略图（pdf.js）

**文件：**
- 新建：`electron/main/pdfThumbnail.ts`
- 安装：`pdfjs-dist` 包
- 修改：`electron/main/thumbnail.ts`（调用 pdfThumbnail）

- [ ] **Step 1: Install pdfjs-dist**

```bash
cd D:/ProjectFile/docSeeker
npm install pdfjs-dist@^4.0.0 --save
```

- [ ] **Step 2: 实现 pdfThumbnail.ts**

```typescript
// electron/main/pdfThumbnail.ts
import fs from 'fs'
import path from 'path'
import { createCanvas } from 'canvas'
// 注意：Windows 无 canvas，需使用纯 JS 方案或跳过 PDF 缩略图
// 替代方案：返回 null（暂时），后续用 native2d 或 sharp

export async function getPdfThumbnail(filePath: string): Promise<string | null> {
  // Windows Electron 环境暂时返回 null
  // 后续可用 @pdfme/pdfjs-browser 或 sharp 替代
  return null
}
```

> ⚠️ 注意：Windows 下 Node.js canvas 依赖系统库，初次可返回 null 暂不实现，文档标注待后续迭代。

- [ ] **Step 3: Commit**

```bash
git add package.json electron/main/pdfThumbnail.ts
git commit -m "feat(thumbnail): add pdfjs-dist stub for PDF thumbnail"
```

---

## 二、M4.4 跨平台评估（文档任务）

### 任务 4：编写跨平台评估报告

**文件：**
- 新建：`docs/CROSSPLATFORM.md`

- [ ] **Step 1: 编写评估报告**

评估维度：
1. **Windows 特有功能及替代方案**
   - NTFS USN Journal → Linux/macOS: FSEvents / inotify
   - ShellThumbnail API → macOS: QuickLook / Linux: tumbler
   - 注册表 / .lnk 快捷方式 → 跨平台需重新设计

2. **Electron 跨平台兼容性**
   - 主进程 API：全部跨平台（app / BrowserWindow / Menu / Tray）
   - 系统 API：需抽象（shell.openPath、globalShortcut、nativeTheme）
   - nativeImage：跨平台支持

3. **数据库（SQLite FTS5）**
   - 跨平台，无差异

4. **文件格式解析**
   - Windows: OleFileIOPlus（.doc/.xls）
   - macOS/Linux: LibreOffice CLI / unoconv 转换
   - 推荐：统一用 LibreOffice headless 转换

5. **打包差异**
   - electron-builder: Windows NSIS / macOS DMG / Linux AppImage
   - 代码签名：需分别申请证书

6. **结论与建议**
   - macOS: 可行，工作量中等（约 3 个月）
   - Linux: 可行，但用户群少，建议优先级低

- [ ] **Step 2: Commit**

```bash
git add docs/CROSSPLATFORM.md
git commit -m "docs: add cross-platform evaluation report"
```

---

## 三、M4.6 去重功能 UI 集成

### 背景

搜索结果中存在同一文件的多份副本（同名不同路径、硬链接），用户希望过滤重复结果。当前无 dedup 后端逻辑，需完整实现。

### 架构设计

**后端 dedup 策略：**
- 按文件 `hash`（已有字段）分组，保留修改时间最新的一个
- 结果展示：默认隐藏重复，可切换显示所有（含重复标记）
- 前端新增 dedup toggle，勾选时过滤掉重复

**IPC 接口：**
```
search-deduplicate  →  { query, options, deduplicate: boolean } → FileRecord[]
```

---

### 任务 5：去重后端逻辑

**文件：**
- 修改：`electron/main/search.ts`（添加 deduplicate 参数）
- 修改：`electron/preload/index.ts`（暴露 dedup API）
- 修改：`src/pages/SearchPage.tsx`（添加去重 toggle）

- [ ] **Step 1: 添加 dedup 辅助函数 in search.ts**

```typescript
// electron/main/search.ts 中添加

function deduplicateResults(results: FileRecord[]): FileRecord[] {
  const seen = new Map<string, FileRecord>()
  for (const r of results) {
    const key = r.hash || r.path
    if (!key) {
      seen.set(r.path, r)
      continue
    }
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, r)
    } else {
      // 保留更新的
      const existingTime = existing.updated_at || ''
      const newTime = r.updated_at || ''
      if (newTime > existingTime) {
        seen.set(key, r)
      }
    }
  }
  return Array.from(seen.values())
}

export function searchWithDedup(query: string, options?: SearchOptions, deduplicate?: boolean): FileRecord[] {
  const results = searchAllShards(query, options)
  if (deduplicate) {
    return deduplicateResults(results)
  }
  return results
}
```

- [ ] **Step 2: 注册 search-deduplicate IPC handler in ipc.ts**

```typescript
ipcMain.handle('search-deduplicate', async (_event, query: string, options?: any, deduplicate?: boolean) => {
  return searchWithDedup(query, options, deduplicate)
})
```

- [ ] **Step 3: 暴露 preload API**

```typescript
searchDeduplicate: (query: string, options?: any, deduplicate?: boolean) =>
  ipcRenderer.invoke('search-deduplicate', query, options, deduplicate),
```

- [ ] **Step 4: SearchPage 添加 dedup toggle**

在 `SearchPage.tsx` 的 toolbar 中添加按钮：

```tsx
const [dedupEnabled, setDedupEnabled] = useState(false)

// 在 performSearch 中，当 dedupEnabled 为 true 时调用 searchDeduplicate
// 否则保持原有调用

const performSearch = useCallback(async (query: string, opts?: SearchOptions) => {
  // ... 现有逻辑 ...
  let result: FileRecord[]
  if (dedupEnabled) {
    result = await window.electron.searchDeduplicate(snippetQuery, opts, true)
  } else {
    // 现有搜索逻辑
  }
  // ...
}, [/* existing deps */, dedupEnabled])
```

在 toolbar 中添加：

```tsx
<button
  className={`toolbar-btn ${dedupEnabled ? 'active' : ''}`}
  onClick={() => setDedupEnabled(d => !d)}
  title="隐藏重复文件"
>
  🔗 去重
</button>
```

- [ ] **Step 5: Add dedup i18n keys**

在 `src/context/LanguageContext.tsx` 和翻译 JSON 中添加：
- `search.dedup`: "隐藏重复文件"
- `search.dedupEnabled`: "去重已启用"

- [ ] **Step 6: Commit**

```bash
git add electron/main/search.ts electron/main/ipc.ts electron/preload/index.ts src/pages/SearchPage.tsx
git commit -m "feat(dedup): add deduplication toggle with hash-based filtering"
```

---

## 四、任务总览

| 任务 | 功能 | 状态 |
|------|------|------|
| 1 | ThumbnailCache LRU 磁盘缓存 | 待实施 |
| 2 | 图片缩略图生成 + FileDetail 展示 | 待实施 |
| 3 | PDF 缩略图（pdfjs-dist） | 待实施（可暂缓） |
| 4 | 跨平台评估报告（文档） | 待实施 |
| 5 | 去重后端 + SearchPage UI toggle | 待实施 |

---

## 五、验收标准

- [ ] M4.1: 图片文件在 FileDetail 中显示缩略图，hover 触发加载，缓存命中不再重新生成
- [ ] M4.4: `docs/CROSSPLATFORM.md` 包含 macOS/Linux 可行性评估和实施建议
- [ ] M4.6: SearchPage 工具栏显示去重按钮，勾选后搜索结果按 hash 过滤

---

## 六、M4.x 文件夹名称索引

### 背景

当前只索引文件，不索引文件夹名称，导致搜索文件夹名时搜不到结果。

### 架构设计

**方案：在 shard 中新增 `shard_folders` 表**

```sql
CREATE TABLE IF NOT EXISTS shard_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,     -- 文件夹完整路径
  name TEXT NOT NULL,           -- 文件夹名称（不含路径）
  parent_path TEXT,             -- 父文件夹路径（可选，用于层级展示）
  created_at TEXT DEFAULT (datetime('now'))
)

CREATE INDEX IF NOT EXISTS idx_shard_folders_name ON shard_folders(name);
CREATE INDEX IF NOT EXISTS idx_shard_folders_parent ON shard_folders(parent_path);
```

**FTS 表**（支持全文搜索）：
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS shard_folders_fts USING fts5(name, parent_path);
```

### 任务 6：文件夹索引后端

**文件：**
- 新建：`electron/main/shardFolderIndex.ts`（文件夹索引管理）
- 修改：`electron/main/scanWorker.ts`（扫描时记录文件夹）
- 修改：`electron/main/shardManager.ts`（搜索时包含文件夹结果）
- 修改：`electron/main/ipc.ts`（注册文件夹搜索 IPC）

**文件结构：**
```
electron/main/
  shardFolderIndex.ts    ← 文件夹索引核心逻辑
    - addFolder(path: string): void
    - searchFolders(query: string): FolderRecord[]
    - getFolderChildren(parentPath: string): FolderRecord[]
```

**FolderRecord 类型：**
```typescript
interface FolderRecord {
  id?: number
  path: string
  name: string
  parent_path?: string
}
```

### 任务 7：文件夹搜索 IPC

**IPC handlers：**
```
search-folders   → { query: string } → FolderRecord[]
get-folder-tree  → { rootPath?: string } → FolderRecord[]（树形结构）
```

### 任务 8：前端支持

**文件：**
- 修改：`src/types.ts`（添加 FolderRecord 类型）
- 修改：`src/pages/SearchPage.tsx`（搜索结果包含文件夹）
- 新建：`src/components/FolderResult.tsx`（显示文件夹搜索结果）
- 修改：`src/context/LanguageContext.tsx`（添加文件夹搜索翻译 key）
  - `search.folderResult`: "在 {count} 个文件夹中找到"
  - `search.openFolder`: "打开文件夹"

**交互设计：**
- 搜索结果中文件夹用 📁 图标标识，与文件区分
- 点击文件夹结果 → 打开文件夹定位
- 搜索语法支持 `folder:关键词` 限定仅搜索文件夹

### 验收标准

- [ ] M4.x: 搜索 `folder:Desktop` 能返回名为 Desktop 的文件夹
- [ ] M4.x: 搜索结果中文件夹与文件分别展示，有明确视觉区分
- [ ] M4.x: 增量扫描时自动索引新增文件夹（不遗漏）