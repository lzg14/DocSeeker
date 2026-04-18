# DocSeeker 项目规范

## 功能变更同步规则

- **新增功能**：必须同步更新以下位置
  - `docs/PROGRESS.md` - 已完成功能列表
  - `docs/ROADMAP.md` - 里程碑状态
  - `src/pages/GuidePage.tsx` - 关于页功能描述（多语言 i18n）
  - `src/context/LanguageContext.tsx` - 如果涉及翻译文本

- **删除/暂缓功能**：必须从上述位置移除相关描述

- **规则**：代码和文档同步提交，不允许文档落后于代码

## 关于页（GuidePage）更新说明

关于页展示软件功能特性，包含多语言翻译：
- 中文：`guide.feature1` ~ `guide.feature7`
- 英文：对应的英文 key

功能变更时，需要同时更新 i18n 翻译文本。

## 前端规范

### CSS 变量命名
- 使用 `--` 前缀 + 语义化命名，如 `--primary-color`、`--text-secondary`
- 禁止使用内联 style，统一使用 CSS 变量或 class

### 组件结构
- 一个组件一个文件，文件名与组件名一致
- Props 和 State 类型定义在组件文件顶部或单独 types 文件
- 优先使用函数组件 + Hooks

## Electron 规范

### 主进程 / 渲染进程通信
- 渲染进程通过 `window.electron.xxx()` 调用主进程（preload 暴露的 API）
- 禁止在渲染进程中直接 import `electron` 模块
- IPC handler 注册统一放在 `electron/main/ipc.ts`
- 每个 IPC channel 名称格式：`module-action`，如 `file-read`、`search-query`

### 进程安全
- 不在 preload 之外暴露 Node.js API 到渲染进程
- 用户输入必须经过验证再传给主进程

## 数据库规范

### SQLite 字段修改流程
1. 在 `migration.ts` 中编写迁移脚本，使用 ALTER TABLE
2. 修改实体类字段后，必须同步更新 TypeScript 类型定义
3. 迁移前先备份数据库文件
4. **禁止直接修改已有字段类型**，新增字段或创建新表迁移数据
5. 提交前验证迁移脚本在开发环境运行正常
