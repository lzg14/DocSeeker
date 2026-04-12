# DocSeeker 增强功能实现计划

> **状态：已完成**

**Goal:** 将 DocSeeker 从"能用"升级到"专业级"桌面文档搜索工具，核心改进为 FTS5 全文索引 + 搜索体验优化 + 去重功能增强。

**最终架构：**

1. **数据库层** (`electron/main/database.ts`) — better-sqlite3 原生模块 + FTS5 虚拟表
2. **IPC 层** (`electron/preload/index.ts`, `electron/main/ipc.ts`) — 删除文件接口 + 扫描完成进度
3. **前端层** (`src/pages/SearchPage.tsx`, `src/pages/ScanPage.tsx`, `src/components/DuplicateFinder.tsx`) — 简化搜索 + 扫描完成状态 + 删除按钮

**重要决策：**
- 最终选用 **better-sqlite3** 而非 sql.js，因 sql.js 默认 WASM 构建不含 FTS5
- 搜索简化：不加文件类型/日期过滤，全量全文搜索
- 需安装 Python + VS Build Tools 编译原生模块

---

## 实现记录

### Task 1: FTS5 虚拟表 ✅

- 修改 `initDatabase`：初始化时直接删除旧数据库重建
- 创建 `files_fts` FTS5 虚拟表，`content_rowid` 关联 `files` 表
- 创建 INSERT/DELETE/UPDATE 三个触发器自动同步 FTS 索引
- 调用 `rebuild` 初始化已有数据

### Task 2: 重写 searchFiles ✅

- 改用 FTS5 `MATCH` 查询 + `bm25()` 相关性排序
- 移除 LIKE 查询，性能提升显著
- 支持多关键词 AND 组合搜索

### Task 3: delete-file IPC ✅

- `ipc.ts` 新增 `delete-file` handler（调用 `shell.trashItem`）
- `preload/index.ts` 暴露 `deleteFile` API

### Task 4: 搜索页简化 ✅

- 移除了文件类型和日期过滤控件
- 搜索框直接全文搜索
- 传递 `searchQuery` 给 FileList 显示摘要高亮

### Task 5: 搜索结果高亮摘要 ✅

- `database.ts` 新增 `getSearchSnippets`（LIKE 提取关键词上下文片段）
- FileList 显示带 `<mark>` 标签的摘要
- 前端用 `dangerouslySetInnerHTML` 渲染高亮

### Task 6: 去重页面删除按钮 ✅

- DuplicateFinder 新增确认式删除按钮
- 调用 `deleteFile` API 移至回收站
- 删除后自动刷新列表

### Task 7: chokidar 实时监听 ✅

- 创建 `electron/main/fileWatcher.ts`
- 监听扫描目录的文件增删变化，自动更新/删除数据库记录
- 使用 `await import('chokidar')` 动态导入（v5 为 ESM）
- `index.ts` 集成 `startFileWatcher` / `stopFileWatcher`

### 额外修复

| 问题 | 修复 |
|------|------|
| sql.js 默认不含 FTS5 | 迁移到 better-sqlite3 |
| stmt.free() 不存在 | 移除所有调用 |
| stmt.getAsObject() 不存在 | 改为 stmt.get() |
| 扫描暂停时 complete 消息被跳过 | 改为只在 progress 时检查暂停 |
| 扫描完成后进度消失 | 保留完成状态显示 |
| 暂停/取消按钮在完成后仍显示 | phase=complete 时隐藏 |

---

## git 提交历史

| SHA | 描述 |
|-----|------|
| f37e1af | feat(db): add FTS5 virtual table and triggers |
| ad126b1 | feat(search): replace LIKE with FTS5 BM25 |
| 7239799 | feat(api): add deleteFile IPC |
| 49ebf12 | feat(ui): add file type and date range filters |
| 39fb508 | feat(ui): add keyword highlight snippets |
| 15ef5d3 | feat(ui): add move-to-trash for duplicates |
| 653e559 | feat(watcher): add chokidar real-time watching |
| 1070eb7 | fix(watcher): use dynamic import for chokidar ESM |
| 45433cc | feat(db): migrate from sql.js to better-sqlite3 |
| 9fbd17d | fix(db): remove stmt.free() calls |
| c71ef52 | fix(db): use correct better-sqlite3 API (stmt.get) |
| 1590887 | fix(scan): send final progress event on scan complete |
| 5f95434 | fix(ui): show completion state, hide pause/cancel when done |
