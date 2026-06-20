import type { IpcMain } from 'electron'
import type { AppDb } from '../db'
import { CHANNELS } from '@shared/ipc'
import { makeAuthHandlers } from './auth'
import { makeDeviceHandlers } from './devices'
import { makeDashboardHandlers } from './dashboard'
import { session } from '../session'

const AUTH_REQUIRED = { ok: false, error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' } } as const

export function registerHandlers(ipcMain: IpcMain, db: AppDb): void {
  const auth = makeAuthHandlers(db)
  const devices = makeDeviceHandlers(db)
  const dashboard = makeDashboardHandlers(db)

  ipcMain.handle(CHANNELS.authLogin, (_e, args) => auth.login(args))
  ipcMain.handle(CHANNELS.authMe, () => auth.me())
  ipcMain.handle(CHANNELS.authLogout, () => auth.logout())
  ipcMain.handle(CHANNELS.devicesList, (_e, args) => session.current ? devices.list(args) : AUTH_REQUIRED)
  ipcMain.handle(CHANNELS.devicesGet, (_e, args) => session.current ? devices.get(args) : AUTH_REQUIRED)
  ipcMain.handle(CHANNELS.dashboardSummary, () => session.current ? dashboard.summary() : AUTH_REQUIRED)
}
