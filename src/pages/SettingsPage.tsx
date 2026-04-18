import { useState, useEffect } from 'react'
import { useLanguage, themes } from '../context/LanguageContext'

type Tab = 'appearance' | 'window'

function SettingsPage(): JSX.Element {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('appearance')

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>{t('settings.title')}</h2>
      </div>

      <div className="settings-tabs">
        <button
          className={tab === 'appearance' ? 'active' : ''}
          onClick={() => setTab('appearance')}
        >
          {t('settings.tab.appearance')}
        </button>
        <button
          className={tab === 'window' ? 'active' : ''}
          onClick={() => setTab('window')}
        >
          {t('settings.tab.window')}
        </button>
      </div>

      <div className="settings-content">
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'window' && <WindowSettings />}
      </div>
    </div>
  )
}

// Filled by Task 6
function AppearanceSettings(): JSX.Element {
  const { t } = useLanguage()
  const { theme, setTheme } = useLanguage()

  return (
    <div className="appearance-settings">
      <div className="setting-group">
        <div className="setting-group-title">{t('settings.appearance.theme', '主题')}</div>
        <div className="theme-grid">
          {themes.map(th => (
            <button
              key={th.id}
              className={`theme-card ${theme === th.id ? 'active' : ''}`}
              onClick={() => setTheme(th.id)}
              title={t(th.descKey)}
            >
              <span className="theme-label">{t(th.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Placeholder - filled by Task 4
function WindowSettings(): JSX.Element {
  const { t } = useLanguage()
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(
    () => localStorage.getItem('minimizeToTray') === 'true'
  )

  // Load initial auto-launch state
  useEffect(() => {
    window.electron.getAutoLaunch?.().then(setAutoLaunch)
  }, [])

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: checked ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s',
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
    <div className="window-settings">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-title">{t('settings.window.autoLaunch', '开机自启')}</div>
          <div className="setting-item-desc">{t('settings.window.autoLaunchDesc', '系统启动时自动运行 DocSeeker')}</div>
        </div>
        <Toggle checked={autoLaunch} onChange={v => {
          setAutoLaunch(v)
          window.electron.setAutoLaunch?.(v)
        }} />
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-title">{t('settings.window.minimizeToTray', '关闭时最小化到托盘')}</div>
          <div className="setting-item-desc">{t('settings.window.minimizeToTrayDesc', '点击关闭按钮时隐藏到系统托盘')}</div>
        </div>
        <Toggle checked={minimizeToTray} onChange={v => {
          setMinimizeToTray(v)
          localStorage.setItem('minimizeToTray', String(v))
        }} />
      </div>
    </div>
  )
}

export default SettingsPage
