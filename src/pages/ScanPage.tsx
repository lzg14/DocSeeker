import { useState, useEffect, useCallback } from 'react'
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
  const [lastResult, setLastResult] = useState<{ filesProcessed: number; errors: number } | null>(null)

  // 扫描完成时保留结果
  useEffect(() => {
    if (scanProgress.phase === 'complete' && scanProgress.total > 0) {
      setLastResult({ filesProcessed: scanProgress.total, errors: 0 })
    }
  }, [scanProgress.phase, scanProgress.total])

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

        // 触发配置页刷新
        triggerRefresh()
      } catch (error) {
        console.error('Scan failed:', error)
      }
    }
  }, [triggerRefresh])

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

  const getPhaseText = (phase: string): string => {
    return t(`scan.phase.${phase}` as any) || t('scan.phase.processing')
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

      {!isScanning && (
        <div className="scan-tips">
          {lastResult ? (
            <div className="scan-complete-info">
              <p>{t('scan.complete').replace('{count}', lastResult.filesProcessed.toString())}</p>
              <p>{t('scan.completeHint')}</p>
            </div>
          ) : (
            <div>
              <h3>{t('scan.tips.title')}</h3>
              <ul>
                <li>{t('scan.tips.1')}</li>
                <li>{t('scan.tips.2')}</li>
                <li>{t('scan.tips.3')}</li>
                <li>{t('scan.tips.4')}</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScanPage
