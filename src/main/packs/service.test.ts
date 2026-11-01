import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Packs } from './service'
import { Studio } from '../studio'
import { Storage } from '../storage'
import { Engine } from '../engine/controller'
import { Widgets } from '../widgets/service'
import { Setup } from '../setup/service'
import { AiService } from '../ai/service'
import { SandboxTest } from '../ai/sandbox'
import { packFixture, TEST_PACK_CODE, TEST_PNG } from '../../shared/pack-fixture'
import { makeLayer } from '../../shared/engine'
import { checkPng } from './images'

vi.mock('electron', () => {
  const image = (bytes: Buffer): object => ({ isEmpty: () => false, getSize: () => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }), toPNG: () => bytes, resize: () => image(bytes) })
  return { BrowserWindow: class {}, safeStorage: {}, clipboard: {}, globalShortcut: {}, shell: {}, powerSaveBlocker: {}, dialog: {}, nativeImage: { createFromBuffer: (bytes: Buffer) => image(bytes), createFromDataURL: (value: string) => image(Buffer.from(value.slice(22), 'base64')) } }
})
vi.mock('../engine/encoder', () => ({ probeNvenc: vi.fn(), Encoder: class {} }))
const fixtures: { directory: string; packs: Packs }[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) { await f.packs.close(); await rm(f.directory, { recursive: true, force: true }) }; vi.restoreAllMocks() })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'rapidcast-packs-')); const storage = new Storage(directory); const studio = new Studio(storage, vi.fn())
  const engine = new Engine(storage, directory, directory, async () => '', vi.fn()); vi.spyOn(engine, 'pause').mockResolvedValue()
  const widgets = new Widgets(directory, engine, studio, 'file:', vi.fn(), true); const ai = new AiService(directory, widgets, engine, studio, vi.fn()); const setup = new Setup(directory, engine, studio, widgets, ai, vi.fn())
  const path = join(directory, 'fixture.rcpack'); const out = join(directory, 'export.rcpack'); await writeFile(path, JSON.stringify(packFixture()))
  const sandbox = new SandboxTest(widgets); const run = vi.spyOn(sandbox, 'run').mockResolvedValue({ id: 'tested', url: '', frames: 90 })
  const packs = new Packs(directory, engine, widgets, setup, ai, '0.5.0', { open: async () => path, save: async () => out }, vi.fn(), sandbox)
  await storage.saveEngineSettings(engine.snapshot().settings); await widgets.store.save(); await setup.store.save(); fixtures.push({ directory, packs })
  return { directory, path, out, packs, engine, widgets, ai, setup, run }
}
describe('reviewed pack installation', () => {
  it('rejects malformed PNGs and oversized dimensions before invoking the image decoder', () => {
    expect(() => checkPng('data:image/png;base64,YWJj')).toThrow('invalid header')
    const bytes = Buffer.from(TEST_PNG.slice(22), 'base64'); bytes.writeUInt32BE(3000, 16)
    expect(() => checkPng(`data:image/png;base64,${bytes.toString('base64')}`)).toThrow('dimensions')
  })
  it('does not run code while reviewing, and requires tests before any layout mutation', async () => {
    const { packs, engine, run } = await fixture(); const before = JSON.stringify(engine.snapshot().settings)
    await packs.open(); expect(packs.snapshot().phase).toBe('review'); expect(run).not.toHaveBeenCalled()
    expect(JSON.stringify(engine.snapshot().settings)).toBe(before)
    expect(() => packs.install(packs.snapshot().review!.id)).toThrow('sandbox tests')
  })
  it('tests exact imported params/dimensions, installs atomically and preserves host output/audio', async () => {
    const { packs, engine, widgets, setup, directory, run } = await fixture(); engine.snapshot().settings.audio.micId = 'local-mic'; engine.snapshot().settings.bitrate = 4500
    await packs.open(); const id = packs.snapshot().review!.id; packs.test(id); await vi.waitFor(() => expect(packs.snapshot().phase).toBe('ready'))
    expect(run).toHaveBeenCalledWith(TEST_PACK_CODE, expect.any(AbortSignal), { params: { amount: 7 }, width: 320, height: 160 })
    await packs.install(id)
    expect(engine.packOperationActive).toBe(false); expect(packs.snapshot().phase).toBe('done')
    expect(engine.snapshot().settings).toMatchObject({ bitrate: 4500, audio: { micId: 'local-mic' } })
    const layer = engine.snapshot().settings.scenes.live.find(l => l.kind === 'widget')!
    expect(layer.id).toMatch(/^pack-/); expect(layer.text).toBe('idea by @pixelpilot · TEST'); expect(widgets.store.instances.find(i => i.id === layer.id)?.params).toEqual({ amount: 7 })
    expect(setup.store.data).toMatchObject({ completed: false, visualSignature: '', audioSignature: '', benchmark: null, theme: { name: 'Rapid neon' } })
    expect(JSON.parse(await readFile(join(directory, 'engine.json'), 'utf8')).scenes.live).toEqual(engine.snapshot().settings.scenes.live)
  })
  it('cancels a running test, releases locks and rejects a late result', async () => {
    const { packs, engine, run, widgets } = await fixture(); let answer: (value: { id: string; url: string; frames: number }) => void = () => undefined
    run.mockImplementationOnce(() => new Promise(resolve => { answer = resolve })); await packs.open(); const id = packs.snapshot().review!.id; packs.test(id)
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce()); expect(engine.packOperationActive).toBe(true)
    await expect(engine.configure(engine.snapshot().settings)).rejects.toThrow('pack task'); await expect(widgets.add('builtin-chat', 'live')).rejects.toThrow('pack task')
    await expect(engine.startOutput('record')).rejects.toThrow('pack task'); packs.cancel(); answer({ id: 'late', url: '', frames: 90 })
    await vi.waitFor(() => expect(engine.packOperationActive).toBe(false)); expect(packs.snapshot().phase).toBe('cancelled'); expect(() => packs.install(id)).toThrow('sandbox tests')
  })
  it('keeps the layout on preflight failure or invalid files and blocks work while output runs', async () => {
    const { packs, engine, run, path } = await fixture(); await packs.open(); const id = packs.snapshot().review!.id
    engine.snapshot().mode = 'record'; expect(() => packs.test(id)).toThrow('Stop output'); engine.snapshot().mode = null
    const before = JSON.stringify(engine.snapshot().settings); run.mockRejectedValueOnce(new Error('Widget threw with imported params.')); packs.test(id)
    await vi.waitFor(() => expect(packs.snapshot().phase).toBe('error')); expect(JSON.stringify(engine.snapshot().settings)).toBe(before); expect(engine.packOperationActive).toBe(false)
    await writeFile(path, '{"format":"other"}'); await expect(packs.open()).rejects.toThrow('version 1'); expect(packs.snapshot().review).toBeNull()
  })
  it('exports only portable data, normalizes images and unbinds capture placeholders', async () => {
    const { packs, engine, widgets, ai, out } = await fixture(); const definition = widgets.store.install(TEST_PACK_CODE); const id = 'instance'; widgets.store.create(id, definition, { amount: 7 })
    engine.snapshot().settings.scenes.live.push({ ...makeLayer(id, 'widget'), source: definition.id, width: 320, height: 160 }, { ...makeLayer('private', 'display'), source: 'window:private-source:0', name: 'private-window-title' })
    const image = await engine.assets.installPng(Buffer.from(TEST_PNG.slice(22), 'base64')); engine.snapshot().settings.scenes.brb.push({ ...makeLayer('logo', 'image'), source: image })
    vi.spyOn(ai.store, 'secret', 'get').mockReturnValue('host-only-secret')
    await packs.export({ name: 'Shareable', author: 'Tester', description: 'Portable look', preview: TEST_PNG }); const source = await readFile(out, 'utf8'); const pack = JSON.parse(source)
    expect(source).not.toContain('host-only-secret'); expect(source).not.toContain('private-source'); expect(source).not.toContain('private-window-title'); expect(source).not.toContain('micId'); expect(source).not.toContain('bitrate')
    expect(pack.scenes.live.find((l: { kind: string }) => l.kind === 'display')).toMatchObject({ source: '', visible: false }); expect(pack.assets).toHaveLength(1); expect(pack.scenes.brb.at(-1).source).toBe('image-0')
  })
})
