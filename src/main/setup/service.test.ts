import { afterEach, describe, expect, it, vi } from 'vitest'
import { Setup } from './service'
import { Studio } from '../studio'
import { Storage } from '../storage'
import { Engine } from '../engine/controller'
import { Widgets } from '../widgets/service'
import { AiService } from '../ai/service'
import { makeLayer } from '../../shared/engine'
import { outputProfile, programSignature } from '../../shared/setup'

vi.mock('electron', () => ({ BrowserWindow: class {}, safeStorage: { isAsyncEncryptionAvailable: vi.fn().mockResolvedValue(true) }, clipboard: {}, globalShortcut: {}, shell: {}, powerSaveBlocker: {}, dialog: {} }))
vi.mock('../engine/encoder', () => ({ probeNvenc: vi.fn().mockResolvedValue(false), Encoder: class {} }))
afterEach(() => vi.restoreAllMocks())
async function fixture() {
  const storage = new Storage('unused'); const studio = new Studio(storage, vi.fn())
  const stream = studio.snapshot(); stream.activeScene = 'live'
  stream.twitch = { ...stream.twitch, phase: 'connected', account: { id: 'channel', login: 'owner', name: 'Owner', broadcasterType: '' } }
  const engine = new Engine(storage, 'unused', 'unused', async () => '', vi.fn())
  const state = engine.snapshot(); state.previewActive = true; state.encoder = 'h264_nvenc'; state.nvenc = true
  state.settings.scenes.live.push({ ...makeLayer('camera', 'camera'), source: 'cam' }); state.settings.audio.micId = 'mic'
  state.telemetry = { fps: 30, frames: 30, expected: 30, dropped: 0, dropPercent: 0, maxGapMs: 34, visibility: 'visible', micLevel: 0, desktopLevel: 0, mimeType: '', capabilities: [] }
  const start = vi.spyOn(engine, 'startOutput').mockResolvedValue()
  const widgets = new Widgets('unused', engine, studio, 'file:', vi.fn(), true)
  const ai = new AiService('unused', widgets, engine, studio, vi.fn())
  const setup = new Setup('unused', engine, studio, widgets, ai, vi.fn())
  vi.spyOn(setup.store, 'load').mockResolvedValue(); vi.spyOn(setup.store, 'save').mockResolvedValue()
  await setup.initialize(); setup.store.data.goal = 'local'
  await setup.confirm('visual', true); await setup.confirm('audio', true)
  setup.store.data.benchmark = { id: 'sample', kind: 'local', channelId: '', at: Date.now(), duration: 15, profile: outputProfile(state.settings), programSignature: programSignature(state.settings, '[]'), fps: 30, missedPercent: 0, encodedFrames: 450, encoderDrops: 0, outputIssues: 0, queuePeak: 0, encoder: 'h264_nvenc', stable: true }
  return { setup, state, start }
}
describe('required readiness boundaries', () => {
  it('does not approve selected camera/microphone settings unless their actual tracks are open', async () => {
    const { setup, state, start } = await fixture()
    expect(setup.snapshot().checks.find(item => item.id === 'capture')?.state).toBe('fail')
    expect(setup.snapshot().checks.find(item => item.id === 'audioTracks')?.state).toBe('fail')
    await expect(setup.finish(true)).rejects.toThrow('required readiness')
    expect(start).not.toHaveBeenCalled()
    state.telemetry!.capabilities = ['capture:camera:cam', 'microphone:mic']
    await setup.finish(false)
    expect(setup.snapshot().completed).toBe(true)
  })
  it('requires a current-channel private test and a human Inspector review before public output', async () => {
    const { setup, state, start } = await fixture(); state.telemetry!.capabilities = ['capture:camera:cam', 'microphone:mic']
    await setup.step(5, 'twitch')
    await expect(setup.finish(true)).rejects.toThrow('required readiness')
    expect(start).not.toHaveBeenCalled()
    setup.store.data.benchmark = { ...setup.store.data.benchmark!, kind: 'twitch', channelId: 'channel' }
    await expect(setup.finish(true)).rejects.toThrow('required readiness')
    await setup.confirm('inspector', true); await setup.finish(true)
    expect(start).toHaveBeenCalledWith('live')
  })
})
