import express from 'express';
import cors from 'cors';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
/** 设置文件中默认使用的相对路径（相对项目根目录 ROOT） */
const RELATIVE_DEFAULT_DOWNLOAD_DIR = 'data/downloads';

function resolveDownloadDirFromStored(stored) {
  const t = String(stored ?? '').trim();
  if (!t) {
    return path.resolve(ROOT, RELATIVE_DEFAULT_DOWNLOAD_DIR);
  }
  if (path.isAbsolute(t)) {
    return path.resolve(t);
  }
  return path.resolve(ROOT, t);
}

function toStoredDownloadDir(absolutePath) {
  const abs = path.resolve(String(absolutePath || ''));
  const defAbs = path.resolve(ROOT, RELATIVE_DEFAULT_DOWNLOAD_DIR);
  if (abs === defAbs) {
    return RELATIVE_DEFAULT_DOWNLOAD_DIR;
  }
  let rel;
  try {
    rel = path.relative(ROOT, abs);
  } catch {
    return abs;
  }
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  return abs;
}

const DEFAULT_DOWNLOAD_DIR = resolveDownloadDirFromStored('');
const USERS_ROOT = path.join(ROOT, 'data', 'users');
const LEGACY_SETTINGS_PATH = path.join(ROOT, 'data', 'studio-settings.json');
const LEGACY_SUBSCRIPTIONS_PATH = path.join(ROOT, 'data', 'subscriptions.json');
const STUDIO_USERS_JSON = path.join(ROOT, 'data', 'studio-users.json');

const ALLOWED_USERS = new Set();

function normalizeStudioUserIdEntry(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/i.test(s) ? s : null;
}

function normalizeStudioUserIdList(arr) {
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const s = normalizeStudioUserIdEntry(item);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function readStudioUsersFile() {
  try {
    const data = JSON.parse(fs.readFileSync(STUDIO_USERS_JSON, 'utf8'));
    const arr = Array.isArray(data?.users)
      ? data.users
      : Array.isArray(data)
        ? data
        : [];
    return normalizeStudioUserIdList(arr);
  } catch {
    return null;
  }
}

function persistAllowedUsers() {
  /** Set 迭代顺序即插入顺序：新建用户始终在末尾，写入 JSON 时保持该顺序 */
  const users = [...ALLOWED_USERS];
  fs.mkdirSync(path.dirname(STUDIO_USERS_JSON), { recursive: true });
  fs.writeFileSync(
    STUDIO_USERS_JSON,
    JSON.stringify({ users }, null, 2),
    'utf8',
  );
}

function initAllowedUsers() {
  let fromFile = false;
  let list = null;
  if (fs.existsSync(STUDIO_USERS_JSON)) {
    const parsed = readStudioUsersFile();
    if (parsed && parsed.length > 0) {
      list = parsed;
      fromFile = true;
    }
  }
  if (!list) {
    list = normalizeStudioUserIdList(
      String(process.env.STUDIO_USERS || 'ss,yb').split(','),
    );
    if (!list.length) list = ['ss', 'yb'];
  }
  ALLOWED_USERS.clear();
  for (const u of list) ALLOWED_USERS.add(u);
  if (!fromFile) persistAllowedUsers();
}

initAllowedUsers();

function sortedAllowedUsers() {
  return [...ALLOWED_USERS];
}

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';
/** 首页订阅 feed 各频道 yt-dlp 并行上限（提高吞吐、避免瞬时并发过高） */
const RECENT_FEED_PARALLEL =
  Math.min(
    8,
    Math.max(
      1,
      parseInt(String(process.env.RECENT_FEED_PARALLEL || '6'), 10) || 6,
    ),
  );
/** recent-videos 内存缓存 TTL（ms），0 关闭；订阅变更时会主动失效 */
const RECENT_FEED_CACHE_TTL_MS = Math.max(
  0,
  parseInt(String(process.env.RECENT_FEED_CACHE_TTL_MS || '90000'), 10) || 0,
);
/** @type {Map<string, { at: number, body: { sections: unknown[] } }>} */
const recentFeedCache = new Map();
/** 首页视频上传时间等补全（/watch 单条解析，较慢，短期缓存） */
const FEED_VIDEO_META_CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(String(process.env.FEED_VIDEO_META_CACHE_TTL_MS || '21600000'), 10)
    || 21_600_000,
);
const FEED_VIDEO_META_PARALLEL = Math.min(
  8,
  Math.max(1, parseInt(String(process.env.FEED_VIDEO_META_PARALLEL || '4'), 10) || 4),
);
const FEED_VIDEO_META_MAX_IDS = Math.min(
  120,
  Math.max(1, parseInt(String(process.env.FEED_VIDEO_META_MAX_IDS || '48'), 10) || 48),
);
/** @type {Map<string, { at: number, upload_date: string | null, duration: number | null }>} */
const feedVideoMetaCache = new Map();
const ENV_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
  ? path.resolve(process.env.DOWNLOAD_DIR)
  : DEFAULT_DOWNLOAD_DIR;

app.use(
  cors({
    origin: true,
    allowedHeaders: ['Content-Type', 'X-Studio-User', 'X-User-Id'],
  }),
);
app.use(express.json({ limit: '1mb' }));

function userDir(userId) {
  return path.join(USERS_ROOT, userId);
}
function userSettingsPath(userId) {
  return path.join(userDir(userId), 'studio-settings.json');
}
function userSubscriptionsPath(userId) {
  return path.join(userDir(userId), 'subscriptions.json');
}

/** @typedef {{ userId: string, activeDownloadDir: string, tagMappings: unknown[], hiddenTags: string[], tagAccentByLabel: Record<string, string>, subscriptions: unknown[], downloadDirWarning: string | null, downloadDirFromSettings: boolean }} StudioUserContext */

/** @type {Map<string, StudioUserContext>} */
const userContexts = new Map();

function createFreshContext(userId) {
  return {
    userId,
    activeDownloadDir: resolveDownloadDirFromStored(''),
    tagMappings: defaultTagMappings(),
    hiddenTags: [],
    tagAccentByLabel: {},
    subscriptions: [],
    downloadDirWarning: null,
    downloadDirFromSettings: false,
  };
}

function parseStudioUser(req) {
  const raw = String(
    req.headers['x-studio-user'] ||
      req.headers['x-user-id'] ||
      req.query.user ||
      '',
  )
    .trim()
    .toLowerCase();
  if (/^[a-z0-9_-]{1,32}$/i.test(raw) && ALLOWED_USERS.has(raw)) return raw;
  return null;
}

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/health') return next();
  const u = parseStudioUser(req);
  if (!u) {
    return res.status(401).json({
      error:
        '缺少或无效的用户。请在请求头加入 X-Studio-User（例如 ss 或 yb）',
      allowedUsers: sortedAllowedUsers(),
    });
  }
  req.studioUser = u;
  next();
});

function defaultTagMappings() {
  return [
    {
      id: randomUUID(),
      tag: 'B-ROLL',
      path: '../assets/broll/high_res/',
      dot: 'tertiary',
    },
    {
      id: randomUUID(),
      tag: 'INTERVIEW',
      path: '../interviews/master_cuts/',
      dot: 'primary',
    },
  ];
}

/** 标签展示色键 → 与 client/src/lib/tagAccentStyles.ts 中 ID 一致 */
const TAG_ACCENTS = [
  'coral',
  'sky',
  'violet',
  'mint',
  'amber',
  'rose',
  'cyan',
];

function sanitizeTagAccents(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().slice(0, 64);
    const val = String(v || '').trim();
    if (key && TAG_ACCENTS.includes(val)) out[key] = val;
  }
  return out;
}

function assignRandomAccentForTag(ctx, label) {
  const t = String(label || '').trim().slice(0, 64);
  if (!t || Object.prototype.hasOwnProperty.call(ctx.tagAccentByLabel, t)) {
    return false;
  }
  ctx.tagAccentByLabel[t] =
    TAG_ACCENTS[Math.floor(Math.random() * TAG_ACCENTS.length)];
  return true;
}

function sanitizeHiddenTags(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const t = String(x || '').trim().slice(0, 64);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
      if (out.length >= 200) break;
    }
  }
  return out;
}

