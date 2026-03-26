import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  clearAllDownloadJobs,
  deleteDownloadJob,
  getJob,
  getStudioSettings,
  listJobs,
  openDownloadDirInFileManager,
  pickDownloadDirWithDialog,
  startDownload,
  type DownloadJob,
} from '../api'
import { resolveTagMappedDownloadPath } from '../lib/resolveTagDownloadPath'
import { youtubeIdFromUrl } from '../util'
import { HeaderStudioUser } from '../components/HeaderStudioUser'

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
  const [downloadPath, setDownloadPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [pollIds, setPollIds] = useState<Set<string>>(new Set())
  /** 多任务提交时，相邻任务之间的随机间隔倒计时（不在队列卡片上展示） */
  const [interTaskWait, setInterTaskWait] = useState<{
    totalMs: number
    leftMs: number
  } | null>(null)

  useEffect(() => {
    setUrl(urlFromQuery)
  }, [urlFromQuery])

  useEffect(() => {
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
  }, [channelTagsFromHome])

  const refreshList = () => {
    listJobs().then((r) => setJobs(r.jobs)).catch(() => {})
  }

  useEffect(() => {
    refreshList()
    const t = setInterval(refreshList, 3500)
    return () => clearInterval(t)
  }, [])

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

  const queueDownload = async () => {
    const lines = url
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((line) => line.length > 0)
    if (!lines.length) {
      setMsg('请至少输入一个 YouTube 链接（可多行，每行一个）。')
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
        })
        prevJobId = jobId
        setPollIds((s) => new Set(s).add(jobId))
        refreshList()
      }
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setInterTaskWait(null)
      setBusy(false)
    }
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
    if (!window.confirm('确定清空下载队列中的所有任务？')) return
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
      <header className="sticky top-0 z-50 flex w-full items-center justify-between bg-surface px-6 py-4 tracking-tight md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <span className="text-xl font-bold tracking-tighter text-primary">
            下载
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
          >
            <span className="material-symbols-outlined">download</span>
          </button>
          <Link
            to="/settings"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
          >
            <span className="material-symbols-outlined">settings</span>
          </Link>
          <HeaderStudioUser size="sm" className="ml-2" />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-12 px-6 pb-32 pt-2 md:px-10">
        <section className="space-y-2">
         
        </section>

        <div className="space-y-8">
          <div className="inner-highlight space-y-8 rounded-xl bg-surface-container-low p-6 md:p-8">
            <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
              <span className="material-symbols-outlined">tune</span>
              下载选项
            </h3>
            <div className="space-y-3">
              <label
                htmlFor="download-url"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60"
              >
                视频链接
              </label>
              <textarea
                id="download-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="每行一个链接。多行时按顺序下载：上一条完成后，再按下方区间随机等待，然后发起下一条。https://www.youtube.com/watch?v=…"
                rows={5}
                className="custom-scrollbar w-full min-h-[140px] resize-y rounded-lg border-0 bg-surface-container-lowest px-4 py-4 font-mono text-sm leading-relaxed text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 break-all"
              />
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">
                    画质
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setQuality(q.id)}
                        className={`rounded-lg px-3 py-3 text-xs font-bold transition-all ${
                          quality === q.id
                            ? 'border border-primary/20 bg-surface-container-high text-primary'
                            : 'bg-surface-container-lowest text-on-surface-variant/40 hover:bg-surface-container-high'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">
                    批量间隔（秒）
                  </label>
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
                      className="min-w-0 flex-1 rounded-lg border-0 bg-surface-container-lowest px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                      className="min-w-0 flex-1 rounded-lg border-0 bg-surface-container-lowest px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-on-surface-variant/50">
                    仅多行时：上一条下载结束（含失败）后，再按两框区间随机等待，随后发起下一条。两数相同为固定间隔；均为 0
                    则上一任务结束后立即提交下一条。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">
                保存路径
              </label>
              <div className="flex w-full gap-2">
                <div className="min-h-[44px] flex-1 whitespace-pre-wrap break-all rounded-lg bg-surface-container-lowest px-4 py-3 font-mono text-xs leading-relaxed text-on-surface-variant">
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
                        }
                      } catch (e) {
                        setMsg((e as Error).message || '无法选择目录')
                      }
                    })()
                  }}
                  className="flex shrink-0 items-center justify-center self-stretch rounded-lg bg-surface-container-high px-4 text-primary transition-colors hover:bg-surface-container-highest"
                >
                  <span className="material-symbols-outlined text-xl">
                    folder_open
                  </span>
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-on-surface-variant/50">
                路径与下载任务在运行后端的电脑上。点击图标将打开系统选文件夹并保存为默认目录；也可在{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    void openDownloadDirInFileManager().catch((e: Error) => {
                      setMsg(e.message || '无法打开文件夹')
                    })
                  }}
                >
                  资源管理器中打开当前目录
                </button>
                ，或前往{' '}
                <Link to="/settings" className="text-primary hover:underline">
                  设置
                </Link>
                中手动修改默认路径。
              </p>
            </div>

            {msg ? (
              <p className="text-sm text-primary/90">{msg}</p>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => void queueDownload()}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-primary-container to-[#FF5540] py-4 font-black text-on-primary-container shadow-[0_4px_20px_rgba(255,85,64,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 md:w-auto md:px-12"
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

          <div className="space-y-6">
            <div className="flex items-end justify-between gap-4">
              <h3 className="text-lg font-bold text-on-surface">
                下载队列{' '}
                <span className="ml-2 font-mono text-sm font-normal text-on-surface-variant/40">
                  {orderedJobs.length} 个任务
                </span>
              </h3>
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
                return (
                  <div
                    key={job.id}
                    className={`group flex items-center gap-4 rounded-xl border border-outline-variant/10 p-4 transition-all sm:gap-6 md:p-4 ${
                      isErr
                        ? 'bg-error/5 border-error/20'
                        : 'bg-surface-container-high hover:border-primary/30'
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
                          <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-primary">
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
                        <span className="shrink-0 rounded bg-tertiary-container/10 px-2 py-0.5 font-mono text-[10px] text-tertiary-container">
                          {qualityLabel(job.quality)}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                          <div
                            className="h-full bg-primary shadow-[0_0_10px_rgba(255,180,168,0.5)] transition-[width] duration-300"
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
                      onClick={() => void removeJob(job.id)}
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
