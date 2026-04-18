import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Language = 'zh-CN' | 'en'

export type ThemeId = 'light' | 'dark' | 'ocean' | 'nord' | 'warm' | 'solarized' | 'system'

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
  {
    id: 'system',
    labelKey: 'theme.system',
    descKey: 'theme.system.desc',
    preview: { bg: '#ffffff', bgSecondary: '#f6f8fa', accent: '#808080' },
  },
]

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const translations: Record<Language, Record<string, string>> = {
  'zh-CN': {
    // Navigation
    'nav.search': '搜索文档',
    'nav.scan': '扫描目录',
    'nav.settings': '界面设置',
    'nav.guide': '关于',
    'nav.language': '语言与主题',
    // Search page
    'search.placeholder': '输入关键词搜索文件名或内容...',
    'search.btn': '搜索',
    'search.searching': '搜索中...',
    'search.noQuery': '请在上方输入关键词进行搜索',
    'search.noResult': '未找到匹配的文件',
    'search.result': '找到 {count} 个文件',
    // File list table headers
    'filelist.name': '文件名',
    'filelist.type': '类型',
    'filelist.size': '大小',
    'filelist.modified': '修改时间',
    // Nav group labels
    'nav.group.nav': '导航',
    'nav.group.settings': '设置',
    'nav.group.help': '帮助',
    'search.noQueryHint': '请输入关键词搜索',
    'search.historyTab': '搜索历史',
    'search.savedTab': '已保存',
    'search.historyEmpty': '暂无搜索历史',
    'search.savedEmpty': '暂无保存的搜索',
    'search.clearHistory': '清空历史',
    'search.saveCurrent': '保存当前搜索',
    'search.deleteSaved': '删除',
    'search.saveNamePlaceholder': '输入名称保存搜索',
    'search.filters': '过滤器',
    'search.syntaxHelp': '搜索语法',
    'search.syntaxAnd': '多关键词AND搜索',
    'search.syntaxPhrase': '精确短语匹配',
    'search.syntaxPrefix': '前缀通配符',
    'search.syntaxOr': 'OR组合搜索',
    'search.syntaxNot': '排除关键词',
    'search.regexMode': '正则搜索模式',
    'search.regexDesc': '使用 /正则表达式/ 进行正则搜索',
    'search.filterType': '文件类型',
    'search.filterSize': '文件大小',
    'search.filterDate': '修改日期',
    'search.sizeMin': '最小',
    'search.sizeMax': '最大',
    'search.clearFilters': '清除',
    'search.applyFilters': '应用',
    'search.dropHint': '松开开始搜索',
    'search.extracting': '正在提取内容...',
    // File detail
    'detail.info': '文件信息',
    'detail.size': '大小',
    'detail.type': '类型',
    'detail.modified': '修改',
    'detail.md5': 'MD5',
    'detail.preview': '内容预览',
    'detail.noContent': '无内容',
    'detail.showInFolder': '在文件夹中显示',
    'detail.openFile': '打开文件',
    // Scan page
    'scan.title': '扫描目录',
    'scan.scanning': '扫描中...',
    'scan.phase.scanning': '扫描文件',
    'scan.phase.indexing': '建立索引',
    'scan.phase.hashing': '计算哈希',
    'scan.phase.complete': '完成',
    'scan.phase.processing': '处理中',
    'scan.preparing': '准备中...',
    'scan.startScan': '开始扫描',
    // Config / Scan page
    'config.title': '扫描设置',
    'config.loading': '加载中...',
    'config.scanDirs': '扫描目录',
    'config.dirCount': '{count} 个目录',
    'config.addDir': '添加目录',
    'config.noFolders': '还没有配置任何扫描目录',
    'config.addHint': '点击「添加目录」开始配置',
    'config.totalSize': '总大小:',
    'config.incrementalScan': '增量扫描',
    'config.fullScan': '完整扫描',
    'config.delete': '删除',
    'config.deleteConfirm': '确定要删除 "{name}" 的扫描记录吗？这不会删除实际文件。',
    'config.never': '从未',
    'config.files': '个文件',
    'config.lastFullScan': '完整扫描',
    'config.lastScan': '上次扫描',
    // Settings page
    'settings.title': '设置',
    'settings.tab.appearance': '外观',
    'settings.tab.window': '窗口行为',
    'settings.placeholder': '后续实现...',
    'settings.theme': '主题',
    'settings.themeLabel': '界面主题',
    'settings.themeDesc': '选择浅色或深色主题',
    'settings.light': '浅色',
    'settings.dark': '深色',
    'settings.language': '语言',
    'settings.languageLabel': '界面语言',
    'settings.languageDesc': '选择应用界面显示的语言',
    // Guide page
    'guide.title': '关于',
    'guide.overview': '概述',
    'guide.overviewDesc': 'DocSeeker 是一款高效的本地文档全文搜索工具，基于 Electron + SQLite FTS5 + BM25 构建，支持 AND/OR/NOT/正则/前缀等多种搜索语法，按相关性排序。所有数据存储在本地，隐私安全。支持以下文档格式的全文索引与搜索：Word · Excel · PowerPoint · PDF · Text/MD/JSON/CSV · RTF · CHM · ODF · EPUB · ZIP · Email · WPS',
    'guide.formats': '支持的格式',
    'guide.formatsDesc': 'DocSeeker 支持以下文档格式的全文索引与搜索：',
    'guide.feature1': '全文搜索：基于 SQLite FTS5 + BM25 相关性排序，支持 AND/OR/NOT/前缀等多种搜索语法',
    'guide.feature2': '高级过滤器：按文件类型、大小范围、修改日期精确筛选结果',
    'guide.feature3': '搜索历史 + 保存搜索：快速复用历史查询，命名收藏常用搜索条件',
    'guide.feature4': 'Ctrl+Shift+F 全局快捷键：随时唤起搜索浮层',
    'guide.feature5': '语言 + 主题：简体中文/English，6 种主题随时切换',
    'guide.feature6': '纯本地运行：数据不上传云端，隐私安全',
    'guide.donate': '赞赏作者',
    'guide.donateDesc': '如果觉得好用，欢迎打赏支持一下',
    'guide.version': '版本',
    'guide.devName': '开发者',
    'guide.github': 'GitHub',
    'guide.wechat': '微信支付',
    'guide.alipay': '支付宝',
    // Settings
    'settings.shortcut': '快捷键',
    'settings.globalHotkey': '全局搜索快捷键',
    'settings.globalHotkeyDesc': '按 Ctrl+Shift+F 随时唤起搜索浮层',
    'settings.pressKey': '请按键...',
    'settings.window': '窗口行为',
    'settings.window.autoLaunch': '开机自启',
    'settings.window.autoLaunchDesc': '系统启动时自动运行 DocSeeker',
    'settings.window.minimizeToTray': '关闭时最小化到托盘',
    'settings.window.minimizeToTrayDesc': '点击关闭按钮时隐藏到系统托盘',
    // Theme
    'theme.system': '跟随系统',
    'theme.system.desc': '自动匹配系统亮色/暗色模式',
    // Status bar
    'status.indexed': '已索引 {count} 个文件',
    'status.loading': '正在加载...',
    // Confirm dialog
    'confirm.cancel': '取消',
    'confirm.ok': '确定',
    'confirm.exitTitle': '退出',
    'confirm.exitMsg': '确定要退出 DocSeeker 吗？',
  },
  'en': {
    // Navigation
    'nav.search': 'Search',
    'nav.scan': 'Scan Directory',
    'nav.settings': 'Settings',
    'nav.language': 'Language & Theme',
    'nav.guide': 'About',
    // Search page
    'search.placeholder': 'Search by filename or content...',
    'search.btn': 'Search',
    'search.searching': 'Searching...',
    'search.noQuery': 'Enter a keyword above to search',
    'search.noResult': 'No matching files found',
    'search.result': '{count} files found',
    'search.noQueryHint': 'Enter keywords to search',
    'search.historyTab': 'History',
    'search.savedTab': 'Saved',
    'search.historyEmpty': 'No search history',
    'search.savedEmpty': 'No saved searches',
    'search.clearHistory': 'Clear history',
    'search.saveCurrent': 'Save current search',
    'search.deleteSaved': 'Delete',
    'search.saveNamePlaceholder': 'Enter a name',
    'search.filters': 'Filters',
    'search.syntaxHelp': 'Search Syntax',
    'search.syntaxAnd': 'AND search',
    'search.syntaxPhrase': 'Exact phrase',
    'search.syntaxPrefix': 'Prefix wildcard',
    'search.syntaxOr': 'OR search',
    'search.syntaxNot': 'Exclude keyword',
    'search.regexMode': 'Regex search',
    'search.regexDesc': 'Use /regex pattern/ for regex search',
    'search.filterType': 'File Type',
    'search.filterSize': 'File Size',
    'search.filterDate': 'Modified Date',
    'search.sizeMin': 'Min',
    'search.sizeMax': 'Max',
    'search.clearFilters': 'Clear',
    'search.applyFilters': 'Apply',
    'search.dropHint': 'Drop file to search its content',
    'search.extracting': 'Extracting content...',
    // File list table headers
    'filelist.name': 'File Name',
    'filelist.type': 'Type',
    'filelist.size': 'Size',
    'filelist.modified': 'Modified',
    // Nav group labels
    'nav.group.nav': 'Navigation',
    'nav.group.settings': 'Settings',
    'nav.group.help': 'Help',
    // File detail
    'detail.info': 'File Info',
    'detail.size': 'Size',
    'detail.type': 'Type',
    'detail.modified': 'Modified',
    'detail.md5': 'MD5',
    'detail.preview': 'Content Preview',
    'detail.noContent': 'No content',
    'detail.showInFolder': 'Show in Folder',
    'detail.openFile': 'Open File',
    // Scan page
    'scan.title': 'Scan Directory',
    'scan.scanning': 'Scanning...',
    'scan.phase.scanning': 'Scanning files',
    'scan.phase.indexing': 'Building index',
    'scan.phase.hashing': 'Computing hash',
    'scan.phase.complete': 'Complete',
    'scan.phase.processing': 'Processing',
    'scan.preparing': 'Preparing...',
    'scan.startScan': 'Start Scan',
    // Config / Scan page
    'config.title': 'Scan Settings',
    'config.loading': 'Loading...',
    'config.scanDirs': 'Scanned Directories',
    'config.dirCount': '{count} directories',
    'config.addDir': 'Add Directory',
    'config.noFolders': 'No directories configured yet',
    'config.addHint': 'Click "Add Directory" to get started',
    'config.totalSize': 'Total size:',
    'config.incrementalScan': 'Incremental Scan',
    'config.fullScan': 'Full Scan',
    'config.delete': 'Delete',
    'config.deleteConfirm': 'Are you sure you want to delete the scan records for "{name}"? Actual files will not be deleted.',
    'config.never': 'Never',
    'config.files': 'files',
    'config.lastFullScan': 'Full Scan',
    'config.lastScan': 'Last Scan',
    // Settings page
    'settings.title': 'Settings',
    'settings.tab.appearance': 'Appearance',
    'settings.tab.window': 'Window Behavior',
    'settings.placeholder': 'Coming soon...',
    'settings.theme': 'Theme',
    'settings.themeLabel': 'Interface Theme',
    'settings.themeDesc': 'Choose light or dark theme',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.language': 'Language',
    'settings.languageLabel': 'Interface Language',
    'settings.languageDesc': 'Choose the display language for the app interface',
    // Guide page
    'guide.title': 'About',
    'guide.overview': 'Overview',
    'guide.overviewDesc': 'DocSeeker is an efficient local full-text search tool built on Electron + SQLite FTS5 + BM25, supporting AND/OR/NOT/regex/prefix search with relevance ranking. All data stored locally for privacy. Indexes and searches: Word · Excel · PowerPoint · PDF · Text/MD/JSON/CSV · RTF · CHM · ODF · EPUB · ZIP · Email · WPS',
    'guide.formats': 'Supported Formats',
    'guide.formatsDesc': 'DocSeeker indexes and searches the following document formats:',
    'guide.features': 'Key Features',
    'guide.feature1': 'Full-text search: SQLite FTS5 + BM25 relevance ranking, supports AND/OR/NOT/prefix syntax',
    'guide.feature2': 'Advanced filters: Filter by file type, size range, and modification date',
    'guide.feature3': 'Search history & saved searches: Quick access to history, named saved searches',
    'guide.feature4': 'Global hotkey: Press Ctrl+Shift+F anywhere to open the search popup',
    'guide.feature5': 'Language + Theme: zh-CN/English with 6 themes to choose from',
    'guide.feature6': 'Pure local: No cloud upload, complete privacy',
    'guide.donate': 'Donate',
    'guide.donateDesc': 'If you find this tool useful, your support is appreciated',
    'guide.version': 'Version',
    'guide.devName': 'Developer',
    'guide.github': 'GitHub',
    'guide.wechat': 'WeChat Pay',
    'guide.alipay': 'Alipay',
    // Settings
    'settings.shortcut': 'Shortcuts',
    'settings.globalHotkey': 'Global Search Hotkey',
    'settings.globalHotkeyDesc': 'Press Ctrl+Shift+F anywhere to open the search popup',
    'settings.pressKey': 'Press a key...',
    'settings.window': 'Window Behavior',
    'settings.window.autoLaunch': 'Start with System',
    'settings.window.autoLaunchDesc': 'Launch DocSeeker automatically when Windows starts',
    'settings.window.minimizeToTray': 'Minimize to Tray on Close',
    'settings.window.minimizeToTrayDesc': 'Hide to system tray instead of closing when clicking the close button',
    // Status bar
    'status.indexed': '{count} files indexed',
    'status.loading': 'Loading...',
    // Theme
    'theme.switch': 'Switch theme',
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
    'theme.system': 'System',
    'theme.system.desc': 'Follow OS light/dark mode',
    // Confirm dialog
    'confirm.cancel': 'Cancel',
    'confirm.ok': 'OK',
    'confirm.exitTitle': 'Exit',
    'confirm.exitMsg': 'Are you sure you want to exit DocSeeker?',
  }
}

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('language') as Language) || 'zh-CN'
  })

  const [theme, setThemeState] = useState<ThemeId>(() => {
    return (localStorage.getItem('theme') as ThemeId) || 'light'
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  useEffect(() => {
    if (theme === 'system') {
      const applySystemTheme = () => {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      }
      applySystemTheme()
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applySystemTheme)
      return () => mq.removeEventListener('change', applySystemTheme)
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  const t = (key: string): string => {
    return translations[language][key] || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, theme, setTheme, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
