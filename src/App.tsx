import { useState } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import TabNav from './components/TabNav'
import ConfigPage from './pages/ConfigPage'
import ScanPage from './pages/ScanPage'
import SearchPage from './pages/SearchPage'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PageTab>('search')

  const renderPage = (): JSX.Element => {
    switch (activeTab) {
      case 'config':
        return <ConfigPage />
      case 'scan':
        return <ScanPage />
      case 'search':
        return <SearchPage />
      default:
        return <SearchPage />
    }
  }

  return (
    <AppProvider>
      <div className="app">
        <header className="header">
          <h1>DocSeeker - 个人文档搜索工具</h1>
        </header>

        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="main-content">
          {renderPage()}
        </main>

        <footer className="footer">
          <span>DocSeeker - 个人长期积累文档的搜索工具</span>
        </footer>
      </div>
    </AppProvider>
  )
}

export default App
