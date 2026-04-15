import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, t } = useLanguage()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Shift+F')
  const [listening, setListening] = useState(false)
  const [hotkeyError, setHotkeyError] = useState('')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) setTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme || 'light')
  }, [])

  useEffect(() => {
    window.electron.getGlobalHotkey().then(h => setCurrentHotkey(formatHotkey(h)))
  }, [])
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
      if (MODIFIER_KEYS.has(key)) return // skip pure modifier keys

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

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang as 'zh-CN' | 'en')
    document.documentElement.setAttribute('lang', newLang)
  }

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
            <div className="theme-toggle">
              <button
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                {t('settings.light')}
              </button>
              <button
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                {t('settings.dark')}
              </button>
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
    </div>
  )
}

export default LanguagePage
