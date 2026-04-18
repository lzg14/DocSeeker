import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { ScannedFolder } from '../types'

interface DeleteFolderConfirmDialogProps {
  folder: ScannedFolder
  onConfirm: () => void
  onCancel: () => void
}

function DeleteFolderConfirmDialog({ folder, onConfirm, onCancel }: DeleteFolderConfirmDialogProps): JSX.Element {
  const { t } = useLanguage()
  const [confirmText, setConfirmText] = useState('')

  // 必须输入 "删除" 才能确认
  const canConfirm = confirmText === '删除'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box delete-folder-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 警告图标 */}
        <div className="delete-folder-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <div className="modal-title delete-folder-title">{t('config.delete')}</div>

        <div className="delete-folder-body">
          <p className="delete-folder-warning">
            即将删除索引目录：<strong>{folder.name}</strong>
          </p>
          {folder.file_count !== undefined && folder.file_count > 0 && (
            <p className="delete-folder-cost">
              此目录下共索引了 <strong>{folder.file_count.toLocaleString()}</strong> 个文件，
              全部索引数据将从数据库中永久删除。
            </p>
          )}
          <p className="delete-folder-hint">
            物理文件不会被删除，但搜索结果中将无法找到这些文件。
          </p>
        </div>

        <div className="delete-folder-confirm-input">
          <label>请输入 "<strong>删除</strong>" 以确认：</label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="输入 删除"
            autoFocus
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={!canConfirm}
            title={!canConfirm ? '请输入"删除"以确认' : '确认删除'}
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteFolderConfirmDialog
