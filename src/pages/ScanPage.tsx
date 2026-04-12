import { useState, useEffect, useCallback } from 'react'
import { ScannedFolder } from '../types'
import { useAppContext } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'

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

  const handleSelectDirectory = useCallback(async (): Promise<void> => {
    setLastResult(null)
    const dirPath = await window.electron.selectDirectory()
    if (dirPath) {
      try {
        await window.electron.addScannedFolder(dirPath)
        const result = await window.electron.scanDirectory(dirPath)
        console.log('Scan result:', result)
        await window.electron.updateFolderAfterScan(dirPath, result)
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

      <div className="scan-controls-section">
        <button
          className="search-btn"
          onClick={handleSelectDirectory}
          disabled={isScanning}
        >
          {isScanning ? t('scan.scanning') : t('scan.selectDir')}
        </button>
      </div>

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

      {!isScanning && lastResult && (
        <div className="scan-tips">
          <div className="scan-complete-info">
            <p>{t('scan.complete').replace('{count}', lastResult.filesProcessed.toString())}</p>
            <p>{t('scan.completeHint')}</p>
          </div>
        </div>
      )}

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
