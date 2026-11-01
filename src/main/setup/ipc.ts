import { ipcMain, type BrowserWindow } from 'electron'
import { SETUP_IPC } from '../../shared/setup'
import { record } from '../../shared/events'
import { validateSender } from '../ipc'
import type { ActionResult } from '../../shared/contracts'
import type { Setup } from './service'

export function registerSetupIpc(setup: Setup, window: BrowserWindow, url: string): void {
  ipcMain.removeHandler(SETUP_IPC.state)
  ipcMain.handle(SETUP_IPC.state, event => { validateSender(event, window, url); return setup.snapshot() })
  let operations: Promise<unknown> = Promise.resolve()
  const action = (name: string, run: (input: unknown) => unknown, immediate = false): void => {
    ipcMain.removeHandler(name)
    ipcMain.handle(name, async (event, input: unknown): Promise<ActionResult> => {
      validateSender(event, window, url)
      const work = immediate ? Promise.resolve().then(() => run(input)) : operations.then(() => run(input))
      if (!immediate) operations = work.catch(() => undefined)
      try { await work; return { ok: true } } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'Setup could not finish this action. Review the current step and retry.' } }
    })
  }
  action(SETUP_IPC.step, input => { const v = record(input); if (!Number.isInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 5 || !['twitch', 'local'].includes(String(v.goal))) throw new Error('Choose one of the six setup steps.'); return setup.step(Number(v.step), v.goal as 'twitch' | 'local') })
  action(SETUP_IPC.discover, () => setup.discover())
  action(SETUP_IPC.devices, input => { const v = record(input); if (!['displayId', 'cameraId', 'micId'].every(key => typeof v[key] === 'string' && String(v[key]).length <= 256) || typeof v.desktop !== 'boolean') throw new Error('Choose capture and audio devices from the list.'); return setup.devices({ displayId: String(v.displayId), cameraId: String(v.cameraId), micId: String(v.micId), desktop: v.desktop }) })
  action(SETUP_IPC.confirm, input => { const v = record(input); if (!['visual', 'audio', 'inspector'].includes(String(v.kind)) || typeof v.checked !== 'boolean') throw new Error('Choose the readiness check to confirm.'); return setup.confirm(v.kind as 'visual' | 'audio' | 'inspector', v.checked) })
  action(SETUP_IPC.test, kind => { if (kind !== 'twitch' && kind !== 'local') throw new Error('Choose a local or private Twitch test.'); setup.test(kind) })
  action(SETUP_IPC.cancel, () => setup.cancel(), true)
  action(SETUP_IPC.recommend, () => setup.recommendation())
  action(SETUP_IPC.generateTheme, prompt => { if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000) throw new Error('Describe your stream in up to 1000 characters.'); setup.generateTheme(prompt) })
  action(SETUP_IPC.previewTheme, value => setup.previewTheme(value))
  action(SETUP_IPC.applyTheme, () => setup.applyTheme())
  action(SETUP_IPC.repair, () => setup.repair())
  action(SETUP_IPC.finish, start => { if (typeof start !== 'boolean') throw new Error('Choose Save setup or Start output.'); return setup.finish(start) })
  action(SETUP_IPC.inspector, () => setup.inspector())
}
