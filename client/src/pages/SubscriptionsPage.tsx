import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HeaderStudioUser } from '../components/HeaderStudioUser'
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  updateSubscription,
  type SubscriptionChannel,
} from '../api'
import {
  resolveTagAccentId,
  tagAccentPillClass,
  tagFeedFilterSelectedOverlayClass,
} from '../lib/tagAccentStyles'
import { externalYoutubeChannelUrl } from '../util'

function tagsMatchFilter(filterRaw: string, tag: string): boolean {
  return filterRaw.trim().toLowerCase() === tag.trim().toLowerCase()
}

function addTagDeduped(draft: string[], raw: string): string[] {
  const t = raw.trim()
  if (!t) return draft
  if (draft.some((d) => d.toLowerCase() === t.toLowerCase())) return draft
  return [...draft, t]
}

export function SubscriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { refresh: refreshGlobalTags, tags: studioTagOptions, tagAccentByLabel } =
    useAvailableTags()
  const [channels, setChannels] = useState<SubscriptionChannel[]>([])
  const [loading, setLoading] = useState(true)
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

  /** 至少被一个订阅频道使用过的标签，用于筛选条（无标签时不展示筛选） */
  const tagsUsedOnChannels = useMemo(() => {
    const s = new Set<string>()
    for (const c of channels) {
      for (const t of c.tags) {
        const u = String(t || '').trim()
        if (u) s.add(u)
      }
    }
    return [...s].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [channels])

  const feedTagFilter = (searchParams.get('feedTag') || '').trim()

  const visibleChannels = useMemo(() => {
    if (!feedTagFilter) return channels
    return channels.filter((c) =>
      c.tags.some((t) => tagsMatchFilter(feedTagFilter, String(t))),
    )
  }, [channels, feedTagFilter])

  const selectFeedTag = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const cur = (next.get('feedTag') || '').trim()
          if (cur.toLowerCase() === trimmed.toLowerCase()) {
            next.delete('feedTag')
          } else {
            next.set('feedTag', trimmed)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const clearFeedTag = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('feedTag')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

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
      const { channels: ch } = await listSubscriptions()
      setChannels(ch)
    } catch {
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 从首页等带入 ?channel=id：滚动到卡片并短暂高亮 */
  useEffect(() => {
    const raw = (searchParams.get('channel') || '').trim()
    if (!raw || loading || visibleChannels.length === 0) return
    const hit = visibleChannels.some((c) => c.id === raw)
    if (!hit) return
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`sub-channel-${raw}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [searchParams, loading, visibleChannels])

  const focusChannelId = (searchParams.get('channel') || '').trim()

  const subscriptionsChannelLink = useCallback(
    (channelId: string) => {
      const q = new URLSearchParams()
      q.set('channel', channelId)
      if (feedTagFilter) q.set('feedTag', feedTagFilter)
      return `/subscriptions?${q.toString()}`
    },
    [feedTagFilter],
  )

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
          <HeaderStudioUser size="md" className="ml-2" />
        </div>
      </header>

      <section className="mt-8 px-6 pb-20 md:px-10">
        <div className="relative z-[25] mb-10 flex flex-col gap-6 lg:mb-12 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          {!loading && tagsUsedOnChannels.length > 0 ? (
            <div className="min-w-0 flex-1 space-y-3">
              <span className="block text-[11px] font-black uppercase tracking-widest text-on-surface-variant/70">
                按标签筛选
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {tagsUsedOnChannels.map((t) => {
                  const accent = resolveTagAccentId(t, tagAccentByLabel)
                  const cls = tagAccentPillClass(accent, false)
                  const selected = tagsMatchFilter(feedTagFilter, t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectFeedTag(t)}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${cls} ${
                        selected ? tagFeedFilterSelectedOverlayClass : ''
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
                {feedTagFilter ? (
                  <button
                    type="button"
                    onClick={clearFeedTag}
                    className="rounded-full border border-outline-variant/25 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-high"
                  >
                    清除筛选
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAddErr(null)
              setAddOpen(true)
            }}
            className="red-glow-btn flex shrink-0 items-center justify-center gap-2 self-start rounded-lg px-6 py-2.5 text-sm font-bold text-on-primary-container transition-transform active:scale-95 lg:self-auto"
          >
            <span className="material-symbols-outlined">person_add</span>
            添加频道
          </button>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">正在加载频道…</p>
        ) : null}

        {!loading
        && channels.length > 0
        && feedTagFilter
        && visibleChannels.length === 0 ? (
          <p className="mb-8 text-sm text-on-surface-variant">
            没有带标签「{feedTagFilter}」的频道。{' '}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={clearFeedTag}
            >
              清除筛选
            </button>
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visibleChannels.map((c) => {
            const ytChannel = externalYoutubeChannelUrl(c.channelUrl)
            const avatarWrap = (
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
            )
            return (
            <div
              id={`sub-channel-${c.id}`}
              key={c.id}
              className={`group rounded-xl border-t border-surface-bright/20 bg-surface-container-high p-6 shadow-xl transition-[transform,box-shadow] hover:scale-[1.02] ${
                menuId === c.id ? 'relative z-[20]' : ''
              } ${
                focusChannelId === c.id
                  ? 'ring-2 ring-primary/55 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
                  : ''
              }`}
            >
              <div
                className={`flex items-start justify-between gap-3 ${
                  c.description ? 'mb-3' : 'mb-6'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  {ytChannel ? (
                    <a
                      href={ytChannel}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full outline-none ring-offset-2 ring-offset-surface transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50"
                      title="在 YouTube 打开频道"
                    >
                      {avatarWrap}
                    </a>
                  ) : (
                    avatarWrap
                  )}
                  {ytChannel ? (
                    <a
                      href={ytChannel}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 rounded-xl p-1 -m-1 outline-none transition-colors hover:bg-surface-container-highest/55 focus-visible:ring-2 focus-visible:ring-primary/50"
                      title="在 YouTube 打开频道"
                    >
                      <h3 className="font-bold text-on-surface group-hover:text-primary">
                        {c.name}
                      </h3>
                      <p className="font-mono text-xs tracking-tighter text-on-surface-variant/60">
                        {c.handle} • {c.subscriberLabel}
                        {c.videoCountLabel ? ` • ${c.videoCountLabel}` : ''}
                      </p>
                    </a>
                  ) : (
                    <Link
                      to={subscriptionsChannelLink(c.id)}
                      className="min-w-0 flex-1 rounded-xl p-1 -m-1 outline-none transition-colors hover:bg-surface-container-highest/55 focus-visible:ring-2 focus-visible:ring-primary/50"
                      title="在本页定位到此频道"
                    >
                      <h3 className="font-bold text-on-surface group-hover:text-primary">
                        {c.name}
                      </h3>
                      <p className="font-mono text-xs tracking-tighter text-on-surface-variant/60">
                        {c.handle} • {c.subscriberLabel}
                        {c.videoCountLabel ? ` • ${c.videoCountLabel}` : ''}
                      </p>
                    </Link>
                  )}
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
                {c.tags.map((tag, i) => {
                  const accent = resolveTagAccentId(tag, tagAccentByLabel)
                  const cls = tagAccentPillClass(accent, false)
                  const selected = tagsMatchFilter(feedTagFilter, String(tag))
                  return (
                    <button
                      key={`${c.id}-${tag}-${i}`}
                      type="button"
                      title="按此标签筛选"
                      onClick={() => selectFeedTag(tag)}
                      className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${cls} ${
                        selected ? tagFeedFilterSelectedOverlayClass : ''
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3">
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
                  role="switch"
                  aria-checked={!c.notificationsMuted}
                  onClick={() => void toggleNotifications(c)}
                  title={
                    c.notificationsMuted
                      ? '已关闭：该频道不显示在首页，点击开启'
                      : '已开启：在首页展示该频道更新，点击关闭'
                  }
                  className={`relative h-7 w-12 shrink-0 rounded-full border-2 p-0.5 transition-[box-shadow,background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                    c.notificationsMuted
                      ? 'border-outline-variant/40 bg-surface-container-highest shadow-none'
                      : 'border-primary bg-white/20 shadow-[0_0_16px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.14)]'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full shadow-md transition-[transform,background-color] duration-200 ease-out ${
                      c.notificationsMuted
                        ? 'translate-x-0 bg-on-surface'
                        : 'translate-x-[1.25rem] bg-white ring-1 ring-primary/25'
                    }`}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
            )
          })}
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
                {tagsDraft.map((tag, i) => {
                  const accent = resolveTagAccentId(tag, tagAccentByLabel)
                  return (
                    <span
                      key={`${tag}-${i}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tagAccentPillClass(accent, false)}`}
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
                  )
                })}
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
