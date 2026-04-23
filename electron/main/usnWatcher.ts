import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import * as net from 'net'
import * as path from 'path'
import log from 'electron-log/main'
import { app } from 'electron'
import { getAppSetting, setAppSetting } from './config'
import { handleUsnEvent } from './usnHandler'
import { getAllScannedFolders } from './meta'

interface UsnCommand {
  type: 'init' | 'update_dirs' | 'ping'
  dirs?: string[]
}

interface UsnMessage {
  type: 'event' | 'ack' | 'err' | 'double_ctrl' | 'pong'
  event?: string
  path?: string
  volume?: string
  timestamp?: number
  oldPath?: string
  command?: string
  message?: string
}

// Monitor status for UI feedback
export type MonitorStatus = 'disconnected' | 'connecting' | 'connected' | 'monitoring' | 'error'

// Callback types
type DoubleCtrlCallback = () => void
type StatusChangeCallback = (status: MonitorStatus, message?: string) => void

// Global callbacks
let doubleCtrlCallback: DoubleCtrlCallback | null = null
let statusChangeCallback: StatusChangeCallback | null = null

export function onDoubleCtrl(callback: DoubleCtrlCallback): void {
  doubleCtrlCallback = callback
}

export function onMonitorStatusChange(callback: StatusChangeCallback): void {
  statusChangeCallback = callback
}

export function getMonitorStatus(): MonitorStatus {
  return usnWatcher.getStatus()
}

export class UsnWatcher {
  private process: ChildProcessWithoutNullStreams | null = null
  private client: net.Socket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private isStopped = false

  // Daemon settings
  private restartAttempts = 0
  private maxRestartAttempts = 5
  private restartDelay = 1000 // Start with 1 second
  private maxRestartDelay = 30000 // Max 30 seconds

  // Status tracking
  private currentStatus: MonitorStatus = 'disconnected'
  private statusMessage = ''

