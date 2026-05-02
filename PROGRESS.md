# DocSeeker 开发进度记录

> 最后更新：2026-05-02

---

## ⚠️ 重要经验教训（必读）

### 1. 代码修改后必须重新编译

**问题**：electron-vite 的 TypeScript 编译产物在 `out/` 目录，修改 `.ts` 源文件后若不运行 `npm run build`，运行的是旧代码。

**现象**：修改了源代码但运行结果没变化，排查了很久才发现是这个问题。

**教训**：每次修改 Electron 主进程或渲染进程代码后，必须执行 `npm run build` 重新编译，再运行或打包。习惯性先 build 再测试。

### 2. chokidar 文件监听导致高 CPU

**问题**：文件监听功能（fileWatcher）消耗大量 CPU，使应用卡顿。

**根因**：chokidar 默认会轮询（polling）文件系统变化，即使用 `usePolling: false` 也可能触发高 CPU。

**教训**：文件监听功能默认关闭。如需启用，确保 chokidar 配置正确，并在开发阶段用 Timing 日志验证初始化时间。

### 3. 数据库函数调用时机

**问题**：数据库（better-sqlite3）在 `window-all-closed` 时关闭，但 IPC handler 或 schedule 回调可能在关闭后仍被调用，导致 "Database not initialized" 错误。

**根因**：Electron 生命周期中窗口关闭不等于应用退出。

**教训**：所有数据库导出函数必须加 `if (!db) return` 守卫（已在 database.ts 中实现），不要删除。

### 4. 对话框组件需要 i18n 支持

**问题**：ConfirmDialog 的取消/确定按钮和 TitleBar 的退出确认对话框是硬编码中文，切换英文后仍显示中文。

**教训**：新增 UI 组件时，直接从 LanguageContext 引入 `useLanguage` 并用 `t('key')` 翻译，不要硬编码任何用户可见文本。

### 5. 数据库初始化顺序

**问题**：自定义 dataPath 设置后重启，meta.db 没有在正确位置生成。

**根因**：initMeta() 在 initConfig() 之前调用，导致 getDataPath() 读取到的是默认值而不是用户配置的路径。

**教训**：initConfig() 必须先于 initMeta() 调用，确保配置加载完毕后再初始化使用路径的模块。

### 6. 配置统一存储在 config.json

**原则**：所有用户配置统一存储在 config.json（固定路径），不再使用 localStorage。

**当前配置存储：**
- config.json（固定路径）：主题、语言、快捷键、最小化到托盘、文件类型筛选等
- localStorage（仅 UI 偏好）：字号、图标大小

---

---

## 系统架构

### 配置架构

```
config.json (固定位置: userData/db/config.json)
├── app_settings
│   ├── dataPath          # 数据文件存储路径（用户可自定义）
│   ├── themeId           # 主题 (light/dark/system)
│   ├── language          # 语言 (zh-CN/en)
│   ├── hotkey            # 全局快捷键
│   ├── autoLaunch        # 开机自启
│   ├── minimizeToTray     # 最小化到托盘
│   ├── doubleCtrlEnabled # 双击 Ctrl 热键
│   └── realtimeMonitor   # 实时监控配置
└── scan_settings
    ├── timeoutMs
    ├── maxFileSize
    ├── fileTypes         # 文件类型筛选
    └── ...
```

### 数据库架构

```
数据存储路径 (dataPath，可配置)
├── meta.db              # 元数据（扫描目录、搜索历史、标签）
├── shards/              # 数据分片
│   ├── shard_0.db       # 分片 0
│   ├── shard_1.db       # 分片 1
│   └── ...
└── usn/                 # USN 监控数据
    └── usn_state.json

固定路径 (userData/db) - 仅存储配置
└── config.json          # 所有配置
```

### IPC 通信架构

```
Renderer (React)
    │
    ├── window.electron.getLanguage/setLanguage
    ├── window.electron.getTheme/setTheme
    ├── window.electron.getMinimizeToTray/setMinimizeToTray
    ├── window.electron.getDataPath/setDataPath
    ├── window.electron.getScanSettings/updateScanSettings
    └── ... (80+ IPC handlers)

Preload (electron/preload/index.ts)
    └── 暴露安全的 API 给渲染进程

Main Process (electron/main/)
    ├── config.ts        # 配置管理
    ├── database.ts      # 数据库初始化
    ├── meta.ts          # 元数据库操作
    ├── shardManager.ts  # 分片管理
    ├── ipc.ts           # IPC 处理
    └── ...
```

---

---

## 当前导航结构

| 页面 | 路由 | 组件 | 说明 |
|------|------|------|------|
| 搜索文档 | `search` | SearchPage | 首页，文件列表 + 预览 |
| 扫描目录 | `scan` | ScanPage | 添加目录 + 开始扫描 + 文件夹管理 |
| 设置 | `language` | LanguagePage | 主题 + 语言 + 文件类型 + 标签管理 |
| 关于 | `guide` | GuidePage | 功能介绍 + 赞赏作者 |
| 标签管理 | `tags` | TagsPage | 标签管理页（可从设置页打开） |

