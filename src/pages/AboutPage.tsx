import { useLanguage } from '../context/LanguageContext'

function AboutPage(): JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('about.title')}</h2>

      <div className="settings-section">
        <div className="settings-card">
          <div className="about-content">
            <div className="about-logo">🔍</div>
            <div className="about-name">DocSeeker</div>
            <div className="about-version">{t('about.version')}</div>
            <div className="about-desc">
              {t('about.desc')}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('about.contact')}</div>
        <div className="settings-card">
          <div className="about-contact">
            <div className="contact-item">
              <span className="contact-icon">✉️</span>
              <div>
                <div className="contact-label">{t('about.email')}</div>
                <div className="contact-value">{t('about.emailAddr')}</div>
              </div>
            </div>
            <div className="contact-item">
              <span className="contact-icon">🐙</span>
              <div>
                <div className="contact-label">{t('about.github')}</div>
                <div className="contact-value">{t('about.githubAddr')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('about.license')}</div>
        <div className="settings-card">
          <div className="about-license">
            {t('about.licenseText')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
