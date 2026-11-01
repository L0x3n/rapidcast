import { afterEach, describe, expect, it, vi } from 'vitest'
import { Engine } from '../engine/controller'
import { Storage } from '../storage'
import { runSetupBenchmark } from './benchmark'

vi.mock('electron', () => ({ BrowserWindow: class {}, powerSaveBlocker: {}, shell: {}, safeStorage: {}, dialog: {} }))
vi.mock('../engine/encoder', () => ({ probeNvenc: vi.fn().mockResolvedValue(false), Encoder: class {} }))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
function setup() {
  vi.useFakeTimers(); vi.setSystemTime(1000000)
  const engine = new Engine(new Storage('unused'), 'unused', 'unused', async () => '', vi.fn())
  const initial = engine.snapshot(); let mode: 'record' | 'test' | null = null
  vi.spyOn(engine, 'snapshot').mockImplementation(() => {
    const frames = Math.floor((Date.now() - 1000000) * .03) + 1
    return { ...initial, mode, encoder: 'h264_nvenc', phase: mode === 'test' ? 'streaming' : mode === 'record' ? 'recording' : 'preview', previewActive: true, encodedFrames: frames,
      telemetry: { frames, expected: frames, dropped: 0, dropPercent: 0, fps: 30, maxGapMs: 34, visibility: 'visible', micLevel: 0, desktopLevel: 0, mimeType: '', capabilities: [] } }
  })
  const start = vi.spyOn(engine, 'startOutput').mockImplementation(async value => { mode = value === 'test' ? 'test' : 'record' })
  const stop = vi.spyOn(engine, 'stopOutput').mockImplementation(async () => { mode = null })
  return { engine, start, stop }
}
describe('owned 15-second setup output', () => {
  it('runs the full interval, requests only private test mode and releases output/lock', async () => {
    const { engine, start, stop } = setup()
    const work = runSetupBenchmark(engine, 'twitch', 'channel', () => '', new AbortController().signal, vi.fn())
    expect(engine.setupTestActive).toBe(true)
    await expect(engine.configure(engine.snapshot().settings)).rejects.toThrow('setup test')
    await vi.advanceTimersByTimeAsync(15200)
    const result = await work
    expect(result.duration).toBeGreaterThanOrEqual(15); expect(result.stable).toBe(true)
    expect(result.kind).toBe('twitch'); expect(result.channelId).toBe('channel')
    expect(start).toHaveBeenCalledWith('test', undefined, true)
    expect(stop).toHaveBeenCalledOnce(); expect(engine.setupTestActive).toBe(false)
  })
  it('cancels without approving a partial sample and still stops its output', async () => {
    const { engine, stop } = setup(); const controller = new AbortController()
    const work = runSetupBenchmark(engine, 'local', '', () => '', controller.signal, vi.fn())
    const rejected = expect(work).rejects.toThrow('cancelled')
    await vi.advanceTimersByTimeAsync(1000); controller.abort(); await vi.advanceTimersByTimeAsync(200)
    await rejected; expect(stop).toHaveBeenCalledOnce(); expect(engine.setupTestActive).toBe(false)
  })
  it('releases its lock even when final encoder shutdown fails', async () => {
    const { engine, stop } = setup(); stop.mockRejectedValue(new Error('Shutdown failed'))
    const work = runSetupBenchmark(engine, 'local', '', () => '', new AbortController().signal, vi.fn())
    const rejected = expect(work).rejects.toThrow('Shutdown failed')
    await vi.advanceTimersByTimeAsync(15200); await rejected
    expect(engine.setupTestActive).toBe(false)
  })
})