---

## 已完成功能

### 界面
- [x] Electron 无边框窗口 + 自定义标题栏
- [x] 左侧固定导航栏
- [x] CSS Variables 主题系统（浅色/深色/跟随系统）
- [x] 状态栏组件（索引文件数 + 监控状态）
- [x] 文件列表重构（虚拟滚动）
- [x] 文件预览区样式升级
- [x] 搜索框样式升级
- [x] 按钮样式统一（btn-primary / btn-secondary / btn-small / btn-danger）
- [x] 自定义确认对话框（风格统一）

### 页面功能
- [x] 搜索功能（全文检索 + SQLite FTS5 + BM25 相关性排序）
- [x] 高级搜索语法（AND/OR/NOT/前缀/短语/正则）
- [x] 词干提取搜索（Porter Stemmer）：搜索 "run" 自动匹配 "running/runs/run" 文档
- [x] 字段限定搜索语法：`name:`（文件名）、`path:`（路径）、`ext:`（扩展名）
- [x] 正则搜索模式：`/pattern/`
- [x] 搜索历史（记录与快速复用）
- [x] 保存的搜索（命名收藏）
- [x] 去重功能（按 MD5 过滤重复文件）
- [x] 模糊搜索（Fuse.js 容忍拼写错误）
- [x] 二次筛选（结果中按路径/文件名筛选）
- [x] 批量操作（移动/复制/删除）
- [x] 文献引用卡片（提取关键词引用，支持导出 MD/TXT）
- [x] 扫描目录（添加目录 + 开始扫描）
- [x] 文件夹管理（增量扫描/完整扫描/删除）
- [x] 语言切换（中/英文）
- [x] 主题切换（浅色/深色/跟随系统）
- [x] 搜索页面切换时保留搜索状态
- [x] 搜索结果排序（相关性/大小/修改时间）
- [x] 搜索结果导出（CSV/HTML/TXT）
- [x] 可访问性设置（字号调节/图标大小调节）
- [x] 文件类型筛选（选择只扫描特定类型文件，通过模态框配置）
- [x] 设置页重构（分组展示，模态框配置）

### 右键菜单功能
- [x] 在文件夹中显示
- [x] 打开文件（定位到关键词）
- [x] 复制路径
- [x] 复制文件名
- [x] OCR 识别（图片/PDF 中的文字提取）
- [x] 导出文本内容（文件内容保存为 TXT）

### 系统集成
- [x] 系统托盘（最小化到托盘、托盘菜单）
- [x] 关闭确认对话框
- [x] 删除确认对话框
- [x] 浮动搜索窗口（快捷搜索）
- [x] 全局快捷键（Ctrl+Shift+F）
- [x] 双击 Ctrl 热键唤起浮动窗口（Windows 专用）
- [x] ESC 键关闭浮动窗口
- [x] 数据存储位置配置（可自定义数据路径）
- [x] 实时文件监控（USN Journal + Go 进程）
- [x] 图片缩略图预览（hover 预览 JPG/PNG/GIF/WebP）

### 文件格式支持
- [x] 文档格式：Word · Excel · PowerPoint · PDF · RTF · CHM
- [x] 开放格式：ODF (ODT/ODS/ODP) · EPUB
- [x] 压缩包：ZIP/RAR/7Z/GZIP（支持包内搜索）
- [x] 邮件：MSG/PST（Outlook）、EML/mbox
- [x] 国产办公：WPS (WPS/ET/DPS)
- [x] Apple iWork：Pages/Numbers/Keynote
- [x] 70+ 种源代码和配置文件格式
- [x] 图片元数据提取（EXIF 等）
- [x] 图片 OCR 识别（PNG/JPG/PDF，支持中文/英文/日文/韩文，Windows.Media.Ocr → Tesseract 分层方案）

### 标签管理
- [x] 文件标签（用户自定义标签分类）
- [x] 标签管理（设置页模态框 + 独立页面）
- [x] 标签筛选搜索

### 帮助页（关于页）
- [x] 功能介绍（15项核心功能）
- [x] 赞赏作者（含收款码）

### i18n
- [x] 完整中英文翻译（700+ 翻译 key）
- [x] 语言设置持久化（统一使用 config.json）

### 代码质量
- [x] 清理无用文件和死代码
- [x] 清理 styles.css 重复 CSS 和孤立规则
- [x] 清理 LanguageContext.tsx 孤立翻译 key
- [x] 清理 AppContext.tsx 死代码
- [x] 清理 IPC/preload 废弃 API
- [x] 提取 formatSize 为共享工具函数
- [x] TypeScript 编译零错误
- [x] 数据库分片架构（config.json 快速启动 + shards 后台加载）
- [x] localStorage 迁移到 config.json（主题/语言/最小化到托盘）

