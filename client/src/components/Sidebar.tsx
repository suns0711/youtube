import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import {
  resolveTagAccentId,
  tagAccentPillClass,
  tagFeedFilterSelectedOverlayClass,
} from '../lib/tagAccentStyles'

const LOGO_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAwYZxBfOZ648BeeAqyoHj59XSX41LzHTr7BhtwV8xxatrGo7WKVULPe-ZXUcFsqXIH2RzP12suuTv5ZL-QYpDErK8jxIMtikSv1m2PqABj5CcmYE6AtSefWNAWcbWmyHPahcWdz7HhONgpaTHUXM1CiHxQqBxtWMSV4pn2D8PnzPGMHvzj34dgmz4oSJIsKpSeCc9DQMobcQ-PO8EcLNk97At0hFK__bsfCKyDs7Bixzm_K1BJbisd_YttKxH2PC3yBeJrGluXTOCe'

const SIDEBAR_COLLAPSED_KEY = 'studio-sidebar-collapsed'

const navClassBase =
  'flex items-center rounded-lg font-[\'Inter\'] text-sm font-medium transition-all'
const navClassExpanded = `${navClassBase} gap-3 px-4 py-3`
const navClassCollapsed = `${navClassBase} justify-center gap-0 px-2 py-3`
const inactive =
  'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
const active =
  'scale-[1.02] bg-surface-container-high font-semibold text-primary shadow-[0_0_20px_rgba(255,255,255,0.08)] ring-1 ring-inset ring-white/25'

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const showFeedTagFilters = pathname === '/'
  const { tags: filterTags, tagAccentByLabel } = useAvailableTags()
  const activeFeedTag = (searchParams.get('feedTag') || '').trim()
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed())

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c)
  }, [])

  const navClass = collapsed ? navClassCollapsed : navClassExpanded

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
    <aside
      className={`sticky top-0 z-50 flex h-screen shrink-0 flex-col gap-2 border-r border-outline-variant/15 bg-surface-container-low transition-[width,padding] duration-200 ease-out ${
        collapsed ? 'w-[4.5rem] px-2 py-3' : 'w-64 p-4'
      }`}
    >
      <div
        className={`mb-2 flex shrink-0 py-4 ${collapsed ? 'flex-col items-center gap-3' : 'items-center justify-between gap-2 px-4'}`}
      >
        {collapsed ? (
          <>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-expanded={false}
              aria-label="展开侧栏"
            >
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary"
              title="首页"
            >
              <img
                src={LOGO_IMG}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
                <img
                  src={LOGO_IMG}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-black tracking-tighter text-primary normal-case">
                  YouTube Studio
                </h1>
              </div>
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-expanded
              aria-label="收起侧栏"
            >
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
          </>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <NavLink
          to="/"
          end
          title={collapsed ? '首页' : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">video_library</span>
          {!collapsed ? '首页' : null}
        </NavLink>
        <NavLink
          to="/downloads"
          title={collapsed ? '下载' : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">
            download_for_offline
          </span>
          {!collapsed ? '下载' : null}
        </NavLink>
        <NavLink
          to="/subscriptions"
          title={collapsed ? '频道' : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">subscriptions</span>
          {!collapsed ? '频道' : null}
        </NavLink>
        <NavLink
          to="/tags"
          title={collapsed ? '标签' : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">sell</span>
          {!collapsed ? '标签' : null}
        </NavLink>

        {!collapsed && showFeedTagFilters ? (
          <div className="mt-8 px-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-outline">
              按标签筛选
            </p>
            <div className="flex flex-wrap gap-2">
              {filterTags.map((t) => {
                const accent = resolveTagAccentId(t, tagAccentByLabel)
                const cls = tagAccentPillClass(accent, false)
                const selected =
                  activeFeedTag.toLowerCase() === t.trim().toLowerCase()
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSidebarTagClick(t)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${cls} ${
                      selected ? tagFeedFilterSelectedOverlayClass : ''
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </nav>

      <div
        className={`flex shrink-0 flex-col gap-1 border-t border-outline-variant/15 ${collapsed ? 'pt-2' : 'pt-4'}`}
      >
        <NavLink
          to="/settings"
          title={collapsed ? '设置' : undefined}
          className={({ isActive }) =>
            `${navClass} ${isActive ? active : inactive}`
          }
        >
          <span className="material-symbols-outlined shrink-0">settings</span>
          {!collapsed ? '设置' : null}
        </NavLink>
      </div>
    </aside>
  )
}
