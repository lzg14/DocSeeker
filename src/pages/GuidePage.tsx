import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'
import packageJson from '../../package.json'

interface QuickSetupProps {
  onComplete: () => void
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
      setTimeout(onComplete, 1500)
    } catch (err) {
      setError(String(err))
      setAdding(false)
    }
  }

  if (!systemPaths) return <div />

  const getFolderName = (path: string): string => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleAddFolders}
              disabled={adding}
            >
              {adding ? '...' : t('guide.addFolders')}
            </button>
            <button
              className="btn btn-secondary"
              onClick={onComplete}
            >
              {t('guide.skipSetup')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface GuidePageProps {
  onNavigate?: (tab: 'scan' | 'search' | 'language' | 'guide') => void
}

function GuidePage({ onNavigate }: GuidePageProps): JSX.Element {
  const { t } = useLanguage()
  const [showQr, setShowQr] = useState<string | null>(null)
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    window.electron.getScannedFolders().then(folders => {
      setIsFirstRun(folders.length === 0)
      setShowSetup(folders.length === 0)
    }).catch(() => {
      setIsFirstRun(false)
    })
  }, [])

  const handleSetupComplete = () => {
    setShowSetup(false)
    if (onNavigate) {
      onNavigate('scan')
    }
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('guide.title')}</h2>

      {/* Quick Setup - only show on first run */}
      {showSetup && (
        <QuickSetup onComplete={handleSetupComplete} />
      )}

      {/* Overview */}
      <div className="settings-section">
        <div className="settings-section-title">{t('guide.overview')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p style={{ lineHeight: 1.8 }}>{t('guide.overviewDesc')}</p>
            <ul>
              <li>{t('guide.feature1')}</li>
              <li>{t('guide.feature2')}</li>
              <li>{t('guide.feature3')}</li>
              <li>{t('guide.feature4')}</li>
              <li>{t('guide.feature5')}</li>
              <li>{t('guide.feature6')}</li>
              <li>{t('guide.feature7')}</li>
              <li>{t('guide.feature8')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Donate */}
      <div className="settings-section">
        <div className="settings-section-title">{t('guide.donate')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <div className="donate-layout">
              <div className="donate-info">
                <p>{t('guide.donateDesc')}</p>
                <p>
                  <strong>{t('guide.devName')}:</strong> Zhigang Li &lt;lzg14@qq.com&gt;
                </p>
                <p>
                  <strong>{t('guide.version')}:</strong> {packageJson.version}
                </p>
                <p>
                  <strong>{t('guide.github')}:</strong>{' '}
                  <a
                    href="https://github.com/lzg14/DocSeeker"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)' }}
                  >
                    github.com/lzg14/DocSeeker
                  </a>
                </p>
              </div>
              <div className="donate-qrcodes">
                <div className="donate-qr donate-qr-small">
                  <div className="donate-qr-label">{t('guide.wechat')}</div>
                  <img
                    src="./resources/wechat-pay.png"
                    alt="WeChat Pay"
                    onClick={() => setShowQr('./resources/wechat-pay.png')}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                <div className="donate-qr donate-qr-small">
                  <div className="donate-qr-label">{t('guide.alipay')}</div>
                  <img
                    src="./resources/alipay.png"
                    alt="Alipay"
                    onClick={() => setShowQr('./resources/alipay.png')}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR modal */}
      {showQr && (
        <div className="qr-modal-overlay" onClick={() => setShowQr(null)}>
          <div className="qr-modal" onClick={e => e.stopPropagation()}>
            <img src={showQr} alt="QR Code" style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px' }} />
            <button className="qr-modal-close" onClick={() => setShowQr(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GuidePage
