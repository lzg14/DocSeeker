# Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DocSeeker 添加自动升级检测功能：每月 5 号和 15 号检查 GitHub Releases，发现新版本时通知用户并支持一键升级。

**Architecture:** 在 Electron 主进程中集成 `electron-updater`，通过 IPC 与渲染进程通信，在 UI 中显示升级状态。支持手动检查、下载、安装完整流程。

**Tech Stack:** `electron-updater`, Electron IPC, React, electron-builder publish 配置

---

## File Structure

```
electron/main/
  ├─ updater.ts          # 升级检测核心逻辑（新建）
  └─ index.ts            # 集成 startUpdater/stopUpdater（修改）

electron/preload/index.ts
  └─ 添加 update-status 监听、manualCheck/downloadUpdate IPC（修改）

src/components/
  └─ UpdateNotification.tsx  # 升级提示 UI 组件（新建）

src/App.tsx
  └─ 挂载 UpdateNotification（修改）

package.json
  └─ 添加 publish 配置（修改）

electron-builder.yml 或 package.json build 段
  └─ 配置 GitHub publisher（修改）
```

---

## Task 1: 安装 electron-updater

- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run: `npm install electron-updater`
Expected: `added 36 packages`（含 electron-updater）

- [ ] **Step 2: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-updater for auto-update"
```

---

## Task 2: 创建 updater.ts 核心模块

- Create: `electron/main/updater.ts`

- [ ] **Step 1: 创建文件**

```typescript
// electron/main/updater.ts
import { autoUpdater, UpdateCheckResult } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import log from 'electron-log/main'

// Check dates: 5th and 15th of each month
const CHECK_DAYS = [5, 15]

let checkInterval: NodeJS.Timeout | null = null
let mainWindowRef: BrowserWindow | null = null

function shouldCheckToday(): boolean {
  const day = new Date().getDate()
  return CHECK_DAYS.includes(day)
}

function notifyRenderer(status: string, info?: { version?: string; error?: string }): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return
  mainWindowRef.webContents.send('update-status', { status, ...info })
}

async function checkForUpdates(silent = true): Promise<string | null> {
  try {
    log.info('Checking for updates...')
    const result: UpdateCheckResult = await autoUpdater.checkForUpdates()
    if (result?.updateInfo?.version) {
      log.info(`Update available: v${result.updateInfo.version}`)
      return result.updateInfo.version
    }
    if (!silent) {
      log.info('No updates available')
      notifyRenderer('up-to-date')
    }
    return null
  } catch (error) {
    log.error('Update check failed:', error)
    if (!silent) {
      notifyRenderer('error', { error: (error as Error).message })
    }
    return null
  }
}

async function scheduledCheck(): Promise<void> {
  if (!shouldCheckToday()) return
  await checkForUpdates(false)
}

