import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RapidCastApi } from '../shared/contracts'

const api: RapidCastApi = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo)
})

contextBridge.exposeInMainWorld('rapidcast', api)
