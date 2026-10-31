import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RapidCastApi, type StudioState } from '../shared/contracts'
import { ENGINE_IPC, type EngineState } from '../shared/engine'
import { exposeCompositor } from './engine'

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
  selectScene: id => ipcRenderer.invoke(IPC.scene, id),
  getEngine: () => ipcRenderer.invoke(ENGINE_IPC.state),
  onEngine: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: EngineState): void => listener(state)
    ipcRenderer.on(ENGINE_IPC.update, handler)
    return () => ipcRenderer.removeListener(ENGINE_IPC.update, handler)
  },
  configureEngine: settings => ipcRenderer.invoke(ENGINE_IPC.configure, settings),
  startPreview: () => ipcRenderer.invoke(ENGINE_IPC.preview),
  stopPreview: () => ipcRenderer.invoke(ENGINE_IPC.pause),
  startOutput: mode => ipcRenderer.invoke(ENGINE_IPC.output, mode),
  stopOutput: () => ipcRenderer.invoke(ENGINE_IPC.stop),
  refreshSources: () => ipcRenderer.invoke(ENGINE_IPC.sources),
  importImage: () => ipcRenderer.invoke(ENGINE_IPC.image),
  revealRecording: () => ipcRenderer.invoke(ENGINE_IPC.reveal)
})

if (process.argv.includes('--rapidcast-compositor')) exposeCompositor()
else contextBridge.exposeInMainWorld('rapidcast', api)
