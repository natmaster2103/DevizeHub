import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { createDb } from './db'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerHandlers } from './handlers'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function applyCSP(): void {
  const policy = isDev
    // Dev: allow Vite HMR (eval + ws) — warning is expected and harmless in dev
    ? "default-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:5173 ws://localhost:5173"
    // Prod: strict — no eval, inline styles only
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // The CSP warning is expected in dev mode (Vite HMR requires eval) and gone when packaged
    if (message.includes('Electron Security Warning')) return
    const tag = ['log', 'warn', 'error', 'debug'][level] ?? 'log'
    console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`)
  })
  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const dbPath = join(app.getPath('userData'), 'equiphub.db')
  try {
    const { db } = createDb(dbPath)
    runMigrations(db)
    seedIfEmpty(db)
    registerHandlers(ipcMain, db)
  } catch (err) {
    await dialog.showErrorBox(
      'Lỗi khởi động',
      `Không thể khởi tạo cơ sở dữ liệu.\n\nChi tiết: ${err instanceof Error ? err.message : String(err)}\n\nVui lòng khởi động lại ứng dụng.`
    )
    app.quit()
    return
  }
  applyCSP()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
