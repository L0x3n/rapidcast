import { ipcMain, type BrowserWindow } from 'electron'
import { WIDGET_IPC } from '../../shared/widgets'
import { isSceneId } from '../../shared/scenes'
import { record } from '../../shared/events'
import type { ActionResult } from '../../shared/contracts'
import { validateSender } from '../ipc'
import type { Widgets } from './service'

export function registerWidgetIpc(widgets: Widgets, window: BrowserWindow, url: string): void {
  ipcMain.removeHandler(WIDGET_IPC.state)
  ipcMain.handle(WIDGET_IPC.state, event => { validateSender(event, window, url); return widgets.snapshot() })
  let operations: Promise<unknown> = Promise.resolve()
  const action = (channel: string, run: (value: unknown) => void | Promise<unknown>): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, value: unknown): Promise<ActionResult> => {
      validateSender(event, window, url)
      const work = operations.then(() => run(value)); operations = work.catch(() => undefined)
      try { await work; return { ok: true } } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'The widget action could not finish. Try again.' } }
    })
  }
  action(WIDGET_IPC.add, raw => { const value = record(raw); if (typeof value.id !== 'string' || !isSceneId(value.scene)) throw new Error('Choose a widget and a valid scene.'); return widgets.add(value.id, value.scene) })
  action(WIDGET_IPC.install, code => { if (typeof code !== 'string') throw new Error('Paste one widget ES module.'); return widgets.install(code) })
  action(WIDGET_IPC.params, raw => { const value = record(raw); if (typeof value.id !== 'string') throw new Error('Choose a widget instance.'); return widgets.params(value.id, value.params) })
  action(WIDGET_IPC.restart, id => { if (typeof id !== 'string') throw new Error('Choose a widget instance.'); return widgets.restart(id) })
  action(WIDGET_IPC.remove, id => { if (typeof id !== 'string') throw new Error('Choose a widget instance.'); return widgets.remove(id) })
  action(WIDGET_IPC.transition, value => { if (value !== 'cut' && value !== 'fade' && value !== 'swipe') throw new Error('Choose cut, fade or swipe.'); return widgets.setTransition(value) })
  action(WIDGET_IPC.copy, value => { if (typeof value !== 'string') throw new Error('Choose a scene or widget.'); widgets.copy(value) })
}
