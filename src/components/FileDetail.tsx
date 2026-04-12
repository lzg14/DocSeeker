import { FileRecord } from '../types'

interface FileDetailProps {
  file: FileRecord
  formatSize: (bytes: number) => string
}

function FileDetail({ file, formatSize }: FileDetailProps): JSX.Element {
  const handleShowInFolder = (): void => {
    window.electron.showInFolder(file.path)
  }

  const handleOpenFile = (): void => {
    window.electron.openFile(file.path)
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  const truncateContent = (content: string | null, maxLength: number = 500): string => {
    if (!content) return '无内容'
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  return (
    <div className="file-detail">
      <div className="file-detail-header">
        <h3>文件详情</h3>
        <div className="file-actions">
          <button className="btn btn-small" onClick={handleShowInFolder}>
            在文件夹中显示
          </button>
          <button className="btn btn-small" onClick={handleOpenFile}>
            打开文件
          </button>
        </div>
      </div>

      <div className="file-detail-content">
        <div className="detail-row">
          <label>文件名:</label>
          <span>{file.name}</span>
        </div>

        <div className="detail-row">
          <label>完整路径:</label>
          <span className="path" title={file.path}>
            {file.path}
          </span>
        </div>

        <div className="detail-row">
          <label>文件大小:</label>
          <span>{formatSize(file.size)}</span>
        </div>

        <div className="detail-row">
          <label>文件类型:</label>
          <span>{file.file_type || '-'}</span>
        </div>

        <div className="detail-row">
          <label>MD5 哈希:</label>
          <span className="hash">{file.hash || '-'}</span>
        </div>

        <div className="detail-row">
          <label>创建时间:</label>
          <span>{formatDate(file.created_at)}</span>
        </div>

        <div className="detail-row">
          <label>更新时间:</label>
          <span>{formatDate(file.updated_at)}</span>
        </div>

        <div className="detail-row content-row">
          <label>文件内容:</label>
          <pre className="content-preview">{truncateContent(file.content)}</pre>
        </div>
      </div>
    </div>
  )
}

export default FileDetail
