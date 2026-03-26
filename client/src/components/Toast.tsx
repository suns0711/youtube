import { useEffect } from 'react'

type ToastProps = {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, onDismiss, durationMs = 2800 }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [message, onDismiss, durationMs])

  if (!message) return null

  return (
    <div
      className="fixed bottom-8 left-1/2 z-[110] max-w-md -translate-x-1/2 px-4"
      role="status"
    >
      <div className="glass-panel rounded-xl border border-outline-variant/25 px-5 py-3 text-center text-sm font-medium text-on-surface shadow-2xl">
        {message}
      </div>
    </div>
  )
}
