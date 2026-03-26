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
const DEFAULT_DOWNLOAD_DIR = path.join(ROOT, 'data', 'downloads');
const SETTINGS_PATH = path.join(ROOT, 'data', 'studio-settings.json');
const SUBSCRIPTIONS_PATH = path.join(ROOT, 'data', 'subscriptions.json');

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
      parseInt(String(process.env.RECENT_FEED_PARALLEL || '4'), 10) || 4,
    ),
  );
const ENV_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
  ? path.resolve(process.env.DOWNLOAD_DIR)
  : DEFAULT_DOWNLOAD_DIR;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

let activeDownloadDir = ENV_DOWNLOAD_DIR;

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

/** @type {Array<{ id: string, tag: string, path: string, dot: string }>} */
let tagMappings = defaultTagMappings();

/** 从标签列表中隐藏（含系统预设）；由 POST /api/tags/remove 写入 */
let hiddenTags = [];

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

/** @type {Record<string, string>} */
let tagAccentByLabel = {};

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

function assignRandomAccentForTag(label) {
  const t = String(label || '').trim().slice(0, 64);
  if (!t || Object.prototype.hasOwnProperty.call(tagAccentByLabel, t)) {
    return false;
  }
  tagAccentByLabel[t] =
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

function saveStudioSettingsToDisk() {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(
    SETTINGS_PATH,
    JSON.stringify(
      {
        downloadDir: activeDownloadDir,
        tagMappings,
        hiddenTags,
        tagAccentByLabel,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function loadStudioSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH)) {
    activeDownloadDir = ENV_DOWNLOAD_DIR;
    tagMappings = defaultTagMappings();
    saveStudioSettingsToDisk();
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      activeDownloadDir = path.resolve(
        typeof raw.downloadDir === 'string' && raw.downloadDir.trim()
          ? raw.downloadDir
          : ENV_DOWNLOAD_DIR,
      );
      tagMappings = sanitizeTagMappings(raw.tagMappings);
      hiddenTags = sanitizeHiddenTags(raw.hiddenTags);
      tagAccentByLabel = sanitizeTagAccents(raw.tagAccentByLabel);
    } catch {
      activeDownloadDir = ENV_DOWNLOAD_DIR;
      tagMappings = defaultTagMappings();
      hiddenTags = [];
      tagAccentByLabel = {};
      saveStudioSettingsToDisk();
    }
  }
  fs.mkdirSync(activeDownloadDir, { recursive: true });
}

function validateDownloadDir(dir) {
  const s = String(dir || '').trim();
  if (!s || s.length > 4096 || s.includes('\0')) {
    return { ok: false, error: '无效的目录路径' };
  }
  const resolved = path.resolve(s);
  return { ok: true, path: resolved };
}

loadStudioSettings();

function getDownloadDir() {
  return activeDownloadDir;
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

/**
 * 在独立 staging 目录下载完成后，将主媒体文件移到 outputDir，文件名为视频标题（与重名处理）。
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

function openDownloadDirInOsFileManager() {
  const dir = getDownloadDir();
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

app.post('/api/open-download-dir', async (_req, res) => {
  try {
    await openDownloadDirInOsFileManager();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 在运行后端的电脑上弹出系统文件夹选择，并写入下载目录设置 */
app.post('/api/pick-download-dir', async (_req, res) => {
  try {
    const picked = await pickFolderPathNative();
    if (!picked) {
      return res.json({ ok: false, cancelled: true });
    }
    const dirResult = validateDownloadDir(picked);
    if (!dirResult.ok) {
      return res.status(400).json({ error: dirResult.error });
    }
    fs.mkdirSync(dirResult.path, { recursive: true });
    activeDownloadDir = dirResult.path;
    saveStudioSettingsToDisk();
    res.json({ ok: true, downloadDir: getDownloadDir() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 仅弹出文件夹选择并返回路径，不修改默认下载目录（如 Tag 映射） */
app.post('/api/pick-folder-path', async (_req, res) => {
  try {
    const picked = await pickFolderPathNative(
      '选择标签存放目录（YouTube Studio）',
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
    res.json({
      ok: true,
      ytDlp: stdout.trim(),
      downloadDir: getDownloadDir(),
      binary: YT_DLP,
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: String(e.message || e),
      hint: '请安装 yt-dlp 并确保在 PATH 中，或设置环境变量 YT_DLP_PATH',
    });
  }
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
  const url = String(req.body?.url || '').trim();
  const quality = String(req.body?.quality || 'best');
  if (!url || !isAllowedYoutubeUrl(url)) {
    return res.status(400).json({ error: '无效或未允许的 YouTube 链接' });
  }
  let outputDir = getDownloadDir();
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
  const jobId = randomUUID();
  /** 先写入系统临时目录，完成后以视频标题迁入目标目录，避免并行任务与 junk 文件夹 */
  const stagingDir = path.join(tmpdir(), `youtube-studio-dl-${jobId}`);
  fs.mkdirSync(stagingDir, { recursive: true });
  const outTemplate = path.join(stagingDir, '%(title)s.%(ext)s');

  const job = {
    id: jobId,
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
  if (!job) return res.status(404).json({ error: '任务不存在' });
  const { _stderrTail, stagingDir: _sd, ...rest } = job;
  res.json(rest);
});

app.get('/api/downloads', (_req, res) => {
  const list = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json({
    jobs: list.map((j) => {
      const { _stderrTail, stagingDir: _sd, ...rest } = j;
      return rest;
    }),
  });
});

app.delete('/api/download/:jobId', (req, res) => {
  if (!jobs.has(req.params.jobId)) {
    return res.status(404).json({ error: '任务不存在' });
  }
  jobs.delete(req.params.jobId);
  res.json({ ok: true });
});

app.delete('/api/downloads', (_req, res) => {
  jobs.clear();
  res.json({ ok: true });
});

app.get('/api/download/:jobId/file', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== 'complete' || !job.filePath) {
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

/** 与 client/src/lib/studioTags.ts 中 FALLBACK_STUDIO_TAGS 保持一致 */
const SIDEBAR_PRESET_TAGS = [
  'Tech',
  'Music',
  'Tutorials',
  'Cinema',
  'Gaming',
];

function collectAvailableTags() {
  const hidden = new Set(hiddenTags);
  const set = new Set(SIDEBAR_PRESET_TAGS);
  tagMappings.forEach((m) => {
    const t = String(m.tag || '').trim();
    if (t) set.add(t);
  });
  subscriptions.forEach((c) => {
    (c.tags || []).forEach((raw) => {
      const t = String(raw || '').trim();
      if (t) set.add(t);
    });
  });
  return [...set]
    .filter((t) => !hidden.has(t))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function syncAccentsForVisibleTags() {
  let changed = false;
  for (const tag of collectAvailableTags()) {
    if (assignRandomAccentForTag(tag)) changed = true;
  }
  return changed;
}

app.get('/api/settings', (_req, res) => {
  res.json({
    downloadDir: getDownloadDir(),
    tagMappings,
    availableTags: collectAvailableTags(),
    tagAccentByLabel,
  });
});

app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  const dirResult = validateDownloadDir(body.downloadDir ?? getDownloadDir());
  if (!dirResult.ok) {
    return res.status(400).json({ error: dirResult.error });
  }
  try {
    const nextMappings = sanitizeTagMappings(body.tagMappings ?? tagMappings);
    fs.mkdirSync(dirResult.path, { recursive: true });
    activeDownloadDir = dirResult.path;
    tagMappings = nextMappings;
    if (Array.isArray(body.hiddenTags)) {
      hiddenTags = sanitizeHiddenTags(body.hiddenTags);
    }
    syncAccentsForVisibleTags();
    saveStudioSettingsToDisk();
    res.json({
      downloadDir: getDownloadDir(),
      tagMappings,
      availableTags: collectAvailableTags(),
      tagAccentByLabel,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/tags/remove', (req, res) => {
  const tag = String(req.body?.tag || '').trim().slice(0, 64);
  if (!tag) {
    return res.status(400).json({ error: '缺少 tag' });
  }
  try {
    if (!hiddenTags.includes(tag)) {
      hiddenTags.push(tag);
    }
    hiddenTags = sanitizeHiddenTags(hiddenTags);
    delete tagAccentByLabel[tag];
    let subChanged = false;
    subscriptions = subscriptions.map((c) => {
      const before = (c.tags || []).length;
      const nextTags = (c.tags || []).filter(
        (x) => String(x || '').trim() !== tag,
      );
      if (nextTags.length !== before) subChanged = true;
      return { ...c, tags: nextTags };
    });
    if (subChanged) saveSubscriptionsToDisk();
    const beforeMap = tagMappings.length;
    tagMappings = tagMappings.filter(
      (m) => String(m.tag || '').trim() !== tag,
    );
    if (tagMappings.length !== beforeMap) {
      /* 已允许空映射 */
    }
    saveStudioSettingsToDisk();
    res.json({
      ok: true,
      availableTags: collectAvailableTags(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function defaultSubscriptions() {
  const t = Date.now();
  return [
    {
      id: randomUUID(),
      name: 'CineFlow Studios',
      handle: '@cineflow_hq',
      subscriberLabel: '1.2M subs',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDHsLnIyYQQToH4ibSQzXZSy_NZ9ftZ35n6RHac_CP0YncazmEMrKxfMGnkApUZkIMQTtDTOOHYKGvETmyD5fh2GYF7QkFRzb2ds3ubGGiRELPhiKJtubWd2JsU2BkFRX5LgRTo3KX2CvUARn4ptFUPQoMjZZyysK6Hpw3QXdhmoqLlZZZYVgi09V-l_1C7PS647FXzLlTj5EIygh5f6aCZJfFxTMOA11d6CYsnQTgO9GkLr41CsWWKBaxq9lXOkD6qXJiqOrwjgy2m',
      tags: ['4K RAW', 'Post-Prod', 'Weekly'],
      notificationsMuted: true,
      channelUrl: '',
      updatedAt: t,
    },
    {
      id: randomUUID(),
      name: 'Vibrant Pixels',
      handle: '@vpx_art',
      subscriberLabel: '450K subs',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBkISh2vnZbZk1B1jpCnz9_X1XXPNE_8dy5l7J3C7UBzAoiEvl711FnKG3PpBrBtNq0__FWuHWlq0MeaUKlR6WfZmeaA0z8-AIYfD93kMF2oDQdXO4sjW3XlAk2WkQVUI0I2sAd1pTs9tAL1Vw961p7ooCTQaBmZFfyoRcEagfjpA6dm01n43Fr33-lnAVCO2Nm01eNWU5Fd1m13ZXgV8a9a-FGAROlihLPjhjiNbovSUn0qpuZDzGJCKrVeNXaQXNFYzftGRQOOzxc',
      tags: ['Visual Effects', 'Inspiration'],
      notificationsMuted: false,
      channelUrl: '',
      updatedAt: t - 1000,
    },
    {
      id: randomUUID(),
      name: 'TechNoir Review',
      handle: '@technoir_labs',
      subscriberLabel: '2.8M subs',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCxLC4I19aW241_pl4HGKLsD_HvAIKNmtYPJBiscFYS5EELKPfabAl7o5RyRMy5obSufPuhQyrqBGLeiD7MFn3p7fQrChZfRSdiEe7w1a6mRofzam4_hDs_2Xmdp4G40CjtGpKtPnj-Tro9reM136qzR69zvixYpl3_ofEMlViU1NG--MfnaJthnVpMxLK8ql2qpxiMG22kyZwunArW19e-RlvVW74owrqqOoOwg5QbO2QHwS9uQ7CvHfy4sH2pDL6jdAhgssDDFEKN',
      tags: ['Gear', 'Hardware'],
      notificationsMuted: true,
      channelUrl: '',
      updatedAt: t - 2000,
    },
    {
      id: randomUUID(),
      name: 'Soundscapes',
      handle: '@audio_scapes',
      subscriberLabel: '180K subs',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDyG1lnr5zYUffIEDhgr7RYXFTgFUYNnixU83iDqRQTXJFVz7DZPhMz3KiBOnTE6nGM_W72wPba0IE00pbgvTPVBqNwmQqiD568e4fH2C5TVvU_K5wAFNcpm-Hh0Y0vyDN8vjfc0bqLZZG-EwhAb9Id0KZvYaxh-ATsuZe8fC4LzY_OZFNLBIYcWEfHJICnkQFZRJErTaTxCi01xAMQH1H3B9db6GWWv8DcX_IQ-9b9ycBb-xGJ2U0Vz-wNE8Tasne5BS-E9xqsdkDY',
      tags: ['Audio', 'Sound Design'],
      notificationsMuted: false,
      channelUrl: '',
      updatedAt: t - 3000,
    },
  ];
}

/** @type {Array<Record<string, unknown>>} */
let subscriptions = [];

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

function saveSubscriptionsToDisk() {
  fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true });
  fs.writeFileSync(
    SUBSCRIPTIONS_PATH,
    JSON.stringify(subscriptions, null, 2),
    'utf8',
  );
}

function loadSubscriptions() {
  fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true });
  if (!fs.existsSync(SUBSCRIPTIONS_PATH)) {
    subscriptions = defaultSubscriptions();
    saveSubscriptionsToDisk();
    return;
  }
  try {
    const arr = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf8'));
    if (!Array.isArray(arr) || arr.length === 0) {
      subscriptions = defaultSubscriptions();
      saveSubscriptionsToDisk();
      return;
    }
    subscriptions = arr.map(sanitizeSubscription);
    saveSubscriptionsToDisk();
  } catch {
    subscriptions = defaultSubscriptions();
    saveSubscriptionsToDisk();
  }
}

loadSubscriptions();

if (syncAccentsForVisibleTags()) {
  saveStudioSettingsToDisk();
}

app.get('/api/subscriptions', (req, res) => {
  const sort = String(req.query.sort || 'updated');
  const filterQ = String(req.query.filter || '')
    .trim()
    .toLowerCase();
  let list = [...subscriptions];
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

/**
 * 每个已订阅频道取视频 Tab 前 N 条（频道间并行）
 * sort=recent（默认）：频道 /videos 默认顺序（通常为最新）；--flat-playlist，较快。
 * sort=views：/videos?sort=p（YouTube「热门」），与 recent 不是同一列表；无 flat，便于观看数字段。
 * 已在 Channels 页关闭通知的频道不返回（首页不展示）。
 */
app.get('/api/subscriptions/recent-videos', async (_req, res) => {
  const rawPer = parseInt(String(_req.query.perChannel || '3'), 10);
  const per = Number.isFinite(rawPer)
    ? Math.min(10, Math.max(1, rawPer))
    : 3;
  const sortMode = String(_req.query.sort || 'recent').toLowerCase();
  const useFlatPlaylist = sortMode !== 'views';
  const ordered = [...subscriptions]
    .filter((c) => !c.notificationsMuted)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

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

  res.json({ sections });
});

app.post('/api/subscriptions', async (req, res) => {
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
        && subscriptions.some(
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
      subscriptions.push(ch);
      saveSubscriptionsToDisk();
      if (syncAccentsForVisibleTags()) saveStudioSettingsToDisk();
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
  subscriptions.push(ch);
  saveSubscriptionsToDisk();
  if (syncAccentsForVisibleTags()) saveStudioSettingsToDisk();
  res.json(ch);
});

app.patch('/api/subscriptions/:id', (req, res) => {
  const i = subscriptions.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: '未找到' });
  const body = req.body || {};
  const cur = { ...subscriptions[i] };
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
  const next = sanitizeSubscription({ ...cur, id: subscriptions[i].id });
  subscriptions[i] = next;
  saveSubscriptionsToDisk();
  if (syncAccentsForVisibleTags()) saveStudioSettingsToDisk();
  res.json(next);
});

app.delete('/api/subscriptions/:id', (req, res) => {
  const i = subscriptions.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: '未找到' });
  subscriptions.splice(i, 1);
  saveSubscriptionsToDisk();
  if (syncAccentsForVisibleTags()) saveStudioSettingsToDisk();
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
  console.log(`下载目录: ${getDownloadDir()}`);
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
