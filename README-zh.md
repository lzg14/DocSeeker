# DocSeeker - 个人文档搜索工具

一个基于 Electron + React + TypeScript 的桌面文档搜索工具，专为查找个人长期积累的文档设计，支持文档扫描和全文搜索。

**定位**：帮助个人用户管理和搜索长期积累的各类文档（Word、Excel、PPT、PDF、TXT 等），通过手动增量扫描或完整重新扫描更新索引，随时快速找到需要的文件。

## 功能特性

### 1. 引导页面
- 首次使用引导，快速了解核心功能
- 支持打赏（微信/支付宝）
- 应用信息展示

### 2. 扫描页面
- 添加/删除扫描目录
- 首次全量扫描，建立全文索引
- 手动执行增量扫描或完整重新扫描
- 实时显示扫描进度
- 查看扫描统计（文件数量、总大小、上次扫描时间）

### 3. 搜索页面
- 支持文件名和文档内容关键词搜索（FTS5 全文索引 + BM25 相关性排序）
- 搜索历史记录（最近 20 条）
- 保存的搜索（命名收藏）
- 高级筛选（文件类型、大小范围、日期范围）
- 搜索语法帮助
- 显示搜索关键词上下文片段（高亮匹配内容）
- 搜索结果按相关性排序
- 点击查看文件详情
- 快速打开文件或在文件夹中显示

### 4. 语言与主题设置
- 支持简体中文和 English，切换立即生效
- 7 种主题可选：浅色、深色、蓝调、北欧、暖色、太阳升、跟随系统
- 跟随系统模式自动匹配 Windows/macOS 亮色/暗色主题

### 5. 浮动搜索窗口
- 按 `Ctrl+Shift+F` 全局快捷键随时呼出
- 无需切换窗口即可快速搜索
- 搜索结果可直接打开文件或定位到文件夹

### 6. 系统托盘
- 关闭主窗口时最小化到系统托盘（可配置）
- 托盘菜单：显示窗口、全局搜索、退出
- 双击托盘图标显示主窗口

### 7. 开机自启与静默启动
- 可配置为开机自动启动
- 支持 `--startup` 静默启动参数，程序启动时隐藏主窗口，仅在托盘运行

### 8. 自动升级
- 每月 5 日和 15 日自动检查 GitHub Releases 是否有新版本
- 发现新版本时右下角弹出通知
- 支持一键下载并安装升级

## 支持的文件类型

- **Office 文档**: `.docx`, `.xlsx`, `.pptx`
- **旧版 Office**: `.doc`, `.xls`, `.ppt`
- **PDF**: `.pdf`
- **文本文件**: `.txt`, `.md`, `.json`, `.xml`, `.csv`
- **其他**: RTF、CHM、ODF（ODT/ODS/ODP）、EPUB、ZIP（含嵌套文档）、邮件（EML/MBOX）、WPS/WPP/ET/DPS

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **桌面框架**: Electron
- **数据库**: SQLite (better-sqlite3)，支持 FTS5 全文索引
- **文档解析**: mammoth (docx), xlsx (Excel), pdf-parse (PDF), jszip (PPTX)
- **哈希计算**: MD5
- **自动升级**: electron-updater

## 开发

### 环境要求
- Node.js 18+
- npm 9+
- Python 3.x（编译 better-sqlite3 原生模块）
- Visual Studio Build Tools 2022（Windows 上编译原生模块）

### 安装依赖
```bash
npm install
```

首次安装会自动重建 better-sqlite3 原生模块适配 Electron 版本。

### 启动开发服务器
```bash
npm run dev
```

### 构建应用
```bash
npm run build
```

### 打包安装包
```bash
npm run build:win        # Windows (.exe NSIS 安装包)
npm run build:win:portable  # Windows 便携版 (.exe)
npm run build:mac        # macOS (.dmg)
npm run build:linux      # Linux (AppImage/deb)
```

打包后的文件位于 `dist/` 目录。

## 项目结构

```
docseeker/
├── src/                      # React 前端源码
│   ├── components/           # React 组件
│   ├── context/              # React Context（全局状态）
│   ├── pages/                # 页面组件
│   │   ├── GuidePage.tsx    # 引导页面
│   │   ├── ScanPage.tsx     # 扫描页面
│   │   ├── SearchPage.tsx   # 搜索页面
│   │   ├── LanguagePage.tsx # 语言设置
│   │   └── FloatingSearch.tsx # 浮动搜索窗口
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # React 入口
│   ├── styles.css           # 全局样式
│   └── types.ts             # TypeScript 类型定义
├── electron/                  # Electron 后端源码
│   ├── main/                 # 主进程
│   │   ├── index.ts         # 主进程入口
│   │   ├── ipc.ts           # IPC 处理器
│   │   ├── database.ts     # SQLite 数据库操作（FTS5 + BM25）
│   │   ├── scanner.ts      # 文件扫描逻辑
│   │   ├── scanWorker.ts    # Worker 线程扫描
│   │   └── updater.ts       # 自动升级检测
│   └── preload/             # 预加载脚本
│       └── index.ts         # API 桥接
├── electron-builder.yml      # 打包配置（electron-builder）
├── package.json              # 依赖管理 + 脚本命令
├── tsconfig.json             # TypeScript 前端编译配置
├── tsconfig.node.json        # TypeScript Node.js/Electron 配置
└── electron.vite.config.ts # Vite 构建配置
```

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `package.json` | 依赖管理、脚本命令（`npm run dev`、`npm run build:win`） |
| `tsconfig.json` | TypeScript 编译配置（编译 `src/` 目录的前端代码） |
| `tsconfig.node.json` | TypeScript 配置（编译 `electron/` 目录的后端代码） |
| `electron.vite.config.ts` | Vite 构建配置 |
| `electron-builder.yml` | 打包配置（将项目打包成 Windows .exe/macOS .dmg/Linux 安装包） |
| `.gitignore` | 指定哪些文件不提交到 Git（node_modules、dist 等） |

