import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Electron の file:// 読み込みでも assets を解決できるように相対パスで出力する。
export default defineConfig({
  base: './',
  plugins: [react()],
})
