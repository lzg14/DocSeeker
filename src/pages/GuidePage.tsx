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
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.8 }}>
              Word (.doc/.docx) · Excel (.xls/.xlsx) · PowerPoint (.ppt/.pptx) · PDF · Text/Markdown/JSON/CSV · RTF · CHM · ODF (ODT/ODS/ODP) · EPUB · ZIP (recursive) · Email (.eml/.mbox) · WPS/WPP/ET
            </p>
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
