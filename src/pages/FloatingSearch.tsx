import { useState, useEffect, useRef } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'

function FloatingSearch(): JSX.Element {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    try {
      const res = await window.electron.searchFiles(q)
      setResults(res.slice(0, 5))
      setSelected(0)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electron.hideFloatingWindow?.()
    } else if (e.key === 'Enter') {
      if (results[selected]) {
        window.electron.openFile(results[selected].path)
        window.electron.hideFloatingWindow?.()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '8px', borderBottom: '1px solid var(--border, #e0e0e0)' }}>
        <span style={{ fontSize: '16px' }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
          onKeyDown={handleKey}
          placeholder={t('search.placeholder')}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', background: 'transparent', color: 'var(--text-primary, #333)' }}
        />
        {isSearching && <span style={{ fontSize: '12px', color: 'var(--text-muted, #999)' }}>...</span>}
        <button onClick={() => window.electron.hideFloatingWindow?.()} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted, #999)', fontSize: '12px' }}>Esc</button>
      </div>
      {results.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: '200px' }}>
          {results.map((f, i) => (
            <div key={f.id} onClick={() => { window.electron.openFile(f.path); window.electron.hideFloatingWindow?.() }}
              style={{ padding: '8px 16px', cursor: 'pointer', background: i === selected ? 'var(--bg-secondary, #f5f5f5)' : 'transparent', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary, #333)' }}>{f.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>{f.file_type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FloatingSearch
