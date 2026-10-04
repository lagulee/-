import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

/** 웹 버전 (GitHub Pages, https://lagulee.github.io/-/) */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __WEB_APP__: true },
  build: { outDir: resolve(__dirname, 'out/pages'), emptyOutDir: true }
})
