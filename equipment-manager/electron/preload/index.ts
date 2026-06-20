import { contextBridge } from 'electron'

// Replaced in Task 9 with the full typed api.
contextBridge.exposeInMainWorld('api', {})
