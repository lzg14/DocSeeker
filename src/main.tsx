import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Theme and language will be loaded by LanguageProvider via IPC
// Just set initial empty values, LanguageProvider will update

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)