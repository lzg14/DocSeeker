import { useState, useEffect } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { renderPdfPage } from '../utils/pdfRender'

interface FileDetailProps {
  file: FileRecord
  formatSize: (bytes: number) => string
}

function FileDetail({ file, formatSize }: FileDetailProps): JSX.Element {
  const { t } = useLanguage()
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  const handleShowInFolder = () => window.electron.showInFolder(file.path)
  const handleOpenFile = () => window.electron.openFile(file.path)

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  // Load thumbnail when file path changes (image via main, PDF via renderer)
  useEffect(() => {
    setThumbnail(null)
    if (!file?.path) return

    const ext = file.path.split('.').pop()?.toLowerCase()

    if (ext === 'pdf') {
      // PDF: check cache first, then render if miss
      window.electron.thumbCacheGet(file.path).then(cached => {
        if (cached) {
          setThumbnail(cached)
          return
        }
        // Cache miss → render with pdfjs-dist
        renderPdfPage(file.path, 1, 1.5).then(dataUrl => {
          if (dataUrl) {
            setThumbnail(dataUrl)
            // Write back to cache
            window.electron.thumbCacheSet(file.path, dataUrl)
          }
        })
      })
    } else {
      // Images and other: go through main process
      window.electron.thumbnailGet(file.path).then(data => {
        if (data) setThumbnail(data)
      })
    }
  }, [file?.path])

  return (
    <div className="file-detail">
      {thumbnail && (
        <div className="file-thumbnail-container">
          <img src={thumbnail} alt="preview" className="file-thumbnail-img" />
        </div>
      )}

      <div className="file-detail-name">
        <span>{file.name}</span>
      </div>
      <div className="file-detail-path">{file.path}</div>

      <div className="detail-card">
        <div className="detail-card-title">{t('detail.info')}</div>
        <div className="detail-grid">
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.size')}</div>
            <div className="detail-grid-value">{formatSize(file.size)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.type')}</div>
            <div className="detail-grid-value">{file.file_type || '-'}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.modified')}</div>
            <div className="detail-grid-value">{formatDate(file.updated_at)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.md5')}</div>
            <div className="detail-grid-value detail-hash">
              {file.hash ? `${file.hash.slice(0, 8)}...${file.hash.slice(-4)}` : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-title">{t('detail.preview')}</div>
        <div className="detail-content-preview">
          {file.content
            ? file.content.slice(0, 500) + (file.content.length > 500 ? '...' : '')
            : t('detail.noContent')}
        </div>
      </div>

      <div className="detail-actions">
        <button className="btn btn-primary" onClick={handleShowInFolder}>
          {t('detail.showInFolder')}
        </button>
        <button className="btn btn-secondary" onClick={handleOpenFile}>
          {t('detail.openFile')}
        </button>
      </div>
    </div>
  )
}

export default FileDetail
