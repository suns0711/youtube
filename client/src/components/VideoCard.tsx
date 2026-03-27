import type { VideoItem } from '../api'
import {
  formatDuration,
  formatUploadDateIso,
  relativeUploadLabel,
} from '../util'

type Props = {
  video: VideoItem
  onPlay: (v: VideoItem) => void
  onDownload?: (v: VideoItem) => void
  /** 首页按频道分区：组头已有频道信息，隐藏卡片内小头像与频道名 */
  hideChannelMeta?: boolean
}

function channelAvatarUrl(v: VideoItem): string {
  if (v.channel_thumbnail) return v.channel_thumbnail
  const name = encodeURIComponent(v.channel || '频道')
  return `https://ui-avatars.com/api/?name=${name}&size=128&background=2a2a2a&color=ffffff&bold=true`
}

export function VideoCard({
  video,
  onPlay,
  onDownload,
  hideChannelMeta = false,
}: Props) {
  const thumb =
    video.thumbnail
    || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
  const uploaded = (() => {
    if (video.display_time) return video.display_time
    const ymd = video.upload_date
    if (ymd && ymd.length === 8) {
      const iso = formatUploadDateIso(ymd)
      const rel = relativeUploadLabel(ymd)
      return rel ? `${iso} · ${rel}` : iso
    }
    return relativeUploadLabel(video.upload_date ?? undefined)
  })()

  return (
    <div className="group flex flex-col gap-4">
      <button
        type="button"
        onClick={() => onPlay(video)}
        className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-surface-container-high text-left shadow-lg"
      >
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-surface-container-lowest/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <span className="glass-overlay flex h-14 w-14 items-center justify-center rounded-full text-primary">
            <span
              className="material-symbols-outlined text-4xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              play_arrow
            </span>
          </span>
        </div>
        <div className="absolute bottom-3 right-3 glass-overlay rounded px-2 py-0.5 font-mono text-[10px] text-white">
          {formatDuration(video.duration)}
        </div>
      </button>
      <div
        className={`flex items-start ${hideChannelMeta ? 'gap-3' : 'gap-4'}`}
      >
        {!hideChannelMeta ? (
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-outline-variant/10 bg-surface-container-highest">
            <img
              src={channelAvatarUrl(video)}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3
            title={video.title}
            className="truncate text-lg font-bold leading-tight text-on-surface transition-colors group-hover:text-primary"
          >
            {video.title}
          </h3>
          {hideChannelMeta ? (
            uploaded ? (
              <time
                className="mt-1 block text-[11px] text-on-surface-variant"
                dateTime={
                  video.upload_date && video.upload_date.length === 8
                    ? `${video.upload_date.slice(0, 4)}-${video.upload_date.slice(4, 6)}-${video.upload_date.slice(6, 8)}`
                    : undefined
                }
              >
                {uploaded}
              </time>
            ) : null
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-on-surface-variant">
                {video.channel || 'YouTube'}
              </span>
              {uploaded ? (
                <>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-outline-variant/40" />
                  <time
                    className="text-[11px] text-on-surface-variant"
                    dateTime={
                      video.upload_date && video.upload_date.length === 8
                        ? `${video.upload_date.slice(0, 4)}-${video.upload_date.slice(4, 6)}-${video.upload_date.slice(6, 8)}`
                        : undefined
                    }
                  >
                    {uploaded}
                  </time>
                </>
              ) : null}
            </div>
          )}
        </div>
        {onDownload ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDownload(video)
            }}
            className="shrink-0 self-start p-1 text-on-surface-variant transition-colors hover:text-primary"
            title="下载"
          >
            <span className="material-symbols-outlined text-xl">download</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
