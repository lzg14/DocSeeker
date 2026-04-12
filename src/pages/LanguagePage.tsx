import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

function LanguagePage(): JSX.Element {
  const { language, setLanguage, t } = useLanguage()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) setTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme || 'light')
  }, [])

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
    </div>
  )
}

export default LanguagePage
