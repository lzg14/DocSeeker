import { useState, useEffect } from 'react'
import { FileRecord } from '../types'

interface DuplicateFinderProps {
  formatSize: (bytes: number) => string
}

function DuplicateFinder({ formatSize }: DuplicateFinderProps): JSX.Element {
  const [duplicates, setDuplicates] = useState<FileRecord[][]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDeleteFile = async (filePath: string): Promise<void> => {
    if (confirmDelete !== filePath) {
      setConfirmDelete(filePath)
      return
    }
    // Confirm delete
    try {
      const success = await window.electron.deleteFile(filePath)
      if (success) {
        setDuplicates(prev => prev.map(group =>
          group.filter(f => f.path !== filePath)
        ).filter(group => group.length > 1))
      }
    } catch (error) {
      console.error('Failed to delete file:', error)
    } finally {
      setConfirmDelete(null)
    }
  }

  const loadDuplicates = useEffect(() => {
    const fetchDuplicates = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const result = await window.electron.findDuplicates()
        setDuplicates(result)
      } catch (error) {
        console.error('Failed to find duplicates:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDuplicates()
  }, [])

  const toggleGroup = (hash: string): void => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(hash)) {
      newExpanded.delete(hash)
    } else {
      newExpanded.add(hash)
    }
    setExpandedGroups(newExpanded)
  }

  const handleShowInFolder = (filePath: string): void => {
    window.electron.showInFolder(filePath)
  }

  const handleOpenFile = (filePath: string): void => {
    window.electron.openFile(filePath)
  }

  if (isLoading) {
    return (
      <div className="duplicate-finder">
        <div className="loading">正在查找重复文件...</div>
      </div>
    )
  }

  if (duplicates.length === 0) {
    return (
      <div className="duplicate-finder">
        <div className="empty-state">
          <p>未发现重复文件</p>
        </div>
      </div>
    )
  }

  return (
    <div className="duplicate-finder">
      <div className="duplicate-header">
        <h3>重复文件组 ({duplicates.length} 组)</h3>
      </div>

      <div className="duplicate-list">
        {duplicates.map((group, groupIndex) => {
          const hash = group[0]?.hash || `group-${groupIndex}`
          const isExpanded = expandedGroups.has(hash)

          return (
            <div key={hash} className="duplicate-group">
              <div
                className="duplicate-group-header"
                onClick={() => toggleGroup(hash)}
              >
                <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                <span className="group-info">
                  {group.length} 个重复文件 | {formatSize(group[0]?.size || 0)} | 哈希: {hash}
                </span>
              </div>

              {isExpanded && (
                <div className="duplicate-files">
                  {group.map((file, fileIndex) => (
                    <div key={file.id || fileIndex} className="duplicate-file">
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-path" title={file.path}>
                          {file.path}
                        </span>
                      </div>
                      <div className="file-actions">
                        <button
                          className="btn btn-small"
                          onClick={() => handleShowInFolder(file.path)}
                        >
                          显示
                        </button>
                        <button
                          className="btn btn-small"
                          onClick={() => handleOpenFile(file.path)}
                        >
                          打开
                        </button>
                        <button
                          className={`btn btn-small ${confirmDelete === file.path ? 'btn-danger' : ''}`}
                          onClick={() => handleDeleteFile(file.path)}
                          onBlur={() => setConfirmDelete(null)}
                        >
                          {confirmDelete === file.path ? '确认删除' : '删除'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DuplicateFinder
