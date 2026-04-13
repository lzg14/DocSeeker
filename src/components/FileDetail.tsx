import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'

interface FileDetailProps {
  file: FileRecord
  formatSize: (bytes: number) => string
}

function FileDetail({ file, formatSize }: FileDetailProps): JSX.Element {
  const { t } = useLanguage()

  const handleShowInFolder = () => window.electron.showInFolder(file.path)
  const handleOpenFile = () => window.electron.openFile(file.path)

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div className="file-detail">
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
