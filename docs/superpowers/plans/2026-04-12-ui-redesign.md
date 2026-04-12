# DocSeeker UI 美化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面重构 DocSeeker 界面，采用 Linear/Clean 风格，含无边框窗口、左侧导航、浅深色主题切换、国际化

**Architecture:** Electron 无边框窗口 + React + CSS 变量主题系统 + i18next 国际化。整体布局：顶部自定义标题栏(40px) + 左侧220px固定导航 + 主内容区 + 底部32px状态栏。

**Tech Stack:** Electron (frame: false), React 18, CSS Variables (data-theme), i18next + react-i18next

---

## Phase 1: 基础框架（窗口 + CSS 变量）

### Task 1: Electron 无边框窗口配置

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: 修改 Electron 主进程，启用无边框窗口**

修改 `electron/main/index.ts` 中的 `createWindow` 函数，将 `frame: false` 和 `titleBarStyle: 'hidden'` 加入 BrowserWindow 配置：

```typescript
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,           // 新增：隐藏原生窗口框架
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // ... 其余代码保持不变
}
```

Run: `echo "Done - frame:false added"`
Expected: 无边框窗口生效，原生标题栏消失

- [ ] **Step 2: 暴露窗口控制 IPC 方法**

修改 `electron/preload/index.ts`，添加窗口控制方法：

```typescript
// 在 existingAPI 中添加
minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
closeWindow: () => ipcRenderer.invoke('window-close'),
isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
onWindowMaximized: (callback: () => void) => {
  ipcRenderer.on('window-maximized-changed', (_, isMaximized) => callback(isMaximized))
}
```

在 `electron/main/ipc.ts` 中添加处理函数：

```typescript
ipcMain.handle('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.handle('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.handle('window-close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
})
```

Run: `echo "Done - IPC window controls added"`
Expected: 预加载脚本暴露窗口控制 API

- [ ] **Step 3: Commit**

```bash
git add electron/main/index.ts electron/main/ipc.ts electron/preload/index.ts
git commit -m "feat(window): enable frameless window with IPC controls"
```

---

### Task 2: CSS 变量与主题系统

**Files:**
- Modify: `src/styles.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: 重写全局 CSS，定义浅色主题变量**

在 `src/styles.css` 顶部替换原有全局样式，添加 CSS 变量系统：

```css
/* === CSS 变量系统 === */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f7f7f8;
  --bg-tertiary: #fafafa;
  --border: #e8e8ec;
  --border-light: #e0e0e0;
  --text-primary: #111111;
  --text-secondary: #666666;
  --text-muted: #888888;
  --accent: #18181b;
  --accent-hover: #2d2d2d;
  --selected-bg: #f0f7ff;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

[data-theme="dark"] {
  --bg-primary: #111111;
  --bg-secondary: #181818;
  --bg-tertiary: #1a1a1a;
  --border: #2a2a2a;
  --border-light: #3a3a3a;
  --text-primary: #e0e0e0;
  --text-secondary: #9b9b9b;
  --text-muted: #6a6a6a;
  --accent: #3d6b3d;
  --accent-hover: #4a7c4a;
  --selected-bg: #1e2a1e;
}

/* === 全局重置 === */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
```

- [ ] **Step 2: 添加基础布局样式**

在 `styles.css` 末尾追加新布局样式（后续 Task 会补充完整）：

```css
/* === 新布局占位样式（后续 Task 补全）=== */
.title-bar {
  height: var(--titlebar-height);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-bar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 0 16px;
}

.title-bar-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.title-bar-btn {
  width: 40px;
  height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  border-left: 1px solid var(--border);
  transition: background-color 0.15s;
}

.title-bar-btn:hover {
  background-color: var(--border);
}

.title-bar-btn.close:hover {
  background-color: #e74c3c;
  color: #fff;
}

