import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  clearAllDownloadJobs,
  deleteDownloadJob,
  getJob,
  getStudioSettings,
  listJobs,
  openDownloadDirInFileManager,
  pickDownloadDirWithDialog,
  revealDownloadedFileInFolder,
  startDownload,
  suggestDownloadOutput,
  type DownloadJob,
} from '../api'
import { useAvailableTags } from '../AvailableTagsContext'
import { DOWNLOAD_QUEUE_SECTION_ID } from '../lib/downloadsNavigation'
import { resolveTagMappedDownloadPath } from '../lib/resolveTagDownloadPath'
import { isAllowedYoutubeUrl, youtubeIdFromUrl } from '../util'
import { PageHeaderToolbar } from '../components/PageHeaderToolbar'

const QUALITIES: { id: string; label: string }[] = [
  { id: '2160', label: '4K（2160p）' },
  { id: '1080', label: '1080p' },
  { id: '720', label: '720p' },
]

function qualityLabel(q: string): string {
  const hit = QUALITIES.find((x) => x.id === q)
  if (hit) return hit.label
  if (q === 'best') return '最佳'
  return q
}

/** 标签右侧 i（info）标识，悬停展示说明（支持链接等富文本） */
function LabelWithHint({
  htmlFor,
  children,
  hintSummary,
  hint,
  labelClassName,
  hintHot,
}: {
  htmlFor?: string
  children: ReactNode
  hintSummary: string
  hint: ReactNode
  labelClassName?: string
  /** 队列重复等需稍加提醒时高亮 i 按钮 */
  hintHot?: boolean
}) {
  const labelCls =
    labelClassName ??
    'text-xs font-bold uppercase tracking-widest text-on-surface-variant/92'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelCls}>
          {children}
        </label>
      ) : (
        <span className={labelCls}>{children}</span>
      )}
      <span className="group/hint relative inline-flex align-middle">
        <button
          type="button"
          className={`flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-outline-variant/50 text-on-surface-variant transition-colors hover:border-primary/55 hover:bg-primary/12 hover:text-primary ${
            hintHot
              ? 'border-primary/45 bg-primary/10 text-primary ring-2 ring-primary/25'
              : ''
          }`}
          aria-label={hintSummary}
        >
          <span
            className="material-symbols-outlined text-[14px] leading-none"
            aria-hidden
          >
            info
          </span>
        </button>
        <div
          className="pointer-events-none invisible absolute left-1/2 top-[calc(100%+6px)] z-[120] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 text-left text-[11px] font-normal leading-relaxed normal-case tracking-normal text-on-surface shadow-xl opacity-0 transition-opacity duration-150 group-hover/hint:visible group-hover/hint:opacity-100 group-hover/hint:pointer-events-auto"
          role="tooltip"
        >
          {hint}
        </div>
      </span>
    </div>
  )
}

