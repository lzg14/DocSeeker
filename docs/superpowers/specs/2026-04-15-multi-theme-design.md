# DocSeeker 多主题切换功能设计文档

**日期**：2026-04-15
**状态**：已确认
**目标**：扩展主题系统，支持 6 套主题，提供设置页完整选择 + 状态栏快捷切换

---

## 1. 主题总览

共 6 个主题，每个主题拥有独立的 CSS 变量集，包括独立的 accent 强调色：

| 主题 ID | 名称 | 背景基调 | Accent 色 | 适合场景 |
|---------|------|---------|----------|---------|
| `light` | 浅色 | 纯白背景 | `#2563eb` 蓝 | 白天/办公环境 |
| `dark` | 深色 | 近黑背景 | `#388bfd` 亮蓝 | 夜间/专注场景 |
| `ocean` | 蓝调 | 蓝灰背景 | `#32968f` 青蓝 | 长时间盯屏/冷色偏好 |
| `nord` | 北欧 | 深灰蓝背景 | `#81a1c1` 冰蓝 | 清新冷淡风 |
| `warm` | 暖色 | 米白/暖白背景 | `#c9a96e` 琥珀金 | 夜间阅读/眼睛敏感 |
| `solarized` | Solarized | 暖灰背景 | `#268bd2` 暖蓝 | 专业写作者/设计师 |

---

## 2. 主题色值定义

### 2.1 Light（浅色）

```css
[data-theme="light"] {
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
}
```

### 2.2 Dark（深色）

```css
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
}
```

### 2.3 Ocean（蓝调）

```css
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
}
```

### 2.4 Nord（北欧）

```css
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
}
```

### 2.5 Warm（暖色）

```css
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
}
```

### 2.6 Solarized（Solarized Light）

```css
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
}
```

---

## 3. Accent 色应用场景

每个主题的 accent 色统一用于以下场景：

- 按钮主色调（`.btn-primary`）
- 链接文字颜色
- 导航选中项背景和文字
- 表单 focus 轮廓
- 搜索框边框高亮
- 文件列表选中行背景
- 模态框标题强调
- 状态栏 accent 图标

---

## 4. 主题切换交互

### 4.1 设置页面（LanguagePage）

**位置**：侧边导航 → 设置 → 语言/主题

**UI**：6 个主题卡片，水平或网格排列

**卡片内容**：
```
┌──────────────────────┐
│  [色块预览区]         │  ← 展示该主题的 bg-primary/bg-secondary/accent
│  主题名称             │
│  副描述（如"浅色/专注"）│
└──────────────────────┘
```

**交互**：
- 点击任意卡片，立即切换主题（无需保存按钮）
- 当前选中主题卡片有选中边框（accent 色）
- hover 状态有阴影提升效果

**布局建议**：
- 页面标题："主题"
- 6 个卡片 2 行 3 列网格（桌面端）
- 每个卡片下方显示主题名称 + 简短描述

### 4.2 状态栏快捷切换

**位置**：状态栏右侧区域

**UI**：
- 一个主题图标按钮（随当前主题变化，显示当前 accent 色圆点或图标）
- 点击弹出下拉菜单，显示 6 个主题选项
- 当前主题有勾选标记

**交互**：
- 鼠标悬停显示"切换主题"提示
- 点击选项立即切换
- 切换后下拉菜单自动收起

---

## 5. 技术实现

### 5.1 数据结构

```typescript
type ThemeId = 'light' | 'dark' | 'ocean' | 'nord' | 'warm' | 'solarized'

interface ThemeMeta {
  id: ThemeId
  labelKey: string        // i18n key，如 'theme.light'
  descKey: string         // i18n key，如 'theme.light.desc'
  preview: {
    bg: string            // 预览色块主色
    bgSecondary: string   // 预览色块次色
    accent: string         // 预览色块强调色
  }
}

const themes: ThemeMeta[] = [
  { id: 'light', labelKey: 'theme.light', descKey: 'theme.light.desc', preview: { bg: '#ffffff', bgSecondary: '#f6f8fa', accent: '#2563eb' } },
  { id: 'dark', labelKey: 'theme.dark', descKey: 'theme.dark.desc', preview: { bg: '#0d1117', bgSecondary: '#161b22', accent: '#388bfd' } },
  { id: 'ocean', labelKey: 'theme.ocean', descKey: 'theme.ocean.desc', preview: { bg: '#0a192f', bgSecondary: '#0d2137', accent: '#32968f' } },
  { id: 'nord', labelKey: 'theme.nord', descKey: 'theme.nord.desc', preview: { bg: '#2e3440', bgSecondary: '#3b4252', accent: '#81a1c1' } },
  { id: 'warm', labelKey: 'theme.warm', descKey: 'theme.warm.desc', preview: { bg: '#fdf8f3', bgSecondary: '#f5ebe0', accent: '#c9a96e' } },
  { id: 'solarized', labelKey: 'theme.solarized', descKey: 'theme.solarized.desc', preview: { bg: '#fdf6e3', bgSecondary: '#eee8d5', accent: '#268bd2' } },
]
```

