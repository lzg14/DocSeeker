import { useState, useRef, useCallback } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'

interface FileListProps {
  files: FileRecord[]
  selectedFile: FileRecord | null
  onSelectFile: (file: FileRecord) => void
  formatSize: (bytes: number) => string
  hasSearched: boolean
  snippets?: Record<number, string>
  thumbnails?: Record<number, string>
}

type SortField = 'name' | 'size' | 'updated_at'
type SortOrder = 'asc' | 'desc'

const THUMBNAIL_TYPES = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico'])

function supportsThumbnail(file: FileRecord): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return THUMBNAIL_TYPES.has(ext) || THUMBNAIL_TYPES.has(file.file_type || '')
}

function FileList({ files, selectedFile, onSelectFile, formatSize, hasSearched, snippets = {}, thumbnails = {} }: FileListProps): JSX.Element {
  const { t } = useLanguage()
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const thumbnailCache = useRef<Record<number, string>>({})
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedFiles = [...files].sort((a, b) => {
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
      default:
        return '📁'
    }
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  const handleMouseEnter = useCallback(async (file: FileRecord) => {
    if (!supportsThumbnail(file) || file.id === undefined) return
    if (thumbnailCache.current[file.id!] || thumbnails[file.id!]) return
    hoverTimer.current = setTimeout(async () => {
      try {
        const data = await window.electron.getThumbnail(file.path)
        if (data && file.id !== undefined) {
          thumbnailCache.current[file.id!] = data
          setHoveredId(file.id!)
        }
      } catch {
        // ignore
      }
    }, 300)
  }, [thumbnails])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHoveredId(null)
  }, [])

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
            >
              <div className="file-name-cell">
                <span>{getFileIcon(file.file_type)}</span>
                <div className="file-name-info">
                  <span
                    className="file-name-text"
                    title={file.path}
                    onMouseEnter={() => handleMouseEnter(file)}
                    onMouseLeave={handleMouseLeave}
                    style={{ cursor: supportsThumbnail(file) ? 'pointer' : 'default' }}
                  >
                    {file.name}
                    {supportsThumbnail(file) && (
                      <span className="thumbnail-trigger" title="Preview">
                        &#128247;
                      </span>
                    )}
                  </span>
                  {snippets[file.id!] && (
                    <span
                      className="file-snippet"
                      dangerouslySetInnerHTML={{ __html: snippets[file.id!] }}
                    />
                  )}
                  {(hoveredId === file.id && (thumbnailCache.current[file.id!] || thumbnails[file.id!])) && (
                    <img
                      className="thumbnail-preview"
                      src={thumbnailCache.current[file.id!] || thumbnails[file.id!]}
                      alt="thumbnail"
                      onMouseEnter={() => handleMouseEnter(file)}
                      onMouseLeave={handleMouseLeave}
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
    </div>
  )
}

export default FileList
