import { useCallback, useState } from 'react'
import { removeStudioTag } from '../api'
import { useAvailableTags } from '../AvailableTagsContext'
import { useI18n } from '../i18n'
import {
  resolveTagAccentId,
  tagAccentPillClass,
} from '../lib/tagAccentStyles'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeaderToolbar } from '../components/PageHeaderToolbar'
import { Toast } from '../components/Toast'

export function TagsPage() {
  const { t } = useI18n()
  const { tags, tagAccentByLabel, error, refresh } = useAvailableTags()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const dismissToast = useCallback(() => setToastMsg(null), [])

  const toggle = (tag: string) => {
    setRemoveErr(null)
    setExpanded((cur) => (cur === tag ? null : tag))
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const tag = pendingRemove
    setRemoving(tag)
    setRemoveErr(null)
    try {
      await removeStudioTag(tag)
      setPendingRemove(null)
      setExpanded(null)
      setToastMsg(t('tags.removedToast', { tag }))
      refresh()
    } catch (e) {
      setRemoveErr((e as Error).message)
      setPendingRemove(null)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="min-h-screen bg-surface font-body text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-surface px-6 py-6 md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <h2 className="text-3xl font-black tracking-tighter text-on-surface">
            {t('tags.title')}
          </h2>
        </div>
        <PageHeaderToolbar />
      </header>

      <div className="px-6 pb-16 pt-2 md:px-10">
        <div className="mb-10">
          <p className="max-w-2xl text-on-surface-variant">
            {t('tags.desc')}
          </p>
          {error ? (
            <p className="mt-2 text-sm text-error">
              {t('tags.loadFailed', { error })}
            </p>
          ) : null}
          {removeErr ? (
            <p className="mt-2 text-sm text-error">
              {t('tags.removeFailed', { error: removeErr })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => {
            const isOpen = expanded === tag
            const accent = resolveTagAccentId(tag, tagAccentByLabel)
            const pill = tagAccentPillClass(accent, isOpen)
            return (
              <div
                key={tag}
                className={`flex items-center gap-1 rounded-full border ${pill}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(tag)}
                  className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-90"
                >
                  {tag}
                </button>
                {isOpen ? (
                  <button
                    type="button"
                    disabled={removing === tag}
                    onClick={(e) => {
                      e.stopPropagation()
                      setRemoveErr(null)
                      setPendingRemove(tag)
                    }}
                    className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-error transition-colors hover:bg-error/10 disabled:opacity-40"
                    aria-label={t('tags.deleteAria', { tag })}
                  >
                    <span className="material-symbols-outlined text-lg">
                      delete
                    </span>
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        <ConfirmDialog
          open={pendingRemove !== null}
          title={t('tags.removeTitle')}
          description={
            pendingRemove
              ? t('tags.removeConfirm', { tag: pendingRemove })
              : ''
          }
          confirmLabel={t('tags.remove')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          loading={pendingRemove !== null && removing === pendingRemove}
          onCancel={() => {
            if (removing === pendingRemove) return
            setPendingRemove(null)
          }}
          onConfirm={() => void confirmRemove()}
        />

        <Toast message={toastMsg} onDismiss={dismissToast} />
      </div>
    </div>
  )
}