function sanitizeTagMappings(arr) {
  if (!Array.isArray(arr)) return defaultTagMappings();
  if (arr.length === 0) return [];
  const out = arr
    .filter((m) => m && typeof m.tag === 'string' && typeof m.path === 'string')
    .slice(0, 50)
    .map((m) => ({
      id: typeof m.id === 'string' && m.id ? m.id : randomUUID(),
      tag: String(m.tag).slice(0, 64),
      path: String(m.path).slice(0, 1024),
      dot: m.dot === 'primary' ? 'primary' : 'tertiary',
    }));
  return out.length ? out : defaultTagMappings();
}

function saveStudioSettingsToDisk(ctx) {
  const p = userSettingsPath(ctx.userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        downloadDir: toStoredDownloadDir(ctx.activeDownloadDir),
        tagMappings: ctx.tagMappings,
        hiddenTags: ctx.hiddenTags,
        tagAccentByLabel: ctx.tagAccentByLabel,
      },
      null,
      2,
    ),
    'utf8',
  );
}

/**
 * 校验当前 ctx.activeDownloadDir 是否可创建、为目录且可读写。
 * @returns {string | null} 错误文案；无问题返回 null
 */
function validateActiveDownloadDir(ctx) {
  const dir = ctx.activeDownloadDir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return `无法创建下载目录（${dir}）：${e.message || e}`;
  }
  try {
    const st = fs.statSync(dir);
    if (!st.isDirectory()) {
      return `下载路径不是文件夹：${dir}`;
    }
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (e) {
    return `下载目录不可用（${dir}）：${e.message || e}`;
  }
  return null;
}

/** 保存设置或系统选目录成功后刷新提示 */
function revalidateDownloadDirAfterMutation(ctx) {
  ctx.downloadDirFromSettings = true;
  ctx.downloadDirWarning = validateActiveDownloadDir(ctx);
}

function loadStudioIntoContext(ctx) {
  const p = userSettingsPath(ctx.userId);
  const defaultDir = resolveDownloadDirFromStored('');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  ctx.downloadDirWarning = null;
  ctx.downloadDirFromSettings = false;

  if (!fs.existsSync(p)) {
    ctx.activeDownloadDir = defaultDir;
    ctx.tagMappings = defaultTagMappings();
    ctx.hiddenTags = [];
    ctx.tagAccentByLabel = {};
    ctx.downloadDirWarning = validateActiveDownloadDir(ctx);
    if (!ctx.downloadDirWarning) {
      ctx.downloadDirWarning =
        `尚未生成设置文件，已使用默认相对路径 ${RELATIVE_DEFAULT_DOWNLOAD_DIR}（相对项目根目录）。请到「设置」确认。`;
    }
    saveStudioSettingsToDisk(ctx);
    return;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    ctx.activeDownloadDir = defaultDir;
    ctx.tagMappings = defaultTagMappings();
    ctx.hiddenTags = [];
    ctx.tagAccentByLabel = {};
    const v = validateActiveDownloadDir(ctx);
    ctx.downloadDirWarning = v
      ? `设置文件损坏已重置。${v}`
      : '设置文件损坏已重置。请到「设置」确认下载目录。';
    saveStudioSettingsToDisk(ctx);
    return;
  }

  const configured =
    typeof raw.downloadDir === 'string' && raw.downloadDir.trim();
  ctx.downloadDirFromSettings = Boolean(configured);
  ctx.activeDownloadDir = configured
    ? resolveDownloadDirFromStored(configured)
    : defaultDir;
  ctx.tagMappings = sanitizeTagMappings(raw.tagMappings);
  ctx.hiddenTags = sanitizeHiddenTags(raw.hiddenTags);
  ctx.tagAccentByLabel = sanitizeTagAccents(raw.tagAccentByLabel);

  const vErr = validateActiveDownloadDir(ctx);
  if (vErr) {
    ctx.downloadDirWarning = `${vErr} 已临时使用默认目录；请到「设置」修改并保存。`;
    ctx.activeDownloadDir = defaultDir;
    ctx.downloadDirFromSettings = false;
    const v2 = validateActiveDownloadDir(ctx);
    if (v2) {
      ctx.downloadDirWarning = `${vErr} 默认目录亦不可用：${v2}。请到「设置」处理。`;
    }
    return;
  }

  if (!configured) {
    ctx.downloadDirWarning =
      `未在设置中填写下载目录，当前使用默认相对路径 ${RELATIVE_DEFAULT_DOWNLOAD_DIR}（相对项目根目录）。请到「设置」确认。`;
  }
}

function getDownloadDir(ctx) {
  return ctx.activeDownloadDir;
}

function migrateLegacyDataIfNeeded() {
  const first = sortedAllowedUsers()[0] || 'ss';
  fs.mkdirSync(USERS_ROOT, { recursive: true });
  if (
    fs.existsSync(LEGACY_SETTINGS_PATH)
    && !fs.existsSync(userSettingsPath(first))
  ) {
    fs.mkdirSync(userDir(first), { recursive: true });
    fs.copyFileSync(LEGACY_SETTINGS_PATH, userSettingsPath(first));
  }
  if (
    fs.existsSync(LEGACY_SUBSCRIPTIONS_PATH)
    && !fs.existsSync(userSubscriptionsPath(first))
  ) {
    fs.mkdirSync(userDir(first), { recursive: true });
    fs.copyFileSync(LEGACY_SUBSCRIPTIONS_PATH, userSubscriptionsPath(first));
  }
}

function validateDownloadDir(dir) {
  const s = String(dir || '').trim();
  if (!s || s.length > 4096 || s.includes('\0')) {
    return { ok: false, error: '无效的目录路径' };
  }
  const resolved = path.isAbsolute(s)
    ? path.resolve(s)
    : path.resolve(ROOT, s);
  return { ok: true, path: resolved };
}

/** @type {Map<string, Record<string, unknown>>} */
const jobs = new Map();

function allowedYoutubeHostname(host) {
  const h = host.replace(/^www\./, '').toLowerCase();
  return (
    h === 'youtube.com' ||
    h === 'youtu.be' ||
    h === 'm.youtube.com' ||
    h === 'music.youtube.com'
  );
}

function isAllowedYoutubeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? allowedYoutubeHostname(u.hostname)
      : false;
  } catch {
    return false;
  }
}

