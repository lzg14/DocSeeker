import { useState, useEffect } from 'react'
import { useLanguage, themes } from '../context/LanguageContext'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, theme, setTheme, t } = useLanguage()
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Shift+F')
  const [listening, setListening] = useState(false)
  const [hotkeyError, setHotkeyError] = useState('')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(
    () => localStorage.getItem('minimizeToTray') === 'true'
  )
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false)
  const [contextMenuLoading, setContextMenuLoading] = useState(false)

  useEffect(() => {
    window.electron.getGlobalHotkey().then(h => setCurrentHotkey(formatHotkey(h)))
    window.electron.getAutoLaunch?.().then(setAutoLaunch)
    window.electron.usnGetConfig?.().then(cfg => {
      if (cfg) setMonitorEnabled(cfg.enabled)
    })
    // Check if context menu is registered
    window.electron.isContextMenuRegistered?.().then(setContextMenuEnabled)
  }, [])

  const handleToggleMonitor = async (checked: boolean) => {
    setMonitorEnabled(checked)
    if (checked) {
      // Fetch scanned folders and pass as monitored dirs
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
          alert(t('settings.contextMenu.unregisterFailed') || result?.error || 'Failed to unregister')
        }
      } else {
        const result = await window.electron.registerContextMenu?.()
        if (result?.success) {
          setContextMenuEnabled(true)
        } else {
          alert(t('settings.contextMenu.registerFailed') || result?.error || 'Failed to register (need admin rights)')
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
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: checked ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: '20px', height: '20px', borderRadius: '50%',
        background: '#fff', position: 'absolute', top: '2px',
        left: checked ? '22px' : '2px', transition: 'left 0.2s',
      }} />
    </button>
  )

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('settings.title')}</h2>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.theme')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.themeLabel')}</div>
              <div className="settings-row-desc">{t('settings.themeDesc')}</div>
            </div>
            <div className="theme-cards">
              {themes.map((item) => (
                <button
                  key={item.id}
                  className={`theme-card ${theme === item.id ? 'active' : ''}`}
                  onClick={() => setTheme(item.id)}
                  title={t(item.descKey)}
                >
                  <div className="theme-card-preview">
                    <div
                      className="theme-preview-bg"
                      style={{ background: item.preview.bg }}
                    >
                      <div
                        className="theme-preview-sidebar"
                        style={{ background: item.preview.bgSecondary }}
                      />
                      <div
                        className="theme-preview-accent"
                        style={{ background: item.preview.accent }}
                      />
                    </div>
                  </div>
                  <div className="theme-card-label">{t(item.labelKey)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.language')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.languageLabel')}</div>
              <div className="settings-row-desc">{t('settings.languageDesc')}</div>
            </div>
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
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.shortcut')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.globalHotkey')}</div>
              <div className="settings-row-desc">{t('settings.globalHotkeyDesc')}</div>
            </div>
            <button
              className="btn btn-secondary hotkey-btn"
              onClick={listenForHotkey}
              disabled={listening}
            >
              {listening ? t('settings.pressKey') : currentHotkey}
            </button>
            {hotkeyError && (
              <span style={{ fontSize: '11px', color: '#e74c3c', marginLeft: '8px' }}>{hotkeyError}</span>
            )}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.window')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.window.autoLaunch')}</div>
              <div className="settings-row-desc">{t('settings.window.autoLaunchDesc')}</div>
            </div>
            <Toggle checked={autoLaunch} onChange={v => {
              setAutoLaunch(v)
              window.electron.setAutoLaunch?.(v)
            }} />
          </div>
          <div className="settings-divider" />
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.window.minimizeToTray')}</div>
              <div className="settings-row-desc">{t('settings.window.minimizeToTrayDesc')}</div>
            </div>
            <Toggle checked={minimizeToTray} onChange={v => {
              setMinimizeToTray(v)
              localStorage.setItem('minimizeToTray', String(v))
            }} />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.realtimeMonitor')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.enableRealtimeMonitor')}</div>
              <div className="settings-row-desc">
                {t('settings.enableRealtimeMonitorDesc')}
                <span style={{ color: 'var(--warning-color)', display: 'block', marginTop: '4px' }}>
                  {t('settings.realtimeMonitorWarning')}
                </span>
              </div>
            </div>
            <Toggle
              checked={monitorEnabled}
              onChange={handleToggleMonitor}
            />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('settings.contextMenu.title')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('settings.contextMenu.enable')}</div>
              <div className="settings-row-desc">
                {t('settings.contextMenu.desc')}
                <span style={{ color: 'var(--warning-color)', display: 'block', marginTop: '4px' }}>
                  {t('settings.contextMenu.adminWarning')}
                </span>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleToggleContextMenu}
              disabled={contextMenuLoading}
            >
              {contextMenuLoading
                ? t('settings.contextMenu.loading')
                : contextMenuEnabled
                  ? t('settings.contextMenu.disable')
                  : t('settings.contextMenu.enable')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LanguagePage
