import { useEffect, useState } from 'react'

interface UpdateInfo {
  status: string
  version?: string
  error?: string
}

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const cleanup = window.electron.onUpdateStatus((info) => {
      setUpdateInfo(info)
      setVisible(true)
      // Auto-hide for non-actionable statuses
      if (info.status === 'checking' || info.status === 'up-to-date') {
        setTimeout(() => setVisible(false), 3000)
      }
    })
    return cleanup
  }, [])

  if (!visible || !updateInfo) return null

  const handleDownload = () => {
    window.electron.downloadUpdate()
  }

  const handleDismiss = () => {
    setVisible(false)
  }

  const statusLabels: Record<string, string> = {
    checking: '正在检查更新...',
    available: `发现新版本 v${updateInfo.version}`,
    'up-to-date': '已是最新版本',
    downloading: '正在下载更新...',
    downloaded: `更新 v${updateInfo.version} 已下载`,
    error: `检查失败: ${updateInfo.error}`,
  }

  const label = statusLabels[updateInfo.status] || updateInfo.status

  const isError = updateInfo.status === 'error'
  const isAvailable = updateInfo.status === 'available'
  const isDownloading = updateInfo.status === 'downloading'
  const isDownloaded = updateInfo.status === 'downloaded'

  return (
    <div className="update-notification" data-type={isError ? 'error' : 'info'}>
      <span className="update-notification-label">{label}</span>
      <div className="update-notification-actions">
        {isAvailable && (
          <button className="btn-primary" onClick={handleDownload}>
            下载
          </button>
        )}
        {isDownloaded && (
          <button className="btn-primary" onClick={() => window.electron.quitAndInstall()}>
            立即重启安装
          </button>
        )}
        {isDownloading && <span className="update-notification-spinner" />}
        <button className="btn-ghost" onClick={handleDismiss}>
          关闭
        </button>
      </div>
    </div>
  )
}
