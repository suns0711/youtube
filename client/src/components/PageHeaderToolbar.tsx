import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDownloadQueueBadge } from '../DownloadQueueBadgeContext'
import { useI18n } from '../i18n'
import {
  DOWNLOAD_QUEUE_BADGE_DOT_CLASS,
  downloadsPageQueueHref,
} from '../lib/downloadsNavigation'
import { HeaderStudioUser } from './HeaderStudioUser'

const toolbarIconClass =
  'inline-flex rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95'

export function PageHeaderToolbar() {
  const { locale, setLocale, t } = useI18n()
  const { showDownloadCompleteBadge, acknowledgeDownloadBadge } =
    useDownloadQueueBadge()
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!langMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (!langMenuRef.current?.contains(e.target as Node)) {
        setLangMenuOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [langMenuOpen])

  const currentLanguageLabel =
    locale === 'zh-CN' ? t('common.chinese') : t('common.english')
  return (
    <div className="ml-8 flex items-center gap-4">
      <Link
        to={downloadsPageQueueHref()}
        className={`relative ${toolbarIconClass}`}
        title={t('toolbar.download')}
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
        title={t('toolbar.settings')}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">
          settings
        </span>
      </Link>
      <div ref={langMenuRef} className="relative">
        <button
          type="button"
          className={`${toolbarIconClass} min-w-[84px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black tracking-wide`}
          title={t('toolbar.switchLanguage')}
          aria-label={t('a11y.languageMenu')}
          aria-haspopup="menu"
          aria-expanded={langMenuOpen}
          onClick={() => setLangMenuOpen((v) => !v)}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            language
          </span>
          <span>{currentLanguageLabel}</span>
          <span className="material-symbols-outlined text-[16px] leading-none">
            expand_more
          </span>
        </button>
        {langMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[132px] rounded-lg border border-outline-variant/20 bg-surface-container-low p-1 shadow-xl"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === 'zh-CN'}
              aria-label={t('a11y.switchToChinese')}
              onClick={() => {
                setLocale('zh-CN')
                setLangMenuOpen(false)
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-bold ${
                locale === 'zh-CN'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span>{t('common.chinese')}</span>
              {locale === 'zh-CN' ? (
                <span className="material-symbols-outlined text-[15px] leading-none">
                  check
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === 'en-US'}
              aria-label={t('a11y.switchToEnglish')}
              onClick={() => {
                setLocale('en-US')
                setLangMenuOpen(false)
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-bold ${
                locale === 'en-US'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span>{t('common.english')}</span>
              {locale === 'en-US' ? (
                <span className="material-symbols-outlined text-[15px] leading-none">
                  check
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
      </div>
      <HeaderStudioUser className="ml-2" />
    </div>
  )
}
