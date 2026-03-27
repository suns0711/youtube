import { Link, useLocation } from 'react-router-dom'
import { HeaderStudioUser } from './HeaderStudioUser'

const iconBtnClass =
  'rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95'

type PageHeaderToolbarProps = {
  userSwitcherSize?: 'sm' | 'md'
}

export function PageHeaderToolbar({
  userSwitcherSize = 'md',
}: PageHeaderToolbarProps) {
  const { pathname } = useLocation()
  const onDownloads = pathname === '/downloads'
  const onSettings = pathname === '/settings'

  return (
    <div className="ml-8 flex items-center gap-4">
      <Link
        to="/downloads"
        className={iconBtnClass}
        aria-current={onDownloads ? 'page' : undefined}
        title="下载"
      >
        <span className="material-symbols-outlined">download</span>
      </Link>
      <Link
        to="/settings"
        className={iconBtnClass}
        aria-current={onSettings ? 'page' : undefined}
        title="系统设置"
      >
        <span className="material-symbols-outlined">settings</span>
      </Link>
      <HeaderStudioUser size={userSwitcherSize} className="ml-2" />
    </div>
  )
}
