import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getStudioSettings } from './api'
import { FALLBACK_STUDIO_TAGS } from './lib/studioTags'

type AvailableTagsContextValue = {
  tags: string[]
  tagAccentByLabel: Record<string, string>
  loading: boolean
  error: string | null
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
      })
      .catch((e: Error) => {
        setError(e.message)
        setTags([...FALLBACK_STUDIO_TAGS])
        setTagAccentByLabel({})
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    void fetchTags().finally(() => setLoading(false))
  }, [fetchTags])

  const refresh = useCallback(() => {
    void fetchTags()
  }, [fetchTags])

  const value = useMemo(
    () => ({ tags, tagAccentByLabel, loading, error, refresh }),
    [tags, tagAccentByLabel, loading, error, refresh],
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
