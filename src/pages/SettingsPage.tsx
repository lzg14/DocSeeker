import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

type Tab = 'appearance' | 'window'

function SettingsPage(): JSX.Element {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('appearance')

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>{t('settings.title')}</h2>
      </div>

      <div className="settings-tabs">
        <button
          className={tab === 'appearance' ? 'active' : ''}
          onClick={() => setTab('appearance')}
        >
          {t('settings.tab.appearance')}
        </button>
        <button
          className={tab === 'window' ? 'active' : ''}
          onClick={() => setTab('window')}
        >
          {t('settings.tab.window')}
        </button>
      </div>

      <div className="settings-content">
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'window' && <WindowSettings />}
      </div>
    </div>
  )
}

// Placeholder - filled by Task 6
function AppearanceSettings() {
  const { t } = useLanguage()
  return <div className="setting-placeholder">{t('settings.placeholder')}</div>
}

// Placeholder - filled by Task 4
function WindowSettings() {
  const { t } = useLanguage()
  return <div className="setting-placeholder">{t('settings.placeholder')}</div>
}

export default SettingsPage
