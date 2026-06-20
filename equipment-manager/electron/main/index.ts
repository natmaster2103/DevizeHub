import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { createDb } from './db'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerHandlers } from './handlers'

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
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
