import { useState, useEffect } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useLanguage } from '../context/LanguageContext'

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
  const handleClose = () => window.electron.closeWindow()

  return (
    <>
      <div className="title-bar">
        <span className="title-bar-title">DocSeeker</span>
        <div className="title-bar-controls">
          <button className="title-bar-btn" onClick={handleMinimize} title="最小化">
            ─
          </button>
          <button className="title-bar-btn" onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'}>
            {isMaximized ? '❐' : '□'}
          </button>
          <button className="title-bar-btn close" onClick={handleClose} title="关闭">
            ✕
          </button>
        </div>
      </div>

      {showCloseConfirm && (
        <ConfirmDialog
          title={t('confirm.exitTitle')}
          message={t('confirm.exitMsg')}
          onConfirm={() => window.electron.closeWindow()}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}
    </>
  )
}

export default TitleBar
