import { useState, useEffect, useCallback } from 'react'
import { ScannedFolder } from '../types'
import { useAppContext } from '../context/AppContext'

const WEEKDAYS = [
  { value: 'monday', label: '周一' },
  { value: 'tuesday', label: '周二' },
  { value: 'wednesday', label: '周三' },
  { value: 'thursday', label: '周四' },
  { value: 'friday', label: '周五' },
  { value: 'saturday', label: '周六' },
  { value: 'sunday', label: '周日' }
]

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, '0')}:00`
)

interface ScheduleConfig {
  enabled: boolean
  day: string
  time: string
}

function ConfigPage(): JSX.Element {
  const [folders, setFolders] = useState<ScannedFolder[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    enabled: false,
    day: 'monday',
    time: '09:00'
  })
  const { refreshKey, isScanning } = useAppContext()

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.electron.getScannedFolders()
      setFolders(result)

      // 从第一个启用了定时扫描的文件夹读取配置作为全局配置
      const enabledFolder = result.find(f => f.schedule_enabled === 1)
      if (enabledFolder) {
        setScheduleConfig({
          enabled: true,
          day: enabledFolder.schedule_day || 'monday',
          time: enabledFolder.schedule_time || '09:00'
        })
      }
    } catch (error) {
      console.error('Failed to load scanned folders:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders, refreshKey])

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

  // 更新所有文件夹的定时设置
  const handleScheduleChange = async (enabled: boolean): Promise<void> => {
    try {
      const newConfig = {
        enabled,
        day: scheduleConfig.day,
        time: scheduleConfig.time
      }
      setScheduleConfig(newConfig)

      // 更新所有文件夹的定时配置
      for (const folder of folders) {
        await window.electron.updateFolderSchedule(
          folder.id!,
          enabled,
          newConfig.day,
          newConfig.time
        )
      }
    } catch (error) {
      console.error('Failed to update schedule:', error)
    }
  }

  const handleDayChange = async (day: string): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, day }
      setScheduleConfig(newConfig)

      if (scheduleConfig.enabled) {
        for (const folder of folders) {
          await window.electron.updateFolderSchedule(
            folder.id!,
            true,
            day,
            newConfig.time
          )
        }
      }
    } catch (error) {
      console.error('Failed to update schedule day:', error)
    }
  }

  const handleTimeChange = async (time: string): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, time }
      setScheduleConfig(newConfig)

      if (scheduleConfig.enabled) {
        for (const folder of folders) {
          await window.electron.updateFolderSchedule(
            folder.id!,
            true,
            newConfig.day,
            time
          )
        }
      }
    } catch (error) {
      console.error('Failed to update schedule time:', error)
    }
  }

  const handleIncrementalScan = async (folder: ScannedFolder) => {
    try {
      await window.electron.incrementalScan(folder.path)
      await loadFolders()
    } catch (error) {
      console.error('Failed to run incremental scan:', error)
    }
  }

  const handleFullRescan = async (folder: ScannedFolder) => {
    try {
      await window.electron.fullRescan(folder.path)
      await loadFolders()
    } catch (error) {
      console.error('Failed to run full rescan:', error)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const dirPath = await window.electron.selectDirectory()
    if (dirPath) {
      try {
        await window.electron.addScannedFolder(dirPath)
        await loadFolders()
      } catch (error) {
        console.error('Failed to add folder:', error)
      }
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

  const handleScanAll = async () => {
    if (!confirm('确定要对所有目录进行增量扫描吗？')) {
      return
    }
    for (const folder of folders) {
      await handleIncrementalScan(folder)
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <h2 className="page-title">配置</h2>
        <div className="loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">配置</h2>
      {/* 全局定时设置 */}
      <div className="schedule-global">
        <h3>定时增量扫描</h3>
        <div className="schedule-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={scheduleConfig.enabled}
              onChange={(e) => handleScheduleChange(e.target.checked)}
              disabled={isScanning || folders.length === 0}
            />
            启用定时扫描
          </label>

          {scheduleConfig.enabled && (
            <div className="schedule-options">
              <select
                value={scheduleConfig.day}
                onChange={(e) => handleDayChange(e.target.value)}
                disabled={isScanning}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <select
                value={scheduleConfig.time}
                onChange={(e) => handleTimeChange(e.target.value)}
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

      {/* 文件夹列表 */}
      <div className="config-header">
        <h2>扫描目录</h2>
        <div className="config-header-actions">
          <span className="folder-count">{folders.length} 个目录</span>
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleScanAll}
            disabled={isScanning || folders.length === 0}
          >
            扫描全部
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleAddFolder}
            disabled={isScanning}
          >
            添加目录
          </button>
        </div>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state">
          <p>还没有配置任何扫描目录</p>
          <p>点击「添加目录」开始配置</p>
        </div>
      ) : (
        <div className="folder-list">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`folder-item ${expandedId === folder.id ? 'expanded' : ''}`}
            >
              <div
                className="folder-header"
                onClick={() => setExpandedId(expandedId === folder.id ? null : folder.id!)}
              >
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

                  <div className="action-buttons">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleIncrementalScan(folder)}
                      disabled={isScanning}
                    >
                      增量扫描
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleFullRescan(folder)}
                      disabled={isScanning}
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

export default ConfigPage
