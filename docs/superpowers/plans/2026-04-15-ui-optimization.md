# DocSeeker 三阶段界面优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 DocSeeker 界面升级为专业工具风格（VS Code / Figma 风格），分三阶段迭代。

**设计语言:**
- 风格：Pro Tool（专业工具感）
- 主色：蓝色系（已通过多主题功能建立），用于 accent 变量
- 圆角：`4px`（已定义）
- 图标：SVG 内联图标替换 emoji
- 动效：克制、实用，`150-200ms ease` 过渡

**Tech Stack:** React, CSS 变量, 内联 SVG

---

## 阶段一：颜色 + 图标系统

目标：不改变布局，只换皮肤，让界面立刻专业起来。

### Task 1: 侧边导航 emoji → SVG 图标

**Files:**
- Modify: `src/components/SideNav.tsx`

**当前状态：** 导航使用 emoji 🔎📁⚙️❓

**改动：**
将 `icon: '🔎'` 等 emoji 字符串替换为 SVG 图标。将 `navItems` 中的 `icon` 字段类型从 `string` 改为 `JSX.Element`，并使用内联 SVG：

```tsx
import { useLanguage } from '../context/LanguageContext'
import { PageTab } from '../types'

// SVG 图标组件
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const HelpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const navItems: { id: PageTab; labelKey: string; icon: JSX.Element; groupKey: string }[] = [
  { id: 'search', labelKey: 'nav.search', icon: <SearchIcon />, groupKey: 'nav.group.nav' },
  { id: 'scan', labelKey: 'nav.scan', icon: <FolderIcon />, groupKey: 'nav.group.nav' },
  { id: 'language', labelKey: 'nav.settings', icon: <SettingsIcon />, groupKey: 'nav.group.settings' },
  { id: 'guide', labelKey: 'nav.guide', icon: <HelpIcon />, groupKey: 'nav.group.help' },
]
```

同时更新 `nav-icon` 样式，使其能正确渲染 SVG：
```css
.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  transition: color 150ms ease;
}

.nav-item:hover .nav-icon {
  color: var(--text-primary);
}

.nav-item.active .nav-icon {
  color: var(--accent);
}
```

验证：侧边导航显示 SVG 图标，选中项图标变蓝色。

提交：`git add src/components/SideNav.tsx src/styles.css && git commit -m "refactor(icons): replace SideNav emoji with SVG icons"`

---

### Task 2: 标题栏 emoji/text → SVG 图标

**Files:**
- Modify: `src/components/TitleBar.tsx`
- Modify: `src/styles.css`

**当前状态：** 标题栏使用 `─` `❐` `□` `✕` 字符

**改动：** 将窗口控件替换为 SVG 图标：

```tsx
const MinimizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)

const RestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M0.5 2.5v7h7" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)
```

将 JSX 中的按钮内容替换：
```tsx
<button className="title-bar-btn" onClick={handleMinimize} title={translate('title.minimize') || '最小化'}>
  <MinimizeIcon />
</button>
<button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'}>
  {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
</button>
<button className="title-bar-btn close" onClick={handleClose} title="关闭">
  <CloseIcon />
</button>
```

标题栏按钮样式更新：
```css
.title-bar-btn {
  /* ... existing styles ... */
  transition: background-color 150ms ease, color 150ms ease;
  color: var(--text-secondary);
}

.title-bar-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-primary);
}

.title-bar-btn.close:hover {
  background-color: #e74c3c;
  color: #fff;
}
```

提交：`git add src/components/TitleBar.tsx src/styles.css && git commit -m "refactor(icons): replace TitleBar text/emoji with SVG window controls"`

---

### Task 3: 统一按钮色值为 CSS 变量

**Files:**
- Modify: `src/styles.css`

**当前状态：** `btn-danger` 使用硬编码 `#e74c3c` / `#c0392b`

**目标：** 所有按钮颜色均通过 CSS 变量控制，支持主题切换

在 `:root` 块中（light 主题的变量块末尾）添加：
```css
/* === 按钮危险色 === */
--danger: #e74c3c;
--danger-hover: #c0392b;
```