function thumbForJob(job: DownloadJob): string | null {
  const id = youtubeIdFromUrl(job.url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

function displayTitle(job: DownloadJob): string {
  if (job.title) return job.title
  const id = youtubeIdFromUrl(job.url)
  if (id) return `watch_${id.slice(0, 8)}…`
  try {
    const u = new URL(job.url)
    return u.hostname + u.pathname.slice(0, 24)
  } catch {
    return job.url.slice(0, 48)
  }
}

/** 用于判断队列是否指向同一视频或同一链接 */
function normalizeJobUrlKey(raw: string): string {
  const s = raw.trim()
  const vid = youtubeIdFromUrl(s)
  if (vid) return `video:${vid}`
  try {
    const u = new URL(s)
    u.hash = ''
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `url:${u.hostname.toLowerCase()}${path}${u.search}`
  } catch {
    return `raw:${s}`
  }
}

function normalizedPersistedTitle(title: string | null | undefined): string | null {
  const t = String(title || '').trim()
  if (t.length < 2) return null
  return t.toLowerCase().replace(/\s+/g, ' ')
}

/** 统计「同一视频 / 同一链接」与「服务端已写入的相同标题」是否出现多次 */
function computeDuplicateIndicators(jobs: DownloadJob[]): {
  duplicateUrlKeys: Set<string>
  duplicateTitleKeys: Set<string>
} {
  const urlCounts = new Map<string, number>()
  const titleCounts = new Map<string, number>()
  for (const j of jobs) {
    const uk = normalizeJobUrlKey(j.url)
    urlCounts.set(uk, (urlCounts.get(uk) || 0) + 1)
    const tk = normalizedPersistedTitle(j.title)
    if (tk) titleCounts.set(tk, (titleCounts.get(tk) || 0) + 1)
  }
  const duplicateUrlKeys = new Set<string>()
  for (const [k, n] of urlCounts) {
    if (n > 1) duplicateUrlKeys.add(k)
  }
  const duplicateTitleKeys = new Set<string>()
  for (const [k, n] of titleCounts) {
    if (n > 1) duplicateTitleKeys.add(k)
  }
  return { duplicateUrlKeys, duplicateTitleKeys }
}

function jobLooksDuplicate(
  job: DownloadJob,
  duplicateUrlKeys: Set<string>,
  duplicateTitleKeys: Set<string>,
): boolean {
  if (duplicateUrlKeys.has(normalizeJobUrlKey(job.url))) return true
  const tk = normalizedPersistedTitle(job.title)
  return Boolean(tk && duplicateTitleKeys.has(tk))
}

/** 多任务时在 [minSec, maxSec] 内均匀随机，返回毫秒（含端点） */
function randomWaitMs(minSec: number, maxSec: number): number {
  const lo = Math.min(minSec, maxSec)
  const hi = Math.max(minSec, maxSec)
  const span = hi - lo
  const sec = lo + (span > 0 ? Math.random() * span : 0)
  return Math.max(0, Math.round(sec * 1000))
}

function clampIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(120, Math.max(0, Math.round(n)))
}

/** 批量提交时两任务之间的等待：带动画倒计时并更新 remaining */
function sleepWithCountdown(
  ms: number,
  onTick: (state: { totalMs: number; leftMs: number }) => void,
): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  const deadline = Date.now() + ms
  onTick({ totalMs: ms, leftMs: ms })
  return new Promise((resolve) => {
    const id = window.setInterval(() => {
      const leftMs = Math.max(0, deadline - Date.now())
      onTick({ totalMs: ms, leftMs })
      if (leftMs <= 0) {
        window.clearInterval(id)
        resolve()
      }
    }, 80)
  })
}

function progressWidth(job: DownloadJob): number {
  if (job.status === 'complete') return 100
  if (job.status === 'error') return job.progressPercent ?? 0
  const p = job.progressPercent
  if (typeof p === 'number' && !Number.isNaN(p)) return Math.min(100, Math.max(0, p))
  return 0
}

