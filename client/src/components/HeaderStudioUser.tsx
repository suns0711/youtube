import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  FALLBACK_STUDIO_USER_IDS,
  getHealth,
  getStudioUser,
  setStudioUser,
  STUDIO_USERS_CHANGED_EVENT,
} from '../api'
import { useI18n } from '../i18n'
import { studioUserAvatarUrl } from '../lib/studioUserAvatar'

const sizeClass = {
  sm: 'h-8 w-8 border-outline-variant/20',
  md: 'h-10 w-10 border-outline-variant/30 p-0.5',
} as const

type Size = keyof typeof sizeClass

type Props = {
  size?: Size
  className?: string
}

/** 顶栏右侧：头像 + 用户 id，点击展开切换账号 */
export function HeaderStudioUser({ size = 'md', className = '' }: Props) {
  const { t } = useI18n()
  const studioUser = getStudioUser()
  const [open, setOpen] = useState(false)
  const [userOptions, setUserOptions] = useState<string[]>(() => [
    ...FALLBACK_STUDIO_USER_IDS,
  ])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const apply = (list: string[]) => {
      if (list.length > 0) setUserOptions([...list])
    }
    void getHealth().then((h) => {
      if (h.allowedUsers?.length) apply(h.allowedUsers)
    })
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ users: string[] }>).detail?.users
      if (Array.isArray(d)) apply(d)
    }
    window.addEventListener(STUDIO_USERS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(STUDIO_USERS_CHANGED_EVENT, onChanged)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const switchUser = useCallback((id: string) => {
    const next = id.trim().toLowerCase()
    if (next === getStudioUser()) {
      setOpen(false)
      return
    }
    setStudioUser(next)
    setOpen(false)
    window.location.reload()
  }, [])

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="-mr-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-left transition-colors hover:bg-surface-container-low/80"
        aria-expanded={open}
        aria-haspopup="true"
        title={t('header.switchAccountCurrent', { id: studioUser })}
      >
        <div
          className={`${sizeClass[size]} shrink-0 overflow-hidden rounded-full border`}
        >
          <img
            src={studioUserAvatarUrl(studioUser)}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        </div>
        <span
          className={`max-w-[5rem] truncate font-mono font-semibold tracking-tight text-on-surface ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
        >
          {studioUser}
        </span>
        <span
          className={`material-symbols-outlined shrink-0 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ fontSize: size === 'sm' ? 16 : 18 }}
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-[200] mt-1 w-[11.5rem] rounded-xl border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-outline">
            {t('header.switchAccount')}
          </p>
          {userOptions.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => switchUser(id)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-container-high ${
                id === studioUser
                  ? 'bg-primary/22 font-semibold text-primary ring-1 ring-inset ring-primary/45'
                  : 'text-on-surface'
              }`}
            >
              <img
                src={studioUserAvatarUrl(id)}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-outline-variant/15 object-cover"
              />
              <span className="font-mono">{id}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
