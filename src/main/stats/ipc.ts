import { ipcMain, type BrowserWindow } from 'electron'
import { STATS_IPC, sessionIdValid } from '../../shared/stats'
import { record } from '../../shared/events'
import { validateSender } from '../ipc'
import type { ActionResult } from '../../shared/contracts'
import type { Stats } from './service'

export function registerStatsIpc(stats: Stats, window: BrowserWindow, url: string): void {
  ipcMain.removeHandler(STATS_IPC.state)
  ipcMain.handle(STATS_IPC.state, event => { validateSender(event, window, url); return stats.snapshot() })
  const action = (channel: string, run: (input: unknown) => unknown): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, input: unknown): Promise<ActionResult> => {
      validateSender(event, window, url)
      try { await run(input); return { ok: true } } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : 'Statistics could not finish this action. Try again.' } }
    })
  }
  action(STATS_IPC.select, input => { const v = record(input); if (!sessionIdValid(v.id) || v.source !== 'twitch' && v.source !== 'simulator') throw new Error('Choose a saved session and data source.'); return stats.select(v.id, v.source) })
  action(STATS_IPC.start, input => { if (input !== 'obs' && input !== 'practice') throw new Error('Choose OBS or practice tracking.'); stats.start(input) })
  action(STATS_IPC.stop, () => stats.stop())
  action(STATS_IPC.report, () => stats.generate())
  action(STATS_IPC.cancel, () => stats.cancel())
  action(STATS_IPC.copy, () => stats.copy())
  action(STATS_IPC.reveal, () => stats.reveal())
  action(STATS_IPC.auto, input => { if (typeof input !== 'boolean') throw new Error('Choose whether to request AI analysis after Stop.'); return stats.auto(input) })
}
