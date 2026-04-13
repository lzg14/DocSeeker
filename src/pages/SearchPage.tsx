import { useState, useCallback } from 'react'
import FileList from '../components/FileList'
import FileDetail from '../components/FileDetail'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { formatSize } from '../utils/format'

function SearchPage(): JSX.Element {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const { t } = useLanguage()

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setFiles([])
      setHasSearched(false)
      return
    }
    setIsSearching(true)
    try {
      const result = await window.electron.searchFiles(searchQuery)
      setFiles(result)
      setHasSearched(true)
    } catch (error) {
      console.error('Failed to search files:', error)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="search-page">
      <div className="search-header">
        <div className="search-box-wrapper">
          <input
            type="text"
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? t('search.searching') : t('search.btn')}
          </button>
        </div>
      </div>

      <div className="search-content">
        <div className="file-list-wrapper">
          <FileList
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            formatSize={formatSize}
            hasSearched={hasSearched}
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
