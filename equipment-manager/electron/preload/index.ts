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
    get: (args) => ipcRenderer.invoke(CHANNELS.devicesGet, args),
    create: (args) => ipcRenderer.invoke(CHANNELS.devicesCreate, args),
    update: (args) => ipcRenderer.invoke(CHANNELS.devicesUpdate, args),
    changeStatus: (args) => ipcRenderer.invoke(CHANNELS.devicesChangeStatus, args),
    delete: (args) => ipcRenderer.invoke(CHANNELS.devicesDelete, args),
  },
  dashboard: {
    summary: () => ipcRenderer.invoke(CHANNELS.dashboardSummary)
  },
  requests: {
    list: (args) => ipcRenderer.invoke(CHANNELS.requestsList, args),
    get: (args) => ipcRenderer.invoke(CHANNELS.requestsGet, args),
    returnDevice: (args) => ipcRenderer.invoke(CHANNELS.requestsReturn, args),
    addDevices: (args) => ipcRenderer.invoke(CHANNELS.requestsAddDevices, args),
    availableDevices: () => ipcRenderer.invoke(CHANNELS.requestsAvailableDevices),
    create: (args) => ipcRenderer.invoke(CHANNELS.requestsCreate, args),
  },
  allocate: {
    formData: () => ipcRenderer.invoke(CHANNELS.allocateFormData),
    create: (args) => ipcRenderer.invoke(CHANNELS.allocateCreate, args),
    quick: (args) => ipcRenderer.invoke(CHANNELS.allocateQuick, args),
  },
  catalog: {
    list: () => ipcRenderer.invoke(CHANNELS.catalogList),
    saveCategory: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveCategory, args),
    deleteCategory: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteCategory, args),
    saveDepartment: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveDepartment, args),
    deleteDepartment: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteDepartment, args),
    saveEmployee: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveEmployee, args),
    deleteEmployee: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteEmployee, args),
  },
  settings: {
    listUsers: () => ipcRenderer.invoke(CHANNELS.settingsListUsers),
    saveUser: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveUser, args),
    changePassword: (args) => ipcRenderer.invoke(CHANNELS.settingsChangePassword, args),
    dbInfo: () => ipcRenderer.invoke(CHANNELS.settingsDbInfo),
  },
}

contextBridge.exposeInMainWorld('api', api)
