import { ipcMain, type BrowserWindow } from 'electron'
import { AI_IPC } from '../../shared/ai'
import { record } from '../../shared/events'
import { isSceneId } from '../../shared/scenes'
import type { ActionResult } from '../../shared/contracts'
import { validateSender } from '../ipc'
import type { AiService } from './service'

export function registerAiIpc(ai: AiService, window: BrowserWindow, url: string): void {
  ipcMain.removeHandler(AI_IPC.state)
  ipcMain.handle(AI_IPC.state, event => { validateSender(event, window, url); return ai.snapshot() })
  let operations: Promise<unknown> = Promise.resolve()
  const action = (channel: string, run: (value: unknown) => void | Promise<unknown>, immediate = false): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, value: unknown): Promise<ActionResult> => {
      validateSender(event, window, url)
      const work = immediate ? Promise.resolve().then(() => run(value)) : operations.then(() => run(value))
      if (!immediate) operations = work.catch(() => undefined)
      try { await work; return { ok: true } } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'The AI action could not finish. Check Settings and retry.' } }
    })
  }
  const id = (value: unknown): string => { if (typeof value !== 'string' || value.length > 80) throw new Error('Choose a current suggestion or preview.'); return value }
  action(AI_IPC.save, raw => { const value = record(raw); return ai.save(value.settings, value.key) })
  action(AI_IPC.clearKey, () => ai.clearKey())
  action(AI_IPC.models, () => ai.models())
  action(AI_IPC.test, () => ai.test())
  action(AI_IPC.generate, raw => {
    const value = record(raw)
    if (typeof value.prompt !== 'string' || !isSceneId(value.scene) || value.editInstanceId !== undefined && (typeof value.editInstanceId !== 'string' || value.editInstanceId.length > 80)) throw new Error('Enter a widget idea and choose a scene.')
    ai.generate({ prompt: value.prompt, scene: value.scene, ...(typeof value.editInstanceId === 'string' ? { editInstanceId: value.editInstanceId } : {}) })
  })
  action(AI_IPC.cancel, () => ai.cancel(), true)
  action(AI_IPC.publish, value => ai.publishDraft(id(value)))
  action(AI_IPC.approve, raw => { const value = record(raw); if (!isSceneId(value.scene)) throw new Error('Choose a valid scene.'); ai.approve(id(value.id), value.scene) })
  action(AI_IPC.reject, value => ai.reject(id(value)))
  action(AI_IPC.edit, raw => { const value = record(raw); if (typeof value.idea !== 'string') throw new Error('Enter an edited idea.'); ai.edit(id(value.id), value.idea) })
  action(AI_IPC.simulate, value => { if (typeof value !== 'string') throw new Error('Enter a test idea.'); ai.simulate(value) })
  action(AI_IPC.reward, value => { if (typeof value !== 'number') throw new Error('Enter a reward cost.'); return ai.reward(value) })
}
