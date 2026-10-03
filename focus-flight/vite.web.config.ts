import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** Electron 없이 브라우저에서 화면만 미리 보기 (mock API 사용) */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true }
})
