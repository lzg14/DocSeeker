import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

interface FileTypesModalProps {
  onClose: () => void
}

// File extension categories with descriptions
const FILE_TYPE_CATEGORIES = [
  {
    key: 'documents',
    labelKey: 'settings.fileTypes.documents',
    extensions: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.chm', '.wps', '.wpp', '.et', '.dps'],
    description: 'Microsoft Office, WPS Office, RTF, CHM'
  },
  {
    key: 'pdf',
    labelKey: 'settings.fileTypes.pdf',
    extensions: ['.pdf', '.xps'],
    description: 'Adobe PDF, XPS documents'
  },
  {
    key: 'text',
    labelKey: 'settings.fileTypes.text',
    extensions: ['.txt', '.md', '.markdown', '.mdown', '.json', '.xml', '.csv', '.html', '.htm', '.svg', '.yaml', '.yml', '.log', '.ini', '.cfg', '.conf', '.srt', '.vtt', '.nfo', '.rst', '.tex'],
    description: 'Plain text, markdown, code files, config files'
  },
  {
    key: 'odf',
    labelKey: 'settings.fileTypes.odf',
    extensions: ['.odt', '.ods', '.odp', '.epub', '.mobi', '.azw3', '.fb2', '.pages', '.numbers', '.key'],
    description: 'OpenDocument, eBooks, Apple iWork'
  },
  {
    key: 'archives',
    labelKey: 'settings.fileTypes.archives',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
    description: 'Compressed archives (searchable inside)'
  },
  {
    key: 'email',
    labelKey: 'settings.fileTypes.email',
    extensions: ['.mbox', '.eml', '.pst', '.msg'],
    description: 'Email files from various clients'
  },
  {
    key: 'media',
    labelKey: 'settings.fileTypes.media',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a', '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'],
    description: 'Images, audio, video (metadata extraction + OCR for images)'
  },
]

export default function FileTypesModal({ onClose }: FileTypesModalProps): JSX.Element {
  const { t } = useLanguage()
  const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.electron.getScanSettings?.().then(settings => {
      if (settings?.fileTypes) {
        setFileTypes(settings.fileTypes)
      } else {
        // Default: all enabled
        const defaults: Record<string, boolean> = {}
        FILE_TYPE_CATEGORIES.forEach(cat => { defaults[cat.key] = true })
        setFileTypes(defaults)
      }
    })
  }, [])

  const handleToggle = (key: string) => {
    const newTypes = { ...fileTypes, [key]: !fileTypes[key] }
    setFileTypes(newTypes)
    window.electron.updateScanSettings?.({ fileTypes: newTypes })
  }

  const handleToggleAll = (enabled: boolean) => {
    const newTypes: Record<string, boolean> = {}
    FILE_TYPE_CATEGORIES.forEach(cat => { newTypes[cat.key] = enabled })
    setFileTypes(newTypes)
    window.electron.updateScanSettings?.({ fileTypes: newTypes })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
          {t('settings.fileTypes') || '文件类型'}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
            <button className="btn btn-secondary" onClick={() => handleToggleAll(true)}>
              {t('settings.fileTypes.enableAll') || '全选'}
            </button>
            <button className="btn btn-secondary" onClick={() => handleToggleAll(false)}>
              {t('settings.fileTypes.disableAll') || '全不选'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {FILE_TYPE_CATEGORIES.map(cat => (
              <label
                key={cat.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: fileTypes[cat.key] ? '1px solid var(--accent)' : '1px solid transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={fileTypes[cat.key] ?? true}
                  onChange={() => handleToggle(cat.key)}
                  style={{ marginTop: '3px', width: '18px', height: '18px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    {t(cat.labelKey)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {cat.description}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {cat.extensions.join(' ')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            {t('common.confirm') || '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}