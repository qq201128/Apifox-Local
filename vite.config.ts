import path from 'node:path'

import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

const SRC_DIR = path.resolve(__dirname, 'src')

export default defineConfig({
  plugins: [reactRouter()],
  // 允许局域网内其他设备通过本机 IP 访问（默认仅 localhost）
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  resolve: {
    alias: {
      '@': SRC_DIR,
    },
  },
})
