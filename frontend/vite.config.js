import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',                         // 相对路径，便于 Electron file:// 加载
  server: {
    host: '0.0.0.0',                  // 允许局域网通过 http://本机IP:5173 访问开发预览
    port: 5173,
    strictPort: true,                 // 与 Electron dev 的 wait-on:5173 保持一致
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
