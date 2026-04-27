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
  const [doubleCtrlEnabled, setDoubleCtrlEnabledLocal] = useState(true)
  const [hotkeyError, setHotkeyError] = useState('')
  const [monitorStatus, setMonitorStatus] = useState<{ status: string; message?: string }>({ status: 'disconnected' })
  const [dataPath, setDataPath] = useState<{ current: string; default: string }>({ current: '', default: '' })
  const [pathError, setPathError] = useState('')

  useEffect(() => {
    window.electron.getGlobalHotkey().then(h => setCurrentHotkey(formatHotkey(h)))
    window.electron.getAutoLaunch?.().then(setAutoLaunch)
    window.electron.usnGetConfig?.().then(cfg => {
      if (cfg) setMonitorEnabled(cfg.enabled)
    })
    window.electron.getDoubleCtrlEnabled?.().then(setDoubleCtrlEnabledLocal)
    // Get initial monitor status
    window.electron.getMonitorStatus?.().then(setMonitorStatus)
    // Subscribe to status changes
    const unsubscribe = window.electron.onMonitorStatusChanged?.(setMonitorStatus)
    // Get data path
    window.electron.getDataPath?.().then(setDataPath)
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
    await window.electron.usnSetConfig?.({ enabled: checked })
  }

  const formatHotkey = (hk: string) =>
    hk.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')

  const listenForHotkey = async () => {
    setListening(true)
    setHotkeyError('')
    // Blur the button to ensure keydown events go to window
    ;(document.activeElement as HTMLElement)?.blur()
    // Disable current hotkey temporarily so it won't trigger during setting
    await window.electron.disableHotkey?.()

    const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

    const cleanup = () => {
      window.removeEventListener('keydown', handler)
      // Re-enable hotkey when exiting listening mode
      window.electron.enableHotkey?.()
    }

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const modifiers: string[] = []
      if (e.ctrlKey) modifiers.push('CommandOrControl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')
      if (e.metaKey) modifiers.push('Meta')

      const key = e.key
      // Skip if it's just a modifier key
      if (MODIFIER_KEYS.has(key)) return

      // Get the final key (uppercase for single chars, or the key name)
      const finalKey = key.length === 1 ? key.toUpperCase() : key

      // Require at least one key and either a modifier or a special key
      if (finalKey) {
        const hotkey = [...modifiers, finalKey].join('+')
        console.log('[Hotkey] Setting:', hotkey)
        window.electron.setGlobalHotkey(hotkey).then(() => {
          setCurrentHotkey(formatHotkey(hotkey))
          setHotkeyError('')
        }).catch((err) => {
          console.error('[Hotkey] Failed:', err)
          setHotkeyError('Failed to set hotkey')
        }).finally(() => {
          setListening(false)
          cleanup()
        })
      }
    }
    window.addEventListener('keydown', handler)
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang as 'zh-CN' | 'en')
    document.documentElement.setAttribute('lang', newLang)
    // Sync to config.json so tray menu shows correct language
    window.electron.setLanguage(newLang)
  }

  const handleSelectDataPath = async () => {
    const dir = await window.electron.selectDirectory()
    if (!dir) return

    const success = await window.electron.setDataPath?.(dir)
    if (success) {
      setDataPath({ ...dataPath, current: dir })
      setPathError('')
    } else {
      setPathError('Invalid directory')
    }
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
        {hotkeyError && (
          <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>
            {hotkeyError}
          </div>
        )}
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
        <div className="settings-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <span className="settings-label">{t('settings.dataPath') || '数据存储位置'}</span>
          <div style={{ flex: 1, fontSize: '12px', color: '#666', wordBreak: 'break-all', minWidth: '200px' }}>
            {dataPath.current || dataPath.default || '...'}
            {dataPath.current && dataPath.current !== dataPath.default && (
              <span style={{ color: '#ff9800', marginLeft: '8px' }}>({t('settings.customPath') || '已自定义'})</span>
            )}
          </div>
          <button className="btn btn-secondary" onClick={handleSelectDataPath}>
            {t('settings.changePath') || '更改'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: '#888', paddingLeft: '12px', paddingBottom: '8px' }}>
          {t('settings.dataPathDesc') || '修改后需要重新扫描'}
        </div>
        {pathError && (
          <div style={{ color: '#f44336', fontSize: '12px', paddingLeft: '12px', paddingBottom: '8px' }}>
            {pathError}
          </div>
        )}
      </div>
    </div>
  )
}

export default LanguagePage
