import { useState, useCallback, useEffect, useRef } from 'react'
import FileList from '../components/FileList'
import FileDetail from '../components/FileDetail'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { formatSize } from '../utils/format'

interface SearchHistoryEntry {
  id?: number
  query: string
  searched_at?: string
}

interface SavedSearch {
  id?: number
  name: string
  query: string
  created_at?: string
}

interface SearchOptions {
  fileTypes?: string[]
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
}

const FILE_TYPE_OPTIONS = [
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pptx', label: 'PPT' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: '文本' },
  { value: 'rtf', label: 'RTF' },
  { value: 'chm', label: 'CHM' },
  { value: 'odf', label: 'ODF' },
  { value: 'email', label: '邮件' },
  { value: 'zip', label: 'ZIP' },
]

function SearchPage(): JSX.Element {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false)
  const [snippets, setSnippets] = useState<Record<number, string>>({})
  const [saveName, setSaveName] = useState('')
  const [filters, setFilters] = useState<SearchOptions>({})
  const { t } = useLanguage()

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Load history and saved searches on mount
  useEffect(() => {
    loadHistory()
    loadSavedSearches()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowHistory(false)
        setShowSaved(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadHistory = async () => {
    try {
      const h = await window.electron.getSearchHistory()
      setHistory(h)
    } catch {}
  }

  const loadSavedSearches = async () => {
    try {
      const s = await window.electron.getSavedSearches()
      setSavedSearches(s)
    } catch {}
  }

  const performSearch = useCallback(async (query: string, opts?: SearchOptions) => {
    if (!query.trim()) {
      setFiles([])
      setHasSearched(false)
      return
    }
    setIsSearching(true)
    setShowHistory(false)
    setShowSaved(false)
    try {
      const hasFilters = opts &&
        (opts.fileTypes?.length || opts.sizeMin || opts.sizeMax || opts.dateFrom || opts.dateTo)

      const result = hasFilters
        ? await window.electron.searchFilesAdvanced(query, opts)
        : await window.electron.searchFiles(query)
      setFiles(result)
      setHasSearched(true)
      // Fetch highlighted snippets for the results
      if (result.length > 0 && query.trim()) {
        const fileIds = result.map(f => f.id!).filter(Boolean)
        const s = await window.electron.getSearchSnippets(query, fileIds)
        setSnippets(s)
      } else {
        setSnippets({})
      }
      loadHistory()
    } catch (error) {
      console.error('Failed to search files:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearch = () => performSearch(searchQuery, filters)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleHistoryClick = (query: string) => {
    setSearchQuery(query)
    performSearch(query, filters)
  }

  const handleClearHistory = async () => {
    await window.electron.clearSearchHistory()
    setHistory([])
  }

  const handleSaveSearch = async () => {
    if (!saveName.trim() || !searchQuery.trim()) return
    await window.electron.addSavedSearch(saveName.trim(), searchQuery.trim())
    setSaveName('')
    setShowSaveDialog(false)
    loadSavedSearches()
  }

  const handleDeleteSaved = async (id: number) => {
    await window.electron.deleteSavedSearch(id)
    loadSavedSearches()
  }

  const handleFilterChange = (newFilters: SearchOptions) => {
    setFilters(newFilters)
  }

  const toggleFileType = (type: string) => {
    const current = filters.fileTypes || []
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]
    handleFilterChange({ ...filters, fileTypes: updated.length ? updated : undefined })
  }

  const hasActiveFilters = filters.fileTypes?.length ||
    filters.sizeMin || filters.sizeMax ||
    filters.dateFrom || filters.dateTo

  return (
    <div className="search-page">
      <div className="search-header">
        <div className="search-box-row">
          <div className="search-box-wrapper" ref={dropdownRef}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { setShowHistory(true); setShowSaved(false) }}
            />
            <button
              className="search-btn"
              onClick={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? t('search.searching') : t('search.btn')}
            </button>

            {/* History & Saved dropdown */}
            {(showHistory || showSaved) && (
              <div className="search-dropdown">
                <div className="search-dropdown-tabs">
                  <button
                    className={`dropdown-tab ${showHistory ? 'active' : ''}`}
                    onClick={() => { setShowHistory(true); setShowSaved(false) }}
                  >
                    {t('search.historyTab')}
                  </button>
                  <button
                    className={`dropdown-tab ${showSaved ? 'active' : ''}`}
                    onClick={() => { setShowSaved(true); setShowHistory(false) }}
                  >
                    {t('search.savedTab')}
                  </button>
                </div>

                {showHistory && (
                  <div className="search-dropdown-content">
                    {history.length === 0 ? (
                      <div className="search-dropdown-empty">{t('search.historyEmpty')}</div>
                    ) : (
                      <>
                        {history.map((entry) => (
                          <div
                            key={entry.id}
                            className="search-history-item"
                            onClick={() => handleHistoryClick(entry.query)}
                          >
                            <span className="history-query">{entry.query}</span>
                            <span className="history-time">
                              {entry.searched_at ? new Date(entry.searched_at).toLocaleDateString('zh-CN') : ''}
                            </span>
                          </div>
                        ))}
                        <div className="search-dropdown-footer">
                          <button className="dropdown-action" onClick={handleClearHistory}>
                            {t('search.clearHistory')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {showSaved && (
                  <div className="search-dropdown-content">
                    {savedSearches.length === 0 ? (
                      <div className="search-dropdown-empty">{t('search.savedEmpty')}</div>
                    ) : (
                      savedSearches.map((s) => (
                        <div key={s.id} className="search-saved-item">
                          <div
                            className="saved-info"
                            onClick={() => { setSearchQuery(s.query); performSearch(s.query, filters) }}
                          >
                            <span className="saved-name">{s.name}</span>
                            <span className="saved-query">{s.query}</span>
                          </div>
                          <button
                            className="saved-delete"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSaved(s.id!) }}
                            title={t('search.deleteSaved')}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                    {searchQuery.trim() && (
                      <div className="search-dropdown-footer">
                        {!showSaveDialog ? (
                          <button className="dropdown-action primary" onClick={() => setShowSaveDialog(true)}>
                            {t('search.saveCurrent')}
                          </button>
                        ) : (
                          <div className="save-dialog">
                            <input
                              type="text"
                              placeholder={t('search.saveNamePlaceholder')}
                              value={saveName}
                              onChange={(e) => setSaveName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveSearch()}
                              autoFocus
                            />
                            <button className="save-confirm" onClick={handleSaveSearch}>✓</button>
                            <button className="save-cancel" onClick={() => { setShowSaveDialog(false); setSaveName('') }}>×</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toolbar: filter + syntax help + save */}
          <div className="search-toolbar">
            <button
              className={`toolbar-btn ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title={t('search.filters')}
            >
              {t('search.filters')}
              {hasActiveFilters && <span className="filter-badge">{[
                filters.fileTypes?.length,
                filters.sizeMin || filters.sizeMax ? 1 : 0,
                filters.dateFrom || filters.dateTo ? 1 : 0,
              ].reduce((a, b) => a + b, 0)}</span>}
            </button>
            <button
              className={`toolbar-btn ${showSyntaxHelp ? 'active' : ''}`}
              onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
              title={t('search.syntaxHelp')}
            >
              ?
            </button>
          </div>
        </div>

        {/* Advanced syntax help panel */}
        {showSyntaxHelp && (
          <div className="syntax-help-panel">
            <div className="syntax-help-title">{t('search.syntaxHelp')}</div>
            <div className="syntax-grid">
              <div className="syntax-item">
                <code>word1 word2</code>
                <span>{t('search.syntaxAnd')}</span>
              </div>
              <div className="syntax-item">
                <code>"exact phrase"</code>
                <span>{t('search.syntaxPhrase')}</span>
              </div>
              <div className="syntax-item">
                <code>term*</code>
                <span>{t('search.syntaxPrefix')}</span>
              </div>
              <div className="syntax-item">
                <code>term1 OR term2</code>
                <span>{t('search.syntaxOr')}</span>
              </div>
              <div className="syntax-item">
                <code>term1 NOT term2</code>
                <span>{t('search.syntaxNot')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <div className="filter-panel" ref={filterRef}>
            {/* File type filter */}
            <div className="filter-section">
              <div className="filter-label">{t('search.filterType')}</div>
              <div className="filter-chips">
                {FILE_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`filter-chip ${filters.fileTypes?.includes(opt.value) ? 'active' : ''}`}
                    onClick={() => toggleFileType(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size filter */}
            <div className="filter-section filter-row">
              <div className="filter-label">{t('search.filterSize')}</div>
              <div className="filter-row-inputs">
                <input
                  type="number"
                  className="filter-number"
                  placeholder={t('search.sizeMin')}
                  value={filters.sizeMin || ''}
                  onChange={(e) => handleFilterChange({ ...filters, sizeMin: Number(e.target.value) || undefined })}
                />
                <span className="filter-range-sep">—</span>
                <input
                  type="number"
                  className="filter-number"
                  placeholder={t('search.sizeMax')}
                  value={filters.sizeMax || ''}
                  onChange={(e) => handleFilterChange({ ...filters, sizeMax: Number(e.target.value) || undefined })}
                />
                <span className="filter-unit">KB</span>
              </div>
            </div>

            {/* Date filter */}
            <div className="filter-section filter-row">
              <div className="filter-label">{t('search.filterDate')}</div>
              <div className="filter-row-inputs">
                <input
                  type="date"
                  className="filter-date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => handleFilterChange({ ...filters, dateFrom: e.target.value || undefined })}
                />
                <span className="filter-range-sep">—</span>
                <input
                  type="date"
                  className="filter-date"
                  value={filters.dateTo || ''}
                  onChange={(e) => handleFilterChange({ ...filters, dateTo: e.target.value || undefined })}
                />
              </div>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <div className="filter-footer">
                <button className="filter-clear" onClick={() => setFilters({})}>
                  {t('search.clearFilters')}
                </button>
                <button className="filter-apply" onClick={handleSearch}>
                  {t('search.applyFilters')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="search-content">
        <div className="file-list-wrapper">
          <FileList
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            formatSize={formatSize}
            hasSearched={hasSearched}
            snippets={snippets}
          />
        </div>
        {selectedFile && (
          <div className="file-detail-area">
            <FileDetail file={selectedFile} formatSize={formatSize} />
          </div>
        )}
      </div>

      <div className="search-footer-bar">
        {hasSearched
          ? t('search.result').replace('{count}', files.length.toString())
          : t('search.noQueryHint')}
      </div>
    </div>
  )
}

export default SearchPage
