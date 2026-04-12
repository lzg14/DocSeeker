# FileTool - 文件管理工具

一个基于 Electron + React + TypeScript 的桌面文件管理工具，支持文档扫描、全文搜索和定时增量扫描。

## 功能特性

### 1. 配置页面
- 管理扫描目录（添加/删除）
- 全局定时增量扫描设置（每周固定时间自动扫描）
- 手动执行增量扫描或完整扫描
- 查看扫描统计信息（文件数量、总大小、上次扫描时间）

### 2. 扫描页面
- 选择目录并执行首次扫描
- 实时显示扫描进度
- 支持暂停/继续/取消扫描
- 自动提取文档内容并建立索引

### 3. 搜索页面
- 支持文件名和文档内容关键词搜索
- 显示搜索结果列表（支持排序）
- 文件详情查看
- 快速打开文件或在文件夹中显示

## 支持的文件类型

- **Office 文档**: `.docx`, `.xlsx`, `.pptx`
- **旧版 Office**: `.doc`, `.xls`, `.ppt`
- **PDF**: `.pdf`
- **文本文件**: `.txt`, `.md`, `.json`, `.xml`, `.csv`

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **桌面框架**: Electron
- **数据库**: SQLite (better-sqlite3)
- **文档解析**: mammoth (docx), xlsx (Excel), pdf-parse (PDF), jszip (PPTX)
- **哈希计算**: MD5

## 开发

### 环境要求
- Node.js 18+
- npm 9+

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建应用
```bash
npm run build
```

打包后的可执行文件位于 `dist/` 目录。

## 项目结构

```
fileTool/
├── src/                      # React 前端源码
│   ├── components/           # React 组件
│   ├── context/              # React Context (全局状态)
│   ├── pages/                # 页面组件
│   │   ├── ConfigPage.tsx    # 配置页面
│   │   ├── ScanPage.tsx      # 扫描页面
│   │   └── SearchPage.tsx    # 搜索页面
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx              # React 入口
│   ├── styles.css             # 全局样式
│   └── types.ts               # TypeScript 类型定义
├── electron/                  # Electron 后端源码
│   ├── main/                 # 主进程
│   │   ├── index.ts          # 主进程入口
│   │   ├── ipc.ts            # IPC 处理器
│   │   ├── database.ts       # SQLite 数据库操作
│   │   ├── scanner.ts        # 文件扫描逻辑
│   │   ├── scanWorker.ts     # Worker 线程扫描
│   │   └── scheduler.ts      # 定时扫描调度器
│   └── preload/              # 预加载脚本
│       └── index.ts          # API 桥接
├── index.html                 # HTML 入口
├── package.json              # 依赖管理 + 脚本命令
├── tsconfig.json             # TypeScript 前端编译配置
├── tsconfig.node.json        # TypeScript Node.js/Electron 配置
├── electron.vite.config.ts   # Vite 构建配置
└── electron-builder.yml      # 打包成 .exe 安装包的配置
```

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `package.json` | 依赖管理、脚本命令（`npm run dev`、`npm run build`） |
| `tsconfig.json` | TypeScript 编译配置（编译 `src/` 目录的前端代码） |
| `tsconfig.node.json` | TypeScript 配置（编译 `electron/` 目录的后端代码） |
| `electron.vite.config.ts` | Vite 构建配置（前端构建工具的配置） |
| `electron-builder.yml` | 打包配置（将项目打包成 Windows .exe 安装包） |
| `.gitignore` | 指定哪些文件不提交到 Git（node_modules、dist 等） |

### 常用命令

```bash
npm install        # 安装依赖（首次运行或拉取代码后）
npm run dev        # 启动开发服务器
npm run build      # 编译 TypeScript → JavaScript
npm run dist       # 打包成 .exe 安装包（输出到 dist/ 目录）
```

## 使用说明

### 首次使用
1. 启动应用
2. 切换到「配置」页面，点击「添加目录」添加要扫描的文件夹
3. 切换到「扫描」页面，选择目录进行首次扫描
4. 等待扫描完成（根据文件数量可能需要几分钟）
5. 切换到「搜索」页面，输入关键词搜索文件

### 定时扫描
1. 在「配置」页面顶部设置定时扫描
2. 勾选「启用定时扫描」
3. 选择每周几和几点执行
4. 到达设定时间时，应用会自动执行增量扫描

### 搜索技巧
- 输入文件名关键词直接搜索
- 输入文档内容中的关键词搜索
- 点击搜索结果可查看文件详情
