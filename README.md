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

## 合规提示

请仅下载您有权获取的内容，并遵守 YouTube 服务条款与适用法律。本工具仅供学习与个人合法用途。
