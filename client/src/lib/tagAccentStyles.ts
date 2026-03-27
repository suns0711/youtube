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

/**
 * 标签色：频道卡片 / 侧栏筛选 / 首页 feed / 标签管理页共用（open 仅标签页展开态描边）。
 * 使用高饱和色底，与黑底页面对比清晰。
 */
export function tagAccentPillClass(id: TagAccentId, open: boolean): string {
  const base = 'transition-colors'
  const ring: Record<TagAccentId, string> = {
    coral: 'ring-orange-400/90',
    sky: 'ring-sky-400/90',
    violet: 'ring-violet-400/90',
    mint: 'ring-emerald-400/90',
    amber: 'ring-amber-400/90',
    rose: 'ring-pink-400/90',
    cyan: 'ring-cyan-400/90',
  }
  const openCls = open ? `ring-2 ${ring[id]}` : ''
  const by: Record<TagAccentId, string> = {
    coral: `${base} border-orange-500/85 bg-orange-500/45 text-orange-50 hover:border-orange-400 hover:bg-orange-500/55 ${openCls}`,
    sky: `${base} border-sky-500/85 bg-sky-600/45 text-sky-50 hover:border-sky-400 hover:bg-sky-600/55 ${openCls}`,
    violet: `${base} border-violet-500/85 bg-violet-600/45 text-violet-50 hover:border-violet-400 hover:bg-violet-600/55 ${openCls}`,
    mint: `${base} border-emerald-500/85 bg-emerald-600/45 text-emerald-50 hover:border-emerald-400 hover:bg-emerald-600/55 ${openCls}`,
    amber: `${base} border-amber-500/85 bg-amber-500/50 text-amber-950 hover:border-amber-400 hover:bg-amber-500/65 ${openCls}`,
    rose: `${base} border-pink-500/85 bg-pink-600/45 text-pink-50 hover:border-pink-400 hover:bg-pink-600/55 ${openCls}`,
    cyan: `${base} border-cyan-500/85 bg-cyan-600/45 text-cyan-50 hover:border-cyan-400 hover:bg-cyan-600/55 ${openCls}`,
  }
  return by[id]
}

/**
 * _feedTag_ 选中叠用：高亮描边；白环在艳色标签上也清晰。
 */
export const tagFeedFilterSelectedOverlayClass =
  'z-[1] font-semibold ring-2 ring-white shadow-[0_0_16px_rgba(255,255,255,0.35)]'
