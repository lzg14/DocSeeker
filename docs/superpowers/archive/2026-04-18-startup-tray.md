# 窗口行为优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三项窗口行为优化 + 设置页面整合 + 跟随系统主题：开机自启动 + 静默启动（启动时隐藏主窗口）+ 关闭时最小化到托盘 + 所有开关可由用户在设置页面配置，使 DocSeeker 成为合格的后台常驻应用。

**Architecture:**
- **设置页面**：「外观」分区含主题跟随系统 + 窗口行为分区含三项开关
- 开机自启：`app.setLoginItemSettings()`（Windows），无注册表操作
- 静默启动：命令行参数 `--startup` 检测，控制主窗口初始 `show` 状态
- 关闭最小化托盘：拦截 `close` 事件，改为 `hide()` 窗口
- 跟随系统：Electron `nativeTheme` API 监听系统主题变更

**Tech Stack:** Electron app API、Electron `nativeTheme` API、React state、React Context

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `electron/main/index.ts` | 开机自启设置、命令行参数检测、静默启动 |
| 修改 | `electron/main/ipc.ts` | get/set 开机自启 IPC、minimize-to-tray IPC |
| 修改 | `electron/preload/index.ts` | 暴露 isSilentStart、autoLaunch、minimizeToTray |
| 修改 | `src/context/AppContext.tsx` | 全局状态：是否为静默启动 |
| 修改 | `src/context/LanguageContext.tsx` | 跟随系统主题实现 |
| 修改 | `src/App.tsx` | 静默启动时隐藏 TitleBar/StatusBar |
| 创建 | `src/pages/SettingsPage.tsx` | 设置页面（外观 + 窗口行为两个 Tab） |
| 修改 | `src/components/TitleBar.tsx` | 关闭按钮根据 minimizeToTray 开关决定行为 |
| 修改 | `src/components/SideNav.tsx` | 侧边栏增加"设置"导航项 |
| 修改 | `src/styles.css` | 设置页面样式 |
| 修改 | `src/App.tsx` | 路由增加 /settings |

---

## Task 0: 设置页面框架（外观 + 窗口行为）

> 后续所有设置 UI 都放在此页面。必须先完成此 Task，再做其他 Task 的 UI 部分。

**Files:**
- Create: `src/pages/SettingsPage.tsx`
- Modify: `src/App.tsx`（路由）
- Modify: `src/components/SideNav.tsx`（增加设置入口）

- [ ] **Step 1: 在 App.tsx 中增加 /settings 路由**

在现有路由中添加：
```tsx
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 2: 在 SideNav.tsx 中增加设置菜单项**

在现有菜单项中添加：
```tsx
<NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
  ⚙️ {t('nav.settings')}
</NavLink>
```
在 `LanguageContext.tsx` 中添加翻译：`nav.settings: '设置'`

- [ ] **Step 3: 创建 SettingsPage.tsx 基础结构**

```tsx
// src/pages/SettingsPage.tsx
import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

type Tab = 'appearance' | 'window'

function SettingsPage(): JSX.Element {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('appearance')

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>{t('settings.title')}</h2>
      </div>

      <div className="settings-tabs">
        <button
          className={tab === 'appearance' ? 'active' : ''}
          onClick={() => setTab('appearance')}
        >
          {t('settings.tab.appearance')}
        </button>
        <button
          className={tab === 'window' ? 'active' : ''}
          onClick={() => setTab('window')}
        >
          {t('settings.tab.window')}
        </button>
      </div>

      <div className="settings-content">
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'window' && <WindowSettings />}
      </div>
    </div>
  )
}

// 占位组件，后续各 Task 填充
function AppearanceSettings() { return <div>外观设置（Task 6 实现）</div> }
function WindowSettings() { return <div>窗口设置（Task 2/4 实现）</div> }

export default SettingsPage
```

- [ ] **Step 4: 添加样式到 styles.css**

```css
/* SettingsPage */
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  overflow-y: auto;
}
.settings-header h2 {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
}
.settings-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
}
.settings-tabs button {
  padding: 8px 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.settings-tabs button.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}
