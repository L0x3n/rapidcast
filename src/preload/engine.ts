import { contextBridge, ipcRenderer } from 'electron'
import { ENGINE_IPC, type EngineCommand } from '../shared/engine'
import type { CompositorApi } from '../shared/engine-api'

const api = Object.freeze<CompositorApi>({
  ready: () => ipcRenderer.send(ENGINE_IPC.ready),
  onCommand: handler => { ipcRenderer.on(ENGINE_IPC.command, (_event, command: EngineCommand) => handler(command)) },
  reply: (id, error) => ipcRenderer.send(ENGINE_IPC.reply, id, error),
  telemetry: value => ipcRenderer.send(ENGINE_IPC.telemetry, value),
  thumbnail: data => ipcRenderer.send(ENGINE_IPC.thumbnail, data),
  chunk: (runId, sequence, data) => ipcRenderer.invoke(ENGINE_IPC.chunk, runId, sequence, data),
  devices: (cameras, microphones) => ipcRenderer.send(ENGINE_IPC.devices, cameras, microphones),
  prepareCapture: id => ipcRenderer.invoke(ENGINE_IPC.capture, id),
  asset: id => ipcRenderer.invoke(ENGINE_IPC.asset, id),
  fault: message => ipcRenderer.send(ENGINE_IPC.fault, message),
  warning: message => ipcRenderer.send(ENGINE_IPC.warning, message)
})
export function exposeCompositor(): void { contextBridge.exposeInMainWorld('compositor', api) }
