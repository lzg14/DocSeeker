import { useLanguage } from '../context/LanguageContext'

interface ConfirmDialogProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {t('confirm.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
