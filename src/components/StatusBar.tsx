import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useAppContext } from '../context/AppContext'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const { t } = useLanguage()
  const { isScanning, scanProgress, refreshKey } = useAppContext()

  const loadStats = () => {
    window.electron.getFileCount().then((count: number) => {
      setFileCount(count)
    }).catch(() => {
      setFileCount(-1)
    })
  }

  useEffect(() => {
    loadStats()
  }, [refreshKey])

  useEffect(() => {
    const timer = setInterval(loadStats, 5000)
    return () => clearInterval(timer)
  }, [])

  if (isScanning) {
    const percent = scanProgress.total > 0
      ? Math.min(Math.round((scanProgress.current / scanProgress.total) * 100), 100)
      : 0
    return (
      <div className="status-bar status-bar--scanning">
        <span>{t('scan.scanning')} {percent}%</span>
        <span className="scan-file-name" title={scanProgress.currentFile}>
          {scanProgress.currentFile || t('scan.preparing')}
        </span>
      </div>
    )
  }

  return (
    <div className="status-bar">
      <span>DocSeeker v1.0.0</span>
      <span>
        {fileCount !== null && fileCount >= 0
          ? t('status.indexed').replace('{count}', fileCount.toLocaleString())
          : ''}
      </span>
    </div>
  )
}

export default StatusBar
