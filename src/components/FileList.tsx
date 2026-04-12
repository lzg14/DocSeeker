import { useState } from 'react'
import { FileRecord } from '../types'

interface FileListProps {
  files: FileRecord[]
  selectedFile: FileRecord | null
  onSelectFile: (file: FileRecord) => void
  formatSize: (bytes: number) => string
  hasSearched: boolean
}

type SortField = 'name' | 'size' | 'updated_at'
type SortOrder = 'asc' | 'desc'

function FileList({ files, selectedFile, onSelectFile, formatSize, hasSearched }: FileListProps): JSX.Element {
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
      default:
        return '📁'
    }
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  // 未搜索时显示空白
  if (!hasSearched) {
    return (
      <div className="file-list-container">
        <div className="empty-state">
          <p>请在上方输入关键词进行搜索</p>
        </div>
      </div>
    )
  }

  // 搜索无结果
  if (files.length === 0) {
    return (
      <div className="file-list-container">
        <div className="empty-state">
          <p>未找到匹配的文件</p>
        </div>
      </div>
    )
  }

  return (
    <div className="file-list-container">
      <table className="file-list">
        <thead>
          <tr>
            <th className="col-icon"></th>
            <th className="col-name sortable" onClick={() => handleSort('name')}>
              文件名 {sortField === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
            </th>
            <th className="col-type">类型</th>
            <th className="col-size sortable" onClick={() => handleSort('size')}>
              大小 {sortField === 'size' && (sortOrder === 'asc' ? '▲' : '▼')}
            </th>
            <th className="col-date sortable" onClick={() => handleSort('updated_at')}>
              修改时间 {sortField === 'updated_at' && (sortOrder === 'asc' ? '▲' : '▼')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file) => (
            <tr
              key={file.id}
              className={selectedFile?.id === file.id ? 'selected' : ''}
              onClick={() => onSelectFile(file)}
            >
              <td className="col-icon">{getFileIcon(file.file_type)}</td>
              <td className="col-name" title={file.path}>
                {file.name}
              </td>
              <td className="col-type">{file.file_type || '-'}</td>
              <td className="col-size">{formatSize(file.size)}</td>
              <td className="col-date">{formatDate(file.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default FileList
