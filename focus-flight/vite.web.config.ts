import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string
import { defineConfig } from 'vite'

/** Electron 없이 브라우저에서 화면만 미리 보기 (mock API 사용) */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __WEB_APP__: false },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true }
})
