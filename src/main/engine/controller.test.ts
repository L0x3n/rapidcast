import { afterEach, describe, expect, it, vi } from 'vitest'
import { Engine } from './controller'
import { Storage } from '../storage'

vi.mock('electron', () => ({ BrowserWindow: class {}, powerSaveBlocker: {}, shell: {}, safeStorage: {}, dialog: {} }))
vi.mock('./encoder', () => ({ probeNvenc: vi.fn().mockResolvedValue(false), Encoder: class {} }))
afterEach(() => vi.restoreAllMocks())
describe('output lifecycle', () => {
  it('does not remain in Starting if Twitch login or ingest resolution fails', async () => {
    const engine = new Engine(new Storage('unused'), 'unused', 'unused', async () => { throw new Error('Connect Twitch first.') }, vi.fn())
    await expect(engine.startOutput('test')).rejects.toThrow('Connect Twitch')
    expect(engine.snapshot().phase).toBe('error')
    expect(engine.snapshot().mode).toBeNull()
  })
  it('cancels a pending Twitch start before a late stream key can start output', async () => {
    let resolveTarget: ((target: string) => void) | undefined
    const target = new Promise<string>(resolve => { resolveTarget = resolve })
    const engine = new Engine(new Storage('unused'), 'unused', 'unused', () => target, vi.fn())
    const preview = vi.spyOn(engine, 'preview').mockResolvedValue(undefined)
    const starting = engine.startOutput('test')
    await engine.stopOutput()
    resolveTarget!('rtmps://example.test/app/fake_secret')
    await expect(starting).rejects.toThrow('cancelled')
    expect(preview).not.toHaveBeenCalled()
    expect(engine.snapshot().mode).toBeNull()
    expect(engine.snapshot().phase).toBe('idle')
    expect(JSON.stringify(engine.snapshot())).not.toContain('fake_secret')
  })
})
