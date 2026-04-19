import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

interface QuickSetupProps {
  onComplete?: () => void
}

function QuickSetup({ onComplete }: QuickSetupProps): JSX.Element {
  const { t } = useLanguage()
  const [systemPaths, setSystemPaths] = useState<{ documents: string; desktop: string } | null>(null)
  const [selected, setSelected] = useState({ documents: true, desktop: true })
  const [adding, setAdding] = useState(false)
  const [addedCount, setAddedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electron.getSystemPaths().then(setSystemPaths).catch(() => {})
  }, [])

  const handleAddFolders = async () => {
    const folders = [
      selected.documents && systemPaths?.documents,
      selected.desktop && systemPaths?.desktop
    ].filter(Boolean) as string[]

    if (folders.length === 0) {
      setError(t('guide.noFoldersSelected'))
      return
    }

    setAdding(true)
    setError(null)

    try {
      for (const folder of folders) {
        await window.electron.addScannedFolder(folder)
      }
      setAddedCount(folders.length)
      if (onComplete) {
        setTimeout(onComplete, 1500)
      }
    } catch (err) {
      setError(String(err))
      setAdding(false)
    }
  }

  if (!systemPaths) return <div />

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t('guide.quickSetup')}</div>
      <div className="settings-card">
        <p style={{ marginBottom: '12px' }}>{t('guide.quickSetupDesc')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.documents}
              onChange={e => setSelected(s => ({ ...s, documents: e.target.checked }))}
            />
            <span>{t('guide.documents')}</span>
            <span style={{ color: '#888', fontSize: '12px' }}>— {systemPaths.documents}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.desktop}
              onChange={e => setSelected(s => ({ ...s, desktop: e.target.checked }))}
            />
            <span>{t('guide.desktop')}</span>
            <span style={{ color: '#888', fontSize: '12px' }}>— {systemPaths.desktop}</span>
          </label>
        </div>

        {error && (
          <p style={{ color: '#e53935', marginBottom: '12px', fontSize: '13px' }}>{error}</p>
        )}

        {addedCount > 0 ? (
          <p style={{ color: '#2e7d32', fontSize: '13px' }}>
            {t('guide.foldersAdded').replace('{count}', String(addedCount))}
          </p>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleAddFolders}
            disabled={adding}
          >
            {adding ? '...' : t('guide.addFolders')}
          </button>
        )}
      </div>
    </div>
  )
}

export default QuickSetup
