import { useState, useEffect, useRef } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { formatSize } from '../utils/format'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  file: FileRecord | null
}

function FloatingSearch(): JSX.Element {
  const { t, theme } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, file: null })
  const hasNavigated = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const searchVersion = useRef(0) // 追踪搜索版本，过期结果忽略

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    searchVersion.current++
    const thisVersion = searchVersion.current
    hasNavigated.current = false
    setIsSearching(true)
    setResults([])
    setSelected(0)
    try {
      const res = await window.electron.searchFiles(q)
      if (thisVersion !== searchVersion.current) return // 新搜索已发出，忽略旧结果
      setResults(res.slice(0, 8))
      setIsSearching(false)
      const first = hasNavigated.current ? res.slice(0, 8)[selected] : res.slice(0, 8)[0]
      if (first) {
        window.electron.showInFolder(first.path)
        window.electron.hideFloatingWindow?.()
      }
    } catch (err) {
      console.error('Floating search error:', err)
      if (thisVersion !== searchVersion.current) return
      setResults([])
      setIsSearching(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electron.hideFloatingWindow?.()
    } else if (e.key === 'Enter') {
      if (query.trim()) {
        search(query.trim())
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      hasNavigated.current = true
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      hasNavigated.current = true
      setSelected(s => Math.max(s - 1, 0))
    }
  }

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent, file: FileRecord) => {
    e.preventDefault()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, file })
  }

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, file: null })
  }

  const handleOpenFile = (file: FileRecord) => {
    window.electron.openFile(file.path)
    window.electron.hideFloatingWindow?.()
  }

  const handleShowInFolder = (file: FileRecord) => {
    window.electron.showInFolder(file.path)
    window.electron.hideFloatingWindow?.()
  }

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu()
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.visible])

  return (
    <div style={{
      background: 'var(--bg-primary, #fff)',
      borderRadius: '8px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
      overflow: 'hidden',
      border: '1px solid var(--border, #e0e0e0)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '8px', borderBottom: '1px solid var(--border, #e0e0e0)', flexShrink: 0 }}>
        <span style={{ fontSize: '16px' }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t('search.placeholder')}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', background: 'transparent', color: 'var(--text-primary, #333)' }}
        />
        {isSearching && <span style={{ fontSize: '12px', color: 'var(--text-muted, #999)' }}>{t('search.searching') || '搜索中...'}</span>}
        {!isSearching && searched && results.length === 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>{t('search.noResult') || '无结果'}</span>
        )}
        {!isSearching && results.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--accent, #0078d4)', fontWeight: 500 }}>{t('search.result').replace('{count}', results.length.toString())}</span>
        )}
        <button onClick={() => window.electron.hideFloatingWindow?.()} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted, #999)', fontSize: '12px', padding: '2px 6px' }}>Esc</button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.map((f, i) => (
            <div key={f.id}
              onClick={() => handleShowInFolder(f)}
              onContextMenu={(e) => handleContextMenu(e, f)}
              style={{ padding: '8px 16px', cursor: 'pointer', background: i === selected ? 'var(--bg-secondary, #f0f0f0)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary, #333)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>{f.file_type}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>{formatSize(f.size)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.file && (
        <div ref={contextMenuRef} style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          background: 'var(--bg-primary, #fff)',
          border: '1px solid var(--border, #e0e0e0)',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '160px',
          padding: '4px 0'
        }}>
          <div onClick={() => handleOpenFile(contextMenu.file!)} style={{
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-primary, #333)'
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary, #f0f0f0)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            📄 {t('detail.openFile') || '打开文件'}
          </div>
          <div onClick={() => handleShowInFolder(contextMenu.file!)} style={{
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-primary, #333)'
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary, #f0f0f0)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            📁 {t('detail.showInFolder') || '定位到文件'}
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div style={{ padding: '5px 16px', fontSize: '10px', color: 'var(--text-muted, #999)', borderTop: '1px solid var(--border, #e0e0e0)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <span>↑↓ {t('search.filters') || '选择'} · Enter {t('detail.showInFolder') || '定位'} · 右键 {t('detail.openFile') || '打开文件'}</span>
      </div>
    </div>
  )
}

export default FloatingSearch
