import { FileRecord } from '../types'

interface FileDetailProps {
  file: FileRecord
  formatSize: (bytes: number) => string
}

function FileDetail({ file, formatSize }: FileDetailProps): JSX.Element {
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
        <div className="detail-card-title">文件信息</div>
        <div className="detail-grid">
          <div className="detail-grid-item">
            <div className="detail-grid-label">大小</div>
            <div className="detail-grid-value">{formatSize(file.size)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">类型</div>
            <div className="detail-grid-value">{file.file_type || '-'}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">修改</div>
            <div className="detail-grid-value">{formatDate(file.updated_at)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">MD5</div>
            <div className="detail-grid-value detail-hash">
              {file.hash ? `${file.hash.slice(0, 8)}...${file.hash.slice(-4)}` : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-title">内容预览</div>
        <div className="detail-content-preview">
          {file.content
            ? file.content.slice(0, 500) + (file.content.length > 500 ? '...' : '')
            : '无内容'}
        </div>
      </div>

      <div className="detail-actions">
        <button className="detail-btn-primary" onClick={handleShowInFolder}>
          在文件夹中显示
        </button>
        <button className="detail-btn-secondary" onClick={handleOpenFile}>
          打开文件
        </button>
      </div>
    </div>
  )
}

export default FileDetail
