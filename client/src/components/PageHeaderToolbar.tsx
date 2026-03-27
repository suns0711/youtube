import { Link } from 'react-router-dom'
import { useDownloadQueueBadge } from '../DownloadQueueBadgeContext'
import {
  DOWNLOAD_QUEUE_BADGE_DOT_CLASS,
  downloadsPageQueueHref,
} from '../lib/downloadsNavigation'
import { HeaderStudioUser } from './HeaderStudioUser'

const toolbarIconClass =
  'inline-flex rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95'

export function PageHeaderToolbar() {
  const { showDownloadCompleteBadge, acknowledgeDownloadBadge } =
    useDownloadQueueBadge()
  return (
    <div className="ml-8 flex items-center gap-4">
      <Link
        to={downloadsPageQueueHref()}
        className={`relative ${toolbarIconClass}`}
        title="下载"
        onClick={() => acknowledgeDownloadBadge()}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">
          download
        </span>
        {showDownloadCompleteBadge ? (
          <span
            className={`absolute right-1.5 top-1.5 ${DOWNLOAD_QUEUE_BADGE_DOT_CLASS}`}
            aria-hidden
          />
        ) : null}
      </Link>
      <Link
        to="/settings"
        className={toolbarIconClass}
        title="系统设置"
      >
        <span className="material-symbols-outlined text-[22px] leading-none">
          settings
        </span>
      </Link>
      <HeaderStudioUser className="ml-2" />
    </div>
  )
}
