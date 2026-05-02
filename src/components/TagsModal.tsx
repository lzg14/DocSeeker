import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

interface Tag {
  id: number
  name: string
  color: string
  fileCount?: number
}

interface TagsModalProps {
  onClose: () => void
}

const TAG_COLORS = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1',
  '#3949ab', '#1e88e5', '#039be5', '#00acc1',
  '#00897b', '#43a047', '#7cb342', '#c0ca33',
  '#fdd835', '#ffb300', '#fb8c00', '#f4511e',
]

export default function TagsModal({ onClose }: TagsModalProps): JSX.Element {
  const { t } = useLanguage()
  const [tags, setTags] = useState<Tag[]>([])
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    setLoading(true)
    try {
      const tagList = await window.electron.getAllTags?.() || []
      setTags(tagList)
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
    setLoading(false)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return

    const newTag = {
      id: Date.now(),
      name: newTagName.trim(),
      color: newTagColor,
      fileCount: 0
    }

    try {
      await window.electron.createTag?.(newTag.name, newTag.color)
      setTags([...tags, newTag])
      setNewTagName('')
    } catch (err) {
      console.error('Failed to create tag:', err)
    }
  }

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm(t('tags.deleteConfirm') || '确定要删除这个标签吗？')) return

    try {
      await window.electron.deleteTag?.(tagId)
      setTags(tags.filter(t => t.id !== tagId))
    } catch (err) {
      console.error('Failed to delete tag:', err)
    }
  }

  const handleUpdateTag = async () => {
    if (!editingTag) return

    try {
      await window.electron.updateTag?.(editingTag.id, editingTag.name, editingTag.color)
      setTags(tags.map(t => t.id === editingTag.id ? editingTag : t))
      setEditingTag(null)
    } catch (err) {
      console.error('Failed to update tag:', err)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
          {t('tags.title') || '标签管理'}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          {/* Create new tag */}
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
            <div style={{ fontWeight: 500, marginBottom: '8px' }}>{t('tags.create') || '创建标签'}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                placeholder={t('tags.placeholder') || '新标签名称'}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
                onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                {TAG_COLORS.slice(0, 6).map(color => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      background: color,
                      border: newTagColor === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleCreateTag}>
                {t('tags.create') || '创建'}
              </button>
            </div>
          </div>

          {/* Tag list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              {t('config.loading') || '加载中...'}
            </div>
          ) : tags.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              {t('detail.noTags') || '暂无标签'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tags.map(tag => (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                  {editingTag?.id === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={e => setEditingTag({ ...editingTag, name: e.target.value })}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {TAG_COLORS.slice(0, 6).map(color => (
                          <button
                            key={color}
                            onClick={() => setEditingTag({ ...editingTag, color })}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              background: color,
                              border: editingTag.color === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </div>
                      <button className="btn btn-primary" onClick={handleUpdateTag} style={{ padding: '4px 12px' }}>
                        {t('common.confirm') || '确定'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditingTag(null)} style={{ padding: '4px 12px' }}>
                        {t('common.cancel') || '取消'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>{tag.name}</span>
                      {tag.fileCount !== undefined && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({tag.fileCount})</span>
                      )}
                      <button
                        onClick={() => setEditingTag({ ...tag })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}
                        title={t('tags.edit')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}
                        title={t('tags.delete')}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            {t('common.confirm') || '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}