```

- [ ] **Step 5: 提交**

```bash
git add src/pages/SettingsPage.tsx src/App.tsx src/components/SideNav.tsx src/styles.css
git commit -m "feat(settings): add SettingsPage with appearance and window behavior tabs"
```

---

## Task 1: 开机自启 API 封装

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 在 index.ts 中添加开机自启的读取/设置函数**

在 `index.ts` 顶部 `registerGlobalShortcut` 函数附近添加：

```typescript
import { app } from 'electron'

function isAutoLaunchEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,  // macOS 上隐藏窗口
    path: process.execPath,
  })
  log.info(`[AutoLaunch] ${enabled ? 'Enabled' : 'Disabled'}`)
}
```

> 注意：`setLoginItemSettings` 在 Windows 上需要打包后（`app.isPackaged = true`）才生效，开发模式下会被 Electron 忽略，但不会报错。

- [ ] **Step 2: 提交**

```bash
git add electron/main/index.ts
git commit -m "feat(startup): add auto-launch enable/disable via app.setLoginItemSettings"
```

---

## Task 2: IPC 暴露开机自启的读取与设置

**Files:**
- Modify: `electron/main/ipc.ts`

- [ ] **Step 1: 注册两个 IPC handler**

找到现有 handler 区域添加：

```typescript
// 获取开机自启状态
ipcMain.handle('get-auto-launch', async (): Promise<boolean> => {
  return isAutoLaunchEnabled()
})

// 设置开机自启
ipcMain.handle('set-auto-launch', async (_, enabled: boolean): Promise<void> => {
  setAutoLaunch(enabled)
})
```

- [ ] **Step 2: 提交**

```bash
git add electron/main/ipc.ts
git commit -m "feat(startup): expose auto-launch IPC handlers"
```

---

## Task 3: 静默启动（启动时不显示主窗口）

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 index.ts 中检测 --startup 参数并控制主窗口显示**

找到 `createWindow` 函数，在调用 `mainWindow.show()` 之前添加：

```typescript
// 检测是否为静默启动（通过命令行参数）
const isSilentStart = process.argv.includes('--startup')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // ... existing options ...
    show: !isSilentStart,  // 静默启动时隐藏窗口
  })

  // 非静默启动时窗口就绪后显示（确保不会闪屏）
  if (!isSilentStart) {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })
  }
}
```

- [ ] **Step 2: 在 preload 中暴露静默启动状态**

在 `electron/preload/index.ts` 的 `ElectronAPI` 接口中添加：

```typescript
isSilentStart: () => boolean
```

在 `electronAPI` 对象中添加：

```typescript
isSilentStart: () => process.argv.includes('--startup'),
```

- [ ] **Step 3: 在 AppContext 中添加静默启动状态**

```tsx
// src/context/AppContext.tsx
interface AppContextValue {
  // ... existing fields ...
  isSilentStart: boolean
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isSilentStart, setIsSilentStart] = useState(false)

  useEffect(() => {
    setIsSilentStart(window.electron.isSilentStart())
  }, [])
  // ...
}
```

- [ ] **Step 4: 在 App.tsx 中实现静默启动逻辑**

```tsx
// src/App.tsx
const { isSilentStart } = useAppContext()

// 静默启动时：跳转到搜索页（后台运行），不显示主窗口
// 非静默启动时：正常显示
return (
  <Router>
    <AppProvider>
      <LanguageProvider>
        {!isSilentStart && <TitleBar />}
        <div className="main-content">
          <Routes>
            <Route path="/" element={isSilentStart ? <Navigate to="/search" /> : <Navigate to="/search" />} />
            {/* other routes */}
          </Routes>
        </div>
        {!isSilentStart && <StatusBar />}
      </LanguageProvider>
    </AppProvider>
  </Router>
)
```

> 注：静默启动时可以默认打开搜索页面并执行上一次的搜索关键词，通过 `hotCache` 恢复上一次的搜索结果。

- [ ] **Step 5: 提交**

```bash
git add electron/main/index.ts electron/preload/index.ts src/context/AppContext.tsx src/App.tsx
git commit -m "feat(startup): add silent start mode - start without showing main window"
```

---

## Task 4: 关闭时最小化到托盘（可配置）

**Files:**
- Modify: `src/components/TitleBar.tsx`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/SettingsPage.tsx`（替换 LanguagePage）

