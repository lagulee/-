import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    },
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version), __WEB_APP__: false }
  }
})
