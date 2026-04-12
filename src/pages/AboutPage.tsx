import { useLanguage } from '../context/LanguageContext'

function AboutPage(): JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('about.title')}</h2>

      <div className="settings-section">
        <div className="settings-section-title">{t('about.contact')}</div>
        <div className="settings-card">
          <div className="about-contact">
            <div className="contact-item">
              <span className="contact-icon">✉️</span>
              <div>
                <div className="contact-label">{t('about.devName')}</div>
                <div className="contact-value">lzg14@qq.com</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('about.donate')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p className="donate-desc">{t('about.donateDesc')}</p>
            <div className="donate-qrcodes">
              <div className="donate-qr">
                <div className="donate-qr-label">{t('about.wechat')}</div>
                <img src="./resources/wechat-pay.jpg" alt="WeChat Pay" />
              </div>
              <div className="donate-qr">
                <div className="donate-qr-label">{t('about.alipay')}</div>
                <img src="./resources/alipay.jpg" alt="Alipay" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
