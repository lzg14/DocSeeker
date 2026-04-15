# 多主题切换功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展主题系统，支持 6 套主题（Light / Dark / Ocean / Nord / Warm / Solarized），在设置页面和状态栏均可切换。

**Architecture:** 迁移主题状态到 `LanguageContext`，6 套主题 CSS 变量通过 `[data-theme="xxx"]` 选择器激活，主题切换通过改 `document.documentElement.dataset.theme` 实现实时生效，偏好持久化到 `localStorage`。

**Tech Stack:** React Context, CSS 变量系统, localStorage 持久化, 内联 SVG 图标

---

## 文件结构

```
src/
  styles.css                      # 扩展 6 套主题 CSS 变量，替换现有 light/dark
  context/LanguageContext.tsx      # 新增 theme 状态、ThemeId 类型、themes 元数据、changeTheme 函数
  pages/LanguagePage.tsx           # 重构为 6 主题卡片 UI，实时切换
  components/StatusBar.tsx         # 新增 ThemeSwitcher 下拉菜单组件
```

---

## Task 1: 更新 styles.css 主题变量

**Files:**
- Modify: `src/styles.css:46-77`

- [ ] **Step 1: 读取现有 `:root` 和 `[data-theme="dark"]` 变量块（共约 32 行）**

在编辑器中查看 styles.css 第 46-77 行，确认现有变量名称。

- [ ] **Step 2: 替换现有 CSS 变量为 6 套完整主题**

将 `:root` 和 `[data-theme="dark"]` 两个块（共约 32 行）替换为以下 6 个主题块：

```css
/* === Light（浅色）— 默认主题 === */
[data-theme="light"],
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-tertiary: #eaeef2;
  --border: #d0d7de;
  --border-light: #e8ecf0;
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-muted: #8b949e;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-subtle: #dbeafe;
  --accent-text: #ffffff;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);
  --hover-bg: rgba(0, 0, 0, 0.04);
  --selected-bg: #dbeafe;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

/* === Dark（深色）=== */
[data-theme="dark"] {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --border-light: #3a424d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #656d76;
  --accent: #388bfd;
  --accent-hover: #58a6ff;
  --accent-subtle: #1f3a5f;
  --accent-text: #ffffff;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --hover-bg: rgba(255, 255, 255, 0.06);
  --selected-bg: #1f3a5f;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

/* === Ocean（蓝调）=== */
[data-theme="ocean"] {
  --bg-primary: #0a192f;
  --bg-secondary: #0d2137;
  --bg-tertiary: #112240;
  --border: #1d3a5c;
  --border-light: #2a4f78;
  --text-primary: #e6f1ff;
  --text-secondary: #8899aa;
  --text-muted: #5c7a99;
  --accent: #32968f;
  --accent-hover: #3fb8ad;
  --accent-subtle: #0d3d38;
  --accent-text: #ffffff;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --hover-bg: rgba(255, 255, 255, 0.05);
  --selected-bg: #0d3d38;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

/* === Nord（北欧）=== */
[data-theme="nord"] {
  --bg-primary: #2e3440;
  --bg-secondary: #3b4252;
  --bg-tertiary: #434c5e;
  --border: #4c566a;
  --border-light: #5e6a82;
  --text-primary: #eceff4;
  --text-secondary: #d8dee9;
  --text-muted: #9099a8;
  --accent: #81a1c1;
  --accent-hover: #a3be8c;
  --accent-subtle: #3d4559;
  --accent-text: #2e3440;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --hover-bg: rgba(255, 255, 255, 0.05);
  --selected-bg: #3d4559;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

/* === Warm（暖色）=== */
[data-theme="warm"] {
  --bg-primary: #fdf8f3;
  --bg-secondary: #f5ebe0;
  --bg-tertiary: #e8ddd0;
  --border: #d5c8b8;
  --border-light: #e0d3c3;
  --text-primary: #3d2e1e;
  --text-secondary: #7a6352;
  --text-muted: #a08b78;
  --accent: #c9a96e;
  --accent-hover: #b8955a;
  --accent-subtle: #f0e6d0;
  --accent-text: #3d2e1e;
  --shadow: 0 1px 3px rgba(61, 46, 30, 0.1);
  --shadow-md: 0 4px 12px rgba(61, 46, 30, 0.15);
  --hover-bg: rgba(61, 46, 30, 0.04);
  --selected-bg: #f0e6d0;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}

/* === Solarized（Solarized Light）=== */
[data-theme="solarized"] {
  --bg-primary: #fdf6e3;
  --bg-secondary: #eee8d5;
  --bg-tertiary: #e4d8be;
  --border: #d3c9b5;
  --border-light: #ddd0bc;
  --text-primary: #073642;
  --text-secondary: #586e75;
  --text-muted: #839496;
  --accent: #268bd2;
  --accent-hover: #1a6fa8;
  --accent-subtle: #d0e8f5;
  --accent-text: #fdf6e3;
  --shadow: 0 1px 3px rgba(7, 54, 66, 0.1);
  --shadow-md: 0 4px 12px rgba(7, 54, 66, 0.12);
  --hover-bg: rgba(7, 54, 66, 0.04);
  --selected-bg: #d0e8f5;
  --radius: 4px;
  --nav-width: 220px;
  --titlebar-height: 40px;
  --statusbar-height: 32px;
}
```

