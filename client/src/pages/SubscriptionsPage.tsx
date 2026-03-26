import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  updateSubscription,
  type SubscriptionChannel,
} from '../api'

const PROFILE_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCY2ps32Bl4qGmW_hCKgZRkr3xLcu5upNwA-avBcagBy8RZ3DK-qZv8zl_XgRFnBuMDzD0zONAM5WI0NbZGO6eWvhziDwoDEy1q8smiLyJ0xJNeEr-dpj5bOh7eytkoamETeL3kDj_bt7E_bp9i_SlRlRnBvLIGrvEks9e_kVlVLfsaVMsfx79GQbVdK7NCo5YmxYnHI2IrRfzSV1iqF3JUi8yI35D5dXrA0lIPAWH1uOyGAtVXiMryddasT7Uqi4SWHHzvJVssZU0F'

function addTagDeduped(draft: string[], raw: string): string[] {
  const t = raw.trim()
  if (!t) return draft
  if (draft.some((d) => d.toLowerCase() === t.toLowerCase())) return draft
  return [...draft, t]
}

function tagPillClass(i: number): string {
  const mod = i % 3
  if (mod === 0) {
    return 'border border-tertiary/20 bg-tertiary-container/10 text-tertiary'
  }
  if (mod === 1) {
    return 'border border-primary/20 bg-primary-container/10 text-primary'
  }
  return 'border border-outline-variant/15 bg-surface-container-highest text-on-surface-variant'
}

