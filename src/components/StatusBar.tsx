import { useState, useEffect, useCallback, useRef } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useAppContext } from '../context/AppContext'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [monitorStatus, setMonitorStatus] = useState<{ enabled: boolean; dirs: string[] }>({ enabled: false, dirs: [] })
  const { t: translate } = useLanguage()
  const { isScanning, scanProgress, refreshKey } = useAppContext()
  const refreshKeyRef = useRef(refreshKey)
  refreshKeyRef.current = refreshKey

  const loadStats = useCallback(() => {
    window.electron.getFileCount().then((count: number) => {
      setFileCount(count)
    }).catch(() => {
      setFileCount(-1)
    })
  }, [])

  useEffect(() => {
    loadStats()
  }, [refreshKey, loadStats])

  useEffect(() => {
    const timer = setInterval(() => {
      loadStats()
    }, 5000)
    return () => clearInterval(timer)
  }, [loadStats])

  useEffect(() => {
    window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
  }, [])

  useEffect(() => {
    const unsub = window.electron.onUsnUpdate(() => {
      window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
    })
    return unsub
  }, [])

  if (isScanning) {
    const percent = scanProgress.total > 0
      ? Math.min(Math.round((scanProgress.current / scanProgress.total) * 100), 100)
      : 0
    return (
      <div className="status-bar status-bar--scanning">
        <span>{translate('scan.scanning')} {percent}%</span>
        {scanProgress.phase === 'scanning' && scanProgress.total > 0 && (
          <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>
            已发现 {scanProgress.total.toLocaleString()} 个文件
          </span>
        )}
        <span className="scan-file-name" title={scanProgress.currentFile}>
          {scanProgress.currentFile || translate('scan.preparing')}
        </span>
      </div>
    )
  }

  return (
    <div className="status-bar">
      <span>DocSeeker v1.1.0</span>
      <div className="statusbar-right">
        <span>
          {fileCount !== null && fileCount >= 0
            ? translate('status.indexed').replace('{count}', fileCount.toLocaleString())
            : ''}
        </span>
        {monitorStatus.enabled && (
          <span className="status-monitor" title={monitorStatus.dirs.join(', ')}>
            🔴 {translate('status.monitoring')}
          </span>
        )}
        {!monitorStatus.enabled && (
          <span className="status-monitor-off">⚫ {translate('status.monitorOff')}</span>
        )}
      </div>
    </div>
  )
}

export default StatusBar
