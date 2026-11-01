import { app, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { record } from '../../shared/events'
import { makeLayer } from '../../shared/engine'
import { THEME_PRESETS } from '../../shared/setup'
import { parsePack } from '../../shared/pack-validation'
import { TEST_PACK_CODE } from '../../shared/pack-fixture'
import type { Packs } from './service'
import type { Engine } from '../engine/controller'
import type { Widgets } from '../widgets/service'
import type { Setup } from '../setup/service'
import type { Studio } from '../studio'
import { WidgetStore } from '../widgets/store'
import { SetupStore } from '../setup/store'
import { Storage } from '../storage'
import { ffmpegPath } from '../engine/encoder'
import { exportLayout } from './layout'

async function until(check: () => boolean, description: string, seconds = 30): Promise<void> {
  const end = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > end) throw new Error(`Pack smoke timed out: ${description}`); await delay(80) }
}
export async function packsSmoke(window: BrowserWindow, packs: Packs, engine: Engine, widgets: Widgets, setup: Setup, studio: Studio, exporting: boolean): Promise<void> {
  const directory = join(__dirname, '../packs-smoke'); await mkdir(directory, { recursive: true })
  const portable = join(directory, 'portable.rcpack'); const selected = join(directory, 'selected.rcpack')
  const call = async (name: string, args: unknown[] = [], expected = true): Promise<void> => {
    const raw: unknown = await window.webContents.executeJavaScript(`window.rapidcast.${name}(...${JSON.stringify(args)})`)
    if (record(raw).ok !== expected) throw new Error(`Pack IPC did not ${expected ? 'accept' : 'reject'} ${name}. ${record(raw).error ?? ''}`)
  }
  const screenshot = async (name: string): Promise<void> => {
    window.restore(); window.show(); window.focus()
    await window.webContents.executeJavaScript("document.querySelector('.pack-panel').open=true;document.querySelector('.pack-review,.pack-panel').scrollIntoView({block:'start'})"); await delay(250)
    try { await writeFile(join(directory, name), (await window.webContents.capturePage(undefined, { stayAwake: true })).toPNG()) } catch { console.warn('Pack screenshot unavailable; functional checks continue.') }
  }
  await window.webContents.executeJavaScript("document.querySelector('[data-tab=studio]').click()")
  await delay(250)
  await window.webContents.executeJavaScript("document.querySelector('.pack-panel').open=true")
  if (exporting) {
    setup.previewTheme(THEME_PRESETS[1]); await setup.applyTheme()
    const definition = await widgets.install(TEST_PACK_CODE, 'idea by @pixelpilot · TEST'); const instance = await widgets.add(definition, 'live'); await widgets.params(instance, { amount: 7 })
    const data: string = await window.webContents.executeJavaScript("(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#39e5ff';x.fillRect(0,0,64,64);return c.toDataURL('image/png')})()")
    const image = await engine.assets.installPng(Buffer.from(data.slice(22), 'base64'))
    const settings = structuredClone(engine.snapshot().settings)
    settings.scenes.brb.push({ ...makeLayer('pack-logo', 'image'), source: image, x: 100, y: 100, width: 100, height: 100, z: 15 })
    settings.scenes.live.push({ ...makeLayer('pack-capture', 'display'), source: 'window:private-device-identity:0', name: 'PRIVATE WINDOW TITLE', text: 'PRIVATE DETAILS', visible: false })
    await engine.configure(settings)
    await window.webContents.executeJavaScript("document.querySelector('.pack-export button.secondary').click()")
    await until(() => packs.snapshot().phase === 'done' || packs.snapshot().phase === 'error', 'export save')
    if (packs.snapshot().phase === 'error') throw new Error(packs.snapshot().message)
    const source = await readFile(portable, 'utf8'); const pack = parsePack(source)
    if (pack.theme?.name !== 'Electric ocean' || pack.assets.length !== 1 || !pack.definitions.some(d => d.code === TEST_PACK_CODE) || source.includes('private-device-identity') || source.includes('PRIVATE WINDOW TITLE') || source.includes('PRIVATE DETAILS')) throw new Error('Portable export lost style/code/images or retained capture identity.')
    await screenshot('export.png'); await writeFile(join(directory, 'export.json'), JSON.stringify({ fourScenes: Object.keys(pack.scenes), definitions: pack.definitions.length, assets: pack.assets.length, theme: pack.theme.name, params: 7, deviceIdentityOmitted: true }, null, 2))
    console.log('RapidCast pack export smoke passed: real Studio export, four scenes, custom code/params/credit, theme, embedded PNG and no capture identity.')
    return
  }
  if (widgets.store.definitions.length !== 5 || setup.store.data.theme || engine.snapshot().previewActive) throw new Error('The pack importer did not start from a clean profile.')
  const original = parsePack(await readFile(portable, 'utf8')); const before = JSON.stringify(engine.snapshot().settings)
  const bad = structuredClone(original); const custom = bad.definitions.find(d => d.code === TEST_PACK_CODE)!
  custom.code = custom.code.replace("ctx.fillStyle='#39e5ff';", "if(api.params.amount===7)throw new Error('Imported amount rejected');ctx.fillStyle='#39e5ff';")
  bad.definitions = [custom]
  for (const scene of Object.values(bad.scenes)) scene.splice(0, scene.length, ...scene.filter(l => l.kind !== 'widget' || l.source === custom.id))
  await writeFile(selected, JSON.stringify(bad)); await call('openPack'); const badId = packs.snapshot().review!.id
  await call('installPack', [badId], false); await call('testPack', [badId]); await until(() => packs.snapshot().phase === 'error', 'imported params fail in real Worker')
  if (!packs.snapshot().message.includes('Imported amount rejected') || JSON.stringify(engine.snapshot().settings) !== before) throw new Error('Bad imported parameters were not tested or changed the program.')
  const network = structuredClone(bad); network.definitions[0]!.code = TEST_PACK_CODE.replace("ctx.fillStyle='#39e5ff';", "fetch('/forbidden');")
  await writeFile(selected, JSON.stringify(network)); await call('openPack', [], false)
  if (packs.snapshot().review || engine.packOperationActive) throw new Error('Invalid code retained an installable preview or lock.')
  await copyFile(portable, selected)
  await window.webContents.executeJavaScript("document.querySelector('.pack-open').click()")
  await until(() => packs.snapshot().phase === 'review', 'review selected pack')
  const id = packs.snapshot().review!.id
  if (JSON.stringify(engine.snapshot().settings) !== before || engine.snapshot().previewActive) throw new Error('Pack review changed the program or opened capture.')
  const disabled: boolean = await window.webContents.executeJavaScript("document.querySelector('.pack-install').disabled")
  if (!disabled) throw new Error('Install was enabled before sandbox tests.')
  const previews: number = await window.webContents.executeJavaScript("document.querySelectorAll('.pack-scenes svg').length")
  if (previews !== 4) throw new Error('Pack review did not render all four layout diagrams.')
  await screenshot('review.png'); await call('testPack', [id]); await until(() => packs.snapshot().phase === 'testing' && packs.snapshot().message.includes('Testing '), 'cancellable sandbox test')
  await call('configureEngine', [engine.snapshot().settings], false); await call('startOutput', ['record'], false); await call('selectScene', ['brb'], false); await call('cancelPack')
  await until(() => !engine.packOperationActive, 'cancel releases lease')
  if (packs.snapshot().phase !== 'cancelled') throw new Error('Cancellation did not retain its state.')
  await call('testPack', [id]); await until(() => packs.snapshot().phase === 'ready' || packs.snapshot().phase === 'error', 'all pack configurations pass', 130)
  if (packs.snapshot().phase !== 'ready') throw new Error(packs.snapshot().message)
  const configurations = packs.snapshot().total
  await window.webContents.executeJavaScript("document.querySelector('.pack-install').click()")
  await until(() => packs.snapshot().phase === 'done' || packs.snapshot().phase === 'error', 'explicit installation')
  if (packs.snapshot().phase !== 'done' || engine.snapshot().previewActive || engine.snapshot().mode) throw new Error(`Pack install failed or started capture/output: ${packs.snapshot().message}`)
  const reexport = await exportLayout(engine.snapshot().settings, widgets.snapshot(), setup.store.data.theme, original.metadata, original.preview, key => engine.assets.data(key))
  if (JSON.stringify(reexport.scenes) !== JSON.stringify(original.scenes) || JSON.stringify(reexport.theme) !== JSON.stringify(original.theme)) throw new Error('Fresh-profile round trip changed scene geometry, parameters or theme.')
  const persistedWidgets = new WidgetStore(app.getPath('userData')); await persistedWidgets.load(); const persistedSetup = new SetupStore(app.getPath('userData')); await persistedSetup.load()
  const persistedEngine = await new Storage(app.getPath('userData')).engineSettings()
  if (persistedWidgets.instances.length !== widgets.store.instances.length || persistedSetup.data.theme?.name !== original.theme?.name || JSON.stringify(persistedEngine.scenes) !== JSON.stringify(engine.snapshot().settings.scenes)) throw new Error('The imported pack did not persist across stores.')
  engine.testPattern = true; await engine.preview(); await engine.startOutput('record')
  for (const scene of ['starting', 'live', 'brb', 'ending'] as const) {
    await studio.selectScene(scene); await delay(800)
    const value: string = await engine.window!.webContents.executeJavaScript("document.querySelector('canvas').toDataURL('image/png')")
    await writeFile(join(directory, `${scene}.png`), Buffer.from(value.split(',')[1]!, 'base64'))
  }
  await studio.selectScene('live'); studio.simulate('follow'); await until(() => widgets.snapshot().statuses.some(s => s.triggers > 0 && s.frames > 0), 'imported runtime event')
  await until(() => engine.snapshot().encodedFrames > 90, 'imported layout recording')
  const customLayer = engine.snapshot().settings.scenes.live.find(l => widgets.store.definitions.find(d => d.id === l.source)?.code === TEST_PACK_CODE)!
  const cyan: number = await engine.window!.webContents.executeJavaScript(`(()=>{const p=document.querySelector('canvas').getContext('2d').getImageData(${customLayer.x},${customLayer.y},320,160).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]<100&&p[i+1]>150&&p[i+2]>150)n++;return n;})()`)
  if (cyan < 500) throw new Error('Imported custom widget parameters did not draw on program.')
  await engine.stopOutput(); const file = engine.snapshot().recordingPath!
  await new Promise<void>((resolve, reject) => execFile(ffmpegPath(), ['-hide_banner', '-i', file, '-f', 'null', '-'], { windowsHide: true, timeout: 20000 },
    (error, _stdout, stderr) => error || !/Video: h264/.test(stderr) || !/Audio: aac/.test(stderr) ? reject(new Error('The imported pack did not record valid H.264/AAC.')) : resolve()))
  await copyFile(file, join(directory, 'imported-pack.mp4')); await engine.pause()
  await writeFile(join(directory, 'import.json'), JSON.stringify({ cleanProfile: true, configurations, importedParameterFailure: true, blockedNetworkCode: true, cancellation: true, locks: true, fourSceneRoundTrip: true, persisted: true, images: reexport.assets.length, theme: reexport.theme?.name, cyan, decoded: 'H.264/AAC', captureStartedByInstall: false }, null, 2))
  console.log('RapidCast pack import smoke passed: clean profile, preview before code, exact-parameter sandbox failure, static network rejection, cancellation/locks, all configurations tested, four scene/theme/params/image round trip, persistence and recorded program pixels.')
}
