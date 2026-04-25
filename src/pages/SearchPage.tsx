import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import FileList from '../components/FileList'
import FileDetail from '../components/FileDetail'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { formatSize } from '../utils/format'
import { exportResults, ExportFormat } from '../utils/exportResults'

// 调试开关：开发时设为 true，正式发布设为 false
const DEBUG = false
const debugLog = (...args: unknown[]) => {
  if (DEBUG) console.log('[DEBUG]', ...args)
}

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
  sortBy?: 'relevance' | 'name' | 'size' | 'modified'
  sortOrder?: 'asc' | 'desc'
}

// Autocomplete suggestion types
interface AutocompleteSuggestion {
  type: 'syntax' | 'history' | 'saved'
  text: string
  description: string
  insertText?: string // What to insert when selected
}

// Autocomplete items
const AUTOCOMPLETE_ITEMS = [
  { text: 'AND', description: '多关键词AND搜索', insertText: ' AND ' },
  { text: 'OR', description: 'OR组合搜索', insertText: ' OR ' },
  { text: 'NOT', description: '排除关键词', insertText: ' NOT ' },
  { text: '"phrase"', description: '精确短语匹配', insertText: '"' },
  { text: 'term*', description: '前缀通配符', insertText: '*' },
  { text: '/regex/', description: '正则搜索', insertText: '//' },
  { text: 'name:', description: '文件名搜索', insertText: 'name:' },
  { text: 'path:', description: '路径搜索', insertText: 'path:' },
  { text: 'ext:', description: '按扩展名筛选', insertText: 'ext:' },
]