- [ ] **Step 1: 在 AppContext 中增加最小化到托盘的开关状态**

```tsx
// src/context/AppContext.tsx
interface AppContextValue {
  // ... existing fields ...
  minimizeToTray: boolean
  setMinimizeToTray: (v: boolean) => void
}

// 在 AppProvider 中：
const [minimizeToTray, setMinimizeToTray] = useState(
  () => localStorage.getItem('minimizeToTray') === 'true'
)
const handleSetMinimizeToTray = (v: boolean) => {
  setMinimizeToTray(v)
  localStorage.setItem('minimizeToTray', String(v))
}
```

- [ ] **Step 2: 修改 TitleBar.tsx 的关闭按钮行为**

找到 `handleClose` 函数（当前直接调用 `window.electron.closeWindow()`），改为：

```tsx
const { minimizeToTray } = useAppContext()

const handleClose = () => {
  if (minimizeToTray) {
    window.electron.minimizeToTray()  // 新增 IPC
  } else {
    window.electron.closeWindow()
  }
}
```

- [ ] **Step 3: 在 ipc.ts 中新增 minimize-to-tray IPC**

```typescript
ipcMain.handle('window-minimize-to-tray', async (): Promise<void> => {
  mainWindow?.hide()
  // 托盘已存在（createTray 在启动时已调用），无需重复创建
})
```

- [ ] **Step 4: 在 preload 中暴露 minimizeToTray**

```typescript
// electron/preload/index.ts
minimizeToTray: () => ipcRenderer.invoke('window-minimize-to-tray'),
```

- [ ] **Step 5: 在 LanguagePage 设置面板中增加开关**

在主题/语言设置的合适位置添加两个开关：

```tsx
// src/pages/LanguagePage.tsx
<div className="setting-item">
  <span>{t('settings.autoLaunch')}</span>
  <Toggle
    checked={autoLaunch}
    onChange={v => window.electron.setAutoLaunch(v)}
  />
</div>

<div className="setting-item">
  <span>{t('settings.minimizeToTray')}</span>
  <Toggle
    checked={minimizeToTray}
    onChange={v => setMinimizeToTray(v)}
  />
</div>
```

> 注：需要先在 `LanguageContext.tsx` 的 i18n 中添加两个翻译 key：`settings.autoLaunch` 和 `settings.minimizeToTray`。

- [ ] **Step 6: 提交**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/context/AppContext.tsx src/components/TitleBar.tsx src/pages/LanguagePage.tsx
git commit -m "feat(tray): add minimize-to-tray on close with configurable setting"
```

---

## Task 5: 托盘菜单增加"显示窗口"和"退出"

> 注意：`createTray` 函数在 `index.ts` 中已存在，只需增强托盘菜单。

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 在现有 createTray 函数中增强托盘菜单**

找到 `createTray` 函数中的 `Tray` 菜单构建部分（`new Menu()` 调用），替换或补充：

```typescript
const contextMenu = Menu.buildFromTemplate([
  {
    label: '显示窗口',
    click: () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  },
  {
    label: '全局搜索',
    accelerator: currentHotkey,
    click: () => {
      if (floatingWindow) {
        floatingWindow.show()
        floatingWindow.focus()
      } else if (!floatingWindow) {
        createFloatingWindow()
        floatingWindow?.show()
      }
    }
  },
  { type: 'separator' },
  {
    label: '退出',
    click: () => {
      isClosingFromIPC = true  // 绕过关闭确认
      app.quit()
    }
  },
])

