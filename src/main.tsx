import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Theme initialization
const savedTheme = localStorage.getItem('theme') || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

// Language initialization
const savedLang = localStorage.getItem('language') || 'zh-CN'
document.documentElement.setAttribute('lang', savedLang)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
