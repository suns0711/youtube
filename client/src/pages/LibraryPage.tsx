import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { SubscriptionFeedSection, VideoItem } from '../api'
import {
  enrichFeedVideoMeta,
  fetchSubscriptionFeedShell,
  fetchSubscriptionRecentVideos,
  searchVideos,
} from '../api'
import {
  FeedLoadingSkeleton,
  SearchResultsSkeleton,
  SectionVideosSkeleton,
} from '../components/FeedLoadingSkeleton'
import { PageHeaderToolbar } from '../components/PageHeaderToolbar'
import { VideoCard } from '../components/VideoCard'

const VideoModal = lazy(async () => {
  const m = await import('../components/VideoModal')
  return { default: m.VideoModal }
})
import { useAvailableTags } from '../AvailableTagsContext'
import { useI18n } from '../i18n'
import { buildDownloadsHref } from '../lib/downloadsNavigation'
import {
  resolveTagAccentId,
  tagAccentPillClass,
  tagFeedFilterSelectedOverlayClass,
} from '../lib/tagAccentStyles'
import { externalYoutubeChannelUrl } from '../util'

function tagsMatchFilter(filterRaw: string, tag: string): boolean {
  return filterRaw.trim().toLowerCase() === tag.trim().toLowerCase()
}

function uploadDateSortKey(v: VideoItem): number {
  const u = v.upload_date
  if (u && /^\d{8}$/.test(u)) return Number.parseInt(u, 10)
  return 0
}

/** 频道内视频按发布时间新→旧（缺日期时保持原顺序） */
function sortVideosInSection(videos: VideoItem[]): VideoItem[] {
  return [...videos].map((v, i) => ({ v, i })).sort((a, b) => {
    const db = uploadDateSortKey(b.v)
    const da = uploadDateSortKey(a.v)
    if (db !== da) return db - da
    return a.i - b.i
  }).map(({ v }) => v)
}

