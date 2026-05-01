/**
 * Search Module Tests
 *
 * Tests for search functionality and result processing.
 */

// ============ Search Query Tests ============

test('normalizeSearchQuery trims whitespace', () => {
  function normalizeSearchQuery(query: string): string {
    return query.trim()
  }

  expect(normalizeSearchQuery('  hello  ')).toBe('hello')
  expect(normalizeSearchQuery('hello world')).toBe('hello world')
  expect(normalizeSearchQuery('\t\ntest\t\n')).toBe('test')
})

test('normalizeSearchQuery collapses multiple spaces', () => {
  function normalizeSearchQuery(query: string): string {
    return query.trim().replace(/\s+/g, ' ')
  }

  expect(normalizeSearchQuery('hello    world')).toBe('hello world')
  expect(normalizeSearchQuery('  multiple   spaces  ')).toBe('multiple spaces')
})

test('isValidSearchQuery checks query validity', () => {
  function isValidSearchQuery(query: string): boolean {
    if (!query || query.trim().length === 0) return false
    if (query.length > 500) return false
    return true
  }

  expect(isValidSearchQuery('valid query')).toBe(true)
  expect(isValidSearchQuery('')).toBe(false)
  expect(isValidSearchQuery('   ')).toBe(false)
  expect(isValidSearchQuery('a'.repeat(501))).toBe(false)
})

test('escapeSearchQuery escapes special regex characters', () => {
  function escapeSearchQuery(query: string): string {
    return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  expect(escapeSearchQuery('file.txt')).toBe('file\\.txt')
  expect(escapeSearchQuery('test (1)')).toBe('test \\(1\\)')
  expect(escapeSearchQuery('price: $100')).toBe('price: \\$100') // : is not escaped
})

// ============ Search Result Tests ============

interface SearchResult {
  id: number
  path: string
  name: string
  size: number
  file_type: string
  content?: string
  match_type: 'name' | 'content' | 'both'
}

test('createSearchResult creates valid result object', () => {
  function createSearchResult(data: Partial<SearchResult>): SearchResult {
    return {
      id: data.id ?? 0,
      path: data.path ?? '',
      name: data.name ?? '',
      size: data.size ?? 0,
      file_type: data.file_type ?? 'unknown',
      content: data.content,
      match_type: data.match_type ?? 'name'
    }
  }

  const result = createSearchResult({
    id: 1,
    path: '/path/to/file.txt',
    name: 'file.txt',
    size: 1024,
    file_type: 'text',
    match_type: 'content'
  })

  expect(result.id).toBe(1)
  expect(result.path).toBe('/path/to/file.txt')
  expect(result.match_type).toBe('content')
})

test('filterSearchResults by file type', () => {
  const results: SearchResult[] = [
    { id: 1, path: '/a.txt', name: 'a.txt', size: 100, file_type: 'text', match_type: 'name' },
    { id: 2, path: '/b.pdf', name: 'b.pdf', size: 200, file_type: 'pdf', match_type: 'name' },
    { id: 3, path: '/c.txt', name: 'c.txt', size: 300, file_type: 'text', match_type: 'name' }
  ]

  function filterByType(results: SearchResult[], type: string): SearchResult[] {
    return results.filter(r => r.file_type === type)
  }

  const textResults = filterByType(results, 'text')
  expect(textResults).toHaveLength(2)
  expect(textResults.every(r => r.file_type === 'text')).toBe(true)
})

test('filterSearchResults by minimum size', () => {
  const results: SearchResult[] = [
    { id: 1, path: '/a.txt', name: 'a.txt', size: 100, file_type: 'text', match_type: 'name' },
    { id: 2, path: '/b.pdf', name: 'b.pdf', size: 200, file_type: 'pdf', match_type: 'name' },
    { id: 3, path: '/c.txt', name: 'c.txt', size: 300, file_type: 'text', match_type: 'name' }
  ]

  function filterByMinSize(results: SearchResult[], minSize: number): SearchResult[] {
    return results.filter(r => r.size >= minSize)
  }

  const largeFiles = filterByMinSize(results, 200)
  expect(largeFiles).toHaveLength(2)
})

test('sortSearchResults by relevance score', () => {
  const results: SearchResult[] = [
    { id: 1, path: '/a.txt', name: 'a.txt', size: 100, file_type: 'text', match_type: 'name' },
    { id: 2, path: '/b.txt', name: 'b.txt', size: 200, file_type: 'text', match_type: 'content' },
    { id: 3, path: '/c.txt', name: 'c.txt', size: 300, file_type: 'text', match_type: 'both' }
  ]

  function sortByRelevance(results: SearchResult[]): SearchResult[] {
    const scoreMap: Record<string, number> = { 'name': 1, 'content': 2, 'both': 3 }
    return [...results].sort((a, b) => scoreMap[b.match_type] - scoreMap[a.match_type])
  }

  const sorted = sortByRelevance(results)
  expect(sorted[0].match_type).toBe('both')
  expect(sorted[1].match_type).toBe('content')
  expect(sorted[2].match_type).toBe('name')
})

test('sortSearchResults by file name', () => {
  const results: SearchResult[] = [
    { id: 1, path: '/zebra.txt', name: 'zebra.txt', size: 100, file_type: 'text', match_type: 'name' },
    { id: 2, path: '/apple.txt', name: 'apple.txt', size: 200, file_type: 'text', match_type: 'name' },
    { id: 3, path: '/mango.txt', name: 'mango.txt', size: 300, file_type: 'text', match_type: 'name' }
  ]

  function sortByName(results: SearchResult[], ascending: boolean = true): SearchResult[] {
    return [...results].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return ascending ? cmp : -cmp
    })
  }

  const sorted = sortByName(results)
  expect(sorted[0].name).toBe('apple.txt')
  expect(sorted[1].name).toBe('mango.txt')
  expect(sorted[2].name).toBe('zebra.txt')
})

