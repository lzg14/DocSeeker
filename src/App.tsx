import { useState } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import TitleBar from './components/TitleBar'
import SideNav from './components/SideNav'
import StatusBar from './components/StatusBar'
import ConfigPage from './pages/ConfigPage'
import ScanPage from './pages/ScanPage'
import SearchPage from './pages/SearchPage'
import LanguagePage from './pages/LanguagePage'
import GuidePage from './pages/GuidePage'
import AboutPage from './pages/AboutPage'

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
      case 'language':
        return <LanguagePage />
      case 'guide':
        return <GuidePage />
      case 'about':
        return <AboutPage />
      default:
        return <SearchPage />
    }
  }

  return (
    <AppProvider>
      <div className="app">
        <TitleBar />
        <div className="main-layout">
          <SideNav activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="main-content">
            {renderPage()}
          </main>
        </div>
        <StatusBar />
      </div>
    </AppProvider>
  )
}

export default App