const FILE_TYPE_OPTIONS = [
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pptx', label: 'PPT' },
  { value: 'pdf', label: 'PDF' },
  { value: 'xps', label: 'XPS' },
  { value: 'text', label: '文本' },
  { value: 'html', label: 'HTML' },
  { value: 'svg', label: 'SVG' },
  { value: 'rtf', label: 'RTF' },
  { value: 'chm', label: 'CHM' },
  { value: 'odf', label: 'ODF' },
  { value: 'email', label: '邮件' },
  { value: 'epub', label: 'EPUB' },
  { value: 'zip', label: 'ZIP' },
  { value: 'rar', label: 'RAR' },
  { value: 'image', label: '图片元数据' },
  { value: 'media', label: '音视频' },
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

  // 调试：追踪 files 状态变化
  useEffect(() => {
    debugLog('files state changed: count=', files.length, 'types=', files.slice(0,5).map(f => f.file_type))
  }, [files])
  const [dedupEnabled, setDedupEnabled] = useState(false)
  const [fuzzyEnabled, setFuzzyEnabled] = useState(false)
  const [secondaryFilter, setSecondaryFilter] = useState('')
  const [pendingEvents, setPendingEvents] = useState<{ event: string; path: string }[]>([])
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Sort state
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'size' | 'modified'>('relevance')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(-1)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const searchScopeRef = useRef<'all' | 'filename'>('all')
  const dedupEnabledRef = useRef(false)
  const fuzzyEnabledRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchCounterRef = useRef(0)
  const filtersRef = useRef(filters)

  // Keep filtersRef in sync with filters state
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  // Derived filtered files based on secondary filter
  const filteredFiles = secondaryFilter.trim()
    ? files.filter(f =>
        f.path?.toLowerCase().includes(secondaryFilter.toLowerCase()) ||
        f.name?.toLowerCase().includes(secondaryFilter.toLowerCase())
      )
    : files

  // Sort files based on sort criteria
  const sortedFiles = useMemo(() => {
    debugLog('sortedFiles computed: filteredFiles count=', filteredFiles.length)
    if (sortBy === 'relevance') {
      return filteredFiles // Keep original order (BM25 relevance)
    }

    return [...filteredFiles].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '')
          break
        case 'size':
          cmp = (a.size || 0) - (b.size || 0)
          break
        case 'modified':
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
          cmp = aTime - bTime
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [filteredFiles, sortBy, sortOrder])

  // Sync dedupEnabled to ref so performSearch always reads the latest value
  useEffect(() => {
    dedupEnabledRef.current = dedupEnabled
  }, [dedupEnabled])

  useEffect(() => {
    fuzzyEnabledRef.current = fuzzyEnabled
  }, [fuzzyEnabled])

  // Listen for USN file change events
  useEffect(() => {
    const unsub = window.electron.onUsnUpdate((ev) => {
      if (ev.event === 'created' || ev.event === 'renamed') {
        setPendingEvents(prev => [...prev, ev])
      }
    })
    return unsub
  }, [])

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

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

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
    // Increment search counter to track this search request
    const searchId = ++searchCounterRef.current

    // 使用最新的 filters（通过 ref 避免闭包问题）
    const currentFilters = filtersRef.current
    // 合并 opts 和 currentFilters，确保有过滤条件时使用新值，没有时使用当前 filters
    const searchOpts = { ...currentFilters, ...opts }
    debugLog('performSearch called, query:', JSON.stringify(query), 'opts:', JSON.stringify(opts), 'searchOpts:', JSON.stringify(searchOpts))
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
          // Discard if a newer search has started
          if (searchId !== searchCounterRef.current) return
          setFiles([])
          setHasSearched(true)
          setSnippets({})
          setIsSearching(false)
          loadHistory()
          return
        }

        // Use bare query for FTS search (filename), then filter with JS regex
        const hasFilters = searchOpts &&
          (searchOpts.fileTypes?.length || searchOpts.sizeMin || searchOpts.sizeMax || searchOpts.dateFrom || searchOpts.dateTo)

        let ftsResults: FileRecord[]
        if (hasFilters) {
          ftsResults = scope === 'filename'
            ? await window.electron.searchByFileName(bareQuery, searchOpts)
            : dedupEnabledRef.current
              ? await window.electron.searchDeduplicate(bareQuery, searchOpts)
              : await window.electron.searchFilesAdvanced(bareQuery, searchOpts)
        } else if (bareQuery) {
          ftsResults = fuzzyEnabledRef.current
            ? await window.electron.searchFilesFuzzy(bareQuery)
            : await window.electron.searchFiles(bareQuery)
        } else if (hasFilters) {
          ftsResults = await window.electron.searchFilesAdvanced('', searchOpts)
        } else {
          ftsResults = []
        }

        // Discard if a newer search has started
        if (searchId !== searchCounterRef.current) return

        // Filter results by regex against path and content
        const re = new RegExp(regexPattern, 'i')
        result = ftsResults.filter(f => re.test(f.path || '') || re.test(f.content || ''))
        snippetQuery = bareQuery || query
      } else {
        const hasFilters = searchOpts &&
          (searchOpts.fileTypes?.length || searchOpts.sizeMin || searchOpts.sizeMax || searchOpts.dateFrom || searchOpts.dateTo)

        // Filename-only search: always use searchByFileName when scope is 'filename'
        if (scope === 'filename') {
          result = await window.electron.searchByFileName(query, searchOpts)
        } else if (hasFilters) {
          result = dedupEnabledRef.current
            ? await window.electron.searchDeduplicate(query, searchOpts)
            : await window.electron.searchFilesAdvanced(query, searchOpts)
        } else {
          result = fuzzyEnabledRef.current
            ? await window.electron.searchFilesFuzzy(query)
            : await window.electron.searchFiles(query)
        }
      }

      // Discard if a newer search has started
      if (searchId !== searchCounterRef.current) {
        debugLog('setFiles discarded: searchId', searchId, 'current', searchCounterRef.current)
        return
      }

      debugLog('setFiles called: result.length=', result.length, 'fileTypes=', result.slice(0,3).map(f => f.file_type))
      setFiles(result)
      setHasSearched(true)
      // Fetch highlighted snippets for the results
      if (result.length > 0 && snippetQuery.trim()) {
        const paths = result.filter(f => f.path).map(f => f.path!)
        const s = await window.electron.getSearchSnippets(snippetQuery, paths)
        // Final discard check after async operation
        if (searchId !== searchCounterRef.current) return
        setSnippets(s)
      } else {
        setSnippets({})
      }
      loadHistory()
    } catch (error) {
      console.error('Failed to search files:', error)
    } finally {
      // Only clear searching state if this is still the current search
      if (searchId === searchCounterRef.current) {
        setIsSearching(false)
      }
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

  const handleExport = (format: ExportFormat) => {
    exportResults({ query: searchQuery, files, snippets, formatSize }, format)
    setShowExportMenu(false)
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
    debugLog('handleFilterChange called, searchQuery:', JSON.stringify(searchQuery), 'filters:', JSON.stringify(newFilters))
    // 立即更新 ref，确保 performSearch 使用最新的 filters
    filtersRef.current = newFilters
    setFilters(newFilters)
    // Trigger re-search with new filters if there's an active search
    if (searchQuery.trim()) {
      debugLog('Calling performSearch with filters:', JSON.stringify(newFilters))
      performSearch(searchQuery, newFilters)
    } else {
      debugLog('No searchQuery, skipping performSearch')
    }
  }

  const handleLoadPending = async () => {
    if (pendingEvents.length === 0) return
    await performSearch(searchQuery, filters)
    setPendingEvents([])
  }

  const handleDismissPending = () => {
    setPendingEvents([])
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

  // Update autocomplete suggestions based on current input
  const updateAutocomplete = useCallback((input: string, cursorPos: number) => {
    if (!input.trim()) {
      setAutocompleteSuggestions([])
      setShowAutocomplete(false)
      return
    }

    const suggestions: AutocompleteSuggestion[] = []
    const inputLower = input.toLowerCase()
    const textBeforeCursor = input.substring(0, cursorPos)
    const lastWordMatch = textBeforeCursor.match(/[\w]+$/)

    if (!lastWordMatch) {
      setAutocompleteSuggestions([])
      setShowAutocomplete(false)
      return
    }

    const prefix = lastWordMatch[0]

    // Filter syntax suggestions (show all if input is short)
    if (prefix.length >= 1) {
      AUTOCOMPLETE_ITEMS.forEach(item => {
        if (item.text.toLowerCase().startsWith(prefix.toLowerCase()) ||
            (prefix.length >= 2 && item.text.toLowerCase().includes(prefix.toLowerCase()))) {
          suggestions.push({
            type: 'syntax',
            text: item.text,
            description: item.description,
            insertText: item.insertText
          })
        }
      })
    }

    // Add matching history
    history.forEach(h => {
      if (h.query.toLowerCase().startsWith(inputLower) && suggestions.length < 5) {
        if (!suggestions.find(s => s.text === h.query)) {
          suggestions.push({
            type: 'history',
            text: h.query,
            description: h.searched_at ? new Date(h.searched_at).toLocaleDateString('zh-CN') : ''
          })
        }
      }
    })

    // Add matching saved searches
    savedSearches.forEach(s => {
      if (s.query.toLowerCase().startsWith(inputLower) && suggestions.length < 5) {
        if (!suggestions.find(su => su.text === s.query)) {
          suggestions.push({
            type: 'saved',
            text: s.query,
            description: s.name
          })
        }
      }
    })

    setAutocompleteSuggestions(suggestions)
    setShowAutocomplete(suggestions.length > 0)
    setSelectedAutocompleteIndex(-1)
  }, [history, savedSearches])

  // Click outside handler for autocomplete
  useEffect(() => {
    if (!showAutocomplete) return
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node) &&
          e.target !== inputRef.current) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAutocomplete])

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
                // Update autocomplete
                updateAutocomplete(e.target.value, e.target.selectionStart || e.target.value.length)
                // Debounce: clear previous timer and schedule a new search
                if (debounceTimerRef.current) {
                  clearTimeout(debounceTimerRef.current)
                }
                debounceTimerRef.current = setTimeout(() => {
                  performSearch(e.target.value, filters)
                }, 300)
              }}
              onKeyDown={(e) => {
                // Autocomplete navigation
                if (showAutocomplete && autocompleteSuggestions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedAutocompleteIndex(prev =>
                      prev < autocompleteSuggestions.length - 1 ? prev + 1 : 0
                    )
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedAutocompleteIndex(prev =>
                      prev > 0 ? prev - 1 : autocompleteSuggestions.length - 1
                    )
                    return
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && selectedAutocompleteIndex >= 0)) {
                    e.preventDefault()
                    const selected = autocompleteSuggestions[selectedAutocompleteIndex >= 0 ? selectedAutocompleteIndex : 0]
                    if (selected) {
                      // Replace the current word with the suggestion
                      const cursorPos = e.currentTarget.selectionStart || searchQuery.length
                      const textBeforeCursor = searchQuery.substring(0, cursorPos)
                      const textAfterCursor = searchQuery.substring(cursorPos)
                      const lastWordMatch = textBeforeCursor.match(/[\w*\/]+$/)

                      if (lastWordMatch) {
                        const newTextBefore = textBeforeCursor.substring(0, textBeforeCursor.length - lastWordMatch[0].length)
                        const insertText = selected.insertText || selected.text
                        setSearchQuery(newTextBefore + insertText + textAfterCursor)
                        updateAutocomplete(newTextBefore + insertText, (newTextBefore + insertText).length)
                      } else {
                        setSearchQuery(selected.text)
                        updateAutocomplete(selected.text, selected.text.length)
                      }
                      setShowAutocomplete(false)
                    }
                    return
                  }
                  if (e.key === 'Escape') {
                    setShowAutocomplete(false)
                    return
                  }
                }

                // Default search behavior
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
              onFocus={() => { setShowHistory(true); setShowSaved(false); setShowAutocomplete(false) }}
            />

            {/* Autocomplete dropdown */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div className="autocomplete-dropdown" ref={autocompleteRef}>
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <div
                    key={`${suggestion.type}-${suggestion.text}`}
                    className={`autocomplete-item ${idx === selectedAutocompleteIndex ? 'selected' : ''} ${suggestion.type}`}
                    onClick={() => {
                      // Apply suggestion
                      const cursorPos = inputRef.current?.selectionStart || searchQuery.length
                      const textBeforeCursor = searchQuery.substring(0, cursorPos)
                      const textAfterCursor = searchQuery.substring(cursorPos)
                      const lastWordMatch = textBeforeCursor.match(/[\w*\/]+$/)

                      if (lastWordMatch) {
                        const newTextBefore = textBeforeCursor.substring(0, textBeforeCursor.length - lastWordMatch[0].length)
                        const insertText = suggestion.insertText || suggestion.text
                        setSearchQuery(newTextBefore + insertText + textAfterCursor)
                      } else {
                        setSearchQuery(suggestion.text)
                      }
                      setShowAutocomplete(false)
                      inputRef.current?.focus()
                    }}
                  >
                    <span className="autocomplete-text">
                      {suggestion.type === 'syntax' && <code>{suggestion.text}</code>}
                      {suggestion.type === 'history' && <span>🕐</span>}
                      {suggestion.type === 'saved' && <span>⭐</span>}
                      {suggestion.type !== 'syntax' && suggestion.text}
                    </span>
                    <span className="autocomplete-desc">{suggestion.description}</span>
                  </div>
                ))}
              </div>
            )}
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
              title={searchScope === 'all' ? t('search.scopeTitleAll') : t('search.scopeTitleFilename')}
            >
              {searchScope === 'all' ? `🔍 ${t('search.scopeAll')}` : `📄 ${t('search.scopeFilename')}`}
            </button>
            <button
              className={`toolbar-btn ${dedupEnabled ? 'active' : ''}`}
              onClick={() => setDedupEnabled(d => !d)}
              title={t('search.dedupTip') || '按文件内容 hash 过滤重复文件，仅保留最新修改版本'}
            >
              🔗 {t('search.dedup') || '去重'}
            </button>
            <button
              className={`toolbar-btn ${fuzzyEnabled ? 'active' : ''}`}
              onClick={() => setFuzzyEnabled(f => !f)}
              title={t('search.fuzzyTip') || '模糊搜索，容忍拼写错误'}
            >
              ✨ {t('search.fuzzy') || '模糊'}
            </button>
            <button
              className={`toolbar-btn ${showSyntaxHelp ? 'active' : ''}`}
              onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
              title={t('search.syntaxHelp')}
            >
              ?
            </button>
            {/* Export button */}
            {files.length > 0 && (
              <div className="export-wrapper" ref={exportMenuRef} style={{ position: 'relative' }}>
                <button
                  className={`toolbar-btn ${showExportMenu ? 'active' : ''}`}
                  onClick={() => setShowExportMenu(v => !v)}
                  title={t('search.export') || '导出结果'}
                >
                  {t('search.export') || '导出'}
                </button>
                {showExportMenu && (
                  <div className="export-dropdown">
                    <div className="export-dropdown-item" onClick={() => handleExport('csv')}>
                      <span>📊</span> CSV
                    </div>
                    <div className="export-dropdown-item" onClick={() => handleExport('html')}>
                      <span>🌐</span> HTML
                    </div>
                    <div className="export-dropdown-item" onClick={() => handleExport('txt')}>
                      <span>📝</span> TXT
                    </div>
                  </div>
                )}
              </div>
            )}
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

            {/* Sort dropdown */}
            <div className="sort-wrapper">
              <button
                className={`toolbar-btn sort-btn ${sortBy !== 'relevance' ? 'active' : ''}`}
                onClick={() => {
                  // Toggle sort dropdown - cycle through sort options
                  const sortOptions: Array<'relevance' | 'name' | 'size' | 'modified'> = ['relevance', 'name', 'size', 'modified']
                  const currentIndex = sortOptions.indexOf(sortBy)
                  const nextIndex = (currentIndex + 1) % sortOptions.length
                  setSortBy(sortOptions[nextIndex])
                }}
                title={t('search.sortBy') || '排序'}
              >
                {sortBy === 'relevance' && '📊'}
                {sortBy === 'name' && '📝'}
                {sortBy === 'size' && '📦'}
                {sortBy === 'modified' && '🕐'}
                <span className="sort-label">
                  {sortBy === 'relevance' && (t('search.sortRelevance') || '相关')}
                  {sortBy === 'name' && (t('search.sortName') || '名称')}
                  {sortBy === 'size' && (t('search.sortSize') || '大小')}
                  {sortBy === 'modified' && (t('search.sortModified') || '时间')}
                </span>
                {sortBy !== 'relevance' && (
                  <button
                    className="sort-order-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
                    }}
                    title={sortOrder === 'asc' ? (t('search.sortAsc') || '升序') : (t('search.sortDesc') || '降序')}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                )}
              </button>
            </div>

            <span className="secondary-filter-count">
              {sortedFiles.length} / {files.length}
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
        {pendingEvents.length > 0 && (
          <div className="usn-banner">
            <span>📂 {pendingEvents.length} 个新文件已变更</span>
            <button className="usn-banner-btn" onClick={handleLoadPending}>
              {t('search.loadNew')}
            </button>
            <button className="usn-banner-btn usn-banner-btn-dismiss" onClick={handleDismissPending}>
              {t('search.dismiss')}
            </button>
          </div>
        )}

        <div className="file-list-wrapper" key={`fl-${searchQuery}-${sortedFiles.length}`}>
          <FileList
            files={sortedFiles}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            formatSize={formatSize}
            hasSearched={hasSearched}
            snippets={snippets}
            searchQuery={searchQuery}
          />
        </div>
        {selectedFile && (
          <div className="file-detail-area">
            <FileDetail file={selectedFile} formatSize={formatSize} searchQuery={searchQuery} />
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
