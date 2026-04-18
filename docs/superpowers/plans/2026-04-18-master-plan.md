# DocSeeker 数据库架构重构与全文件索引 开发计划

> 维护人：lizhgb
> 更新日期：2026-04-18

## 背景

DocSeeker 数据库经历了一次架构调整。原设计使用单一 `file-manager.db`（2.1 GB）存储所有数据：
- 文件记录（38,912 条）
- FTS5 全文索引
- 扫描文件夹元数据
- 搜索历史

**问题：**
1. **启动慢**：打开 2.1 GB SQLite 数据库需要 ~25 秒同步操作，阻塞主线程
2. **FTS 初始化慢**：`CREATE VIRTUAL TABLE files_fts` 对大数据库需要 20-30 秒
3. **无法增量加载**：整个 DB 必须完全就绪才能开始使用
4. **单点故障**：文件损坏可能导致全部数据丢失
5. **所有文件都索引**：.exe、.jpg、.dll 等文件目前被跳过无法搜索，需要全部收集并支持按文件名搜索

**目标：**
- 启动 < 1s，UI 立即可交互
- 搜索功能按需加载，后台暖机
- 所有文件（包括无法提取内容的文件）都索引入库，支持按文件名搜索
- 搜索结果区分"文件名匹配"和"内容匹配"

---

## 已实现架构（Phase 1）

```
AppData/Roaming/DocSeeker/
  db/config.db (~50KB)        → 文件夹列表、搜索历史、保存搜索、应用设置
  db/hot-cache.json (~1MB)   → 热点搜索结果缓存
  db/shards/                  → 分片文件目录
    shard_0.db
    shard_1.db
    ...
```

**已实现模块：**
- `config.ts` — 统一配置库（文件夹 + 搜索历史 + 保存搜索 + 应用设置）
- `hotCache.ts` — 热点缓存（LRU ≤1MB）
- `search.ts` + `searchDbLoader.ts` — 搜索数据库 Worker 懒加载
- `ipc.ts` — 所有搜索操作 `waitForSearchDb()` 等待后端就绪

**待解决问题：**
（以上问题已全部在 Phase 2 中解决）

---

## 目标架构（Phase 2）

```
启动 (< 100ms):
  db/config.db (~50KB)         → 文件夹列表、搜索历史、保存搜索、应用设置
  db/hot-cache.json (~1MB)     → 热点搜索结果缓存

后台并行加载:
  db/shards/{id}_files.db      → 固定大小上限的文件分片
                                → 并行 Worker 加载，逐个就绪
                                → 单个 shard maxSizeMB（基于磁盘速度计算）
                                → 文件按扫描顺序依次写入各 shard

  + is_supported 字段           → 所有文件都记录，支持文件名搜索
  + match_type 标记            → 区分 filename/content/both 匹配
```

**Sharding 规则：**
- shard 大小上限由机器性能决定：`maxSizeMB = diskReadSpeedMBps × 2`
- 文件按扫描顺序依次填入当前 shard，满了就开新 shard
- 与文件夹无关：一个大文件夹可能跨越多个 shard，一个 shard 可能包含多个文件夹的文件

---

## 文件清单

| 文件 | 存储内容 | 大小 | 加载时机 |
|------|---------|------|---------|
| `db/config.db` | 文件夹列表、搜索历史、保存搜索、扫描设置、应用设置（主题/语言/快捷键） | ~50KB | 启动同步 (<50ms) |
| `db/hot-cache.json` | 热点搜索结果缓存 | ≤1MB | 启动同步 (<10ms) |
| `db/shards/shard_{id}.db` | 文件记录 + FTS5 + is_supported，按固定大小切分 | maxSizeMB/个 | 后台并行加载 |

---

## 开发任务总览

| # | 阶段 | 任务 | 状态 | 提交 |
|---|------|------|------|------|
| 1 | 数据库分片 | 实现 shard 分片架构（拆单库为多 shard） | ✅ 已完成 | `6d8fbc0` |
| 2 | 文件索引 | scanWorker 收集所有文件，标记 is_supported | ✅ 已完成 | `6effe82` |
| 3 | 文件索引 | searchByFileName 仅按文件名搜索 | ✅ 已完成 | `b4c7f3c` |
| 4 | 文件索引 | match_type 字段区分匹配类型 | ✅ 已完成 | `b4c7f3c` |
| 5 | 前端 UI | MatchTypeBadge、搜索范围切换 | ✅ 已完成 | `7ccfb14` |

---

## Task 1: 数据库分片架构

### 1.1 新增 shardManager.ts — 分片加载管理

**职责：** 管理多个 shard 的并行加载、按需调度、跨 shard 搜索。

**关键类型：**

