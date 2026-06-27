import type { IpcMain } from 'electron'
import type { AppDb } from '../db'
import { CHANNELS } from '@shared/ipc'
import { makeAuthHandlers } from './auth'
import { makeDeviceHandlers } from './devices'
import { makeDashboardHandlers } from './dashboard'
import { makeRequestHandlers } from './requests'
import { makeAllocateHandlers } from './allocate'
import { makeCatalogHandlers } from './catalog'
import { makeSettingsHandlers } from './settings'
import { session } from '../session'

const AUTH_REQUIRED = { ok: false, error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' } } as const
const auth_guard = (fn: () => unknown) => session.current ? fn() : AUTH_REQUIRED

export function registerHandlers(ipcMain: IpcMain, db: AppDb, dbPath: string): void {
  const auth = makeAuthHandlers(db)
  const devicesH = makeDeviceHandlers(db)
  const dashboard = makeDashboardHandlers(db)
  const requestsH = makeRequestHandlers(db)
  const allocateH = makeAllocateHandlers(db)
  const catalogH = makeCatalogHandlers(db)
  const settingsH = makeSettingsHandlers(db, dbPath)

  ipcMain.handle(CHANNELS.authLogin, (_e, args) => auth.login(args))
  ipcMain.handle(CHANNELS.authMe, () => auth.me())
  ipcMain.handle(CHANNELS.authLogout, () => auth.logout())
  ipcMain.handle(CHANNELS.devicesList, (_e, args) => auth_guard(() => devicesH.list(args)))
  ipcMain.handle(CHANNELS.devicesGet, (_e, args) => auth_guard(() => devicesH.get(args)))
  ipcMain.handle(CHANNELS.devicesCreate, (_e, args) => auth_guard(() => devicesH.create(args)))
  ipcMain.handle(CHANNELS.devicesUpdate, (_e, args) => auth_guard(() => devicesH.update(args)))
  ipcMain.handle(CHANNELS.devicesChangeStatus, (_e, args) => auth_guard(() => devicesH.changeStatus(args)))
  ipcMain.handle(CHANNELS.devicesDelete, (_e, args) => auth_guard(() => devicesH.delete(args)))
  ipcMain.handle(CHANNELS.dashboardSummary, () => auth_guard(() => dashboard.summary()))
  ipcMain.handle(CHANNELS.requestsList, (_e, args) => auth_guard(() => requestsH.list(args)))
  ipcMain.handle(CHANNELS.requestsGet, (_e, args) => auth_guard(() => requestsH.get(args)))
  ipcMain.handle(CHANNELS.requestsReturn, (_e, args) => auth_guard(() => requestsH.returnDevice(args)))
  ipcMain.handle(CHANNELS.requestsAddDevices, (_e, args) => auth_guard(() => requestsH.addDevices(args)))
  ipcMain.handle(CHANNELS.requestsAvailableDevices, () => auth_guard(() => requestsH.availableDevices()))
  ipcMain.handle(CHANNELS.allocateFormData, () => auth_guard(() => allocateH.formData()))
  ipcMain.handle(CHANNELS.allocateCreate, (_e, args) => auth_guard(() => allocateH.create(args)))
  ipcMain.handle(CHANNELS.requestsCreate, (_e, args) => auth_guard(() => requestsH.create(args)))
  ipcMain.handle(CHANNELS.requestsUpdate, (_e, args) => auth_guard(() => requestsH.update(args)))
  ipcMain.handle(CHANNELS.requestsDelete, (_e, args) => auth_guard(() => requestsH.delete(args)))
  ipcMain.handle(CHANNELS.allocateQuick, (_e, args) => auth_guard(() => allocateH.quickAllocate(args)))
  ipcMain.handle(CHANNELS.catalogList, () => auth_guard(() => catalogH.list()))
  ipcMain.handle(CHANNELS.catalogSaveCategory, (_e, args) => auth_guard(() => catalogH.saveCategory(args)))
  ipcMain.handle(CHANNELS.catalogDeleteCategory, (_e, args) => auth_guard(() => catalogH.deleteCategory(args)))
  ipcMain.handle(CHANNELS.catalogSaveDepartment, (_e, args) => auth_guard(() => catalogH.saveDepartment(args)))
  ipcMain.handle(CHANNELS.catalogDeleteDepartment, (_e, args) => auth_guard(() => catalogH.deleteDepartment(args)))
  ipcMain.handle(CHANNELS.catalogSaveEmployee, (_e, args) => auth_guard(() => catalogH.saveEmployee(args)))
  ipcMain.handle(CHANNELS.catalogDeleteEmployee, (_e, args) => auth_guard(() => catalogH.deleteEmployee(args)))
  ipcMain.handle(CHANNELS.catalogSaveGroup, (_e, args) => auth_guard(() => catalogH.saveGroup(args)))
  ipcMain.handle(CHANNELS.catalogDeleteGroup, (_e, args) => auth_guard(() => catalogH.deleteGroup(args)))
  ipcMain.handle(CHANNELS.settingsListUsers, () => auth_guard(() => settingsH.listUsers()))
  ipcMain.handle(CHANNELS.settingsSaveUser, (_e, args) => auth_guard(() => settingsH.saveUser(args)))
  ipcMain.handle(CHANNELS.settingsChangePassword, (_e, args) => auth_guard(() => settingsH.changePassword(args)))
  ipcMain.handle(CHANNELS.settingsDbInfo, () => auth_guard(() => settingsH.dbInfo()))
  ipcMain.handle(CHANNELS.settingsResetData, () => auth_guard(() => settingsH.resetData()))
  ipcMain.handle(CHANNELS.settingsSaveUserPermissions, (_e, args) => auth_guard(() => settingsH.saveUserPermissions(args)))
  ipcMain.handle(CHANNELS.settingsSaveUserGroups, (_e, args) => auth_guard(() => settingsH.saveUserGroups(args)))
  ipcMain.handle(CHANNELS.settingsDeleteUser, (_e, args) => auth_guard(() => settingsH.deleteUser(args)))
}
