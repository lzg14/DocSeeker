# DocSeeker 开发路线图

> 更新时间: 2026-04-18（分片架构重构 + 数据库合并）

---

## 文档概览

| 章节 | 内容 |
|------|------|
| [一、背景与目标](#一背景与目标) | 项目定位、竞品差距分析 |
| [二、优先级矩阵](#二优先级矩阵) | P0/P1/P2 功能优先级一览 |
| [三、阶段规划](#三阶段规划) | 四个开发阶段的详细规划 |
| [四、里程碑时间线](#四里程碑时间线) | 关键交付节点 |

---

## 一、背景与目标

DocSeeker 是一款基于 Electron + React + TypeScript 的本地文档全文搜索工具，使用 SQLite FTS5 + BM25 提供相关性排序。目前核心功能已就绪，但与竞品（AnyTXT 60+ 格式、Copernic 400+ 格式）相比，在文件格式覆盖、高级搜索、实时监控等方面存在明显差距。

本路线图以竞品分析 (`docs/COMPETITION.md`) 为依据，按优先级分四个阶段推进，目标是在 6-12 个月内将 DocSeeker 提升至与 AnyTXT 同级别的竞争力。

---

## 二、优先级矩阵

### P0 — 关键功能缺失（必须解决）

| 功能 | 当前状态 | 目标 | 竞品参考 |
|------|----------|------|----------|
| 新增文件格式 | ✅ 18 种格式（RTF/CHM/ODF/EPUB/WPS 已完成） | 继续增加 WPD、图片、音视频元数据 | AnyTXT 60+ |
| 实时文件监控 | ❌ **已移除**（chokidar 在大目录架构层面无法优化） | 重新启用需改用 NTFS USN Journal API | Everything / AnyTXT |
| 正则搜索 | ✅ 已支持 `/pattern/` 语法 | 词干提取和字段搜索均已完成 | Everything / AnyTXT |
| 文件过滤器 | ✅ 已支持类型/大小/日期三重过滤 | — | 所有主流竞品 |

### P1 — 体验缺失（尽快补全）

| 功能 | 当前状态 | 目标 | 竞品参考 |
|------|----------|------|----------|
| 搜索历史 | ✅ 已完成 | — | Everything / AnyTXT / Copernic |
| 保存的搜索 | ✅ 已完成 | — | AnyTXT / Copernic |
| 搜索语法提示 | ✅ 语法提示面板已完成 | — | Recoll |
| 去重 UI | ✅ 已完成 | — | 仅 Copernic |
| 全局快捷键浮层 | ✅ Ctrl+Shift+F 已完成 | — | Listary |
| 缩略图预览 | ✅ hover 预览已完成 | — | Copernic / Listary |
| 拖拽文件搜索 | ✅ 已完成 | — | Listary |

### P2 — 技术债（逐步优化）

| 功能 | 当前状态 | 目标 | 竞品参考 |
|------|----------|------|----------|
| Electron 冷启动 | ✅ 分片架构已完成（启动 <100ms，搜索 DB 后台加载） | 继续优化至毫秒级 | Everything 毫秒级 |
| 跨平台支持 | 仅 Windows | 评估 macOS/Linux 可行性 | DocFetcher / Recoll |
| 便携版 | ✅ 已完成 | — | Everything / AnyTXT / DocFetcher |

---

## 三、阶段规划

### Phase 1: 核心体验补全

**目标:** 解决 P0 问题，提升搜索体验基础水平
**预计周期:** 1-2 个月

#### 里程碑

- [x] **M1.1** 新增 RTF 文件格式支持
- [x] **M1.2** 新增 CHM 帮助文档格式支持
- [x] **M1.3** 新增 ODF 系列格式支持（ODT / ODS / ODP）
- [x] **M1.4** 重新启用实时文件监控（优化 chokidar 或迁移至 NTFS USN） — _已移除（架构问题，大目录下 chokidar 无法优化，需改用 NTFS USN Journal）_
- [x] **M1.5** 搜索历史功能（记录与快速复用）
- [x] **M1.6** 保存的搜索（收藏夹与命名搜索）
- [x] **M1.7** 移除 / 大幅提高结果上限（200 条限制）

**技术要点:**
- RTF 解析：可使用 rtf-parser 或自定义正则剥离富文本
- CHM 解析：可使用 chmlib 或 node-chm 解压提取 HTML 内容
- ODF 解析：ODT/ODP 基于 ZIP+XML，与现有 DOCX/PPTX 解析逻辑复用
- 实时监控：评估 chokidar 性能瓶颈，优先考虑 Windows NTFS USN journal API

---

### Phase 2: 高级搜索能力

**目标:** 补全高级搜索功能，对标竞品高级用法
**预计周期:** 2-3 个月（与 Phase 1 部分并行）

#### 里程碑

- [x] **M2.1** 正则表达式搜索支持
- [x] **M2.2** 布尔搜索支持（AND / OR / NOT）
- [x] **M2.3** 文件类型过滤器（按扩展名筛选）
- [x] **M2.4** 文件大小过滤器（范围选择器）
- [x] **M2.5** 日期范围过滤器（修改时间 / 创建时间）
- [x] **M2.6** 高级查询语法 UI 提示面板（类 Recoll 查询语言界面）
- [x] **M2.7** 词干提取（Porter Stemmer）：搜索词自动还原为词干
- [x] **M2.8** 字段限定搜索（name:/path:/ext: 语法）

**技术要点:**
- SQLite FTS5 原生支持布尔操作符（AND / OR / NOT）和正则（通过 MATCH 扩展）
- 过滤器可在 FTS5 查询外作为 SQL WHERE 条件层叠应用
- UI 提示面板参考 Recoll 查询语言设计，降低高级用户学习门槛

---

### Phase 3: 企业级功能

**目标:** 拓展使用场景，提升竞争力至企业级别
**预计周期:** 3-4 个月

#### 里程碑

- [x] **M3.1** ZIP / RAR 压缩包内全文搜索
- [x] **M3.2** 邮件格式支持（mbox / EML）
- [x] **M3.3** 便携版打包（索引 + 数据可打包带走）
- [x] **M3.4** 云存储集成（OneDrive / Dropbox，本地缓存索引） — _已移除（云盘文件夹与普通文件夹扫描方式无差异，无需单独集成）_

**技术要点:**
- ZIP 内搜索：复用 jszip 解压 + 递归解析内部文档
- RAR 支持：使用 node-unrar-js WASM 实现
- mbox / EML：解析 RFC 2822 格式，提取正文文本
- 便携版：Electron 打包为单目录绿色版，数据路径改为相对路径

---

### Phase 4: 体验与性能优化（持续）

**目标:** 提升用户体验和技术质量，建立长期竞争力
**预计周期:** 持续迭代

#### 里程碑

- [x] **M4.1** 搜索结果缩略图预览（图片 / PDF 首帧） — _已实现图片 + PDF 缩略图（Windows Shell 方案）_
- [x] **M4.2** 全局快捷键浮层搜索（类 Listary 双击 Ctrl）
- [x] **M4.3** Electron 冷启动优化（分片架构：config.db 同步加载 + shards 后台并行加载，UI <100ms 可交互）
- [x] **M4.4** 跨平台支持评估（macOS / Linux）
- [x] **M4.5** 搜索结果命中词高亮增强
- [x] **M4.6** 去重功能 UI 集成
- [x] **M4.7** 文件计数数据源统一（界面数据全部来自 config.db，shard 仅作索引存储）

**技术要点:**
- 缩略图：Windows 可调用 ShellThumbnail API，跨平台考虑 thumbbar 或自绘
- 全局快捷键：Electron globalShortcut API 配合独立浮层窗口
- 冷启动优化：路由懒加载、electron-builder 优化拆分、SSD 友好的索引预加载
- 跨平台：SQLite FTS5 跨平台兼容，主要工作量为 UI 适配和打包差异

---

## 四、里程碑时间线

```
2026                    2027
Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan  Feb  Mar  Apr
|---Phase 1---|------Phase 2------|---Phase 3---|---Phase 4 (持续)--|
M1.1-M1.7                   M3.1-M3.4
         M2.1-M2.6          M4.1-M4.6
         └─ 与 Phase 1 部分并行
```

### 关键交付节点

| 时间 | 里程碑 | 阶段 |
|------|--------|------|
| 2026-05 (Phase 1 中期) | M1.1-M1.3 新增 3 种格式 | Phase 1 |
| 2026-06 (Phase 1 结束) | M1.4-M1.7 监控 + 历史 + 搜索上限 | Phase 1 |
| 2026-08 (Phase 2 结束) | M2.1-M2.6 完整高级搜索能力 | Phase 2 |
| 2026-11 (Phase 3 结束) | M3.1-M3.3 企业级格式与便携版 | Phase 3 |
| 2027+ (Phase 4 持续) | M4.1-M4.6 体验优化与跨平台 | Phase 4 |

---

## 附录：参考文档

- 竞品分析报告: `docs/COMPETITION.md`
- 项目规划原始文档: `docs/superpowers/plans/2026-04-14-roadmap-and-competition-analysis.md`
