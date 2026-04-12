import { useState, useEffect } from 'react'

function LanguagePage(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [language, setLanguage] = useState('zh-CN')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const savedLang = localStorage.getItem('language') as string | null
    if (savedTheme) setTheme(savedTheme)
    if (savedLang) setLanguage(savedLang)
    document.documentElement.setAttribute('data-theme', savedTheme || 'light')
  }, [])

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    localStorage.setItem('language', newLang)
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">语言与主题设置</h2>

      <div className="settings-section">
        <div className="settings-section-title">主题</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">界面主题</div>
              <div className="settings-row-desc">选择浅色或深色主题</div>
            </div>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                浅色
              </button>
              <button
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                深色
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">语言</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">界面语言</div>
              <div className="settings-row-desc">选择应用界面显示的语言</div>
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