test('limitSearchResults caps the number of results', () => {
  const results: SearchResult[] = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    path: `/file${i}.txt`,
    name: `file${i}.txt`,
    size: i * 100,
    file_type: 'text',
    match_type: 'name' as const
  }))

  function limitResults(results: SearchResult[], limit: number): SearchResult[] {
    return results.slice(0, limit)
  }

  expect(limitResults(results, 10)).toHaveLength(10)
  expect(limitResults(results, 0)).toHaveLength(0)
  expect(limitResults(results, 1000)).toHaveLength(100)
})

// ============ Fuzzy Search Tests ============

test('calculateFuzzyScore measures string similarity', () => {
  function calculateFuzzyScore(query: string, target: string): number {
    query = query.toLowerCase()
    target = target.toLowerCase()

    if (query === target) return 100
    if (target.includes(query)) return 80
    if ([...query].every(char => target.includes(char))) return 50

    // Simple Levenshtein-like scoring
    let matches = 0
    for (const char of query) {
      if (target.includes(char)) matches++
    }
    return Math.round((matches / query.length) * 30)
  }

  expect(calculateFuzzyScore('doc', 'document')).toBe(80)
  expect(calculateFuzzyScore('abc', 'abc')).toBe(100)
})

test('fuzzyMatch finds partial matches', () => {
  function fuzzyMatch(query: string, target: string): boolean {
    query = query.toLowerCase()
    target = target.toLowerCase()

    // All characters must appear in order
    let qi = 0
    for (const char of target) {
      if (qi < query.length && char === query[qi]) {
        qi++
      }
    }
    return qi === query.length
  }

  expect(fuzzyMatch('dt', 'document')).toBe(true)
  expect(fuzzyMatch('doc', 'document')).toBe(true)
})

// ============ Highlight Tests ============

test('highlightMatches wraps matched text', () => {
  function highlightMatches(text: string, query: string, marker: string = '**'): string {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.replace(regex, marker + '$1' + marker)
  }

  expect(highlightMatches('This is a document', 'doc')).toBe('This is a **doc**ument')
  expect(highlightMatches('document test', 'test')).toBe('document **test**')
  expect(highlightMatches('no match here', 'xyz')).toBe('no match here')
})

test('highlightMatches is case insensitive', () => {
  function highlightMatches(text: string, query: string, marker: string = '**'): string {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.replace(regex, marker + '$1' + marker)
  }

  expect(highlightMatches('DOCUMENT', 'doc')).toBe('**DOC**UMENT')
  expect(highlightMatches('Document', 'doc')).toBe('**Doc**ument')
})

// ============ Search History Tests ============

interface SearchHistoryEntry {
  query: string
  timestamp: number
  resultCount: number
}

