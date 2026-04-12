import { PageTab } from '../types'

interface SideNavProps {
  activeTab: PageTab
  onTabChange: (tab: PageTab) => void
}

const navItems: { id: PageTab; label: string; icon: string; group: string }[] = [
  { id: 'search', label: '搜索文档', icon: '🔎', group: '导航' },
  { id: 'scan', label: '扫描管理', icon: '📁', group: '导航' },
  { id: 'config', label: '配置', icon: '⚙️', group: '导航' },
  { id: 'language', label: '语言与主题', icon: '🌐', group: '设置' },
  { id: 'guide', label: '使用说明', icon: '📖', group: '帮助' },
  { id: 'about', label: '开发者联系', icon: '✉️', group: '帮助' },
]

function SideNav({ activeTab, onTabChange }: SideNavProps): JSX.Element {
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
              <span className="nav-label">{item.label}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

export default SideNav
