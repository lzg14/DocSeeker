import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { ScanProgress } from '../types'

interface AppContextValue {
  // 扫描状态
  isScanning: boolean
  isPaused: boolean
  scanProgress: ScanProgress
  currentDirectory: string | null

  // 扫描控制
  pauseScan: () => Promise<void>
  resumeScan: () => Promise<void>
  cancelScan: () => Promise<void>

  // 刷新回调（让子页面触发刷新）
  refreshKey: number
  triggerRefresh: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isScanning, setIsScanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    current: 0,
    total: 0,
    currentFile: '',
    phase: 'scanning'
  })
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const scanStartedRef = useRef(false)

  // 订阅扫描进度
  useEffect(() => {
    const unsubscribe = window.electron.onScanProgress((progress) => {
      setScanProgress(progress)
      // 收到第一个进度消息时，标记为正在扫描
      if (!scanStartedRef.current) {
        scanStartedRef.current = true
        setIsScanning(true)
      }
      // 扫描完成时重置状态
      if (progress.phase === 'complete') {
        scanStartedRef.current = false
        setIsScanning(false)
      }
    })
    return unsubscribe
  }, [])

  // 订阅暂停/恢复/取消事件
  useEffect(() => {
    const unsubscribePaused = window.electron.onScanPaused((data) => {
      setIsPaused(data.paused)
    })
    const unsubscribeCancelled = window.electron.onScanCancelled(() => {
      scanStartedRef.current = false
      setIsScanning(false)
      setIsPaused(false)
    })
    return () => {
      unsubscribePaused()
      unsubscribeCancelled()
    }
  }, [])

  const pauseScan = useCallback(async (): Promise<void> => {
    try {
      await window.electron.pauseScan()
    } catch (error) {
      console.error('Failed to pause scan:', error)
    }
  }, [])

  const resumeScan = useCallback(async (): Promise<void> => {
    try {
      await window.electron.resumeScan()
    } catch (error) {
      console.error('Failed to resume scan:', error)
    }
  }, [])

  const cancelScan = useCallback(async (): Promise<void> => {
    try {
      await window.electron.cancelScan()
      // 状态会在 onScanCancelled 回调中重置
    } catch (error) {
      console.error('Failed to cancel scan:', error)
    }
  }, [])

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const value: AppContextValue = {
    isScanning,
    isPaused,
    scanProgress,
    currentDirectory,
    pauseScan,
    resumeScan,
    cancelScan,
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
