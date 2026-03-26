import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import {
  getHealth,
  getStudioSettings,
  pickFolderPathWithDialog,
  saveStudioSettings,
  type Health,
  type StudioSettings,
  type TagMapping,
} from '../api'
import { StudioSelect } from '../components/StudioSelect'
import { FALLBACK_STUDIO_TAGS } from '../lib/studioTags'

function cloneSettings(s: StudioSettings): StudioSettings {
  return {
    downloadDir: s.downloadDir,
    tagMappings: s.tagMappings.map((m) => ({ ...m })),
    ...(s.availableTags != null
      ? { availableTags: [...s.availableTags] }
      : {}),
  }
}

function countPending(saved: StudioSettings, draft: StudioSettings): number {
  let n = 0
  if (saved.downloadDir !== draft.downloadDir) n += 1
  const byId = new Map(saved.tagMappings.map((m) => [m.id, m]))
  for (const d of draft.tagMappings) {
    const s = byId.get(d.id)
    if (!s) n += 1
    else if (s.tag !== d.tag || s.path !== d.path || s.dot !== d.dot) n += 1
  }
  for (const s of saved.tagMappings) {
    if (!draft.tagMappings.some((d) => d.id === s.id)) n += 1
  }
  return n
}

export function SettingsPage() {
  const { refresh: refreshGlobalTags } = useAvailableTags()
  const [saved, setSaved] = useState<StudioSettings | null>(null)
  const [draft, setDraft] = useState<StudioSettings | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [applyErr, setApplyErr] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [pickingMappingId, setPickingMappingId] = useState<string | null>(null)
  const [mappingPickErr, setMappingPickErr] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoadErr(null)
    Promise.all([getStudioSettings(), getHealth()])
      .then(([st, h]) => {
        setSaved(cloneSettings(st))
        setDraft(cloneSettings(st))
        setHealth(h)
      })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const dirty = useMemo(() => {
    if (!saved || !draft) return false
    return (
      saved.downloadDir !== draft.downloadDir
      || JSON.stringify(saved.tagMappings) !== JSON.stringify(draft.tagMappings)
    )
  }, [saved, draft])

  const pendingCount = useMemo(() => {
    if (!saved || !draft || !dirty) return 0
    return countPending(saved, draft)
  }, [saved, draft, dirty])

  const tagPool = useMemo(() => {
    if (!draft) return [...FALLBACK_STUDIO_TAGS]
    return draft.availableTags?.length
      ? draft.availableTags
      : [...FALLBACK_STUDIO_TAGS]
  }, [draft])

  const optionsForTag = useCallback(
    (rowTag: string) => {
      const set = new Set(tagPool)
      const t = String(rowTag || '').trim()
      if (t) set.add(t)
      return [...set].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      )
    },
    [tagPool],
  )

  const discard = () => {
    if (saved) setDraft(cloneSettings(saved))
    setApplyErr(null)
  }

  const apply = async () => {
    if (!draft) return
    setApplying(true)
    setApplyErr(null)
    try {
      const next = await saveStudioSettings(draft)
      setSaved(cloneSettings(next))
      setDraft(cloneSettings(next))
      refreshGlobalTags()
      const h = await getHealth()
      setHealth(h)
    } catch (e) {
      setApplyErr((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const changePath = () => {
    if (!draft) return
    const next = window.prompt(
      '默认下载目录（绝对路径）',
      draft.downloadDir,
    )
    if (next == null) return
    setDraft({ ...draft, downloadDir: next.trim() })
  }

  const updateMapping = (id: string, patch: Partial<TagMapping>) => {
    setDraft((d) => {
      if (!d) return d
      return {
        ...d,
        tagMappings: d.tagMappings.map((m) =>
          m.id === id ? { ...m, ...patch } : m,
        ),
      }
    })
  }

  const removeMapping = (id: string) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            tagMappings: d.tagMappings.filter((m) => m.id !== id),
          }
        : d,
    )
  }

  const pickPathForMapping = (id: string) => {
    void (async () => {
      setPickingMappingId(id)
      setMappingPickErr(null)
      try {
        const r = await pickFolderPathWithDialog()
        if (r.ok) {
          updateMapping(id, { path: r.path })
        }
      } catch (e) {
        setMappingPickErr((e as Error).message || '无法选择目录')
      } finally {
        setPickingMappingId(null)
      }
    })()
  }

  const addMapping = () => {
    setDraft((d) => {
      if (!d) return d
      const pool =
        d.availableTags?.length && d.availableTags.length > 0
          ? d.availableTags
          : [...FALLBACK_STUDIO_TAGS]
      const defaultTag = pool[0] ?? 'Tech'
      const dot: TagMapping['dot'] =
        d.tagMappings.length % 2 === 0 ? 'tertiary' : 'primary'
      const row: TagMapping = {
        id: crypto.randomUUID(),
        tag: defaultTag,
        path: '../assets/',
        dot,
      }
      return { ...d, tagMappings: [...d.tagMappings, row] }
    })
  }

  if (!draft || !saved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-on-surface-variant">
        {loadErr ? (
          <p className="text-error">{loadErr}</p>
        ) : (
          <p>正在加载设置…</p>
        )}
      </div>
    )
  }

  return (
    <div className="custom-scrollbar flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-surface px-6 py-4 md:px-10">
        <h2 className="font-['Inter'] text-xl font-bold tracking-tighter text-primary">
          设置
        </h2>
        <div className="flex items-center gap-4">
          <Link
            to="/downloads"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined">download</span>
          </Link>
          <div className="h-8 w-8 overflow-hidden rounded-full border border-outline-variant/20 bg-surface-container-high" />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 pb-40 md:px-10">
        {loadErr ? (
          <p className="mb-6 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {loadErr}
          </p>
        ) : null}

        <div className="mb-12">
          <h3 className="mb-2 text-4xl font-extrabold tracking-tight text-on-surface">
            系统设置
          </h3>
          <p className="max-w-2xl text-on-surface-variant">
            配置本地下载目录与「标签 → 文件夹」映射；下载页会按频道标签解析保存位置。更改后需点击底部「保存更改」才会写入服务端。
          </p>
          {health && !health.ok ? (
            <p className="mt-3 text-sm text-error">
              无法使用 yt-dlp：{health.error}
            </p>
          ) : null}
        </div>

        <section className="space-y-16">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">
                folder_managed
              </span>
              <h4 className="text-lg font-bold tracking-tight text-on-surface">
                存储与目录
              </h4>
            </div>

            <div className="space-y-8 rounded-xl bg-surface-container-low p-6 md:p-8">
              <div>
                <label className="mb-3 block text-sm font-semibold text-on-surface-variant">
                  默认下载目录
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <input
                    readOnly
                    value={draft.downloadDir}
                    className="min-h-[48px] flex-1 rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-mono text-xs text-on-surface"
                  />
                  <button
                    type="button"
                    onClick={changePath}
                    className="shrink-0 rounded-lg bg-surface-container-high px-6 py-3 text-sm font-bold text-primary transition-colors hover:bg-surface-bright"
                  >
                    修改路径
                  </button>
                </div>
                <p className="mt-2 text-[11px] uppercase tracking-wider text-on-surface-variant/60">
                  未命中标签映射时，下载任务默认保存到此目录。
                </p>
              </div>

              <div>
                <label className="mb-4 block text-sm font-semibold text-primary">
                  标签与文件夹映射
                </label>
                {mappingPickErr ? (
                  <p className="mb-3 text-sm text-error">{mappingPickErr}</p>
                ) : null}
                <div className="space-y-3">
                  {draft.tagMappings.map((m) => (
                    <div
                      key={m.id}
                      className="grid grid-cols-1 items-center gap-3 sm:grid-cols-12"
                    >
                      <div className="flex min-h-[46px] items-center gap-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-4 py-2 sm:col-span-3">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            m.dot === 'primary' ? 'bg-primary' : 'bg-tertiary'
                          }`}
                        />
                        <StudioSelect
                          value={m.tag}
                          options={optionsForTag(m.tag)}
                          onChange={(tag) => updateMapping(m.id, { tag })}
                          aria-label="标签"
                        />
                      </div>
                      <div className="flex min-h-[46px] gap-2 sm:col-span-8">
                        <input
                          value={m.path}
                          onChange={(e) =>
                            updateMapping(m.id, { path: e.target.value })
                          }
                          className="min-w-0 flex-1 rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-4 py-2.5 font-mono text-xs text-on-surface-variant"
                        />
                        <button
                          type="button"
                          title="在后端电脑上选择文件夹并填入路径"
                          disabled={pickingMappingId !== null}
                          onClick={() => pickPathForMapping(m.id)}
                          className="flex shrink-0 items-center justify-center self-stretch rounded-lg bg-surface-container-high px-3 text-primary transition-colors hover:bg-surface-container-highest disabled:pointer-events-none disabled:opacity-50"
                          aria-label="选择文件夹路径"
                        >
                          <span className="material-symbols-outlined text-xl">
                            folder_open
                          </span>
                        </button>
                      </div>
                      <div className="flex justify-end sm:col-span-1 sm:justify-center">
                        <button
                          type="button"
                          onClick={() => removeMapping(m.id)}
                          className="text-outline-variant transition-colors hover:text-error"
                          aria-label="删除映射"
                        >
                          <span className="material-symbols-outlined text-lg">
                            delete
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addMapping}
                    className="mt-2 flex items-center gap-2 rounded px-2 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/5"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    新增映射
                  </button>
                </div>
              </div>

              {health?.ok ? (
                <p className="border-t border-outline-variant/10 pt-6 font-mono text-[11px] text-on-surface-variant/70">
                  引擎：yt-dlp {health.ytDlp} · 可执行文件 {health.binary}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {dirty ? (
        <div className="fixed bottom-10 left-1/2 z-20 flex -translate-x-1/2 transform items-center gap-6 rounded-2xl border border-outline-variant/20 px-6 py-4 shadow-2xl glass-panel md:gap-8 md:px-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
              待保存
            </span>
            <span className="text-xs font-medium text-on-surface">
              尚有 {pendingCount} 项未保存
            </span>
          </div>
          <div className="hidden h-8 w-px bg-outline-variant/20 sm:block" />
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              type="button"
              onClick={discard}
              className="rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container-highest sm:px-6"
            >
              放弃
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => void apply()}
              className="rounded-lg bg-gradient-to-r from-primary-container to-[#FF5540] px-6 py-2.5 text-sm font-bold text-on-primary-container shadow-[0_0_30px_rgba(255,85,64,0.3)] transition-all active:scale-95 disabled:opacity-50 sm:px-8"
            >
              {applying ? '保存中…' : '保存更改'}
            </button>
          </div>
        </div>
      ) : null}

      {applyErr ? (
        <div className="fixed bottom-28 left-1/2 z-20 max-w-md -translate-x-1/2 rounded-lg border border-error/40 bg-surface px-4 py-2 text-center text-sm text-error">
          {applyErr}
        </div>
      ) : null}
    </div>
  )
}
