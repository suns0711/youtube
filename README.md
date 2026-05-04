# YouTube Studio · 浏览与下载

基于 **React** 的前端与 **Express** 后端，通过本机安装的 **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** 搜索/读取元数据并下载 YouTube 视频。界面风格对齐仓库内 `prototype/` 中的深色原型。

## 前置要求

- Node.js 18+
- 已安装 `yt-dlp` 并在终端可执行（macOS 示例：`brew install yt-dlp`）

## 开发

在项目根目录：

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>（Vite 将 `/api` 代理到后端）
- 后端 API：<http://localhost:8787>

## 生产构建（仅前端静态资源）

```bash
npm run build
```

产物在 `client/dist/`。生产环境可让任意静态服务器托管该目录，并将 `/api` 反向代理到 Node 服务；或自行在 `server` 中挂载静态目录（当前仓库未内置，避免与未知 API 路径冲突）。

## 数据与初始化

`data/` 目录用于存储用户数据（订阅、设置、下载文件等），**默认已加入 `.gitignore`**，不会随代码提交。

首次启动时，服务端会自动初始化以下内容：

| 目录/文件 | 说明 |
|-----------|------|
| `data/downloads/` | 下载文件存放目录（需保留 `.gitkeep`） |
| `data/studio-users.json` | 用户列表（默认创建 `ss`, `yb` 两个用户） |
| `data/users/<userId>/subscriptions.json` | 各用户的订阅频道数据 |
| `data/users/<userId>/studio-settings.json` | 各用户的个人设置 |

如需重置数据，删除 `data/` 目录后重新运行即可自动重建。

## 环境变量（服务端）

| 变量 | 说明 |
|------|------|
| `YT_DLP_PATH` | `yt-dlp` 可执行文件路径；未设置时从 `PATH` 查找 |
| `DOWNLOAD_DIR` | 下载保存目录；默认 `<项目根>/data/downloads` |
| `PORT` | API 端口；默认 `8787` |

## 功能说明

- **资料库**：关键词搜索（`ytsearch`），卡片网格预览，弹层内嵌播放器 + 详情（`yt-dlp -J`）
- **Subscriptions**（对齐 `prototype/subscriptions_management`）：频道卡片、标签、通知开关、筛选/排序、添加频道；数据持久化在 `data/subscriptions.json`（首次内置 4 条示例）
- **Tags**：快捷标签入口，跳转到资料库搜索
- **下载**：提交链接与画质，后台 `yt-dlp` 下载到服务端配置的目录（见系统设置）；队列中可查看进度
- **系统设置**（对齐 `prototype/system_settings`）：默认下载目录、标签到文件夹映射、底部浮动条「Discard / Apply Changes」；配置持久化到 `data/studio-settings.json`，应用后新的下载任务使用该目录（环境变量 `DOWNLOAD_DIR` 仅作首次默认）

### API（设置）

- `GET /api/settings` — 当前 `downloadDir` 与 `tagMappings`
- `POST /api/settings` — 保存同上字段（`tagMappings` 为 `{ id, tag, path, dot }[]`，`dot` 为 `primary` | `tertiary`）

### API（订阅频道）

- `GET /api/subscriptions?sort=updated|name&filter=` — 列表（`filter` 对名称 / handle / 标签子串匹配）
- `POST /api/subscriptions` — 新增频道（`name`、`handle`、`subscriberLabel`、`avatarUrl`、`tags[]`、`channelUrl` 等）
- `PATCH /api/subscriptions/:id` — 更新字段（如 `tags`、`notificationsMuted`）
- `DELETE /api/subscriptions/:id` — 删除

旧路径 `/trending` 会重定向到 `/subscriptions`。服务端仍保留 `GET /api/trending`（未在导航中暴露）。

## 多用户支持

系统支持多个独立用户，每个用户有自己独立的订阅、设置和下载目录。

### 用户管理

- 用户 ID 通过 HTTP Header `X-Studio-User` 传递
- 前端顶部栏提供用户切换器
- 服务端通过 `data/studio-users.json` 管理用户列表（`{ "users": ["test1", "test2"] }`）
- 每个用户的数据存储在 `data/users/<userId>/` 目录下

### 用户数据隔离

每个用户独立管理：

| 数据 | 路径 |
|------|------|
| 订阅频道 | `data/users/<userId>/subscriptions.json` |
| 用户设置 | `data/users/<userId>/studio-settings.json` |
| 下载目录 | 默认为 `data/downloads/`（可在设置中自定义） |

旧版全局配置文件（`data/subscriptions.json`、`data/studio-settings.json`）仍被兼容读取作为回退。

### 添加新用户

1. 编辑 `data/studio-users.json`，在 users 数组中添加新用户 ID
2. 系统会自动为新用户创建对应的数据目录

## 数据目录结构

```
data/
├── downloads/              # 下载文件（可配置）
├── studio-users.json      # 用户列表配置
├── studio-settings.json    # 全局设置（回退）
├── subscriptions.json      # 全局订阅（回退）
└── users/
    ├── test1/
    │   ├── subscriptions.json
    │   └── studio-settings.json
    └── test2/
        ├── subscriptions.json
        └── studio-settings.json
```

## 合规提示

请仅下载您有权获取的内容，并遵守 YouTube 服务条款与适用法律。本工具仅供学习与个人合法用途。
