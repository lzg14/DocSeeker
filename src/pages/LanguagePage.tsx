import { useState, useEffect } from 'react'
import { useLanguage, themes } from '../context/LanguageContext'
import FileTypesModal from '../components/FileTypesModal'
import TagsModal from '../components/TagsModal'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, theme, setTheme, t } = useLanguage()
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Shift+F')
  const [listening, setListening] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [doubleCtrlEnabled, setDoubleCtrlEnabledLocal] = useState(true)
  const [hotkeyError, setHotkeyError] = useState('')
  const [monitorStatus, setMonitorStatus] = useState<{ status: string; message?: string }>({ status: 'disconnected' })
  const [dataPath, setDataPath] = useState<{ current: string; default: string }>({ current: '', default: '' })
  const [pathError, setPathError] = useState('')
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [pendingDataPath, setPendingDataPath] = useState('')

  // Modals
  const [showFileTypesModal, setShowFileTypesModal] = useState(false)
  const [showTagsModal, setShowTagsModal] = useState(false)

  // Accessibility: font size, icon size
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('fontSize') || 'medium')
  const [iconSize, setIconSize] = useState(() => localStorage.getItem('iconSize') || 'medium')

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
    window.electron.getMinimizeToTray?.().then(setMinimizeToTray)
    window.electron.usnGetConfig?.().then(cfg => {
      if (cfg) setMonitorEnabled(cfg.enabled)
    })
    window.electron.getDoubleCtrlEnabled?.().then(setDoubleCtrlEnabledLocal)
    window.electron.getMonitorStatus?.().then(setMonitorStatus)
    const unsubscribe = window.electron.onMonitorStatusChanged?.(setMonitorStatus)
    window.electron.getDataPath?.().then(setDataPath)
    return () => unsubscribe?.()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'monitoring': return '#4caf50'
      case 'connected': return '#8bc34a'
      case 'connecting': return '#ff9800'
      case 'error': return '#f44336'
      default: return '#9e9e9e'
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
    ;(document.activeElement as HTMLElement)?.blur()
    await window.electron.disableHotkey?.()

    const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

    const cleanup = () => {
      window.removeEventListener('keydown', handler)
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
      if (MODIFIER_KEYS.has(key)) return

      const finalKey = key.length === 1 ? key.toUpperCase() : key

      if (finalKey) {
        const hotkey = [...modifiers, finalKey].join('+')
        window.electron.setGlobalHotkey(hotkey).then(() => {
          setCurrentHotkey(formatHotkey(hotkey))
          setHotkeyError('')
        }).catch((err) => {
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
    window.electron.setLanguage(newLang)
  }

  const handleSelectDataPath = async () => {
    const dir = await window.electron.selectDirectory()
    if (!dir) return
    if (dataPath.current === dir) return

    const success = await window.electron.setDataPath?.(dir)
    if (success) {
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

  // Settings section component
  const SettingsSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="settings-group">
      <div className="settings-section-title" style={{ padding: '12px 12px 8px' }}>
        {title}
      </div>
      {children}
    </div>
  )

  // Settings row with button component
  const SettingsRow = ({ label, action, hint }: { label: string; action: React.ReactNode; hint?: string }) => (
    <div className="settings-row">
      <div style={{ flex: 1 }}>
        <div className="settings-label">{label}</div>
        {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
      </div>
      {action}
    </div>
  )

  return (
    <div className="settings-page">
      {/* Appearance & Language */}
      <SettingsSection title={t('settings.tab.appearance') || '外观'}>
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
        <SettingsRow
          label={t('settings.languageLabel')}
          action={
            <select
              className="settings-select"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          }
        />
      </SettingsSection>

      {/* Accessibility */}
      <SettingsSection title={t('settings.accessibility') || '可访问性'}>
        <SettingsRow
          label={t('settings.fontSize')}
          action={
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
          }
        />
        <SettingsRow
          label={t('settings.iconSize')}
          action={
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
          }
        />
      </SettingsSection>

      {/* Window Behavior */}
      <SettingsSection title={t('settings.window') || '窗口'}>
        <SettingsRow
          label={t('settings.globalHotkey')}
          action={
            <button
              className="btn btn-secondary hotkey-btn"
              onClick={listenForHotkey}
              disabled={listening}
            >
              {listening ? t('settings.pressKey') : currentHotkey}
            </button>
          }
        />
        {hotkeyError && (
          <div style={{ color: '#f44336', fontSize: '12px', padding: '0 12px 8px' }}>{hotkeyError}</div>
        )}
        <SettingsRow
          label={t('settings.doubleCtrl')}
          action={<Toggle checked={doubleCtrlEnabled} onChange={v => {
            setDoubleCtrlEnabledLocal(v)
            window.electron.setDoubleCtrlEnabled?.(v)
          }} />}
        />
        <SettingsRow
          label={t('settings.window.autoLaunch')}
          action={<Toggle checked={autoLaunch} onChange={v => {
            setAutoLaunch(v)
            window.electron.setAutoLaunch?.(v)
          }} />}
        />
        <SettingsRow
          label={t('settings.window.minimizeToTray')}
          action={<Toggle checked={minimizeToTray} onChange={v => {
            setMinimizeToTray(v)
            window.electron.setMinimizeToTray?.(v)
          }} />}
        />
      </SettingsSection>

      {/* Scanning Options */}
      <SettingsSection title={t('scan.title') || '扫描'}>
        <SettingsRow
          label={t('settings.enableRealtimeMonitor')}
          hint={getStatusText(monitorStatus.status)}
          action={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(monitorStatus.status)
                }}
              />
              <Toggle checked={monitorEnabled} onChange={handleToggleMonitor} />
            </span>
          }
        />
        <SettingsRow
          label={t('settings.dataPath')}
          action={
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dataPath.current || dataPath.default || '...'}
              </span>
              <button className="btn btn-secondary" onClick={handleSelectDataPath} style={{ padding: '4px 12px' }}>
                {t('settings.changePath') || '更改'}
              </button>
            </div>
          }
        />
        <SettingsRow
          label={t('settings.fileTypes')}
          hint={t('settings.fileTypesDesc') || '选择要扫描的文件类型'}
          action={
            <button className="btn btn-secondary" onClick={() => setShowFileTypesModal(true)}>
              {t('settings.configure') || '配置'}
            </button>
          }
        />
        <SettingsRow
          label={t('tags.title')}
          hint={t('tags.hint') || '管理文件标签'}
          action={
            <button className="btn btn-secondary" onClick={() => setShowTagsModal(true)}>
              {t('settings.manage') || '管理'}
            </button>
          }
        />
      </SettingsSection>

      {/* Restart dialog */}
      {showRestartDialog && <RestartDialog />}

      {/* Modals */}
      {showFileTypesModal && <FileTypesModal onClose={() => setShowFileTypesModal(false)} />}
      {showTagsModal && <TagsModal onClose={() => setShowTagsModal(false)} />}
    </div>
  )
}

export default LanguagePage