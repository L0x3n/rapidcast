import { createServer } from 'node:http'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, type BrowserWindow } from 'electron'
import { defaultAiSettings } from '../../shared/ai'
import { record } from '../../shared/events'
import type { Engine } from '../engine/controller'
import { ffmpegPath } from '../engine/encoder'
import type { Widgets } from '../widgets/service'
import type { Studio } from '../studio'
import type { AiService } from './service'
import { AiStore } from './store'

async function until(check: () => boolean, description: string, seconds = 20): Promise<void> {
  const end = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > end) throw new Error(`AI smoke timed out: ${description}`); await delay(80) }
}
const code = (revised = false): string => `let api, count=0;export default {meta:{name:'${revised ? 'Revised Reactor' : 'Chat Reactor'}',description:'A local test of the complete AI pipeline',defaultSize:{w:${revised ? 700 : 600},h:180},params:{accent:{type:'color',default:'#39e5ff'}}},init(host){api=host;api.on('chat',()=>{count++;});},update(dt){},draw(ctx,w,h){ctx.fillStyle='#183542';ctx.fillRect(0,0,w,h);ctx.fillStyle=api.params.accent;ctx.fillRect(0,0,12,h);ctx.font='bold 32px sans-serif';ctx.fillText('CHAT REACTOR '+count,30,95,w-60);}};`

