import React, { createContext, useContext, useState, ReactNode } from 'react'

type Language = 'zh-CN' | 'en'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const translations: Record<Language, Record<string, string>> = {
  'zh-CN': {
    // Navigation
    'nav.search': '搜索文档',
    'nav.scan': '扫描目录',
    'nav.language': '语言与主题',
    'nav.guide': '关于',
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
    // Language page
    'lang.title': '语言与主题设置',
    'lang.theme': '主题',
    'lang.themeLabel': '界面主题',
    'lang.themeDesc': '选择浅色或深色主题',
    'lang.light': '浅色',
    'lang.dark': '深色',
    'lang.language': '语言',
    'lang.languageLabel': '界面语言',
    'lang.languageDesc': '选择应用界面显示的语言',
    // Guide page
    'guide.title': '关于',
    'guide.intro': '关于',
    'guide.introDesc': 'DocSeeker 是一款高效的本地文档搜索工具，支持全文检索。',
    'guide.overview': '概述',
    'guide.overviewDesc': 'DocSeeker 是一款高效的本地文档搜索工具，基于 Electron + SQLite 构建，支持全文检索，所有数据存储在本地，隐私安全。',
    'guide.features': '主要功能',
    'guide.feature1': '全文搜索：支持 docx、xlsx、pdf、txt 等格式的文件名和内容搜索',
    'guide.feature2': '多文件夹管理：支持同时管理多个扫描目录',
    'guide.feature3': '增量扫描：仅扫描新增或修改的文件，快速更新索引',
    'guide.feature4': '完整扫描：重新扫描所有文件，确保索引完整准确',
    'guide.feature5': '本地优先：所有数据存储在本地，不上传云端，隐私安全',
    'guide.donate': '赞赏作者',
    'guide.donateDesc': '如果觉得好用，欢迎打赏支持一下',
    'guide.devName': '开发者',
    'guide.wechat': '微信支付',
    'guide.alipay': '支付宝',
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
    // Language page
    'lang.title': 'Language & Theme',
    'lang.theme': 'Theme',
    'lang.themeLabel': 'Interface Theme',
    'lang.themeDesc': 'Choose light or dark theme',
    'lang.light': 'Light',
    'lang.dark': 'Dark',
    'lang.language': 'Language',
    'lang.languageLabel': 'Interface Language',
    'lang.languageDesc': 'Choose the display language for the app interface',
    // Guide page
    'guide.title': 'About',
    'guide.intro': 'About',
    'guide.introDesc': 'DocSeeker is an efficient local document search tool with full-text search.',
    'guide.overview': 'Overview',
    'guide.overviewDesc': 'DocSeeker is an efficient local document search tool built on Electron + SQLite, supporting full-text search. All data is stored locally for privacy and security.',
    'guide.features': 'Key Features',
    'guide.feature1': 'Full-text search: Search by filename or content (docx, xlsx, pdf, txt, etc.)',
    'guide.feature2': 'Multi-folder support: Manage multiple scan directories simultaneously',
    'guide.feature3': 'Incremental scan: Scan only new or modified files to update the index quickly',
    'guide.feature4': 'Full scan: Rescan all files to ensure the index is complete and accurate',
    'guide.feature5': 'Local-first: All data stored locally, no cloud upload, privacy-safe',
    'guide.donate': 'Donate',
    'guide.donateDesc': 'If you find this tool useful, your support is appreciated',
    'guide.devName': 'Developer',
    'guide.wechat': 'WeChat Pay',
    'guide.alipay': 'Alipay',
    // Status bar
    'status.indexed': '{count} files indexed',
    'status.loading': 'Loading...',
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

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const t = (key: string): string => {
    return translations[language][key] || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
