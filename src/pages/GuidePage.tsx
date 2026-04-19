import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import packageJson from '../../package.json'

interface GuidePageProps {
  onNavigate?: (tab: 'scan' | 'search' | 'language' | 'guide') => void
}

function GuidePage({ onNavigate }: GuidePageProps): JSX.Element {
  const { t } = useLanguage()
  const [showQr, setShowQr] = useState<string | null>(null)

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('guide.title')}</h2>

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
              <li>{t('guide.feature9')}</li>
              <li>{t('guide.feature10')}</li>
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