- [ ] **Step 3: 验证替换结果**

确认 styles.css 中存在 `[data-theme="light"]`, `data-theme="dark"]`, `[data-theme="ocean"]`, `[data-theme="nord"]`, `[data-theme="warm"]`, `[data-theme="solarized"]` 六个选择器，且均包含完整的 CSS 变量集。

- [ ] **Step 4: 提交**

```bash
git add src/styles.css
git commit -m "feat(theme): replace 2-theme system with 6 complete theme CSS variable sets"
```

---

## Task 2: 扩展 LanguageContext 管理 theme 状态

**Files:**
- Modify: `src/context/LanguageContext.tsx`

- [ ] **Step 1: 添加 ThemeId 类型和 themes 元数据常量**

在 `LanguageContext.tsx` 文件顶部（import 之后，LanguageContextValue 接口之前），添加以下代码：

```typescript
export type ThemeId = 'light' | 'dark' | 'ocean' | 'nord' | 'warm' | 'solarized'

export interface ThemeMeta {
  id: ThemeId
  labelKey: string
  descKey: string
  preview: {
    bg: string
    bgSecondary: string
    accent: string
  }
}

export const themes: ThemeMeta[] = [
  {
    id: 'light',
    labelKey: 'theme.light',
    descKey: 'theme.light.desc',
    preview: { bg: '#ffffff', bgSecondary: '#f6f8fa', accent: '#2563eb' },
  },
  {
    id: 'dark',
    labelKey: 'theme.dark',
    descKey: 'theme.dark.desc',
    preview: { bg: '#0d1117', bgSecondary: '#161b22', accent: '#388bfd' },
  },
  {
    id: 'ocean',
    labelKey: 'theme.ocean',
    descKey: 'theme.ocean.desc',
    preview: { bg: '#0a192f', bgSecondary: '#0d2137', accent: '#32968f' },
  },
  {
    id: 'nord',
    labelKey: 'theme.nord',
    descKey: 'theme.nord.desc',
    preview: { bg: '#2e3440', bgSecondary: '#3b4252', accent: '#81a1c1' },
  },
  {
    id: 'warm',
    labelKey: 'theme.warm',
    descKey: 'theme.warm.desc',
    preview: { bg: '#fdf8f3', bgSecondary: '#f5ebe0', accent: '#c9a96e' },
  },
  {
    id: 'solarized',
    labelKey: 'theme.solarized',
    descKey: 'theme.solarized.desc',
    preview: { bg: '#fdf6e3', bgSecondary: '#eee8d5', accent: '#268bd2' },
  },
]
```

- [ ] **Step 2: 扩展 LanguageContextValue 接口**

将 `LanguageContextValue` 接口更新为：

```typescript
interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  t: (key: string) => string
}
```

- [ ] **Step 3: 在 LanguageProvider 中添加 theme 状态和 setTheme 函数**

在 `const [language, setLanguageState] = useState` 下方添加：

