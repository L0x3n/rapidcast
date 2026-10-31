import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RapidCastApi, type StudioState } from '../shared/contracts'

const api = Object.freeze<RapidCastApi>({
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getStudio: () => ipcRenderer.invoke(IPC.studio),
  onStudio: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: StudioState): void => listener(state)
    ipcRenderer.on(IPC.update, handler)
    return () => ipcRenderer.removeListener(IPC.update, handler)
  },
  saveClientId: value => ipcRenderer.invoke(IPC.saveClient, value),
  connectTwitch: () => ipcRenderer.invoke(IPC.connect),
  openTwitchLogin: () => ipcRenderer.invoke(IPC.openLogin),
  disconnectTwitch: () => ipcRenderer.invoke(IPC.disconnect),
  retryTwitch: () => ipcRenderer.invoke(IPC.retry),
  sendChat: value => ipcRenderer.invoke(IPC.sendChat, value),
  simulate: type => ipcRenderer.invoke(IPC.simulate, type),
  clearSimulations: () => ipcRenderer.invoke(IPC.clearSimulations),
  selectScene: id => ipcRenderer.invoke(IPC.scene, id)
})

contextBridge.exposeInMainWorld('rapidcast', api)