export function SubscriptionsPage() {
  const { refresh: refreshGlobalTags, tags: studioTagOptions } =
    useAvailableTags()
  const [channels, setChannels] = useState<SubscriptionChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDraft, setFilterDraft] = useState('')
  const [filterApplied, setFilterApplied] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addChannelUrl, setAddChannelUrl] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<SubscriptionChannel | null>(
    null,
  )
  const [removeLoading, setRemoveLoading] = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)

  const [tagsEditChannel, setTagsEditChannel] =
    useState<SubscriptionChannel | null>(null)
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagComboOpen, setTagComboOpen] = useState(false)
  const [tagsEditLoading, setTagsEditLoading] = useState(false)
  const [tagsEditErr, setTagsEditErr] = useState<string | null>(null)
  const tagComboRef = useRef<HTMLDivElement>(null)

  const tagPool = useMemo(() => {
    const s = new Set<string>()
    studioTagOptions.forEach((t) => s.add(t))
    channels.forEach((c) => c.tags.forEach((t) => s.add(t)))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [studioTagOptions, channels])

  const filteredPickTags = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    return tagPool.filter(
      (t) =>
        !tagsDraft.some((d) => d.toLowerCase() === t.toLowerCase())
        && (!q || t.toLowerCase().includes(q)),
    )
  }, [tagPool, tagsDraft, tagInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { channels: ch } = await listSubscriptions({
        filter: filterApplied || undefined,
      })
      setChannels(ch)
    } catch {
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [filterApplied])

  useEffect(() => {
    void load()
  }, [load])

  const applyFilter = () => {
    setFilterApplied(filterDraft.trim())
    setFilterOpen(false)
  }

  const toggleNotifications = async (c: SubscriptionChannel) => {
    try {
      const next = await updateSubscription(c.id, {
        notificationsMuted: !c.notificationsMuted,
      })
      setChannels((prev) => prev.map((x) => (x.id === next.id ? next : x)))
    } catch {
      void load()
    }
  }

  useEffect(() => {
    if (!tagsEditChannel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !tagsEditLoading) {
        setTagsEditChannel(null)
        setTagsEditErr(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tagsEditChannel, tagsEditLoading])

  useEffect(() => {
    if (!tagComboOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!tagComboRef.current?.contains(e.target as Node)) {
        setTagComboOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [tagComboOpen])

  const openTagsEditor = (c: SubscriptionChannel) => {
    setMenuId(null)
    setTagsEditChannel(c)
    setTagsDraft([...c.tags])
    setTagInput('')
    setTagComboOpen(false)
    setTagsEditErr(null)
  }

  const closeTagsEditor = () => {
    if (tagsEditLoading) return
    setTagsEditChannel(null)
    setTagsEditErr(null)
    setTagComboOpen(false)
  }

  const pickTagOption = (t: string) => {
    setTagsDraft((prev) => addTagDeduped(prev, t))
    setTagInput('')
    setTagComboOpen(false)
  }

  const addTagFromInput = () => {
    const t = tagInput.trim()
    if (!t) return
    setTagsDraft((prev) => addTagDeduped(prev, t))
    setTagInput('')
    setTagComboOpen(false)
  }

  const saveTagsEdit = async () => {
    if (!tagsEditChannel) return
    setTagsEditLoading(true)
    setTagsEditErr(null)
    try {
      const next = await updateSubscription(tagsEditChannel.id, {
        tags: tagsDraft,
      })
      setChannels((prev) => prev.map((x) => (x.id === next.id ? next : x)))
      refreshGlobalTags()
      closeTagsEditor()
    } catch (e) {
      setTagsEditErr((e as Error).message || '保存失败')
    } finally {
      setTagsEditLoading(false)
    }
  }

  const openRemoveConfirm = (c: SubscriptionChannel) => {
    setRemoveErr(null)
    setMenuId(null)
    setRemoveTarget(c)
  }

  const confirmRemoveChannel = async () => {
    if (!removeTarget) return
    setRemoveLoading(true)
    setRemoveErr(null)
    try {
      await deleteSubscription(removeTarget.id)
      setRemoveTarget(null)
      refreshGlobalTags()
      void load()
    } catch (e) {
      setRemoveErr((e as Error).message || '删除失败')
    } finally {
      setRemoveLoading(false)
    }
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = addChannelUrl.trim()
    if (!u) {
      setAddErr('请粘贴 YouTube 频道链接')
      return
    }
    setAddLoading(true)
    setAddErr(null)
    try {
      await createSubscription({
        channelUrl: u,
        tags: [],
        notificationsMuted: false,
      })
      setAddOpen(false)
      setAddChannelUrl('')
      refreshGlobalTags()
      void load()
    } catch (err) {
      setAddErr((err as Error).message || '添加失败')
    } finally {
      setAddLoading(false)
    }
  }

  const allTagSuggestions = useMemo(() => {
    const s = new Set<string>()
    channels.forEach((c) => c.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [channels])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-surface font-body text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-surface px-6 py-6 md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <h2 className="text-3xl font-black tracking-tighter text-on-surface">
            频道
          </h2>
        </div>
        <div className="ml-8 flex items-center gap-4">
          <Link
            to="/downloads"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">download</span>
          </Link>
          <div className="ml-2 h-10 w-10 overflow-hidden rounded-full border border-outline-variant/20">
            <img
              src={PROFILE_IMG}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </header>

      <section className="mt-8 px-6 pb-20 md:px-10">
        <div className="relative z-[25] mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-outline-variant/20 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">
                filter_list
              </span>
              筛选
            </button>
            {filterOpen ? (
              <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-xl">
                <input
                  value={filterDraft}
                  onChange={(e) => setFilterDraft(e.target.value)}
                  placeholder="标签或频道名称…"
                  className="mb-3 w-full rounded-lg border-0 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                />
                <div className="mb-3 flex flex-wrap gap-1">
                  {allTagSuggestions.slice(0, 8).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterDraft(t)}
                      className="rounded-full border border-outline-variant/15 px-2 py-0.5 text-[10px] text-on-surface-variant hover:border-primary/30"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={applyFilter}
                    className="flex-1 rounded-lg bg-surface-container-high py-2 text-xs font-bold text-primary"
                  >
                    应用
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDraft('')
                      setFilterApplied('')
                      setFilterOpen(false)
                    }}
                    className="rounded-lg px-3 py-2 text-xs text-on-surface-variant"
                  >
                    清除
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setAddErr(null)
              setAddOpen(true)
            }}
            className="red-glow-btn flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold text-on-primary-container transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined">person_add</span>
            添加频道
          </button>
        </div>

        {filterApplied ? (
          <p className="mb-4 text-xs text-on-surface-variant">
            当前筛选：<span className="text-primary">{filterApplied}</span>
          </p>
        ) : null}

        {loading ? (
          <p className="text-on-surface-variant">正在加载频道…</p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => (
            <div
              key={c.id}
              className={`group rounded-xl border-t border-surface-bright/20 bg-surface-container-high p-6 shadow-xl transition-transform hover:scale-[1.02] ${
                menuId === c.id ? 'relative z-[20]' : ''
              }`}
            >
              <div
                className={`flex items-start justify-between gap-3 ${
                  c.description ? 'mb-3' : 'mb-6'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/20 p-0.5">
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-full w-full rounded-full bg-surface-container-highest" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-on-surface">{c.name}</h3>
                    <p className="font-mono text-xs tracking-tighter text-on-surface-variant/60">
                      {c.handle} • {c.subscriberLabel}
                      {c.videoCountLabel ? ` • ${c.videoCountLabel}` : ''}
                    </p>
                  </div>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setMenuId((id) => (id === c.id ? null : c.id))
                    }
                    className="text-on-surface-variant/40 transition-colors hover:text-error"
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {menuId === c.id ? (
                    <div className="absolute right-0 top-8 z-[35] w-40 rounded-lg border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl">
                      {c.channelUrl ? (
                        <a
                          href={c.channelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block px-3 py-2 text-xs text-on-surface-variant hover:bg-surface-container-high"
                          onClick={() => setMenuId(null)}
                        >
                          打开频道页
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openRemoveConfirm(c)}
                        className="w-full px-3 py-2 text-left text-xs text-error hover:bg-error/10"
                      >
                        移除频道
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {c.description ? (
                <p className="mb-6 w-full text-xs leading-relaxed text-on-surface-variant/70 line-clamp-4">
                  {c.description}
                </p>
              ) : null}
              <div className="mb-8 flex flex-wrap gap-2">
                {c.tags.map((tag, i) => (
                  <span
                    key={`${c.id}-${tag}-${i}`}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${tagPillClass(i)}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => openTagsEditor(c)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant/20 py-2 text-xs font-bold transition-colors hover:bg-surface-container-highest"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  编辑标签
                </button>
                <button
                  type="button"
                  onClick={() => void toggleNotifications(c)}
                  className={`flex items-center justify-center rounded-lg border px-4 py-2 text-xs font-bold transition-colors ${
                    c.notificationsMuted
                      ? 'border-error/20 text-error hover:bg-error-container/20'
                      : 'border-error/20 text-error hover:bg-error-container/20'
                  }`}
                  title={
                    c.notificationsMuted
                      ? '已关闭：该频道不显示在首页'
                      : '已开启：在首页展示该频道更新'
                  }
                >
                  <span className="material-symbols-outlined text-sm">
                    {c.notificationsMuted
                      ? 'notifications_off'
                      : 'notifications_active'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {tagsEditChannel ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tags-edit-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeTagsEditor()
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3
                id="tags-edit-title"
                className="text-lg font-bold text-primary"
              >
                编辑标签
              </h3>
              <button
                type="button"
                onClick={closeTagsEditor}
                disabled={tagsEditLoading}
                className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="mb-1 text-xs text-on-surface-variant">
              {tagsEditChannel.name}
            </p>
            <p className="mb-4 text-[11px] leading-relaxed text-on-surface-variant/80">
              从列表选择已有标签，或在输入框输入新标签后按 Enter
              / 点「添加」。已选标签可点 × 移除。
            </p>

            {tagsDraft.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {tagsDraft.map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tagPillClass(i)}`}
                  >
                    {tag}
                    <button
                      type="button"
                      disabled={tagsEditLoading}
                      onClick={() =>
                        setTagsDraft((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="-mr-0.5 rounded-full p-0.5 hover:bg-black/10"
                      aria-label={`移除 ${tag}`}
                    >
                      <span className="material-symbols-outlined text-[14px] leading-none">
                        close
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div ref={tagComboRef} className="relative mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value)
                    setTagComboOpen(true)
                  }}
                  onFocus={() => setTagComboOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTagFromInput()
                    }
                  }}
                  placeholder="搜索或输入新标签…"
                  disabled={tagsEditLoading}
                  className="min-w-0 flex-1 rounded-lg border-0 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40"
                  aria-autocomplete="list"
                  aria-expanded={tagComboOpen}
                />
                <button
                  type="button"
                  disabled={tagsEditLoading || !tagInput.trim()}
                  onClick={addTagFromInput}
                  className="shrink-0 rounded-lg border border-outline-variant/20 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-surface-container-high disabled:opacity-40"
                >
                  添加
                </button>
              </div>
              {tagComboOpen && filteredPickTags.length ? (
                <ul
                  role="listbox"
                  className="absolute left-0 right-[4.5rem] top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl custom-scrollbar"
                >
                  {filteredPickTags.map((t) => (
                    <li key={t} role="presentation">
                      <button
                        type="button"
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickTagOption(t)}
                        className="w-full px-3 py-2 text-left text-xs text-on-surface transition-colors hover:bg-surface-container-high"
                      >
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {tagsEditErr ? (
              <p className="mb-3 text-xs text-error">{tagsEditErr}</p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeTagsEditor}
                disabled={tagsEditLoading}
                className="flex-1 rounded-lg border border-outline-variant/20 py-2.5 text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={tagsEditLoading}
                onClick={() => void saveTagsEdit()}
                className="red-glow-btn flex-1 rounded-lg py-2.5 text-sm font-bold text-on-primary-container disabled:opacity-50"
              >
                {tagsEditLoading ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">添加频道</h3>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false)
                  setAddErr(null)
                }}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
              粘贴 YouTube 频道链接（如{' '}
              <span className="font-mono text-[10px] text-primary/90">
                youtube.com/@handle
              </span>{' '}
              或{' '}
              <span className="font-mono text-[10px] text-primary/90">
                /channel/UC…
              </span>
              ），服务端会用 yt-dlp 拉取头像、订阅数、视频数与简介。
            </p>
            <form onSubmit={(e) => void submitAdd(e)} className="space-y-3">
              <textarea
                rows={3}
                placeholder="https://www.youtube.com/@…"
                value={addChannelUrl}
                onChange={(e) => setAddChannelUrl(e.target.value)}
                className="w-full resize-y rounded-lg border-0 bg-surface-container-lowest px-3 py-2 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40"
              />
              {addErr ? (
                <p className="text-xs text-error">{addErr}</p>
              ) : null}
              <button
                type="submit"
                disabled={addLoading}
                className="red-glow-btn mt-2 w-full rounded-lg py-3 text-sm font-bold text-on-primary-container disabled:opacity-50"
              >
                {addLoading ? '正在拉取频道信息…' : '添加频道'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {menuId ? (
        <button
          type="button"
          className="fixed inset-0 z-[15] cursor-default bg-transparent"
          aria-label="关闭菜单"
          onClick={() => setMenuId(null)}
        />
      ) : null}

      <ConfirmDialog
        open={removeTarget != null}
        title="移除订阅频道"
        description={
          removeErr
            ? removeErr
            : removeTarget
              ? `确定从订阅中移除「${removeTarget.name}」？此操作不可撤销。`
              : ''
        }
        confirmLabel="移除"
        cancelLabel="取消"
        variant="danger"
        loading={removeLoading}
        onConfirm={() => void confirmRemoveChannel()}
        onCancel={() => {
          if (!removeLoading) {
            setRemoveTarget(null)
            setRemoveErr(null)
          }
        }}
      />
    </div>
  )
}
