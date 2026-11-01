import { app, BrowserWindow } from 'electron'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { record } from '../../shared/events'
import { defaultAiSettings } from '../../shared/ai'
import type { Stats } from './service'
import { StatsStore } from './store'
import type { Engine } from '../engine/controller'
import { ffmpegPath } from '../engine/encoder'
import type { Widgets } from '../widgets/service'
import type { Studio } from '../studio'

async function until(check: () => boolean, description: string, seconds = 20): Promise<void> {
  const end = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > end) throw new Error(`Stats smoke timed out: ${description}`); await delay(80) }
}
export async function statsSmoke(window: BrowserWindow, stats: Stats, engine: Engine, studio: Studio, widgets: Widgets, long = false): Promise<void> {
  const directory = join(__dirname, '../stats-smoke'); await mkdir(directory, { recursive: true })
  const call = async (name: string, ...args: unknown[]): Promise<void> => {
    const raw: unknown = await window.webContents.executeJavaScript(`window.rapidcast.${name}(...${JSON.stringify(args)})`)
    if (record(raw).ok !== true) throw new Error(`Stats IPC action failed: ${name}.`)
  }
  let requests = 0; let anonymous = true
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const raw = record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); const messages = Array.isArray(raw.messages) ? raw.messages.map(record) : []
      const body = String(messages[1]?.content); requests++
      anonymous &&= body.includes('SIMULATOR TEST ONLY') && !body.includes('PixelPilot') && !body.includes('pixelpilot') && !/[a-f0-9]{64}/.test(body)
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content: '## TEST ONLY\n\nThe simulator generated the measured activity. Widget changes are associations, not causal evidence.\n\nTry one widget at a time and compare complete windows next session.' }, finish_reason: 'stop' }] }))
    })().catch(() => { response.writeHead(500); response.end('{}') })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Stats test endpoint did not start.')
  const overlays: BrowserWindow[] = []
  try {
    await call('saveAi', { ...defaultAiSettings(), preset: 'custom', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'stats-fixed-response-test', tokenField: 'max_tokens' })
    studio.clearSimulations(); await studio.selectScene('live')
    const settings = structuredClone(engine.snapshot().settings); settings.resolution = '720p'; settings.bitrate = 1000; settings.fps = 30
    for (const scene of Object.values(settings.scenes)) for (const layer of scene) if (layer.kind === 'widget') layer.visible = layer.id === 'widget-live-alerts'
    await engine.configure(settings); engine.testPattern = true; await engine.preview()
    await until(() => widgets.snapshot().statuses.some(s => s.id === 'widget-live-alerts' && s.state === 'ready'), 'widget ready')
    // A preview and a second OBS runtime must not double-count engine output.
    for (const suffix of ['/overlay/program', '/overlay/program?preview=1']) {
      const overlay = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } }); overlays.push(overlay); await overlay.loadURL(widgets.server.baseUrl + suffix)
    }
    await call('startOutput', 'record'); await until(() => engine.snapshot().encodedFrames > 0 && Boolean(stats.snapshot().activeId), 'automatic recording session')
    const id = stats.snapshot().activeId!; const start = Date.now(); const seconds = long ? 600 : 10; const triggerAt = long ? 180 : 3
    let messages = 0
    window.minimize()
    for (let second = 0; second < seconds; second++) {
      if (engine.snapshot().mode !== 'record') throw new Error('Stats collection interrupted recording.')
      studio.simulate('chat'); messages++
      if (second >= triggerAt && second < triggerAt + 120) { studio.simulate('chat'); messages++ }
      if (second === triggerAt) studio.simulate('follow')
      if (second && second % 60 === 0) console.log(`Stats smoke: ${second}/${seconds} seconds recorded, ${messages} simulator messages; engine output continues.`)
      await delay(Math.max(0, start + (second + 1) * 1000 - Date.now()))
    }
    await until(() => (stats.snapshot().view?.datasets.simulator.totals.triggers ?? 0) > 0, 'actual widget witness')
    const frames = engine.snapshot().encodedFrames; await call('stopOutput'); await until(() => stats.snapshot().activeId === null, 'automatic stop')
    const recording = engine.snapshot().recordingPath; if (!recording) throw new Error('No recording was saved.')
    await call('selectStatsSession', id, 'simulator')
    const view = stats.snapshot().view!; const totals = view.datasets.simulator.totals; const impact = view.datasets.simulator.impacts.find(w => w.widgetId === 'widget-live-alerts')
    if (totals.messages !== messages || totals.follows !== 1 || totals.triggers !== 1 || view.datasets.twitch.totals.messages !== 0 || !impact || (long ? impact.complete !== 1 : impact.partial !== 1)) throw new Error(`Native stats mismatch: ${JSON.stringify({ totals, messages, impact })}`)
    const duration = (view.meta.endedAt! - view.meta.startedAt) / 1000
    if (long && duration < 600) throw new Error('The long stats run did not last ten minutes.')
    if (requests) throw new Error('An AI request ran without an explicit request or auto-report preference.')
    await call('generateStatsReport'); await until(() => stats.snapshot().reportJob.phase === 'ready' || stats.snapshot().reportJob.phase === 'error', 'saved AI report')
    if (stats.snapshot().report?.kind !== 'ai' || requests !== 1 || !anonymous) throw new Error('The optional anonymous AI report did not complete.')
    await call('copyStatsReport')
    const saved = await stats.store.readReport(id, 'simulator'); if (!saved?.includes('## AI analysis') || !saved.includes('TEST ONLY')) throw new Error('The Markdown report was not saved.')
    const replay = new StatsStore(app.getPath('userData'), () => undefined); const history = await replay.initialize(); const restored = (await replay.load(id)).view()
    if (!history.some(h => h.id === id) || restored.datasets.simulator.totals.messages !== messages || restored.datasets.simulator.totals.triggers !== 1) throw new Error('Native history replay changed measured metrics.')
    const journal = await readFile(stats.store.path(id), 'utf8'); if (journal.includes('PixelPilot') || journal.includes('pixelpilot') || journal.includes('Chat is ready')) throw new Error('The session persisted raw viewer data.')
    await writeFile(join(directory, 'simulator-report.md'), saved); await writeFile(join(directory, 'session.jsonl'), journal)
    window.restore(); await window.webContents.executeJavaScript("document.querySelector('[data-tab=stats]').click();document.querySelector('.page-content').scrollTop=0"); await delay(800)
    const chart: boolean = await window.webContents.executeJavaScript("Boolean(document.querySelector('.stats-chart canvas')?.getContext('2d')&&document.querySelector('.stats-source.test'))")
    if (!chart) throw new Error('The Stats chart/test dataset did not render.')
    for (const [name, selector] of [['stats.png', '.stats-session-bar'], ['timeline.png', '.stats-chart'], ['impact.png', '.stats-table-wrap'], ['report.png', '.stats-report']]) {
      await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'})`); await delay(250)
      try { await writeFile(join(directory, name!), (await window.webContents.capturePage()).toPNG()) } catch { console.warn('Stats screenshot unavailable; functional checks passed separately.') }
    }
    await writeFile(join(directory, 'report.json'), JSON.stringify({ long, duration, messages, totals, impact, encodedFrames: frames, requests, anonymous, restored: true, chart, mode: 'LOCAL RECORDING + SIMULATOR; fixed-response AI endpoint; no Twitch account' }, null, 2))
    await copyFile(recording, join(directory, 'stats.mp4'))
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath(), ['-hide_banner', '-i', recording, '-f', 'null', '-'], { windowsHide: true, timeout: 60000 },
      (error, _stdout, stderr) => error || !/Video: h264/.test(stderr) || !/Audio: aac/.test(stderr) ? reject(new Error('Stats recording did not decode as H.264/AAC.')) : resolve()))
    console.log(`RapidCast stats smoke passed: ${duration.toFixed(1)} seconds, ${messages} simulator messages, one actual visible widget trigger, isolated datasets, restored journal, saved anonymous AI Markdown and continuous H.264/AAC recording.`)
  } finally {
    for (const overlay of overlays) if (!overlay.isDestroyed()) overlay.destroy()
    await engine.pause(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  }
}
