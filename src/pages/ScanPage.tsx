import { useState, useEffect, useCallback } from 'react'
import { ScannedFolder } from '../types'
import { useAppContext } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, '0')}:00`
)

interface ScheduleConfig {
  enabled: boolean
  day: string
  time: string
}

function ScanPage(): JSX.Element {
  const {
    isScanning,
    isPaused,
    scanProgress,
    pauseScan,
    resumeScan,
    cancelScan,
    triggerRefresh
  } = useAppContext()
  const { t } = useLanguage()

  const [folders, setFolders] = useState<ScannedFolder[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastResult, setLastResult] = useState<{ filesProcessed: number; errors: number } | null>(null)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    enabled: false,
    day: 'monday',
    time: '09:00'
  })

  const WEEKDAYS = [
    { value: 'monday', label: t('weekday.monday') },
    { value: 'tuesday', label: t('weekday.tuesday') },
    { value: 'wednesday', label: t('weekday.wednesday') },
    { value: 'thursday', label: t('weekday.thursday') },
    { value: 'friday', label: t('weekday.friday') },
    { value: 'saturday', label: t('weekday.saturday') },
    { value: 'sunday', label: t('weekday.sunday') }
  ]

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.electron.getScannedFolders()
      setFolders(result)

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
  }, [loadFolders])

  // 扫描完成时保留结果
  useEffect(() => {
    if (scanProgress.phase === 'complete' && scanProgress.total > 0) {
      setLastResult({ filesProcessed: scanProgress.total, errors: 0 })
    }
  }, [scanProgress.phase, scanProgress.total])

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return t('config.never')
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

  // 选择目录并扫描（添加目录后自动执行首次扫描）
  const handleSelectDirectory = useCallback(async (): Promise<void> => {
    setLastResult(null)
    const dirPath = await window.electron.selectDirectory()
    if (dirPath) {
      try {
        // 添加文件夹到扫描列表
        await window.electron.addScannedFolder(dirPath)
        // 执行扫描
        const result = await window.electron.scanDirectory(dirPath)
        console.log('Scan result:', result)
        // 更新文件夹记录
        await window.electron.updateFolderAfterScan(dirPath, result)
        // 刷新列表
        await loadFolders()
        triggerRefresh()
      } catch (error) {
        console.error('Scan failed:', error)
      }
    }
  }, [loadFolders, triggerRefresh])

  const handlePauseResume = async (): Promise<void> => {
    if (isPaused) {
      await resumeScan()
    } else {
      await pauseScan()
    }
  }

  const handleCancel = async (): Promise<void> => {
    if (!confirm(t('scan.cancelConfirm'))) {
      return
    }
    await cancelScan()
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
    const msg = t('config.deleteConfirm').replace('{name}', folder.name)
    if (!confirm(msg)) {
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
    if (!confirm(t('config.scanAllConfirm'))) {
      return
    }
    for (const folder of folders) {
      await handleIncrementalScan(folder)
    }
  }

  const handleScheduleChange = async (enabled: boolean): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, enabled }
      setScheduleConfig(newConfig)

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

  const getPhaseText = (phase: string): string => {
    return t(`scan.phase.${phase}` as any) || t('scan.phase.processing')
  }

  if (loading) {
    return (
      <div className="settings-page">
        <h2 className="page-title">{t('scan.title')}</h2>
        <div className="loading">{t('config.loading')}</div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('scan.title')}</h2>

      {/* 扫描操作区 */}
      <div className="scan-controls-section">
        <button
          className="search-btn"
          onClick={handleSelectDirectory}
          disabled={isScanning}
        >
          {isScanning ? t('scan.scanning') : t('scan.selectDir')}
        </button>
      </div>

      {/* 扫描进度 */}
      {isScanning && (
        <div className="scan-progress-section">
          <div className="progress-status">
            <span className="phase">{getPhaseText(scanProgress.phase)}</span>
            <span className="file-count">
              {scanProgress.total > 0
                ? `${scanProgress.current} / ${scanProgress.total}`
                : t('scan.preparing')}
            </span>
          </div>

          <div className="current-file">
            <span className="label">{t('scan.currentFile')}</span>
            <span className="path" title={scanProgress.currentFile}>
              {scanProgress.currentFile || t('scan.preparing')}
            </span>
          </div>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: scanProgress.total > 0
                  ? `${Math.min((scanProgress.current / scanProgress.total) * 100, 100)}%`
                  : '0%'
              }}
            />
          </div>

          {scanProgress.phase !== 'complete' && (
            <div className="scan-action-buttons">
              <button
                className="detail-btn-secondary"
                onClick={handlePauseResume}
              >
                {isPaused ? t('scan.resume') : t('scan.pause')}
              </button>
              <button
                className="detail-btn-secondary"
                onClick={handleCancel}
              >
                {t('scan.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 扫描完成提示 */}
      {!isScanning && lastResult && (
        <div className="scan-tips">
          <div className="scan-complete-info">
            <p>{t('scan.complete').replace('{count}', lastResult.filesProcessed.toString())}</p>
            <p>{t('scan.completeHint')}</p>
          </div>
        </div>
      )}

      {/* 定时设置 */}
      <div className="schedule-global">
        <h3>{t('config.schedule')}</h3>
        <div className="schedule-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={scheduleConfig.enabled}
              onChange={(e) => handleScheduleChange(e.target.checked)}
              disabled={isScanning || folders.length === 0}
            />
            {t('config.scheduleEnable')}
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
        <h3>{t('config.scanDirs')}</h3>
        <div className="config-header-actions">
          <span className="folder-count">{t('config.dirCount').replace('{count}', folders.length.toString())}</span>
          <button
            className="detail-btn-secondary"
            onClick={handleScanAll}
            disabled={isScanning || folders.length === 0}
          >
            {t('config.scanAll')}
          </button>
          <button
            className="search-btn"
            onClick={handleAddFolder}
            disabled={isScanning}
          >
            {t('config.addDir')}
          </button>
        </div>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state">
          <p>{t('config.noFolders')}</p>
          <p>{t('config.addHint')}</p>
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
                  <span className="file-count">{folder.file_count || 0} {t('config.files')}</span>
                  <span className="last-scan">{formatDate(folder.last_scan_at)}</span>
                </div>
              </div>

              {expandedId === folder.id && (
                <div className="folder-details">
                  <div className="detail-row">
                    <span>{t('config.totalSize')}</span>
                    <span>{formatSize(folder.total_size)}</span>
                  </div>

                  <div className="action-buttons">
                    <button
                      className="detail-btn-secondary"
                      onClick={() => handleIncrementalScan(folder)}
                      disabled={isScanning}
                    >
                      {t('config.incrementalScan')}
                    </button>
                    <button
                      className="detail-btn-secondary"
                      onClick={() => handleFullRescan(folder)}
                      disabled={isScanning}
                    >
                      {t('config.fullScan')}
                    </button>
                    <button
                      className="detail-btn-secondary"
                      onClick={() => handleDelete(folder)}
                      disabled={isScanning}
                    >
                      {t('config.delete')}
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

export default ScanPage
