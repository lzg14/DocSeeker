/**
 * 扫描设置模块
 * 用户可配置的扫描规则
 */

export interface ScanSettings {
  // 超时设置（毫秒）
  timeoutMs: number

  // 文件大小限制（字节）
  maxFileSize: number

  // PDF 大小限制（字节）
  maxPdfSize: number

  // 是否跳过 ZIP 内的 Office 文件
  skipOfficeInZip: boolean

  // 是否启用 ZIP 头部检测
  checkZipHeader: boolean

  // 是否启用大小检查
  checkFileSize: boolean

  // 跳过规则
  skipRules: SkipRule[]
}

export interface SkipRule {
  // 规则名称
  name: string
  // 匹配类型：ext(扩展名), name(文件名), path(路径)
  type: 'ext' | 'name' | 'path'
  // 匹配模式
  pattern: string
  // 是否启用
  enabled: boolean
}

// 默认设置
export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  timeoutMs: 15000,           // 15 秒超时
  maxFileSize: 100 * 1024 * 1024,  // 100MB
  maxPdfSize: 50 * 1024 * 1024,     // 50MB
  skipOfficeInZip: true,      // 跳过 ZIP 内的 Office 文件
  checkZipHeader: true,       // 启用 ZIP 头部检测
  checkFileSize: true,        // 启用大小检查
  skipRules: []               // 默认无跳过规则
}

// 预设的跳过规则
export const PRESET_SKIP_RULES: SkipRule[] = [
  {
    name: '跳过微信临时文件',
    type: 'path',
    pattern: 'WeChat Files',
    enabled: false
  },
  {
    name: '跳过回收站',
    type: 'path',
    pattern: '$RECYCLE.BIN',
    enabled: false
  },
  {
    name: '跳过 node_modules',
    type: 'path',
    pattern: 'node_modules',
    enabled: false
  }
]

// 当前设置（运行时）
let currentSettings: ScanSettings = { ...DEFAULT_SCAN_SETTINGS }

// 获取当前设置
export function getScanSettings(): ScanSettings {
  return { ...currentSettings }
}

// 更新设置
export function updateScanSettings(settings: Partial<ScanSettings>): void {
  currentSettings = { ...currentSettings, ...settings }
}

// 重置为默认设置
export function resetScanSettings(): void {
  currentSettings = { ...DEFAULT_SCAN_SETTINGS }
}

// 检查文件是否应该跳过（根据规则）
export function shouldSkipFile(filePath: string, fileName: string, ext: string): { skip: boolean; reason: string } {
  for (const rule of currentSettings.skipRules) {
    if (!rule.enabled) continue

    let matched = false
    switch (rule.type) {
      case 'ext':
        matched = ext.toLowerCase() === rule.pattern.toLowerCase()
        break
      case 'name':
        matched = fileName.toLowerCase().includes(rule.pattern.toLowerCase())
        break
      case 'path':
        matched = filePath.toLowerCase().includes(rule.pattern.toLowerCase())
        break
    }

    if (matched) {
      return { skip: true, reason: rule.name }
    }
  }

  return { skip: false, reason: '' }
}
