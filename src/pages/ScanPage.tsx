import { useState, useEffect, useCallback } from 'react'
import { ScannedFolder } from '../types'
import { useAppContext } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'
import DeleteFolderConfirmDialog from '../components/DeleteFolderConfirmDialog'
import { formatSize } from '../utils/format'

function ScanPage(): JSX.Element {
  const {
    isScanning,
    triggerRefresh
  } = useAppContext()
  const { t } = useLanguage()

  const [folders, setFolders] = useState<ScannedFolder[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<ScannedFolder | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [includeSystem, setIncludeSystem] = useState(false)
  const [totalFiles, setTotalFiles] = useState<number>(0)

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.electron.getScannedFolders()
      setFolders(result)
      // Get total file count from shards
      const count = await window.electron.getFileCount()
      setTotalFiles(count)
    } catch (error) {
      console.error('Failed to load scanned folders:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  // Load scan settings (includeHidden, includeSystem)
  useEffect(() => {
    window.electron.getScanSettings().then((settings: any) => {
      if (settings) {
        setIncludeHidden(settings.includeHidden ?? false)
        setIncludeSystem(settings.includeSystem ?? false)
      }
    })
  }, [])

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
    setConfirmDelete(folder)
  }

  const handleToggleHidden = async (checked: boolean) => {
    setIncludeHidden(checked)
    await window.electron.updateScanSettings({ includeHidden: checked })
  }

  const handleToggleSystem = async (checked: boolean) => {
    setIncludeSystem(checked)
    await window.electron.updateScanSettings({ includeSystem: checked })
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await window.electron.deleteScannedFolder(confirmDelete.id!)
      await loadFolders()
    } catch (error) {
      console.error('Failed to delete folder:', error)
    } finally {
      setIsDeleting(false)
    }
    setConfirmDelete(null)
  }

  const handleStartScan = async (): Promise<void> => {
    if (folders.length === 0) return
    for (const folder of folders) {
      // eslint-disable-next-line no-await-in-loop
      await handleIncrementalScan(folder)
    }
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
      <div className="scan-header">
        <div className="scan-header-left">
          <h2 className="page-title">{t('scan.title')}</h2>
          {folders.length > 0 && (
            <span className="config-header-summary">
              {folders.length} {t('config.dirCount').replace('{count}', '')} · {totalFiles.toLocaleString()} {t('config.files')}
            </span>
          )}
        </div>
        <div className="scan-header-toggles">
          <label className="scan-toggle">
            <span className="scan-toggle-label">{t('scan.includeHidden')}</span>
            <input
              type="checkbox"
              className="scan-toggle-input"
              checked={includeHidden}
              onChange={(e) => handleToggleHidden(e.target.checked)}
            />
            <span className="scan-toggle-switch" />
          </label>
          <label className="scan-toggle">
            <span className="scan-toggle-label">{t('scan.includeSystem')}</span>
            <input
              type="checkbox"
              className="scan-toggle-input"
              checked={includeSystem}
              onChange={(e) => handleToggleSystem(e.target.checked)}
            />
            <span className="scan-toggle-switch" />
          </label>
        </div>
        <div className="config-header-actions">
          <button
            className="btn btn-primary"
            onClick={handleAddFolder}
            disabled={isScanning}
          >
            {t('config.addDir')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleStartScan}
            disabled={isScanning || folders.length === 0}
          >
            {t('scan.startScan')}
          </button>
        </div>
      </div>

      <div className="scan-content">
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
                    {folder.last_full_scan_at ? (
                      <span className="last-scan full-scan" title={t('config.lastFullScan')}>
                        {t('config.lastFullScan')} {formatDate(folder.last_full_scan_at)}
                      </span>
                    ) : (
                      <span className="last-scan" title={t('config.lastScan')}>
                        {t('config.lastScan')} {formatDate(folder.last_scan_at)}
                      </span>
                    )}
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
                        className="btn btn-secondary"
                        onClick={() => handleIncrementalScan(folder)}
                        disabled={isScanning}
                      >
                        {t('config.incrementalScan')}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleFullRescan(folder)}
                        disabled={isScanning}
                      >
                        {t('config.fullScan')}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => setConfirmDelete(folder)}
                        disabled={isScanning || isDeleting}
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

      {confirmDelete && (
        <DeleteFolderConfirmDialog
          folder={confirmDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

export default ScanPage
