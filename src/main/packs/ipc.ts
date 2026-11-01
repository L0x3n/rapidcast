import { ipcMain, type BrowserWindow } from 'electron'
import { PACK_IPC } from '../../shared/packs'
import { validateSender } from '../ipc'
import type { ActionResult } from '../../shared/contracts'
import type { Packs } from './service'

export function registerPackIpc(packs: Packs, window: BrowserWindow, url: string): void {
  ipcMain.removeHandler(PACK_IPC.state)
  ipcMain.handle(PACK_IPC.state, event => { validateSender(event, window, url); return packs.snapshot() })
  const action = (channel: string, run: (input: unknown) => unknown): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, input: unknown): Promise<ActionResult> => {
      validateSender(event, window, url)
      try { await run(input); return { ok: true } } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'The pack action could not finish. Check the file and retry.' } }
    })
  }
  const id = (value: unknown): string => { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new Error('Choose the current reviewed pack.'); return value }
  action(PACK_IPC.export, value => packs.export(value))
  action(PACK_IPC.open, () => packs.open())
  action(PACK_IPC.test, value => packs.test(id(value)))
  action(PACK_IPC.install, value => packs.install(id(value)))
  action(PACK_IPC.cancel, () => packs.cancel())
}
