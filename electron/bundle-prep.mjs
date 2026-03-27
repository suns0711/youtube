/**
 * 为 electron-builder 准备 Resources/studio：server + 生产依赖、前端 dist、data
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outRoot = path.join(root, 'electron-dist', 'studio')
const outServer = path.join(outRoot, 'server')

fs.rmSync(path.join(root, 'electron-dist'), { recursive: true, force: true })
fs.mkdirSync(outServer, { recursive: true })

for (const name of fs.readdirSync(path.join(root, 'server'))) {
  if (name === 'node_modules') continue
  const src = path.join(root, 'server', name)
  const dest = path.join(outServer, name)
  fs.cpSync(src, dest, { recursive: true })
}

console.log('[bundle-prep] npm install (production) in bundled server…')
execSync('npm install --omit=dev', {
  cwd: outServer,
  stdio: 'inherit',
})

const clientDist = path.join(root, 'client', 'dist')
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('[bundle-prep] 请先执行: npm run build')
  process.exit(1)
}
fs.cpSync(clientDist, path.join(outRoot, 'client', 'dist'), { recursive: true })

fs.cpSync(path.join(root, 'data'), path.join(outRoot, 'data'), {
  recursive: true,
})

console.log('[bundle-prep] 完成:', outRoot)