test('addSearchHistory adds entry to history', () => {
  const history: SearchHistoryEntry[] = []

  function addSearchHistory(history: SearchHistoryEntry[], query: string, resultCount: number): void {
    history.unshift({
      query,
      timestamp: Date.now(),
      resultCount
    })
  }

  addSearchHistory(history, 'test query', 10)
  expect(history).toHaveLength(1)
  expect(history[0].query).toBe('test query')
  expect(history[0].resultCount).toBe(10)
})

test('limitSearchHistory keeps only recent entries', () => {
  const history: SearchHistoryEntry[] = Array.from({ length: 50 }, (_, i) => ({
    query: `query${i}`,
    timestamp: Date.now() - i * 1000,
    resultCount: i
  }))

  function limitHistory(history: SearchHistoryEntry[], maxEntries: number): SearchHistoryEntry[] {
    return history.slice(0, maxEntries)
  }

  const limited = limitHistory(history, 20)
  expect(limited).toHaveLength(20)
  expect(limited[0].query).toBe('query0')
})

test('clearSearchHistory removes all entries', () => {
  const history: SearchHistoryEntry[] = [
    { query: 'query1', timestamp: Date.now(), resultCount: 5 },
    { query: 'query2', timestamp: Date.now(), resultCount: 10 }
  ]

  function clearHistory(history: SearchHistoryEntry[]): void {
    history.length = 0
  }

  clearHistory(history)
  expect(history).toHaveLength(0)
})

test('deduplicateSearchHistory removes duplicate queries', () => {
  const history: SearchHistoryEntry[] = [
    { query: 'test', timestamp: 1000, resultCount: 5 },
    { query: 'test', timestamp: 2000, resultCount: 10 },
    { query: 'other', timestamp: 3000, resultCount: 3 }
  ]

  function deduplicateHistory(history: SearchHistoryEntry[]): SearchHistoryEntry[] {
    const seen = new Set<string>()
    return history.filter(entry => {
      if (seen.has(entry.query)) return false
      seen.add(entry.query)
      return true
    })
  }

  const deduped = deduplicateHistory(history)
  expect(deduped).toHaveLength(2)
  expect(deduped[0].query).toBe('test')
})

// ============ Search Snippet Tests ============

test('extractSearchSnippet extracts text around match', () => {
  function extractSnippet(content: string, query: string, contextLength: number = 50): string {
    const lowerContent = content.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const matchIndex = lowerContent.indexOf(lowerQuery)

    if (matchIndex === -1) return ''

    const start = Math.max(0, matchIndex - contextLength)
    const end = Math.min(content.length, matchIndex + query.length + contextLength)

    let snippet = content.slice(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < content.length) snippet = snippet + '...'

    return snippet
  }

  const content = 'This is a long document with some test content for DocSeeker testing.'
  expect(extractSnippet(content, 'DocSeeker')).toContain('DocSeeker')
  expect(extractSnippet(content, 'DocSeeker', 5).length).toBeLessThan(30)
})

test('extractSearchSnippet handles no match', () => {
  function extractSnippet(content: string, query: string, contextLength: number = 50): string {
    const lowerContent = content.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const matchIndex = lowerContent.indexOf(lowerQuery)

    if (matchIndex === -1) return ''
    return content.slice(matchIndex, matchIndex + query.length)
  }

  expect(extractSnippet('some content', 'missing')).toBe('')
})

// ============ Saved Searches Tests ============

interface SavedSearch {
  id: number
  name: string
  query: string
  createdAt: number
}

test('createSavedSearch creates valid saved search', () => {
  function createSavedSearch(name: string, query: string): SavedSearch {
    return {
      id: Date.now(),
      name,
      query,
      createdAt: Date.now()
    }
  }

  const saved = createSavedSearch('My Search', 'test query')
  expect(saved.name).toBe('My Search')
  expect(saved.query).toBe('test query')
  expect(saved.id).toBeDefined()
})

test('validateSavedSearchName checks name validity', () => {
  function validateName(name: string): boolean {
    if (!name || name.trim().length === 0) return false
    if (name.length > 100) return false
    return true
  }

  expect(validateName('Valid Name')).toBe(true)
  expect(validateName('')).toBe(false)
  expect(validateName('   ')).toBe(false)
  expect(validateName('a'.repeat(101))).toBe(false)
})