```typescript
const [theme, setThemeState] = useState<ThemeId>(() => {
  return (localStorage.getItem('theme') as ThemeId) || 'light'
})

const setTheme = (newTheme: ThemeId) => {
  setThemeState(newTheme)
  localStorage.setItem('theme', newTheme)
  document.documentElement.setAttribute('data-theme', newTheme)
}
```

- [ ] **Step 4: 在 LanguageProvider 初始化时设置 data-theme 属性**

在 `LanguageProvider` 组件的 `useEffect` 或组件体中（children 渲染前）添加初始化逻辑，确保页面加载时读取 localStorage 并设置 `data-theme`。在 `return` 语句中children渲染之前添加：

```typescript
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme)
}, [theme])
```

**注意：** 在 useEffect 之前需要从 react 导入 useEffect（已存在）。确保新代码添加在 `const t = ...` 之前。

- [ ] **Step 5: 将 theme / setTheme 暴露给 Provider**

将 `LanguageContext.Provider` 的 value 更新为：

```typescript
<LanguageContext.Provider value={{ language, setLanguage, theme, setTheme, t }}>
  {children}
</LanguageContext.Provider>
```

- [ ] **Step 6: 验证 LanguageContext 完整代码**

确认文件导出：`LanguageProvider`, `useLanguage`, `themes`（供 StatusBar 使用）, `ThemeId` 类型。

- [ ] **Step 7: 提交**

```bash
git add src/context/LanguageContext.tsx
git commit -m "feat(theme): add theme state to LanguageContext with 6 theme support"
```

---

## Task 3: 重构 LanguagePage 为主题卡片选择器

**Files:**
- Modify: `src/pages/LanguagePage.tsx`

- [ ] **Step 1: 读取 LanguagePage.tsx 确认当前结构**

确认文件当前第 1-137 行内容。主题切换相关代码在第 6 行（useState）、第 11-14 行（useEffect 读取主题）、第 51-55 行（handleThemeChange）。

- [ ] **Step 2: 替换 import，移除本地 theme 状态**

将 `import { useState, useEffect } from 'react'` 改为：
```typescript
import { useState, useEffect } from 'react'
import { useLanguage, themes } from '../context/LanguageContext'
```

删除第 6 行的 `const [theme, setTheme] = useState<'light' | 'dark'>('light')`。
删除第 11-14 行的 `useEffect`（读取和设置 theme 的逻辑）。
删除第 51-55 行的 `handleThemeChange` 函数。

- [ ] **Step 3: 从 useLanguage 获取 theme 和 setTheme**

在 `const { language, setLanguage, t } = useLanguage()` 这一行添加 theme 和 setTheme：
```typescript
const { language, setLanguage, theme, setTheme, t } = useLanguage()
```

- [ ] **Step 4: 替换主题切换 UI**

找到 `<div className="theme-toggle">...</div>` 区域（第 74-87 行），替换为 6 主题卡片网格：

```tsx
<div className="theme-cards">
  {themes.map((t) => (
    <button
      key={t.id}
      className={`theme-card ${theme === t.id ? 'active' : ''}`}
      onClick={() => setTheme(t.id)}
      title={t.descKey}
    >
      <div className="theme-card-preview">
        <div
          className="theme-preview-bg"
          style={{ background: t.preview.bg }}
        >
          <div
            className="theme-preview-sidebar"
            style={{ background: t.preview.bgSecondary }}
          />
          <div
            className="theme-preview-accent"
            style={{ background: t.preview.accent }}
          />
        </div>
      </div>
      <div className="theme-card-label">{t.labelKey}</div>
    </button>
  ))}
</div>
```

- [ ] **Step 5: 添加主题卡片的 CSS 样式**

在 `src/styles.css` 末尾添加以下样式：

```css
/* === 主题卡片选择器 === */
.theme-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 8px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 100ms ease;
  font-family: inherit;
}

.theme-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}

.theme-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.theme-card-preview {
  width: 100%;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.theme-preview-bg {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  padding-left: 8px;
}

.theme-preview-sidebar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 28%;
}

.theme-preview-bg {
  padding-left: 32%;
}

.theme-preview-accent {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  margin-left: 4px;
}

.theme-card-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.theme-card.active .theme-card-label {
  color: var(--accent);
}
```

