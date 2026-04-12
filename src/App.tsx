import { useState } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import { LanguageProvider } from './context/LanguageContext'
import TitleBar from './components/TitleBar'
import SideNav from './components/SideNav'
import StatusBar from './components/StatusBar'
import ScanPage from './pages/ScanPage'
import SchedulePage from './pages/SchedulePage'
import SearchPage from './pages/SearchPage'
import LanguagePage from './pages/LanguagePage'
import GuidePage from './pages/GuidePage'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PageTab>('search')

  const renderPage = (): JSX.Element => {
    switch (activeTab) {
      case 'scan':
        return <ScanPage />
      case 'schedule':
        return <SchedulePage />
      case 'search':
        return <SearchPage />
      case 'language':
        return <LanguagePage />
      case 'guide':
        return <GuidePage />
      default:
        return <SearchPage />
    }
  }

  return (
    <AppProvider>
      <LanguageProvider>
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
      </LanguageProvider>
    </AppProvider>
  )
}

export default App
