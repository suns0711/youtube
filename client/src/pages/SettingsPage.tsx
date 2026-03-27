import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAvailableTags } from '../AvailableTagsContext'
import {
  addStudioUser,
  emitStudioUsersChanged,
  FALLBACK_STUDIO_USER_IDS,
  getHealth,
  getStudioSettings,
  getStudioUser,
  listStudioUsers,
  pickFolderPathWithDialog,
  removeStudioUser,
  saveStudioSettings,
  setStudioUser,
  type Health,
  type StudioSettings,
  type TagMapping,
} from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HeaderStudioUser } from '../components/HeaderStudioUser'
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
  const [pickingDownloadDir, setPickingDownloadDir] = useState(false)
  const [downloadDirPickErr, setDownloadDirPickErr] = useState<string | null>(
    null,
  )
  const [studioUserIds, setStudioUserIds] = useState<string[]>(() => [
    ...FALLBACK_STUDIO_USER_IDS,
  ])
  const [pendingNewUsers, setPendingNewUsers] = useState<
    { id: string; value: string }[]
  >([])
  const [userManageErr, setUserManageErr] = useState<string | null>(null)
  const [committingDraftId, setCommittingDraftId] = useState<string | null>(
    null,
  )
  const [removeUserTarget, setRemoveUserTarget] = useState<string | null>(
    null,
  )
  const [removeUserLoading, setRemoveUserLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoadErr(null)
    Promise.all([
      getStudioSettings(),
      getHealth(),
      listStudioUsers().catch(() => ({ users: [] as string[] })),
    ])
      .then(([st, h, su]) => {
        setSaved(cloneSettings(st))
        setDraft(cloneSettings(st))
        setHealth(h)
        const ids =
          su.users.length > 0
            ? su.users
            : h.allowedUsers?.length
              ? h.allowedUsers
              : [...FALLBACK_STUDIO_USER_IDS]
        setStudioUserIds([...ids])
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
    void (async () => {
      if (!draft) return
      setPickingDownloadDir(true)
      setDownloadDirPickErr(null)
      try {
        const r = await pickFolderPathWithDialog({
          title: '选择默认下载目录（YouTube Studio）',
        })
        if (r.ok) {
          setDraft((d) => (d ? { ...d, downloadDir: r.path } : d))
        }
      } catch (e) {
        setDownloadDirPickErr((e as Error).message || '无法选择目录')
      } finally {
        setPickingDownloadDir(false)
      }
    })()
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

  const addUserDraftRow = () => {
    setUserManageErr(null)
    setPendingNewUsers((p) => [...p, { id: crypto.randomUUID(), value: '' }])
  }

  const updateUserDraft = (draftId: string, value: string) => {
    setPendingNewUsers((p) =>
      p.map((row) => (row.id === draftId ? { ...row, value } : row)),
    )
  }

  const removeUserDraft = (draftId: string) => {
    setPendingNewUsers((p) => p.filter((row) => row.id !== draftId))
  }

  const commitUserDraft = (draftId: string) => {
    void (async () => {
      const row = pendingNewUsers.find((r) => r.id === draftId)
      if (!row) return
      const id = row.value.trim().toLowerCase()
      if (!id) {
        setUserManageErr('请填写用户 id')
        return
      }
      if (!/^[a-z0-9_-]{1,32}$/i.test(id)) {
        setUserManageErr(
          '用户 id 须为 1–32 位字母、数字、下划线（_）或连字符（-）',
        )
        return
      }
      if (studioUserIds.some((u) => u.toLowerCase() === id)) {
        setUserManageErr('该用户已存在')
        return
      }
      setCommittingDraftId(draftId)
      setUserManageErr(null)
      try {
        const { users } = await addStudioUser(id)
        setStudioUserIds([...users])
        setPendingNewUsers((p) => p.filter((r) => r.id !== draftId))
        emitStudioUsersChanged([...users])
      } catch (e) {
        setUserManageErr((e as Error).message)
      } finally {
        setCommittingDraftId(null)
      }
    })()
  }

  const confirmRemoveUser = () => {
    void (async () => {
      if (!removeUserTarget) return
      setRemoveUserLoading(true)
      setUserManageErr(null)
      try {
        const { users } = await removeStudioUser(removeUserTarget)
        setStudioUserIds([...users])
        emitStudioUsersChanged([...users])
        if (removeUserTarget === getStudioUser()) {
          setStudioUser(users[0] || FALLBACK_STUDIO_USER_IDS[0])
          setRemoveUserTarget(null)
          window.location.reload()
          return
        }
        setRemoveUserTarget(null)
      } catch (e) {
        setUserManageErr((e as Error).message)
      } finally {
        setRemoveUserLoading(false)
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
      const defaultTag = pool[0] ?? ''
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
      <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-surface px-6 py-6 md:px-10">
        <div className="flex flex-1 items-center gap-8">
          <h2 className="text-3xl font-black tracking-tighter text-on-surface">
            系统设置
          </h2>
        </div>
        <div className="ml-8 flex items-center gap-4">
          <Link
            to="/downloads"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined">download</span>
          </Link>
          <HeaderStudioUser size="sm" />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 pb-40 md:px-10">
        {loadErr ? (
          <p className="mb-6 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {loadErr}
          </p>
        ) : null}

        <div className="mb-12">
          
          
          {health && !health.ok ? (
            <p className="mt-4 text-sm text-error">
              无法使用 yt-dlp：{health.error}
            </p>
          ) : null}
        </div>

        <section className="space-y-16">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">
                manage_accounts
              </span>
              <h4 className="text-lg font-bold tracking-tight text-on-surface">
                用户管理
              </h4>
            </div>

            <div className="inner-highlight space-y-8 rounded-xl border border-white/14 bg-surface-container p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.45)] md:p-8">
              <div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-on-surface-variant/92">
                  账号列表
                </label>
                {userManageErr ? (
                  <p className="mb-3 text-sm text-error">{userManageErr}</p>
                ) : null}
                <ul className="flex flex-col gap-1.5">
                  {studioUserIds.map((id) => {
                    const active = id === getStudioUser()
                    return (
                      <li
                        key={id}
                        className="flex min-h-[48px] items-stretch gap-1 overflow-hidden rounded-lg border border-white/12 bg-surface-container-high"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (active) return
                            setStudioUser(id)
                            window.location.reload()
                          }}
                          className={`min-w-0 flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 ${
                            active
                              ? 'bg-primary/12 ring-1 ring-inset ring-white/25'
                              : 'hover:bg-surface-container-highest/70'
                          }`}
                          aria-current={active ? 'true' : undefined}
                        >
                          <span className="font-mono text-xs text-on-surface">
                            {id}
                          </span>
                          {active ? (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">
                              当前
                            </span>
                          ) : (
                            <span className="material-symbols-outlined shrink-0 text-lg text-on-surface-variant/50">
                              chevron_right
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={
                            studioUserIds.length <= 1 || removeUserLoading
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            setUserManageErr(null)
                            setRemoveUserTarget(id)
                          }}
                          className="shrink-0 border-l border-white/10 px-3 text-error transition-colors hover:bg-error/10 disabled:pointer-events-none disabled:opacity-35"
                          title={
                            studioUserIds.length <= 1
                              ? '至少保留一个用户'
                              : `删除用户 ${id}`
                          }
                          aria-label={`删除用户 ${id}`}
                        >
                          <span className="material-symbols-outlined text-lg leading-none">
                            delete
                          </span>
                        </button>
                      </li>
                    )
                  })}
                  {pendingNewUsers.map((d, i) => {
                    const busy = committingDraftId === d.id
                    return (
                      <li
                        key={d.id}
                        className="flex min-h-[48px] items-stretch gap-1 overflow-hidden rounded-lg border border-dashed border-white/22 bg-surface-container-high/75"
                      >
                        <div className="flex min-w-0 flex-1 items-center px-3 py-2 sm:px-4">
                          <input
                            value={d.value}
                            onChange={(e) =>
                              updateUserDraft(d.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitUserDraft(d.id)
                            }}
                            placeholder="新用户 id，例如 editor_01"
                            disabled={busy}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus={i === pendingNewUsers.length - 1}
                            aria-label="新用户 id"
                            className="w-full border-0 bg-transparent px-0 py-1 font-mono text-xs text-on-surface outline-none ring-0 placeholder:text-on-surface-variant/40 focus:ring-0 disabled:opacity-50"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busy || removeUserLoading}
                          onClick={() => commitUserDraft(d.id)}
                          className="shrink-0 border-l border-white/10 px-3 text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-35"
                          title="创建用户"
                          aria-label="创建用户"
                        >
                          <span className="material-symbols-outlined text-lg leading-none">
                            {busy ? 'hourglass_empty' : 'check'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setUserManageErr(null)
                            removeUserDraft(d.id)
                          }}
                          className="shrink-0 border-l border-white/10 px-3 text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:pointer-events-none disabled:opacity-35"
                          title="取消"
                          aria-label="取消新建"
                        >
                          <span className="material-symbols-outlined text-lg leading-none">
                            close
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button
                  type="button"
                  onClick={addUserDraftRow}
                  className="mt-2 flex items-center gap-2 rounded px-2 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/5"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  新建用户
                </button>
               
              </div>
            </div>
          </div>

          <div>
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">
                folder_managed
              </span>
              <h4 className="text-lg font-bold tracking-tight text-on-surface">
                存储与目录
              </h4>
            </div>

            <div className="inner-highlight space-y-8 rounded-xl border border-white/14 bg-surface-container p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.45)] md:p-8">
              <div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-on-surface-variant/92">
                  默认下载目录
                </label>
                {downloadDirPickErr ? (
                  <p className="mb-3 text-sm text-error">{downloadDirPickErr}</p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <input
                    readOnly
                    value={draft.downloadDir}
                    className="min-h-[48px] flex-1 rounded-lg border border-white/12 bg-surface-container-high px-4 py-3 font-mono text-xs text-on-surface"
                  />
                  <button
                    type="button"
                    title="在运行后端的电脑上选择文件夹"
                    disabled={pickingMappingId !== null || pickingDownloadDir}
                    onClick={changePath}
                    className="shrink-0 rounded-lg border border-white/12 bg-surface-container-high px-6 py-3 text-sm font-bold text-primary transition-colors hover:border-white/18 hover:bg-surface-container-highest disabled:pointer-events-none disabled:opacity-50"
                  >
                    {pickingDownloadDir ? '选择中…' : '修改路径'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] uppercase tracking-wider text-on-surface-variant/82">
                  未命中标签映射时，下载任务默认保存到此目录。选择后需点击底部「保存更改」才会写入服务端。
                </p>
              </div>

              <div>
                <label className="mb-4 block text-xs font-bold uppercase tracking-widest text-on-surface-variant/92">
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
                      <div className="flex min-h-[46px] items-center gap-2 rounded-lg border border-white/12 bg-surface-container-high px-4 py-2 sm:col-span-3">
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
                          className="min-w-0 flex-1 rounded-lg border border-white/12 bg-surface-container-high px-4 py-2.5 font-mono text-xs text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-white/35"
                        />
                        <button
                          type="button"
                          title="在后端电脑上选择文件夹并填入路径"
                          disabled={
                            pickingMappingId !== null || pickingDownloadDir
                          }
                          onClick={() => pickPathForMapping(m.id)}
                          className="flex shrink-0 items-center justify-center self-stretch rounded-lg border border-white/12 bg-surface-container-high px-3 text-primary transition-colors hover:border-white/18 hover:bg-surface-container-highest disabled:pointer-events-none disabled:opacity-50"
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
                <p className="border-t border-white/10 pt-6 font-mono text-[11px] text-on-surface-variant/82">
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
              className="rounded-lg bg-primary-container px-6 py-2.5 text-sm font-bold text-on-primary-container shadow-[0_0_24px_rgba(255,255,255,0.14)] transition-all active:scale-95 disabled:opacity-50 sm:px-8"
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

      <ConfirmDialog
        open={removeUserTarget !== null}
        title="删除用户"
        description={
          removeUserTarget
            ? `确定删除用户「${removeUserTarget}」？将永久删除其目录 data/users/${removeUserTarget}/ 以及该账号在服务端内存中的下载任务。此操作不可恢复。`
            : ''
        }
        variant="danger"
        confirmLabel="删除"
        loading={removeUserLoading}
        onConfirm={() => confirmRemoveUser()}
        onCancel={() => {
          if (!removeUserLoading) setRemoveUserTarget(null)
        }}
      />
    </div>
  )
}
