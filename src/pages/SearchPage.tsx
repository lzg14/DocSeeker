import { useState, useCallback } from 'react'
import FileList from '../components/FileList'
import FileDetail from '../components/FileDetail'
import { FileRecord } from '../types'

function SearchPage(): JSX.Element {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const searchFiles = useCallback(async (query: string) => {
    setIsSearching(true)
    try {
      const result = await window.electron.searchFiles(query)
      setFiles(result)
      setHasSearched(true)
    } catch (error) {
      console.error('Failed to search files:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearch = (): void => {
    if (searchQuery.trim()) {
      searchFiles(searchQuery)
    } else {
      setFiles([])
      setHasSearched(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="search-page">
      <div className="search-header">
        <div className="search-box">
          <input
            type="text"
            placeholder="输入关键词搜索文件名或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-primary search-btn"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? '搜索中...' : '搜索'}
          </button>
        </div>
      </div>

      <div className="search-content">
        <div className="file-list-area">
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

      <div className="search-footer">
        {hasSearched ? (
          <span>搜索结果: {files.length} 个文件</span>
        ) : (
          <span>请输入关键词搜索文件</span>
        )}
      </div>
    </div>
  )
}

export default SearchPage
