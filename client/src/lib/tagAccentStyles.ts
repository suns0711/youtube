/** 与 server TAG_ACCENTS 顺序/取值一致 */
export const TAG_ACCENT_IDS = [
  'coral',
  'sky',
  'violet',
  'mint',
  'amber',
  'rose',
  'cyan',
] as const

export type TagAccentId = (typeof TAG_ACCENT_IDS)[number]

const ID_SET = new Set<string>(TAG_ACCENT_IDS)

function hashTag(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function resolveTagAccentId(
  tag: string,
  map: Record<string, string> | undefined,
): TagAccentId {
  const raw = map?.[tag]
  if (raw && ID_SET.has(raw)) return raw as TagAccentId
  return TAG_ACCENT_IDS[hashTag(tag) % TAG_ACCENT_IDS.length]
}

/** Tags 页等大标签块 */
export function tagAccentPillClass(id: TagAccentId, open: boolean): string {
  const base = 'transition-colors'
  const ring: Record<TagAccentId, string> = {
    coral: 'ring-primary/40',
    sky: 'ring-tertiary/45',
    violet: 'ring-purple-400/45',
    mint: 'ring-teal-400/45',
    amber: 'ring-amber-400/45',
    rose: 'ring-rose-400/45',
    cyan: 'ring-cyan-400/45',
  }
  const openCls = open ? `ring-2 ${ring[id]}` : ''
  const by: Record<TagAccentId, string> = {
    coral: `${base} border-primary/35 bg-primary/10 text-primary hover:border-primary/55 ${openCls}`,
    sky: `${base} border-tertiary/40 bg-tertiary/10 text-tertiary hover:border-tertiary/60 ${openCls}`,
    violet: `${base} border-purple-400/35 bg-purple-500/10 text-purple-200 hover:border-purple-400/55 ${openCls}`,
    mint: `${base} border-teal-400/35 bg-teal-500/10 text-teal-200 hover:border-teal-400/55 ${openCls}`,
    amber: `${base} border-amber-400/40 bg-amber-500/10 text-amber-100 hover:border-amber-400/60 ${openCls}`,
    rose: `${base} border-rose-400/35 bg-rose-500/10 text-rose-200 hover:border-rose-400/55 ${openCls}`,
    cyan: `${base} border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400/55 ${openCls}`,
  }
  return by[id]
}

/**
 * 当前 URL `feedTag` 与标签一致时叠用：加粗描边 + 光晕，与侧栏/首页标签筛选联动。
 */
export const tagFeedFilterSelectedOverlayClass =
  'z-[1] font-semibold ring-2 ring-primary shadow-[0_0_18px_rgba(255,85,64,0.55)]'

/** 侧栏小 pill */
export function tagAccentSidebarClass(id: TagAccentId): string {
  const by: Record<TagAccentId, string> = {
    coral:
      'border-primary/25 bg-primary/8 text-primary hover:border-primary/45',
    sky: 'border-tertiary/30 bg-tertiary/8 text-tertiary hover:border-tertiary/45',
    violet:
      'border-purple-400/25 bg-purple-500/8 text-purple-200 hover:border-purple-400/45',
    mint: 'border-teal-400/25 bg-teal-500/8 text-teal-200 hover:border-teal-400/45',
    amber:
      'border-amber-400/30 bg-amber-500/8 text-amber-100 hover:border-amber-400/45',
    rose: 'border-rose-400/25 bg-rose-500/8 text-rose-200 hover:border-rose-400/45',
    cyan: 'border-cyan-400/25 bg-cyan-500/8 text-cyan-200 hover:border-cyan-400/45',
  }
  return by[id]
}
