import { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'

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
    if (!confirm('确定要取消扫描吗？')) {
      return
    }
    await cancelScan()
  }

  const getPhaseText = (phase: string): string => {
    switch (phase) {
      case 'scanning':
        return '扫描文件'
      case 'indexing':
        return '建立索引'
      case 'hashing':
        return '计算哈希'
      case 'complete':
        return '完成'
      default:
        return '处理中'
    }
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">扫描管理</h2>

      <div className="scan-controls-section">
        <button
          className="btn btn-primary btn-large"
          onClick={handleSelectDirectory}
          disabled={isScanning}
        >
          {isScanning ? '扫描中...' : '选择目录并扫描'}
        </button>
      </div>

      {isScanning && (
        <div className="scan-progress-section">
          <div className="progress-status">
            <span className="phase">{getPhaseText(scanProgress.phase)}</span>
            <span className="file-count">
              {scanProgress.total > 0
                ? `${scanProgress.current} / ${scanProgress.total}`
                : '准备中...'}
            </span>
          </div>

          <div className="current-file">
            <span className="label">当前文件:</span>
            <span className="path" title={scanProgress.currentFile}>
              {scanProgress.currentFile || '准备中...'}
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
                className={`btn ${isPaused ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handlePauseResume}
              >
                {isPaused ? '继续' : '暂停'}
              </button>
              <button
                className="btn btn-danger"
                onClick={handleCancel}
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {!isScanning && (
        <div className="scan-tips">
          {lastResult ? (
            <div className="scan-complete-info">
              <p>扫描完成，共处理 <strong>{lastResult.filesProcessed}</strong> 个文件</p>
              <p>数据已保存到数据库，可在「搜索」页面进行搜索</p>
            </div>
          ) : (
            <div>
              <h3>使用说明</h3>
              <ul>
                <li>点击「选择目录并扫描」按钮，选择要扫描的文件夹</li>
                <li>扫描完成后，数据会自动保存到数据库</li>
                <li>可在「配置」页面管理已扫描的目录</li>
                <li>可在「搜索」页面搜索已扫描的文件</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScanPage
