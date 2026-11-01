import { afterEach, describe, expect, it, vi } from 'vitest'
import { WidgetManager } from './manager'
import { defaultEngineSettings, makeLayer } from '../shared/engine'
import { simulatedEvent } from '../shared/simulator'
import type { OverlaySnapshot } from '../shared/widgets'

class Bitmap { width = 100; height = 100; close(): void {} }
const workers: FakeWorker[] = []
let next = 0
const randomUUID = (): string => `test-event-${++next}`
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror = null
  messages: { kind: string; sequence?: number; events?: unknown[]; draw?: boolean }[] = []
  constructor() { workers.push(this) }
  postMessage(value: FakeWorker['messages'][number]): void { this.messages.push(value) }
  terminate(): void {}
  receive(value: unknown): void { this.onmessage?.({ data: value }) }
}
afterEach(() => { vi.unstubAllGlobals(); workers.splice(0) })
function fixture(history = false) {
  vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('ImageBitmap', Bitmap)
  const callback = vi.fn(); const manager = new WidgetManager(null, callback); const scenes = defaultEngineSettings().scenes
  scenes.live.push({ ...makeLayer('alerts', 'widget'), source: 'alerts', width: 100, height: 100 })
  const snapshot: OverlaySnapshot = { revision: 0, activeScene: 'live', scenes, definitions: [{ id: 'alerts', version: 'abc', code: '', builtin: true, meta: { name: 'Alerts', description: '', defaultSize: { w: 100, h: 100 }, params: {} } }], instances: [{ id: 'alerts', createdAt: 1, params: {}, disabled: false, reason: '' }], events: history ? [simulatedEvent('follow', randomUUID())] : [], transition: 'cut' }
  manager.configure(snapshot); const worker = workers[0]!; worker.receive({ kind: 'boot' }); worker.receive({ kind: 'ready' })
  const frame = () => { const tick = worker.messages.at(-1)!; worker.receive({ kind: tick.draw ? 'frame' : 'idle', sequence: tick.sequence, bitmap: new Bitmap(), elapsed: 1, triggers: 1, fired: [0] }) }
  return { manager, snapshot, worker, callback, frame }
}
describe('actual widget trigger witnesses', () => {
  it('links fired indices to trusted in-flight events and excludes history replay', () => {
    const f = fixture(true); f.manager.tick('live', f.snapshot, performance.now()); f.frame(); expect(f.callback).not.toHaveBeenCalled()
    const event = simulatedEvent('follow', randomUUID()); f.manager.event(event); f.manager.tick('live', f.snapshot, performance.now()); f.frame()
    expect(f.callback).toHaveBeenCalledWith(expect.objectContaining({ eventId: event.id, widgetId: 'alerts', source: 'simulator', scene: 'live' }))
    f.manager.event(event); f.manager.tick('live', f.snapshot, performance.now()); f.frame(); expect(f.callback).toHaveBeenCalledTimes(1)
  })
  it('does not count inactive event handling, invisible or offscreen layers', () => {
    const f = fixture(); f.manager.event(simulatedEvent('follow', randomUUID())); f.manager.tick('brb', f.snapshot, performance.now()); f.frame()
    expect(f.callback).not.toHaveBeenCalled()
    f.snapshot.scenes.live.at(-1)!.opacity = 0; f.manager.configure(f.snapshot); f.manager.event(simulatedEvent('follow', randomUUID())); f.manager.tick('live', f.snapshot, performance.now()); f.frame(); expect(f.callback).not.toHaveBeenCalled()
    f.snapshot.scenes.live.at(-1)!.opacity = 1; f.snapshot.scenes.live.at(-1)!.x = 2500; f.manager.configure(f.snapshot); f.manager.event(simulatedEvent('follow', randomUUID())); f.manager.tick('live', f.snapshot, performance.now()); f.frame(); expect(f.callback).not.toHaveBeenCalled()
  })
})
