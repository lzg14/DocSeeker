import { useState, useEffect, useRef } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  file: FileRecord | null
}

interface FileListProps {
  files: FileRecord[]
  selectedFile: FileRecord | null
  onSelectFile: (file: FileRecord) => void
  formatSize: (bytes: number) => string
  hasSearched: boolean
  snippets?: Record<string, string>
  selectedFiles: Set<number>
  onToggleSelect: (fileId: number) => void
  onSelectAll: (select: boolean) => void
  searchQuery?: string  // 搜索关键词，用于高亮文件名
}

function FileList({
  files,
  selectedFile,
  onSelectFile,
  formatSize,
  hasSearched,
  snippets = {},
  selectedFiles,
  onToggleSelect,
  onSelectAll,
  searchQuery = ''
}: FileListProps): JSX.Element {
  const { t } = useLanguage()
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, file: null })
  const menuRef = useRef<HTMLDivElement>(null)

  // 高亮文件名中的搜索词
  const highlightName = (name: string, query: string): React.ReactNode => {
    if (!query.trim()) return name

    // 提取搜索关键词（支持 AND, OR, NOT, 引号等语法）
    const keywords = query
      .replace(/[""]/g, '')  // 移除引号
      .replace(/\b(AND|OR|NOT)\b/gi, ' ')  // 移除布尔操作符
      .trim()
      .split(/\s+/)
      .filter(k => k.length > 0)

    if (keywords.length === 0) return name

    // 构建正则表达式（不区分大小写）
    const pattern = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const regex = new RegExp(`(${pattern})`, 'gi')

    // 分割并高亮
    const parts = name.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} style={{ backgroundColor: 'var(--mark-bg, #fff3cd)', padding: '0 2px' }}>{part}</mark> : part
    )
  }

  // 关闭右键菜单（点击其他区域或滚动时）
  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }))
    const handleScroll = () => setContextMenu(prev => ({ ...prev, visible: false }))
    document.addEventListener('click', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  const handleContextMenu = (e: React.MouseEvent, file: FileRecord) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, file })
  }

  const handleShowInFolder = () => {
    if (contextMenu.file) window.electron.showInFolder(contextMenu.file.path)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const handleOpenFile = () => {
    if (contextMenu.file) window.electron.openFile(contextMenu.file.path)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const handleCopyPath = () => {
    if (contextMenu.file) window.electron.clipboardWriteText(contextMenu.file.path)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const handleCopyName = () => {
    if (contextMenu.file) window.electron.clipboardWriteText(contextMenu.file.name)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const MatchTypeBadge: React.FC<{ matchType?: string }> = ({ matchType }) => {
    if (!matchType) return null
    if (matchType === 'filename') {
      return <span style={{ fontSize: '10px', color: '#888', marginLeft: '4px' }}>📄文件名</span>
    }
    if (matchType === 'content') {
      return <span style={{ fontSize: '10px', color: '#1976d2', marginLeft: '4px' }}>📝内容</span>
    }
    if (matchType === 'both') {
      return <span style={{ fontSize: '10px', color: '#2e7d32', marginLeft: '4px' }}>📄+📝</span>
    }
    return null
  }

  const getFileIcon = (fileType: string | null): string => {
    switch (fileType) {
      case 'docx':
        return '📄'
      case 'xlsx':
        return '📊'
      case 'pptx':
        return '📽️'
      case 'pdf':
        return '📕'
      case 'text':
        return '📝'
      case 'rtf':
        return '📃'
      case 'chm':
        return '📚'
      case 'odf':
        return '📒'
      case 'email':
        return '📧'
      case 'zip':
        return '🗜️'
      case 'unsupported':
        return '❓'
      default:
        return '📁'
    }
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  // 如果还没有搜索，显示提示
  if (!hasSearched) {
    return (
      <div className="file-list-empty">
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
        <div>{t('search.noQuery')}</div>
      </div>
    )
  }

  // 如果没有结果
  if (files.length === 0) {
    return (
      <div className="file-list-empty">
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div>{t('search.noResult')}</div>
      </div>
    )
  }

  // 渲染文件列表（不再包 wrapper，由 SearchPage 决定包装）
  return (
        <>
          <div className="file-table-header">
            <div className="file-checkbox-cell">
              <input
                type="checkbox"
                checked={selectedFiles.size === files.length && files.length > 0}
                ref={(el) => {
                  if (el) el.indeterminate = selectedFiles.size > 0 && selectedFiles.size < files.length
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </div>
            <div>{t('filelist.name')}</div>
            <div>{t('filelist.type')}</div>
            <div>{t('filelist.size')}</div>
            <div>{t('filelist.modified')}</div>
          </div>
          {files.map((file) => (
            <div
              key={file.id}
              className={`file-row ${selectedFile?.id === file.id ? 'selected' : ''} ${selectedFiles.has(file.id!) ? 'checked' : ''}`}
              onClick={() => onSelectFile(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <div className="file-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.id!)}
                  onChange={() => file.id && onToggleSelect(file.id)}
                />
              </div>
              <div className="file-name-cell">
                <span>{getFileIcon(file.is_supported === false ? 'unsupported' : file.file_type)}</span>
                <div className="file-name-info">
                  <span className="file-name-text" title={file.path}>
                    {highlightName(file.name, searchQuery)}
                    <MatchTypeBadge matchType={file.match_type} />
                  </span>
                  {snippets[file.path] && (
                    <span
                      className="file-snippet"
                      dangerouslySetInnerHTML={{ __html: snippets[file.path] }}
                    />
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{file.file_type || '-'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatSize(file.size)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(file.updated_at)}</div>
            </div>
          ))}
    </>
  )

  // 右键菜单（始终渲染，由 contextMenu.visible 控制显示）
  if (contextMenu.visible && contextMenu.file) {
  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={e => e.stopPropagation()}
    >
      <div className="context-menu-item" onClick={handleShowInFolder}>
        <span>📁</span> {t('detail.showInFolder')}
      </div>
      <div className="context-menu-item" onClick={handleOpenFile}>
        <span>📂</span> {t('detail.openFile')}
      </div>
      <div className="context-menu-separator" />
      <div className="context-menu-item" onClick={handleCopyPath}>
        <span>📋</span> {t('contextMenu.copyPath')}
      </div>
      <div className="context-menu-item" onClick={handleCopyName}>
        <span>📝</span> {t('contextMenu.copyName')}
      </div>
    </div>
  )
}

return null
}

export default FileList
