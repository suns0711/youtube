import { useCallback, useState } from 'react'
import { removeStudioTag } from '../api'
import { useAvailableTags } from '../AvailableTagsContext'
import {
  resolveTagAccentId,
  tagAccentPillClass,
} from '../lib/tagAccentStyles'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeaderToolbar } from '../components/PageHeaderToolbar'
import { Toast } from '../components/Toast'

export function TagsPage() {
  const { tags, tagAccentByLabel, error, refresh } = useAvailableTags()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const dismissToast = useCallback(() => setToastMsg(null), [])

  const toggle = (t: string) => {
    setRemoveErr(null)
    setExpanded((cur) => (cur === t ? null : t))
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const t = pendingRemove
    setRemoving(t)
    setRemoveErr(null)
    try {
      await removeStudioTag(t)
      setPendingRemove(null)
      setExpanded(null)
      setToastMsg(`已移除标签「${t}」`)
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
            标签
          </h2>
        </div>
        <PageHeaderToolbar userSwitcherSize="md" />
      </header>

      <div className="px-6 pb-16 pt-2 md:px-10">
        <div className="mb-10">
          <p className="max-w-2xl text-on-surface-variant">
            点击标签可展开并移除。移除后该标签将从侧栏、本页与设置中的下拉选项里隐藏，并会从订阅频道与「标签 →
            文件夹」映射中一并清除。
          </p>
          {error ? (
            <p className="mt-2 text-sm text-error">标签列表加载失败：{error}</p>
          ) : null}
          {removeErr ? (
            <p className="mt-2 text-sm text-error">移除失败：{removeErr}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {tags.map((t) => {
            const isOpen = expanded === t
            const accent = resolveTagAccentId(t, tagAccentByLabel)
            const pill = tagAccentPillClass(accent, isOpen)
            return (
              <div
                key={t}
                className={`flex items-center gap-1 rounded-full border ${pill}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-90"
                >
                  {t}
                </button>
                {isOpen ? (
                  <button
                    type="button"
                    disabled={removing === t}
                    onClick={(e) => {
                      e.stopPropagation()
                      setRemoveErr(null)
                      setPendingRemove(t)
                    }}
                    className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-error transition-colors hover:bg-error/10 disabled:opacity-40"
                    aria-label={`删除标签 ${t}`}
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
          title="移除标签"
          description={
            pendingRemove
              ? `从列表中移除标签「${pendingRemove}」？将同时从订阅频道与文件夹映射中清除该标签。`
              : ''
          }
          confirmLabel="移除"
          cancelLabel="取消"
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
