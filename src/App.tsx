import { useState, lazy, Suspense, Component, ReactNode } from 'react'
import { PageTab } from './types'
import { AppProvider } from './context/AppContext'
import { LanguageProvider } from './context/LanguageContext'
import TitleBar from './components/TitleBar'
import StatusBar from './components/StatusBar'
import UpdateNotification from './components/UpdateNotification'
import SearchPage from './pages/SearchPage'
import FloatingSearch from './pages/FloatingSearch'

// Lazy load pages that aren't shown immediately
const ScanPage = lazy(() => import('./pages/ScanPage'))
const LanguagePage = lazy(() => import('./pages/LanguagePage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', color: '#f00', textAlign: 'center' }}>
          <h3>页面加载失败</h3>
          <p>请重启应用</p>
        </div>
      )
    }
    return this.props.children
  }
}

function PageFallback(): JSX.Element {
  return (
    <div className="page-loading" style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary, #fff)', color: 'var(--text-secondary, #666)' }}>
      <div className="loading">Loading...</div>
    </div>
  )
}

function App(): JSX.Element {
  // Render floating search window when navigated via hash
  if (window.location.hash === '#/floating') {
    return (
      <LanguageProvider>
        <FloatingSearch />
      </LanguageProvider>
    )
  }

  const [activeTab, setActiveTab] = useState<PageTab>('search')

  const renderPage = (): JSX.Element => {
    switch (activeTab) {
      case 'scan':
        return <Suspense fallback={<PageFallback />}><ScanPage /></Suspense>
      case 'language':
        return <Suspense fallback={<PageFallback />}><LanguagePage /></Suspense>
      case 'guide':
        return <Suspense fallback={<PageFallback />}><GuidePage onNavigate={setActiveTab} /></Suspense>
      case 'search':
      default:
        return <SearchPage />
    }
  }

  return (
    <AppProvider>
      <LanguageProvider>
        <div className="app">
          <TitleBar activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="main-content">
            <ErrorBoundary>
              {renderPage()}
            </ErrorBoundary>
          </main>
          <StatusBar />
          <UpdateNotification />
        </div>
      </LanguageProvider>
    </AppProvider>
  )
}

export default App
