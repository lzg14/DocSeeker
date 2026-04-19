# 数据库架构重构计划

> **目标：** 将 `config.db` 从全功能数据库拆分为只存 app settings，`meta.db` 存储文件夹和搜索历史数据。

## 架构变更

| 数据库 | 存储内容 | 管理模块 |
|--------|---------|---------|
| `meta.db` | scanned_folders / search_history / saved_searches | meta.ts |
| `config.db` | scan_settings / app_settings | config.ts |
| `shards/shard_*.db` | 文件内容索引 | shardManager.ts |

## 文件变更

### Task 1: 创建 meta.ts

**新建文件：** `electron/main/meta.ts`

从 `config.ts` 复制以下表和函数到 `meta.db`：
- `scanned_folders` 表 → `addScannedFolder`, `getAllScannedFolders`, `getScannedFolderByPath`, `getScannedFolderById`, `deleteScannedFolder`, `updateFolderScanComplete`, `updateFolderFullScanComplete`, `syncFolderStatsFromShards`, `syncFolderStatsFromShardsFull`, `updateScannedFolder`
- `search_history` 表 → `addSearchHistory`, `getSearchHistory`, `clearSearchHistory`
- `saved_searches` 表 → `addSavedSearch`, `getSavedSearches`, `deleteSavedSearch`

### Task 2: 修改 config.ts

**文件：** `electron/main/config.ts:1-106`

删除以下表和相关函数（移到 meta.ts）：
- `scanned_folders` 表定义及所有相关函数
- `search_history` 表定义及相关函数
- `saved_searches` 表定义及相关函数
- 删除 `ScannedFolder`, `SearchHistoryEntry`, `SavedSearch` 类型定义
- 删除 `currentScanSettings` 变量

保留：
- `scan_settings` 表 + `getScanSettings`, `updateScanSettings`, `DEFAULT_SCAN_SETTINGS`, `ScanSettings`, `SkipRule`
- `app_settings` 表 + `getAppSetting`, `setAppSetting`, `getAllAppSettings`, `AppSettings`

### Task 3: 修改 database.ts

**文件：** `electron/main/database.ts`

将 re-export 从 `config.ts` 改为从 `meta.ts` 导入：
```typescript
// 改前
export {
  getAllScannedFolders,
  ...
} from './config'

// 改后
export {
  getAllScannedFolders,
  ...
} from './meta'
```

### Task 4: 修改 ipc.ts

**文件：** `electron/main/ipc.ts`

从 `config.ts` 的导入改为从 `meta.ts` 导入（文件夹/搜索相关）。

`scan_settings` 仍从 `config.ts` 导入。

## meta.db 表结构（与原 config.db 完全一致）

```sql
CREATE TABLE scanned_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  last_scan_at TEXT DEFAULT (datetime('now')),
  last_full_scan_at TEXT DEFAULT NULL,
  file_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  schedule_enabled INTEGER DEFAULT 0,
  schedule_day TEXT DEFAULT NULL,
  schedule_time TEXT DEFAULT NULL
)

CREATE TABLE search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  searched_at TEXT DEFAULT (datetime('now'))
)
CREATE INDEX idx_history_query ON search_history(query)

CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)
```