```typescript
// electron/main/shardManager.ts
interface ShardInfo {
  id: string           // 序号，0, 1, 2, ...
  dbPath: string
  status: 'pending' | 'loading' | 'ready' | 'error'
  fileCount: number
  loadTime?: number    // ms
}

// Machine profile
interface MachineProfile {
  cpuCores: number
  diskReadSpeedMBps: number  // SSD >500 / HDD <100
}

interface ShardConfig {
  maxSizeMB: number
  parallelWorkers: number
}
```

**核心函数：**
- `detectMachineProfile(): MachineProfile` — 探测 CPU 核心数 + 磁盘读速（1GB 顺序读测速）
- `computeShardConfig(profile: MachineProfile): ShardConfig` — 计算 shard 上限和并行度
- `initShardManager(): void` — 初始化，探测机器配置，启动并行加载
- `openNextShard(): Database` — 当前 shard 满了时，创建新 shard 并返回连接
- `searchAllShards(query, options?): SearchResult[]` — 并行查询所有已就绪 shard，合并 BM25 排序
- `getReadyShards(): ShardInfo[]` — 获取已就绪 shard 列表
- `waitForShards(timeout?): Promise<void>` — 等待任意 shard 就绪

**分片规则：**
- shard_id = 序号（0, 1, 2, ...）
- 单 shard 大小上限：`maxSizeMB = diskReadSpeedMBps × 2`（保证 2s 内加载）
- 并行度：`min(cpuCores - 1, 8)`
- 文件按扫描顺序依次填入当前 shard，满了就开新 shard
- 示例：HDD (50MB/s): maxSizeMB=100 / SSD (500MB/s): maxSizeMB=1000

### 1.2 新增 shardLoader.ts — Worker 加载单 shard

**职责：** Worker 线程加载单个 shard.db，初始化 FTS5 表。

**表结构：**
```sql
CREATE TABLE shard_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  size INTEGER,
  hash TEXT,
  file_type TEXT,
  content TEXT,
  is_supported INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)

CREATE VIRTUAL TABLE shard_files_fts USING fts5(
  name, content, file_type,
  content='shard_files', content_rowid='id',
  tokenize='unicode61 remove_diacritics 1'
)

-- 触发器保持同步
CREATE TRIGGER shard_files_ai AFTER INSERT ON shard_files BEGIN
  INSERT INTO shard_files_fts(rowid, name, content, file_type) VALUES (new.id, new.name, new.content, new.file_type);
END
```

### 1.3 修改 search.ts 适配 shard 架构

**改动：**
- `search.ts` 中的 `getSearchDatabase()` 改为从 `shardManager` 获取
- `searchFiles()` 改为 `searchAllShards()` 跨 shard 并行查询
- 删去 `searchDbLoader.ts`（用 shard 替代原单库方案）
- 保留 `initSearchDatabaseAsync()` 语义：启动 shard 加载

### 1.4 删除旧文件

- `electron/main/searchDbLoader.ts` — 废弃（shard 替代）
- `electron.vite.config.ts` 中的 `searchDbLoader` input — 移除

---

## Task 2: scanWorker 收集所有文件

### 2.1 修改 FileInfo 接口

```typescript
interface FileInfo {
  path: string
  name: string
  size: number
  hash: string | null
  fileType: string
  content: string | null
  isSupported: boolean  // 新增：是否支持内容提取
}
```

### 2.2 修改 processFile 始终返回结果

**当前行为：** 只处理 `SUPPORTED_EXTENSIONS` 中的文件，其他跳过。

**新行为：** 扫描所有文件并标记 `isSupported`：
```typescript
async function processFile(filePath: string): Promise<FileInfo | null> {
  const stats = await fs.stat(filePath)
  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase()
  const isSupported = SUPPORTED_EXTENSIONS.has(ext)
  const fileType = isSupported ? getFileType(ext) : 'unsupported'

  const fileInfo: FileInfo = {
    path: filePath, name, size: stats.size,
    hash: null, fileType, content: null, isSupported
  }

  if (stats.size > 0 && stats.size < MAX_FILE_SIZE) {
    fileInfo.hash = await calculateHash(filePath)
  }

  // 仅对支持的文件提取内容
  if (isSupported) {
    fileInfo.content = await extractText(filePath, ext, stats.size)
  }

  return fileInfo
}
```

### 2.3 修改 getFileType 返回 'unsupported'

```typescript
return map[ext] || 'unsupported'
```

### 2.4 修改 scanDirectory 移除扩展名过滤

```typescript
} else if (entry.isFile()) {
  files.push(fullPath)  // 收集所有文件
}
```

---

## Task 3: searchByFileName 函数

**位置：** `electron/main/search.ts`

**功能：** 仅按文件名 FTS 搜索（不使用内容），对不支持内容提取的文件也能返回结果。

