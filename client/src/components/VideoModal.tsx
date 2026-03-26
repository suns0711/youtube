import { useEffect, useState } from 'react'
import type { VideoItem } from '../api'
import { getVideoInfo } from '../api'
import { formatDuration } from '../util'

type Props = {
  video: VideoItem | null
  open: boolean
  onClose: () => void
  onDownload: (payload: { url: string; feedChannelTags?: string[] }) => void
}

export function VideoModal({ video, open, onClose, onDownload }: Props) {
  const [detail, setDetail] = useState<VideoItem | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !video) {
      setDetail(null)
      setErr(null)
      return
    }
    if (video.sample) {
      setDetail(null)
      setErr(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    getVideoInfo(video.url)
      .then((r) => setDetail(r.video))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [open, video])

  if (!open || !video) return null

  const v = detail || video
  const embed = `https://www.youtube-nocookie.com/embed/${video.id}`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-low shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-4 py-3">
          <h2 className="truncate pr-4 text-lg font-bold text-primary">
            {v.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
          {video.sample ? (
            <p className="mb-3 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
              示例卡片：封面与标题为原型展示；播放器内为对应 ID 的真实 YouTube 视频。
            </p>
          ) : null}
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              title={v.title}
              src={embed}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="mt-4 space-y-2 text-sm text-on-surface-variant">
            <p>
              <span className="text-on-surface">{v.channel}</span>
              <span className="mx-2 text-outline-variant">·</span>
              时长 {formatDuration(v.duration)}
            </p>
            {loading ? <p>加载详情…</p> : null}
            {err ? <p className="text-error">{err}</p> : null}
            {v.description ? (
              <p className="whitespace-pre-wrap leading-relaxed text-on-surface-variant/90">
                {v.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex gap-3 border-t border-outline-variant/15 p-4">
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-outline-variant/30 px-4 py-2 text-sm text-on-surface-variant hover:border-primary/40 hover:text-primary"
          >
            在 YouTube 打开
          </a>
          <button
            type="button"
            onClick={() =>
              onDownload({
                url: v.url,
                feedChannelTags: video.feedChannelTags,
              })
            }
            className="button-gradient rounded-lg px-4 py-2 text-sm font-semibold text-on-primary-container"
          >
            前往下载
          </button>
        </div>
      </div>
    </div>
  )
}
