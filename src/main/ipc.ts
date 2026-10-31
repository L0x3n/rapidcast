import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC, type ActionResult } from '../shared/contracts'
import { isSimulation } from '../shared/simulator'
import { isSceneId } from '../shared/scenes'
import { isTrustedRendererUrl } from '../shared/trusted-url'
import type { Studio } from './studio'

export function validateSender(event: IpcMainInvokeEvent, window: BrowserWindow, rendererUrl: string): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      !isTrustedRendererUrl(event.senderFrame.url, rendererUrl)) {
    throw new Error('This request did not come from the studio window. Restart RapidCast and try again.')
  }
}
export function registerStudioIpc(studio: Studio, window: BrowserWindow, rendererUrl: string): void {
  ipcMain.removeHandler(IPC.studio)
  ipcMain.handle(IPC.studio, event => { validateSender(event, window, rendererUrl); return studio.snapshot() })
  let queue: Promise<unknown> = Promise.resolve()
  function action(channel: string, run: (value: unknown) => void | Promise<void>): void {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, value: unknown): Promise<ActionResult> => {
      validateSender(event, window, rendererUrl)
      const operation = queue.then(() => run(value))
      queue = operation.catch(() => undefined)
      try { await operation; return { ok: true } }
      catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'This action could not finish. Try again.' } }
    })
  }
  action(IPC.saveClient, value => {
    if (typeof value !== 'string' || value.length > 128) throw new Error('Enter only the public Twitch Client ID, up to 128 characters.')
    return studio.saveClientId(value)
  })
  action(IPC.connect, () => studio.connect())
  action(IPC.openLogin, () => studio.openLogin())
  action(IPC.disconnect, () => studio.disconnect())
  action(IPC.retry, () => studio.retry())
  action(IPC.sendChat, value => {
    if (typeof value !== 'string') throw new Error('Enter a chat message to send.')
    return studio.sendChat(value)
  })
  action(IPC.simulate, value => {
    if (!isSimulation(value)) throw new Error('Choose an event from the simulator list.')
    studio.simulate(value)
  })
  action(IPC.clearSimulations, () => studio.clearSimulations())
  action(IPC.scene, value => {
    if (!isSceneId(value)) throw new Error('Choose one of your studio scenes.')
    return studio.selectScene(value)
  })
}