export function startUpdater(win: BrowserWindow): void {
  mainWindowRef = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('autoUpdater: checking-for-update')
    notifyRenderer('checking')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`autoUpdater: update-available v${info.version}`)
    notifyRenderer('available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('autoUpdater: update-not-available')
    notifyRenderer('up-to-date')
  })

  autoUpdater.on('download-progress', () => {
    notifyRenderer('downloading')
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`autoUpdater: update-downloaded v${info.version}`)
    notifyRenderer('downloaded', { version: info.version })
    dialog.showMessageBox(mainWindowRef!, {
      type: 'info',
      title: '发现新版本',
      message: `DocSeeker v${info.version} 已下载完成，是否现在重启安装？`,
      buttons: ['立即重启', '稍后'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('error', (error) => {
    log.error('autoUpdater error:', error)
    notifyRenderer('error', { error: error.message })
  })

  // Initial check on startup (if today is a check day)
  if (shouldCheckToday()) {
    setTimeout(() => checkForUpdates(false), 5000)
  }

  // Check every hour; the date gate is inside scheduledCheck()
  checkInterval = setInterval(scheduledCheck, 60 * 60 * 1000)
  log.info('Update checker started (checks on the 5th and 15th of each month)')
}

export function stopUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  log.info('Update checker stopped')
}

export async function handleManualCheck(): Promise<string | null> {
  return checkForUpdates(false)
}

export async function handleDownloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    log.error('Failed to download update:', error)
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add electron/main/updater.ts
git commit -m "feat(updater): add auto-update core module with monthly check"
```

---

## Task 3: 集成 updater 到主进程

- Modify: `electron/main/index.ts`

- [ ] **Step 1: 添加 import**

在文件顶部 import 区添加：

```typescript
import { startUpdater, stopUpdater, handleManualCheck, handleDownloadUpdate } from './updater'
```

- [ ] **Step 2: 在 app.whenReady() 中初始化**

在 `startScheduler()` 之后、`createWindow()` 之前添加：

```typescript
// Auto updater (checks on 5th and 15th each month)
startUpdater(mainWindow)
```

- [ ] **Step 3: 在 app.beforeQuit() 中停止**

在 `stopScheduler()` 之后添加：

```typescript
stopUpdater()
```

- [ ] **Step 4: 注册手动检查和下载 IPC**

在现有的 `ipcMain.handle('set-global-hotkey', ...)` 之后添加：

```typescript
ipcMain.handle('update-check', async () => {
  return handleManualCheck()
})

ipcMain.handle('update-download', async () => {
  await handleDownloadUpdate()
})
```

- [ ] **Step 5: 提交**

```bash
git add electron/main/index.ts
git commit -m "feat(main): integrate auto-updater on startup"
```

---

## Task 4: 扩展 preload IPC 接口

- Modify: `electron/preload/index.ts`

- [ ] **Step 1: 在 ElectronAPI 接口末尾添加**

```typescript
// Auto update
checkForUpdate: () => Promise<string | null>
downloadUpdate: () => Promise<void>
onUpdateStatus: (callback: (info: { status: string; version?: string; error?: string }) => void) => () => void
```

- [ ] **Step 2: 在 electronAPI 对象末尾添加实现**

```typescript
checkForUpdate: () => ipcRenderer.invoke('update-check'),

downloadUpdate: () => ipcRenderer.invoke('update-download'),

onUpdateStatus: (callback) => {
  const handler = (_: Electron.IpcRendererEvent, info: { status: string; version?: string; error?: string }) => {
    callback(info)
  }
  ipcRenderer.on('update-status', handler)
  return () => {
    ipcRenderer.removeListener('update-status', handler)
  }
},
```

- [ ] **Step 3: 提交**

```bash
git add electron/preload/index.ts
git commit -m "feat(preload): expose update IPC to renderer"
```

---

## Task 5: 创建升级提示 UI 组件

- Create: `src/components/UpdateNotification.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import { useEffect, useState } from 'react'

interface UpdateInfo {
  status: string
  version?: string
  error?: string
}

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const cleanup = window.electron.onUpdateStatus((info) => {
      setUpdateInfo(info)
      setVisible(true)
      // Auto-hide for non-actionable statuses
      if (info.status === 'checking' || info.status === 'up-to-date') {
        setTimeout(() => setVisible(false), 3000)
      }
    })
    return cleanup
  }, [])

  if (!visible || !updateInfo) return null

  const handleDownload = () => {
    window.electron.downloadUpdate()
  }

  const handleDismiss = () => {
    setVisible(false)
  }

  const statusLabels: Record<string, string> = {
    checking: '正在检查更新...',
    available: `发现新版本 v${updateInfo.version}`,
    'up-to-date': '已是最新版本',
    downloading: '正在下载更新...',
    downloaded: `更新 v${updateInfo.version} 已下载`,
    error: `检查失败: ${updateInfo.error}`,
  }

  const label = statusLabels[updateInfo.status] || updateInfo.status

  const isError = updateInfo.status === 'error'
  const isAvailable = updateInfo.status === 'available'
  const isDownloading = updateInfo.status === 'downloading'
  const isDownloaded = updateInfo.status === 'downloaded'

  return (
    <div className="update-notification" data-type={isError ? 'error' : 'info'}>
      <span className="update-notification-label">{label}</span>
      <div className="update-notification-actions">
        {isAvailable && (
          <button className="btn-primary" onClick={handleDownload}>
            下载
          </button>
        )}
        {isDownloaded && (
          <button className="btn-primary" onClick={() => window.electron.downloadUpdate()}>
            立即重启安装
          </button>
        )}
        {isDownloading && <span className="update-notification-spinner" />}
        <button className="btn-ghost" onClick={handleDismiss}>
          关闭
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/UpdateNotification.tsx
git commit -m "feat(ui): add UpdateNotification component"
```

---

## Task 6: 集成 UpdateNotification 到 App

- Modify: `src/App.tsx`

- [ ] **Step 1: 读取文件后找到根组件结构**

在 `<App>` 返回的 JSX 中，在主内容区域下方添加组件：

```tsx
import UpdateNotification from './components/UpdateNotification'
```

在组件 return 的 JSX 中（紧跟在主路由 `<Routes>` 段之后）添加：

```tsx
<UpdateNotification />
```

- [ ] **Step 2: 提交**

```bash
git add src/App.tsx
git commit -m "feat(app): integrate UpdateNotification component"
```

---

## Task 7: 添加升级提示 UI 样式

- Modify: `src/styles.css`

- [ ] **Step 1: 添加样式**

```css
/* Update notification */
.update-notification {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  font-size: 14px;
  animation: slide-in-up 0.2s ease-out;
}

.update-notification[data-type='error'] {
  border-color: var(--color-error);
}

.update-notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.update-notification-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-default);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes slide-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/styles.css
git commit -m "style: add UpdateNotification styles"
```

---

## Task 8: 配置 electron-builder publish

- Modify: `package.json`

- [ ] **Step 1: 在 build 配置中添加 publish**

在现有 `build` 配置的末尾添加：

```json
"publish": {
  "provider": "github",
  "owner": "lzg14",
  "repo": "DocSeeker"
}
```

- [ ] **Step 2: 提交**

```bash
git add package.json
git commit -m "build: configure GitHub publisher for auto-update"
```

---

## Task 9: 验证完整流程

- [ ] **Step 1: 构建 Windows 版本**

Run: `npm run build:win`
Expected: 构建成功，生成 `dist/` 下的安装包

- [ ] **Step 2: 确认 electron-updater 集成无误**

检查 `out/` 目录下生成的 `updater.js` 是否存在，确认 TypeScript 编译正确

- [ ] **Step 3: 提交所有更改**

```bash
git status
git add -A
git commit -m "feat: add auto-update system with monthly check on 5th and 15th"
```