在各深色主题（dark/ocean/nord）中覆盖：
```css
[data-theme="dark"] {
  /* ...existing variables... */
  --danger: #f85149;
  --danger-hover: #da3633;
}

[data-theme="ocean"] {
  /* ...existing variables... */
  --danger: #f85149;
  --danger-hover: #da3633;
}

[data-theme="nord"] {
  /* ...existing variables... */
  --danger: #bf616a;
  --danger-hover: #cd8189;
}

[data-theme="warm"] {
  /* ...existing variables... */
  --danger: #c0392b;
  --danger-hover: #a93226;
}

[data-theme="solarized"] {
  /* ...existing variables... */
  --danger: #dc322f;
  --danger-hover: #cb4b16;
}
```

将 `.btn-danger` 样式改为：
```css
.btn-danger {
  background-color: var(--danger, #e74c3c);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: var(--danger-hover, #c0392b);
}
```

验证：切换任意主题，危险按钮颜色均适配当前主题。

提交：`git add src/styles.css && git commit -m "refactor(theme): use CSS variables for btn-danger colors"`

---

### Task 4: 导航选中态统一为 accent 色

**Files:**
- Modify: `src/styles.css`

**当前状态：** 导航选中项使用 `box-shadow` + 背景变化，没有使用 accent 色

**目标：** 导航选中项使用蓝色 accent 背景和边框，一目了然

更新 `.nav-item.active` 样式：
```css
.nav-item.active {
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
  box-shadow: none;
  border: 1px solid var(--accent);
}

.nav-item.active .nav-icon {
  color: var(--accent);
}
```

移除 hover 中深色主题的特殊处理（用统一的 `hover-bg` 变量）：
删除 `[data-theme="dark"] .nav-item:hover` 块（或合并到 `.nav-item:hover` 中使用 CSS 变量）。

提交：`git add src/styles.css && git commit -m "style(nav): update active nav item to use accent color"`

---

## 阶段二：动效与交互反馈

目标：让界面"活"起来，但克制不花哨。

### Task 5: 统一过渡动画规范

**Files:**
- Modify: `src/styles.css`

**目标：** 建立统一的过渡时长规范

在 `:root`（light 主题）块中添加：
```css
--transition-fast: 100ms ease;
--transition-base: 150ms ease;
--transition-slow: 200ms ease;
```

更新关键组件的过渡：
- `.nav-item`：transition 改为 `var(--transition-base)`
- `.btn`：已是 `0.15s`（约等于 150ms）
- `.title-bar-btn`：改为 `var(--transition-base)`
- `.file-row`（文件列表行）：添加 `transition: background-color var(--transition-base)`
- 所有 hover 状态：统一使用 `var(--transition-base)`

在深色/浅色各主题中均使用相同的 `--transition-*` 值（过渡时长不随主题变化）。

提交：`git add src/styles.css && git commit -m "feat(motion): add CSS transition duration variables"`

---

### Task 6: 模态框缩放淡入动画

**Files:**
- Modify: `src/styles.css`

**目标：** 模态框打开时带缩放 + 淡入动画，关闭时淡出