  private updateStatus(status: MonitorStatus, message?: string): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status
      this.statusMessage = message || ''
      log.info(`[Monitor] Status: ${status}${message ? ` - ${message}` : ''}`)
      if (statusChangeCallback) {
        statusChangeCallback(status, message)
      }
    }
  }

  getStatus(): MonitorStatus {
    return this.currentStatus
  }

  async start(): Promise<void> {
    if (this.isStopped) {
      log.info('[UsnWatcher] was stopped, refusing to restart')
      return
    }

    this.isRunning = true
    this.updateStatus('connecting', 'Starting monitor...')

    await this.spawnProcess()
    this.tryConnect()
  }

  private tryConnect(): void {
    if (this.isStopped) return

    this.updateStatus('connecting', 'Connecting...')

    this.connect().then(() => {
      this.restartAttempts = 0
      this.restartDelay = 1000
      this.updateStatus('connected', 'Connected')
      this.startHeartbeat()
      this.initMonitor()
    }).catch((err) => {
      this.scheduleRestart()
    })
  }

  private initMonitor(): void {
    const config = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
      enabled: false,
      dirs: [],
    })

    if (config.enabled && config.dirs.length > 0) {
      const normalizedDirs = config.dirs.map(d => d.replace(/\\/g, '/'))
      this.send({ type: 'init', dirs: normalizedDirs })
      this.updateStatus('monitoring', `Monitoring ${config.dirs.length} directories`)
    } else if (config.enabled && config.dirs.length === 0) {
      try {
        const folders = getAllScannedFolders()
        if (folders.length > 0) {
          const normalizedDirs = folders.map(f => f.path.replace(/\\/g, '/'))
          this.send({ type: 'init', dirs: normalizedDirs })
          setAppSetting('realtimeMonitor', { enabled: true, dirs: folders.map(f => f.path) })
          this.updateStatus('monitoring', `Monitoring ${folders.length} directories`)
        } else {
          this.updateStatus('connected', 'Ready (no directories)')
        }
      } catch (e) {
        log.error('[UsnWatcher] failed to get scanned folders:', e)
        this.updateStatus('connected', 'Ready')
      }
    } else {
      this.updateStatus('connected', 'Double-ctrl ready')
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.client && !this.client.destroyed) {
        this.send({ type: 'ping' })
      }
    }, 30000) // Ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleRestart(): void {
    if (this.isStopped) return

    this.restartAttempts++

    if (this.restartAttempts > this.maxRestartAttempts) {
      this.updateStatus('error', `Failed after ${this.maxRestartAttempts} attempts`)
      log.error(`[UsnWatcher] Max restart attempts (${this.maxRestartAttempts}) reached, giving up`)
      return
    }

    this.updateStatus('connecting', `Restarting (${this.restartAttempts}/${this.maxRestartAttempts})...`)
    log.warn(`[UsnWatcher] Scheduling restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${this.restartDelay}ms`)

    this.reconnectTimer = setTimeout(() => {
      log.info(`[UsnWatcher] Restart attempt ${this.restartAttempts}`)
      this.spawnProcess().then(() => {
        this.tryConnect()
      }).catch((err) => {
        log.error('[UsnWatcher] Spawn failed:', err)
        this.scheduleRestart()
      })
    }, this.restartDelay)

    // Exponential backoff
    this.restartDelay = Math.min(this.restartDelay * 2, this.maxRestartDelay)
  }

  stop(): void {
    this.isRunning = false
    this.isStopped = true
    this.stopHeartbeat()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.client) {
      try {
        this.client.destroy()
      } catch {}
      this.client = null
    }

    if (this.process) {
      try {
        this.process.kill()
      } catch {}
      this.process = null
    }

    this.updateStatus('disconnected', 'Stopped')
    log.info('[UsnWatcher] stopped')
  }

  updateDirs(dirs: string[]): void {
    if (!this.client || this.client.destroyed) return
    const normalizedDirs = dirs.map(d => d.replace(/\\/g, '/'))
    this.send({ type: 'init', dirs: normalizedDirs })
    this.updateStatus('monitoring', `Monitoring ${dirs.length} directories`)
  }

  private async spawnProcess(): Promise<void> {
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath!, 'docseeker-monitor.exe')
      : path.join(__dirname, '../../go/docseeker-monitor.exe')

    log.info('[UsnWatcher] spawning:', exePath)

    return new Promise((resolve, reject) => {
      this.process = spawn(exePath, [], {
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderrData = ''

      this.process.on('error', (err) => {
        log.error('[UsnWatcher] process error:', err)
        reject(err)
      })

      this.process.on('exit', (code) => {
        log.warn(`[UsnWatcher] Go process exited with code ${code}`)
        this.onDisconnect()
        if (this.isRunning && !this.isStopped) {
          log.warn('[UsnWatcher] Process crashed, will attempt restart')
          this.scheduleRestart()
        }
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n')
        for (const line of lines) {
          stderrData += line + '\n'
          if (line.startsWith('ERROR') || line.startsWith('FATAL')) {
            log.error(`[UsnWatcher] Go: ${line}`)
          } else if (line.startsWith('INFO: listening')) {
            resolve()
          } else {
            log.debug(`[UsnWatcher] Go: ${line}`)
          }
        }
      })

      // Timeout for process startup
      setTimeout(() => {
        if (!this.client && !this.client?.destroyed) {
          resolve() // Assume it's running
        }
      }, 3000)
    })
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('connect timeout'))
      }, 10000)

      this.client = net.createConnection({ host: '127.0.0.1', port: 29501 }, () => {
        clearTimeout(timeout)
        log.info('[UsnWatcher] TCP connected')
        this.setupReader()
        resolve()
      })

      this.client.on('error', (err) => {
        clearTimeout(timeout)
        log.error('[UsnWatcher] TCP error:', err.message)
        reject(err)
      })

      this.client.on('close', () => {
        log.info('[UsnWatcher] TCP connection closed')
        this.onDisconnect()
      })
    })
  }

  private setupReader(): void {
    if (!this.client) return
    let buf = ''

    this.client.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let newlineIdx: number
      while ((newlineIdx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, newlineIdx)
        buf = buf.slice(newlineIdx + 1)
        try {
          const msg: UsnMessage = JSON.parse(line)
          this.onMessage(msg)
        } catch {
          log.warn('[UsnWatcher] failed to parse JSON:', line)
        }
      }
    })
  }

  private onMessage(msg: UsnMessage): void {
    if (msg.type === 'event' && msg.event && msg.path !== undefined) {
      handleUsnEvent({
        event: msg.event as any,
        path: msg.path,
        volume: msg.volume || '',
        timestamp: msg.timestamp || Date.now(),
        oldPath: msg.oldPath,
      })
    } else if (msg.type === 'ack') {
      log.debug(`[UsnWatcher] ack: ${msg.command}`)
    } else if (msg.type === 'err') {
      log.error(`[UsnWatcher] Go error: ${msg.message}`)
    } else if (msg.type === 'pong') {
      log.debug('[UsnWatcher] heartbeat pong received')
    } else if (msg.type === 'double_ctrl') {
      log.info('[UsnWatcher] double-ctrl detected')
      if (doubleCtrlCallback) {
        doubleCtrlCallback()
      }
    }
  }

  private onDisconnect(): void {
    this.stopHeartbeat()
    this.client = null

    if (!this.isRunning || this.isStopped) return

    this.updateStatus('connecting', 'Reconnecting...')
  }

  private send(cmd: UsnCommand): void {
    if (!this.client || this.client.destroyed) {
      log.warn('[UsnWatcher] Cannot send, not connected')
      return
    }
    try {
      this.client.write(JSON.stringify(cmd) + '\n')
    } catch (e) {
      log.error('[UsnWatcher] send error:', e)
    }
  }
}

export const usnWatcher = new UsnWatcher()
