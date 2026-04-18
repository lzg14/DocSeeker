/**
 * Scan Settings Module
 *
 * Delegates to config.ts for persistent storage.
 * Kept for backward compatibility with existing imports.
 */

export {
  getScanSettings,
  updateScanSettings,
  DEFAULT_SCAN_SETTINGS,
  type ScanSettings,
  type SkipRule
} from './config'
