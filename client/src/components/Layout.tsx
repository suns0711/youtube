import { Outlet } from 'react-router-dom'
import { AvailableTagsProvider } from '../AvailableTagsContext'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <AvailableTagsProvider>
    <div className="flex min-h-screen bg-surface text-on-surface">
      <Sidebar />
      <main className="custom-scrollbar min-h-screen flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
    </AvailableTagsProvider>
  )
}
