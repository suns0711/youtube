type Props = {
  /** 占位「频道」区块数量 */
  sections?: number
  /** 每区块占位视频卡片数（与 md:grid-cols-3 一致） */
  cardsPerSection?: number
}

/**
 * 首页订阅 feed 加载占位，结构与真实列表一致，减轻白屏感
 */
export function FeedLoadingSkeleton({
  sections = 3,
  cardsPerSection = 3,
}: Props) {
  return (
    <div
      className="space-y-16"
      aria-busy="true"
      aria-label="正在加载订阅动态"
    >
      <div className="animate-pulse">
        {Array.from({ length: sections }, (_, si) => (
          <div
            key={si}
            className="mb-16 border-b border-outline-variant/10 pb-16 last:mb-0 last:border-0 last:pb-0"
          >
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-full bg-surface-container-highest" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-6 max-w-[220px] rounded-lg bg-surface-container-highest" />
                <div className="h-4 max-w-[140px] rounded-lg bg-surface-container-highest/75" />
              </div>
              <div className="h-9 w-24 shrink-0 rounded-lg bg-surface-container-highest/80" />
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
              {Array.from({ length: cardsPerSection }, (_, ci) => (
                <div key={ci} className="flex flex-col gap-4">
                  <div className="aspect-video w-full rounded-xl bg-surface-container-highest" />
                  <div className="flex gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-highest" />
                    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                      <div className="h-4 w-full rounded bg-surface-container-highest" />
                      <div className="h-4 w-4/5 max-w-[280px] rounded bg-surface-container-highest/70" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 某频道下视频栅格占位（与 hideChannelMeta 的 VideoCard 布局一致） */
export function SectionVideosSkeleton({
  cardsPerSection = 3,
}: {
  cardsPerSection?: number
}) {
  return (
    <div
      className="grid animate-pulse grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-3"
      aria-busy="true"
      aria-label="正在加载视频"
    >
      {Array.from({ length: cardsPerSection }, (_, ci) => (
        <div key={ci} className="flex flex-col gap-4">
          <div className="aspect-video w-full rounded-xl bg-surface-container-highest" />
          <div className="space-y-2 pt-0.5">
            <div className="h-5 w-full rounded-lg bg-surface-container-highest" />
            <div className="h-3.5 max-w-[220px] rounded-lg bg-surface-container-highest/75" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 搜索模式下的栅格占位 */
export function SearchResultsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="mt-2 grid animate-pulse grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="正在搜索"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-4">
          <div className="aspect-video w-full rounded-xl bg-surface-container-highest" />
          <div className="flex gap-4">
            <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-highest" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className="h-4 w-full rounded bg-surface-container-highest" />
              <div className="h-3 w-3/5 rounded bg-surface-container-highest/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
