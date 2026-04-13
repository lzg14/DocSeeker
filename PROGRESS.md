# DocSeeker 开发进度记录

> 最后更新：2026-04-13

---

## 当前导航结构

| 页面 | 路由 | 组件 | 说明 |
|------|------|------|------|
| 搜索 | `search` | SearchPage | 首页，文件列表 + 预览 |
| 扫描文件 | `scan` | ScanPage | 扫描操作 + 文件夹管理 |
| 语言设置 | `language` | LanguagePage | 主题 + 语言切换 |
| 定时设置 | `schedule` | SchedulePage | 定时增量扫描配置 |
| 帮助 | `guide` | GuidePage | 介绍 + 步骤 + 打赏 |

---

## 已完成功能

### 界面美化（Linear/Clean 风格）
- [x] Electron 无边框窗口 + 自定义标题栏
- [x] 左侧固定导航栏
- [x] CSS Variables 主题系统（浅色/深色）
- [x] 状态栏组件
- [x] 文件列表重构（去除 snippet）
- [x] 文件预览区样式升级
- [x] 搜索框样式升级

### 页面功能
- [x] 搜索功能（全文检索）
- [x] 扫描文件（添加目录时自动执行首次扫描）
- [x] 文件夹管理（增量扫描/完整扫描/删除）
- [x] 语言切换（中/英文）
- [x] 主题切换（浅色/深色）
- [x] 定时设置页面（定时增量扫描）

### 帮助页内容
- [x] 功能介绍（概述 + 6条主要功能 + 技术栈）
- [x] 使用步骤
- [x] 赞赏作者（含开发者信息和收款码）

### i18n
- [x] 完整中英文翻译
- [x] 语言设置持久化（localStorage）

---

## 主要功能列表（帮助页展示）

1. 全文搜索：支持 docx、xlsx、pdf、txt 等格式的文件名和内容搜索
2. 定时扫描：可配置定时增量扫描，无需手动维护
3. 重复文件检测：通过 MD5 哈希快速找出重复文件
4. 多文件夹管理：支持同时管理多个扫描目录
5. 本地优先：所有数据存储在本地，不上传云端，隐私安全
6. 轻量高效：基于 SQLite + Electron，启动快、资源占用低

---

## 技术栈

- 前端：React + TypeScript + CSS Variables
- 后端：Electron + Node.js + better-sqlite3
- 构建：electron-vite + electron-builder

---

## 待完善功能

- [ ] 定时任务后端触发机制（SchedulePage 为空壳，需对接后端定时任务）
- [ ] 重复文件检测页面（目前仅在帮助页提及，未实现 UI）
- [ ] 收款码图片资源（`resources/wechat-pay.jpg`, `resources/alipay.jpg`）

---

## Git 提交记录

```
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

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/context/LanguageContext.tsx` | i18n 翻译字典 |
| `src/context/AppContext.tsx` | 全局状态（扫描进度等） |
| `src/components/SideNav.tsx` | 左侧导航 |
| `src/components/TitleBar.tsx` | 自定义标题栏 |
| `src/styles.css` | 全局样式（含主题变量） |
| `src/pages/ScanPage.tsx` | 扫描文件页 |
| `src/pages/SchedulePage.tsx` | 定时设置页（待完善） |
| `src/pages/GuidePage.tsx` | 帮助页 |
