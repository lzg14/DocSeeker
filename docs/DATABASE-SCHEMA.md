# DocSeeker 数据库架构

> 更新日期：2026-04-19

## 概览

```
db/
├── meta.db        — 用户数据（文件夹、搜索历史）
├── config.json    — 应用设置（扫描参数、主题、快捷键等）
└── shards/       — 文件索引（按分片存储）
    ├── shard_0.db
    ├── shard_1.db
    └── ...
```

**数据目录：** `AppData/Roaming/docseeker/db/`（Windows）

---

## meta.db — 用户数据

### 表清单

| 表名 | 用途 |
|------|------|
| `scanned_folders` | 已扫描的文件夹及统计 |
| `search_history` | 搜索历史（最多50条） |
| `saved_searches` | 收藏的搜索 |
| `sqlite_sequence` | 系统表，AUTOINCREMENT 序列值 |

### `scanned_folders` — 已扫描文件夹

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `path` | TEXT | 文件夹路径（唯一，Windows 反斜杠 `D:\path\`） |
| `name` | TEXT | 显示名称 |
| `last_scan_at` | TEXT | 最近增量扫描时间 |
| `last_full_scan_at` | TEXT | 最近全量扫描时间 |
| `file_count` | INTEGER | 文件总数（扫描完成后从 shards 同步） |
| `total_size` | INTEGER | 总大小（字节，从 shards 同步） |
| `schedule_enabled` | INTEGER | 是否启用定时扫描（0/1） |
| `schedule_day` | TEXT | 扫描日期（如 "Monday"） |
| `schedule_time` | TEXT | 扫描时间（如 "09:00"） |

### `search_history` — 搜索历史

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `query` | TEXT | 搜索关键词 |
| `searched_at` | TEXT | 搜索时间 |

### `saved_searches` — 收藏搜索

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `name` | TEXT | 收藏名称 |
| `query` | TEXT | 搜索语句 |
| `created_at` | TEXT | 创建时间 |

---

## config.json — 应用设置

纯 JSON 文件，启动时加载到内存，修改时自动写回。

### scan_settings

扫描参数（用户可在界面配置）：

```json
{
  "timeoutMs": 15000,
  "maxFileSize": 104857600,
  "maxPdfSize": 52428800,
  "skipOfficeInZip": true,
  "checkZipHeader": true,
  "checkFileSize": true,
  "skipRules": [],
  "includeHidden": false,
  "includeSystem": false
}
```

### app_settings

内部配置缓存（自动生成，不需要用户配置）：

| key | 说明 |
|-----|------|
| `shard_profile` | 机器性能（CPU核数、磁盘速度） |
| `shard_config` | 分片配置（单分片最大MB、并行数） |

---

## shards/shard_*.db — 文件索引

每个分片存储一组文件的索引，使用 FTS5 全文搜索。

### 重要：路径格式

shards 里存储的路径**统一使用正斜杠**（`D:/User/Desktop/...`），由 `scanWorker` 写入时通过 `filePath.replace(/\\/g, '/')` 转换。

`getFolderStatsFromShards` 查询时会将传入的 Windows 路径（反斜杠）转换为正斜杠再匹配。

### 表结构

| 表名 | 用途 |
|------|------|
| `shard_files` | 文件元数据（path, name, size, hash, content 等） |
| `shard_files_fts` | FTS5 全文搜索索引 |
| `sqlite_sequence` | AUTOINCREMENT |

---

## sqlite_sequence — 系统表

**是什么：** SQLite 自动创建的系统表，用于管理 `AUTOINCREMENT` 主键的序列值。

**存储内容：** 两列：`name`（表名）、`seq`（当前序列值）。

```sql
SELECT * FROM sqlite_sequence;
-- 结果示例：
-- name              | seq
-- scanned_folders   | 2
-- search_history    | 3
```

**不要手动修改。** 删除表时 `sqlite_sequence` 不会自动清理，需手动删除：

```sql
DELETE FROM sqlite_sequence WHERE name = 'old_table_name';
```

---

## WAL 模式

所有数据库（meta.db 和 shards/*.db）均启用 WAL 模式（`PRAGMA journal_mode = WAL`）：

- **写操作**：先追加到 WAL 文件，不阻塞读操作
- **读取**：同时读主文件 + WAL，合并后为完整数据
- **Checkpoint**：WAL 积累一定大小或进程正常退出时，自动将 WAL 合并回主文件并清空 WAL

**调试注意**：用 sql.js 查数据库时只能读主文件，看不到 WAL 里的未提交数据。

---

## 数据库设计原则

1. **meta.db** 存储用户产生的数据（文件夹、搜索记录），可导出/迁移
2. **config.json** 存储系统配置，无则自动生成默认值
3. **shards/** 存储文件内容索引，不可丢失，丢失后需重新扫描
4. 所有数据库启用 WAL 模式，提高并发读写性能
