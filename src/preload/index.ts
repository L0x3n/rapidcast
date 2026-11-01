import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RapidCastApi, type StudioState } from '../shared/contracts'
import { ENGINE_IPC, type EngineState } from '../shared/engine'
import { exposeCompositor } from './engine'
import { WIDGET_IPC, type WidgetState } from '../shared/widgets'
import { AI_IPC, type AiState } from '../shared/ai'

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
  revealRecording: () => ipcRenderer.invoke(ENGINE_IPC.reveal),
  getWidgets: () => ipcRenderer.invoke(WIDGET_IPC.state),
  onWidgets: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: WidgetState): void => listener(state)
    ipcRenderer.on(WIDGET_IPC.update, handler)
    return () => ipcRenderer.removeListener(WIDGET_IPC.update, handler)
  },
  addWidget: (id, scene) => ipcRenderer.invoke(WIDGET_IPC.add, { id, scene }),
  installWidget: code => ipcRenderer.invoke(WIDGET_IPC.install, code),
  configureWidget: (id, params) => ipcRenderer.invoke(WIDGET_IPC.params, { id, params }),
  restartWidget: id => ipcRenderer.invoke(WIDGET_IPC.restart, id),
  removeWidget: id => ipcRenderer.invoke(WIDGET_IPC.remove, id),
  setTransition: value => ipcRenderer.invoke(WIDGET_IPC.transition, value),
  copyOverlay: scene => ipcRenderer.invoke(WIDGET_IPC.copy, scene),
  getAi: () => ipcRenderer.invoke(AI_IPC.state),
  onAi: listener => { const handler = (_event: Electron.IpcRendererEvent, state: AiState): void => listener(state); ipcRenderer.on(AI_IPC.update, handler); return () => ipcRenderer.removeListener(AI_IPC.update, handler) },
  saveAi: (settings, key) => ipcRenderer.invoke(AI_IPC.save, { settings, key }),
  clearAiKey: () => ipcRenderer.invoke(AI_IPC.clearKey),
  listAiModels: () => ipcRenderer.invoke(AI_IPC.models),
  testAi: () => ipcRenderer.invoke(AI_IPC.test),
  generateWidget: request => ipcRenderer.invoke(AI_IPC.generate, request),
  cancelAi: () => ipcRenderer.invoke(AI_IPC.cancel),
  publishAiDraft: id => ipcRenderer.invoke(AI_IPC.publish, id),
  approveSuggestion: (id, scene) => ipcRenderer.invoke(AI_IPC.approve, { id, scene }),
  rejectSuggestion: id => ipcRenderer.invoke(AI_IPC.reject, id),
  editSuggestion: (id, idea) => ipcRenderer.invoke(AI_IPC.edit, { id, idea }),
  simulateSuggestion: idea => ipcRenderer.invoke(AI_IPC.simulate, idea),
  createSuggestionReward: cost => ipcRenderer.invoke(AI_IPC.reward, cost)
})

if (process.argv.includes('--rapidcast-compositor')) exposeCompositor()
else contextBridge.exposeInMainWorld('rapidcast', api)
