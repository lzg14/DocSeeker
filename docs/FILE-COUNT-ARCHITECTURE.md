# DocSeeker 文件数量统计架构

> 更新日期：2026-04-19

---

## 一、单一数据源原则

DocSeeker 中**所有界面显示的文件数量都来自 `meta.db` 的 `scanned_folders` 表**，shards 只负责存储文件内容，不作为 UI 数据源。

### 数据流

```
增量/全量扫描
    │
    ▼
shards/shard_files 写入数据（insertFileBatch）
    │
    ▼
扫描完成 → 从所有 shard 统计该文件夹的文件数和大小
    │
    ▼
更新 meta.db scanned_folders (file_count, total_size) ← 唯一真实数据
    │
    ▼
界面从 meta.db 读取显示
```

---

## 二、存储结构

### meta.db → scanned_folders 表

| 字段 | 说明 |
|------|------|
| `file_count` | 该文件夹被索引的文件数 |
| `total_size` | 该文件夹内文件总大小 |
| `last_scan_at` | 上次扫描时间 |
| `last_full_scan_at` | 上次全量扫描时间 |

来源：扫描完成后由 `syncFolderStatsFromShards` / `syncFolderStatsFromShardsFull` 写入。

显示位置：
- ScanPage 每个文件夹右侧的 "N 个文件" → `folder.file_count`
- ScanPage 顶部 "X 个文件夹 · Y 文件" → `SUM(file_count)` from all folders

### shards/shard_*.db

存储实际的文件记录（路径、内容、hash 等），**不直接作为 UI 数据源**。

`shard.fileCount` 字段在删除时刷新（用于内部一致性检查）。

---

## 三、关键函数

### shardManager.ts

```typescript
// 扫描完成后，从所有 shard 统计指定文件夹的文件数和大小
export function getFolderStatsFromShards(folderPath: string): { fileCount: number; totalSize: number }
```

### meta.ts

```typescript
// 增量扫描完成后同步 stats
export function syncFolderStatsFromShards(id, folderPath, stats)

// 全量扫描完成后同步 stats
export function syncFolderStatsFromShardsFull(id, folderPath, stats)
```

### database.ts

```typescript
// UI 获取总数的接口：累加 meta.db 中所有 folder.file_count
export function getTotalFileCountFromConfig(): number
```

### ipc.ts

```typescript
// 'get-file-count' → getTotalFileCountFromConfig()      ← 界面总数
// incremental-scan complete → syncFolderStatsFromShards()  ← 增量扫描同步
// full-rescan complete → syncFolderStatsFromShardsFull()  ← 全量扫描同步
```

---

## 四、数据库架构（2026-04-19 重构）

重构后数据库职责分离：

| 数据库 | 存储内容 | 管理模块 |
|--------|---------|---------|
| `meta.db` | scanned_folders, search_history, saved_searches | meta.ts |
| `config.json` | scan_settings, app_settings | config.ts |
| `shards/*.db` | 文件内容索引 | shardManager.ts |

详情见 [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md)。

---

## 五、正常情况下的预期行为

| 操作 | meta.db.file_count | 界面显示总数 |
|------|--------------------|------------|
| 扫描前 | 0 | 0 |
| 扫描 Desktop（1 个文件） | 1 | 1 |
| 扫描 Documents（100 个文件） | 101 | 101 |
| 删除 Desktop | 100 | 100 |
| 删除 Documents | 0 | 0 |

两套数字始终一致。
