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
  type: 'event' | 'ack' | 'err'
  event?: string
  path?: string
  volume?: string
  timestamp?: number
  oldPath?: string
  command?: string
  message?: string
}

export class UsnWatcher {
  private process: ChildProcessWithoutNullStreams | null = null
  private client: net.Socket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isRunning = false

  async start(): Promise<void> {
    let config = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
      enabled: false,
      dirs: [],
    })
    if (!config.enabled) {
      log.info('[UsnWatcher] realtime monitor disabled, not starting')
      return
    }

    // Fallback: if dirs empty at startup, fetch from meta and save
    if (config.dirs.length === 0) {
      log.info('[UsnWatcher] dirs empty, fetching from scanned folders...')
      try {
        const folders = getAllScannedFolders()
        config = { enabled: true, dirs: folders.map(f => f.path) }
        setAppSetting('realtimeMonitor', config)
        log.info(`[UsnWatcher] loaded ${config.dirs.length} dirs from meta`)
      } catch (e) {
        log.error('[UsnWatcher] failed to get scanned folders:', e)
      }
    }

    if (config.dirs.length === 0) {
      log.warn('[UsnWatcher] still no dirs after fallback, not starting')
      return
    }

    await this.spawnProcess()
    await this.connect()
    // Normalize all dirs to forward slashes for cross-platform consistency
    const normalizedDirs = config.dirs.map(d => d.replace(/\\/g, '/'))
    this.send({ type: 'init', dirs: normalizedDirs })
    this.isRunning = true
    log.info(`[UsnWatcher] started, monitoring ${config.dirs.length} dirs`)
  }

  stop(): void {
    this.isRunning = false
    this.clearReconnect()
    if (this.client) {
      this.client.destroy()
      this.client = null
    }
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    log.info('[UsnWatcher] stopped')
  }

  updateDirs(dirs: string[]): void {
    if (!this.isRunning) return
    this.send({ type: 'init', dirs })
  }

  private async spawnProcess(): Promise<void> {
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath!, 'go-usn-monitor.exe')
      : path.join(__dirname, '../../go/usn-monitor.exe')

    log.info('[UsnWatcher] spawning:', exePath)
    this.process = spawn(exePath, [], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.on('exit', (code) => {
      log.warn(`[UsnWatcher] Go process exited with code ${code}`)
      this.onDisconnect()
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (line.startsWith('ERROR') || line.startsWith('FATAL')) {
          log.error(`[UsnWatcher] Go: ${line}`)
        } else {
          log.debug(`[UsnWatcher] Go: ${line}`)
        }
      }
    })
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = net.createConnection({ host: '127.0.0.1', port: 29501 }, () => {
        log.info('[UsnWatcher] connected to Go process')
        this.setupReader()
        resolve()
      })

      this.client.on('error', (err) => {
        log.error('[UsnWatcher] TCP error:', err.message)
        reject(err)
      })

      this.client.on('close', () => {
        this.onDisconnect()
      })

      setTimeout(() => reject(new Error('connect timeout')), 5000)
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
    }
  }

  private onDisconnect(): void {
    if (!this.isRunning) return
    this.reconnectTimer = setTimeout(() => {
      log.info('[UsnWatcher] attempting reconnect...')
      this.connect().then(() => {
        const config = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
          enabled: false,
          dirs: [],
        })
        const normalizedDirs = config.dirs.map(d => d.replace(/\\/g, '/'))
        this.send({ type: 'init', dirs: normalizedDirs })
      }).catch(() => {})
    }, 5000)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private send(cmd: UsnCommand): void {
    if (!this.client) return
    try {
      this.client.write(JSON.stringify(cmd) + '\n')
    } catch (e) {
      log.error('[UsnWatcher] send error:', e)
    }
  }
}

export const usnWatcher = new UsnWatcher()
