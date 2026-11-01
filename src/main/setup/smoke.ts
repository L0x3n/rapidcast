import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, type BrowserWindow } from 'electron'
import { record } from '../../shared/events'
import { defaultAiSettings } from '../../shared/ai'
import { THEME_PRESETS } from '../../shared/setup'
import type { Engine } from '../engine/controller'
import type { Setup } from './service'
import type { AiService } from '../ai/service'
import { SetupStore } from './store'
import { ffmpegPath } from '../engine/encoder'
import type { Stats } from '../stats/service'

async function until(check: () => boolean, description: string, seconds = 25): Promise<void> {
  const deadline = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > deadline) throw new Error(`Setup smoke timed out: ${description}`); await delay(80) }
}
async function decode(file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => execFile(ffmpegPath(), ['-hide_banner', '-i', file, '-f', 'null', '-'], { windowsHide: true, timeout: 20000 },
    (error, _stdout, stderr) => error || !/Video: h264.*1280x720/.test(stderr) || !/Audio: aac/.test(stderr) ? reject(new Error('Setup did not produce a decodable 720p H.264/AAC recording.')) : resolve()))
}
export async function setupSmoke(window: BrowserWindow, setup: Setup, engine: Engine, ai: AiService, stats: Stats): Promise<void> {
  const started = Date.now(); const directory = join(__dirname, '../setup-smoke'); await mkdir(directory, { recursive: true })
  const call = async (name: string, args: unknown[] = [], expected = true): Promise<void> => {
    const raw: unknown = await window.webContents.executeJavaScript(`window.rapidcast.${name}(...${JSON.stringify(args)})`)
    if (record(raw).ok !== expected) throw new Error(`Setup IPC did not ${expected ? 'accept' : 'reject'} ${name}.`)
  }
  const screenshot = async (name: string): Promise<void> => {
    await window.webContents.executeJavaScript("document.querySelector('.page-content').scrollTop=0")
    await delay(300)
    try { await writeFile(join(directory, name), (await window.webContents.capturePage()).toPNG()) } catch { console.warn('Setup screenshot unavailable; native functional checks continue.') }
  }
  let themeRequests = 0
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = record(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const messages = Array.isArray(body.messages) ? body.messages.map(record) : []
      let content = 'OK'
      if (String(messages[0]?.content).startsWith('Create a readable')) { themeRequests++; content = JSON.stringify({ ...THEME_PRESETS[1], ...(themeRequests === 1 ? { font: 'ExternalFont' } : {}) }) }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }))
    })().catch(() => { response.writeHead(500); response.end('{}') })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Setup test endpoint did not start.')
  try {
    if (setup.snapshot().completed) throw new Error('Fresh test profile already marked setup complete.')
    await window.webContents.executeJavaScript("document.querySelector('[data-tab=setup]').click()")
    await until(() => setup.snapshot().step === 0, 'initial welcome')
    const six: number = await window.webContents.executeJavaScript("document.querySelectorAll('.setup-steps button').length")
    if (six !== 6) throw new Error('The setup guide did not expose six steps.')
    await window.webContents.executeJavaScript("[...document.querySelectorAll('.setup-goals button')].find(button=>button.textContent.includes('local')).click()")
    await until(() => setup.snapshot().step === 1 && setup.snapshot().goal === 'local', 'local route choice')
    await call('setupStep', [2, 'local']); await call('discoverSetupDevices')
    if (engine.snapshot().previewActive || engine.snapshot().settings.audio.micId !== 'none' || engine.snapshot().settings.audio.desktop) throw new Error('Device discovery started capture or audio without selection.')
    engine.testPattern = true
    window.show(); window.restore(); window.focus(); await delay(500); await engine.listSources()
    const own = engine.snapshot().sources.find(item => item.kind === 'window' && item.id.split(':')[1] === window.getMediaSourceId().split(':')[1])
    if (!own) throw new Error(`Device discovery could not find the test app window (${window.getMediaSourceId()}; ${engine.snapshot().sources.filter(item => item.name.startsWith('RapidCast')).map(item => item.id).join(',')}).`)
    await call('applySetupDevices', [{ displayId: own.id, cameraId: 'none', micId: 'none', desktop: false }])
    await until(() => engine.snapshot().telemetry?.capabilities.includes('capture-frame') === true, 'selected own-window capture')
    await call('applySetupDevices', [{ displayId: 'none', cameraId: 'none', micId: 'none', desktop: false }])
    await call('testSetup', ['twitch'], false); await call('finishSetup', [true], false)
    await call('setupStep', [3, 'local']); await call('testSetup', ['local'])
    await until(() => setup.snapshot().task.phase === 'testing', 'owned test start')
    await call('configureEngine', [engine.snapshot().settings], false)
    await call('selectScene', ['brb'], false)
    await call('cancelSetup')
    await until(() => !engine.snapshot().mode && !engine.setupTestActive && setup.snapshot().task.phase === 'cancelled', 'cancelled test cleanup')
    if (setup.snapshot().benchmark) throw new Error('A cancelled partial sample was approved.')
    await call('saveAi', [{ ...defaultAiSettings(), preset: 'custom', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'setup-test-model', tokenField: 'max_tokens' }])
    await call('setupStep', [4, 'local'])
    const oldScenes = JSON.stringify(engine.snapshot().settings.scenes)
    await call('generateSetupTheme', ['A bright cyan gaming studio'])
    await until(() => setup.snapshot().task.phase === 'error', 'invalid theme rejected')
    if (oldScenes !== JSON.stringify(engine.snapshot().settings.scenes)) throw new Error('An invalid theme modified the program.')
    await call('generateSetupTheme', ['A bright cyan gaming studio'])
    await until(() => setup.snapshot().task.phase === 'done' && Boolean(setup.snapshot().themeDraft), 'validated theme preview')
    await delay(150)
    const previews: number = await window.webContents.executeJavaScript("document.querySelectorAll('.theme-scenes svg').length")
    if (previews !== 4 || oldScenes !== JSON.stringify(engine.snapshot().settings.scenes)) throw new Error('Theme preview applied changes or failed to show four layouts.')
    await screenshot('style-preview.png')
    await call('applySetupTheme')
    if (engine.snapshot().settings.scenes.live.find(item => item.id === 'live-bg')?.color !== THEME_PRESETS[1]!.background) throw new Error('The validated theme did not apply.')
    await call('configureEngine', [{ ...engine.snapshot().settings, resolution: '720p', fps: 30, bitrate: 3000 }])
    await call('confirmSetup', ['visual', true]); await call('confirmSetup', ['audio', true])
    await call('setupStep', [3, 'local']); await call('testSetup', ['local'])
    window.minimize()
    await until(() => setup.snapshot().task.phase === 'done' || setup.snapshot().task.phase === 'error', 'full 15-second local test', 40)
    window.restore()
    const result = setup.snapshot().benchmark
    if (!result?.stable || result.duration < 15) throw new Error(`The full setup test did not pass: ${setup.snapshot().task.message} ${JSON.stringify(result)}`)
    if (stats.snapshot().history.length || stats.snapshot().activeId) throw new Error('Setup benchmarks polluted stream session history.')
    const sampleFile = engine.snapshot().recordingPath!
    await decode(sampleFile); await copyFile(sampleFile, join(directory, '720p-setup-test.mp4'))
    await call('applySetupRecommendation')
    await call('setupStep', [5, 'local'])
    try { await until(() => setup.snapshot().checks.every(item => !item.required || item.state === 'pass'), 'local readiness') }
    catch { throw new Error(`Local readiness did not pass: ${JSON.stringify(setup.snapshot().checks.map(item => ({ id: item.id, state: item.state, required: item.required })))}`) }
    if (setup.snapshot().checks.find(item => item.id === 'twitch')?.state !== 'info') throw new Error('Local setup falsely verified Twitch.')
    await call('finishSetup', [false])
    const restored = new SetupStore(app.getPath('userData')); await restored.load()
    if (!restored.data.completed || restored.data.goal !== 'local' || restored.data.step !== 5) throw new Error('Completed setup did not persist.')
    const localSetupMs = Date.now() - started
    if (localSetupMs >= 300000) throw new Error('Fresh local setup exceeded five minutes.')
    await screenshot('ready-local.png')
    await call('setupStep', [5, 'twitch']); await call('finishSetup', [true], false)
    if (engine.snapshot().mode) throw new Error('A local test unlocked public Twitch output.')
    await call('setupStep', [5, 'local']); await call('finishSetup', [true])
    await until(() => engine.snapshot().encodedFrames > 40, 'ready button starts local recording')
    await engine.stopOutput(); await decode(engine.snapshot().recordingPath!)
    if (stats.snapshot().activeId || stats.snapshot().history.length !== 1) throw new Error('The ready button recording was not tracked separately from setup benchmarks.')
    const beforeRepair = JSON.stringify(engine.snapshot().settings)
    await call('repairSetup')
    await until(() => setup.snapshot().task.phase === 'done' && !engine.setupRepairActive, 'repair diagnostics')
    if (setup.snapshot().benchmark || setup.snapshot().completed || JSON.stringify(engine.snapshot().settings) !== beforeRepair || setup.snapshot().diagnostics.some(item => item.state === 'fail')) throw new Error('Repair changed settings, retained stale approval or failed a local diagnostic.')
    await writeFile(join(directory, 'report.json'), JSON.stringify({ flow: 'Fresh local setup; no real Twitch or model used', localSetupMs, actualOwnWindowFrames: true, noHardwareCaptureByDiscovery: true, fullSample: result,
      cancelledSampleRejected: true, localCannotUnlockTwitch: true, themeRequests, fourPreviews: previews, persisted: true, decodedResolution: '1280x720', repair: setup.snapshot().diagnostics }, null, 2))
    console.log('RapidCast setup smoke passed: six-step fresh local setup under five minutes, explicit own-window selection, no hardware discovery capture, full 15s encoding, cancellation/locks, data-only AI style/four previews, 720p H.264/AAC, persistence/readiness and nondestructive Repair. No real Twitch or model.')
  } finally { await engine.pause(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }); if (ai.snapshot().job.phase === 'publishing') console.warn('A separate AI publish was still finishing.') }
}
