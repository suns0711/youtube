import { useEffect, useId, useRef, useState } from 'react'

type StudioSelectProps = {
  value: string
  options: string[]
  onChange: (next: string) => void
  'aria-label'?: string
  disabled?: boolean
}

export function StudioSelect({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}: StudioSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md py-1.5 pl-0 pr-1 text-left text-xs font-medium text-on-surface transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{value}</span>
        <span
          className={`material-symbols-outlined shrink-0 text-[20px] leading-none text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-48 overflow-y-auto rounded-lg border border-outline-variant/20 bg-surface-container-low py-1 shadow-2xl custom-scrollbar"
        >
          {options.map((opt) => {
            const selected = opt === value
            return (
              <li key={opt} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(opt)}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-surface-container-high ${
                    selected
                      ? 'bg-primary/24 font-semibold text-primary ring-1 ring-inset ring-primary/40'
                      : 'text-on-surface'
                  }`}
                >
                  {opt}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