/** 若目标已存在，生成「原名 (2).ext」递增路径 */
function uniqueFilePathInDir(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const baseFull = path.basename(destPath, ext);
  let n = 2;
  for (;;) {
    const candidate = path.join(dir, `${baseFull} (${n})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    n += 1;
  }
}

const THUMB_SIDE_EXT = new Set(['.jpg', '.jpeg', '.webp', '.png']);

/**
 * 在独立 staging 目录下载完成后，将主媒体文件移到 outputDir，文件名为视频标题（与重名处理）。
 * 若曾请求封面图，将同目录下的缩略图文件一并移入 outputDir。
 */
function finalizeStagedYoutubeDownload(stagingDir, outputDir) {
  let names;
  try {
    names = fs.readdirSync(stagingDir);
  } catch {
    return null;
  }
  const skipName = (f) =>
    !f
    || f.startsWith('.')
    || f.endsWith('.part')
    || f.endsWith('.ytdl')
    || f.endsWith('.frag.urls')
    || f === '.DS_Store';
  const files = names.filter((f) => !skipName(f));
  if (!files.length) return null;
  const scored = files
    .map((f) => {
      const p = path.join(stagingDir, f);
      try {
        const st = fs.statSync(p);
        if (!st.isFile()) return null;
        return { f, p, size: st.size };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!scored.length) return null;
  scored.sort((a, b) => b.size - a.size);
  const chosen = scored[0];
  let destPath = path.join(outputDir, chosen.f);
  destPath = uniqueFilePathInDir(destPath);
  fs.renameSync(chosen.p, destPath);
  for (let i = 1; i < scored.length; i += 1) {
    const item = scored[i];
    const ext = path.extname(item.f).toLowerCase();
    if (!THUMB_SIDE_EXT.has(ext)) continue;
    let sideDest = path.join(outputDir, item.f);
    sideDest = uniqueFilePathInDir(sideDest);
    fs.renameSync(item.p, sideDest);
  }
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return destPath;
}

/** 将频道主页等链接规范为 /videos 列表页，便于 yt-dlp 返回 playlist_count 等 */
function normalizeYoutubeChannelVideosUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!allowedYoutubeHostname(u.hostname)) return null;
  let path = u.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path.startsWith('/results') || path.startsWith('/feed')) {
    return null;
  }
  if (path.includes('/watch')) return null;
  if (path.includes('/playlist')) return null;
  if (!/\/videos$/i.test(path)) {
    path = `${path}/videos`;
  }
  u.pathname = path.replace(/\/+/g, '/');
  return u.href;
}

/**
 * @param {'recent' | 'views'} feedSort recent=视频页默认顺序（通常最新在前）；views=热门（sort=p）
 */
function applyChannelVideosFeedSort(href, feedSort) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return href;
  }
  const popular = String(feedSort || 'recent').toLowerCase() === 'views';
  if (popular) {
    u.searchParams.set('sort', 'p');
  } else {
    u.searchParams.delete('sort');
  }
  return u.href;
}

/** 从订阅记录得到频道「视频」Tab URL；views 模式用 YouTube 「热门」排序，与 recent 列表不是同一批稿件 */
function subscriptionChannelToVideosUrl(ch, feedSort = 'recent') {
  const cu = String(ch.channelUrl || '').trim();
  let href = null;
  if (cu) {
    const n = normalizeYoutubeChannelVideosUrl(cu);
    if (n) href = n;
  }
  if (!href) {
    const h = String(ch.handle || '').trim().replace(/^@+/, '');
    if (!h) return null;
    href = `https://www.youtube.com/@${h}/videos`;
  }
  return applyChannelVideosFeedSort(href, feedSort);
}

function normalizeChannelBaseUrl(url) {
  const s = String(url || '').trim().toLowerCase();
  if (!s) return '';
  try {
    const u = new URL(s);
    let p = u.pathname.replace(/\/+$/, '').replace(/\/videos$/i, '');
    if (!p) p = '';
    return `${u.hostname}${p}`;
  } catch {
    return s;
  }
}

function formatSubscriberLabel(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const x = Number(n);
  if (x >= 1_000_000) {
    const t = (x / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${t}M subs`;
  }
  if (x >= 1_000) {
    const t = (x / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${t}K subs`;
  }
  return `${x} subs`;
}

function formatVideoCountLabel(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const x = Math.round(Number(n));
  if (x >= 1_000_000) {
    const t = (x / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${t}M videos`;
  }
  if (x >= 1_000) {
    const t = (x / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${t}K videos`;
  }
  return `${x} videos`;
}

function pickChannelAvatarUrl(thumbnails) {
  if (!Array.isArray(thumbnails) || !thumbnails.length) return '';
  const byId = (id) => thumbnails.find((t) => t && t.id === id);
  const hit =
    byId('avatar_uncropped')
    || thumbnails.find((t) => t && String(t.id) === '7' && t.url)
    || [...thumbnails].reverse().find((t) => {
        const id = String(t.id || '');
        return (
          t.url
          && !id.includes('banner')
          && !id.includes('og')
        );
      });
  return hit?.url ? String(hit.url) : '';
}

/** YouTube 视频缩略图 CDN，易被误判成「头像」 */
function isYoutubeVideoStillUrl(url) {
  return /i\.ytimg\.com\/(?:vi|vi_webp)\//i.test(String(url || ''));
}

/**
 * 频道 Tab 的 JSON 里，playlist 层 thumbnails 才是频道头像；
 * 首条视频的 thumbnails 多为视频画面，不能优先使用。
 */
function resolveChannelAvatarUrl(playlistThumbnails, entryThumbnails) {
  const fromPl = pickChannelAvatarUrl(playlistThumbnails);
  const fromEn = pickChannelAvatarUrl(entryThumbnails);
  if (fromPl && !isYoutubeVideoStillUrl(fromPl)) return fromPl;
  if (fromEn && !isYoutubeVideoStillUrl(fromEn)) return fromEn;
  return fromPl || fromEn || '';
}

function mergeChannelJsonFromYtdlp(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('yt-dlp 返回数据无效');
  }
  const entries = raw.entries;
  if (!Array.isArray(entries)) {
    return raw;
  }
  if (entries.length === 0) {
    throw new Error(
      '该频道没有可读取的公开视频条目，请换用其它频道链接或稍后再试',
    );
  }
  const e0 = entries[0];
  return {
    ...e0,
    channel_url: String(
      raw.channel_url || e0.channel_url || e0.uploader_url || '',
    ),
    uploader_url: String(raw.uploader_url || e0.uploader_url || ''),
    uploader: String(e0.uploader || raw.channel || raw.title || ''),
    channel: String(e0.channel || raw.channel || ''),
    title: String(e0.title || raw.title || ''),
    channel_follower_count:
      raw.channel_follower_count ?? e0.channel_follower_count,
    playlist_count: raw.playlist_count ?? e0.playlist_count,
    description: String(
      (raw.description && String(raw.description).trim())
        || (e0.description && String(e0.description).trim())
        || '',
    ),
    thumbnails:
      Array.isArray(raw.thumbnails) && raw.thumbnails.length
        ? raw.thumbnails
        : (Array.isArray(e0.thumbnails) ? e0.thumbnails : []),
    uploader_id: String(e0.uploader_id || raw.uploader_id || ''),
    channel_id: e0.channel_id != null ? e0.channel_id : raw.channel_id,
  };
}

async function fetchYoutubeChannelMetaFromUrl(channelInputUrl) {
  const videosUrl = normalizeYoutubeChannelVideosUrl(channelInputUrl);
  if (!videosUrl) {
    throw new Error(
      '无效的频道链接，请使用 /@handle、/channel/UC…、/c/名称 等频道地址',
    );
  }
  // 全频道 --flat-playlist -J 会拉取/序列化整个列表，大频道极易超时；只取 1 条即可拿到 uploader、头像等
  const { stdout } = await runYtDlp(
    [
      videosUrl,
      '-J',
      '--skip-download',
      '--playlist-items',
      '1',
      '--socket-timeout',
      '30',
      '--retries',
      '2',
    ],
    { timeoutMs: 180_000 },
  );
  const rawParsed = JSON.parse(stdout);
  const data = mergeChannelJsonFromYtdlp(rawParsed);
  const playlistThumbs = Array.isArray(rawParsed.thumbnails)
    ? rawParsed.thumbnails
    : [];
  const e0 = Array.isArray(rawParsed.entries) ? rawParsed.entries[0] : null;
  const entryThumbs =
    e0 && Array.isArray(e0.thumbnails) ? e0.thumbnails : [];
  const channelUrl =
    String(data.channel_url || data.uploader_url || '')
      || videosUrl.replace(/\/videos\/?$/i, '');
  const nameRaw =
    String(data.uploader || data.channel || data.title || '').trim();
  const name = nameRaw
    .replace(/\s*-\s*Videos\s*$/i, '')
    .replace(/\s*-\s*Shorts\s*$/i, '')
    .trim()
    || 'Channel';
  let handle = String(data.uploader_id || '').trim();
  if (handle && !handle.startsWith('@')) {
    handle = `@${handle}`;
  }
  if (!handle || handle === '@channel') {
    const um = String(channelUrl).match(/youtube\.com\/@([^/?#]+)/i);
    if (um) handle = `@${um[1]}`;
  }
  if ((!handle || handle === '@channel') && data.channel_id) {
    handle = `@${String(data.channel_id)}`.slice(0, 80);
  }
  if (!handle) handle = '@channel';
  const avatarUrl = resolveChannelAvatarUrl(playlistThumbs, entryThumbs);
  const subscriberLabel = formatSubscriberLabel(data.channel_follower_count);
  const videoCountLabel = formatVideoCountLabel(data.playlist_count);
  const description = String(data.description || '').trim().slice(0, 2000);
  return {
    name: name.slice(0, 120),
    handle: handle.slice(0, 80),
    subscriberLabel: subscriberLabel.slice(0, 40),
    avatarUrl: avatarUrl.slice(0, 2048),
    channelUrl: channelUrl.slice(0, 2048),
    description,
    videoCountLabel: videoCountLabel.slice(0, 40),
  };
}

function formatForQuality(q) {
  switch (q) {
    case '2160':
      return 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best';
    case '1080':
      return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
    case '720':
      return 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
    default:
      return 'bv*+ba/b';
  }
}

function runYtDlp(args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('yt-dlp 超时'));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const msg = stderr.trim() || stdout.trim() || `退出码 ${code}`;
        reject(new Error(msg));
      }
    });
  });
}

