# DocSeeker 开发进度记录

> 最后更新：2026-04-13

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

---

---

## 当前导航结构

| 页面 | 路由 | 组件 | 说明 |
|------|------|------|------|
| 搜索文档 | `search` | SearchPage | 首页，文件列表 + 预览 |
| 扫描目录 | `scan` | ScanPage | 添加目录 + 开始扫描 + 文件夹管理 |
| 语言与主题 | `language` | LanguagePage | 主题 + 语言切换 |
| 关于 | `guide` | GuidePage | 功能介绍 + 赞赏作者 |

---

## 已完成功能

### 界面
- [x] Electron 无边框窗口 + 自定义标题栏
- [x] 左侧固定导航栏
- [x] CSS Variables 主题系统（浅色/深色）
- [x] 状态栏组件（索引文件数 + 扫描进度）
- [x] 文件列表重构
- [x] 文件预览区样式升级
- [x] 搜索框样式升级
- [x] 按钮样式统一（btn-primary / btn-secondary / btn-small / btn-danger）
- [x] 自定义确认对话框（风格统一）

### 页面功能
- [x] 搜索功能（全文检索）
- [x] 词干提取搜索（Porter Stemmer）：搜索 "run" 自动匹配 "running/runs/run" 文档
- [x] 字段限定搜索语法：`name:`（文件名）、`path:`（路径）、`ext:`（扩展名）
- [x] 扫描目录（添加目录 + 开始扫描）
- [x] 文件夹管理（增量扫描/完整扫描/删除）
- [x] 语言切换（中/英文）
- [x] 主题切换（浅色/深色）
- [x] 搜索页面切换时保留搜索状态

### 系统集成
- [x] 系统托盘（最小化到托盘、托盘菜单）
- [x] 关闭确认对话框
- [x] 删除确认对话框

### 帮助页（关于页）
- [x] 功能介绍（5项核心功能）
- [x] 赞赏作者（含收款码）

### i18n
- [x] 完整中英文翻译
- [x] 语言设置持久化（localStorage）

### 代码质量
- [x] 清理无用文件和死代码（删除 7 个未使用文件）
- [x] 清理 styles.css 重复 CSS 和孤立规则
- [x] 清理 LanguageContext.tsx 孤立翻译 key
- [x] 清理 AppContext.tsx 死代码
- [x] 清理 IPC/preload 废弃 API
- [x] 提取 formatSize 为共享工具函数
- [x] TypeScript 编译零错误

---

## 主要功能列表（关于页展示）

1. 全文搜索：支持 docx、xlsx、pdf、txt 等格式的文件名和内容搜索
2. 多文件夹管理：支持同时管理多个扫描目录
3. 增量扫描：仅扫描新增或修改的文件，快速更新索引
4. 完整扫描：重新扫描所有文件，确保索引完整准确
5. 本地优先：所有数据存储在本地，不上传云端，隐私安全

---

## 待完善功能

- [ ] 重复文件检测页面（DuplicateFinder 组件已实现，未集成）
- [ ] 应用图标（需重新打包生效）

---

## 技术栈

- 前端：React + TypeScript + CSS Variables
- 后端：Electron + Node.js + better-sqlite3
- 构建：electron-vite + electron-builder

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/context/LanguageContext.tsx` | i18n 翻译字典 |
| `src/context/AppContext.tsx` | 全局状态（扫描进度等） |
| `src/components/SideNav.tsx` | 左侧导航 |
| `src/components/TitleBar.tsx` | 自定义标题栏 |
| `src/components/StatusBar.tsx` | 状态栏 |
| `src/components/ConfirmDialog.tsx` | 自定义确认对话框 |
| `src/components/FileList.tsx` | 文件列表组件 |
| `src/components/FileDetail.tsx` | 文件预览组件 |
| `src/styles.css` | 全局样式（含主题变量） |
| `src/pages/ScanPage.tsx` | 扫描目录页 |
| `src/pages/SearchPage.tsx` | 搜索文档页 |
| `src/pages/LanguagePage.tsx` | 语言与主题页 |
| `src/pages/GuidePage.tsx` | 关于页 |
| `src/utils/format.ts` | 工具函数（formatSize） |
| `electron/main/database.ts` | 数据库操作（SQLite） |
| `electron/main/ipc.ts` | IPC 通信处理 |
| `electron/main/index.ts` | Electron 主进程入口 |
| `electron/main/fileWatcher.ts` | 文件监控（增量扫描） |
| `electron/main/scheduler.ts` | 定时任务调度 |
| `electron/preload/index.ts` | 预加载脚本 |

---

## Git 提交记录

```
e87a5ac docs: add PROGRESS.md tracking current project status
a7067fc fix: folder-item background, text colors, and button layout
d9bd3f7 fix: deduplicate features list, merge into 6 concise items
0ae5461 fix: remove FAQ section, merge features and advantages in guide page
7fc9c40 fix: remove schedule from scan page, merge donate into guide
c2e5aa0 feat: merge scan+config pages, add donate page, restructure help
887c747 fix: improve Chinese description wording
ea35217 fix: prevent button text wrapping with white-space nowrap
043746b fix: rename '设置' to '扫描设置'
bfbe31f fix: resolve nav labels, scan button style, and implement full i18n
c437dcf chore(styles): remove legacy CSS and add scrollbar + transitions
```