export function DownloadsPage() {
  const { refresh: refreshGlobalStudio } = useAvailableTags()
  const location = useLocation()
  const [params] = useSearchParams()
  const urlFromQuery = params.get('url') || ''
  const channelTagsRaw = params.get('channelTags')
  const channelTagsFromHome = useMemo((): string[] | null => {
    if (!channelTagsRaw?.trim()) return null
    try {
      const a = JSON.parse(channelTagsRaw) as unknown
      if (!Array.isArray(a)) return null
      return a.map((x) => String(x))
    } catch {
      return null
    }
  }, [channelTagsRaw])
  const [url, setUrl] = useState(urlFromQuery)
  const [quality, setQuality] = useState('1080')
  /** 多行时：上一任务完成（或失败）后，再经 [min,max] 秒内随机等待后发起下一任务 */
  const [intervalMinSec, setIntervalMinSec] = useState(5)
  const [intervalMaxSec, setIntervalMaxSec] = useState(20)
  /** 是否与视频同目录保存封面（默认关闭）；开启后通过 coverFormat 选 .webp / .jpg */
  const [saveCoverImage, setSaveCoverImage] = useState(false)
  const [coverFormat, setCoverFormat] = useState<'webp' | 'jpg'>('webp')
  const [downloadPath, setDownloadPath] = useState('')
  /** 默认目录等已从设置拉取（失败也会置 true，路径可能为空） */
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [pollIds, setPollIds] = useState<Set<string>>(new Set())
  /** 多任务提交时，相邻任务之间的随机间隔倒计时（不在队列卡片上展示） */
  const [interTaskWait, setInterTaskWait] = useState<{
    totalMs: number
    leftMs: number
  } | null>(null)
  const [urlSuggestHint, setUrlSuggestHint] = useState<string | null>(null)
  /** 单行 YouTube 时：防抖 + suggest 接口未完成前为 true */
  const [suggestPending, setSuggestPending] = useState(false)
  const suggestReqId = useRef(0)

  const trimmedUrlLines = useMemo(
    () =>
      url
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((line) => line.length > 0),
    [url],
  )
  const singleYoutubeLine =
    trimmedUrlLines.length === 1 && isAllowedYoutubeUrl(trimmedUrlLines[0])
      ? trimmedUrlLines[0]
      : null

  useEffect(() => {
    setUrl(urlFromQuery)
  }, [urlFromQuery])

  useEffect(() => {
    setSettingsLoaded(false)
    getStudioSettings()
      .then((s) => {
        if (channelTagsFromHome && channelTagsFromHome.length > 0) {
          setDownloadPath(
            resolveTagMappedDownloadPath(s, channelTagsFromHome),
          )
        } else {
          setDownloadPath(s.downloadDir)
        }
      })
      .catch(() => setDownloadPath(''))
      .finally(() => setSettingsLoaded(true))
  }, [channelTagsFromHome])

  useEffect(() => {
    if (!singleYoutubeLine) {
      setUrlSuggestHint(null)
      setSuggestPending(false)
      return
    }
    // 先拿到设置里的默认目录，再 suggest，避免并行时 pathReady 卡在 settingsLoaded
    if (!settingsLoaded) {
      setSuggestPending(false)
      return
    }
    setSuggestPending(true)
    const id = ++suggestReqId.current
    const timer = window.setTimeout(() => {
      void suggestDownloadOutput(singleYoutubeLine)
        .then((r) => {
          if (id !== suggestReqId.current) return
          if (r.matched && r.mappedTag && r.outputDir) {
            setDownloadPath(r.outputDir)
          }
          setUrlSuggestHint(r.hint ?? null)
        })
        .catch(() => {
          if (id !== suggestReqId.current) return
          setUrlSuggestHint(null)
        })
        .finally(() => {
          if (id !== suggestReqId.current) return
          setSuggestPending(false)
        })
    }, 500)
    return () => {
      window.clearTimeout(timer)
      setSuggestPending(false)
    }
  }, [singleYoutubeLine, settingsLoaded])

  const refreshList = () => {
    listJobs().then((r) => setJobs(r.jobs)).catch(() => {})
  }

  useEffect(() => {
    refreshList()
    const t = setInterval(refreshList, 3500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const raw = location.hash.replace(/^#/, '')
    if (raw !== DOWNLOAD_QUEUE_SECTION_ID) return
    const el = document.getElementById(DOWNLOAD_QUEUE_SECTION_ID)
    if (!el) return
    const frame = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.hash])

  /** 进行中任务也拉入快轮询，避免仅靠 3.5s 列表刷新时进度条卡住 */
  useEffect(() => {
    setPollIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const j of jobs) {
        if (j.status === 'downloading' && !next.has(j.id)) {
          next.add(j.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [jobs])

  useEffect(() => {
    if (pollIds.size === 0) return
    const t = setInterval(() => {
      pollIds.forEach((id) => {
        getJob(id)
          .then((j) => {
            setJobs((prev) => {
              const others = prev.filter((x) => x.id !== j.id)
              return [j, ...others]
            })
            if (j.status === 'complete' || j.status === 'error') {
              setPollIds((s) => {
                const n = new Set(s)
                n.delete(id)
                return n
              })
            }
          })
          .catch(() => {})
      })
    }, 450)
    return () => clearInterval(t)
  }, [pollIds])

  const orderedJobs = useMemo(
    () => [...jobs].sort((a, b) => b.createdAt - a.createdAt),
    [jobs],
  )

  const { duplicateUrlKeys, duplicateTitleKeys } = useMemo(
    () => computeDuplicateIndicators(jobs),
    [jobs],
  )
  const hasDuplicateJobs =
    duplicateUrlKeys.size > 0 || duplicateTitleKeys.size > 0

  const hasActiveQueueDownload = useMemo(
    () => jobs.some((j) => j.status === 'downloading'),
    [jobs],
  )
  /**
   * 多行/非 YouTube：必须已加载设置并得到默认路径。
   * 单行 YouTube：设置加载后会有默认路径；识别结束后 suggestPending=false，
   * 若仅依赖 settingsLoaded，识别完成时仍可能因竞态未满足，故用路径非空 + (!pending) 即可。
   */
  const pathReady =
    Boolean(downloadPath.trim())
    && (settingsLoaded || (Boolean(singleYoutubeLine) && !suggestPending))
  const canSubmitByForm =
    trimmedUrlLines.length > 0 && pathReady && !suggestPending

  /** 无有效链接 / 目录未就绪 / 单行识别中 / 批量进行中 / 队列下载中 → 不可点 */
  const startDownloadLocked =
    busy
    || hasActiveQueueDownload
    || !canSubmitByForm

  const queueDownload = async () => {
    const lines = url
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((line) => line.length > 0)
    if (!lines.length) {
      setMsg('请至少输入一个 YouTube 链接（可多行，每行一个）。')
      return
    }
    if (!settingsLoaded || !downloadPath.trim()) {
      setMsg('保存路径尚未就绪，请稍候或到「设置」配置默认目录。')
      return
    }
    if (suggestPending) {
      setMsg('正在根据链接识别频道与目录，请稍候。')
      return
    }
    if (
      busy
      || jobs.some((j) => j.status === 'downloading')
    ) {
      setMsg('当前有下载任务正在执行，请等待结束后再提交。')
      return
    }
    const lo = clampIntervalSec(intervalMinSec)
    const hi = clampIntervalSec(intervalMaxSec)
    setBusy(true)
    setMsg(null)

    const waitUntilJobTerminal = async (jobId: string) => {
      for (;;) {
        try {
          const j = await getJob(jobId)
          setJobs((prev) => {
            const others = prev.filter((x) => x.id !== j.id)
            return [j, ...others]
          })
          if (j.status === 'complete' || j.status === 'error') {
            return
          }
        } catch {
          return
        }
        await new Promise<void>((r) => {
          setTimeout(r, 450)
        })
      }
    }

    try {
      let prevJobId: string | null = null
      for (let i = 0; i < lines.length; i += 1) {
        if (prevJobId) {
          await waitUntilJobTerminal(prevJobId)
          const waitMs = randomWaitMs(lo, hi)
          await sleepWithCountdown(waitMs, setInterTaskWait)
          setInterTaskWait(null)
        }
        const { jobId } = await startDownload(lines[i], quality, {
          outputDir: downloadPath.trim() || undefined,
          thumbnailFormat: saveCoverImage ? coverFormat : null,
        })
        prevJobId = jobId
        setPollIds((s) => new Set(s).add(jobId))
        refreshList()
      }
      if (prevJobId) {
        await waitUntilJobTerminal(prevJobId)
      }
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setInterTaskWait(null)
      setBusy(false)
    }
  }

  const openCompletedJobInFolder = (job: DownloadJob) => {
    if (job.status !== 'complete' || !job.filePath?.trim()) return
    void revealDownloadedFileInFolder(job.id).catch((e: Error) => {
      setMsg(e.message || '无法在文件夹中显示')
    })
  }

  const removeJob = async (id: string) => {
    try {
      await deleteDownloadJob(id)
      setPollIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      refreshList()
    } catch {
      refreshList()
    }
  }

  const clearAll = async () => {
    if (!orderedJobs.length) return
    try {
      await clearAllDownloadJobs()
      setPollIds(new Set())
      refreshList()
    } catch {
      refreshList()
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface font-['Inter'] text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-surface px-6 py-6 md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <h2 className="text-3xl font-black tracking-tighter text-on-surface">
            下载
          </h2>
        </div>
        <PageHeaderToolbar />
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-12 px-6 pb-32 pt-2 md:px-10">
        <section className="space-y-2">
         
        </section>

        <div className="space-y-8">
          <div className="inner-highlight space-y-8 rounded-xl border border-white/14 bg-surface-container p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.45)] md:p-8">
            <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
              <span className="material-symbols-outlined">tune</span>
              下载选项
            </h3>
            <div className="space-y-3">
              <LabelWithHint
                htmlFor="download-url"
                hintSummary="视频链接：每行一条；多行按顺序排队，间隔见「批量间隔」"
                hint={
                  <div className="space-y-2">
                    <p>
                      每行填一个链接。多行时按顺序下载：上一条结束（含失败）后，再按「批量间隔」随机等待，然后发起下一条。
                    </p>
                    <p className="text-on-surface-variant">
                      未识别出频道时，文件会落到默认目录下「未分类」等结构（与订阅/标签映射有关）。
                    </p>
                  </div>
                }
              >
                视频链接
              </LabelWithHint>
              <textarea
                id="download-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="每行一个链接（多行将排队依次下载）"
                rows={5}
                className="custom-scrollbar w-full min-h-[140px] resize-y rounded-lg border border-white/12 bg-surface-container-high px-4 py-4 font-mono text-sm leading-relaxed text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-white/35 break-all"
              />
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/92">
                    画质
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setQuality(q.id)}
                        className={`rounded-lg border px-3 py-3 text-xs font-bold transition-all ${
                          quality === q.id
                            ? 'border-white/25 bg-primary-container text-on-primary-container shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
                            : 'border-white/10 bg-surface-container-highest text-on-surface-variant/55 hover:border-white/16 hover:bg-surface-container-high hover:text-on-surface-variant'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <LabelWithHint
                    hintSummary="默认不下载封面。勾选后与视频同目录保存；需本机已安装 ffmpeg 供转码"
                    hint={
                      <p>
                        默认关闭。勾选后由 yt-dlp
                        写入并转码封面；选择 WebP 或 JPG，文件名与视频标题一致。未安装 ffmpeg
                        时转码可能失败导致整次下载报错。
                      </p>
                    }
                  >
                    封面图
                  </LabelWithHint>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-surface-container-highest px-3 py-2.5 transition-colors hover:border-white/16">
                    <input
                      type="checkbox"
                      checked={saveCoverImage}
                      onChange={(e) => setSaveCoverImage(e.target.checked)}
                      autoComplete="off"
                      className="h-4 w-4 rounded border-white/20 bg-surface-container-high text-primary focus:ring-2 focus:ring-white/35"
                    />
                    <span className="text-sm font-bold text-on-surface">
                      下载视频封面
                    </span>
                  </label>
                  {saveCoverImage ? (
                    <div className="grid grid-cols-2 gap-2 pl-1">
                      {(
                        [
                          { id: 'webp' as const, label: '.webp' },
                          { id: 'jpg' as const, label: '.jpg' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setCoverFormat(f.id)}
                          className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition-all ${
                            coverFormat === f.id
                              ? 'border-white/25 bg-primary-container text-on-primary-container shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
                              : 'border-white/10 bg-surface-container-highest text-on-surface-variant/55 hover:border-white/16 hover:bg-surface-container-high hover:text-on-surface-variant'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                  <LabelWithHint
                    hintSummary="批量间隔：仅多行时生效；上一条结束后的随机等待秒数"
                    hint={
                      <p>
                        仅多行任务时：上一条下载结束（含失败）后，再在「下限～上限」之间随机等待，随后发起下一条。两数相同即固定间隔；均为 0
                        则上一任务结束后立即提交下一条。
                      </p>
                    }
                  >
                    批量间隔（秒）
                  </LabelWithHint>
                  <div className="flex items-center gap-2">
                    <input
                      id="interval-min"
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      value={intervalMinSec}
                      onChange={(e) =>
                        setIntervalMinSec(clampIntervalSec(Number(e.target.value)))
                      }
                      aria-label="随机间隔下限（秒）"
                      className="min-w-0 flex-1 rounded-lg border border-white/12 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-white/35"
                    />
                    <span
                      className="shrink-0 select-none pb-0.5 text-xl leading-none text-on-surface-variant/45"
                      aria-hidden
                    >
                      ～
                    </span>
                    <input
                      id="interval-max"
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      value={intervalMaxSec}
                      onChange={(e) =>
                        setIntervalMaxSec(clampIntervalSec(Number(e.target.value)))
                      }
                      aria-label="随机间隔上限（秒）"
                      className="min-w-0 flex-1 rounded-lg border border-white/12 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-white/35"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <LabelWithHint
                hintSummary="保存路径：单行链接时用 yt-dlp 识别频道并对照订阅与标签目录；可改默认目录"
                hint={
                  <div className="space-y-2">
                    {suggestPending ? (
                      <p className="text-on-surface-variant">正在识别频道与保存目录…</p>
                    ) : null}
                    {urlSuggestHint ? (
                      <p className="text-primary/95">{urlSuggestHint}</p>
                    ) : null}
                    <p>
                      单行 YouTube 链接时会自动识别频道并对照「频道」订阅：若该频道标签在设置里映射了目录，会将路径填入上方框内。实际文件写在运行后端的电脑上。
                    </p>
                    <p className="break-all text-on-surface-variant">
                      当前路径：{downloadPath || '加载中…'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          void openDownloadDirInFileManager().catch((e: Error) => {
                            setMsg(e.message || '无法打开文件夹')
                          })
                        }}
                      >
                        在资源管理器中打开当前目录
                      </button>
                      <span className="text-on-surface-variant">·</span>
                      <Link to="/settings" className="text-primary hover:underline">
                        前往设置修改默认路径
                      </Link>
                    </div>
                    <p className="text-on-surface-variant">
                      左侧文件夹图标：在后端本机打开系统选目录对话框，并把所选路径存为默认目录。
                    </p>
                  </div>
                }
              >
                保存路径
              </LabelWithHint>
              <div className="flex w-full gap-2">
                <div className="min-h-[44px] flex-1 whitespace-pre-wrap break-all rounded-lg border border-white/12 bg-surface-container-high px-4 py-3 font-mono text-xs leading-relaxed text-on-surface-variant">
                  {downloadPath || '加载中…'}
                </div>
                <button
                  type="button"
                  title="在后端电脑上选择下载目录（系统文件夹对话框）"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await pickDownloadDirWithDialog()
                        if (r.ok) {
                          setDownloadPath(r.downloadDir)
                          setMsg(null)
                          refreshGlobalStudio()
                        }
                      } catch (e) {
                        setMsg((e as Error).message || '无法选择目录')
                      }
                    })()
                  }}
                  className="flex shrink-0 items-center justify-center self-stretch rounded-lg border border-white/12 bg-surface-container-high px-4 text-primary transition-colors hover:border-white/18 hover:bg-surface-container-highest"
                >
                  <span className="material-symbols-outlined text-xl">
                    folder_open
                  </span>
                </button>
              </div>
            </div>

            {msg ? (
              <p className="text-sm text-primary/90">{msg}</p>
            ) : null}

            <button
              type="button"
              disabled={startDownloadLocked}
              title={
                busy || hasActiveQueueDownload
                  ? '当前有下载任务进行中'
                  : trimmedUrlLines.length === 0
                    ? '请先输入至少一条视频链接'
                    : !settingsLoaded || !downloadPath.trim()
                      ? '正在加载默认保存路径…'
                      : suggestPending
                        ? '正在识别频道与保存目录…'
                        : undefined
              }
              onClick={() => void queueDownload()}
              className={`flex w-full items-center justify-center gap-3 rounded-lg py-4 font-black transition-colors md:w-auto md:px-12 ${
                startDownloadLocked
                  ? 'cursor-not-allowed bg-surface-container-highest text-on-surface-variant/50 shadow-none'
                  : 'bg-primary-container text-on-primary-container shadow-[0_0_20px_rgba(255,255,255,0.14)] active:scale-[0.98]'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                play_arrow
              </span>
              开始下载
            </button>

            {interTaskWait ? (
              <div
                className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/8 px-4 py-3"
                role="status"
                aria-live="polite"
              >
                <span
                  className="material-symbols-outlined shrink-0 animate-spin text-xl text-primary"
                  aria-hidden
                >
                  progress_activity
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs text-on-surface">
                    随机间隔倒计时
                    <span className="ml-2 font-mono tabular-nums text-primary">
                      {(interTaskWait.leftMs / 1000).toFixed(1)} 秒
                    </span>
                  </p>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                      className="h-full bg-primary/85 transition-[width] duration-75 ease-linear"
                      style={{
                        width: `${interTaskWait.totalMs > 0 ? (interTaskWait.leftMs / interTaskWait.totalMs) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div
            id={DOWNLOAD_QUEUE_SECTION_ID}
            className="scroll-mt-28 space-y-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <LabelWithHint
                  hintHot={hasDuplicateJobs}
                  hintSummary="下载队列与重复任务说明"
                  labelClassName="text-lg font-bold text-on-surface"
                  hint={
                    <div className="space-y-2">
                      <p>
                        任务按顺序执行；进度与日志可在各卡片上查看。暂无任务时，在上方填写链接并点击「开始下载」。
                      </p>
                      <p>
                        若队列里出现<strong className="text-primary">同名或同一视频</strong>
                        的多条任务（相同链接 / 相同视频 ID，或已取得相同标题），可能是重复提交，可删除多余条目以免占队列。
                      </p>
                    </div>
                  }
                >
                  下载队列
                </LabelWithHint>
                <span className="font-mono text-sm font-normal text-on-surface-variant/40">
                  {orderedJobs.length} 个任务
                </span>
              </div>
              <button
                type="button"
                onClick={() => void clearAll()}
                className="text-xs font-bold text-primary transition-all hover:underline"
              >
                清空队列
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {orderedJobs.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  暂无任务。在上方填写链接并点击「开始下载」。
                </p>
              ) : null}
              {orderedJobs.map((job) => {
                const thumb = thumbForJob(job)
                const pct = Math.round(progressWidth(job))
                const isDone = job.status === 'complete'
                const isErr = job.status === 'error'
                const isWorking = job.status === 'downloading'
                const dup = jobLooksDuplicate(
                  job,
                  duplicateUrlKeys,
                  duplicateTitleKeys,
                )
                const canRevealCompleted = Boolean(
                  isDone && job.filePath?.trim(),
                )
                return (
                  <div
                    key={job.id}
                    role={canRevealCompleted ? 'button' : undefined}
                    tabIndex={canRevealCompleted ? 0 : undefined}
                    title={
                      canRevealCompleted
                        ? '在文件夹中显示已下载文件'
                        : undefined
                    }
                    onClick={
                      canRevealCompleted
                        ? () => openCompletedJobInFolder(job)
                        : undefined
                    }
                    onKeyDown={
                      canRevealCompleted
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openCompletedJobInFolder(job)
                            }
                          }
                        : undefined
                    }
                    className={`group flex items-center gap-4 rounded-xl border p-4 transition-all sm:gap-6 md:p-4 ${
                      isErr
                        ? 'border-error/20 bg-error/5'
                        : dup
                          ? 'border-primary/20 bg-primary/[0.06] hover:border-primary/30'
                          : 'border-outline-variant/10 bg-surface-container-high hover:border-primary/30'
                    }${
                      canRevealCompleted
                        ? ' cursor-pointer hover:bg-surface-container-highest/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                        : ''
                    }`}
                  >
                    <div
                      className={`relative h-20 w-32 shrink-0 overflow-hidden rounded bg-surface-container-lowest ${
                        isWorking ? 'opacity-90' : ''
                      }`}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className={`h-full w-full object-cover ${isWorking ? 'opacity-60' : ''}`}
                        />
                      ) : (
                        <div className="h-full w-full bg-surface-container-highest" />
                      )}
                      {isWorking ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                            {pct}%
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate pr-2 font-bold text-on-surface">
                          {displayTitle(job)}
                        </h4>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          {dup ? (
                            <span
                              className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"
                              title="与队列中其他任务指向同一视频或标题相同"
                            >
                              可能重复
                            </span>
                          ) : null}
                          <span className="rounded bg-tertiary-container/10 px-2 py-0.5 font-mono text-[10px] text-tertiary-container">
                            {qualityLabel(job.quality)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                          <div
                            className={`h-full transition-[width] duration-300 ${
                              isDone
                                ? 'bg-success shadow-[0_0_10px_rgba(34,197,94,0.35)]'
                                : 'bg-primary shadow-[0_0_10px_rgba(255,255,255,0.35)]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between gap-2 font-mono text-[10px] text-on-surface-variant/40">
                          <span className="truncate">
                            {isDone
                              ? '已完成'
                              : isErr
                                ? job.error || '失败'
                                : job.sizeHint || job.progress || '正在开始…'}
                          </span>
                          <span className="shrink-0">
                            {isWorking && job.speed
                              ? job.speed
                              : isWorking
                                ? '…'
                                : isDone
                                  ? '就绪'
                                  : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeJob(job.id)
                      }}
                      className="shrink-0 p-2 text-on-surface-variant transition-colors hover:text-error"
                      aria-label="从队列移除"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
