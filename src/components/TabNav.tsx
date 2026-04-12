import { PageTab } from '../types'

interface TabNavProps {
  activeTab: PageTab
  onTabChange: (tab: PageTab) => void
}

function TabNav({ activeTab, onTabChange }: TabNavProps): JSX.Element {
  const tabs: { id: PageTab; label: string }[] = [
    { id: 'config', label: '配置' },
    { id: 'scan', label: '扫描' },
    { id: 'search', label: '搜索' }
  ]

  return (
    <div className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default TabNav
