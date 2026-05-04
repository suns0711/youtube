import { Link, Outlet } from 'react-router-dom'
import { AvailableTagsProvider, useAvailableTags } from '../AvailableTagsContext'
import { useI18n } from '../i18n'
import { Sidebar } from './Sidebar'

function DownloadDirWarningBanner() {
  const { t } = useI18n()
  const { downloadDirWarning } = useAvailableTags()
  if (!downloadDirWarning) return null
  return (
    <div
      className="border-b border-primary/35 bg-primary/12 px-6 py-3 text-sm text-on-surface md:px-10"
      role="status"
    >
      <span className="font-semibold text-primary">{t('layout.downloadDir')}</span>
      <span className="mx-2 text-on-surface-variant">·</span>
      <span>{downloadDirWarning}</span>
      <Link
        to="/settings"
        className="ml-3 font-bold text-primary underline-offset-2 hover:underline"
      >
        {t('layout.goToSettings')}
      </Link>
    </div>
  )
}

function LayoutShell() {
  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      <Sidebar />
      <main className="custom-scrollbar min-h-screen flex-1 overflow-y-auto">
        <DownloadDirWarningBanner />
        <Outlet />
      </main>
    </div>
  )
}

export function Layout() {
  return (
    <AvailableTagsProvider>
      <LayoutShell />
    </AvailableTagsProvider>
  )
}