- [ ] **Step 6: 验证功能**

运行应用，访问设置页面，确认：
1. 显示 6 个主题卡片，每个卡片有预览色块
2. 点击任意卡片，页面主题立即切换
3. 刷新页面，主题保持（从 localStorage 读取）

- [ ] **Step 7: 提交**

```bash
git add src/pages/LanguagePage.tsx src/styles.css
git commit -m "feat(theme): replace toggle with 6-theme card selector in settings"
```

---

## Task 4: 添加状态栏主题快捷切换

**Files:**
- Modify: `src/components/StatusBar.tsx`

- [ ] **Step 1: 读取 StatusBar.tsx 确认结构**

确认第 1-54 行完整内容。

- [ ] **Step 2: 添加 import 和 ThemeSwitcher 组件**

在 `import { useLanguage }` 行下方添加：
```typescript
import { useState, useRef, useEffect } from 'react'
import { themes } from '../context/LanguageContext'
import type { ThemeId } from '../context/LanguageContext'
```

- [ ] **Step 3: 添加本地菜单状态**

在 `StatusBar` 函数体内，`useAppContext` 调用之后添加：
```typescript
const [theme, setTheme] = useLanguage().theme !== undefined
  ? [useLanguage().theme, useLanguage().setTheme]
  : (() => { throw new Error('useLanguage not found') })()

const [themeMenuOpen, setThemeMenuOpen] = useState(false)
const menuRef = useRef<HTMLDivElement>(null)
```

实际上，由于 `useLanguage` 可能返回的 theme 为 undefined（未迁移前的兼容问题），改用以下安全写法：

```typescript
const { theme: ctxTheme, setTheme: ctxSetTheme, t } = useLanguage()
const theme = ctxTheme as ThemeId
const setTheme = ctxSetTheme as (t: ThemeId) => void
const [themeMenuOpen, setThemeMenuOpen] = useState(false)
const menuRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 4: 点击外部关闭菜单的 useEffect**

在 `loadStats` useEffect 下方添加：

```typescript
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setThemeMenuOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

- [ ] **Step 5: 在状态栏右侧添加主题切换按钮和菜单**

找到 `StatusBar` return 语句中的 `<div className="status-bar">`，在右侧 `<span>` 之后添加主题切换器：

```tsx
<div className="status-bar">
  <span>DocSeeker v1.0.0</span>
  <span>
    {fileCount !== null && fileCount >= 0
      ? t('status.indexed').replace('{count}', fileCount.toLocaleString())
      : ''}
  </span>
  {/* 主题快捷切换 */}
  <div className="statusbar-theme-switcher" ref={menuRef}>
    <button
      className="theme-dot-btn"
      onClick={() => setThemeMenuOpen(!themeMenuOpen)}
      title={t('theme.switch') || 'Switch theme'}
      style={{ '--dot-color': themes.find(th => th.id === theme)?.preview.accent || '#2563eb' } as React.CSSProperties}
    >
      <span className="theme-dot" />
    </button>
    {themeMenuOpen && (
      <div className="theme-menu">
        {themes.map((t) => (
          <button
            key={t.id}
            className={`theme-option ${theme === t.id ? 'active' : ''}`}
            onClick={() => {
              setTheme(t.id)
              setThemeMenuOpen(false)
            }}
          >
            <span
              className="theme-option-dot"
              style={{ background: t.preview.accent }}
            />
            {t.labelKey}
            {theme === t.id && <span className="check-icon">✓</span>}
          </button>
        ))}
      </div>
    )}
  </div>
</div>
```

**注意**：需要将 `{t('status.indexed')...}` 那一行包裹在一个容器 `<span>` 内以便于 flex 布局，但保持原有的 `fileCount` 显示逻辑不变。

- [ ] **Step 6: 添加状态栏主题切换器的 CSS 样式**

在 `src/styles.css` 末尾添加：

