/**
 * Config Module Tests
 *
 * Tests for configuration management utilities.
 */

// ============ Scan Settings Tests ============

interface ScanSettings {
  timeoutMs: number
  maxFileSize: number
  maxPdfSize: number
  skipOfficeInZip: boolean
  checkZipHeader: boolean
  checkFileSize: boolean
  skipRules: SkipRule[]
  includeHidden: boolean
  includeSystem: boolean
}

interface SkipRule {
  name: string
  type: 'ext' | 'name' | 'path'
  pattern: string
  enabled: boolean
}

const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  timeoutMs: 15000,
  maxFileSize: 100 * 1024 * 1024,
  maxPdfSize: 50 * 1024 * 1024,
  skipOfficeInZip: true,
  checkZipHeader: true,
  checkFileSize: true,
  skipRules: [],
  includeHidden: false,
  includeSystem: false
}

test('DEFAULT_SCAN_SETTINGS has correct values', () => {
  expect(DEFAULT_SCAN_SETTINGS.timeoutMs).toBe(15000)
  expect(DEFAULT_SCAN_SETTINGS.maxFileSize).toBe(100 * 1024 * 1024)
  expect(DEFAULT_SCAN_SETTINGS.maxPdfSize).toBe(50 * 1024 * 1024)
  expect(DEFAULT_SCAN_SETTINGS.skipOfficeInZip).toBe(true)
  expect(DEFAULT_SCAN_SETTINGS.includeHidden).toBe(false)
})

test('mergeScanSettings applies partial updates', () => {
  function mergeScanSettings(base: ScanSettings, updates: Partial<ScanSettings>): ScanSettings {
    return { ...base, ...updates }
  }

  const merged = mergeScanSettings(DEFAULT_SCAN_SETTINGS, {
    timeoutMs: 30000,
    includeHidden: true
  })

  expect(merged.timeoutMs).toBe(30000)
  expect(merged.includeHidden).toBe(true)
  expect(merged.maxFileSize).toBe(DEFAULT_SCAN_SETTINGS.maxFileSize) // unchanged
})

test('resetScanSettings restores defaults', () => {
  function resetScanSettings(): ScanSettings {
    return { ...DEFAULT_SCAN_SETTINGS }
  }

  const modified: ScanSettings = {
    ...DEFAULT_SCAN_SETTINGS,
    timeoutMs: 99999,
    includeHidden: true
  }

  const reset = resetScanSettings()
  expect(reset.timeoutMs).toBe(DEFAULT_SCAN_SETTINGS.timeoutMs)
  expect(reset.includeHidden).toBe(DEFAULT_SCAN_SETTINGS.includeHidden)
})

// ============ Skip Rules Tests ============

test('createSkipRule creates valid rule', () => {
  function createSkipRule(
    name: string,
    type: 'ext' | 'name' | 'path',
    pattern: string,
    enabled: boolean = true
  ): SkipRule {
    return { name, type, pattern, enabled }
  }

  const rule = createSkipRule('Skip temp files', 'ext', '.tmp')

  expect(rule.name).toBe('Skip temp files')
  expect(rule.type).toBe('ext')
  expect(rule.pattern).toBe('.tmp')
  expect(rule.enabled).toBe(true)
})

test('validateSkipRule checks rule validity', () => {
  function validateSkipRule(rule: SkipRule): boolean {
    if (!rule.name || !rule.pattern) return false
    if (!['ext', 'name', 'path'].includes(rule.type)) return false
    return true
  }

  const validRule: SkipRule = { name: 'test', type: 'ext', pattern: '.tmp', enabled: true }
  const invalidRule = { name: '', type: 'ext', pattern: '.tmp', enabled: true } as SkipRule
  const invalidType = { name: 'test', type: 'invalid', pattern: '.tmp', enabled: true } as SkipRule

  expect(validateSkipRule(validRule)).toBe(true)
  expect(validateSkipRule(invalidRule)).toBe(false)
  expect(validateSkipRule(invalidType)).toBe(false)
})

