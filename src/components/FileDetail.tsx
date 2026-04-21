import { useState, useEffect, useCallback } from 'react'
import { FileRecord } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { renderPdfPage } from '../utils/pdfRender'

interface Tag {
  id?: number
  name: string
  color: string
}

interface FileDetailProps {
  file: FileRecord
  formatSize: (bytes: number) => string
  searchQuery?: string // 当前搜索关键词，用于高亮
}

function FileDetail({ file, formatSize, searchQuery = '' }: FileDetailProps): JSX.Element {
  const { t } = useLanguage()
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [fileTags, setFileTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<number | null>(null)

  const handleShowInFolder = () => window.electron.showInFolder(file.path)
  const handleOpenFile = () => window.electron.openFile(file.path)

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  // 高亮关键词的函数
  const highlightText = (text: string, query: string): string => {
    if (!query.trim() || !text) return text
    // 转义特殊字符
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 忽略大小写的高亮
    const regex = new RegExp(`(${escapedQuery})`, 'gi')
    return text.replace(regex, '<mark class="search-highlight">$1</mark>')
  }

  // 查找关键词所在行号
  const findKeywordLine = (content: string, query: string): number | null => {
    if (!query.trim() || !content) return null
    const lines = content.split('\n')
    const lowerQuery = query.toLowerCase()
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        return i + 1 // 行号从 1 开始
      }
    }
    return null
  }

  // Load tags for this file
  const loadTags = useCallback(async () => {
    if (!file?.path) return
    try {
      const [tags, all] = await Promise.all([
        window.electron.tagsGetForFile(file.path),
        window.electron.tagsGetAll()
      ])
      setFileTags(tags)
      setAllTags(all)
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }, [file?.path])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  // Load thumbnail when file path changes
  useEffect(() => {
    setThumbnail(null)
    if (!file?.path) return

    const ext = file.path.split('.').pop()?.toLowerCase()

    if (ext === 'pdf') {
      // PDF thumbnail: Windows uses Shell (main process), macOS/Linux use pdfjs-dist Canvas (renderer)
      window.electron.getPlatform().then(platform => {
        if (platform === 'win32') {
          window.electron.thumbnailGet(file.path).then(data => {
            if (data) setThumbnail(data)
          })
        } else {
          // macOS / Linux: pdfjs-dist Canvas in renderer
          renderPdfPage(file.path).then(dataUrl => {
            if (dataUrl) setThumbnail(dataUrl)
          })
        }
      })
    } else {
      // Images and other: always through main process
      window.electron.thumbnailGet(file.path).then(data => {
        if (data) setThumbnail(data)
      })
    }
  }, [file?.path])

  // Tag management functions
  const handleAddTag = async (tag: Tag) => {
    if (!file?.path || !tag.id) return
    try {
      await window.electron.tagsAddToFile(file.path, tag.id)
      await loadTags()
    } catch (err) {
      console.error('Failed to add tag:', err)
    }
  }

  const handleRemoveTag = async (tagId: number) => {
    if (!file?.path) return
    try {
      await window.electron.tagsRemoveFromFile(file.path, tagId)
      await loadTags()
    } catch (err) {
      console.error('Failed to remove tag:', err)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      const tagId = await window.electron.tagsAdd(newTagName.trim())
      if (tagId > 0 && file?.path) {
        await window.electron.tagsAddToFile(file.path, tagId)
      }
      setNewTagName('')
      await loadTags()
    } catch (err) {
      console.error('Failed to create tag:', err)
    }
  }

  const handleDeleteTag = async (tagId: number) => {
    try {
      await window.electron.tagsDelete(tagId)
      await loadTags()
    } catch (err) {
      console.error('Failed to delete tag:', err)
    }
  }

  const fileTagIds = new Set(fileTags.map(t => t.id))

  return (
    <>
      <div className="file-detail">
      {thumbnail && (
        <div className="file-thumbnail-container">
          <img src={thumbnail} alt="preview" className="file-thumbnail-img" />
        </div>
      )}

      <div className="file-detail-name">
        <span>{file.name}</span>
      </div>
      <div className="file-detail-path">{file.path}</div>

      <div className="detail-card">
        <div className="detail-card-title">{t('detail.info')}</div>
        <div className="detail-grid">
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.size')}</div>
            <div className="detail-grid-value">{formatSize(file.size)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.type')}</div>
            <div className="detail-grid-value">{file.file_type || '-'}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.modified')}</div>
            <div className="detail-grid-value">{formatDate(file.updated_at)}</div>
          </div>
          <div className="detail-grid-item">
            <div className="detail-grid-label">{t('detail.md5')}</div>
            <div className="detail-grid-value detail-hash">
              {file.hash ? `${file.hash.slice(0, 8)}...${file.hash.slice(-4)}` : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-title">
          {t('detail.preview')}
          {searchQuery && file.content && (
            <span className="preview-keyword-info">
              {t('detail.keywordAtLine') || '关键词在第'}{' '}
              <strong>{findKeywordLine(file.content, searchQuery) ?? '?'}</strong>{' '}
              {t('detail.line') || '行'}
            </span>
          )}
        </div>
        <div
          className="detail-content-preview"
          dangerouslySetInnerHTML={{
            __html: file.content
              ? highlightText(file.content.slice(0, 1000) + (file.content.length > 1000 ? '...' : ''), searchQuery)
              : t('detail.noContent')
          }}
        />
      </div>

    </div>
    <div className="detail-actions">
      <button className="btn btn-primary" onClick={handleShowInFolder}>
        {t('detail.showInFolder')}
      </button>
      <button className="btn btn-secondary" onClick={handleOpenFile}>
        {t('detail.openFile')}
      </button>
    </div>

      {/* Tags section */}
      <div className="detail-card">
        <div className="detail-card-title">
          <span>{t('detail.tags') || '标签'}</span>
          <button className="tag-add-btn" onClick={() => setShowTagMenu(!showTagMenu)} title={t('detail.addTag') || '添加标签'}>
            +
          </button>
        </div>
        <div className="detail-tags-container">
          {fileTags.length > 0 ? (
            fileTags.map(tag => (
              <span
                key={tag.id}
                className="detail-tag"
                style={{ backgroundColor: tag.color + '20', borderColor: tag.color, color: tag.color }}
              >
                {tag.name}
                <button className="tag-remove-btn" onClick={() => tag.id && handleRemoveTag(tag.id)}>×</button>
              </span>
            ))
          ) : (
            <span className="detail-tags-empty">{t('detail.noTags') || '暂无标签'}</span>
          )}
        </div>

        {/* Tag dropdown menu */}
        {showTagMenu && (
          <div className="tag-menu">
            <div className="tag-menu-header">{t('detail.selectTags') || '选择标签'}</div>
            <div className="tag-menu-list">
              {allTags.filter(tag => !fileTagIds.has(tag.id!)).length === 0 && newTagName.trim() === '' && (
                <div className="tag-menu-empty">{t('detail.noMoreTags') || '暂无更多标签'}</div>
              )}
              {allTags.filter(tag => !fileTagIds.has(tag.id!)).map(tag => (
                <div
                  key={tag.id}
                  className="tag-menu-item"
                  onClick={() => handleAddTag(tag)}
                >
                  <span className="tag-color-dot" style={{ backgroundColor: tag.color }}></span>
                  {tag.name}
                </div>
              ))}
              <div className="tag-menu-create">
                <input
                  type="text"
                  placeholder={t('detail.createTagPlaceholder') || '创建新标签...'}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
                <button onClick={handleCreateTag}>+</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default FileDetail
