import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getStudioSettings, syncStudioUserWithServer } from './api'
import { FALLBACK_STUDIO_TAGS } from './lib/studioTags'

type AvailableTagsContextValue = {
  tags: string[]
  tagAccentByLabel: Record<string, string>
  loading: boolean
  error: string | null
  /** 下载目录需用户处理时由服务端带回 */
  downloadDirWarning: string | null
  refresh: () => void
}

const AvailableTagsContext = createContext<AvailableTagsContextValue | null>(
  null,
)

export function AvailableTagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<string[]>(FALLBACK_STUDIO_TAGS)
  const [tagAccentByLabel, setTagAccentByLabel] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadDirWarning, setDownloadDirWarning] = useState<string | null>(
    null,
  )

  const fetchTags = useCallback(() => {
    setError(null)
    return getStudioSettings()
      .then((st) => {
        setTags(
          st.availableTags?.length
            ? st.availableTags
            : [...FALLBACK_STUDIO_TAGS],
        )
        setTagAccentByLabel(
          st.tagAccentByLabel && typeof st.tagAccentByLabel === 'object'
            ? { ...st.tagAccentByLabel }
            : {},
        )
        const w = st.downloadDirWarning
        setDownloadDirWarning(
          typeof w === 'string' && w.trim() ? w.trim() : null,
        )
      })
      .catch((e: Error) => {
        setError(e.message)
        setTags([...FALLBACK_STUDIO_TAGS])
        setTagAccentByLabel({})
        setDownloadDirWarning(null)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      await syncStudioUserWithServer().catch(() => {})
      if (cancelled) return
      await fetchTags().finally(() => {
        if (!cancelled) setLoading(false)
      })
    })()
    return () => {
      cancelled = true
    }
  }, [fetchTags])

  const refresh = useCallback(() => {
    void fetchTags()
  }, [fetchTags])

  const value = useMemo(
    () => ({
      tags,
      tagAccentByLabel,
      loading,
      error,
      downloadDirWarning,
      refresh,
    }),
    [tags, tagAccentByLabel, loading, error, downloadDirWarning, refresh],
  )

  return (
    <AvailableTagsContext.Provider value={value}>
      {children}
    </AvailableTagsContext.Provider>
  )
}

export function useAvailableTags(): AvailableTagsContextValue {
  const ctx = useContext(AvailableTagsContext)
  if (!ctx) {
    throw new Error('useAvailableTags must be used within AvailableTagsProvider')
  }
  return ctx
}
