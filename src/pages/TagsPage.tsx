import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

interface Tag {
  id?: number
  name: string
  color: string
}

const TAG_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#9333ea', // Purple
  '#ea580c', // Orange
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#64748b', // Gray
]

function TagsPage(): JSX.Element {
  const { t } = useLanguage()
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('')

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    const allTags = await window.electron.tagsGetAll()
    setTags(allTags)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    await window.electron.tagsAdd(newTagName.trim(), newTagColor)
    setNewTagName('')
    await loadTags()
  }

  const handleStartEditTag = (tag: Tag) => {
    setEditingTag(tag)
    setEditTagName(tag.name)
    setEditTagColor(tag.color)
  }

  const handleSaveEditTag = async () => {
    if (!editingTag?.id || !editTagName.trim()) return
    await window.electron.tagsUpdate(editingTag.id, { name: editTagName.trim(), color: editTagColor })
    setEditingTag(null)
    await loadTags()
  }

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm('确定要删除这个标签吗？该标签会从所有文件中移除。')) return
    await window.electron.tagsDelete(tagId)
    await loadTags()
  }

  return (
    <div className="tags-page">
      <div className="tags-header">
        <h2>标签管理</h2>
        <p className="tags-desc">创建和管理标签，用于给文件分类。标签可以添加到任意文件。</p>
      </div>

      {/* Create new tag */}
      <div className="tags-create-section">
        <div className="tags-create-row">
          <input
            type="text"
            placeholder="输入标签名称"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
            className="tags-input"
          />
          <div className="tags-colors">
            {TAG_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                className={`tag-color-btn ${newTagColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleCreateTag}>
            创建标签
          </button>
        </div>
      </div>

      {/* Tag list */}
      <div className="tags-list-section">
        <div className="tags-list-header">
          <span>已创建 {tags.length} 个标签</span>
        </div>
        <div className="tags-grid">
          {tags.length === 0 && (
            <div className="tags-empty">
              <p>暂无标签</p>
              <p className="tags-empty-hint">在上方创建第一个标签</p>
            </div>
          )}
          {tags.map(tag => (
            <div
              key={tag.id}
              className="tag-item"
              style={{ borderColor: tag.color, backgroundColor: tag.color + '10' }}
            >
              <div className="tag-item-header">
                <div className="tag-color-dot" style={{ backgroundColor: tag.color }} />
                {editingTag?.id === tag.id ? (
                  <div className="tag-edit-form">
                    <input
                      type="text"
                      value={editTagName}
                      onChange={e => setEditTagName(e.target.value)}
                      className="tag-edit-input"
                      autoFocus
                    />
                    <div className="tag-edit-colors">
                      {TAG_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setEditTagColor(color)}
                          className={`tag-color-btn ${editTagColor === color ? 'active' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="tag-edit-actions">
                      <button onClick={handleSaveEditTag} className="tag-btn tag-btn-save" title="保存">✓</button>
                      <button onClick={() => setEditingTag(null)} className="tag-btn tag-btn-cancel" title="取消">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="tag-name" style={{ color: tag.color }}>{tag.name}</span>
                    <div className="tag-actions">
                      <button onClick={() => handleStartEditTag(tag)} className="tag-btn" title="编辑">✏️</button>
                      <button onClick={() => tag.id && handleDeleteTag(tag.id)} className="tag-btn tag-btn-delete" title="删除">🗑️</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .tags-page {
          padding: 24px;
          max-width: 800px;
          margin: 0 auto;
        }
        .tags-header {
          margin-bottom: 24px;
        }
        .tags-header h2 {
          margin: 0 0 8px 0;
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .tags-desc {
          color: var(--text-muted);
          font-size: 14px;
          margin: 0;
        }
        .tags-create-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .tags-create-row {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .tags-input {
          flex: 1;
          min-width: 200px;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        .tags-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .tags-colors {
          display: flex;
          gap: 6px;
        }
        .tag-color-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .tag-color-btn:hover {
          transform: scale(1.1);
        }
        .tag-color-btn.active {
          border-color: var(--text-primary);
          box-shadow: 0 0 0 2px var(--bg-primary);
        }
        .tags-list-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .tags-list-header {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }
        .tags-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }
        .tags-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }
        .tags-empty p {
          margin: 0;
        }
        .tags-empty-hint {
          font-size: 13px;
          margin-top: 8px !important;
          opacity: 0.7;
        }
        .tag-item {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
        }
        .tag-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tag-color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .tag-name {
          font-weight: 500;
          font-size: 14px;
          flex: 1;
        }
        .tag-actions {
          display: flex;
          gap: 4px;
        }
        .tag-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .tag-btn:hover {
          background: var(--bg-hover);
        }
        .tag-btn-delete:hover {
          background: #fee2e2;
        }
        .tag-edit-form {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          flex-wrap: wrap;
        }
        .tag-edit-input {
          flex: 1;
          min-width: 100px;
          padding: 4px 8px;
          border: 1px solid var(--border);
          border-radius: 4px;
          font-size: 13px;
          background: var(--bg-primary);
        }
        .tag-edit-colors {
          display: flex;
          gap: 4px;
        }
        .tag-edit-actions {
          display: flex;
          gap: 4px;
        }
      `}</style>
    </div>
  )
}

export default TagsPage