```css
/* === 状态栏主题切换 === */
.statusbar-theme-switcher {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.theme-dot-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: background 150ms ease;
}

.theme-dot-btn:hover {
  background: var(--hover-bg);
}

.theme-dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dot-color, #2563eb);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
}

.theme-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
  min-width: 140px;
  z-index: 100;
  overflow: hidden;
  animation: fadeInUp 120ms ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  transition: background 100ms ease;
}

.theme-option:hover {
  background: var(--hover-bg);
}

.theme-option.active {
  color: var(--accent);
  font-weight: 500;
}

.theme-option-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.check-icon {
  margin-left: auto;
  font-size: 11px;
  color: var(--accent);
}
```

- [ ] **Step 7: 验证功能**

运行应用，确认：
1. 状态栏右侧显示一个小圆点（当前主题的 accent 色）
2. 点击圆点弹出 6 主题下拉菜单
3. 点击任意主题，菜单收起，主题切换立即生效
4. 点击菜单外部，菜单自动关闭

- [ ] **Step 8: 提交**

```bash
git add src/components/StatusBar.tsx src/styles.css
git commit -m "feat(theme): add statusbar quick theme switcher with dropdown menu"
```

---

## Task 5: 添加 i18n 翻译

**Files:**
- Modify: `src/context/LanguageContext.tsx`（翻译对象）

- [ ] **Step 1: 在 zh-CN 翻译对象中添加 6 主题的翻译**

在 `translations['zh-CN']` 对象中，在 `'settings.dark': '深色'` 之后添加：

```typescript
'theme.light': '浅色',
'theme.light.desc': '白天 / 办公环境',
'theme.dark': '深色',
'theme.dark.desc': '夜间 / 专注场景',
'theme.ocean': '蓝调',
'theme.ocean.desc': '长时间盯屏 / 冷色偏好',
'theme.nord': '北欧',
'theme.nord.desc': '清新冷淡风',
'theme.warm': '暖色',
'theme.warm.desc': '夜间阅读 / 眼睛舒适',
'theme.solarized': 'Solarized',
'theme.solarized.desc': '暖灰 / 专业写作者',
'theme.switch': '切换主题',
```

- [ ] **Step 2: 在 en 翻译对象中添加 6 主题的翻译**

在 `translations['en']` 对象中，在 `'settings.dark': 'Dark'` 之后添加：

```typescript
'theme.light': 'Light',
'theme.light.desc': 'Daytime / Office',
'theme.dark': 'Dark',
'theme.dark.desc': 'Night / Focus',
'theme.ocean': 'Ocean',
'theme.ocean.desc': 'Long screen time / Cool tone',
'theme.nord': 'Nord',
'theme.nord.desc': 'Fresh & minimal',
'theme.warm': 'Warm',
'theme.warm.desc': 'Night reading / Eye comfort',
'theme.solarized': 'Solarized',
'theme.solarized.desc': 'Warm gray / Writers',
'theme.switch': 'Switch theme',
```

- [ ] **Step 3: 验证翻译在 LanguagePage 和 StatusBar 中可用**

确认：
1. LanguagePage 的 `t.labelKey` 和 `t.descKey` 正确使用 `t()` 函数渲染翻译
2. StatusBar 的 `t('theme.switch')` 正确渲染

- [ ] **Step 4: 提交**

```bash
git add src/context/LanguageContext.tsx
git commit -m "feat(i18n): add theme names and descriptions for all 6 themes"
```

---

## 实施顺序

| 顺序 | Task | 改动文件 |
|------|------|---------|
| 1 | 更新 styles.css 主题变量 | `src/styles.css` |
| 2 | 扩展 LanguageContext | `src/context/LanguageContext.tsx` |
| 3 | 重构 LanguagePage | `src/pages/LanguagePage.tsx`, `src/styles.css` |
| 4 | 状态栏主题切换器 | `src/components/StatusBar.tsx`, `src/styles.css` |
| 5 | 添加 i18n 翻译 | `src/context/LanguageContext.tsx` |

---

## 验证清单

每完成一个 Task 后，验证：
- [ ] 主题切换后所有 CSS 变量正确应用
- [ ] 6 个主题在 LanguagePage 中均可选且立即生效
- [ ] 状态栏主题切换器正常弹出菜单和切换
- [ ] 刷新页面后主题保持不变（localStorage 持久化）
- [ ] 中英文翻译正确显示
