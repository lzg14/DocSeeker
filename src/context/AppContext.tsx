import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { ScanProgress } from '../types'

interface AppContextValue {
  isScanning: boolean
  scanProgress: ScanProgress
  refreshKey: number
  triggerRefresh: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    current: 0,
    total: 0,
    currentFile: '',
    phase: 'scanning'
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const scanStartedRef = useRef(false)

  useEffect(() => {
    const unsubscribe = window.electron.onScanProgress((progress) => {
      setScanProgress(progress)
      if (!scanStartedRef.current) {
        scanStartedRef.current = true
        setIsScanning(true)
      }
      if (progress.phase === 'complete') {
        scanStartedRef.current = false
        setIsScanning(false)
      }
    })
    return unsubscribe
  }, [])

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const value: AppContextValue = {
    isScanning,
    scanProgress,
    refreshKey,
    triggerRefresh
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
