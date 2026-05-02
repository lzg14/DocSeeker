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
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [pendingDataPath, setPendingDataPath] = useState('')

  // Accessibility: font size, icon size
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('fontSize') || 'medium')
  const [iconSize, setIconSize] = useState(() => localStorage.getItem('iconSize') || 'medium')

  // File type categories for scanning
  const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({
    documents: true,
    pdf: true,
    text: true,
    odf: true,
    archives: true,
    email: true,
    media: true
  })

  // Apply font size / icon size immediately
  useEffect(() => {
    const sizeMap: Record<string, string> = {
      small: '12px',
      medium: '14px',
      large: '16px',
      'x-large': '18px',
    }
    const iconSizeMap: Record<string, string> = {
      small: '14px',
      medium: '16px',
      large: '20px',
      'x-large': '24px',
    }
    const root = document.documentElement
    root.style.setProperty('--font-size-base', sizeMap[fontSize] || '14px')
    root.style.setProperty('--font-size-small', sizeMap[fontSize] ? `${parseInt(sizeMap[fontSize]) - 2}px` : '12px')
    root.style.setProperty('--font-size-large', sizeMap[fontSize] ? `${parseInt(sizeMap[fontSize]) + 2}px` : '16px')
    root.style.setProperty('--icon-size-base', iconSizeMap[iconSize] || '16px')
    root.style.setProperty('--icon-size-large', iconSizeMap[iconSize] ? `${parseInt(iconSizeMap[iconSize]) + 4}px` : '20px')
    localStorage.setItem('fontSize', fontSize)
    localStorage.setItem('iconSize', iconSize)
  }, [fontSize, iconSize])

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
    // Get file type settings
    window.electron.getScanSettings?.().then(settings => {
      if (settings?.fileTypes) setFileTypes(settings.fileTypes)
    })
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

    // 先检查路径是否有效
    if (dataPath.current === dir) return // 路径没变，不需要处理

    const success = await window.electron.setDataPath?.(dir)
    if (success) {
      // 显示重启提示，而不是立即更新 UI
      setPendingDataPath(dir)
      setShowRestartDialog(true)
      setPathError('')
    } else {
      setPathError('Invalid directory')
    }
  }

  const handleConfirmRestart = async () => {
    await window.electron.restartApp?.()
  }

  const handleCancelRestart = () => {
    setShowRestartDialog(false)
    setPendingDataPath('')
    // 刷新当前数据路径显示
    window.electron.getDataPath?.().then(setDataPath)
  }

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="toggle-switch"
    />
  )

  // Restart dialog
  const RestartDialog = () => (
    <div className="dialog-overlay" onClick={handleCancelRestart}>
      <div className="dialog-content" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 style={{ margin: 0, fontSize: '16px' }}>{t('settings.restartRequired') || '需要重启'}</h3>
        </div>
        <div className="dialog-body" style={{ padding: '16px 0' }}>
          <p style={{ margin: '0 0 12px 0' }}>
            {t('settings.restartMessage') || '数据存储位置已更改，需要重启应用使配置生效。'}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
            <strong>{t('settings.newPath') || '新路径'}:</strong> {pendingDataPath}
          </p>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={handleCancelRestart}>
            {t('common.cancel') || '取消'}
          </button>
          <button className="btn btn-primary" onClick={handleConfirmRestart}>
            {t('settings.restartNow') || '立即重启'}
          </button>
        </div>
      </div>
    </div>
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

      {/* File Types: Category Selection */}
      <div className="settings-group">
        <div className="settings-section-title" style={{ marginBottom: '12px' }}>
          {t('settings.fileTypes') || '文件类型'}
        </div>
        <div style={{ padding: '0 12px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {([
            { key: 'documents', label: t('settings.fileTypes.documents'), ext: 'doc/docx/xls/xlsx/ppt/pptx/rtf/chm' },
            { key: 'pdf', label: t('settings.fileTypes.pdf'), ext: 'pdf/xps' },
            { key: 'text', label: t('settings.fileTypes.text'), ext: 'txt/md/json/xml/csv/html/svg' },
            { key: 'odf', label: t('settings.fileTypes.odf'), ext: 'odt/ods/odp/epub' },
            { key: 'archives', label: t('settings.fileTypes.archives'), ext: 'zip/rar/7z' },
            { key: 'email', label: t('settings.fileTypes.email'), ext: 'mbox/eml/pst' },
            { key: 'media', label: t('settings.fileTypes.media'), ext: 'jpg/png/mp3/mp4...' },
          ] as const).map(item => (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fileTypes[item.key] ?? true}
                onChange={() => {
                  const newFileTypes = { ...fileTypes, [item.key]: !fileTypes[item.key as keyof typeof fileTypes] }
                  setFileTypes(newFileTypes)
                  window.electron.updateScanSettings?.({ fileTypes: newFileTypes })
                }}
              />
              <span>{item.label}</span>
              <span style={{ fontSize: '11px', color: '#888' }}>({item.ext})</span>
            </label>
          ))}
        </div>
      </div>

      {/* Accessibility: Font & Icon Size */}
      <div className="settings-group">
        <div className="settings-section-title" style={{ marginBottom: '12px' }}>
          {t('settings.accessibility') || '可访问性'}
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.fontSize') || '字号'}</span>
          <div className="size-selector">
            {(['small', 'medium', 'large', 'x-large'] as const).map(size => (
              <button
                key={size}
                className={`size-btn ${fontSize === size ? 'active' : ''}`}
                onClick={() => setFontSize(size)}
                style={{ fontSize: size === 'small' ? '12px' : size === 'medium' ? '14px' : size === 'large' ? '16px' : '18px' }}
              >
                {t(`settings.fontSize.${size}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.iconSize') || '图标大小'}</span>
          <div className="size-selector">
            {(['small', 'medium', 'large', 'x-large'] as const).map(size => (
              <button
                key={size}
                className={`size-btn ${iconSize === size ? 'active' : ''}`}
                onClick={() => setIconSize(size)}
              >
                <span style={{ fontSize: size === 'small' ? '14px' : size === 'medium' ? '16px' : size === 'large' ? '20px' : '24px' }}>▶</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Restart dialog */}
      {showRestartDialog && <RestartDialog />}
    </div>
  )
}

export default LanguagePage
