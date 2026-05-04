import { useEffect } from 'react'
import { useI18n } from '../i18n'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** 危险操作用 error 色系主按钮 */
  variant?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n()
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'border border-error/40 bg-error/10 text-error hover:bg-error/20'
      : 'red-glow-btn text-on-primary-container shadow-[0_0_20px_rgba(255,255,255,0.14)]'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t('common.close')}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 shadow-2xl inner-highlight">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3
            id="confirm-dialog-title"
            className="text-lg font-bold tracking-tight text-primary"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="shrink-0 rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <p
          id="confirm-dialog-desc"
          className="text-sm leading-relaxed text-on-surface-variant"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg px-5 py-2.5 text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:opacity-40"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-lg px-5 py-2.5 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? t('common.processing') : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