.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.status-bar {
  height: var(--statusbar-height);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(styles): add CSS variables theme system"
```

---

## Phase 2: 核心组件（标题栏 + 导航 + 状态栏）

### Task 3: 自定义标题栏组件

**Files:**
- Create: `src/components/TitleBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 TitleBar.tsx**

```tsx
import { useState, useEffect } from 'react'

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.electron.isMaximized().then(setIsMaximized)
    window.electron.onWindowMaximized((maximized) => {
      setIsMaximized(maximized)
    })
  }, [])

  const handleMinimize = () => window.electron.minimizeWindow()
  const handleMaximize = () => window.electron.maximizeWindow()
  const handleClose = () => window.electron.closeWindow()

  return (
    <div className="title-bar">
      <span className="title-bar-title">DocSeeker</span>
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={handleMinimize} title="最小化">
          ─
        </button>
        <button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'}>
          {isMaximized ? '❐' : '□'}
        </button>
        <button className="title-bar-btn close" onClick={handleClose} title="关闭">
          ✕
        </button>
      </div>
    </div>
  )
}

export default TitleBar
```

- [ ] **Step 2: 更新 preload 类型声明**

检查 `electron/preload/index.ts` 中的 `WindowAPI` 接口是否包含新增方法，如需更新则补充。

- [ ] **Step 3: Commit**

```bash
git add src/components/TitleBar.tsx
git commit -m "feat(ui): add custom TitleBar component"
```

---

### Task 4: 左侧导航栏组件

**Files:**
- Create: `src/components/SideNav.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 SideNav.tsx**

```tsx
import { PageTab } from '../types'

interface SideNavProps {
  activeTab: PageTab
  onTabChange: (tab: PageTab) => void
}

const navItems: { id: PageTab; label: string; icon: string; group: string }[] = [
  { id: 'search', label: '搜索文档', icon: '🔎', group: '导航' },
  { id: 'scan', label: '扫描管理', icon: '📁', group: '导航' },
  { id: 'config', label: '配置', icon: '⚙️', group: '导航' },
  { id: 'language', label: '语言与主题', icon: '🌐', group: '设置' },
  { id: 'guide', label: '使用说明', icon: '📖', group: '帮助' },
  { id: 'about', label: '开发者联系', icon: '✉️', group: '帮助' },
]

function SideNav({ activeTab, onTabChange }: SideNavProps): JSX.Element {
  let lastGroup = ''

  return (
    <nav className="side-nav">
      {navItems.map((item) => {
        const showGroupLabel = item.group !== lastGroup
        lastGroup = item.group
        return (
          <div key={item.id}>
            {showGroupLabel && (
              <div className="nav-group-label">{item.group}</div>
            )}
            <button
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

export default SideNav
```

- [ ] **Step 2: 添加 SideNav 样式到 styles.css**

```css
/* === 侧边导航栏 === */
.side-nav {
  width: var(--nav-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  padding: 12px 8px;
  flex-shrink: 0;
  overflow-y: auto;
}

.nav-group-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 10px 4px;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: var(--radius);
  text-align: left;
  transition: all 0.15s;
  margin-bottom: 2px;
}

.nav-item:hover {
  color: #333;
  background: rgba(0,0,0,0.04);
}

[data-theme="dark"] .nav-item:hover {
  color: #ccc;
  background: rgba(255,255,255,0.04);
}

.nav-item.active {
  color: var(--text-primary);
  background: var(--bg-primary);
  box-shadow: var(--shadow);
  font-weight: 500;
}

.nav-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.nav-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SideNav.tsx
git add src/styles.css
git commit -m "feat(ui): add SideNav component with navigation groups"
```

---

### Task 5: 状态栏组件

**Files:**
- Create: `src/components/StatusBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 StatusBar.tsx**

```tsx
import { useEffect, useState } from 'react'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)

  useEffect(() => {
    window.electron.getStats?.().then((stats: { fileCount: number }) => {
      setFileCount(stats.fileCount)
    }).catch(() => {})
  }, [])

  return (
    <div className="status-bar">
      <span>DocSeeker v1.0.0</span>
      <span>
        {fileCount !== null ? `已索引 ${fileCount.toLocaleString()} 个文件` : '加载中...'}
      </span>
    </div>
  )
}

export default StatusBar
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat(ui): add StatusBar component"
```

---

### Task 6: 重构 App.tsx 主布局

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 重写 App.tsx，使用新布局**

```tsx
import { useState } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import TitleBar from './components/TitleBar'
import SideNav from './components/SideNav'
import StatusBar from './components/StatusBar'
import ConfigPage from './pages/ConfigPage'
import ScanPage from './pages/ScanPage'
import SearchPage from './pages/SearchPage'
import LanguagePage from './pages/LanguagePage'
import GuidePage from './pages/GuidePage'
import AboutPage from './pages/AboutPage'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PageTab>('search')

  const renderPage = (): JSX.Element => {
    switch (activeTab) {
      case 'config':
        return <ConfigPage />
      case 'scan':
        return <ScanPage />
      case 'search':
        return <SearchPage />
      case 'language':
        return <LanguagePage />
      case 'guide':
        return <GuidePage />
      case 'about':
        return <AboutPage />
      default:
        return <SearchPage />
    }
  }

  return (
    <AppProvider>
      <div className="app">
        <TitleBar />
        <div className="main-layout">
          <SideNav activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="main-content">
            {renderPage()}
          </main>
        </div>
        <StatusBar />
      </div>
    </AppProvider>
  )
}

export default App
```

- [ ] **Step 2: 更新 types.ts 扩展 PageTab 类型**

修改 `src/types.ts` 中的 `PageTab`：

```typescript
export type PageTab = 'config' | 'scan' | 'search' | 'language' | 'guide' | 'about'
```

- [ ] **Step 3: 添加主内容区基础样式**

```css
/* === 主内容区 === */
.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/types.ts src/styles.css
git commit -m "refactor(ui): restructure App.tsx with new layout (TitleBar + SideNav + Content + StatusBar)"
```

---

## Phase 3: 搜索页改造

### Task 7: 搜索框样式升级

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 添加新的搜索框样式**

```css
/* === 搜索框 === */
.search-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-box-wrapper {
  display: flex;
  gap: 8px;
  max-width: 600px;
}

.search-box-wrapper input {
  flex: 1;
  height: 40px;
  padding: 0 14px 0 40px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='%23888' viewBox='0 0 16 16'%3E%3Cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 12px center;
}

.search-box-wrapper input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(24, 24, 27, 0.08);
}

.search-btn {
  height: 40px;
  padding: 0 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.search-btn:hover {
  background: var(--accent-hover);
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 2: 更新 SearchPage.tsx 使用新样式类**

修改 `src/pages/SearchPage.tsx` 中的搜索框结构，将 `className="search-box"` 改为 `className="search-box-wrapper"`。

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/pages/SearchPage.tsx
git commit -m "feat(search): style search box with new Linear-style design"
```

---

### Task 8: 文件列表重构（去除 snippet）

**Files:**
- Modify: `src/components/FileList.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 重写 FileList.tsx，移除 snippet 显示**

修改 `src/components/FileList.tsx`，删除 snippet 相关代码（`useEffect` 获取 snippet、`snippets` 状态、渲染 `<div className="search-snippet">` 的部分），只保留文件基本信息列。

同时更新样式类名：
- `.file-list-container` → 保持不变
- 表格 `.file-list` → 使用新样式
- 新增 `.file-row` 替代 `<tr>`
- 新增 `.file-row.selected` 用于选中状态

- [ ] **Step 2: 添加文件列表新样式**

```css
/* === 文件列表 === */
.file-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
}

.file-table {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-primary);
}

.file-table-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px 120px;
  background: var(--bg-secondary);
  padding: 8px 12px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}

.file-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px 120px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  align-items: center;
  cursor: pointer;
  transition: background-color 0.1s;
  font-size: 13px;
  color: var(--text-primary);
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: var(--bg-secondary);
}

.file-row.selected {
  background: var(--selected-bg);
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.file-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.file-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
  gap: 8px;
  font-size: 13px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FileList.tsx src/styles.css
git commit -m "feat(search): refactor FileList without snippets, new table style"
```

---

### Task 9: 文件预览区样式升级

**Files:**
- Modify: `src/components/FileDetail.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 重构 FileDetail.tsx 使用新卡片样式**

修改 `src/components/FileDetail.tsx`，使用新的布局结构：

```tsx
function FileDetail({ file, formatSize }: FileDetailProps): JSX.Element {
  const handleShowInFolder = () => window.electron.showInFolder(file.path)
  const handleOpenFile = () => window.electron.openFile(file.path)

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div className="file-detail">
      <div className="file-detail-name">
        <span className="detail-icon">📄</span>
        <span className="detail-filename">{file.name}</span>
      </div>
      <div className="file-detail-path">{file.path}</div>

      <div className="detail-card">
        <div className="detail-card-title">文件信息</div>
        <div className="detail-grid">
          <div className="detail-grid-item">
            <div className="detail-grid-label">大小</div>
            <div className="detail-grid-value">{formatSize(file.size)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">类型</div>
            <div className="detail-grid-value">{file.file_type || '-'}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">修改</div>
            <div className="detail-grid-value">{formatDate(file.updated_at)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">MD5</div>
            <div className="detail-grid-value hash">{file.hash ? `${file.hash.slice(0,8)}...${file.hash.slice(-4)}` : '-'}</div>
          </div>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-title">内容预览</div>
        <div className="detail-content-preview">
          {file.content ? file.content.slice(0, 500) + (file.content.length > 500 ? '...' : '') : '无内容'}
        </div>
      </div>

      <div className="detail-actions">
        <button className="detail-btn-primary" onClick={handleShowInFolder}>
          在文件夹中显示
        </button>
        <button className="detail-btn-secondary" onClick={handleOpenFile}>
          打开文件
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 添加预览区样式**

```css
/* === 文件预览区 === */
.file-detail-area {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-tertiary);
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-detail-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.file-detail-path {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

.detail-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}

.detail-card-title {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.detail-grid-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.detail-grid-value {
  font-size: 12px;
  color: var(--text-primary);
}

.detail-grid-value.hash {
  font-family: monospace;
  font-size: 11px;
}

.detail-content-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-btn-primary {
  width: 100%;
  height: 36px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.detail-btn-primary:hover {
  background: var(--accent-hover);
}

.detail-btn-secondary {
  width: 100%;
  height: 36px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.detail-btn-secondary:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FileDetail.tsx src/styles.css
git commit -m "feat(search): redesign FileDetail with card-based layout"
```

---

### Task 10: 搜索内容区布局整合

**Files:**
- Modify: `src/pages/SearchPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 更新 SearchPage.tsx 布局结构**

修改 `src/pages/SearchPage.tsx`，使用新的 `.search-header` + `.search-content` 布局，预览区独立显示。

```tsx
<div className="search-page">
  <div className="search-header">
    <div className="search-box-wrapper">
      <input ... />
      <button className="search-btn" ...>
        {isSearching ? '搜索中...' : '搜索'}
      </button>
    </div>
  </div>

  <div className="search-content">
    <div className="file-list-wrapper">
      <FileList ... />
    </div>
    {selectedFile && (
      <div className="file-detail-area">
        <FileDetail file={selectedFile} formatSize={formatSize} />
      </div>
    )}
  </div>

  <div className="search-footer-bar">
    {hasSearched ? `找到 ${files.length} 个文件` : '请输入关键词搜索'}
  </div>
</div>
```

- [ ] **Step 2: 添加搜索页整体布局样式**

```css
/* === 搜索页 === */
.search-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.search-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.search-footer-bar {
  padding: 8px 20px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SearchPage.tsx src/styles.css
git commit -m "feat(search): integrate SearchPage with new layout structure"
```

---

## Phase 4: 新增页面

### Task 11: 语言与主题设置页

**Files:**
- Create: `src/pages/LanguagePage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 创建 LanguagePage.tsx**

```tsx
import { useState, useEffect } from 'react'

function LanguagePage(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [language, setLanguage] = useState('zh-CN')

  useEffect(() => {
    // 从 localStorage 读取用户偏好
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const savedLang = localStorage.getItem('language') as string | null
    if (savedTheme) setTheme(savedTheme)
    if (savedLang) setLanguage(savedLang)
    // 应用保存的主题
    document.documentElement.setAttribute('data-theme', savedTheme || 'light')
  }, [])

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    localStorage.setItem('language', newLang)
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">语言与主题设置</h2>

      <div className="settings-section">
        <div className="settings-section-title">主题</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">界面主题</div>
              <div className="settings-row-desc">选择浅色或深色主题</div>
            </div>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                浅色
              </button>
              <button
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                深色
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">语言</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">界面语言</div>
              <div className="settings-row-desc">选择应用界面显示的语言</div>
            </div>
            <select
              className="settings-select"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LanguagePage
```

- [ ] **Step 2: 添加语言页样式**

```css
/* === 设置页通用样式 === */
.settings-page {
  padding: 24px 24px;
  overflow-y: auto;
  height: 100%;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 24px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section-title {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  padding: 0 4px;
}

.settings-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row-info {
  flex: 1;
}

.settings-row-label {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.settings-row-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* 主题切换按钮 */
.theme-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.theme-btn {
  padding: 6px 14px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.theme-btn:first-child {
  border-right: 1px solid var(--border);
}

.theme-btn.active {
  background: var(--accent);
  color: #fff;
}

.theme-btn:hover:not(.active) {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* 语言选择下拉 */
.settings-select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/LanguagePage.tsx src/styles.css
git commit -m "feat(settings): add language and theme settings page"
```

---

### Task 12: 使用说明页

**Files:**
- Create: `src/pages/GuidePage.tsx`

- [ ] **Step 1: 创建 GuidePage.tsx**

```tsx
function GuidePage(): JSX.Element {
  return (
    <div className="settings-page">
      <h2 className="page-title">使用说明</h2>

      <div className="settings-section">
        <div className="settings-section-title">功能介绍</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>DocSeeker 是一款高效的本地文档搜索工具，支持全文搜索和定时扫描功能。</p>
            <h3>主要功能</h3>
            <ul>
              <li><strong>全文搜索</strong>：支持搜索文件名和文件内容（docx、xlsx、pdf、txt 等格式）</li>
              <li><strong>定时扫描</strong>：可配置定时任务，自动增量扫描指定文件夹</li>
              <li><strong>重复文件检测</strong>：通过 MD5 哈希快速找出重复文件</li>
              <li><strong>多文件夹管理</strong>：支持同时管理多个扫描目录</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">使用步骤</div>
        <div className="settings-card">
          <div className="guide-content">
            <ol>
              <li>在「配置」中添加要扫描的文件夹</li>
              <li>在「扫描」页面执行首次全量扫描</li>
              <li>根据需要开启定时扫描，自动保持索引更新</li>
              <li>在「搜索」页面输入关键词查找文档</li>
              <li>点击搜索结果可在右侧预览文件，点击「在文件夹中显示」定位文件</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">常见问题</div>
        <div className="settings-card">
          <div className="guide-content">
            <details className="faq-item">
              <summary>为什么搜索不到新添加的文件？</summary>
              <p>请在「扫描」页面执行扫描操作，建立文件索引后即可搜索。</p>
            </details>
            <details className="faq-item">
              <summary>定时扫描不生效？</summary>
              <p>请确保应用保持运行状态，定时扫描功能需要在应用启动时才能触发。</p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
```

- [ ] **Step 2: 添加使用说明页样式**

```css
/* === 使用说明页 === */
.guide-content {
  padding: 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.guide-content h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 12px 0 6px;
}

.guide-content ul, .guide-content ol {
  padding-left: 20px;
  margin: 6px 0;
}

.guide-content li {
  margin-bottom: 4px;
}

.guide-content p {
  margin-bottom: 8px;
}

.faq-item {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

.faq-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.faq-item summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 13px;
}

.faq-item p {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/GuidePage.tsx src/styles.css
git commit -m "feat(pages): add guide/help page"
```

---

### Task 13: 开发者联系页

**Files:**
- Create: `src/pages/AboutPage.tsx`

- [ ] **Step 1: 创建 AboutPage.tsx**

```tsx
function AboutPage(): JSX.Element {
  return (
    <div className="settings-page">
      <h2 className="page-title">关于 DocSeeker</h2>

      <div className="settings-section">
        <div className="settings-card">
          <div className="about-content">
            <div className="about-logo">🔍</div>
            <div className="about-name">DocSeeker</div>
            <div className="about-version">版本 1.0.0</div>
            <div className="about-desc">
              个人长期积累文档的搜索工具，支持全文搜索、定时扫描、重复文件检测等功能。
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">联系方式</div>
        <div className="settings-card">
          <div className="about-contact">
            <div className="contact-item">
              <span className="contact-icon">✉️</span>
              <div>
                <div className="contact-label">电子邮件</div>
                <div className="contact-value">docseeker@example.com</div>
              </div>
            </div>
            <div className="contact-item">
              <span className="contact-icon">🐙</span>
              <div>
                <div className="contact-label">GitHub</div>
                <div className="contact-value">github.com/docseeker/docseeker</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">许可证</div>
        <div className="settings-card">
          <div className="about-license">
            本项目基于 MIT 许可证开源。
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
```

- [ ] **Step 2: 添加关于页样式**

```css
/* === 关于页 === */
.about-content {
  padding: 32px 16px;
  text-align: center;
}

.about-logo {
  font-size: 48px;
  margin-bottom: 12px;
}

.about-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.about-version {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.about-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 400px;
  margin: 0 auto;
}

.about-contact {
  padding: 8px 0;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.contact-item:last-child {
  border-bottom: none;
}

.contact-icon {
  font-size: 20px;
}

.contact-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.contact-value {
  font-size: 13px;
  color: var(--text-primary);
}

.about-license {
  padding: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/AboutPage.tsx src/styles.css
git commit -m "feat(pages): add about/developer contact page"
```

---

## Phase 5: 适配其他页面

### Task 14: 配置页与扫描页适配新布局

**Files:**
- Modify: `src/pages/ConfigPage.tsx`
- Modify: `src/pages/ScanPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 更新 ConfigPage 包装样式**

在 `ConfigPage` 最外层 div 添加 `className="settings-page"`，将现有内容包裹在 `<h2 className="page-title">` 之后。

- [ ] **Step 2: 更新 ScanPage 包装样式**

同样为 `ScanPage` 添加 `.settings-page` 包装。

- [ ] **Step 3: 添加扫描页特定样式**

```css
/* === 扫描页增强 === */
.scan-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.scan-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/ConfigPage.tsx src/pages/ScanPage.tsx src/styles.css
git commit -m "refactor(pages): adapt ConfigPage and ScanPage to new layout"
```

---

## Phase 6: 清理与优化

### Task 15: 清理旧样式，添加过渡动画

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 删除不再使用的旧 CSS 类**

删除 `styles.css` 中以下不再使用的旧类（在全局重置后新布局建立后，以下旧类已无引用）：
- `.header`、`.header-actions`
- `.tab-nav`、`.tab-btn`
- `.main-content`（将被新样式替代）
- `.footer`
- `.search-page`（旧的，替换为新结构）
- `.search-header`（旧的搜索框样式）
- `.search-content`（旧的）
- `.file-list-area`、`.file-detail-area`（旧的）
- `.search-footer`
- `.file-detail`（旧的）
- `.file-detail-header`、`.file-detail-content`、`.detail-row`、`.content-row`
- `.file-actions`、`.path`、`.hash`、`.content-preview`
- `.btn`、`.btn-primary`、`.btn-small`
- `.toolbar`、`.directory-picker`
- `.empty-state`
- `.progress-bar`、`.progress-info`、`.progress-track`

（通过搜索确认无引用后再删除，如果项目中有其他地方引用则保留）

- [ ] **Step 2: 添加过渡动画**

```css
/* === 全局过渡 === */
button, input, select {
  transition: all 0.15s ease;
}

/* === 深色主题下滚动条 === */
[data-theme="dark"] ::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

[data-theme="dark"] ::-webkit-scrollbar-track {
  background: transparent;
}

[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 3px;
}

/* === 浅色主题滚动条 === */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "chore(styles): remove legacy CSS and add scrollbar + transitions"
```

---

## Task 16: 收尾自检

**Files:**
- Review: `src/styles.css`
- Review: `src/App.tsx`
- Review: `electron/main/index.ts`

- [ ] **Step 1: 检查 `electron/main/index.ts` 确保 `frame: false` 已生效**

确认 BrowserWindow 配置中存在 `frame: false`。

- [ ] **Step 2: 检查 styles.css 确保无破坏性冲突**

确认新的 `.main-content` 样式与现有页面组件兼容。

- [ ] **Step 3: 运行开发服务器验证**

```bash
npm run dev
```

Expected: 无边框窗口正常打开，左侧导航可见，搜索页正常显示，主题切换工作正常。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification and polish"
```

---

## 文件修改总览

| 文件 | 操作 |
|------|------|
| `electron/main/index.ts` | 修改：添加 frame: false |
| `electron/main/ipc.ts` | 修改：添加窗口控制 IPC handlers |
| `electron/preload/index.ts` | 修改：暴露窗口控制 API |
| `src/main.tsx` | 修改（如有需要） |
| `src/styles.css` | 重写：CSS 变量 + 新布局样式 |
| `src/types.ts` | 修改：扩展 PageTab |
| `src/App.tsx` | 重写：主布局 |
| `src/components/TitleBar.tsx` | 新增 |
| `src/components/SideNav.tsx` | 新增 |
| `src/components/StatusBar.tsx` | 新增 |
| `src/components/FileList.tsx` | 修改：去除 snippet |
| `src/components/FileDetail.tsx` | 重写：卡片布局 |
| `src/pages/SearchPage.tsx` | 修改：布局整合 |
| `src/pages/ConfigPage.tsx` | 修改：适配新布局 |
| `src/pages/ScanPage.tsx` | 修改：适配新布局 |
| `src/pages/LanguagePage.tsx` | 新增 |
| `src/pages/GuidePage.tsx` | 新增 |
| `src/pages/AboutPage.tsx` | 新增 |
