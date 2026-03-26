const base = ''

export const STUDIO_USER_STORAGE_KEY = 'studio-user'

/** 与后端 ALLOWED_USERS（默认 ss,yb）保持一致，仅用于 UI 展示 */
export const STUDIO_USER_OPTIONS = ['ss', 'yb'] as const

export function getStudioUser(): string {
  if (typeof localStorage === 'undefined') return 'ss'
  const u = (localStorage.getItem(STUDIO_USER_STORAGE_KEY) || 'ss')
    .trim()
    .toLowerCase()
  return /^[a-z0-9_-]{1,32}$/i.test(u) ? u : 'ss'
}

export function setStudioUser(userId: string): void {
  localStorage.setItem(STUDIO_USER_STORAGE_KEY, userId.trim().toLowerCase())
}

function withStudioUserHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('X-Studio-User', getStudioUser())
  return { ...init, headers }
}

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withStudioUserHeaders(init))
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(text || '无效 JSON 响应')
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error || res.statusText
    throw new Error(err)
  }
  return data as T
}

export type VideoItem = {
  id: string
  title: string
  channel: string
  thumbnail: string | null
  duration: number | null
  url: string
  description?: string
  view_count?: number | null
  webpage_url?: string
  upload_date?: string | null
  channel_thumbnail?: string | null
  /** 首页示例卡片：不请求 info，播放仍用 id 对应的真实视频 */
  sample?: boolean
  /** 覆盖副标题时间文案（示例用「5 hours ago」等） */
  display_time?: string
  /** 首页订阅区块来源频道的标签（仅前端写入，用于跳转下载页默认路径） */
  feedChannelTags?: string[]
}

export type DownloadJob = {
  id: string
  url: string
  quality: string
  status: string
  progress: string
  progressPercent?: number
  speed?: string | null
  sizeHint?: string | null
  filePath: string | null
  title: string | null
  error: string | null
  createdAt: number
}

export type Health = {
  ok: boolean
  ytDlp?: string
  downloadDir?: string
  binary?: string
  error?: string
  hint?: string
}

export type TagMapping = {
  id: string
  tag: string
  path: string
  dot: 'tertiary' | 'primary'
}