export function LibraryPage() {
  const { t } = useI18n()
  const { tagAccentByLabel } = useAvailableTags()
  const [params, setParams] = useSearchParams()
  const qParam = params.get('q') || ''
  const feedTagFilter = (params.get('feedTag') || '').trim()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<VideoItem | null>(null)
  const [subSections, setSubSections] = useState<SubscriptionFeedSection[]>([])
  const [subVideosLoading, setSubVideosLoading] = useState(false)
  const [subVideosFailed, setSubVideosFailed] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const feedReqId = useRef(0)
  const navigate = useNavigate()
  const feedPerChannel = 3

  const runSearch = useCallback(async (q: string) => {
    const t = q.trim()
    if (!t) {
      setVideos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { videos: v } = await searchVideos(t, { sort: 'activity' })
      setVideos(v)
    } catch (e) {
      setError((e as Error).message)
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runSearch(qParam)
  }, [qParam, runSearch])

  useEffect(() => {
    if (qParam) return
    const my = ++feedReqId.current
    let cancelled = false
    setSubVideosFailed(false)
    setSubError(null)
    setSubVideosLoading(true)

    void fetchSubscriptionFeedShell()
      .then(({ sections }) => {
        if (cancelled || feedReqId.current !== my) return
        setSubSections((prev) =>
          prev.some((s) => s.videos.length > 0) ? prev : sections,
        )
      })
      .catch(() => {})

    void fetchSubscriptionRecentVideos({ perChannel: feedPerChannel })
      .then(async ({ sections }) => {
        if (cancelled || feedReqId.current !== my) return
        setSubSections(sections)
        setSubVideosLoading(false)
        setSubVideosFailed(false)

        const needIds = [
          ...new Set(
            sections.flatMap((s) =>
              s.videos.filter((v) => !v.upload_date).map((v) => v.id),
            ),
          ),
        ]
        if (!needIds.length) return
        try {
          const metaItems = await enrichFeedVideoMeta(needIds)
          if (cancelled || feedReqId.current !== my) return
          const byId = new Map(metaItems.map((m) => [m.id, m]))
          setSubSections((prev) =>
            prev.map((sec) => ({
              ...sec,
              videos: sec.videos.map((v) => {
                const m = byId.get(v.id)
                if (!m) return v
                const next = { ...v }
                if (m.upload_date) next.upload_date = m.upload_date
                if (m.duration != null && next.duration == null)
                  next.duration = m.duration
                return next
              }),
            })),
          )
        } catch {
          /* 补全失败不影响列表展示 */
        }
      })
      .catch((e: Error) => {
        if (cancelled || feedReqId.current !== my) return
        setSubError(e.message)
        setSubVideosLoading(false)
        setSubVideosFailed(true)
        void fetchSubscriptionFeedShell()
          .then(({ sections: shell }) => {
            if (cancelled || feedReqId.current !== my) return
            setSubSections((prev) => (prev.length > 0 ? prev : shell))
          })
          .catch(() => {})
      })

    return () => {
      cancelled = true
    }
  }, [qParam])

  const visibleSubSections = useMemo(() => {
    if (!feedTagFilter) return subSections
    return subSections.filter((s) =>
      (s.tags ?? []).some((t) => tagsMatchFilter(feedTagFilter, String(t))),
    )
  }, [subSections, feedTagFilter])

  const selectFeedTag = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return
      setParams(
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
    [setParams],
  )

  const clearFeedTag = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('feedTag')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body text-on-surface selection:bg-primary selection:text-on-primary-container">
      <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-surface px-6 py-6 md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <h2 className="text-3xl font-black tracking-tighter text-on-surface">
            {t('library.title')}
          </h2>
        </div>
        <PageHeaderToolbar />
      </header>

      <div className="px-6 pb-16 md:px-10">

        {error ? (
          <p className="mb-6 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        ) : null}

        {!qParam ? (
          <>
            {subVideosLoading && subSections.length === 0 ? (
              <FeedLoadingSkeleton />
            ) : null}
            {subError ? (
              <p className="mb-8 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                {subError}
              </p>
            ) : null}
            {!subVideosLoading
            && !subError
            && subSections.length > 0
            && feedTagFilter
            && visibleSubSections.length === 0 ? (
              <p className="mb-10 text-sm text-on-surface-variant">
                {t('library.noTagChannels')}{' '}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => clearFeedTag()}
                >
                  {t('subscriptions.clearFilter')}
                </button>
              </p>
            ) : null}
            {visibleSubSections.length > 0 ? (
              <div className="space-y-0">
                {visibleSubSections.map((section) => {
                  if (section.error) {
                    return (
                      <p
                        key={section.subscriptionId}
                        className="mb-8 rounded-lg border border-error/25 bg-error/5 px-4 py-3 text-sm text-error"
                      >
                        <span className="font-semibold text-on-surface">
                          {section.channelName}
                        </span>
                        ：{section.error}
                      </p>
                    )
                  }
                  const rowVideos = sortVideosInSection(section.videos)
                  const ytChannel = externalYoutubeChannelUrl(section.channelUrl)
                  const avatarInner = section.avatarUrl ? (
                    <img
                      src={section.avatarUrl}
                      alt=""
                      className="h-11 w-11 rounded-full border border-outline-variant/15 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-surface-container-highest" />
                  )
                  const tagRow =
                    (section.tags ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-2 pl-0 sm:pl-[3.75rem]">
                        {(section.tags ?? []).map((t) => {
                          const accent = resolveTagAccentId(
                            String(t),
                            tagAccentByLabel,
                          )
                          const cls = tagAccentPillClass(accent, false)
                          const selected = tagsMatchFilter(
                            feedTagFilter,
                            String(t),
                          )
                          return (
                            <button
                              key={`${section.subscriptionId}-${t}`}
                              type="button"
                              onClick={() => selectFeedTag(t)}
                              className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${cls} ${
                                selected ? tagFeedFilterSelectedOverlayClass : ''
                              }`}
                            >
                              {t}
                            </button>
                          )
                        })}
                      </div>
                    ) : null
                  const body =
                    rowVideos.length === 0 ? (
                      subVideosLoading ? (
                        <SectionVideosSkeleton
                          cardsPerSection={feedPerChannel}
                        />
                      ) : subVideosFailed ? (
                        <p className="text-sm text-error">
                          {t('library.loadLatestFailed')}
                        </p>
                      ) : (
                        <p className="text-sm text-on-surface-variant">
                          {t('library.emptyVideos')}
                        </p>
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-3">
                        {rowVideos.map((v, i) => (
                          <VideoCard
                            key={`${section.subscriptionId}-${v.id}-${i}`}
                            hideChannelMeta
                            video={{
                              ...v,
                              feedChannelTags: section.tags ?? [],
                            }}
                            onPlay={setModal}
                            onDownload={(vid) =>
                              navigate(
                                buildDownloadsHref(
                                  vid.url,
                                  vid.feedChannelTags,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                    )
                  return (
                    <section
                      key={section.subscriptionId}
                      className="mb-10 border-b border-outline-variant/10 pb-8 last:mb-0 last:border-0 last:pb-0"
                    >
                      <div className="mb-4 flex min-w-0 flex-col gap-3">
                        <div className="group/ch flex w-fit max-w-full items-center gap-4 rounded-xl border border-transparent px-1 py-1">
                          {ytChannel ? (
                            <a
                              href={ytChannel}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-full outline-none ring-offset-2 ring-offset-surface transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50"
                              title={t('library.openOnYoutube')}
                            >
                              {avatarInner}
                            </a>
                          ) : (
                            <div className="shrink-0">{avatarInner}</div>
                          )}
                          {ytChannel ? (
                            <a
                              href={ytChannel}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 rounded-lg px-0.5 py-0.5 text-left outline-none transition-colors hover:bg-surface-container-high/55 focus-visible:ring-2 focus-visible:ring-primary/45"
                              title={t('library.openOnYoutube')}
                            >
                              <h3 className="text-xl font-bold tracking-tight text-on-surface group-hover/ch:text-primary">
                                {section.channelName}
                              </h3>
                              <p className="text-sm text-on-surface-variant">
                                {section.handle}
                              </p>
                            </a>
                          ) : (
                            <Link
                              to={`/subscriptions?channel=${encodeURIComponent(section.subscriptionId)}`}
                              className="min-w-0 flex-1 rounded-lg px-0.5 py-0.5 text-left outline-none transition-colors hover:bg-surface-container-high/55 focus-visible:ring-2 focus-visible:ring-primary/45"
                              title={t('library.openInChannelsPage')}
                            >
                              <h3 className="text-xl font-bold tracking-tight text-on-surface group-hover/ch:text-primary">
                                {section.channelName}
                              </h3>
                              <p className="text-sm text-on-surface-variant">
                                {section.handle}
                              </p>
                            </Link>
                          )}
                        </div>
                        {tagRow}
                      </div>
                      {body}
                    </section>
                  )
                })}
              </div>
            ) : null}
            {!subVideosLoading && !subError && subSections.length === 0 ? (
              <div className="mb-10 max-w-2xl">
                <p className="leading-relaxed text-on-surface-variant">
                  {t('library.noFeed')}{' '}
                  <Link to="/subscriptions" className="text-primary hover:underline">
                    {t('library.addChannel')}
                  </Link>
                  {t('library.noFeedTail')}
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {loading && qParam ? <SearchResultsSkeleton /> : null}

        {!loading && !error && qParam && videos.length === 0 ? (
          <p className="text-on-surface-variant">
            {t('library.noSearchResults')}
          </p>
        ) : null}

        {qParam && !loading ? (
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onPlay={setModal}
                onDownload={(vid) =>
                  navigate(`/downloads?url=${encodeURIComponent(vid.url)}`)
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <Suspense fallback={null}>
        <VideoModal
          video={modal}
          open={!!modal}
          onClose={() => setModal(null)}
          onDownload={({ url, feedChannelTags }) => {
            navigate(buildDownloadsHref(url, feedChannelTags))
            setModal(null)
          }}
        />
      </Suspense>
    </div>
  )
}