```typescript
export function searchByFileName(query: string, options?: SearchOptions): FileRecord[] {
  if (!query.trim()) return []
  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  if (keywords.length === 0) return []

  const ftsQuery = keywords.map(k => `"${k.replace(/"/g, '""')}"*`).join(' AND ')
  // 复用 shard 搜索：只需搜索所有已就绪 shards
  const results = searchAllShards(ftsQuery, options)
  return results.map(r => ({ ...r, match_type: 'filename' as const }))
}
```

---

## Task 4: match_type 字段与搜索函数返回类型

### 4.1 FileRecord 增加字段

**位置：** `electron/main/search.ts` + `src/types.ts`

```typescript
interface FileRecord {
  // ... existing fields ...
  is_supported?: boolean
  match_type?: 'content' | 'filename' | 'both'
}
```

### 4.2 shard_files 表增加 is_supported 列

在 shard loader 建表 SQL 中加入：
```sql
ALTER TABLE shard_files ADD COLUMN is_supported INTEGER DEFAULT 1
```

### 4.3 修改 searchFiles / searchFilesAdvanced 返回 match_type

```typescript
export function searchFiles(query: string): FileRecord[] {
  // ...
  const rows = stmt.all() as FileRecord[]
  return rows.map(row => ({ ...row, match_type: 'content' as const }))
}
```

---

## Task 5: 前端 UI

### 5.1 FileList MatchTypeBadge

**位置：** `src/components/FileList.tsx`

```tsx
const MatchTypeBadge: React.FC<{ matchType?: string }> = ({ matchType }) => {
  if (!matchType) return null
  if (matchType === 'filename') {
    return <span style={{ fontSize: '10px', color: '#888', marginLeft: '4px' }}>📄文件名</span>
  }
  if (matchType === 'content') {
    return <span style={{ fontSize: '10px', color: '#1976d2', marginLeft: '4px' }}>📝内容</span>
  }
  if (matchType === 'both') {
    return <span style={{ fontSize: '10px', color: '#2e7d32', marginLeft: '4px' }}>📄+📝</span>
  }
  return null
}
```

**图标映射：** `getFileIcon` 增加 `case 'unsupported': return '❓'`

### 5.2 搜索范围切换

**位置：** `src/pages/SearchPage.tsx`

```tsx
const [searchScope, setSearchScope] = useState<'all' | 'filename'>('all')

// 搜索按钮组中增加：
<button onClick={() => setSearchScope(searchScope === 'all' ? 'filename' : 'all')}>
  {searchScope === 'all' ? '🔍 全部' : '📄 仅文件名'}
</button>

// handleSearch 中：
if (searchScope === 'filename') {
  results = await window.electronAPI.searchByFileName(query, filters)
} else {
  results = await window.electronAPI.searchFilesAdvanced(query, filters)
}
```

### 5.3 preload 暴露 searchByFileName

**位置：** `electron/preload/index.ts`

```typescript
searchByFileName: (_query: string, _options?: any) =>
  ipcRenderer.invoke('search-by-filename', _query, _options),
```

---

## 模块清单（最终）

| 模块 | 文件 | 职责 |
|------|------|------|
| config | `electron/main/config.ts` | 统一配置库（文件夹、历史、设置，全部存储在 `db/config.db`） |
| hotCache | `electron/main/hotCache.ts` | 热点缓存（LRU，≤1MB，存储在 `db/hot-cache.json`） |
| shardManager | `electron/main/shardManager.ts` | 分片加载、并行调度、跨 shard 搜索 |
| shardLoader | `electron/main/shardLoader.ts` | Worker：单 shard 初始化（FTS 建表） |
| search | `electron/main/search.ts` | 跨 shard 搜索 API |
| scanner | `electron/main/scanner.ts` | 文件内容提取 |

---

## 生产环境 Bug 修复

| 日期 | 问题 | 修复 | 提交 |
|------|------|------|------|
| 2026-04-18 | 首次启动时 meta.db 目录不存在导致 "Cannot open database because the directory does not exist" | `initMetaDatabase()` 中添加 `ensureDbDir()` 在打开数据库前先创建目录 | `476a70f` |
| 2026-04-18 | 迁移功能存在缺陷且不再需要 | 删除 migration.ts，将 meta.ts 合并为 config.ts 统一管理所有配置 | `f5b47b3` |
| 2026-04-18 | 每次启动重新测速（浪费 1-2 秒），分片大小未持久化 | 将机器配置和分片配置缓存到 config.db，后续启动直接读取 | `pending` |

---

## 后续优化方向

1. ~~**search.db 分片**：按文件类型或时间范围分表，减少单文件体积~~ ✅ 已升级为按大小分库（shards）
2. **首次运行自动添加**：自动添加用户 Documents 和 Desktop 文件夹到扫描列表
3. **增量 FTS 同步**：改为批量同步，减少 FTS 表膨胀
4. **热点缓存预热策略**：基于访问频率而非最近搜索，更智能地缓存
5. **VACUUM 压缩**：定期压缩各 shard 文件，回收已删除记录的空间
5. **跨 shard 搜索缓存**：记录跨文件夹搜索结果到热点缓存