更新 `.modal-box` 样式：
```css
.modal-box {
  /* ...existing styles... */
  animation: modalIn 150ms ease forwards;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

同时给 `.modal-overlay` 添加淡入：
```css
.modal-overlay {
  /* ...existing styles... */
  animation: fadeIn 150ms ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

验证：打开确认对话框时，模态框有轻微缩放+淡入效果。

提交：`git add src/styles.css && git commit -m "feat(motion): add modal scale+fade animation"`

---

### Task 7: 文件列表行 hover 效果

**Files:**
- Modify: `src/styles.css`

**目标：** 文件列表行 hover 时有平滑背景过渡，选中行有 accent 底色

读取 styles.css 中 `.file-row` 或 `.file-item` 相关样式，确认选择器名称。

如果没有 `.file-row` 过渡，添加：
```css
.file-row,
.file-item {
  transition: background-color var(--transition-base);
}

.file-row:hover,
.file-item:hover {
  background-color: var(--hover-bg);
}

.file-row.selected,
.file-item.selected {
  background-color: var(--selected-bg);
}
```

如果有现有样式，合并过渡属性即可。

提交：`git add src/styles.css && git commit -m "feat(motion): add file list row hover transitions"`

---

## 阶段三：细节打磨

### Task 8: 自定义滚动条样式

**Files:**
- Modify: `src/styles.css`

**目标：** 滚动条颜色跟随主题，圆角细窄

在 `:root`（light）和 `[data-theme="dark"]` 等深色主题中分别添加 webkit 滚动条样式：

Light 主题（在 `[data-theme="light"], :root` 块末尾）：
```css
/* === 滚动条样式 === */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
```

深色主题在各自块中覆盖 `background`：
```css
[data-theme="dark"] {
  /* ...existing... */
  /* 滚动条 */
  ::-webkit-scrollbar-thumb {
    background: var(--border);
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
}
/* 其他深色主题（ocean/nord）同理 */
```

对 ocean/nord 也添加。

提交：`git add src/styles.css && git commit -m "style(scrollbar): add theme-aware custom scrollbar styling"`

---

### Task 9: Focus 轮廓样式

**Files:**
- Modify: `src/styles.css`

**目标：** 深色主题下键盘 focus 轮廓清晰可见，浅色主题同样

添加全局 focus 样式：
```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

button:focus:not(:focus-visible),
input:focus:not(:focus-visible) {
  outline: none;
}
```

同时在 `.search-box input`（如有）上确保 focus 样式：
```css
.search-box input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

提交：`git add src/styles.css && git commit -m "style(a11y): add focus-visible outline styles for keyboard navigation"`

---

### Task 10: 空状态与加载态视觉设计

**Files:**
- Modify: `src/styles.css`

**目标：** 无搜索结果、无文件时的空状态视觉美观；加载中用 spinner 替代文字

在 styles.css 中添加/更新空状态样式：
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
  gap: 12px;
  text-align: center;
}

.empty-state svg {
  color: var(--border);
  flex-shrink: 0;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.empty-state .empty-state-hint {
  font-size: 12px;
  color: var(--text-muted);
}
```

添加 spinner：
```css
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

验证：SearchPage 中无结果时显示空状态图标。

提交：`git add src/styles.css && git commit -m "style(empty): polish empty state and add spinner component"`

---

### Task 11: FloatingSearch 窗口主题同步

**Files:**
- Modify: `src/pages/FloatingSearch.tsx`
- Modify: `src/styles.css`（如有 FloatingSearch 专属样式）

**目标：** FloatingSearch 窗口在任意主题下正确显示

FloatingSearch 当前使用 `<LanguageProvider>` 但没有设置 `data-theme`。在 `FloatingSearch` 组件中，从 `useLanguage()` 获取 `theme` 并在 mount 时同步：

```tsx
function FloatingSearch(): JSX.Element {
  const { t, theme } = useLanguage()

  // 同步主题到浮动窗口
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [theme])
```

同时确认 FloatingSearch 的样式能适配所有 6 个主题（背景/文字/边框均使用 CSS 变量）。

提交：`git add src/pages/FloatingSearch.tsx && git commit -m "fix(theme): sync FloatingSearch window with current theme"`

---

## 实施顺序

| 阶段 | Task | 改动文件 |
|------|------|---------|
| 一 | Task 1 导航 SVG 图标 | SideNav.tsx, styles.css |
| 一 | Task 2 标题栏 SVG 图标 | TitleBar.tsx, styles.css |
| 一 | Task 3 按钮 CSS 变量 | styles.css |
| 一 | Task 4 导航选中态 accent | styles.css |
| 二 | Task 5 过渡动画规范 | styles.css |
| 二 | Task 6 模态框动画 | styles.css |
| 二 | Task 7 文件列表动效 | styles.css |
| 三 | Task 8 滚动条样式 | styles.css |
| 三 | Task 9 Focus 轮廓 | styles.css |
| 三 | Task 10 空状态/spinner | styles.css |
| 三 | Task 11 FloatingSearch 主题同步 | FloatingSearch.tsx |

---

## 验证清单

- [ ] 所有 emoji 图标已替换为 SVG，视觉精致
- [ ] 6 个主题下图标颜色正确跟随主题（深色主题图标为浅色）
- [ ] 按钮危险色在所有主题下正确显示
- [ ] 导航选中态使用蓝色 accent
- [ ] 过渡动画统一为 150-200ms
- [ ] 模态框有缩放淡入动画
- [ ] 文件列表行 hover 有平滑过渡
- [ ] 滚动条颜色跟随主题
- [ ] 键盘 focus 轮廓清晰可见
- [ ] 空状态有视觉设计（非纯文字）
- [ ] FloatingSearch 窗口主题与主窗口同步
- [ ] TypeScript 零错误
