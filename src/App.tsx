import { useState, lazy, Suspense } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import { LanguageProvider } from './context/LanguageContext'
import TitleBar from './components/TitleBar'
import SideNav from './components/SideNav'
import StatusBar from './components/StatusBar'
import SearchPage from './pages/SearchPage'

// Lazy load pages that aren't shown immediately
const ScanPage = lazy(() => import('./pages/ScanPage'))
const LanguagePage = lazy(() => import('./pages/LanguagePage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))

function PageFallback(): JSX.Element {
  return <div className="page-loading"><div className="loading">Loading...</div></div>
}

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PageTab>('search')

  const renderPage = (): JSX.Element => {
    switch (activeTab) {
      case 'scan':
        return <Suspense fallback={<PageFallback />}><ScanPage /></Suspense>
      case 'language':
        return <Suspense fallback={<PageFallback />}><LanguagePage /></Suspense>
      case 'guide':
        return <Suspense fallback={<PageFallback />}><GuidePage /></Suspense>
      case 'search':
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
