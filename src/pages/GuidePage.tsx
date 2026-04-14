import { useLanguage } from '../context/LanguageContext'

function GuidePage(): JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('guide.title')}</h2>

      {/* Overview + Features */}
      <div className="settings-section">
        <div className="settings-section-title">{t('guide.overview')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>{t('guide.overviewDesc')}</p>
            <ul>
              <li>{t('guide.feature1')}</li>
              <li>{t('guide.feature2')}</li>
              <li>{t('guide.feature3')}</li>
              <li>{t('guide.feature4')}</li>
              <li>{t('guide.feature5')}</li>
              <li>{t('guide.feature6')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Supported formats */}
      <div className="settings-section">
        <div className="settings-section-title">{t('guide.formats')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>{t('guide.formatsDesc')}</p>
            <div className="guide-feature-grid">
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📄</span>
                <span>Word (.doc/.docx)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📊</span>
                <span>Excel (.xls/.xlsx)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📽️</span>
                <span>PowerPoint (.ppt/.pptx)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📕</span>
                <span>PDF (.pdf)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📝</span>
                <span>Text / Markdown / JSON / CSV</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📃</span>
                <span>RTF (.rtf)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📚</span>
                <span>CHM Help (.chm)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📒</span>
                <span>ODF / LibreOffice (.odt/.ods/.odp)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">🗜️</span>
                <span>ZIP Archive (recursive search)</span>
              </div>
              <div className="guide-feature-item">
                <span className="guide-feature-icon">📧</span>
                <span>Email (.eml/.mbox)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Donate */}
      <div className="settings-section">
        <div className="settings-section-title">{t('guide.donate')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>{t('guide.donateDesc')}</p>
            <p style={{ marginTop: '8px' }}>
              <strong>{t('guide.devName')}:</strong> Zhigang Li &lt;lzg14@qq.com&gt;
            </p>
            <div className="donate-qrcodes">
              <div className="donate-qr">
                <div className="donate-qr-label">{t('guide.wechat')}</div>
                <img src="./resources/wechat-pay.png" alt="WeChat Pay" />
              </div>
              <div className="donate-qr">
                <div className="donate-qr-label">{t('guide.alipay')}</div>
                <img src="./resources/alipay.png" alt="Alipay" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
