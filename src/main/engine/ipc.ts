import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { ENGINE_IPC, type EngineTelemetry, type DeviceChoice } from '../../shared/engine'
import type { ActionResult } from '../../shared/contracts'
import { validateSender } from '../ipc'
import type { Engine } from './controller'

export function registerEngineIpc(engine: Engine, window: BrowserWindow, rendererUrl: string): void {
  let actions: Promise<unknown> = Promise.resolve()
  const action = (name: string, run: (value: unknown) => Promise<void>): void => {
    ipcMain.removeHandler(name)
    ipcMain.handle(name, async (event, value: unknown): Promise<ActionResult> => {
      validateSender(event, window, rendererUrl)
      const work = actions.then(() => run(value)); actions = work.catch(() => undefined)
      try { await work; return { ok: true } } catch (error: unknown) {
        return { ok: false, error: error instanceof Error ? error.message : 'The streaming engine could not finish this action. Stop output and retry.' }
      }
    })
  }
  ipcMain.removeHandler(ENGINE_IPC.state)
  ipcMain.handle(ENGINE_IPC.state, event => { validateSender(event, window, rendererUrl); return engine.snapshot() })
  action(ENGINE_IPC.configure, value => engine.configure(value))
  action(ENGINE_IPC.preview, () => engine.preview())
  action(ENGINE_IPC.pause, () => engine.pause())
  action(ENGINE_IPC.output, value => {
    if (value !== 'record' && value !== 'test' && value !== 'live') throw new Error('Choose recording, bandwidth test or live output.')
    return engine.startOutput(value)
  })
  action(ENGINE_IPC.stop, () => engine.stopOutput())
  action(ENGINE_IPC.sources, () => engine.listSources())
  action(ENGINE_IPC.reveal, () => engine.revealRecording())
  ipcMain.removeHandler(ENGINE_IPC.image)
  ipcMain.handle(ENGINE_IPC.image, async event => {
    validateSender(event, window, rendererUrl)
    try { return { id: await engine.assets.import(window) } }
    catch { return { id: null, error: 'This image could not be imported. Choose a PNG, JPG or WebP smaller than 10 MB.' } }
  })
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    const compositor = engine.window
    if (!compositor || compositor.isDestroyed()) return false
    try { validateSender(event as IpcMainInvokeEvent, compositor, engine.url); return true } catch { return false }
  }
  const on = (name: string, run: (event: IpcMainEvent, ...args: unknown[]) => void): void => {
    ipcMain.removeAllListeners(name)
    ipcMain.on(name, (event, ...args: unknown[]) => { if (trusted(event)) run(event, ...args) })
  }
  on(ENGINE_IPC.ready, () => engine.rendererReady())
  on(ENGINE_IPC.reply, (_event, id, error) => { if (typeof id === 'string' && (error === null || typeof error === 'string')) engine.reply(id, error) })
  on(ENGINE_IPC.telemetry, (_event, value) => {
    if (!value || typeof value !== 'object') return
    const raw = value as Record<string, unknown>
    const numbers = ['fps', 'frames', 'expected', 'dropped', 'dropPercent', 'maxGapMs', 'micLevel', 'desktopLevel']
    if (numbers.every(key => typeof raw[key] === 'number' && Number.isFinite(raw[key])) && typeof raw.visibility === 'string' &&
        typeof raw.mimeType === 'string' && Array.isArray(raw.capabilities) && raw.capabilities.every(item => typeof item === 'string')) engine.telemetry(value as EngineTelemetry)
  })
  on(ENGINE_IPC.thumbnail, (_event, value) => { if (value instanceof ArrayBuffer) engine.thumbnail(value) })
  on(ENGINE_IPC.devices, (_event, cameras, microphones) => {
    const valid = (value: unknown): value is DeviceChoice[] => Array.isArray(value) && value.length <= 100 && value.every(item =>
      item && typeof item.id === 'string' && item.id.length <= 256 && typeof item.name === 'string' && item.name.length <= 256)
    if (valid(cameras) && valid(microphones)) engine.devices(cameras, microphones)
  })
  on(ENGINE_IPC.fault, (_event, message) => { if (typeof message === 'string') engine.fault(message) })
  on(ENGINE_IPC.warning, (_event, message) => { if (typeof message === 'string') engine.notice(message) })
  for (const channel of [ENGINE_IPC.chunk, ENGINE_IPC.capture, ENGINE_IPC.asset]) ipcMain.removeHandler(channel)
  ipcMain.handle(ENGINE_IPC.chunk, async (event, runId: unknown, sequence: unknown, data: unknown): Promise<ActionResult> => {
    if (!trusted(event) || typeof runId !== 'string' || typeof sequence !== 'number' || !(data instanceof ArrayBuffer)) return { ok: false, error: 'Invalid video input.' }
    try { await engine.chunk(runId, sequence, data); return { ok: true } } catch { return { ok: false, error: 'The encoder stopped accepting video. Output will need a fresh video stream.' } }
  })
  ipcMain.handle(ENGINE_IPC.capture, async (event, id: unknown) => {
    if (!trusted(event) || typeof id !== 'string') throw new Error('Capture is only available inside the compositor.')
    await engine.prepareCapture(id)
  })
  ipcMain.handle(ENGINE_IPC.asset, async (event, id: unknown) => {
    if (!trusted(event) || typeof id !== 'string') throw new Error('Images are only available inside the compositor.')
    try { return await engine.assets.data(id) } catch { throw new Error('This image could not be loaded. Import it again.') }
  })
}
