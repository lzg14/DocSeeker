import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useAppContext } from '../context/AppContext'
import { themes } from '../context/LanguageContext'
import type { ThemeId } from '../context/LanguageContext'

function StatusBar(): JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [monitorStatus, setMonitorStatus] = useState<{ enabled: boolean; dirs: string[] }>({ enabled: false, dirs: [] })
  const { t: translate, theme, setTheme } = useLanguage()
  const { isScanning, scanProgress, refreshKey } = useAppContext()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
  }, [])

  useEffect(() => {
    const unsub = window.electron.onUsnUpdate(() => {
      window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
    })
    return unsub
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
        {/* 主题快捷切换 */}
        <div className="statusbar-theme-switcher" ref={menuRef}>
          <button
            className="theme-dot-btn"
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            title={translate('theme.switch')}
            style={{ '--dot-color': themes.find(th => th.id === theme)?.preview.accent || '#2563eb' } as React.CSSProperties}
          >
            <span className="theme-dot" />
          </button>
          {themeMenuOpen && (
            <div className="theme-menu">
              {themes.map((themeItem) => (
                <button
                  key={themeItem.id}
                  className={`theme-option ${theme === themeItem.id ? 'active' : ''}`}
                  onClick={() => {
                    setTheme(themeItem.id)
                    setThemeMenuOpen(false)
                  }}
                >
                  <span
                    className="theme-option-dot"
                    style={{ background: themeItem.preview.accent }}
                  />
                  {translate(themeItem.labelKey)}
                  {theme === themeItem.id && <span className="check-icon">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StatusBar
