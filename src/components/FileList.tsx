import { useState } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'

interface FileListProps {
  files: FileRecord[]
  selectedFile: FileRecord | null
  onSelectFile: (file: FileRecord) => void
  formatSize: (bytes: number) => string
  hasSearched: boolean
  snippets?: Record<number, string>
}

type SortField = 'name' | 'size' | 'updated_at'
type SortOrder = 'asc' | 'desc'

function FileList({ files, selectedFile, onSelectFile, formatSize, hasSearched, snippets = {} }: FileListProps): JSX.Element {
  const { t } = useLanguage()
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

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
                  <span className="file-name-text" title={file.path}>
                    {file.name}
                  </span>
                  {snippets[file.id!] && (
                    <span
                      className="file-snippet"
                      dangerouslySetInnerHTML={{ __html: snippets[file.id!] }}
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
