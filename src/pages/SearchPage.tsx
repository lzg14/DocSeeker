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
  { value: 'epub', label: 'EPUB' },
  { value: 'zip', label: 'ZIP' },
  { value: 'rar', label: 'RAR' },
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
  const [snippets, setSnippets] = useState<Record<string, string>>({})
  const [saveName, setSaveName] = useState('')
  const [filters, setFilters] = useState<SearchOptions>({})
  const [isDragging, setIsDragging] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [searchScope, setSearchScope] = useState<'all' | 'filename'>('all')
  const [dedupEnabled, setDedupEnabled] = useState(false)
  const [secondaryFilter, setSecondaryFilter] = useState('')
  const { t } = useLanguage()

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const searchScopeRef = useRef<'all' | 'filename'>('all')
  const dedupEnabledRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derived filtered files based on secondary filter
  const filteredFiles = secondaryFilter.trim()
    ? files.filter(f =>
        f.path?.toLowerCase().includes(secondaryFilter.toLowerCase()) ||
        f.name?.toLowerCase().includes(secondaryFilter.toLowerCase())
      )
    : files

  // Sync dedupEnabled to ref so performSearch always reads the latest value
  useEffect(() => {
    dedupEnabledRef.current = dedupEnabled
  }, [dedupEnabled])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Load history and saved searches on mount
  useEffect(() => {
    loadHistory()
    loadSavedSearches()
  }, [])

  // Sync searchScope to ref so performSearch always reads the latest value
  useEffect(() => {
    searchScopeRef.current = searchScope
  }, [searchScope])
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
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
  }

  const loadSavedSearches = async () => {
    try {
      const s = await window.electron.getSavedSearches()
      setSavedSearches(s)
    } catch (error) {
      console.error('Failed to load saved searches:', error)
    }
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
      // Detect /pattern/ regex syntax
      const regexMatch = query.match(/^\/(.+?)\//)
      let result: FileRecord[]
      let snippetQuery = query

      const scope = searchScopeRef.current
      if (regexMatch) {
        // Extract regex pattern and bare keywords
        const regexPattern = regexMatch[1]
        const bareQuery = query.replace(/^\/.+?\/[\s]*/, '').trim()

        // Validate the regex pattern
        try {
          new RegExp(regexPattern)
        } catch {
          setFiles([])
          setHasSearched(true)
          setSnippets({})
          setIsSearching(false)
          loadHistory()
          return
        }

        // Use bare query for FTS search (filename), then filter with JS regex
        const hasFilters = opts &&
          (opts.fileTypes?.length || opts.sizeMin || opts.sizeMax || opts.dateFrom || opts.dateTo)

        const ftsResults = hasFilters
          ? (scope === 'filename'
            ? await window.electron.searchByFileName(bareQuery, opts)
            : dedupEnabledRef.current
              ? await window.electron.searchDeduplicate(bareQuery, opts)
              : await window.electron.searchFilesAdvanced(bareQuery, opts))
          : bareQuery
            ? await window.electron.searchFiles(bareQuery)
            : hasFilters ? await window.electron.searchFilesAdvanced('', opts) : []

        // Filter results by regex against path and content
        const re = new RegExp(regexPattern, 'i')
        result = ftsResults.filter(f => re.test(f.path || '') || re.test(f.content || ''))
        snippetQuery = bareQuery || query
      } else {
        const hasFilters = opts &&
          (opts.fileTypes?.length || opts.sizeMin || opts.sizeMax || opts.dateFrom || opts.dateTo)

        result = hasFilters
          ? (scope === 'filename'
            ? await window.electron.searchByFileName(query, opts)
            : dedupEnabledRef.current
              ? await window.electron.searchDeduplicate(query, opts)
              : await window.electron.searchFilesAdvanced(query, opts))
          : await window.electron.searchFiles(query)
      }

      setFiles(result)
      setHasSearched(true)
      // Fetch highlighted snippets for the results
      if (result.length > 0 && snippetQuery.trim()) {
        const paths = result.filter(f => f.path).map(f => f.path!)
        const s = await window.electron.getSearchSnippets(snippetQuery, paths)
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

  const handleSearch = () => {
    // Clear any pending debounce so immediate search is not delayed
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    performSearch(searchQuery, filters)
  }

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const file = files[0]
    // Use the webkitRelativePath or path if available (Electron provides this)
    const filePath = (file as any).path
    if (!filePath) return

    setIsExtracting(true)
    try {
      const content = await window.electron.extractFileContent(filePath)
      setIsExtracting(false)
      if (content !== null) {
        setSearchQuery(content)
        performSearch(content, filters)
      }
    } catch (error) {
      setIsExtracting(false)
      console.error('Failed to extract file content:', error)
    }
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
      <div
        className={`search-header${isDragging ? ' drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isExtracting && (
          <div className="drag-extracting-hint">{t('search.extracting')}</div>
        )}
        {isDragging && !isExtracting && (
          <div className="drag-hint-overlay">
            <div className="drag-hint-text">{t('search.dropHint')}</div>
          </div>
        )}
        <div className="search-box-row">
          <div className="search-box-wrapper" ref={dropdownRef}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                // Debounce: clear previous timer and schedule a new search
                if (debounceTimerRef.current) {
                  clearTimeout(debounceTimerRef.current)
                }
                debounceTimerRef.current = setTimeout(() => {
                  performSearch(e.target.value, filters)
                }, 300)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => { setShowHistory(true); setShowSaved(false) }}
            />
            <button
              className="btn btn-primary search-btn"
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
              ].reduce((a, b) => (a ?? 0) + (b ?? 0), 0)}</span>}
            </button>
            <button
              className={`toolbar-btn ${searchScope === 'filename' ? 'active' : ''}`}
              onClick={() => setSearchScope(searchScope === 'all' ? 'filename' : 'all')}
              title={searchScope === 'all' ? '切换到仅文件名搜索' : '切换到全部搜索'}
            >
              {searchScope === 'all' ? '🔍 全部' : '📄 仅文件名'}
            </button>
            <button
              className={`toolbar-btn ${dedupEnabled ? 'active' : ''}`}
              onClick={() => setDedupEnabled(d => !d)}
              title={t('search.dedupTip') || '按文件内容 hash 过滤重复文件，仅保留最新修改版本'}
            >
              🔗 {t('search.dedup') || '去重'}
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

        {/* Secondary filter bar — below search box, pushes content down */}
        {files.length > 0 && (
          <div className="secondary-filter-bar">
            <input
              type="text"
              className="secondary-filter-input"
              placeholder={t('search.secondaryFilterPlaceholder') || '在结果中筛选...'}
              value={secondaryFilter}
              onChange={(e) => setSecondaryFilter(e.target.value)}
            />
            {secondaryFilter && (
              <button
                className="secondary-filter-clear"
                onClick={() => setSecondaryFilter('')}
                title={t('search.clearSecondaryFilter') || '清除筛选'}
              >
                ×
              </button>
            )}
            <span className="secondary-filter-count">
              {filteredFiles.length} / {files.length}
            </span>
          </div>
        )}

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
              <div className="syntax-item">
                <code>/regex/</code>
                <span>{t('search.regexMode')}</span>
              </div>
              <div className="syntax-item regex-desc">
                <span>{t('search.regexDesc')}</span>
              </div>
              {/* 新增：字段限定搜索 */}
              <div className="syntax-help-section-title">{t('search.fieldSearch')}</div>
              <div className="syntax-item">
                <code>name:report</code>
                <span>{t('search.syntaxName')}</span>
              </div>
              <div className="syntax-item">
                <code>path:documents</code>
                <span>{t('search.syntaxPath')}</span>
              </div>
              <div className="syntax-item">
                <code>ext:pdf</code>
                <span>{t('search.syntaxExt')}</span>
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
            files={filteredFiles}
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
