/** 首页等到下载页：附带频道标签供下载页解析默认目录（与系统设置 tag 映射联动） */
export function buildDownloadsHref(
  videoUrl: string,
  channelTags?: string[],
): string {
  const sp = new URLSearchParams()
  sp.set('url', videoUrl)
  if (channelTags && channelTags.length > 0) {
    sp.set('channelTags', JSON.stringify(channelTags))
  }
  return `/downloads?${sp.toString()}`
}
