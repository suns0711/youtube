'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const { spawn } = require('node:child_process')
const http = require('node:http')

const DEV_VITE_URL = 'http://localhost:5173'
const PORT = process.env.PORT || '8787'
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`

/** 打包后：Contents/Resources/studio */
function studioRoot() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..')
  }
  return path.join(process.resourcesPath, 'studio')
}

let serverChild = null

function waitForHealth(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      function retry() {
        if (Date.now() > deadline) {
          reject(new Error(`无法在 ${timeoutMs}ms 内连上 ${HEALTH_URL}`))
          return
        }
        setTimeout(ping, 200)
      }
    }
    ping()
  })
}

function startBundledServer() {
  const root = studioRoot()
  const serverJs = path.join(root, 'server', 'index.js')
  serverChild = spawn(
    process.execPath,
    [serverJs],
    {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        STUDIO_ROOT: root,
        PORT: String(PORT),
        NODE_ENV: 'production',
      },
      stdio: 'inherit',
    },
  )
  serverChild.on('error', (err) => {
    console.error('[electron] 启动子进程失败:', err)
  })
  return waitForHealth()
}

/** 已有进程则直接连；否则拉起子进程（避免 macOS 关窗再起进程重复占用端口） */
async function ensureServerRunning() {
  try {
    await waitForHealth(800)
    return
  } catch {
    /* 尚未监听 */
  }
  if (serverChild && !serverChild.killed) {
    await waitForHealth()
    return
  }
  await startBundledServer()
}

function killServer() {
  if (!serverChild || serverChild.killed) return
  try {
    serverChild.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  serverChild = null
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'YouTube Studio',
    webPreferences: {
      contextIsolation: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    await win.loadURL(DEV_VITE_URL)
    return
  }

  await ensureServerRunning()
  await win.loadURL(`http://127.0.0.1:${PORT}/`)
}

app.whenReady().then(() => {
  void createWindow().catch((err) => {
    console.error(err)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((err) => {
        console.error(err)
        app.quit()
      })
    }
  })
})

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killServer()
})
