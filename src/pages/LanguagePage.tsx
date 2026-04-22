import { useState, useEffect } from 'react'
import { useLanguage, themes } from '../context/LanguageContext'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, theme, setTheme, t } = useLanguage()
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Shift+F')
  const [listening, setListening] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(
    () => localStorage.getItem('minimizeToTray') === 'true'
  )
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false)
  const [contextMenuLoading, setContextMenuLoading] = useState(false)
  const [doubleCtrlEnabled, setDoubleCtrlEnabledLocal] = useState(true)
  const [monitorStatus, setMonitorStatus] = useState<{ status: string; message?: string }>({ status: 'disconnected' })

  useEffect(() => {
    window.electron.getGlobalHotkey().then(h => setCurrentHotkey(formatHotkey(h)))
    window.electron.getAutoLaunch?.().then(setAutoLaunch)
    window.electron.usnGetConfig?.().then(cfg => {
      if (cfg) setMonitorEnabled(cfg.enabled)
    })
    window.electron.isContextMenuRegistered?.().then(setContextMenuEnabled)
    window.electron.getDoubleCtrlEnabled?.().then(setDoubleCtrlEnabledLocal)
    // Get initial monitor status
    window.electron.getMonitorStatus?.().then(setMonitorStatus)
    // Subscribe to status changes
    const unsubscribe = window.electron.onMonitorStatusChanged?.(setMonitorStatus)
    return () => unsubscribe?.()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'monitoring': return '#4caf50' // Green
      case 'connected': return '#8bc34a' // Light green
      case 'connecting': return '#ff9800' // Orange
      case 'error': return '#f44336' // Red
      default: return '#9e9e9e' // Gray
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'monitoring': return t('monitor.monitoring') || '监控中'
      case 'connected': return t('monitor.connected') || '已连接'
      case 'connecting': return t('monitor.connecting') || '连接中...'
      case 'error': return t('monitor.error') || '错误'
      default: return t('monitor.disconnected') || '未连接'
    }
  }

  const handleToggleMonitor = async (checked: boolean) => {
    setMonitorEnabled(checked)
    if (checked) {
      const folders = await window.electron.getScannedFolders?.()
      const dirs = folders ? folders.map((f: { path: string }) => f.path) : []
      await window.electron.usnSetConfig?.({ enabled: true, dirs })
    } else {
      await window.electron.usnSetConfig?.({ enabled: false })
    }
  }

  const handleToggleContextMenu = async () => {
    setContextMenuLoading(true)
    try {
      if (contextMenuEnabled) {
        const result = await window.electron.unregisterContextMenu?.()
        if (result?.success) {
          setContextMenuEnabled(false)
        } else {
          alert(t('settings.contextMenu.unregisterFailed') || 'Failed to unregister')
        }
      } else {
        const result = await window.electron.registerContextMenu?.()
        if (result?.success) {
          setContextMenuEnabled(true)
        } else if (result?.error === 'PERMISSION_DENIED') {
          alert(t('settings.contextMenu.adminWarning') || '需要管理员权限才能修改注册表，请右键选择"以管理员身份运行"')
        } else {
          alert(t('settings.contextMenu.registerFailed') || 'Failed to register')
        }
      }
    } catch (err) {
      console.error('Context menu toggle failed:', err)
    } finally {
      setContextMenuLoading(false)
    }
  }

  const formatHotkey = (hk: string) =>
    hk.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')

  const listenForHotkey = async () => {
    setListening(true)
    setHotkeyError('')
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const modifiers: string[] = []
      if (e.ctrlKey) modifiers.push('CommandOrControl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')
      if (e.metaKey) modifiers.push('Meta')
      const key = e.key
      const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])
      if (MODIFIER_KEYS.has(key)) return
      const finalKey = key.length === 1 ? key.toUpperCase() : key
      if (modifiers.length > 0 && finalKey) {
        const hotkey = [...modifiers, finalKey].join('+')
        window.electron.setGlobalHotkey(hotkey)
        setCurrentHotkey(formatHotkey(hotkey))
        setHotkeyError('')
        setListening(false)
        window.removeEventListener('keydown', handler)
      }
    }
    window.addEventListener('keydown', handler)
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang as 'zh-CN' | 'en')
    document.documentElement.setAttribute('lang', newLang)
  }

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="toggle-switch"
    />
  )

  return (
    <div className="settings-page">
      <div className="settings-group">
        <div className="settings-group-title">{t('settings.theme')}</div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.themeLabel')}</span>
          <div className="theme-cards">
            {themes.map((item) => (
              <button
                key={item.id}
                className={`theme-card ${theme === item.id ? 'active' : ''}`}
                onClick={() => setTheme(item.id)}
                title={t(item.descKey)}
              >
                <div className="theme-card-preview">
                  <div className="theme-preview-bg" style={{ background: item.preview.bg }}>
                    <div className="theme-preview-sidebar" style={{ background: item.preview.bgSecondary }} />
                    <div className="theme-preview-accent" style={{ background: item.preview.accent }} />
                  </div>
                </div>
                <div className="theme-card-label">{t(item.labelKey)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <span className="settings-label">{t('settings.languageLabel')}</span>
          <select
            className="settings-select"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-label-wrap">
            <span className="settings-label">{t('settings.globalHotkey')}</span>
          </div>
          <button
            className="btn btn-secondary hotkey-btn"
            onClick={listenForHotkey}
            disabled={listening}
          >
            {listening ? t('settings.pressKey') : currentHotkey}
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.doubleCtrl')}</span>
          <Toggle checked={doubleCtrlEnabled} onChange={v => {
            setDoubleCtrlEnabledLocal(v)
            window.electron.setDoubleCtrlEnabled?.(v)
          }} />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <span className="settings-label">{t('settings.window.autoLaunch')}</span>
          <Toggle checked={autoLaunch} onChange={v => {
            setAutoLaunch(v)
            window.electron.setAutoLaunch?.(v)
          }} />
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.window.minimizeToTray')}</span>
          <Toggle checked={minimizeToTray} onChange={v => {
            setMinimizeToTray(v)
            localStorage.setItem('minimizeToTray', String(v))
          }} />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-label-wrap">
            <span className="settings-label">{t('settings.enableRealtimeMonitor')}</span>
            <span
              className="monitor-status"
              style={{ color: getStatusColor(monitorStatus.status), fontSize: '11px', marginLeft: '8px' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(monitorStatus.status),
                  marginRight: '4px'
                }}
              />
              {getStatusText(monitorStatus.status)}
            </span>
          </div>
          <Toggle checked={monitorEnabled} onChange={handleToggleMonitor} />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-label-wrap">
            <span className="settings-label">{t('settings.contextMenu.enable')}</span>
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleToggleContextMenu}
            disabled={contextMenuLoading}
          >
            {contextMenuLoading ? '...' : contextMenuEnabled ? t('settings.contextMenu.disable') : t('settings.contextMenu.enable')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LanguagePage
