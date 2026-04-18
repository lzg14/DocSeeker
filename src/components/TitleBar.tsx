import { useState, useEffect } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useLanguage } from '../context/LanguageContext'

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

function TitleBar(): JSX.Element {
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

  return (
    <>
      <div className="title-bar">
        <img src="build/icon.png" className="title-bar-icon" alt="DocSeeker" />
        <span className="title-bar-title">DocSeeker</span>
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
