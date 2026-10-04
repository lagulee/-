import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

/** 안드로이드 앱(Capacitor)에 넣을 화면 빌드 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: resolve(__dirname, 'out/mobile'), emptyOutDir: true }
})
