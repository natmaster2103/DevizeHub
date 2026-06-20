import type { IpcMain } from 'electron'
import type { AppDb } from '../db'
import { CHANNELS } from '@shared/ipc'
import { makeAuthHandlers } from './auth'
import { makeDeviceHandlers } from './devices'
import { makeDashboardHandlers } from './dashboard'

export function registerHandlers(ipcMain: IpcMain, db: AppDb): void {
  const auth = makeAuthHandlers(db)
  const devices = makeDeviceHandlers(db)
  const dashboard = makeDashboardHandlers(db)

  ipcMain.handle(CHANNELS.authLogin, (_e, args) => auth.login(args))
  ipcMain.handle(CHANNELS.authMe, () => auth.me())
  ipcMain.handle(CHANNELS.authLogout, () => auth.logout())
  ipcMain.handle(CHANNELS.devicesList, (_e, args) => devices.list(args))
  ipcMain.handle(CHANNELS.devicesGet, (_e, args) => devices.get(args))
  ipcMain.handle(CHANNELS.dashboardSummary, () => dashboard.summary())
}
