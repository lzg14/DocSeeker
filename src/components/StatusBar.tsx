import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    // Try to get file count from preload API
    if (window.electron.getStats) {
      window.electron.getStats().then((stats: { fileCount: number }) => {
        setFileCount(stats.fileCount)
      }).catch(() => {
        // Fallback: set to null to show placeholder
      })
    }
  }, [])

  return (
    <div className="status-bar">
      <span>DocSeeker v1.0.0</span>
      <span>
        {fileCount !== null
          ? t('status.indexed').replace('{count}', fileCount.toLocaleString())
          : t('status.loading')}
      </span>
    </div>
  )
}

export default StatusBar
