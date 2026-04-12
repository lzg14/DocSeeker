import { useLanguage } from '../context/LanguageContext'

function GuidePage(): JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('guide.title')}</h2>

      <div className="settings-section">
        <div className="settings-section-title">{t('guide.intro')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>{t('guide.introDesc')}</p>
            <h3>{t('guide.features')}</h3>
            <ul>
              <li><strong>{t('guide.feature1').split(':')[0]}</strong>：{t('guide.feature1').split(':').slice(1).join(':')}</li>
              <li><strong>{t('guide.feature2').split(':')[0]}</strong>：{t('guide.feature2').split(':').slice(1).join(':')}</li>
              <li><strong>{t('guide.feature3').split(':')[0]}</strong>：{t('guide.feature3').split(':').slice(1).join(':')}</li>
              <li><strong>{t('guide.feature4').split(':')[0]}</strong>：{t('guide.feature4').split(':').slice(1).join(':')}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('guide.steps')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <ol>
              <li>{t('guide.step1')}</li>
              <li>{t('guide.step2')}</li>
              <li>{t('guide.step3')}</li>
              <li>{t('guide.step4')}</li>
              <li>{t('guide.step5')}</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t('guide.faq')}</div>
        <div className="settings-card">
          <div className="guide-content">
            <details className="faq-item">
              <summary>{t('guide.faq1.q')}</summary>
              <p>{t('guide.faq1.a')}</p>
            </details>
            <details className="faq-item">
              <summary>{t('guide.faq2.q')}</summary>
              <p>{t('guide.faq2.a')}</p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