/** 有 stdout 即视作成功，用于批量补元数据时部分 URL 失败仍解析其余行 */
function runYtDlpLenient(args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('yt-dlp 超时'));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdout.trim()) {
        resolve({ stdout, stderr });
        return;
      }
      const msg = stderr.trim() || stdout.trim() || `退出码 ${code}`;
      reject(new Error(msg));
    });
  });
}

function parseJsonLines(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * 限制并发、保持结果顺序与 items 一致
 * @template T,R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function asyncPool(items, limit, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function normalizeVideoEntry(raw) {
  const id = raw.id || raw.video_id || raw.url?.match(/[?&]v=([^&]+)/)?.[1];
  if (!id || String(id).length < 6) return null;
  const title = raw.title || raw.fulltitle || '（无标题）';
  const channel = raw.channel || raw.uploader || raw.playlist_uploader || '';
  const thumb =
    raw.thumbnail
    || (Array.isArray(raw.thumbnails) && raw.thumbnails.length
      ? raw.thumbnails[raw.thumbnails.length - 1].url
      : null);
  const duration = raw.duration;
  const url = raw.url || raw.webpage_url || `https://www.youtube.com/watch?v=${id}`;
  let uploadDate =
    typeof raw.upload_date === 'string' && /^\d{8}$/.test(raw.upload_date)
      ? raw.upload_date
      : null;
  if (
    !uploadDate
    && typeof raw.release_timestamp === 'number'
    && Number.isFinite(raw.release_timestamp)
  ) {
    const d = new Date(raw.release_timestamp * 1000);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    uploadDate = `${y}${mo}${day}`;
  }
  if (
    !uploadDate
    && typeof raw.release_date === 'string'
    && /^\d{8}$/.test(raw.release_date)
  ) {
    uploadDate = raw.release_date;
  }
  if (!uploadDate && typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)) {
    let ts = raw.timestamp;
    if (ts > 1e12) ts /= 1000;
    if (ts > 946684800 && ts < 4102444800) {
      const d = new Date(ts * 1000);
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      uploadDate = `${y}${mo}${day}`;
    }
  }
  const viewCount =
    typeof raw.view_count === 'number' && Number.isFinite(raw.view_count)
      ? raw.view_count
      : null;
  const channelThumb =
    typeof raw.channel_thumbnail === 'string' ? raw.channel_thumbnail : null;
  return {
    id: String(id),
    title,
    channel,
    thumbnail: thumb,
    duration: typeof duration === 'number' ? duration : null,
    url,
    upload_date: uploadDate,
    view_count: viewCount,
    channel_thumbnail: channelThumb,
  };
}

/**
 * 调用系统原生文件夹选择（需在运行后端的图形会话中；取消返回 null）
 * @param {string} [promptTitle] 对话框标题（默认：下载目录）
 */
async function pickFolderPathNative(
  promptTitle = '选择下载目录（YouTube Studio）',
) {
  const title = String(promptTitle || '选择下载目录（YouTube Studio）');
  const titleApple = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const titlePs = title.replace(/'/g, "''");

  if (process.platform === 'darwin') {
    const script = [
      'set theResult to ""',
      'try',
      `set theResult to POSIX path of (choose folder with prompt "${titleApple}")`,
      'end try',
      'theResult',
    ].join('\n');
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script], {
        maxBuffer: 4096,
      });
      const p = String(stdout || '').trim();
      return p || null;
    } catch (e) {
      if (e && e.code === 1) return null;
      throw e;
    }
  }

  if (process.platform === 'win32') {
    const ps =
      'Add-Type -AssemblyName System.Windows.Forms; '
      + '$f = New-Object System.Windows.Forms.FolderBrowserDialog; '
      + "$f.Description = '" + titlePs + "'; "
      + '$f.ShowNewFolderButton = $true; '
      + 'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) '
      + '{ Write-Output $f.SelectedPath }';
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-STA', '-Command', ps],
        { windowsHide: true, maxBuffer: 8192 },
      );
      const p = String(stdout || '').trim().replace(/\r/g, '');
      return p || null;
    } catch (e) {
      if (e && (e.code === 1 || e.code === '1')) return null;
      throw e;
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'zenity',
      ['--file-selection', '--directory', '--title', title],
      { maxBuffer: 4096 },
    );
    const p = String(stdout || '').trim();
    return p || null;
  } catch (e) {
    if (e && e.code === 1) return null;
  }

  try {
    const { stdout } = await execFileAsync(
      'kdialog',
      ['--getexistingdirectory', process.cwd(), '--title', title],
      { maxBuffer: 4096 },
    );
    const p = String(stdout || '').trim();
    return p || null;
  } catch (e2) {
    if (e2 && e2.code === 1) return null;
    throw new Error(
      '无法弹出文件夹选择：请安装 zenity 或 kdialog，或在图形桌面环境下运行后端',
    );
  }
}

function openDownloadDirInOsFileManager(ctx) {
  const dir = getDownloadDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      execFile(
        'explorer',
        [dir],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
    } else if (process.platform === 'darwin') {
      execFile('open', [dir], (err) => (err ? reject(err) : resolve()));
    } else {
      execFile('xdg-open', [dir], (err) => (err ? reject(err) : resolve()));
    }
  });
}

/**
 * 在系统文件管理器中定位到已下载文件（Windows 选中项、macOS Finder 显露）。
 * Linux：尝试 nautilus/dolphin --select，否则打开所在目录。
 */
function revealFileInOsFileManager(absFilePath) {
  const resolved = path.resolve(String(absFilePath || ''));
  if (!resolved) {
    return Promise.reject(new Error('路径无效'));
  }
  if (!fs.existsSync(resolved)) {
    return Promise.reject(new Error('文件不存在或已被移动'));
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return Promise.reject(new Error('无法访问文件'));
  }
  if (!st.isFile()) {
    return Promise.reject(new Error('路径不是文件'));
  }
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      execFile(
        'explorer.exe',
        [`/select,${resolved}`],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
    } else if (process.platform === 'darwin') {
      execFile('open', ['-R', resolved], (err) =>
        err ? reject(err) : resolve(),
      );
    } else {
      const dir = path.dirname(resolved);
      execFile(
        'nautilus',
        ['--select', resolved],
        { windowsHide: true },
        (err) => {
          if (!err) {
            resolve();
            return;
          }
          execFile(
            'dolphin',
            ['--select', resolved],
            { windowsHide: true },
            (err2) => {
              if (!err2) {
                resolve();
                return;
              }
              execFile('xdg-open', [dir], (err3) =>
                err3 ? reject(err3) : resolve(),
              );
            },
          );
        },
      );
    }
  });
}

