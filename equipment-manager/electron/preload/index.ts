import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type Api } from '@shared/ipc'

const api: Api = {
  auth: {
    login: (args) => ipcRenderer.invoke(CHANNELS.authLogin, args),
    me: () => ipcRenderer.invoke(CHANNELS.authMe),
    logout: () => ipcRenderer.invoke(CHANNELS.authLogout)
  },
  devices: {
    list: (args) => ipcRenderer.invoke(CHANNELS.devicesList, args),
    get: (args) => ipcRenderer.invoke(CHANNELS.devicesGet, args)
  },
  dashboard: {
    summary: () => ipcRenderer.invoke(CHANNELS.dashboardSummary)
  }
}

contextBridge.exposeInMainWorld('api', api)