## 使用说明

### 首次使用
1. 启动应用（初次使用会弹出引导页面）
2. 切换到「扫描」页面，点击「添加目录」添加要扫描的文件夹
3. 点击「开始扫描」进行首次全量扫描
4. 等待扫描完成（根据文件数量可能需要几分钟）
5. 切换到「搜索」页面，输入关键词搜索文件

### 系统托盘
- 点击窗口关闭按钮时，应用会最小化到系统托盘而非退出
- 点击托盘图标可重新显示主窗口
- 托盘菜单提供「显示窗口」「全局搜索」「退出」选项
- 在「语言与主题」设置中可关闭「关闭时最小化到托盘」选项

### 搜索技巧
- 输入文件名关键词直接搜索
- 输入文档内容中的关键词搜索（全文检索）
- 支持多关键词搜索（用空格分隔，结果按相关性排序）
- 使用高级筛选缩小范围（文件类型、大小、日期）
- 点击搜索结果可查看文件详情
- 使用 Ctrl+Shift+F 随时呼出浮动搜索窗口

### 自动升级
- 应用会在每月 5 日和 15 日自动检查新版本
- 右下角弹出通知提示新版本可用
- 点击「下载」下载更新包

---

## 开发指南

详细规范参见 [docs/superpowers/plans/](docs/superpowers/plans/) 下的开发计划文档。

### 技术栈

- **框架**：Electron + React + TypeScript
- **数据库**：SQLite (better-sqlite3) + FTS5
- **构建**：electron-vite + electron-builder
- **搜索**：FTS5 全文索引

### 项目结构

```
docSeeker/
├── electron/          # Electron 主进程代码
│   └── main/          # 主进程入口
├── src/               # React 渲染进程代码
├── docs/              # 开发文档
│   └── superpowers/plans/  # 开发计划文档
├── public/            # 静态资源
└── build/             # 应用图标等构建资源
```

### 数据库架构

所有数据存储在 `AppData/Roaming/DocSeeker/db/` 目录下：

| 文件 | 类型 | 存储内容 | 加载时机 |
|------|------|---------|---------|
| `db/config.db` | SQLite | 扫描文件夹列表、搜索历史、保存搜索、扫描设置、应用设置 | 启动同步 (<50ms) |
| `db/hot-cache.json` | JSON | 热点搜索结果缓存（LRU ≤1MB） | 启动同步 (<10ms) |
| `db/shards/*.db` | SQLite | 文件记录 + FTS5 全文索引，按固定大小切分 | 后台并行加载 |

**config.db 表结构：**
- `scanned_folders` — 扫描目录及元数据
- `search_history` — 搜索历史记录
- `saved_searches` — 保存的搜索
- `scan_settings` — 扫描配置（超时、最大文件大小等）
- `app_settings` — 应用设置（主题、语言、热键、窗口状态等）

**shards 规则：**
- 单 shard 大小上限 = 磁盘读速(MB/s) × 2（保证 2s 内加载）
- 文件按扫描顺序依次填入 shard，满则自动创建新 shard
- 每个 shard 含 `shard_files` 表 + `shard_files_fts` 虚拟 FTS5 表

### 提交规范

- 提交信息使用中文描述
- 每次提交应包含功能范围标签：`feat:` / `fix:` / `docs:` / `refactor:` / `test:`
- 示例：`feat(shard): implement shard-based database architecture`

### 开发完成更新文档

1. **计划文档**：在 `docs/superpowers/plans/` 目录下的开发计划中，将对应任务的「状态」列更新为「✅ 已完成」，并填写提交 SHA
2. **README.md**：如果功能影响用户使用，更新 README 相关描述
3. **CHANGELOG.md**：在 CHANGELOG 中添加本次更新内容（如果没有则新建）
- 下载完成后点击「立即重启安装」

---

## 竞品对比

与主流竞品对比分析，详见 [竞品分析报告](./docs/superpowers/archive/COMPETITION.md)。

**DocSeeker 核心优势：**
- 免费 + MIT 许可证
- 77 种文档格式（免费竞品最多）
- 唯一中英双语原生支持
- 唯一模糊搜索（Fuse.js）
- NTFS USN Journal 实时监控
- 7 种主题 + 暗色模式

