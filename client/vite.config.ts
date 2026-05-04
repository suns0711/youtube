import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
        // 与 server 侧 yt-dlp 超时对齐并留余量，避免添加频道时长请求被代理掐断
        timeout: 200_000,
        proxyTimeout: 200_000,
      },
    },
  },
})