### 5.2 Context 扩展

现有 `LanguageContext.tsx` 已管理 `theme` 状态，扩展为：

```typescript
// LanguageContext 新增
const [theme, setTheme] = useState<ThemeId>('light')

const changeTheme = (newTheme: ThemeId) => {
  setTheme(newTheme)
  document.documentElement.setAttribute('data-theme', newTheme)
  store.set('theme', newTheme)  // 持久化
}
```

### 5.3 CSS 注入

所有 6 套主题的 CSS 变量写入 `styles.css`，通过 `[data-theme="xxx"]` 选择器激活。

`<html>` 或 `<body>` 的 `data-theme` 属性控制当前激活主题。

### 5.4 持久化

使用现有 Electron store（或 `localStorage`），键名 `theme`，值为 `ThemeId` 字符串。

启动时从 store 读取，初始化 Context。

### 5.5 状态栏图标

状态栏组件 `StatusBar.tsx` 接收当前主题 `theme` 和切换回调：

```tsx
// StatusBar 新增功能
const ThemeSwitcher = () => (
  <div className="statusbar-theme-switcher" title={t('theme.switch')}>
    <button
      className="theme-dot"
      style={{ background: accentVar }}
      onClick={toggleThemeMenu}
    />
    {/* 下拉菜单 */}
    <div className="theme-menu">
      {themes.map(t => (
        <button
          key={t.id}
          className={`theme-option ${current === t.id ? 'active' : ''}`}
          onClick={() => changeTheme(t.id)}
        >
          <span className="theme-option-dot" style={{ background: t.preview.accent }} />
          {t(t.labelKey)}
          {current === t.id && <span className="check-icon">✓</span>}
        </button>
      ))}
    </div>
  </div>
)
```

---

## 6. 文件改动清单

| 文件 | 改动内容 |
|------|---------|
| `src/styles.css` | 新增 6 套主题 CSS 变量，替换现有 light/dark 定义 |
| `src/context/LanguageContext.tsx` | 扩展 theme 状态，添加 `changeTheme` 函数，暴露 `themes` 元数据 |
| `src/pages/LanguagePage.tsx` | 重构布局，添加 6 主题卡片选择器 UI |
| `src/components/StatusBar.tsx` | 新增 ThemeSwitcher 子组件，右上角快捷切换入口 |
| `src/locales/zh-CN.json` | 新增 6 主题名称/描述的 i18n 翻译 |
| `src/locales/en.json` | 新增 6 主题名称/描述的 i18n 翻译 |
| `electron/preload/index.ts` | 如需 store 访问（可选），扩展 preload API |

---

## 7. 实施阶段

**Phase 1：CSS 主题系统**
- 将现有 `[data-theme="dark"]` 替换为完整的 6 套主题变量
- 保留 light/dark 变量名语义，新增 ocean/nord/warm/solarized
- 验证所有组件在每个主题下的基本可用性

**Phase 2：Context 与状态管理**
- 扩展 LanguageContext，支持 `ThemeId` 类型和 `changeTheme`
- 从 store 读取/写入主题偏好
- 移除旧的单 `theme: 'dark' | 'light'` 二元切换逻辑

**Phase 3：设置页面 UI**
- 设计并实现 6 主题卡片网格布局
- 点击实时切换，无需保存按钮
- 当前选中态样式

**Phase 4：状态栏快捷切换**
- 在 StatusBar 右侧区域实现下拉菜单
- 点击切换，菜单自动收起
- 跟随当前主题 accent 色显示入口图标

**Phase 5：i18n 翻译**
- 添加中英文主题名称和描述
- 确保所有 UI 文本通过 `t()` 获取

---

## 8. 不在本次范围内

- 跟随系统偏好自动切换主题（后续可扩展 `prefers-color-scheme`）
- 动态主题（跟随时间自动切换）
- 用户自定义主题（自定义颜色）
- 主题预览动画（如暗色渐变切换效果）
