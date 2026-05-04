import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import { useDownloadQueueBadge } from '../DownloadQueueBadgeContext'
import { useI18n } from '../i18n'
import {
  DOWNLOAD_QUEUE_BADGE_DOT_CLASS,
  downloadsPageQueueHref,
} from '../lib/downloadsNavigation'
import {
  resolveTagAccentId,
  tagAccentPillClass,
  tagFeedFilterSelectedOverlayClass,
} from '../lib/tagAccentStyles'

/** Vite：`public/icon.png` → 根路径 `/icon.png` */
const LOGO_IMG = '/icon.png'

const SIDEBAR_COLLAPSED_KEY = 'studio-sidebar-collapsed'

const navClassBase =
  'flex items-center rounded-lg font-[\'Inter\'] text-sm font-medium transition-all'
const navClassExpanded = `${navClassBase} gap-3 px-4 py-3`
const navClassCollapsed = `${navClassBase} justify-center gap-0 px-2 py-3`
const inactive =
  'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
const active =
  'bg-surface-container-high font-semibold text-primary shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/25'

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const showFeedTagFilters = pathname === '/'
  const { tags: filterTags, tagAccentByLabel } = useAvailableTags()
  const activeFeedTag = (searchParams.get('feedTag') || '').trim()
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed())
  const { showDownloadCompleteBadge, acknowledgeDownloadBadge } =
    useDownloadQueueBadge()

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
        className={`mb-2 flex shrink-0 py-4 ${collapsed ? 'flex-col items-center gap-3' : 'items-center justify-between gap-2 pl-4'}`}
      >
        {collapsed ? (
          <>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-expanded={false}
              aria-label={t('a11y.expandSidebar')}
            >
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary"
              title={t('nav.home')}
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
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
                <img
                  src={LOGO_IMG}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="inline-flex items-baseline gap-1 whitespace-nowrap bg-gradient-to-r from-rose-500 via-amber-400 to-cyan-400 bg-clip-text font-black leading-none text-transparent normal-case">
                  <span className="text-base tracking-tight">YouTube</span>
                  <span className="text-xs font-black tracking-tight">Studio</span>
                </h1>
              </div>
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-expanded
              aria-label={t('a11y.collapseSidebar')}
            >
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
          </>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-0.5">
        <NavLink
          to="/"
          end
          title={collapsed ? t('nav.home') : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">video_library</span>
          {!collapsed ? t('nav.home') : null}
        </NavLink>
        <NavLink
          to={downloadsPageQueueHref()}
          title={collapsed ? t('nav.downloads') : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
          onClick={() => acknowledgeDownloadBadge()}
        >
          <span className="relative inline-flex shrink-0">
            <span className="material-symbols-outlined shrink-0">
              download_for_offline
            </span>
            {showDownloadCompleteBadge ? (
              <span
                className={`absolute -right-0.5 -top-0.5 ${DOWNLOAD_QUEUE_BADGE_DOT_CLASS}`}
                aria-hidden
              />
            ) : null}
          </span>
          {!collapsed ? t('nav.downloads') : null}
        </NavLink>
        <NavLink
          to="/subscriptions"
          title={collapsed ? t('nav.channels') : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">subscriptions</span>
          {!collapsed ? t('nav.channels') : null}
        </NavLink>
        <NavLink
          to="/tags"
          title={collapsed ? t('nav.tags') : undefined}
          className={({ isActive }) => `${navClass} ${isActive ? active : inactive}`}
        >
          <span className="material-symbols-outlined shrink-0">sell</span>
          {!collapsed ? t('nav.tags') : null}
        </NavLink>

        {!collapsed && showFeedTagFilters ? (
          <div className="mt-8 px-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-outline">
              {t('nav.filterByTag')}
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
          title={collapsed ? t('nav.settings') : undefined}
          className={({ isActive }) =>
            `${navClass} ${isActive ? active : inactive}`
          }
        >
          <span className="material-symbols-outlined shrink-0">settings</span>
          {!collapsed ? t('nav.settings') : null}
        </NavLink>
      </div>
    </aside>
  )
}
