/** 下载页任务列表区域 DOM id；顶栏/侧栏链接 `#` 与此一致 */
export const DOWNLOAD_QUEUE_SECTION_ID = 'download-queue'

/** 进入下载页并滚动到任务列表 */
export function downloadsPageQueueHref(): string {
  return `/downloads#${DOWNLOAD_QUEUE_SECTION_ID}`
}

/** 顶栏 / 侧栏：队列有已完成任务时的红点（配合外层 `relative` 与定位类） */
export const DOWNLOAD_QUEUE_BADGE_DOT_CLASS =
  'pointer-events-none h-2 w-2 rounded-full bg-error shadow-[0_0_6px_rgba(248,113,113,0.75)] ring-1 ring-surface'

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
