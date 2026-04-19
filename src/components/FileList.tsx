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
}

type SortField = 'name' | 'size' | 'updated_at' | 'relevance'
type SortOrder = 'asc' | 'desc'

function FileList({ files, selectedFile, onSelectFile, formatSize, hasSearched, snippets = {} }: FileListProps): JSX.Element {
  const { t } = useLanguage()
  const [sortField, setSortField] = useState<SortField>('relevance')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, file: null })
  const menuRef = useRef<HTMLDivElement>(null)

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

  const handleSort = (field: SortField): void => {
    if (field === 'relevance') return // relevance 不允许排序
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedFiles = [...files].sort((a, b) => {
    if (sortField === 'relevance') return 0 // 保持原始顺序（BM25 相关性排序）
    let comparison = 0
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'size':
        comparison = a.size - b.size
        break
      case 'updated_at':
        comparison = (a.updated_at || '').localeCompare(b.updated_at || '')
        break
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

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

  return (
    <div className="file-list-wrapper">
      {!hasSearched ? (
        <div className="file-list-empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div>{t('search.noQuery')}</div>
        </div>
      ) : files.length === 0 ? (
        <div className="file-list-empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div>{t('search.noResult')}</div>
        </div>
      ) : (
        <>
          <div className="file-table-header">
            <div>{t('filelist.name')}</div>
            <div>{t('filelist.type')}</div>
            <div>{t('filelist.size')}</div>
            <div>{t('filelist.modified')}</div>
          </div>
          {sortedFiles.map((file) => (
            <div
              key={file.id}
              className={`file-row ${selectedFile?.id === file.id ? 'selected' : ''}`}
              onClick={() => onSelectFile(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <div className="file-name-cell">
                <span>{getFileIcon(file.is_supported === false ? 'unsupported' : file.file_type)}</span>
                <div className="file-name-info">
                  <span className="file-name-text" title={file.path}>
                    {file.name}
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
      )}

      {contextMenu.visible && contextMenu.file && (
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
      )}
    </div>
  )
}

export default FileList
