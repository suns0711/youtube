import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import {
  resolveTagAccentId,
  tagAccentSidebarClass,
  tagFeedFilterSelectedOverlayClass,
} from '../lib/tagAccentStyles'

const LOGO_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAwYZxBfOZ648BeeAqyoHj59XSX41LzHTr7BhtwV8xxatrGo7WKVULPe-ZXUcFsqXIH2RzP12suuTv5ZL-QYpDErK8jxIMtikSv1m2PqABj5CcmYE6AtSefWNAWcbWmyHPahcWdz7HhONgpaTHUXM1CiHxQqBxtWMSV4pn2D8PnzPGMHvzj34dgmz4oSJIsKpSeCc9DQMobcQ-PO8EcLNk97At0hFK__bsfCKyDs7Bixzm_K1BJbisd_YttKxH2PC3yBeJrGluXTOCe'

const navClass =
  'flex items-center gap-3 rounded-lg px-4 py-3 font-[\'Inter\'] text-sm font-medium transition-all'
const inactive =
  'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
const active =
  'scale-[1.02] bg-primary/18 font-semibold text-primary shadow-[0_0_28px_rgba(255,85,64,0.28)] ring-1 ring-inset ring-primary/50'

export function Sidebar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { tags: filterTags, tagAccentByLabel } = useAvailableTags()
  const activeFeedTag = (searchParams.get('feedTag') || '').trim()

  const onSidebarTagClick = (tagLabel: string) => {
    const t = tagLabel.trim()
    if (!t) return
    if (activeFeedTag.toLowerCase() === t.toLowerCase()) {
      const next = new URLSearchParams(searchParams)
      next.delete('feedTag')
      const qs = next.toString()
      navigate(qs ? `/?${qs}` : '/', { replace: true })
      return
    }
    const next = new URLSearchParams()
    next.set('feedTag', t)
    navigate(`/?${next}`, { replace: true })
  }

  return (
    <aside className="sticky top-0 z-50 flex h-screen w-64 shrink-0 flex-col gap-2 border-r border-outline-variant/15 bg-surface-container-low p-4">
      <div className="mb-4 flex items-center gap-3 px-4 py-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <img
              src={LOGO_IMG}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter text-primary normal-case">
              YouTube Studio
            </h1>
          </div>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined">video_library</span>
          首页
        </NavLink>
        <NavLink
          to="/downloads"
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined">download_for_offline</span>
          下载
        </NavLink>
        <NavLink
          to="/subscriptions"
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined">subscriptions</span>
          频道
        </NavLink>
        <NavLink
          to="/tags"
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined">sell</span>
          标签
        </NavLink>

        <div className="mt-8 px-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-outline">
            按标签筛选
          </p>
          <div className="flex flex-wrap gap-2">
            {filterTags.map((t) => {
              const accent = resolveTagAccentId(t, tagAccentByLabel)
              const cls = tagAccentSidebarClass(accent)
              const selected =
                activeFeedTag.toLowerCase() === t.trim().toLowerCase()
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSidebarTagClick(t)}
                  className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-medium transition-all ${cls} ${
                    selected ? tagFeedFilterSelectedOverlayClass : ''
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="flex flex-col gap-1 border-t border-outline-variant/15 pt-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `${navClass} ${isActive ? active : inactive}`
          }
        >
          <span className="material-symbols-outlined">settings</span>
          设置
        </NavLink>
      </div>
    </aside>
  )
}
