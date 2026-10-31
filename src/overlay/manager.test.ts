import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetManager } from './manager'
import { makeLayer } from '../shared/engine'
import type { OverlaySnapshot, WidgetDefinition } from '../shared/widgets'

class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: unknown
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { FakeWorker.all.push(this) }
  emit(data: unknown): void { this.onmessage?.({ data }) }
}
function snapshot(): OverlaySnapshot {
  const definition: WidgetDefinition = { id: 'test', code: '', builtin: false, version: '123', meta: { name: 'Test', description: '', defaultSize: { w: 320, h: 160 }, params: {} } }
  return { revision: 1, activeScene: 'live', scenes: { starting: [], live: [{ ...makeLayer('instance', 'widget'), source: definition.id }], brb: [], ending: [] },
    definitions: [definition], instances: [{ id: 'instance', params: {}, createdAt: 1, disabled: false, reason: '' }], events: [], transition: 'fade' }
}
beforeEach(() => { FakeWorker.all = []; vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('ImageBitmap', class {}); vi.spyOn(performance, 'now').mockReturnValue(0) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('per-widget execution watchdog', () => {
  it('terminates a stalled draw without restarting it on unrelated snapshots', () => {
    const manager = new WidgetManager(null); const state = snapshot(); manager.configure(state)
    const worker = FakeWorker.all[0]!
    worker.emit({ kind: 'boot' }); worker.emit({ kind: 'ready' })
    manager.tick('live', state, 10); manager.tick('live', state, 261)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(manager.statuses()[0]?.reason).toContain('250 ms')
    manager.configure({ ...state, revision: 2 })
    expect(FakeWorker.all).toHaveLength(1)
    expect(manager.statuses()[0]?.state).toBe('disabled')
    manager.configure({ ...state, instances: [{ ...state.instances[0]!, createdAt: 2 }] })
    expect(FakeWorker.all).toHaveLength(2)
    expect(manager.statuses()[0]?.state).toBe('loading')
  })
  it('disables startup that never responds, while allowing a resumed host one fresh deadline', () => {
    const manager = new WidgetManager(null); const state = snapshot(); manager.configure(state)
    manager.tick('live', state, 1); manager.tick('live', state, 2200)
    expect(manager.statuses()[0]?.state).toBe('loading')
    for (let now = 2300; now <= 4300; now += 100) manager.tick('live', state, now)
    expect(manager.statuses()[0]?.state).toBe('disabled')
    expect(manager.statuses()[0]?.reason).toContain('two seconds')
  })
  it('bounds event queues and avoids drawing inactive scenes', () => {
    const manager = new WidgetManager(null); const state = snapshot(); manager.configure(state)
    const worker = FakeWorker.all[0]!; worker.emit({ kind: 'boot' }); worker.emit({ kind: 'ready' }); worker.postMessage.mockClear()
    manager.tick('starting', state, 10)
    expect(worker.postMessage).not.toHaveBeenCalled()
    for (let i = 0; i < 250; i++) manager.event({ id: String(i), source: 'simulator', type: 'follow', at: '', receivedAt: 0, user: { id: 'x', login: 'x', name: 'X' } })
    manager.tick('starting', state, 20)
    const sent = worker.postMessage.mock.calls[0]![0] as { draw: boolean; events: unknown[] }
    expect(sent.draw).toBe(false); expect(sent.events).toHaveLength(200)
    worker.emit({ kind: 'idle', sequence: 1, elapsed: 2, triggers: 200 })
    manager.tick('live', state, 30)
    expect(worker.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({ draw: true, events: [] })
  })
})
