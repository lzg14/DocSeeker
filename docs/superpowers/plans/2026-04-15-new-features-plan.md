# DocSeeker 新功能实施计划

> 更新时间: 2026-04-15

## 目标

在排除「实时监控」（chokidar 架构问题）后，实现其他可落地的增强功能。

---

## 功能清单与难度评估

### 简单（前端改动，无需后端改动）

| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| F1 | 正则搜索 | ~1h | FTS5 查所有结果，前端用 JS RegExp 二次过滤 |
| F2 | 拖拽文件搜索 | ~2h | HTML5 drag-drop，提取拖入文件内容搜索 |
| F3 | 去重功能 UI | ~1h | 数据库已有 hash 字段，UI 展示重复文件 |

### 中等（需前后端联动）

| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| F4 | 网络驱动器支持 | ~1h | 移除扫描器中对 UNC 路径的过滤限制 |
| F5 | EPUB 格式支持 | ~2h | EPUB 是 ZIP+XML，复用 jszip 解析 content.opf |
| F6 | 全局快捷键浮层 | ~4h | 独立 BrowserWindow + globalShortcut，参考 Listary |

### 中高（需平台 API 或额外依赖）

| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| F7 | 缩略图预览 | ~6h | Windows IShellThumbnail 或 Electron nativeImage |
| F8 | WPS 格式支持 | ~4h | WPS 是 OLE2 类似格式，node-oleg 库 |

---

## 实施顺序

```
F1 正则搜索      → F2 拖拽搜索    → F3 去重UI
        ↓
F4 网络驱动器   → F5 EPUB格式    → F6 全局浮层
                      ↓
                F7 缩略图预览   → F8 WPS格式
```

---

## Task 1: F1 正则搜索 ✅

**描述**: 用户输入 `/pattern/` 格式时识别为正则，前端对结果二次过滤

**改动文件**:
- `src/pages/SearchPage.tsx` — 识别正则语法，二次过滤
- `src/context/LanguageContext.tsx` — 新增 i18n key

**交互**:
- 搜索框输入 `/正则表达式/` 格式时，自动开启正则模式
- 语法提示面板增加正则说明

---

## Task 2: F2 拖拽文件搜索 ✅

**描述**: 把文件拖入搜索区，自动提取内容并搜索

**改动文件**:
- `src/pages/SearchPage.tsx` — 增加 drag-drop 事件监听
- `electron/main/scanner.ts` — 复用 extractContent
- `electron/main/ipc.ts` — 新增 IPC: extract-file-content

**交互**:
- 搜索区域支持拖入文件
- 拖入后自动弹出"正在提取内容并搜索..."
- 提取内容后填入搜索框并执行搜索

---

## Task 3: F3 去重功能 UI ✅

**描述**: 展示数据库中 hash 相同的重复文件

**改动文件**:
- `electron/main/database.ts` — 新增 findDuplicates()
- `electron/main/ipc.ts` — IPC: find-duplicates
- `src/preload/index.ts` — preload API
- `src/pages/SearchPage.tsx` — 去重入口 + 结果展示
- `src/context/LanguageContext.tsx` — i18n

**交互**:
- 搜索页工具栏增加「查重」按钮
- 点击后展示所有 hash 重复的文件列表
- 点击组展开，显示所有重复文件，可打开/删除

---

## Task 4: F4 网络驱动器支持 ✅

**描述**: 扫描时不跳过 UNC 路径（`\\server\share`）

**改动文件**:
- `electron/main/scanner.ts` — 移除 isNetworkPath 判断

**验证**:
- 添加 `\\localhost\c$` 等路径测试

---

## Task 5: F5 EPUB 格式支持 ✅

**描述**: EPUB 是 ZIP 内含 XML，解析 content.opf 提取文本

**改动文件**:
- `electron/main/scanner.ts` — SUPPORTED_EXTENSIONS + FILE_TYPE_MAP + extractTextFromEpub()
- `electron/main/fileWatcher.ts` — 同步更新（如果重新启用）

**技术方案**:
```typescript
// EPUB 结构:
// mybook.epub (ZIP)
//   META-INF/container.xml → 找到 content.opf 路径
//   OEBPS/content.opf     → 书脊信息 + 章节列表
//   OEBPS/chapters/*.xhtml → 章节内容
```

---

## Task 6: F6 全局快捷键浮层 ✅

**描述**: 全局快捷键（Ctrl+Shift+F）唤起独立搜索浮层

**改动文件**:
- `electron/main/index.ts` — 注册 globalShortcut，创建 FloatingWindow
- `src/components/FloatingSearch.tsx` — 浮层组件（新建）
- `src/styles.css` — 浮层样式

**交互**:
- 任意界面按 Ctrl+Shift+F 唤起
- 独立无边框窗口，居中显示
- 搜索后回车打开主窗口并显示结果，Esc 关闭

---

## Task 7: F7 缩略图预览 ✅

**描述**: 搜索结果行 hover 显示文件缩略图

**改动文件**:
- `electron/main/ipc.ts` — IPC: get-thumbnail
- `src/components/FileList.tsx` — thumbnail 列
- `src/styles.css` — 缩略图样式

**技术方案**:
```typescript
// Windows: 使用 shell API 获取缩略图
import { nativeImage, nativeTheme } from 'electron'
const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 120, height: 120 })
```

---

## Task 8: F8 WPS 格式支持 ✅

**描述**: WPS 文件本质是 OLE2 复合文档，复用 antiword 或 node-oleg

**技术方案**: WPS 格式有三种：WPS（文字）、WPP（演示）、WPS（表格，类似 ET）
- 优先尝试 mammoth 解析（WPS 2019+ 基于 OOXML）
- 回退使用 oles.parse（WPS 老格式）

**改动文件**:
- `electron/main/scanner.ts` — SUPPORTED_EXTENSIONS + extractTextFromWps()

---

## 执行方式

使用 superpowers:subagent-driven-development，按 Task 顺序依次实施。
