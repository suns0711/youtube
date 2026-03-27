import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getStudioUser, listJobs } from './api'

const STORAGE_KEY_PREFIX = 'studio-download-complete-ack'

function ackStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

function loadAckSet(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(ackStorageKey(userId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.map((x) => String(x)))
  } catch {
    return new Set()
  }
}

function saveAckSet(userId: string, set: Set<string>): void {
  const max = 500
  const arr = [...set]
  const trimmed = arr.slice(-max)
  localStorage.setItem(ackStorageKey(userId), JSON.stringify(trimmed))
}

type DownloadQueueBadgeContextValue = {
  /** 有未「已读」的完成任务时显示红色角标 */
  showDownloadCompleteBadge: boolean
  /** 将当前队列中所有已完成任务标为已读（点击下载入口时调用，角标消失） */
  acknowledgeDownloadBadge: () => void
}

const DownloadQueueBadgeContext = createContext<DownloadQueueBadgeContextValue>(
  {
    showDownloadCompleteBadge: false,
    acknowledgeDownloadBadge: () => {},
  },
)

export function DownloadQueueBadgeProvider({ children }: { children: ReactNode }) {
  const [completeJobIds, setCompleteJobIds] = useState<string[]>([])
  const completeJobIdsRef = useRef<string[]>([])
  const [ackEpoch, setAckEpoch] = useState(0)

  useEffect(() => {
    const refresh = () => {
      void listJobs()
        .then((r) => {
          const ids = r.jobs
            .filter((j) => j.status === 'complete')
            .map((j) => j.id)
          completeJobIdsRef.current = ids
          setCompleteJobIds(ids)
        })
        .catch(() => {})
    }
    refresh()
    const t = window.setInterval(refresh, 3500)
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const ackSet = useMemo(() => {
    void ackEpoch
    return loadAckSet(getStudioUser())
  }, [ackEpoch])

  const showDownloadCompleteBadge = useMemo(
    () => completeJobIds.some((id) => !ackSet.has(id)),
    [completeJobIds, ackSet],
  )

  const acknowledgeDownloadBadge = useCallback(() => {
    void listJobs()
      .then((r) => {
        const ids = r.jobs
          .filter((j) => j.status === 'complete')
          .map((j) => j.id)
        const user = getStudioUser()
        const next = loadAckSet(user)
        for (const id of ids) {
          next.add(id)
        }
        saveAckSet(user, next)
        completeJobIdsRef.current = ids
        setCompleteJobIds(ids)
        setAckEpoch((e) => e + 1)
      })
      .catch(() => {})
  }, [])

  const value = useMemo(
    () => ({
      showDownloadCompleteBadge,
      acknowledgeDownloadBadge,
    }),
    [showDownloadCompleteBadge, acknowledgeDownloadBadge],
  )

  return (
    <DownloadQueueBadgeContext.Provider value={value}>
      {children}
    </DownloadQueueBadgeContext.Provider>
  )
}

export function useDownloadQueueBadge(): DownloadQueueBadgeContextValue {
  return useContext(DownloadQueueBadgeContext)
}
