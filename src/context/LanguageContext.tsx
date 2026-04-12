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
    'nav.scan': '扫描文件',
    'nav.config': '扫描设置',
    'nav.language': '语言设置',
    'nav.guide': '使用说明',
    'nav.about': '开发者联系',
    // Search page
    'search.placeholder': '输入关键词搜索文件名或内容...',
    'search.btn': '搜索',
    'search.searching': '搜索中...',
    'search.noQuery': '请在上方输入关键词进行搜索',
    'search.noResult': '未找到匹配的文件',
    'search.result': '找到 {count} 个文件',
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
    'scan.title': '扫描文件',
    'scan.selectDir': '选择目录并扫描',
    'scan.scanning': '扫描中...',
    'scan.phase.scanning': '扫描文件',
    'scan.phase.indexing': '建立索引',
    'scan.phase.hashing': '计算哈希',
    'scan.phase.complete': '完成',
    'scan.phase.processing': '处理中',
    'scan.currentFile': '当前文件:',
    'scan.preparing': '准备中...',
    'scan.pause': '暂停',
    'scan.resume': '继续',
    'scan.cancel': '取消',
    'scan.cancelConfirm': '确定要取消扫描吗？',
    'scan.complete': '扫描完成，共处理 {count} 个文件',
    'scan.completeHint': '数据已保存到数据库，可在「搜索」页面进行搜索',
    'scan.tips.title': '使用说明',
    'scan.tips.1': '点击「选择目录并扫描」按钮，选择要扫描的文件夹',
    'scan.tips.2': '扫描完成后，数据会自动保存到数据库',
    'scan.tips.3': '可在「设置」页面管理已扫描的目录',
    'scan.tips.4': '可在「搜索」页面搜索已扫描的文件',
    // Config page
    'config.title': '扫描设置',
    'config.loading': '加载中...',
    'config.schedule': '定时增量扫描',
    'config.scheduleEnable': '启用定时扫描',
    'config.scanDirs': '扫描目录',
    'config.dirCount': '{count} 个目录',
    'config.scanAll': '扫描全部',
    'config.addDir': '添加目录',
    'config.noFolders': '还没有配置任何扫描目录',
    'config.addHint': '点击「添加目录」开始配置',
    'config.totalSize': '总大小:',
    'config.incrementalScan': '增量扫描',
    'config.fullScan': '完整扫描',
    'config.delete': '删除',
    'config.deleteConfirm': '确定要删除 "{name}" 的扫描记录吗？这不会删除实际文件。',
    'config.scanAllConfirm': '确定要对所有目录进行增量扫描吗？',
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
    'guide.title': '使用说明',
    'guide.intro': '功能介绍',
    'guide.introDesc': 'DocSeeker 是一款高效的本地文档搜索工具，支持全文搜索和定时扫描功能。',
    'guide.features': '主要功能',
    'guide.feature1': '全文搜索：支持搜索文件名和文件内容（docx、xlsx、pdf、txt 等格式）',
    'guide.feature2': '定时扫描：可配置定时任务，自动增量扫描指定文件夹',
    'guide.feature3': '重复文件检测：通过 MD5 哈希快速找出重复文件',
    'guide.feature4': '多文件夹管理：支持同时管理多个扫描目录',
    'guide.steps': '使用步骤',
    'guide.step1': '在「设置」中添加要扫描的文件夹',
    'guide.step2': '在「扫描文件」页面执行首次全量扫描',
    'guide.step3': '根据需要开启定时扫描，自动保持索引更新',
    'guide.step4': '在「搜索」页面输入关键词查找文档',
    'guide.step5': '点击搜索结果可在右侧预览文件，点击「在文件夹中显示」定位文件',
    'guide.faq': '常见问题',
    'guide.faq1.q': '为什么搜索不到新添加的文件？',
    'guide.faq1.a': '请在「扫描文件」页面执行扫描操作，建立文件索引后即可搜索。',
    'guide.faq2.q': '定时扫描不生效？',
    'guide.faq2.a': '请确保应用保持运行状态，定时扫描功能需要在应用启动时才能触发。',
    // About page
    'about.title': '关于 DocSeeker',
    'about.version': '版本 1.0.0',
    'about.desc': '个人长期积累文档的搜索工具，支持全文搜索、定时扫描、重复文件检测等功能。',
    'about.contact': '联系方式',
    'about.email': '电子邮件',
    'about.emailAddr': 'docseeker@example.com',
    'about.github': 'GitHub',
    'about.githubAddr': 'github.com/docseeker/docseeker',
    'about.license': '许可证',
    'about.licenseText': '本项目基于 MIT 许可证开源。',
    // Status bar
    'status.indexed': '已索引 {count} 个文件',
    'status.loading': '正在加载...',
    // Weekdays
    'weekday.monday': '周一',
    'weekday.tuesday': '周二',
    'weekday.wednesday': '周三',
    'weekday.thursday': '周四',
    'weekday.friday': '周五',
    'weekday.saturday': '周六',
    'weekday.sunday': '周日',
  },
  'en': {
    // Navigation
    'nav.search': 'Search',
    'nav.scan': 'Scan Files',
    'nav.config': 'Scan Settings',
    'nav.language': 'Language & Theme',
    'nav.guide': 'Guide',
    'nav.about': 'About',
    // Search page
    'search.placeholder': 'Search by filename or content...',
    'search.btn': 'Search',
    'search.searching': 'Searching...',
    'search.noQuery': 'Enter a keyword above to search',
    'search.noResult': 'No matching files found',
    'search.result': '{count} files found',
    'search.noQueryHint': 'Enter keywords to search',
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
    'scan.title': 'Scan Files',
    'scan.selectDir': 'Select Directory & Scan',
    'scan.scanning': 'Scanning...',
    'scan.phase.scanning': 'Scanning files',
    'scan.phase.indexing': 'Building index',
    'scan.phase.hashing': 'Computing hash',
    'scan.phase.complete': 'Complete',
    'scan.phase.processing': 'Processing',
    'scan.currentFile': 'Current file:',
    'scan.preparing': 'Preparing...',
    'scan.pause': 'Pause',
    'scan.resume': 'Resume',
    'scan.cancel': 'Cancel',
    'scan.cancelConfirm': 'Are you sure you want to cancel the scan?',
    'scan.complete': 'Scan complete. {count} files processed.',
    'scan.completeHint': 'Data saved to database. You can search on the Search page.',
    'scan.tips.title': 'How to Use',
    'scan.tips.1': 'Click "Select Directory & Scan" to choose a folder to scan',
    'scan.tips.2': 'After scanning, data is automatically saved to the database',
    'scan.tips.3': 'Manage scanned folders in the Settings page',
    'scan.tips.4': 'Search scanned files on the Search page',
    // Config page
    'config.title': 'Scan Settings',
    'config.loading': 'Loading...',
    'config.schedule': 'Scheduled Incremental Scan',
    'config.scheduleEnable': 'Enable scheduled scan',
    'config.scanDirs': 'Scanned Directories',
    'config.dirCount': '{count} directories',
    'config.scanAll': 'Scan All',
    'config.addDir': 'Add Directory',
    'config.noFolders': 'No directories configured yet',
    'config.addHint': 'Click "Add Directory" to get started',
    'config.totalSize': 'Total size:',
    'config.incrementalScan': 'Incremental Scan',
    'config.fullScan': 'Full Scan',
    'config.delete': 'Delete',
    'config.deleteConfirm': 'Are you sure you want to delete the scan records for "{name}"? Actual files will not be deleted.',
    'config.scanAllConfirm': 'Run incremental scan on all directories?',
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
    'guide.title': 'User Guide',
    'guide.intro': 'Overview',
    'guide.introDesc': 'DocSeeker is an efficient local document search tool with full-text search and scheduled scanning.',
    'guide.features': 'Key Features',
    'guide.feature1': 'Full-text search: Search by filename or content (docx, xlsx, pdf, txt, etc.)',
    'guide.feature2': 'Scheduled scan: Configure automatic incremental scans for selected folders',
    'guide.feature3': 'Duplicate detection: Find duplicate files quickly using MD5 hash',
    'guide.feature4': 'Multi-folder support: Manage multiple scan directories simultaneously',
    'guide.steps': 'Getting Started',
    'guide.step1': 'Add folders to scan in the Settings page',
    'guide.step2': 'Run an initial full scan on the Scan Files page',
    'guide.step3': 'Enable scheduled scan if needed to keep the index up to date',
    'guide.step4': 'Search for documents using keywords on the Search page',
    'guide.step5': 'Preview files on the right panel. Click "Show in Folder" to locate the file.',
    'guide.faq': 'FAQ',
    'guide.faq1.q': 'Why can\'t I find newly added files?',
    'guide.faq1.a': 'Run a scan on the Scan Files page first. Files are only searchable after being indexed.',
    'guide.faq2.q': 'Scheduled scan is not working?',
    'guide.faq2.a': 'Make sure the app is running. Scheduled scans only trigger when the app is active.',
    // About page
    'about.title': 'About DocSeeker',
    'about.version': 'Version 1.0.0',
    'about.desc': 'Personal document search tool with full-text search, scheduled scanning, and duplicate detection.',
    'about.contact': 'Contact',
    'about.email': 'Email',
    'about.emailAddr': 'docseeker@example.com',
    'about.github': 'GitHub',
    'about.githubAddr': 'github.com/docseeker/docseeker',
    'about.license': 'License',
    'about.licenseText': 'Open source under the MIT License.',
    // Status bar
    'status.indexed': '{count} files indexed',
    'status.loading': 'Loading...',
    // Weekdays
    'weekday.monday': 'Monday',
    'weekday.tuesday': 'Tuesday',
    'weekday.wednesday': 'Wednesday',
    'weekday.thursday': 'Thursday',
    'weekday.friday': 'Friday',
    'weekday.saturday': 'Saturday',
    'weekday.sunday': 'Sunday',
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
