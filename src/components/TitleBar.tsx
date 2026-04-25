import { useState, useEffect } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useLanguage } from '../context/LanguageContext'
import { PageTab } from '../types'

interface TitleBarProps {
  activeTab?: PageTab
  onTabChange?: (tab: PageTab) => void
}

const MinimizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2" rx="0.5" />
  </svg>
)

const RestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" rx="0.5" />
    <path d="M0.5 2.5v7h7" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

// Navigation icons
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const ScanIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const HelpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

function TitleBar({ activeTab, onTabChange }: TitleBarProps): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    window.electron.isMaximized().then(setIsMaximized)
    const unsubscribe = window.electron.onWindowMaximized((maximized) => {
      setIsMaximized(maximized)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.electron.onShowCloseConfirm(() => {
      setShowCloseConfirm(true)
    })
    return unsubscribe
  }, [])

  const handleMinimize = () => window.electron.minimizeWindow()
  const handleMaximize = () => window.electron.maximizeWindow()
  const handleClose = () => {
    if (localStorage.getItem('minimizeToTray') === 'true') {
      window.electron.minimizeToTray?.()
    } else {
      window.electron.closeWindow()
    }
  }

  const handleNavClick = (tab: PageTab) => {
    if (onTabChange) {
      onTabChange(tab)
    }
  }

  return (
    <>
      <div className="title-bar">
        <div className="title-bar-left">
          <img src="build/icon.png?v=2" className="title-bar-icon" alt="DocSeeker" />

          {/* Navigation buttons */}
          <div className="title-bar-nav">
            <button
              className={`title-bar-nav-btn ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => handleNavClick('search')}
              title={t('nav.search')}
            >
              <SearchIcon />
            </button>
            <button
              className={`title-bar-nav-btn ${activeTab === 'scan' ? 'active' : ''}`}
              onClick={() => handleNavClick('scan')}
              title={t('nav.scan')}
            >
              <ScanIcon />
            </button>
            <button
              className={`title-bar-nav-btn ${activeTab === 'language' ? 'active' : ''}`}
              onClick={() => handleNavClick('language')}
              title={t('nav.settings')}
            >
              <SettingsIcon />
            </button>
            <button
              className={`title-bar-nav-btn ${activeTab === 'guide' ? 'active' : ''}`}
              onClick={() => handleNavClick('guide')}
              title={t('nav.guide')}
            >
              <HelpIcon />
            </button>
          </div>
        </div>

        <div className="title-bar-controls">
          <button className="title-bar-btn" onClick={handleMinimize} title="最小化">
            <MinimizeIcon />
          </button>
          <button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'}>
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button className="title-bar-btn close" onClick={handleClose} title="关闭">
            <CloseIcon />
          </button>
        </div>
      </div>

      {showCloseConfirm && (
        <ConfirmDialog
          title={t('confirm.exitTitle')}
          message={t('confirm.exitMsg')}
          onConfirm={() => {
            setShowCloseConfirm(false)
            if (localStorage.getItem('minimizeToTray') === 'true') {
              window.electron.minimizeToTray?.()
            } else {
              window.electron.closeWindow()
            }
          }}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}
    </>
  )
}

export default TitleBar