---

## 主要功能列表（关于页展示）

1. 全文搜索：支持 70+ 种文件格式的内容搜索，基于 SQLite FTS5 + BM25 相关性排序
2. 高级搜索语法：支持 AND/OR/NOT/前缀/短语/正则搜索
3. 多文件夹管理：支持同时管理多个扫描目录
4. 增量扫描：仅扫描新增或修改的文件，快速更新索引
5. 实时文件监控：监控目录下文件变更，自动更新搜索索引
6. 图片 OCR：扫描版 PDF/图片中的文字可提取搜索，支持中文/英文/日文/韩文
7. 文献引用卡片：从文档中提取关键词引用，支持导出 MD/TXT
8. 右键菜单导出：文件内容可导出为 TXT，方便保存
9. 搜索历史+收藏：快速复用历史查询，命名收藏常用搜索
10. 全局快捷键：Ctrl+Shift+F 或双击 Ctrl 随时唤起搜索
11. 批量操作：移动/复制/删除多个搜索结果
12. 本地优先：所有数据存储在本地，不上传云端，隐私安全
13. 可访问性：字号/图标大小可调节，方便视力不好的用户
14. 文件类型筛选：选择只扫描特定类型的文件，减少不必要的处理
15. 模态框配置：设置页使用模态框配置文件类型和标签管理

---

## 待完善功能

- [ ] 重复文件检测页面（DuplicateFinder 组件已实现，未集成）
- [ ] 应用图标（需重新打包生效）
- [ ] CAD 文件支持（DWG/DXF 工程图纸）- 暂不计划

---

## 技术栈

- 前端：React + TypeScript + CSS Variables
- 后端：Electron + Node.js + better-sqlite3
- 监控：Go + fsnotify（USN 文件监控 + 双击 Ctrl 热键）
- OCR：Windows.Media.Ocr（Windows 10+，最高优先级）→ Tesseract（备选，需安装）
- 构建：electron-vite + electron-builder

---

## 关键文件

### 前端组件
| 文件 | 说明 |
|------|------|
| `src/context/LanguageContext.tsx` | i18n 翻译字典 + 语言/主题状态管理 |
| `src/context/AppContext.tsx` | 全局状态（扫描进度等） |
| `src/components/TitleBar.tsx` | 自定义标题栏（含导航按钮） |
| `src/components/StatusBar.tsx` | 状态栏 |
| `src/components/ConfirmDialog.tsx` | 自定义确认对话框 |
| `src/components/FileList.tsx` | 文件列表组件（含右键菜单） |
| `src/components/FileDetail.tsx` | 文件预览组件 |
| `src/components/FileTypesModal.tsx` | 文件类型配置模态框 |
| `src/components/TagsModal.tsx` | 标签管理模态框 |
| `src/styles.css` | 全局样式（含主题变量） |

### 页面组件
| 文件 | 说明 |
|------|------|
| `src/pages/SearchPage.tsx` | 搜索文档页 |
| `src/pages/ScanPage.tsx` | 扫描目录页 |
| `src/pages/LanguagePage.tsx` | 设置页 |
| `src/pages/GuidePage.tsx` | 关于页 |
| `src/pages/TagsPage.tsx` | 标签管理页 |
| `src/pages/FloatingSearch.tsx` | 浮动搜索窗口 |

### 后端模块
| 文件 | 说明 |
|------|------|
| `electron/main/index.ts` | Electron 主进程入口 |
| `electron/main/config.ts` | 配置管理（读写 config.json） |
| `electron/main/database.ts` | 数据库初始化（initConfig → initMeta） |
| `electron/main/meta.ts` | 元数据库操作（扫描目录、搜索历史、标签） |
| `electron/main/shardManager.ts` | 数据库分片管理 |
| `electron/main/scanner.ts` | 扫描器（多格式解析 + OCR） |
| `electron/main/scanWorker.ts` | 扫描 Worker（Worker thread） |
| `electron/main/ipc.ts` | IPC 通信处理（80+ handlers） |
| `electron/preload/index.ts` | 预加载脚本（暴露安全的 API） |

### 工具脚本
| 文件 | 说明 |
|------|------|
| `go/main.go` | Go 监控进程入口（USN Watcher + 双击 Ctrl） |
| `go/keyboard_hook.go` | 双击 Ctrl 检测（GetAsyncKeyState 轮询） |
| `electron/main/extractOcr.py` | PDF OCR 提取脚本 |
| `scripts/auto-test-formats.js` | 格式自动测试脚本 |

---

## 近期提交记录

```
11a0ee5 refactor: migrate localStorage to config.json
bb79a4e refactor: redesign settings page with modal dialogs
c40031d fix: enable scroll for settings page with many options
ad7f0b7 feat: add file type category filter for scanning
f905c5f feat: add OCR tiered fallback strategy (Windows.Media.Ocr → Tesseract)
```

---