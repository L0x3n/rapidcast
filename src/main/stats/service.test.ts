import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Stats } from './service'
import { Studio } from '../studio'
import { Engine } from '../engine/controller'
import { Storage } from '../storage'
import { record } from '../../shared/events'

vi.mock('electron', () => ({ BrowserWindow: class {}, safeStorage: {}, clipboard: { writeText: vi.fn() }, shell: {}, powerSaveBlocker: {} }))
vi.mock('../engine/encoder', () => ({ probeNvenc: vi.fn(), Encoder: class {} }))
const fixtures: { directory: string; stats: Stats }[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) { await f.stats.close(); await rm(f.directory, { recursive: true, force: true }) }; vi.restoreAllMocks() })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'rapidcast-metrics-'))
  const storage = new Storage(directory); const studio = new Studio(storage, state => stats?.observeStream(state))
  const engine = new Engine(storage, directory, directory, async () => '', vi.fn())
  const ai = { writeStreamReport: vi.fn().mockResolvedValue('## Test analysis\nTEST ONLY. Try one widget at a time.') }
  const stats = new Stats(directory, engine, studio, ai, vi.fn()); await stats.initialize(); fixtures.push({ directory, stats })
  return { directory, stats, studio, engine, ai }
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise<void>(resolve => setImmediate(resolve)) }
describe('session lifecycle and privacy', () => {
  it('records repeated equal viewer polls once per timestamp, preserving unknown values', async () => {
    const { stats, studio } = await fixture(); let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now)
    const stream = studio.snapshot(); stream.twitch.account = { id: 'a', login: 'a', name: 'A', broadcasterType: '' }; stream.twitch.socket = 'connected'; stream.twitch.subscriptions = [{ type: 'channel.chat.message', status: 'enabled', detail: '' }]
    stats.start('obs')
    for (const value of [10, 10, null]) { now += 1000; stream.twitch.viewers = value; stream.twitch.viewersSampleAt = now; stats.observeStream(stream); stats.observeStream(stream) }
    now += 1000; stats.stop()
    const d = stats.snapshot().view!.datasets.twitch
    expect(d.viewerSamples).toBe(2); expect(d.viewerAverage).toBe(10); expect(d.viewerTimeline.map(p => p.value)).toEqual([10, 10, null])
  })
  it('records past the UI buffer, avoids old/replayed events and persists no chat text or names', async () => {
    const { stats, studio } = await fixture(); studio.simulate('chat'); stats.start('practice')
    for (let i = 0; i < 250; i++) studio.simulate('chat')
    stats.observeStream(studio.snapshot()); stats.stop()
    expect(stats.snapshot().view?.datasets.simulator.totals.messages).toBe(250)
    const id = stats.snapshot().selectedId!; await stats.close()
    const journal = await readFile(stats.store.path(id), 'utf8')
    expect(journal).not.toContain('PixelPilot'); expect(journal).not.toContain('pixelpilot'); expect(journal).not.toContain('text')
    const loaded = await stats.store.load(id); expect(loaded.view().datasets.simulator.totals.messages).toBe(250)
    expect(record(JSON.parse(journal.split('\n')[1]!)).kind).toBe('scene')
  })
  it('tracks output start/stop automatically, excludes setup tests and protects manual sessions', async () => {
    const { stats, engine } = await fixture(); const state = engine.snapshot()
    engine.setupTestActive = true; state.mode = 'record'; stats.observeEngine(state); expect(stats.snapshot().activeId).toBeNull()
    engine.setupTestActive = false; stats.observeEngine(state); expect(stats.snapshot().view?.meta.mode).toBe('record')
    expect(() => stats.stop()).toThrow('output Stop'); expect(() => stats.start('practice')).toThrow('Stop')
    state.mode = null; state.phase = 'error'; stats.observeEngine(state)
    expect(stats.snapshot().view?.meta.status).toBe('failed'); expect(stats.snapshot().activeId).toBeNull()
    expect(() => stats.start('obs')).toThrow('Connect Twitch')
  })
  it('deduplicates confirmed triggers and ignores OBS duplicates during engine/practice output', async () => {
    const { stats, studio } = await fixture(); stats.start('practice'); studio.simulate('follow')
    const eventId = studio.snapshot().events.at(-1)!.id
    const witness = { widgetId: 'alerts', widgetName: 'Alerts', definitionId: 'builtin-alerts', eventId, source: 'simulator' as const, runtime: 'engine' as const }
    stats.trigger({ ...witness, runtime: 'obs' }); stats.trigger(witness); stats.trigger(witness); stats.stop()
    expect(stats.snapshot().view?.datasets.simulator.totals.triggers).toBe(1)
  })
  it('segments channel changes and never assigns buffered events to the next channel', async () => {
    const { stats, studio, engine } = await fixture(); const stream = studio.snapshot()
    stream.twitch.account = { id: 'channel-a', login: 'a', name: 'A', broadcasterType: '' }; stats.start('obs'); studio.simulate('chat')
    const old = stats.snapshot().activeId
    studio.snapshot().twitch.account = { id: 'channel-b', login: 'b', name: 'B', broadcasterType: '' }; stats.observeStream(studio.snapshot())
    expect(stats.snapshot().activeId).toBeNull(); expect(stats.snapshot().view?.meta.status).toBe('interrupted')
    engine.snapshot().mode = 'record'; stats.observeEngine(engine.snapshot())
    expect(stats.snapshot().activeId).not.toBe(old); expect(stats.snapshot().view?.meta.channelId).toBe('channel-b')
    engine.snapshot().mode = null; stats.observeEngine(engine.snapshot()); expect(stats.snapshot().view?.datasets.simulator.totals.messages).toBe(0)
  })
  it('keeps tracking failures separate from output, and retains measured reports on AI errors', async () => {
    const { stats, studio, engine, ai } = await fixture(); engine.snapshot().mode = 'record'; stats.observeEngine(engine.snapshot()); studio.simulate('follow')
    stats.limit('disk-error'); studio.simulate('chat'); expect(engine.snapshot().mode).toBe('record')
    engine.snapshot().mode = null; stats.observeEngine(engine.snapshot()); expect(stats.snapshot().view?.meta.incomplete).toBe(true)
    expect(ai.writeStreamReport).not.toHaveBeenCalled(); ai.writeStreamReport.mockRejectedValue(new Error('Choose an AI model.'))
    stats.generate(); await vi.waitFor(() => expect(stats.snapshot().reportJob.phase).toBe('error'))
    expect(stats.snapshot().report?.kind).toBe('measured'); expect(stats.snapshot().reportJob.phase).toBe('error')
  })
  it('binds reports to their original session/source and cancels late AI results', async () => {
    const { stats, studio, ai } = await fixture(); stats.start('practice'); studio.simulate('chat'); stats.stop(); const id = stats.snapshot().selectedId!
    let answer: (value: string) => void = () => undefined
    ai.writeStreamReport.mockImplementation(() => new Promise<string>(resolve => { answer = resolve }))
    stats.generate(); await vi.waitFor(() => expect(ai.writeStreamReport).toHaveBeenCalledOnce()); stats.start('practice'); stats.cancel(); answer('late result'); await flush()
    expect(stats.snapshot().selectedId).not.toBe(id); expect(stats.snapshot().report).toBeNull(); expect(stats.snapshot().reportJob.phase).toBe('cancelled')
    expect(await stats.store.readReport(id, 'simulator')).not.toContain('late result')
  })
})