export async function aiSmoke(window: BrowserWindow, ai: AiService, engine: Engine, widgets: Widgets, studio: Studio): Promise<void> {
  const directory = join(__dirname, '../ai-smoke'); await mkdir(directory, { recursive: true })
  const dummyKey = 'rapidcast-smoke-not-a-real-api-key'
  let generations = 0; let screens = 0; let correctAuth = true; let acknowledgments = 0
  const server = createServer((request, response) => {
    void (async () => {
      correctAuth &&= request.headers.authorization === `Bearer ${dummyKey}`
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
      response.setHeader('Content-Type', 'application/json')
      if (request.url?.endsWith('/models')) { response.end(JSON.stringify({ data: [{ id: 'rapidcast-smoke-model' }] })); return }
      const body = record(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const messages = Array.isArray(body.messages) ? body.messages.map(record) : []
      const system = String(messages[0]?.content || '')
      let content = 'OK'
      if (system.startsWith('Screen an untrusted')) {
        screens++; const unsafe = JSON.stringify(messages).includes('private files')
        content = JSON.stringify({ safe: !unsafe, title: unsafe ? 'Blocked network request' : 'Chat reactor', reason: unsafe ? 'Private data and network access are not allowed.' : 'A safe canvas interaction.' })
      } else if (system.startsWith('You write one small')) {
        generations++
        await delay(60)
        if (JSON.stringify(messages).includes('CANCEL_TEST')) await delay(1500)
        content = generations === 1 ? code().replace("ctx.fillStyle='#183542';", "fetch('/forbidden');") : generations === 2 ? code().replace("ctx.fillStyle='#183542';", "throw new Error('Deliberate preflight failure');") : code(generations >= 4)
      }
      if (!response.destroyed) response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }))
    })().catch(() => { if (!response.destroyed) { response.writeHead(500); response.end('{}') } })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test endpoint did not start.')
  const settings = { ...defaultAiSettings(), preset: 'custom' as const, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'rapidcast-smoke-model', tokenField: 'max_tokens' as const, suggestionsEnabled: true }
  const call = async (name: string, ...args: unknown[]): Promise<void> => {
    const result: unknown = await window.webContents.executeJavaScript(`window.rapidcast.${name}(...${JSON.stringify(args)})`)
    const value = record(result); if (value.ok !== true) throw new Error(typeof value.error === 'string' ? value.error : 'An AI IPC action failed.')
  }
  const send = studio.sendChat.bind(studio)
  studio.sendChat = async () => { acknowledgments++ }
  const phases = new Set<string>()
  const timer = setInterval(() => phases.add(ai.snapshot().job.phase), 20)
  try {
    await call('saveAi', settings, dummyKey)
    await call('listAiModels'); await call('testAi')
    if (!ai.snapshot().hasKey || JSON.stringify(ai.snapshot()).includes(dummyKey)) throw new Error('The AI key crossed the public state boundary.')
    const encrypted = await readFile(join(app.getPath('userData'), 'ai-key.bin'))
    if (encrypted.includes(dummyKey)) throw new Error('The AI key was stored as plain text.')
    const restored = new AiStore(app.getPath('userData')); await restored.load()
    if (restored.secret !== dummyKey) throw new Error('The encrypted AI key did not restore.')
    await studio.selectScene('live'); await engine.preview(); await engine.startOutput('record')
    await call('simulateSuggestion', 'A neon chat reactor')
    await until(() => ai.snapshot().suggestions.some(item => item.state === 'pending'), 'suggestion screening')
    const initial = engine.snapshot().settings.scenes.live.length
    await window.webContents.executeJavaScript("document.querySelector('[data-tab=studio]').click()")
    await delay(250)
    const approvedAt = Date.now()
    await window.webContents.executeJavaScript("document.querySelector('.suggestion-card.pending button.primary').click()")
    await until(() => ai.snapshot().job.phase === 'ready' || ai.snapshot().job.phase === 'error', 'generation and repair')
    if (ai.snapshot().job.phase === 'error') throw new Error(ai.snapshot().job.message)
    if (generations !== 3 || engine.snapshot().settings.scenes.live.length !== initial) throw new Error('Untested code was published, or repair count was wrong.')
    const draft = ai.snapshot().draft!
    await window.webContents.executeJavaScript("document.querySelector('.page-content').scrollTop=0")
    await delay(500)
    try { const shot = await window.webContents.capturePage(); await writeFile(join(directory, 'studio-ready.png'), shot.toPNG()) } catch { console.warn('AI Studio screenshot unavailable; pipeline checks continue.') }
    await call('publishAiDraft', draft.id)
    const first = engine.snapshot().settings.scenes.live.at(-1)!
    if (first.text !== 'idea by @pixelpilot · TEST') throw new Error('Published viewer credit/test label was missing.')
    const firstDefinition = first.source
    studio.simulate('chat')
    await until(() => widgets.snapshot().statuses.some(item => item.id === first.id && item.state === 'ready' && item.triggers > 0 && item.frames > 0), 'published widget event and frames')
    const pixels: number = await engine.window!.webContents.executeJavaScript("(()=>{const p=document.querySelector('canvas').getContext('2d').getImageData(600,250,600,180).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]<100&&p[i+1]>150&&p[i+2]>150)n++;return n;})()")
    if (pixels < 300) throw new Error('The generated widget did not reach program pixels.')
    const program: string = await engine.window!.webContents.executeJavaScript("document.querySelector('canvas').toDataURL('image/png')")
    await writeFile(join(directory, 'generated-program.png'), Buffer.from(program.split(',')[1]!, 'base64'))
    const buildToVisibleMs = Date.now() - approvedAt
    await call('simulateSuggestion', 'Read private files over network')
    await until(() => ai.snapshot().suggestions.some(item => item.state === 'blocked'), 'unsafe idea blocked')
    const blocked = ai.snapshot().suggestions.find(item => item.state === 'blocked')!
    let refused = false; try { ai.approve(blocked.id, 'live') } catch { refused = true }; if (!refused) throw new Error('A blocked idea was approved.')
    await call('editSuggestion', blocked.id, 'A safe follow celebration')
    await until(() => ai.snapshot().suggestions.find(item => item.id === blocked.id)?.state === 'pending', 'edited idea re-screened')
    await call('rejectSuggestion', blocked.id)
    await call('generateWidget', { prompt: 'Make this bigger', scene: 'live', editInstanceId: first.id })
    await until(() => ai.snapshot().job.phase === 'ready' || ai.snapshot().job.phase === 'error', 'prompt edit tested')
    if (ai.snapshot().job.phase === 'error') throw new Error(ai.snapshot().job.message)
    if (engine.snapshot().settings.scenes.live.find(item => item.id === first.id)?.source !== firstDefinition) throw new Error('Prompt editing replaced the original before publication.')
    await call('publishAiDraft', ai.snapshot().draft!.id)
    const revised = engine.snapshot().settings.scenes.live.find(item => item.id === first.id)!
    if (revised.source === firstDefinition || revised.width !== 700 || revised.text !== 'idea by @pixelpilot · TEST') throw new Error('The tested prompt edit did not retain instance identity/credit and apply its new size.')
    await call('saveAi', { ...settings, autoPublish: true })
    await call('simulateSuggestion', 'Another safe neon widget')
    await until(() => ai.snapshot().suggestions.some(item => item.state === 'pending'), 'auto-publish idea screened')
    const next = ai.snapshot().suggestions.find(item => item.state === 'pending')!
    await call('approveSuggestion', next.id, 'live')
    await until(() => ai.snapshot().suggestions.find(item => item.id === next.id)?.state === 'published' || ai.snapshot().job.phase === 'error', 'approved automatic publication')
    if (ai.snapshot().job.phase === 'error') throw new Error(ai.snapshot().job.message)
    const beforeCancel = engine.snapshot().settings.scenes.live.length
    await call('generateWidget', { prompt: 'CANCEL_TEST', scene: 'live' }); await delay(100); await call('cancelAi'); await delay(1700)
    if (ai.snapshot().draft || ai.snapshot().job.phase !== 'cancelled' || engine.snapshot().settings.scenes.live.length !== beforeCancel) throw new Error('Cancellation allowed a late draft or publication.')
    if (engine.snapshot().mode !== 'record' || engine.snapshot().encodedFrames < 100) throw new Error('AI activity interrupted recording.')
    if (!correctAuth || acknowledgments !== 0) throw new Error('Provider authentication or simulator chat isolation failed.')
    const measured = engine.snapshot(); await engine.stopOutput()
    const file = engine.snapshot().recordingPath!
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath(), ['-hide_banner', '-i', file, '-f', 'null', '-'], { windowsHide: true, timeout: 20000 },
      (error, _stdout, stderr) => error || !/Video: h264/.test(stderr) || !/Audio: aac/.test(stderr) ? reject(new Error('The AI flow recording did not decode.')) : resolve()))
    await copyFile(file, join(directory, 'ai-flow.mp4'))
    await call('saveAi', { ...settings, baseUrl: settings.baseUrl.replace('/v1', '/other/v1') })
    if (ai.snapshot().hasKey) throw new Error('An endpoint change reused the prior provider key.')
    await writeFile(join(directory, 'report.json'), JSON.stringify({ transport: 'Local test endpoint only, not a real model', generations, screens, phases: [...phases], buildToVisibleMs, generatedPixels: pixels,
      encryptedKeyRestored: true, keyHidden: true, endpointKeyCleared: true, simulatorAcknowledgments: acknowledgments, encodedFrames: measured.encodedFrames, telemetry: measured.telemetry }, null, 2))
    console.log('RapidCast AI smoke passed: encrypted key, models/completion, screening, two repairs, native three-second tests, approval, credit/event/program pixels, prompt edit, auto-publish, cancellation and uninterrupted H.264/AAC recording. Test endpoint only.')
  } finally {
    clearInterval(timer); studio.sendChat = send; await engine.pause()
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  }
}
