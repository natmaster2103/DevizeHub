import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'electron/main/index.ts' },
      rollupOptions: { external: ['better-sqlite3'] }
    },
    resolve: { alias: { '@shared': resolve('electron/shared') } }
  },
  preload: {
    build: {
      lib: { entry: 'electron/preload/index.ts' }
    },
    resolve: { alias: { '@shared': resolve('electron/shared') } }
  },
  renderer: {
    server: { port: 5173 },
    build: {
      rollupOptions: { input: 'index.html' }
    },
    plugins: [react()],
    resolve: { alias: { '@': resolve('src'), '@shared': resolve('electron/shared') } }
  }
})
