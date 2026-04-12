import { useState, useEffect, useCallback } from 'react'

interface ScannedFolder {
  id?: number
  path: string
  name: string
  last_scan_at?: string
  file_count?: number
  total_size?: number
  schedule_enabled?: number
  schedule_day?: string | null
  schedule_time?: string | null
}

interface ScannedFoldersProps {
  onSelectFolder: (folderPath: string) => void
  isScanning: boolean
  currentFolder: string | null
}

const WEEKDAYS = [
  { value: 'monday', label: '周一' },
  { value: 'tuesday', label: '周二' },
  { value: 'wednesday', label: '周三' },
  { value: 'thursday', label: '周四' },
  { value: 'friday', label: '周五' },
  { value: 'saturday', label: '周六' },
  { value: 'sunday', label: '周日' }
]

const TIME_OPTIONS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
]

function ScannedFolders({ onSelectFolder, isScanning, currentFolder }: ScannedFoldersProps): JSX.Element {
  const [folders, setFolders] = useState<ScannedFolder[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.electron.getScannedFolders()
      setFolders(result)
    } catch (error) {
      console.error('Failed to load scanned folders:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '从未'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleScheduleChange = async (folder: ScannedFolder, enabled: boolean, day: string | null, time: string | null) => {
    try {
      await window.electron.updateFolderSchedule(folder.id!, enabled, day, time)
      await loadFolders()
    } catch (error) {
      console.error('Failed to update schedule:', error)
    }
  }

  const handleIncrementalScan = async (folder: ScannedFolder) => {
    if (isScanning) return
    onSelectFolder(folder.path)
    try {
      await window.electron.incrementalScan(folder.path)
      await loadFolders()
    } catch (error) {
      console.error('Failed to run incremental scan:', error)
    }
  }

  const handleFullRescan = async (folder: ScannedFolder) => {
    if (isScanning) return
    onSelectFolder(folder.path)
    try {
      await window.electron.fullRescan(folder.path)
      await loadFolders()
    } catch (error) {
      console.error('Failed to run full rescan:', error)
    }
  }

  const handleDelete = async (folder: ScannedFolder) => {
    if (!confirm(`确定要删除 "${folder.name}" 的扫描记录吗？这不会删除实际文件。`)) {
      return
    }
    try {
      await window.electron.deleteScannedFolder(folder.id!)
      await loadFolders()
    } catch (error) {
      console.error('Failed to delete folder:', error)
    }
  }

  if (loading) {
    return <div className="scanned-folders">加载中...</div>
  }

  return (
    <div className="scanned-folders">
      <div className="scanned-folders-header">
        <h3>已扫描文件夹</h3>
        <span className="folder-count">{folders.length} 个</span>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state">
          还没有扫描过任何文件夹
        </div>
      ) : (
        <div className="folder-list">
          {folders.map((folder) => (
            <div key={folder.id} className={`folder-item ${expandedId === folder.id ? 'expanded' : ''} ${currentFolder === folder.path ? 'active' : ''}`}>
              <div className="folder-header" onClick={() => setExpandedId(expandedId === folder.id ? null : folder.id!)}>
                <div className="folder-info">
                  <span className="folder-name">{folder.name}</span>
                  <span className="folder-path" title={folder.path}>{folder.path}</span>
                </div>
                <div className="folder-meta">
                  <span className="file-count">{folder.file_count || 0} 个文件</span>
                  <span className="last-scan">{formatDate(folder.last_scan_at)}</span>
                </div>
              </div>

              {expandedId === folder.id && (
                <div className="folder-details">
                  <div className="detail-row">
                    <span>总大小:</span>
                    <span>{formatSize(folder.total_size)}</span>
                  </div>

                  <div className="schedule-section">
                    <h4>定时扫描</h4>
                    <div className="schedule-controls">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={folder.schedule_enabled === 1}
                          onChange={(e) => handleScheduleChange(folder, e.target.checked, folder.schedule_day || 'monday', folder.schedule_time || '09:00')}
                          disabled={isScanning}
                        />
                        启用定时扫描
                      </label>

                      {folder.schedule_enabled === 1 && (
                        <div className="schedule-options">
                          <select
                            value={folder.schedule_day || 'monday'}
                            onChange={(e) => handleScheduleChange(folder, true, e.target.value, folder.schedule_time || '09:00')}
                            disabled={isScanning}
                          >
                            {WEEKDAYS.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                          <select
                            value={folder.schedule_time || '09:00'}
                            onChange={(e) => handleScheduleChange(folder, true, folder.schedule_day || 'monday', e.target.value)}
                            disabled={isScanning}
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="action-buttons">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleIncrementalScan(folder)}
                      disabled={isScanning}
                      title="仅扫描新增或修改的文件"
                    >
                      增量扫描
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleFullRescan(folder)}
                      disabled={isScanning}
                      title="重新扫描所有文件"
                    >
                      完整扫描
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(folder)}
                      disabled={isScanning}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ScannedFolders
