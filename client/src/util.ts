/** YouTube 风格 YYYYMMDD → YYYY-MM-DD */
export function formatUploadDateIso(ymd: string | null | undefined): string {
  if (!ymd || ymd.length !== 8) return ''
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

export function relativeUploadLabel(
  ymd: string | null | undefined,
): string {
  if (!ymd || ymd.length !== 8) return ''
  const y = Number(ymd.slice(0, 4))
  const mo = Number(ymd.slice(4, 6)) - 1
  const d = Number(ymd.slice(6, 8))
  const then = new Date(y, mo, d)
  const now = new Date()
  const dayMs = 86400000
  const diffDays = Math.floor((now.getTime() - then.getTime()) / dayMs)
  if (diffDays < 0) return 'just now'
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

/** 与后台 isAllowedYoutubeUrl 一致，用于前端预判是否调用解析接口 */
export function isAllowedYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url.trim())
    const h = u.hostname.replace(/^www\./, '').toLowerCase()
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return (
      h === 'youtube.com'
      || h === 'youtu.be'
      || h === 'm.youtube.com'
      || h === 'music.youtube.com'
    )
  } catch {
    return false
  }
}

export function youtubeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.replace(/^www\./, '').includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    const v = u.searchParams.get('v')
    if (v) return v
  } catch {
    return null
  }
  return null
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}
