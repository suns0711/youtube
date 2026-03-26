import type { StudioSettings } from '../api'

/**
 * 频道仅有 1 个标签且在系统设置中有对应映射时返回映射路径；
 * 否则返回默认 downloadDir（无标签、多标签、未配置映射均回退）。
 */
export function resolveTagMappedDownloadPath(
  settings: StudioSettings,
  channelTags: string[] | undefined,
): string {
  const fallback = String(settings.downloadDir || '').trim()
  const tags = (channelTags || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
  if (tags.length !== 1) return fallback

  const want = tags[0].toLowerCase()
  const row = settings.tagMappings.find(
    (m) => m.tag.trim().toLowerCase() === want,
  )
  const p = row?.path != null ? String(row.path).trim() : ''
  if (!p) return fallback
  return p
}