const tray = new Tray(icon)
tray.setToolTip('DocSeeker')
tray.setContextMenu(contextMenu)

// 双击托盘图标显示主窗口
tray.on('double-click', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})
```

- [ ] **Step 2: 提交**

```bash
git add electron/main/index.ts
git commit -m "feat(tray): enhance tray menu with show/exit options and double-click to show"
```

---

---

## Task 6: 跟随系统主题（Appearance Tab 完善）

> 在 SettingsPage 的 AppearanceSettings 中实现跟随系统主题功能。

**Files:**
- Modify: `src/context/LanguageContext.tsx`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: 在 LanguageContext 中增加"跟随系统"主题选项**

找到 themes 数组，在现有 6 个主题后添加 `system` 选项：

```tsx
// src/context/LanguageContext.tsx
const themes = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'ocean', label: '海洋' },
  { id: 'nord', label: 'Nord' },
  { id: 'warm', label: '暖色' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'system', label: '跟随系统' },  // 新增
]
```

- [ ] **Step 2: 使用 nativeTheme 监听系统主题变更**

在 LanguageContext 的 `useEffect` 中，当选择 `system` 时监听变化：

```tsx
import { nativeTheme } from 'electron'

// 监听系统主题变化
useEffect(() => {
  if (theme !== 'system') return

  const apply = () => {
    const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', systemTheme)
  }

  apply()
  nativeTheme.on('updated', apply)
  return () => { nativeTheme.removeListener('updated', apply) }
}, [theme])

// 当选择 system 时，也要应用初始值
useEffect(() => {
  if (theme === 'system') {
    const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', systemTheme)
  }
}, [theme])
```

> 注意：`nativeTheme` 在 renderer 进程中通过 contextBridge 暴露，需要在 preload 中添加：
> `nativeTheme: { shouldUseDarkColors: nativeTheme.shouldUseDarkColors }`

- [ ] **Step 3: 在 AppearanceSettings 中渲染主题选项**

替换 SettingsPage 中的占位组件：

```tsx
function AppearanceSettings(): JSX.Element {
  const { theme, setTheme } = useLanguage()

  return (
    <div className="appearance-settings">
      <div className="setting-group">
        <div className="setting-label">{t('settings.appearance.theme')}</div>
        <div className="theme-grid">
          {themes.map(t => (
            <button
              key={t.id}
              className={`theme-card ${theme === t.id ? 'active' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <span className="theme-name">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 在 i18n 中添加翻译**

```tsx
// 在 LanguageContext 的 translations 中添加：
settings: {
  title: '设置',
  tab: {
    appearance: '外观',
    window: '窗口行为',
  },
  appearance: {
    theme: '主题',
  },
  window: {
    autoLaunch: '开机自启',
    autoLaunchDesc: '系统启动时自动运行 DocSeeker',
    minimizeToTray: '关闭时最小化到托盘',
    minimizeToTrayDesc: '点击关闭按钮时隐藏到系统托盘',
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add src/context/LanguageContext.tsx src/pages/SettingsPage.tsx src/styles.css
git commit -m "feat(theme): add follow-system theme with nativeTheme API"
```

---

## 验证

- [ ] **Step 1: TypeScript 编译检查**

Run: `cd D:/ProjectFile/docSeeker && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 2: 功能测试**

**开机自启：**
1. 打开设置，开启"开机自启"
2. Windows 设置 → 应用 → 启动项，验证 DocSeeker 出现在列表中

**静默启动：**
1. 手动运行：`docseeker.exe --startup`
2. 验证主窗口不弹出，仅托盘图标出现
3. 双击托盘图标，主窗口正常显示

**关闭最小化托盘：**
1. 开启"关闭时最小化到托盘"开关
2. 点击关闭按钮，验证窗口隐藏但进程仍在运行（托盘图标保留）
3. 点击托盘图标，窗口重新显示

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: startup and tray optimization - auto-launch, silent start, minimize to tray"
```