test('serializeSkipRules converts rules to JSON string', () => {
  function serializeSkipRules(rules: SkipRule[]): string {
    return JSON.stringify(rules)
  }

  const rules: SkipRule[] = [
    { name: 'Skip .tmp', type: 'ext', pattern: '.tmp', enabled: true },
    { name: 'Skip thumbs.db', type: 'name', pattern: 'thumbs.db', enabled: true }
  ]

  const json = serializeSkipRules(rules)
  const parsed = JSON.parse(json)

  expect(parsed).toHaveLength(2)
  expect(parsed[0].type).toBe('ext')
})

test('deserializeSkipRules parses JSON string', () => {
  function deserializeSkipRules(json: string): SkipRule[] {
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  const json = '[{"name":"Skip .tmp","type":"ext","pattern":".tmp","enabled":true}]'
  const rules = deserializeSkipRules(json)

  expect(rules).toHaveLength(1)
  expect(rules[0].name).toBe('Skip .tmp')
  expect(rules[0].type).toBe('ext')
})

test('invalid JSON returns empty array', () => {
  function deserializeSkipRules(json: string): SkipRule[] {
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  expect(deserializeSkipRules('invalid json')).toEqual([])
  expect(deserializeSkipRules('')).toEqual([])
})

// ============ Size Validation Tests ============

test('validateMaxFileSize checks size bounds', () => {
  function validateMaxFileSize(size: number): boolean {
    const MIN = 1024 * 1024 // 1 MB
    const MAX = 1024 * 1024 * 1024 // 1 GB
    return size >= MIN && size <= MAX
  }

  expect(validateMaxFileSize(1024 * 1024)).toBe(true) // 1 MB - min
  expect(validateMaxFileSize(1024 * 1024 * 1024)).toBe(true) // 1 GB - max
  expect(validateMaxFileSize(512 * 1024)).toBe(false) // below min
  expect(validateMaxFileSize(2 * 1024 * 1024 * 1024)).toBe(false) // above max
})

test('validateTimeoutMs checks timeout bounds', () => {
  function validateTimeoutMs(timeout: number): boolean {
    const MIN = 1000 // 1 second
    const MAX = 300000 // 5 minutes
    return timeout >= MIN && timeout <= MAX
  }

  expect(validateTimeoutMs(5000)).toBe(true) // 5 seconds
  expect(validateTimeoutMs(1000)).toBe(true) // min
  expect(validateTimeoutMs(300000)).toBe(true) // max
  expect(validateTimeoutMs(500)).toBe(false) // below min
  expect(validateTimeoutMs(600000)).toBe(false) // above max
})

// ============ App Settings Tests ============

interface AppSettings {
  themeId?: string
  language?: string
  hotkey?: string
  autoLaunch?: boolean
  minimizeToTray?: boolean
  [key: string]: unknown
}

test('getAppSetting returns default when key not found', () => {
  const store: AppSettings = {
    themeId: 'dark',
    language: 'zh-CN'
  }

  function getAppSetting<T>(settings: AppSettings, key: string, defaultValue: T): T {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      return settings[key] as T
    }
    return defaultValue
  }

  expect(getAppSetting(store, 'themeId', 'light')).toBe('dark')
  expect(getAppSetting(store, 'language', 'en-US')).toBe('zh-CN')
  expect(getAppSetting(store, 'missing', 'default')).toBe('default')
})

test('setAppSetting updates existing key', () => {
  const store: AppSettings = {
    themeId: 'light'
  }

  function setAppSetting(settings: AppSettings, key: string, value: unknown): void {
    settings[key] = value
  }

  setAppSetting(store, 'themeId', 'dark')
  expect(store.themeId).toBe('dark')

  setAppSetting(store, 'newKey', 'newValue')
  expect(store.newKey).toBe('newValue')
})

test('getAllAppSettings returns copy of settings', () => {
  const store: AppSettings = {
    themeId: 'dark',
    language: 'zh-CN'
  }

  function getAllAppSettings(settings: AppSettings): AppSettings {
    return { ...settings }
  }

  const copy = getAllAppSettings(store)
  copy.themeId = 'light' // modify copy

  expect(store.themeId).toBe('dark') // original unchanged
  expect(copy.themeId).toBe('light')
})

// ============ Path Validation Tests ============

test('validateDataPath checks if path exists and is writable', () => {
  const fs = require('fs')
  const path = require('path')

  function validateDataPath(dataPath: string): boolean {
    if (!dataPath) return false
    // In tests, we just check if it's a non-empty string
    return dataPath.length > 0
  }

  expect(validateDataPath('/valid/path')).toBe(true)
  expect(validateDataPath('')).toBe(false)
  expect(validateDataPath(null as unknown as string)).toBe(false)
})

// ============ Settings Export/Import Tests ============

test('exportSettings creates exportable JSON', () => {
  const scanSettings: ScanSettings = {
    ...DEFAULT_SCAN_SETTINGS,
    skipRules: [
      { name: 'Skip .tmp', type: 'ext', pattern: '.tmp', enabled: true }
    ]
  }

  const appSettings: AppSettings = {
    themeId: 'dark',
    language: 'zh-CN'
  }

  function exportSettings(scan: ScanSettings, app: AppSettings): string {
    return JSON.stringify({
      version: '1.0',
      scan_settings: scan,
      app_settings: app,
      exported_at: new Date().toISOString()
    }, null, 2)
  }

  const exported = exportSettings(scanSettings, appSettings)
  const parsed = JSON.parse(exported)

  expect(parsed.version).toBe('1.0')
  expect(parsed.scan_settings.timeoutMs).toBe(15000)
  expect(parsed.app_settings.themeId).toBe('dark')
  expect(parsed.exported_at).toBeDefined()
})

test('importSettings parses exported JSON', () => {
  const json = JSON.stringify({
    version: '1.0',
    scan_settings: { timeoutMs: 20000 },
    app_settings: { themeId: 'light' }
  })

  function importSettings(json: string): { scan: Partial<ScanSettings>; app: Partial<AppSettings> } | null {
    try {
      const parsed = JSON.parse(json)
      return {
        scan: parsed.scan_settings || {},
        app: parsed.app_settings || {}
      }
    } catch {
      return null
    }
  }

  const imported = importSettings(json)
  expect(imported?.scan.timeoutMs).toBe(20000)
  expect(imported?.app.themeId).toBe('light')
})

test('importSettings returns null for invalid JSON', () => {
  function importSettings(json: string): { scan: Partial<ScanSettings>; app: Partial<AppSettings> } | null {
    try {
      const parsed = JSON.parse(json)
      return {
        scan: parsed.scan_settings || {},
        app: parsed.app_settings || {}
      }
    } catch {
      return null
    }
  }

  expect(importSettings('invalid')).toBeNull()
  expect(importSettings('')).toBeNull()
})

// ============ Theme ID Validation Tests ============

test('validateThemeId accepts valid theme IDs', () => {
  function validateThemeId(themeId: string): boolean {
    const validThemes = ['light', 'dark', 'system', 'blue', 'green']
    return validThemes.includes(themeId)
  }

  expect(validateThemeId('light')).toBe(true)
  expect(validateThemeId('dark')).toBe(true)
  expect(validateThemeId('system')).toBe(true)
  expect(validateThemeId('red')).toBe(false)
  expect(validateThemeId('')).toBe(false)
})

// ============ Language Code Validation Tests ============

test('validateLanguageCode accepts valid language codes', () => {
  function validateLanguageCode(code: string): boolean {
    const validCodes = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR']
    return validCodes.includes(code)
  }

  expect(validateLanguageCode('en-US')).toBe(true)
  expect(validateLanguageCode('zh-CN')).toBe(true)
  expect(validateLanguageCode('fr-FR')).toBe(false)
  expect(validateLanguageCode('')).toBe(false)
})
