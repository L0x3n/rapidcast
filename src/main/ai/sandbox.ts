import { BrowserWindow } from 'electron'
import { setTimeout as delay } from 'node:timers/promises'
import { record } from '../../shared/events'
import type { Widgets } from '../widgets/service'

export class SandboxTest {
  constructor(private readonly widgets: Widgets) {}
  async run(code: string, signal: AbortSignal): Promise<{ id: string; url: string; frames: number }> {
    const candidate = this.widgets.candidate(code)
    const window = new BrowserWindow({ show: false, width: 1000, height: 700, title: 'RapidCast generated widget test', webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: 'rapidcast-widget-tests'
    } })
    const abort = (): void => { this.widgets.discardCandidate(candidate.id); if (!window.isDestroyed()) window.destroy() }
    signal.addEventListener('abort', abort, { once: true })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    window.webContents.session.setPermissionCheckHandler(() => false)
    const url = `${this.widgets.server.baseUrl}/test/${candidate.id}`
    let passed = false
    try {
      if (signal.aborted) throw new Error('Cancelled')
      await window.loadURL(url)
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        if (signal.aborted) throw new Error('Cancelled')
        const raw: unknown = await window.webContents.executeJavaScript('document.documentElement.dataset.result || ""')
        if (typeof raw === 'string' && raw) {
          const result = record(JSON.parse(raw))
          if (result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error.slice(0, 180) : 'The sandbox test failed.')
          passed = true; return { id: candidate.id, url, frames: Number(result.frames) }
        }
        await delay(80)
      }
      throw new Error('The isolated test did not finish. Simplify the widget and retry.')
    } finally {
      if (!passed) signal.removeEventListener('abort', abort)
      if (!window.isDestroyed()) window.destroy()
      if (!passed) this.widgets.discardCandidate(candidate.id)
    }
  }
}
