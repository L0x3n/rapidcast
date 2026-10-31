import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, writeFile, copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Engine } from '../engine/controller'
import { ffmpegPath } from '../engine/encoder'
import type { Studio } from '../studio'
import type { Widgets } from './service'

async function until(check: () => boolean, description: string, seconds = 15): Promise<void> {
  const deadline = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > deadline) throw new Error(`Widget smoke timed out: ${description}`); await delay(80) }
}
function faulty(name: string, body: string): string {
  return `export default { meta:{name:'${name}',description:'Native fault test',defaultSize:{w:120,h:120},params:{}},init(){},update(){},draw(ctx,w,h){${body}} };`
}
async function png(window: BrowserWindow, path: string): Promise<void> {
  const value: string = await window.webContents.executeJavaScript("document.querySelector('canvas').toDataURL('image/png')")
  await writeFile(path, Buffer.from(value.split(',')[1]!, 'base64'))
}
export async function widgetSmoke(window: BrowserWindow, engine: Engine, studio: Studio, widgets: Widgets): Promise<void> {
  const directory = join(__dirname, '../widget-smoke')
  await mkdir(directory, { recursive: true })
  studio.clearSimulations(); await studio.selectScene('live')
  await engine.preview()
  await until(() => (engine.snapshot().telemetry?.capabilities.some(item => /^widget-frames:[1-9]/.test(item))) === true, 'compositor widget frames')
  const host = engine.window!
  const frames = host.webContents.mainFrame.framesInSubtree
  const runtime = frames.find(frame => frame.url.includes('/runtime/frame'))
  if (!runtime || runtime.processId === host.webContents.mainFrame.processId) throw new Error('Widgets did not run in a separate renderer process.')
  const runtimeProcess = runtime.processId
  const boundary: unknown = await runtime.executeJavaScript("typeof require==='undefined'&&typeof process==='undefined'&&typeof window.rapidcast==='undefined'&&typeof window.compositor==='undefined'")
  if (boundary !== true) throw new Error('Widget runtime has access to a privileged preload.')
  console.log('Widget smoke: isolated runtime running; checking independent Worker CSP.')
  const obs = new BrowserWindow({ width: 1100, height: 700, show: true, title: 'RapidCast OBS overlay test', backgroundColor: '#18211a',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: 'rapidcast-overlay-test' } })
  try {
    await obs.loadURL(`${widgets.server.baseUrl}/overlay/program`)
    const probe: { networkBlocked: boolean; evalBlocked: boolean; nodeHidden: boolean; domHidden: boolean } = await obs.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const worker=new Worker('/security-probe.mjs',{type:'module'});
      const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Probe timeout'));},4000);
      worker.onmessage=event=>{clearTimeout(timeout);worker.terminate();resolve(event.data);};
      worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(new Error('Probe worker failed'));};
    })`)
    if (!probe.networkBlocked || !probe.evalBlocked || !probe.nodeHidden || !probe.domHidden || widgets.server.probeRequests) throw new Error('Worker runtime network/eval/DOM/Node isolation failed.')
    await delay(1200)
    const alpha: number = await obs.webContents.executeJavaScript("document.querySelector('canvas').getContext('2d').getImageData(0,0,1,1).data[3]")
    if (alpha !== 0) throw new Error('OBS scene background was not transparent.')
    await engine.startOutput('record')
    await until(() => engine.snapshot().encodedFrames > 0, 'recording startup')
    const before = engine.snapshot().encodedFrames
    studio.simulate('follow')
    await until(() => widgets.snapshot().statuses.some(status => status.id === 'widget-live-alerts' && status.triggers > 0), 'follow trigger')
    await delay(600)
    const bright: number = await host.webContents.executeJavaScript(`(()=>{const data=document.querySelector('canvas').getContext('2d').getImageData(580,60,760,260).data;let found=0;for(let i=0;i<data.length;i+=4)if(data[i]>140&&data[i+1]>180&&data[i+2]<140)found++;return found;})()`)
    if (bright < 100) throw new Error('The follow alert did not appear on the compositor canvas.')
    await png(host, join(directory, 'follow-program.png'))
    await png(obs, join(directory, 'follow-obs.png'))
    window.minimize()
    const failures: { name: string; reason: string }[] = []
    for (const [name, body] of [['Crash test', "throw new Error('Deliberate crash');"], ['Infinite loop test', 'while(true){}']]) {
      const definition = await widgets.install(faulty(name!, body!))
      await widgets.add(definition, 'live')
      const instance = widgets.store.instances.at(-1)!
      await until(() => widgets.store.instances.find(item => item.id === instance.id)?.disabled === true, name!, 6)
      failures.push({ name: name!, reason: instance.reason })
      if (!engine.snapshot().mode || engine.snapshot().phase === 'error') throw new Error('A faulty widget interrupted the recording.')
    }
    await until(() => engine.snapshot().encodedFrames > before + 80, 'recording surviving widget failures')
    for (const mode of ['fade', 'swipe', 'cut'] as const) {
      await widgets.setTransition(mode); await studio.selectScene('brb'); await delay(550); await studio.selectScene('live'); await delay(550)
      if (engine.snapshot().phase === 'error' || engine.snapshot().mode !== 'record') throw new Error('A scene transition interrupted output.')
    }
    await png(host, join(directory, 'paused-badges.png'))
    const widgetFrames = (): number => Number(engine.snapshot().telemetry?.capabilities.find(item => item.startsWith('widget-frames:'))?.split(':')[1] ?? 0)
    const framesBeforeLoss = widgetFrames()
    await host.webContents.executeJavaScript("document.querySelector('iframe').remove()")
    await until(() => widgets.store.instances.every(item => item.disabled), 'runtime heartbeat isolation', 10)
    if (engine.snapshot().mode !== 'record') throw new Error('Losing the widget runtime interrupted output.')
    await widgets.restart('widget-live-chat')
    await until(() => widgets.snapshot().statuses.some(item => item.id === 'widget-live-chat' && item.state === 'ready'), 'runtime recovery')
    await until(() => widgetFrames() > framesBeforeLoss && engine.snapshot().telemetry?.capabilities.includes('widgets-ready:1') === true, 'recovered compositor frames')
    const ended = engine.snapshot()
    await engine.stopOutput()
    const file = engine.snapshot().recordingPath
    if (!file || (await stat(file)).size < 10000) throw new Error('The widget test did not record an MP4.')
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath(), ['-hide_banner', '-i', file, '-f', 'null', '-'], { windowsHide: true, timeout: 20000 },
      (error, _stdout, stderr) => error || !/Video: h264/.test(stderr) || !/Audio: aac/.test(stderr) ? reject(new Error('The widget recording did not decode.')) : resolve()))
    await copyFile(file, join(directory, 'widgets.mp4'))
    await writeFile(join(directory, 'report.json'), JSON.stringify({ probe, compositorProcess: host.webContents.mainFrame.processId, runtimeProcess,
      alpha, bright, failures, runtimeRecovered: true, encodedFrames: ended.encodedFrames, telemetry: ended.telemetry, hotkeys: widgets.snapshot().hotkeys }, null, 2))
    window.restore()
    await window.webContents.executeJavaScript("document.querySelector('[data-tab=studio]').click();document.querySelector('.page-content').scrollTop=0")
    await delay(600)
    console.log('RapidCast widget smoke passed: follow on program, transparent OBS overlay, separate process, Worker CSP, crash/loop watchdogs, transitions and uninterrupted H.264/AAC recording.')
  } finally { obs.destroy(); await engine.pause() }
}
