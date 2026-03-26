import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { SubscriptionFeedSection, VideoItem } from '../api'
import { fetchSubscriptionRecentVideos, searchVideos } from '../api'
import {
  FeedLoadingSkeleton,
  SearchResultsSkeleton,
} from '../components/FeedLoadingSkeleton'
import { HeaderStudioUser } from '../components/HeaderStudioUser'
import { VideoCard } from '../components/VideoCard'
import { VideoModal } from '../components/VideoModal'
import { DEMO_FEED_VIDEOS } from '../data/demoFeed'
import { buildDownloadsHref } from '../lib/downloadsNavigation'

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
  const [params, setParams] = useSearchParams()
  const qParam = params.get('q') || ''
  const feedTagFilter = (params.get('feedTag') || '').trim()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<VideoItem | null>(null)
  const [subSections, setSubSections] = useState<SubscriptionFeedSection[]>([])
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const navigate = useNavigate()

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
    let cancelled = false
    setSubLoading(true)
    setSubError(null)
    fetchSubscriptionRecentVideos({ perChannel: 3 })
      .then(({ sections }) => {
        if (!cancelled) setSubSections(sections)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setSubError(e.message)
          setSubSections([])
        }
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false)
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
      <header className="sticky top-0 z-40 flex w-full items-center justify-end bg-surface px-6 py-6 md:px-10">
        <div className="ml-10 flex flex-1 items-center gap-8" />
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link
              to="/downloads"
              className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
            >
              <span className="material-symbols-outlined">download</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </Link>
            <Link
              to="/settings"
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
            >
              <span className="material-symbols-outlined">settings</span>
            </Link>
          </div>
          <HeaderStudioUser size="md" />
        </div>
      </header>

      <div className="px-6 pb-16 md:px-10">

        {error ? (
          <p className="mb-6 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        ) : null}

        {!qParam ? (
          <>
            {subLoading ? <FeedLoadingSkeleton /> : null}
            {subError ? (
              <p className="mb-8 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                {subError}
              </p>
            ) : null}
            {!subLoading
            && !subError
            && subSections.length > 0
            && feedTagFilter
            && visibleSubSections.length === 0 ? (
              <p className="mb-10 text-sm text-on-surface-variant">
                没有包含该标签的订阅频道。{' '}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => clearFeedTag()}
                >
                  清除筛选
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
                        className="mb-10 rounded-lg border border-error/25 bg-error/5 px-4 py-3 text-sm text-error"
                      >
                        <span className="font-semibold text-on-surface">
                          {section.channelName}
                        </span>
                        ：{section.error}
                      </p>
                    )
                  }
                  const rowVideos = sortVideosInSection(section.videos)
                  if (rowVideos.length === 0) {
                    return (
                      <p
                        key={section.subscriptionId}
                        className="mb-10 text-sm text-on-surface-variant"
                      >
                        {section.channelName}：暂无视频条目。
                      </p>
                    )
                  }
                  return (
                    <section
                      key={section.subscriptionId}
                      className="mb-20 border-b border-outline-variant/10 pb-16 last:mb-0 last:border-0 last:pb-0"
                    >
                      <div className="mb-6 flex flex-wrap items-center gap-4">
                        {section.avatarUrl ? (
                          <img
                            src={section.avatarUrl}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-full border border-outline-variant/15 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-11 w-11 shrink-0 rounded-full bg-surface-container-highest" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xl font-bold tracking-tight text-on-surface">
                            {section.channelName}
                          </h3>
                          <p className="text-sm text-on-surface-variant">
                            {section.handle}
                          </p>
                          {(section.tags ?? []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(section.tags ?? []).map((t) => (
                                <button
                                  key={`${section.subscriptionId}-${t}`}
                                  type="button"
                                  onClick={() => selectFeedTag(t)}
                                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                    tagsMatchFilter(feedTagFilter, String(t))
                                      ? 'border-primary/40 bg-primary/15 text-primary'
                                      : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/35'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {section.channelUrl ? (
                          <a
                            href={section.channelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-lg border border-outline-variant/20 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-high"
                          >
                            打开频道
                          </a>
                        ) : (
                          <Link
                            to="/subscriptions"
                            className="shrink-0 text-xs font-semibold text-primary hover:underline"
                          >
                            管理频道
                          </Link>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
                        {rowVideos.map((v, i) => (
                          <VideoCard
                            key={`${section.subscriptionId}-${v.id}-${i}`}
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
                    </section>
                  )
                })}
              </div>
            ) : null}
            {!subLoading && !subError && subSections.length === 0 ? (
              <div className="mb-10 max-w-2xl space-y-4">
                <p className="leading-relaxed text-on-surface-variant">
                  当前没有可展示的订阅视频。请先{' '}
                  <Link to="/subscriptions" className="text-primary hover:underline">
                    添加频道
                  </Link>
                  ；若已在频道页关闭通知，该频道将不会出现在此页。仅开启通知的频道会拉取并展示最近稿件。
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary/90">
                  界面示例
                </p>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  以下为占位卡片，便于预览布局。
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {DEMO_FEED_VIDEOS.map((v) => (
                    <VideoCard
                      key={v.sample ? `sample-${v.id}` : v.id}
                      video={v}
                      onPlay={setModal}
                      onDownload={(vid) =>
                        navigate(`/downloads?url=${encodeURIComponent(vid.url)}`)
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {loading && qParam ? <SearchResultsSkeleton /> : null}

        {!loading && !error && qParam && videos.length === 0 ? (
          <p className="text-on-surface-variant">
            未找到相关视频，请尝试其他关键词。
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

      <VideoModal
        video={modal}
        open={!!modal}
        onClose={() => setModal(null)}
        onDownload={({ url, feedChannelTags }) => {
          navigate(buildDownloadsHref(url, feedChannelTags))
          setModal(null)
        }}
      />
    </div>
  )
}
