import { useLanguage } from '../context/LanguageContext'
import { PageTab } from '../types'

interface SideNavProps {
  activeTab: PageTab
  onTabChange: (tab: PageTab) => void
}

const navItems: { id: PageTab; labelKey: string; icon: string; groupKey: string }[] = [
  { id: 'search', labelKey: 'nav.search', icon: '🔎', groupKey: 'nav.group.nav' },
  { id: 'scan', labelKey: 'nav.scan', icon: '📁', groupKey: 'nav.group.nav' },
  { id: 'language', labelKey: 'nav.language', icon: '🌐', groupKey: 'nav.group.settings' },
  { id: 'guide', labelKey: 'nav.guide', icon: '❓', groupKey: 'nav.group.help' },
]

function SideNav({ activeTab, onTabChange }: SideNavProps): JSX.Element {
  const { t } = useLanguage()
  let lastGroup = ''

  return (
    <nav className="side-nav">
      {navItems.map((item) => {
        const showGroupLabel = item.group !== lastGroup
        lastGroup = item.group
        return (
          <div key={item.id}>
            {showGroupLabel && (
              <div className="nav-group-label">{t(item.groupKey)}</div>
            )}
            <button
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{t(item.labelKey)}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

export default SideNav
