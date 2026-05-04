import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Locale = 'zh-CN' | 'en-US'

const LOCALE_STORAGE_KEY = 'youtube-studio-locale'

const messages = {
  'zh-CN': {
    'common.language': '语言',
    'common.chinese': '中文',
    'common.english': 'English',
    'common.close': '关闭',
    'common.confirm': '确定',
    'common.cancel': '取消',
    'common.processing': '处理中…',
    'toolbar.download': '下载',
    'toolbar.settings': '系统设置',
    'toolbar.switchLanguage': '切换语言',
    'nav.home': '首页',
    'nav.downloads': '下载',
    'nav.channels': '频道',
    'nav.tags': '标签',
    'nav.settings': '设置',
    'nav.filterByTag': '按标签筛选',
    'layout.downloadDir': '下载目录',
    'layout.goToSettings': '前往设置',
    'a11y.expandSidebar': '展开侧栏',
    'a11y.collapseSidebar': '收起侧栏',
    'a11y.languageMenu': '语言菜单',
    'a11y.switchToChinese': '切换为中文',
    'a11y.switchToEnglish': '切换为英文',
    'settings.title': '系统设置',
    'settings.languageTitle': '界面语言',
    'settings.languageDesc': '切换全局界面文案（中文/英文）',
    'subscriptions.title': '频道',
    'subscriptions.filterByTag': '按标签筛选',
    'subscriptions.clearFilter': '清除筛选',
    'subscriptions.addChannel': '添加频道',
    'subscriptions.loading': '正在加载频道…',
    'subscriptions.emptyByTag': '没有带标签「{tag}」的频道。',
    'subscriptions.removeChannel': '移除频道',
    'subscriptions.editTags': '编辑标签',
    'subscriptions.openOnYoutube': '在 YouTube 打开频道',
    'subscriptions.locateOnPage': '在本页定位到此频道',
    'subscriptions.tagFilterTitle': '按此标签筛选',
    'subscriptions.notificationsMuted': '已关闭：该频道不显示在首页，点击开启',
    'subscriptions.notificationsEnabled': '已开启：在首页展示该频道更新，点击关闭',
    'subscriptions.tagsEditorTitle': '编辑标签',
    'subscriptions.tagsEditorHint': '从列表选择已有标签，或在输入框输入新标签后按 Enter / 点「添加」。已选标签可点 × 移除。',
    'subscriptions.removeTag': '移除 {tag}',
    'subscriptions.searchOrAddTag': '搜索或输入新标签…',
    'subscriptions.add': '添加',
    'subscriptions.saveFailed': '保存失败',
    'subscriptions.cancel': '取消',
    'subscriptions.save': '保存',
    'subscriptions.saving': '保存中…',
    'subscriptions.addChannelTitle': '添加频道',
    'subscriptions.addChannelHint': '粘贴 YouTube 频道链接（如 youtube.com/@handle 或 /channel/UC…），服务端会用 yt-dlp 拉取头像、订阅数、视频数与简介。',
    'subscriptions.addChannelPlaceholder': 'https://www.youtube.com/@…',
    'subscriptions.fetchingChannel': '正在拉取频道信息…',
    'subscriptions.closeMenu': '关闭菜单',
    'subscriptions.removeSubscriptionTitle': '移除订阅频道',
    'subscriptions.removeSubscriptionConfirm': '确定从订阅中移除「{name}」？此操作不可撤销。',
    'subscriptions.remove': '移除',
    'subscriptions.pasteChannelUrl': '请粘贴 YouTube 频道链接',
    'subscriptions.addFailed': '添加失败',
    'subscriptions.deleteFailed': '删除失败',
    'library.title': '首页',
    'library.noTagChannels': '没有包含该标签的订阅频道。',
    'library.loadLatestFailed': '无法加载最新视频，请稍后刷新页面。',
    'library.emptyVideos': '暂无视频条目。',
    'library.openOnYoutube': '在 YouTube 打开频道',
    'library.openInChannelsPage': '在频道页打开此订阅',
    'library.noFeed': '当前没有可展示的订阅视频。请先',
    'library.noFeedTail': '；若已在频道页关闭通知，该频道将不会出现在此页。仅开启通知的频道会拉取并展示最近稿件。',
    'library.addChannel': '添加频道',
    'library.noSearchResults': '未找到相关视频，请尝试其他关键词。',
    'tags.title': '标签',
    'tags.desc': '点击标签可展开并移除。移除后该标签将从侧栏、本页与设置中的下拉选项里隐藏，并会从订阅频道与「标签 -> 文件夹」映射中一并清除。',
    'tags.loadFailed': '标签列表加载失败：{error}',
    'tags.removeFailed': '移除失败：{error}',
    'tags.removedToast': '已移除标签「{tag}」',
    'tags.deleteAria': '删除标签 {tag}',
    'tags.removeTitle': '移除标签',
    'tags.removeConfirm': '从列表中移除标签「{tag}」？将同时从订阅频道与文件夹映射中清除该标签。',
    'tags.remove': '移除',
    'video.download': '下载',
    'video.defaultChannel': '频道',
    'videoModal.sampleTip': '示例卡片：封面与标题为原型展示；播放器内为对应 ID 的真实 YouTube 视频。',
    'videoModal.duration': '时长',
    'videoModal.loadingDetail': '加载详情…',
    'videoModal.openYoutube': '在 YouTube 打开',
    'videoModal.goDownload': '前往下载',
    'header.switchAccount': '切换账号',
    'header.switchAccountCurrent': '切换账号（当前 {id}）',
    'skeleton.loadingFeed': '正在加载订阅动态',
    'skeleton.loadingVideos': '正在加载视频',
    'skeleton.searching': '正在搜索',
  },
  'en-US': {
    'common.language': 'Language',
    'common.chinese': '中文',
    'common.english': 'English',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.processing': 'Processing...',
    'toolbar.download': 'Downloads',
    'toolbar.settings': 'Settings',
    'toolbar.switchLanguage': 'Switch language',
    'nav.home': 'Home',
    'nav.downloads': 'Downloads',
    'nav.channels': 'Channels',
    'nav.tags': 'Tags',
    'nav.settings': 'Settings',
    'nav.filterByTag': 'Filter by tag',
    'layout.downloadDir': 'Download directory',
    'layout.goToSettings': 'Go to settings',
    'a11y.expandSidebar': 'Expand sidebar',
    'a11y.collapseSidebar': 'Collapse sidebar',
    'a11y.languageMenu': 'Language menu',
    'a11y.switchToChinese': 'Switch to Chinese',
    'a11y.switchToEnglish': 'Switch to English',
    'settings.title': 'Settings',
    'settings.languageTitle': 'Interface Language',
    'settings.languageDesc': 'Switch global UI copy (Chinese/English)',
    'subscriptions.title': 'Channels',
    'subscriptions.filterByTag': 'Filter by tag',
    'subscriptions.clearFilter': 'Clear filter',
    'subscriptions.addChannel': 'Add Channel',
    'subscriptions.loading': 'Loading channels...',
    'subscriptions.emptyByTag': 'No channels found with tag "{tag}".',
    'subscriptions.removeChannel': 'Remove channel',
    'subscriptions.editTags': 'Edit tags',
    'subscriptions.openOnYoutube': 'Open channel on YouTube',
    'subscriptions.locateOnPage': 'Locate this channel on this page',
    'subscriptions.tagFilterTitle': 'Filter by this tag',
    'subscriptions.notificationsMuted': 'Muted: hidden on Home. Click to enable.',
    'subscriptions.notificationsEnabled': 'Enabled: shown on Home. Click to mute.',
    'subscriptions.tagsEditorTitle': 'Edit Tags',
    'subscriptions.tagsEditorHint': 'Pick existing tags, or type a new tag and press Enter / click Add. Click × to remove selected tags.',
    'subscriptions.removeTag': 'Remove {tag}',
    'subscriptions.searchOrAddTag': 'Search or add a new tag...',
    'subscriptions.add': 'Add',
    'subscriptions.saveFailed': 'Failed to save',
    'subscriptions.cancel': 'Cancel',
    'subscriptions.save': 'Save',
    'subscriptions.saving': 'Saving...',
    'subscriptions.addChannelTitle': 'Add Channel',
    'subscriptions.addChannelHint': 'Paste a YouTube channel URL (e.g. youtube.com/@handle or /channel/UC...). The server uses yt-dlp to fetch avatar, subscribers, video count, and description.',
    'subscriptions.addChannelPlaceholder': 'https://www.youtube.com/@...',
    'subscriptions.fetchingChannel': 'Fetching channel info...',
    'subscriptions.closeMenu': 'Close menu',
    'subscriptions.removeSubscriptionTitle': 'Remove Subscribed Channel',
    'subscriptions.removeSubscriptionConfirm': 'Remove "{name}" from subscriptions? This action cannot be undone.',
    'subscriptions.remove': 'Remove',
    'subscriptions.pasteChannelUrl': 'Please paste a YouTube channel URL',
    'subscriptions.addFailed': 'Failed to add',
    'subscriptions.deleteFailed': 'Failed to delete',
    'library.title': 'Home',
    'library.noTagChannels': 'No subscribed channels match this tag.',
    'library.loadLatestFailed': 'Failed to load latest videos. Please refresh later.',
    'library.emptyVideos': 'No videos yet.',
    'library.openOnYoutube': 'Open channel on YouTube',
    'library.openInChannelsPage': 'Open this subscription in Channels page',
    'library.noFeed': 'No subscribed videos to show. Please',
    'library.noFeedTail': '; channels muted in Channels page will not appear here. Only enabled channels fetch recent uploads.',
    'library.addChannel': 'Add channel',
    'library.noSearchResults': 'No videos found. Try another keyword.',
    'tags.title': 'Tags',
    'tags.desc': 'Click a tag to expand and remove it. Removing a tag hides it from sidebar, this page, and settings dropdowns, and also clears it from channel tags and tag-folder mappings.',
    'tags.loadFailed': 'Failed to load tags: {error}',
    'tags.removeFailed': 'Failed to remove: {error}',
    'tags.removedToast': 'Removed tag "{tag}"',
    'tags.deleteAria': 'Delete tag {tag}',
    'tags.removeTitle': 'Remove tag',
    'tags.removeConfirm': 'Remove tag "{tag}" from list? It will also be cleared from channel tags and folder mappings.',
    'tags.remove': 'Remove',
    'video.download': 'Download',
    'video.defaultChannel': 'Channel',
    'videoModal.sampleTip': 'Sample card: title and thumbnail are mock data; the player loads the real YouTube video for this ID.',
    'videoModal.duration': 'Duration',
    'videoModal.loadingDetail': 'Loading details...',
    'videoModal.openYoutube': 'Open on YouTube',
    'videoModal.goDownload': 'Go to download',
    'header.switchAccount': 'Switch account',
    'header.switchAccountCurrent': 'Switch account (current: {id})',
    'skeleton.loadingFeed': 'Loading subscription feed',
    'skeleton.loadingVideos': 'Loading videos',
    'skeleton.searching': 'Searching',
  },
} as const

type MessageKey = keyof (typeof messages)['zh-CN']

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function normalizeLocale(raw: string | null | undefined): Locale {
  if (raw === 'en-US') return 'en-US'
  return 'zh-CN'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'zh-CN'
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  })

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  const t = useCallback<I18nContextValue['t']>(
    (key, vars) => {
      const template = messages[locale][key] || messages['zh-CN'][key]
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (_, token) =>
        Object.prototype.hasOwnProperty.call(vars, token)
          ? String(vars[token])
          : `{${token}}`,
      )
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