app.post('/api/open-download-dir', async (req, res) => {
  try {
    const ctx = getContext(req.studioUser);
    await openDownloadDirInOsFileManager(ctx);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 在运行后端的电脑上弹出系统文件夹选择，并写入下载目录设置 */
app.post('/api/pick-download-dir', async (req, res) => {
  try {
    const ctx = getContext(req.studioUser);
    const picked = await pickFolderPathNative();
    if (!picked) {
      return res.json({ ok: false, cancelled: true });
    }
    const dirResult = validateDownloadDir(picked);
    if (!dirResult.ok) {
      return res.status(400).json({ error: dirResult.error });
    }
    fs.mkdirSync(dirResult.path, { recursive: true });
    ctx.activeDownloadDir = dirResult.path;
    saveStudioSettingsToDisk(ctx);
    revalidateDownloadDirAfterMutation(ctx);
    res.json({
      ok: true,
      downloadDir: getDownloadDir(ctx),
      downloadDirWarning: ctx.downloadDirWarning,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 仅弹出文件夹选择并返回路径，不修改默认下载目录（如 Tag 映射、设置页默认目录） */
app.post('/api/pick-folder-path', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawTitle =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : '';
    const picked = await pickFolderPathNative(
      rawTitle || '选择标签存放目录（YouTube Studio）',
    );
    if (!picked) {
      return res.json({ ok: false, cancelled: true });
    }
    const dirResult = validateDownloadDir(picked);
    if (!dirResult.ok) {
      return res.status(400).json({ error: dirResult.error });
    }
    fs.mkdirSync(dirResult.path, { recursive: true });
    res.json({ ok: true, path: dirResult.path });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const { stdout } = await runYtDlp(['--version'], { timeoutMs: 8000 });
    const sampleUser = sortedAllowedUsers()[0] || 'ss';
    const sampleCtx = getContext(sampleUser);
    res.json({
      ok: true,
      ytDlp: stdout.trim(),
      downloadDir: getDownloadDir(sampleCtx),
      binary: YT_DLP,
      usersRoot: USERS_ROOT,
      allowedUsers: sortedAllowedUsers(),
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: String(e.message || e),
      hint: '请安装 yt-dlp 并确保在 PATH 中，或设置环境变量 YT_DLP_PATH',
      allowedUsers: sortedAllowedUsers(),
    });
  }
});

function sanitizeYoutubeVideoId(raw) {
  const s = String(raw || '').trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(s)) return null;
  return s;
}

function getFeedVideoMetaCached(id) {
  const hit = feedVideoMetaCache.get(id);
  if (!hit) return undefined;
  if (Date.now() - hit.at > FEED_VIDEO_META_CACHE_TTL_MS) {
    feedVideoMetaCache.delete(id);
    return undefined;
  }
  return hit;
}

function setFeedVideoMetaCached(id, upload_date, duration) {
  feedVideoMetaCache.set(id, {
    at: Date.now(),
    upload_date: upload_date ?? null,
    duration: duration ?? null,
  });
}

/**
 * 异步补全首页视频上传日期等（主接口仍用 flat-playlist 保速度）
 * body: { ids: string[] }
 */
app.post('/api/videos/feed-meta', async (req, res) => {
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: 'ids 须为数组' });
  }
  const idList = [];
  const seen = new Set();
  for (const x of raw) {
    const id = sanitizeYoutubeVideoId(x);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    idList.push(id);
    if (idList.length >= FEED_VIDEO_META_MAX_IDS) break;
  }
  if (!idList.length) {
    return res.json({ items: [] });
  }

  const items = [];
  const toFetch = [];
  for (const id of idList) {
    const c = getFeedVideoMetaCached(id);
    if (c) {
      items.push({ id, upload_date: c.upload_date, duration: c.duration });
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length) {
    const fetched = await asyncPool(
      toFetch,
      FEED_VIDEO_META_PARALLEL,
      async (id) => {
        try {
          const { stdout } = await runYtDlpLenient(
            [
              `https://www.youtube.com/watch?v=${id}`,
              '--skip-download',
              '--dump-json',
              '--no-warnings',
              '--socket-timeout',
              '22',
              '--retries',
              '1',
            ],
            { timeoutMs: 35_000 },
          );
          const lines = parseJsonLines(stdout);
          const rawLast = lines.length ? lines[lines.length - 1] : null;
          const v = rawLast ? normalizeVideoEntry(rawLast) : null;
          if (v) {
            setFeedVideoMetaCached(id, v.upload_date, v.duration);
            return {
              id,
              upload_date: v.upload_date,
              duration: v.duration,
            };
          }
        } catch {
          /* 单条失败 */
        }
        setFeedVideoMetaCached(id, null, null);
        return { id, upload_date: null, duration: null };
      },
    );
    items.push(...fetched);
  }

  res.json({ items });
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) {
    return res.status(400).json({ error: '缺少查询参数 q' });
  }
  const sort = String(req.query.sort || 'activity');
  try {
    const spec =
      sort === 'recent' ? `ytsearchdate15:${q}` : `ytsearch15:${q}`;
    const { stdout } = await runYtDlp(
      [spec, '--skip-download', '--dump-json', '--no-playlist'],
      { timeoutMs: 180_000 },
    );
    const rows = parseJsonLines(stdout);
    let videos = rows.map(normalizeVideoEntry).filter(Boolean);
    if (sort === 'popular') {
      videos = [...videos].sort(
        (a, b) => (b.view_count ?? 0) - (a.view_count ?? 0),
      );
    }
    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/trending', async (_req, res) => {
  const url = 'https://www.youtube.com/feed/trending';
  try {
    const { stdout } = await runYtDlp(
      [
        url,
        '--flat-playlist',
        '--playlist-items',
        '1:18',
        '--skip-download',
        '--dump-json',
      ],
      { timeoutMs: 180_000 },
    );
    const rows = parseJsonLines(stdout);
    const videos = rows.map(normalizeVideoEntry).filter(Boolean);
    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/info', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url || !isAllowedYoutubeUrl(url)) {
    return res.status(400).json({ error: '无效或未允许的 YouTube 链接' });
  }
  try {
    const { stdout } = await runYtDlp(
      ['-J', '--skip-download', url],
      { timeoutMs: 120_000 },
    );
    const raw = JSON.parse(stdout);
    const video = normalizeVideoEntry(raw);
    if (!video) {
      return res.status(404).json({ error: '无法解析视频信息' });
    }
    res.json({
      video: {
        ...video,
        description: raw.description?.slice(0, 2000) || '',
        view_count: raw.view_count,
        webpage_url: raw.webpage_url || video.url,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function subscriptionMatchesVideoChannel(sub, raw) {
  const vChannel = String(raw.channel_url || raw.uploader_url || '').trim();
  const vBase = normalizeChannelBaseUrl(vChannel);
  const sBase = normalizeChannelBaseUrl(sub.channelUrl);
  if (vBase && sBase && vBase === sBase) return true;
  const vid = String(raw.channel_id || '').trim();
  if (vid) {
    const lid = vid.toLowerCase();
    if (String(sub.channelUrl || '').toLowerCase().includes(lid)) return true;
  }
  const up = String(raw.uploader_id || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  const h = String(sub.handle || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  return Boolean(up && h && up === h);
}

function pickOutputDirFromSubscriptionTags(ctx, tags) {
  const fallback = getDownloadDir(ctx);
  if (!Array.isArray(tags)) return { dir: fallback, mappedTag: null };
  for (const rawTag of tags) {
    const t = String(rawTag || '').trim();
    if (!t) continue;
    const want = t.toLowerCase();
    const row = ctx.tagMappings.find(
      (m) => String(m.tag || '').trim().toLowerCase() === want,
    );
    const p = row?.path != null ? String(row.path).trim() : '';
    if (p) return { dir: p, mappedTag: t };
  }
  return { dir: fallback, mappedTag: null };
}

/** 单行视频 URL → 匹配当前用户订阅频道 → 按标签映射建议保存目录（供下载页自动填入） */
app.post('/api/download/suggest-output', async (req, res) => {
  const ctx = getContext(req.studioUser);
  const url = String(req.body?.url || '').trim();
  if (!url || !isAllowedYoutubeUrl(url)) {
    return res.status(400).json({ error: '无效或未允许的 YouTube 链接' });
  }
  try {
    const { stdout } = await runYtDlp(
      ['-J', '--skip-download', '--no-playlist', url],
      { timeoutMs: 120_000 },
    );
    const raw = JSON.parse(stdout);
    if (!raw || typeof raw !== 'object') {
      return res.status(500).json({ error: 'yt-dlp 返回无效' });
    }
    if (raw._type === 'playlist') {
      return res.status(400).json({
        error:
          '请使用单个视频链接；若为播放列表请先打开某一期视频再复制地址',
      });
    }
    const sub = ctx.subscriptions.find((s) =>
      subscriptionMatchesVideoChannel(s, raw),
    );
    const defaultDir = getDownloadDir(ctx);
    if (!sub) {
      const ch = String(raw.channel || raw.uploader || '').trim() || null;
      return res.json({
        matched: false,
        outputDir: defaultDir,
        channelName: null,
        channelTitle: ch,
        tags: [],
        mappedTag: null,
        hint:
          '该视频频道不在当前「频道」订阅中，无法根据标签推断目录。可先添加订阅并设置标签与保存路径映射。',
      });
    }
    const { dir, mappedTag } = pickOutputDirFromSubscriptionTags(ctx, sub.tags);
    const hasMapping = Boolean(mappedTag);
    const tagList = sub.tags.length ? sub.tags.join('、') : '（无）';
    return res.json({
      matched: true,
      outputDir: dir,
      channelName: sub.name,
      channelTitle:
        String(raw.channel || raw.uploader || '').trim() || sub.name,
      tags: [...sub.tags],
      mappedTag: hasMapping ? mappedTag : null,
      hint: hasMapping
        ? `已识别订阅「${sub.name}」，标签「${mappedTag}」在系统设置中配置了保存目录，已填入下方路径。`
        : `已识别订阅「${sub.name}」标签：${tagList}；其中暂无在设置里配置路径的标签，仍使用默认下载目录。`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

async function fetchVideoTitle(url) {
  try {
    const { stdout } = await runYtDlp(
      [url, '--skip-download', '--print', '%(title)s', '--no-playlist'],
      { timeoutMs: 45_000 },
    );
    const t = stdout.trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 300);
  } catch {
    /* --print 在极旧 yt-dlp 上可能不可用 */
  }
  try {
    const { stdout } = await runYtDlp(
      ['-J', '--skip-download', '--no-playlist', url],
      { timeoutMs: 45_000 },
    );
    const raw = JSON.parse(stdout);
    const t = String(raw.title || '').trim();
    if (t) return t.slice(0, 300);
  } catch {
    /* ignore */
  }
  return null;
}

app.post('/api/download', (req, res) => {
  const ctx = getContext(req.studioUser);
  const url = String(req.body?.url || '').trim();
  const quality = String(req.body?.quality || 'best');
  if (!url || !isAllowedYoutubeUrl(url)) {
    return res.status(400).json({ error: '无效或未允许的 YouTube 链接' });
  }
  let outputDir = getDownloadDir(ctx);
  const outRaw = req.body?.outputDir;
  if (outRaw !== undefined && outRaw !== null && String(outRaw).trim()) {
    const dirResult = validateDownloadDir(String(outRaw).trim());
    if (!dirResult.ok) {
      return res.status(400).json({ error: dirResult.error });
    }
    fs.mkdirSync(dirResult.path, { recursive: true });
    outputDir = dirResult.path;
  }
  const fmt = formatForQuality(quality === 'best' ? 'best' : quality);
  let thumbnailFormat = null;
  const tfRaw = req.body?.thumbnailFormat;
  if (tfRaw === 'webp' || tfRaw === 'jpg') {
    thumbnailFormat = tfRaw;
  }
  const jobId = randomUUID();
  /** 先写入系统临时目录，完成后以视频标题迁入目标目录，避免并行任务与 junk 文件夹 */
  const stagingDir = path.join(tmpdir(), `youtube-studio-dl-${jobId}`);
  fs.mkdirSync(stagingDir, { recursive: true });
  const outTemplate = path.join(stagingDir, '%(title)s.%(ext)s');

  const job = {
    id: jobId,
    studioUser: req.studioUser,
    url,
    quality,
    outputDir,
    stagingDir,
    status: 'downloading',
    progress: '开始…',
    progressPercent: 0,
    speed: null,
    sizeHint: null,
    filePath: null,
    title: null,
    error: null,
    createdAt: Date.now(),
    _stderrTail: '',
  };
  jobs.set(jobId, job);

  void (async () => {
    const t = await fetchVideoTitle(url);
    const j = jobs.get(jobId);
    if (j && t) j.title = t;
  })();

  function ingestYtDlpStderr(chunk) {
    job._stderrTail = (job._stderrTail + chunk).slice(-20000);
    const tail = job._stderrTail;
    /** yt-dlp 进度行示例: [download]  45.2% of   12.34MiB at    1.00MiB/s ETA 00:05 */
    const dlMatches = [...tail.matchAll(/\[download\]\s+([\d.]+)\s*%/gi)];
    if (dlMatches.length) {
      const last = parseFloat(dlMatches[dlMatches.length - 1][1]);
      if (!Number.isNaN(last)) {
        job.progressPercent = Math.min(100, Math.max(0, last));
      }
    }
    const speedM = tail.match(/([\d.]+(?:MiB|KiB|GiB|B)\/s)/i);
    if (speedM) job.speed = speedM[1];
    const ofM =
      tail.match(
        /\[download\][^\n]*?([\d.]+)\s*%\s+of\s+~?\s*(\S+)/i,
      ) || tail.match(/(\d+\.?\d*)%\s+of\s+(\S+)/);
    if (ofM) job.sizeHint = `${ofM[1]}% of ${ofM[2]}`;
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.includes('[download]')) {
        job.progress = line.replace(/^\s*\[download\]\s*/i, '').trim().slice(0, 500);
        break;
      }
    }
    if (!job.progress || job.progress.length < 2) {
      if (chunk.includes('[Merger]') || chunk.includes('[ExtractAudio]')) {
        const lastLine = chunk.split(/\r?\n/).filter(Boolean).pop();
        if (lastLine) job.progress = lastLine.trim().slice(0, 500);
      }
    }
  }

  const ytdlpArgs = [
    '-o',
    outTemplate,
    '-f',
    fmt,
    '--no-playlist',
    '--newline',
  ];
  if (thumbnailFormat) {
    ytdlpArgs.push(
      '--write-thumbnail',
      '--convert-thumbnails',
      thumbnailFormat,
    );
  } else {
    /** 默认不写封面；覆盖用户本机 yt-dlp 配置里可能启用的 write/embed 缩略图 */
    ytdlpArgs.push('--no-write-thumbnail', '--no-embed-thumbnail');
  }
  if (process.platform === 'win32') {
    ytdlpArgs.push('--windows-filenames');
  }
  ytdlpArgs.push(url);

  const child = spawn(YT_DLP, ytdlpArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  child.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) job.progress = line.slice(0, 500);
  });
  child.stderr.on('data', (d) => {
    ingestYtDlpStderr(d.toString());
  });
  child.on('close', (code) => {
    if (code === 0) {
      job.status = 'complete';
      job.filePath = finalizeStagedYoutubeDownload(stagingDir, outputDir);
      job.progress = '完成';
      job.progressPercent = 100;
      job.speed = null;
      if (job.filePath && !job.title) {
        job.title = path.basename(job.filePath, path.extname(job.filePath));
      }
      if (!job.filePath) {
        job.status = 'error';
        job.error = '下载完成但未找到输出文件';
        job.progress = '失败';
      }
    } else {
      job.status = 'error';
      job.error = `yt-dlp 退出码 ${code}`;
      job.progress = '失败';
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = String(err.message || err);
    job.progress = '失败';
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  res.json({ jobId });
});

app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.studioUser !== req.studioUser) {
    return res.status(404).json({ error: '任务不存在' });
  }
  const { _stderrTail, stagingDir: _sd, studioUser: _su, ...rest } = job;
  res.json(rest);
});

app.post('/api/download/:jobId/reveal-in-folder', async (req, res) => {
  try {
    const job = jobs.get(req.params.jobId);
    if (!job || job.studioUser !== req.studioUser) {
      return res.status(404).json({ error: '任务不存在' });
    }
    if (job.status !== 'complete') {
      return res.status(400).json({ error: '仅已完成任务可在文件夹中显示' });
    }
    const fp = job.filePath && String(job.filePath).trim();
    if (!fp) {
      return res.status(400).json({ error: '无保存路径' });
    }
    await revealFileInOsFileManager(fp);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/downloads', (req, res) => {
  const list = [...jobs.values()]
    .filter((j) => j.studioUser === req.studioUser)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({
    jobs: list.map((j) => {
      const { _stderrTail, stagingDir: _sd, studioUser: _su, ...rest } = j;
      return rest;
    }),
  });
});

app.delete('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.studioUser !== req.studioUser) {
    return res.status(404).json({ error: '任务不存在' });
  }
  jobs.delete(req.params.jobId);
  res.json({ ok: true });
});

app.delete('/api/downloads', (req, res) => {
  for (const [id, j] of jobs) {
    if (j.studioUser === req.studioUser) jobs.delete(id);
  }
  res.json({ ok: true });
});

app.get('/api/download/:jobId/file', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (
    !job
    || job.studioUser !== req.studioUser
    || job.status !== 'complete'
    || !job.filePath
  ) {
    return res.status(404).json({ error: '文件未就绪' });
  }
  if (!fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: '文件已删除或移动' });
  }
  res.download(job.filePath, path.basename(job.filePath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });
});

function collectAvailableTags(ctx) {
  const hidden = new Set(ctx.hiddenTags);
  const set = new Set();
  ctx.tagMappings.forEach((m) => {
    const t = String(m.tag || '').trim();
    if (t) set.add(t);
  });
  ctx.subscriptions.forEach((c) => {
    (c.tags || []).forEach((raw) => {
      const t = String(raw || '').trim();
      if (t) set.add(t);
    });
  });
  return [...set]
    .filter((t) => !hidden.has(t))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function syncAccentsForVisibleTags(ctx) {
  let changed = false;
  for (const tag of collectAvailableTags(ctx)) {
    if (assignRandomAccentForTag(ctx, tag)) changed = true;
  }
  return changed;
}

function sanitizeSubscription(raw) {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((x) => String(x).slice(0, 48)).filter(Boolean).slice(0, 12)
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
    name: String(raw.name || 'Channel').slice(0, 120),
    handle: String(raw.handle || '@channel').slice(0, 80),
    subscriberLabel: String(raw.subscriberLabel || '—').slice(0, 40),
    avatarUrl: String(raw.avatarUrl || '').slice(0, 2048),
    tags,
    notificationsMuted: Boolean(raw.notificationsMuted),
    channelUrl: String(raw.channelUrl || '').slice(0, 2048),
    description: String(raw.description || '').slice(0, 2000),
    videoCountLabel: String(raw.videoCountLabel || '').slice(0, 40),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function invalidateRecentFeedCache(userId) {
  const prefix = `${String(userId)}\t`;
  for (const k of recentFeedCache.keys()) {
    if (k.startsWith(prefix)) recentFeedCache.delete(k);
  }
}

function saveSubscriptionsToDisk(ctx) {
  const p = userSubscriptionsPath(ctx.userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify(ctx.subscriptions, null, 2),
    'utf8',
  );
  invalidateRecentFeedCache(ctx.userId);
}

function loadSubscriptionsIntoContext(ctx) {
  const p = userSubscriptionsPath(ctx.userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) {
    ctx.subscriptions = [];
    saveSubscriptionsToDisk(ctx);
    return;
  }
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(arr)) {
      ctx.subscriptions = [];
    } else {
      ctx.subscriptions = arr.map(sanitizeSubscription);
    }
    saveSubscriptionsToDisk(ctx);
  } catch {
    ctx.subscriptions = [];
    saveSubscriptionsToDisk(ctx);
  }
}

function getContext(userId) {
  if (!userContexts.has(userId)) {
    const ctx = createFreshContext(userId);
    loadStudioIntoContext(ctx);
    loadSubscriptionsIntoContext(ctx);
    if (syncAccentsForVisibleTags(ctx)) saveStudioSettingsToDisk(ctx);
    userContexts.set(userId, ctx);
  }
  return userContexts.get(userId);
}

function ensureAllUsersInitialized() {
  migrateLegacyDataIfNeeded();
  for (const uid of ALLOWED_USERS) {
    fs.mkdirSync(userDir(uid), { recursive: true });
    getContext(uid);
  }
}

ensureAllUsersInitialized();

function purgeRecentFeedCacheForUser(userId) {
  const prefix = `${userId}\t`;
  for (const key of recentFeedCache.keys()) {
    if (key.startsWith(prefix)) recentFeedCache.delete(key);
  }
}

app.get('/api/studio-users', (_req, res) => {
  res.json({ users: sortedAllowedUsers() });
});

app.post('/api/studio-users', (req, res) => {
  const raw = normalizeStudioUserIdEntry(
    req.body?.userId ?? req.body?.id ?? '',
  );
  if (!raw) {
    return res.status(400).json({
      error: '用户 id 须为 1–32 位字母、数字、下划线或连字符',
    });
  }
  if (ALLOWED_USERS.has(raw)) {
    return res.status(409).json({ error: '该用户已存在' });
  }
  ALLOWED_USERS.add(raw);
  persistAllowedUsers();
  fs.mkdirSync(userDir(raw), { recursive: true });
  getContext(raw);
  res.json({ users: sortedAllowedUsers() });
});

app.delete('/api/studio-users/:userId', (req, res) => {
  const id = normalizeStudioUserIdEntry(req.params.userId || '');
  if (!id || !ALLOWED_USERS.has(id)) {
    return res.status(404).json({ error: '未找到该用户' });
  }
  if (ALLOWED_USERS.size <= 1) {
    return res.status(400).json({ error: '至少保留一个用户' });
  }
  ALLOWED_USERS.delete(id);
  persistAllowedUsers();
  userContexts.delete(id);
  for (const [jid, j] of jobs) {
    if (j.studioUser === id) jobs.delete(jid);
  }
  purgeRecentFeedCacheForUser(id);
  try {
    fs.rmSync(userDir(id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  res.json({ users: sortedAllowedUsers() });
});

app.get('/api/settings', (req, res) => {
  const ctx = getContext(req.studioUser);
  res.json({
    downloadDir: getDownloadDir(ctx),
    tagMappings: ctx.tagMappings,
    availableTags: collectAvailableTags(ctx),
    tagAccentByLabel: ctx.tagAccentByLabel,
    studioUser: ctx.userId,
    ...(ctx.downloadDirWarning
      ? { downloadDirWarning: ctx.downloadDirWarning }
      : {}),
  });
});

app.post('/api/settings', (req, res) => {
  const ctx = getContext(req.studioUser);
  const body = req.body || {};
  const dirResult = validateDownloadDir(
    body.downloadDir ?? getDownloadDir(ctx),
  );
  if (!dirResult.ok) {
    return res.status(400).json({ error: dirResult.error });
  }
  try {
    const nextMappings = sanitizeTagMappings(
      body.tagMappings ?? ctx.tagMappings,
    );
    fs.mkdirSync(dirResult.path, { recursive: true });
    ctx.activeDownloadDir = dirResult.path;
    ctx.tagMappings = nextMappings;
    if (Array.isArray(body.hiddenTags)) {
      ctx.hiddenTags = sanitizeHiddenTags(body.hiddenTags);
    }
    syncAccentsForVisibleTags(ctx);
    saveStudioSettingsToDisk(ctx);
    revalidateDownloadDirAfterMutation(ctx);
    res.json({
      downloadDir: getDownloadDir(ctx),
      tagMappings: ctx.tagMappings,
      availableTags: collectAvailableTags(ctx),
      tagAccentByLabel: ctx.tagAccentByLabel,
      ...(ctx.downloadDirWarning
        ? { downloadDirWarning: ctx.downloadDirWarning }
        : {}),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/tags/remove', (req, res) => {
  const ctx = getContext(req.studioUser);
  const tag = String(req.body?.tag || '').trim().slice(0, 64);
  if (!tag) {
    return res.status(400).json({ error: '缺少 tag' });
  }
  try {
    if (!ctx.hiddenTags.includes(tag)) {
      ctx.hiddenTags.push(tag);
    }
    ctx.hiddenTags = sanitizeHiddenTags(ctx.hiddenTags);
    delete ctx.tagAccentByLabel[tag];
    let subChanged = false;
    ctx.subscriptions = ctx.subscriptions.map((c) => {
      const before = (c.tags || []).length;
      const nextTags = (c.tags || []).filter(
        (x) => String(x || '').trim() !== tag,
      );
      if (nextTags.length !== before) subChanged = true;
      return { ...c, tags: nextTags };
    });
    if (subChanged) saveSubscriptionsToDisk(ctx);
    ctx.tagMappings = ctx.tagMappings.filter(
      (m) => String(m.tag || '').trim() !== tag,
    );
    saveStudioSettingsToDisk(ctx);
    res.json({
      ok: true,
      availableTags: collectAvailableTags(ctx),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/subscriptions', (req, res) => {
  const ctx = getContext(req.studioUser);
  const sort = String(req.query.sort || 'updated');
  const filterQ = String(req.query.filter || '')
    .trim()
    .toLowerCase();
  let list = [...ctx.subscriptions];
  if (filterQ) {
    list = list.filter((c) => {
      const hay = [
        c.name,
        c.handle,
        c.description,
        ...(c.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(filterQ);
    });
  }
  if (sort === 'name') {
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else {
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  res.json({ channels: list });
});

function orderedHomeFeedChannels(ctx) {
  return [...ctx.subscriptions]
    .filter((c) => !c.notificationsMuted)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function subscriptionToFeedSectionShell(ch) {
  return {
    subscriptionId: ch.id,
    channelName: ch.name,
    handle: ch.handle,
    channelUrl: String(ch.channelUrl || '').trim(),
    avatarUrl: ch.avatarUrl || '',
    tags: Array.isArray(ch.tags) ? [...ch.tags] : [],
    videos: [],
  };
}

function recentFeedCacheKey(userId, ordered, per, sortMode) {
  const sig = ordered
    .map(
      (c) =>
        `${c.id}:${Number(c.updatedAt) || 0}:${c.notificationsMuted ? 1 : 0}`,
    )
    .join(',');
  return `${userId}\t${per}\t${sortMode}\t${sig}`;
}

/**
 * 首页 feed 仅频道元数据（无 yt-dlp），用于尽快展示订阅分区与标签
 */
app.get('/api/subscriptions/feed-shell', (req, res) => {
  const ctx = getContext(req.studioUser);
  const ordered = orderedHomeFeedChannels(ctx);
  res.json({
    sections: ordered.map((ch) => subscriptionToFeedSectionShell(ch)),
  });
});

/**
 * 每个已订阅频道取视频 Tab 前 N 条（频道间并行）
 * sort=recent（默认）：频道 /videos 默认顺序（通常为最新）；--flat-playlist，较快。
 * sort=views：/videos?sort=p（YouTube「热门」），与 recent 不是同一列表；无 flat，便于观看数字段。
 * 已在 Channels 页关闭通知的频道不返回（首页不展示）。
 */
app.get('/api/subscriptions/recent-videos', async (req, res) => {
  const ctx = getContext(req.studioUser);
  const rawPer = parseInt(String(req.query.perChannel || '3'), 10);
  const per = Number.isFinite(rawPer)
    ? Math.min(10, Math.max(1, rawPer))
    : 3;
  const sortMode = String(req.query.sort || 'recent').toLowerCase();
  const useFlatPlaylist = sortMode !== 'views';
  const ordered = orderedHomeFeedChannels(ctx);

  if (RECENT_FEED_CACHE_TTL_MS > 0) {
    const ckey = recentFeedCacheKey(req.studioUser, ordered, per, sortMode);
    const hit = recentFeedCache.get(ckey);
    const now = Date.now();
    if (hit && now - hit.at < RECENT_FEED_CACHE_TTL_MS) {
      return res.json(hit.body);
    }
  }

  const sections = await asyncPool(ordered, RECENT_FEED_PARALLEL, async (ch) => {
    const videosUrl = subscriptionChannelToVideosUrl(ch, sortMode);
    if (!videosUrl) {
      return {
        subscriptionId: ch.id,
        channelName: ch.name,
        handle: ch.handle,
        channelUrl: String(ch.channelUrl || '').trim(),
        avatarUrl: ch.avatarUrl || '',
        tags: Array.isArray(ch.tags) ? [...ch.tags] : [],
        videos: [],
        error: '缺少频道主页链接，请在订阅中补全频道 URL',
      };
    }
    try {
      const baseArgs = [
        videosUrl,
        '--playlist-items',
        `1:${per}`,
        ...(useFlatPlaylist
          ? [
            /** 仅解析播放列表条目；views 模式去掉以拿到播放量等全量字段 */
            '--flat-playlist',
          ]
          : []),
        '--dump-json',
        '--skip-download',
        '--socket-timeout',
        '30',
        '--retries',
        '2',
      ];
      const { stdout } = await runYtDlp(baseArgs, { timeoutMs: 120_000 });
      const vids = parseJsonLines(stdout)
        .map(normalizeVideoEntry)
        .filter(Boolean)
        .map((v) => ({
          ...v,
          channel: ch.name || v.channel,
          channel_thumbnail: ch.avatarUrl || v.channel_thumbnail,
        }));
      return {
        subscriptionId: ch.id,
        channelName: ch.name,
        handle: ch.handle,
        channelUrl: String(ch.channelUrl || '').trim(),
        avatarUrl: ch.avatarUrl || '',
        tags: Array.isArray(ch.tags) ? [...ch.tags] : [],
        videos: vids,
      };
    } catch (e) {
      return {
        subscriptionId: ch.id,
        channelName: ch.name,
        handle: ch.handle,
        channelUrl: String(ch.channelUrl || '').trim(),
        avatarUrl: ch.avatarUrl || '',
        tags: Array.isArray(ch.tags) ? [...ch.tags] : [],
        videos: [],
        error: String(e.message || e).slice(0, 240),
      };
    }
  });

  const payload = { sections };
  if (RECENT_FEED_CACHE_TTL_MS > 0) {
    const key = recentFeedCacheKey(req.studioUser, ordered, per, sortMode);
    recentFeedCache.set(key, { at: Date.now(), body: payload });
  }
  res.json(payload);
});

app.post('/api/subscriptions', async (req, res) => {
  const ctx = getContext(req.studioUser);
  const body = req.body || {};
  const urlOnly =
    String(body.channelUrl || '').trim()
    && !String(body.name || '').trim()
    && !String(body.handle || '').trim();

  if (urlOnly) {
    try {
      const meta = await fetchYoutubeChannelMetaFromUrl(body.channelUrl);
      const base = normalizeChannelBaseUrl(meta.channelUrl);
      const dupe =
        base
        && ctx.subscriptions.some(
          (s) => normalizeChannelBaseUrl(s.channelUrl) === base,
        );
      if (dupe) {
        return res.status(409).json({ error: '该频道已在订阅列表中' });
      }
      const ch = sanitizeSubscription({
        ...meta,
        tags: Array.isArray(body.tags) ? body.tags : [],
        notificationsMuted: Boolean(body.notificationsMuted),
        id: randomUUID(),
        updatedAt: Date.now(),
      });
      ctx.subscriptions.push(ch);
      saveSubscriptionsToDisk(ctx);
      if (syncAccentsForVisibleTags(ctx)) saveStudioSettingsToDisk(ctx);
      return res.json(ch);
    } catch (e) {
      return res.status(400).json({
        error: String(e.message || e).slice(0, 500),
      });
    }
  }

  if (!body.name && !body.handle) {
    return res.status(400).json({
      error: '需要粘贴频道 URL，或填写 name / handle',
    });
  }
  const ch = sanitizeSubscription({
    ...body,
    id: randomUUID(),
    updatedAt: Date.now(),
  });
  ctx.subscriptions.push(ch);
  saveSubscriptionsToDisk(ctx);
  if (syncAccentsForVisibleTags(ctx)) saveStudioSettingsToDisk(ctx);
  res.json(ch);
});

app.patch('/api/subscriptions/:id', (req, res) => {
  const ctx = getContext(req.studioUser);
  const i = ctx.subscriptions.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: '未找到' });
  const body = req.body || {};
  const cur = { ...ctx.subscriptions[i] };
  const keys = [
    'name',
    'handle',
    'subscriberLabel',
    'avatarUrl',
    'channelUrl',
    'description',
    'videoCountLabel',
    'notificationsMuted',
    'tags',
  ];
  for (const k of keys) {
    if (body[k] !== undefined) cur[k] = body[k];
  }
  cur.updatedAt = Date.now();
  const next = sanitizeSubscription({ ...cur, id: ctx.subscriptions[i].id });
  ctx.subscriptions[i] = next;
  saveSubscriptionsToDisk(ctx);
  if (syncAccentsForVisibleTags(ctx)) saveStudioSettingsToDisk(ctx);
  res.json(next);
});

app.delete('/api/subscriptions/:id', (req, res) => {
  const ctx = getContext(req.studioUser);
  const i = ctx.subscriptions.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: '未找到' });
  ctx.subscriptions.splice(i, 1);
  saveSubscriptionsToDisk(ctx);
  if (syncAccentsForVisibleTags(ctx)) saveStudioSettingsToDisk(ctx);
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
  console.log(`用户数据: ${USERS_ROOT}  账号: ${sortedAllowedUsers().join(', ')}`);
});
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[server] 端口 ${PORT} 已被占用。可执行: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`,
    );
    console.error(
      `[server] 结束进程: kill <PID>，或换端口: PORT=8788 npm run dev`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
