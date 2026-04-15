import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, t } = useLanguage()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Shift+F')
  const [listening, setListening] = useState(false)

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
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const parts: string[] = []
      if (e.ctrlKey) parts.push('CommandOrControl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')
      const key = e.key.toUpperCase()
      if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
        parts.push(key)
      }
      if (parts.length > 1) {
        const nativeHotkey = parts.join('+')
        window.electron.setGlobalHotkey(nativeHotkey)
        setCurrentHotkey(formatHotkey(nativeHotkey))
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
      <h2 className="page-title">{t('lang.title')}</h2>

      <div className="settings-section">
        <div className="settings-section-title">{t('lang.theme')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('lang.themeLabel')}</div>
              <div className="settings-row-desc">{t('lang.themeDesc')}</div>
            </div>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                {t('lang.light')}
              </button>
              <button
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                {t('lang.dark')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('lang.language')}</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{t('lang.languageLabel')}</div>
              <div className="settings-row-desc">{t('lang.languageDesc')}</div>
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default LanguagePage
