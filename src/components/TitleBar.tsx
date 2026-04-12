import { useState, useEffect } from 'react'

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Get initial state
    window.electron.isMaximized().then(setIsMaximized)
    // Listen for changes
    const unsubscribe = window.electron.onWindowMaximized((maximized) => {
      setIsMaximized(maximized)
    })
    return unsubscribe
  }, [])

  const handleMinimize = () => window.electron.minimizeWindow()
  const handleMaximize = () => window.electron.maximizeWindow()
  const handleClose = () => window.electron.closeWindow()

  return (
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
  )
}

export default TitleBar
