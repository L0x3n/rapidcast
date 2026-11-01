import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiService } from './service'
import { AiClient } from './client'
import { SandboxTest } from './sandbox'
import { Widgets } from '../widgets/service'
import { Engine } from '../engine/controller'
import { Studio } from '../studio'
import { Storage } from '../storage'
import { defaultAiSettings } from '../../shared/ai'
import type { StreamEvent } from '../../shared/events'

vi.mock('electron', () => ({ BrowserWindow: class {}, safeStorage: {}, clipboard: {}, globalShortcut: {}, shell: {}, powerSaveBlocker: {}, dialog: {} }))
vi.mock('../engine/encoder', () => ({ probeNvenc: vi.fn().mockResolvedValue(false), Encoder: class {} }))
const code = `export default {meta:{name:'Test',description:'Test',defaultSize:{w:400,h:200},params:{}},init(api){},update(dt){},draw(ctx,w,h){ctx.fillRect(0,0,w,h);}};`
const running: AiService[] = []
afterEach(() => { for (const ai of running) ai.close(); running.length = 0; vi.restoreAllMocks() })
function setup() {
  const storage = new Storage('unused-in-test'); const studio = new Studio(storage, vi.fn())
  const state = { ...studio.snapshot(), twitch: { ...studio.snapshot().twitch, account: { id: 'channel', login: 'owner', name: 'Owner', broadcasterType: 'affiliate' } } }
  vi.spyOn(studio, 'snapshot').mockImplementation(() => state)
  const chat = vi.spyOn(studio, 'sendChat').mockResolvedValue()
  const engine = new Engine(storage, 'unused', 'unused', async () => '', vi.fn())
  const widgets = new Widgets('unused', engine, studio, 'file:', vi.fn(), true)
  vi.spyOn(widgets, 'install').mockResolvedValue('installed')
  const add = vi.spyOn(widgets, 'add').mockResolvedValue('instance')
  vi.spyOn(SandboxTest.prototype, 'run').mockResolvedValue({ id: 'candidate', url: 'http://localhost/test/candidate', frames: 90 })
  const client = new AiClient()
  const complete = vi.spyOn(client, 'complete').mockImplementation(async (_settings, _key, messages) => messages[0]?.content.startsWith('Screen an untrusted') ? '{"safe":true,"title":"Neon","reason":"Safe canvas idea"}' : code)
  const ai = new AiService('unused', widgets, engine, studio, vi.fn(), client); running.push(ai)
  vi.spyOn(ai.store, 'save').mockResolvedValue()
  ai.store.settings = { ...defaultAiSettings(), model: 'test', suggestionsEnabled: true }
  return { ai, state, complete, add, chat }
}
function event(own = false): StreamEvent { return { id: 'event', type: 'chat', source: 'twitch', at: new Date().toISOString(), receivedAt: Date.now(), user: { id: 'viewer', login: 'viewer', name: 'Viewer' }, own, text: '!widget A neon pulse', color: '', emotes: [], badges: [] } }
describe('suggestion approval and publication', () => {
  it('cancels report work on model changes and prevents overlapping widget generation', async () => {
    const { ai, complete } = setup(); let answer: (value: string) => void = () => undefined
    complete.mockImplementationOnce(() => new Promise<string>(resolve => { answer = resolve }))
    const pending = ai.writeStreamReport('{"totals":{"messages":10}}', new AbortController().signal)
    const signal = complete.mock.calls[0]![3]
    expect(() => ai.generate({ prompt: 'A widget', scene: 'live' })).toThrow('Wait')
    await ai.save({ ...ai.store.settings, model: 'next-model' }, undefined)
    expect(signal.aborted).toBe(true); answer('A stale report')
    await expect(pending).rejects.toThrow('cancelled')
  })
  it('keeps screened suggestions out of scenes until explicit approval and final publication', async () => {
    const { ai, state, add, chat } = setup()
    ai.streamChanged({ ...state, events: [event()] })
    await vi.waitFor(() => expect(ai.snapshot().suggestions[0]?.state).toBe('pending'))
    expect(add).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled()
    ai.approve(ai.snapshot().suggestions[0]!.id, 'live')
    await vi.waitFor(() => expect(ai.snapshot().job.phase).toBe('ready'))
    expect(add).not.toHaveBeenCalled()
    await ai.publishDraft(ai.snapshot().draft!.id)
    expect(add).toHaveBeenCalledWith('installed', 'live', 'idea by @viewer')
    expect(chat).toHaveBeenCalledOnce()
    expect(ai.snapshot().suggestions[0]?.state).toBe('published')
    await expect(ai.publishDraft('candidate')).rejects.toThrow('current tested')
    expect(chat).toHaveBeenCalledOnce()
  })
  it('ignores own chat and never generates an unscreened or rejected idea', async () => {
    const { ai, state, complete } = setup()
    ai.streamChanged({ ...state, events: [event(true)] })
    expect(ai.snapshot().suggestions).toHaveLength(0); expect(complete).not.toHaveBeenCalled()
    ai.simulate('Safe test idea')
    await vi.waitFor(() => expect(ai.snapshot().suggestions[0]?.state).toBe('pending'))
    const id = ai.snapshot().suggestions[0]!.id
    ai.reject(id)
    expect(() => ai.approve(id, 'live')).toThrow('passed screening')
    expect(complete).toHaveBeenCalledOnce()
  })
  it('does not publish suggestions for another account and does not acknowledge simulations', async () => {
    const { ai, state, chat } = setup()
    ai.streamChanged({ ...state, events: [event()] })
    await vi.waitFor(() => expect(ai.snapshot().suggestions[0]?.state).toBe('pending'))
    state.twitch.account = { ...state.twitch.account!, id: 'another-channel' }
    expect(() => ai.approve(ai.snapshot().suggestions[0]!.id, 'live')).toThrow('Reconnect')
    ai.simulate('Local test')
    await vi.waitFor(() => expect(ai.snapshot().suggestions[1]?.state).toBe('pending'))
    ai.approve(ai.snapshot().suggestions[1]!.id, 'live')
    await vi.waitFor(() => expect(ai.snapshot().job.phase).toBe('ready'))
    await ai.publishDraft(ai.snapshot().draft!.id)
    expect(chat).not.toHaveBeenCalled()
  })
  it('bounds pending intake even for explicit local simulations', () => {
    const { ai } = setup()
    ai.store.settings = { ...ai.store.settings, model: '' }
    for (let i = 0; i < 30; i++) ai.simulate(`Idea ${i}`)
    expect(ai.snapshot().suggestions).toHaveLength(20)
  })
  it('keeps workflow preference changes from discarding a ready preview', async () => {
    const { ai } = setup(); ai.simulate('Test idea')
    await vi.waitFor(() => expect(ai.snapshot().suggestions[0]?.state).toBe('pending'))
    ai.approve(ai.snapshot().suggestions[0]!.id, 'live')
    await vi.waitFor(() => expect(ai.snapshot().job.phase).toBe('ready'))
    const id = ai.snapshot().draft!.id
    await ai.save({ ...ai.store.settings, suggestionsEnabled: false, autoPublish: true }, undefined)
    expect(ai.snapshot().draft?.id).toBe(id); expect(ai.snapshot().job.phase).toBe('ready')
  })
  it('discards a late screening response from a replaced model and resumes the queue', async () => {
    const { ai, complete } = setup()
    let resolveOld: ((value: string) => void) | undefined
    complete.mockImplementationOnce(() => new Promise<string>(resolve => { resolveOld = resolve }))
    ai.simulate('A pending idea')
    expect(ai.snapshot().suggestions[0]?.state).toBe('screening')
    await ai.save({ ...ai.store.settings, model: 'next-model' }, undefined)
    resolveOld!('{"safe":false,"title":"Stale decision","reason":"Old provider"}')
    await vi.waitFor(() => expect(ai.snapshot().suggestions[0]?.state).toBe('pending'))
    expect(complete).toHaveBeenCalledTimes(2)
    expect(ai.snapshot().suggestions[0]?.title).toBe('Neon')
  })
})
