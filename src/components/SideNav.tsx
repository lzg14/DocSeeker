import { useLanguage } from '../context/LanguageContext'
import { PageTab } from '../types'

interface SideNavProps {
  activeTab: PageTab
  onTabChange: (tab: PageTab) => void
}

const navItems: { id: PageTab; labelKey: string; icon: string; group: string }[] = [
  { id: 'search', labelKey: 'nav.search', icon: '🔎', group: '导航' },
  { id: 'scan', labelKey: 'nav.scan', icon: '📁', group: '导航' },
  { id: 'config', labelKey: 'nav.config', icon: '⚙️', group: '导航' },
  { id: 'language', labelKey: 'nav.language', icon: '🌐', group: '设置' },
  { id: 'guide', labelKey: 'nav.guide', icon: '📖', group: '帮助' },
  { id: 'about', labelKey: 'nav.about', icon: '✉️', group: '帮助' },
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
              <div className="nav-group-label">{item.group}</div>
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
