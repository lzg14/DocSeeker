# DocSeeker 数据库架构

## 概览

DocSeeker 使用三个 SQLite 数据库，存储在 `db/` 目录下：

```
db/
├── meta.db       — 用户数据（文件夹、搜索历史）
├── config.db     — 应用设置（主题、语言、快捷键、扫描参数）
└── shards/       — 文件索引（按分片存储）
    ├── shard_0.db
    ├── shard_1.db
    └── ...
```

**数据目录：** `AppData/Roaming/docSeeker/db/`（Windows）

---

## meta.db — 用户数据

### 表清单

| 表名 | 行数 | 用途 |
|------|------|------|
| `scanned_folders` | 用户配置 | 已扫描的文件夹及统计 |
| `search_history` | 用户数据 | 搜索历史（最多50条） |
| `saved_searches` | 用户数据 | 收藏的搜索 |
| `sqlite_sequence` | 系统表 | AUTOINCREMENT 序列值 |

### `scanned_folders` — 已扫描文件夹

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `path` | TEXT | 文件夹路径（唯一） |
| `name` | TEXT | 显示名称 |
| `last_scan_at` | TEXT | 最近增量扫描时间 |
| `last_full_scan_at` | TEXT | 最近全量扫描时间 |
| `file_count` | INTEGER | 文件总数（从 shards 同步） |
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

## config.db — 应用设置

### 表清单

| 表名 | 行数 | 用途 |
|------|------|------|
| `scan_settings` | 1 | 扫描参数配置 |
| `app_settings` | 用户配置 | 主题、语言、快捷键等 |
| `sqlite_sequence` | 系统表 | AUTOINCREMENT 序列值 |

### `scan_settings` — 扫描参数

固定只有 1 行（`id = 1`），`settings` 字段为 JSON：

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

### `app_settings` — 杂项配置

key-value 存储，JSON 序列化的值：

| key | 说明 |
|-----|------|
| `shard_profile` | 机器性能配置（CPU核数、磁盘速度） |
| `shard_config` | 分片配置（单分片最大MB、并行数） |

---

## shards/shard_*.db — 文件索引

每个分片存储一组文件的索引，使用 FTS5 全文搜索。

### 表结构

| 表名 | 用途 |
|------|------|
| `shard_files` | 文件元数据（path, name, size, hash, content 等） |
| `shard_files_fts` | FTS5 全文搜索索引 |
| `sqlite_sequence` | AUTOINCREMENT |

---

## sqlite_sequence — 系统表

**是什么：** SQLite 自动创建的系统表，用于管理 `AUTOINCREMENT` 主键的序列值。

**工作原理：** 当表中某列声明为 `INTEGER PRIMARY KEY AUTOINCREMENT` 时，SQLite 在该表中维护一个计数器，记录已使用的最大值。下次插入时自增使用。

**存储内容：** 两列：`name`（表名）、`seq`（当前序列值）。

```sql
SELECT * FROM sqlite_sequence;
-- 结果示例：
-- name              | seq
-- scanned_folders   | 2
-- search_history    | 3
```

**不要手动修改：** 除非知道自己在做什么。修改可能导致主键冲突或浪费 ID。

**与迁移的关系：** 删除表时，`sqlite_sequence` 中该表的记录**不会**自动删除（SQLite 不会级联清理）。迁移脚本需要在删除旧表后手动清理：

```sql
DELETE FROM sqlite_sequence WHERE name IN ('meta_folders', 'meta_search_history');
```

---

## 数据库设计原则

1. **meta.db** 存储用户产生的数据（文件夹、搜索记录），可导出/迁移
2. **config.db** 存储系统配置，可丢失（会重置为默认值）
3. **shards/** 存储文件内容索引，不可丢失，丢失后需要重新扫描
4. 所有数据库启用 WAL 模式（`PRAGMA journal_mode = WAL`），提高并发读写性能