export type StudioSettings = {
  downloadDir: string
  tagMappings: TagMapping[]
  /** 侧栏预设 + 订阅标签 + 当前映射汇总；仅服务端填充 */
  availableTags?: string[]
  /** 标签 → 展示色键（服务端随机分配并持久化） */
  tagAccentByLabel?: Record<string, string>
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${base}/api/health`)
  return (await res.json().catch(() => ({ ok: false }))) as Health
}

export type FeedSort = 'activity' | 'recent' | 'popular'

export async function searchVideos(
  q: string,
  opts?: { sort?: FeedSort },
): Promise<{ videos: VideoItem[] }> {
  const sort = opts?.sort ?? 'activity'
  const res = await apiFetch(
    `${base}/api/search?${new URLSearchParams({ q, sort })}`,
  )
  return parseJson(res)
}

export type SubscriptionFeedSection = {
  subscriptionId: string
  channelName: string
  handle: string
  channelUrl?: string
  avatarUrl?: string
  /** 与 Channels 页一致的频道标签 */
  tags?: string[]
  videos: VideoItem[]
  error?: string
}

/** 各已订阅频道最近视频（默认每频道 3 条） */
export async function fetchSubscriptionRecentVideos(opts?: {
  perChannel?: number
  /** recent：各频道「最新」列表前 N 条；views：各频道「热门」(?sort=p) 前 N 条，再在前端按观看数混排 */
  sort?: 'recent' | 'views'
}): Promise<{ sections: SubscriptionFeedSection[] }> {
  const sp = new URLSearchParams()
  if (opts?.perChannel != null) {
    sp.set('perChannel', String(opts.perChannel))
  }
  if (opts?.sort === 'views') {
    sp.set('sort', 'views')
  }
  const q = sp.toString()
  const res = await apiFetch(
    `${base}/api/subscriptions/recent-videos${q ? `?${q}` : ''}`,
  )
  return parseJson(res)
}

export type SubscriptionChannel = {
  id: string
  name: string
  handle: string
  subscriberLabel: string
  avatarUrl: string
  tags: string[]
  notificationsMuted: boolean
  channelUrl: string
  /** 频道简介（yt-dlp 拉取） */
  description?: string
  /** 公开视频数量文案，如「285 videos」 */
  videoCountLabel?: string
  updatedAt: number
}

export async function listSubscriptions(opts?: {
  sort?: 'updated' | 'name'
  filter?: string
}): Promise<{ channels: SubscriptionChannel[] }> {
  const sp = new URLSearchParams()
  if (opts?.sort) sp.set('sort', opts.sort)
  if (opts?.filter?.trim()) sp.set('filter', opts.filter.trim())
  const q = sp.toString()
  const res = await apiFetch(
    `${base}/api/subscriptions${q ? `?${q}` : ''}`,
  )
  return parseJson(res)
}

export async function createSubscription(
  body: Partial<SubscriptionChannel> & {
    name?: string
    handle?: string
    /** 仅填频道 URL 时由服务端用 yt-dlp 补全头像、订阅数、视频数、描述等 */
    channelUrl?: string
  },
): Promise<SubscriptionChannel> {
  const res = await apiFetch(`${base}/api/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function updateSubscription(
  id: string,
  body: Partial<SubscriptionChannel>,
): Promise<SubscriptionChannel> {
  const res = await apiFetch(`${base}/api/subscriptions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteSubscription(id: string): Promise<void> {
  const res = await apiFetch(`${base}/api/subscriptions/${id}`, {
    method: 'DELETE',
  })
  await parseJson(res)
}

export async function getVideoInfo(
  url: string,
): Promise<{ video: VideoItem & { description?: string } }> {
  const res = await apiFetch(`${base}/api/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return parseJson(res)
}

export type SuggestDownloadOutputResult = {
  matched: boolean
  outputDir: string
  channelName: string | null
  channelTitle: string | null
  tags: string[]
  mappedTag: string | null
  hint: string | null
}

/** 单个视频 URL：yt-dlp 取频道 → 匹配当前用户订阅 → 按标签→目录映射建议保存路径 */
export async function suggestDownloadOutput(
  url: string,
): Promise<SuggestDownloadOutputResult> {
  const res = await apiFetch(`${base}/api/download/suggest-output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return parseJson(res)
}

export async function startDownload(
  url: string,
  quality: string,
  opts?: { outputDir?: string },
): Promise<{ jobId: string }> {
  const body: { url: string; quality: string; outputDir?: string } = {
    url,
    quality,
  }
  const od = opts?.outputDir?.trim()
  if (od) body.outputDir = od
  const res = await apiFetch(`${base}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function getJob(jobId: string): Promise<DownloadJob> {
  const res = await apiFetch(`${base}/api/download/${jobId}`)
  return parseJson(res)
}

export async function listJobs(): Promise<{ jobs: DownloadJob[] }> {
  const res = await apiFetch(`${base}/api/downloads`)
  return parseJson(res)
}

export async function deleteDownloadJob(jobId: string): Promise<void> {
  const res = await apiFetch(`${base}/api/download/${jobId}`, {
    method: 'DELETE',
  })
  await parseJson(res)
}

export async function clearAllDownloadJobs(): Promise<void> {
  const res = await apiFetch(`${base}/api/downloads`, { method: 'DELETE' })
  await parseJson(res)
}

/** 在运行后端的机器上打开当前下载目录（Finder / 资源管理器等） */
export async function openDownloadDirInFileManager(): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${base}/api/open-download-dir`, {
    method: 'POST',
  })
  return parseJson(res)
}

/** 在运行后端的机器上弹出系统文件夹对话框；取消时 ok 为 false */
export async function pickDownloadDirWithDialog(): Promise<
  | { ok: true; downloadDir: string }
  | { ok: false; cancelled: true }
> {
  const res = await apiFetch(`${base}/api/pick-download-dir`, {
    method: 'POST',
  })
  const text = await res.text()
  let data: { ok?: boolean; cancelled?: boolean; downloadDir?: string; error?: string }
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(text || '无效响应')
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  if (data.cancelled || data.ok === false) {
    return { ok: false, cancelled: true }
  }
  if (data.ok && typeof data.downloadDir === 'string') {
    return { ok: true, downloadDir: data.downloadDir }
  }
  throw new Error(data.error || '选择目录失败')
}

/** 系统选文件夹，仅返回路径，不修改默认下载目录（如设置页 Tag 映射） */
export async function pickFolderPathWithDialog(): Promise<
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
> {
  const res = await apiFetch(`${base}/api/pick-folder-path`, {
    method: 'POST',
  })
  const text = await res.text()
  let data: { ok?: boolean; cancelled?: boolean; path?: string; error?: string }
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(text || '无效响应')
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  if (data.cancelled || data.ok === false) {
    return { ok: false, cancelled: true }
  }
  if (data.ok && typeof data.path === 'string') {
    return { ok: true, path: data.path }
  }
  throw new Error(data.error || '选择目录失败')
}

export async function getStudioSettings(): Promise<StudioSettings> {
  const res = await apiFetch(`${base}/api/settings`)
  return parseJson<StudioSettings>(res)
}

export async function saveStudioSettings(
  body: StudioSettings,
): Promise<StudioSettings> {
  const res = await apiFetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function removeStudioTag(tag: string): Promise<{
  ok: boolean
  availableTags: string[]
}> {
  const res = await apiFetch(`${base}/api/tags/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  })
  return parseJson(res)
}
