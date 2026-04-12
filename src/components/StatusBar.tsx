import { useEffect, useState } from 'react'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)

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
        {fileCount !== null ? `已索引 ${fileCount.toLocaleString()} 个文件` : '正在加载...'}
      </span>
    </div>
  )
}

export default StatusBar
