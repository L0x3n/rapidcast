import type { Layer } from '../shared/engine'
import type { StreamEvent } from '../shared/events'
import { widgetGeneration, type OverlaySnapshot, type WidgetDefinition, type WidgetInstance, type WidgetStatus } from '../shared/widgets'

interface Entry {
  id: string; generation: string; layer: Layer; worker: Worker | null; status: WidgetStatus
  busy: boolean; deadline: number; sequence: number; events: StreamEvent[]; seen: Set<string>
}
export class WidgetManager {
  private entries = new Map<string, Entry>()
  readonly frames = new Map<string, ImageBitmap>()
  private images = new Map<string, ImageBitmap>()
  private imagePending = new Set<string>()
  private lastTick = 0
  constructor(private readonly frame: ((id: string, bitmap: ImageBitmap) => void) | null) {}
  statuses(): (WidgetStatus & { generation: string })[] { return [...this.entries.values()].map(entry => ({ ...entry.status, generation: entry.generation })) }
  configure(snapshot: OverlaySnapshot): void {
    const layers = Object.values(snapshot.scenes).flat().filter(layer => layer.kind === 'widget')
    const ids = new Set(layers.map(layer => layer.id))
    for (const [id, entry] of this.entries) if (!ids.has(id)) { this.disposeEntry(entry); this.entries.delete(id) }
    for (const layer of layers) {
      const instance = snapshot.instances.find(item => item.id === layer.id)
      const definition = snapshot.definitions.find(item => item.id === layer.source)
      if (!instance || !definition) continue
      const generation = widgetGeneration(definition, instance, layer)
      const previous = this.entries.get(layer.id)
      if (previous && previous.generation === generation) {
        previous.layer = layer
        if (instance.disabled && previous.status.state !== 'disabled') this.disable(previous, instance.reason)
        continue
      }
      if (previous) this.disposeEntry(previous)
      const entry: Entry = { id: layer.id, generation, layer, worker: null, busy: false, deadline: performance.now() + 2000, sequence: 0,
        events: [...snapshot.events], seen: new Set(snapshot.events.map(item => `${item.source}:${item.id}`)),
        status: { id: layer.id, state: instance.disabled ? 'disabled' : 'loading', reason: instance.reason, frames: 0, triggers: 0, renderMs: 0 } }
      this.entries.set(layer.id, entry)
      if (!instance.disabled) this.start(entry, definition, instance)
    }
  }
  private start(entry: Entry, definition: WidgetDefinition, instance: WidgetInstance): void {
    try {
      const worker = new Worker(`/worker/${definition.id}.mjs?v=${definition.version}`, { type: 'module', name: `RapidCast ${definition.meta.name}` })
      entry.worker = worker
      worker.onerror = event => { event.preventDefault(); this.disable(entry, event.message || 'Widget failed to load. Edit its code and restart.') }
      worker.onmessage = event => {
        if (entry.worker !== worker || entry.status.state === 'disabled') { if (event.data?.bitmap instanceof ImageBitmap) event.data.bitmap.close(); return }
        const data = event.data
        if (data?.kind === 'boot' && entry.status.state === 'loading') {
          entry.deadline = performance.now() + 2000
          worker.postMessage({ kind: 'init', width: Math.min(1920, Math.max(32, Math.round(entry.layer.width))), height: Math.min(1080, Math.max(32, Math.round(entry.layer.height))),
            params: { ...Object.fromEntries(Object.entries(definition.meta.params).map(([key, schema]) => [key, schema.default])), ...instance.params, _createdAt: instance.createdAt },
            now: Date.now(), seed: Number.parseInt(entry.generation, 16), images: [] })
          for (const [key, image] of this.images) void this.sendImage(entry, key, image)
        } else if (data?.kind === 'ready' && entry.status.state === 'loading') { entry.status.state = 'ready'; entry.deadline = 0 }
        else if (data?.kind === 'disabled') this.disable(entry, typeof data.reason === 'string' ? data.reason : 'Widget stopped. Restart or edit it.')
        else if ((data?.kind === 'frame' || data?.kind === 'idle') && entry.busy && data.sequence === entry.sequence) {
          entry.busy = false; entry.deadline = 0
          entry.status.renderMs = typeof data.elapsed === 'number' && Number.isFinite(data.elapsed) ? Math.max(0, Math.min(1000, data.elapsed)) : 0
          entry.status.triggers = typeof data.triggers === 'number' && Number.isFinite(data.triggers) ? Math.max(0, Math.min(1e9, data.triggers)) : 0
          if (data.kind === 'frame') {
            if (!(data.bitmap instanceof ImageBitmap) || data.bitmap.width > 1920 || data.bitmap.height > 1080) { this.disable(entry, 'Widget returned an invalid frame.'); return }
            entry.status.frames++
            if (this.frame) this.frame(entry.id, data.bitmap)
            else { this.frames.get(entry.id)?.close(); this.frames.set(entry.id, data.bitmap) }
          }
        } else { if (data?.bitmap instanceof ImageBitmap) data.bitmap.close(); this.disable(entry, 'Widget violated its frame protocol. Restart or edit it.') }
      }
    } catch { this.disable(entry, 'This browser could not start the widget Worker. Use a current Chromium browser source.') }
  }
  private disable(entry: Entry, reason: string): void {
    entry.worker?.terminate(); entry.worker = null; entry.busy = false; entry.deadline = 0
    this.frames.get(entry.id)?.close(); this.frames.delete(entry.id)
    entry.status.state = 'disabled'; entry.status.reason = reason.slice(0, 180)
  }
  tick(scene: string, snapshot: OverlaySnapshot, now: number): void {
    const resumed = this.lastTick !== 0 && now - this.lastTick > 500
    this.lastTick = now
    const visible = new Set((snapshot.scenes[scene as keyof typeof snapshot.scenes] || []).filter(layer => layer.visible).map(layer => layer.id))
    for (const entry of this.entries.values()) {
      if (resumed && entry.deadline) entry.deadline = now + (entry.status.state === 'loading' ? 2000 : 250)
      if (entry.deadline && now > entry.deadline) { this.disable(entry, entry.status.state === 'loading' ? 'Widget startup exceeded two seconds. Edit or restart it.' : 'Widget exceeded its 250 ms deadline. Edit or restart it.'); continue }
      if (entry.status.state !== 'ready' || entry.busy || !entry.worker || !visible.has(entry.id) && !entry.events.length) continue
      entry.busy = true; entry.deadline = now + 250; entry.sequence++
      const events = entry.events.splice(0, 200)
      entry.worker.postMessage({ kind: 'tick', sequence: entry.sequence, now: Date.now(), draw: visible.has(entry.id), events })
    }
  }
  event(event: StreamEvent): void {
    for (const entry of this.entries.values()) {
      const id = `${event.source}:${event.id}`
      if (entry.seen.has(id)) continue
      entry.seen.add(id); if (entry.seen.size > 1000) { const first = entry.seen.values().next().value; if (first) entry.seen.delete(first) }
      entry.events.push(event); if (entry.events.length > 200) entry.events.shift()
    }
    if (event.source === 'twitch' && event.type === 'chat') {
      void this.loadImage(`avatar:${event.user.id}`)
      for (const emote of event.emotes.slice(0, 12)) void this.loadImage(`emote:${emote.id}`)
    }
  }
  private async loadImage(key: string): Promise<void> {
    if (this.images.has(key) || this.imagePending.has(key) || this.imagePending.size >= 4) return
    this.imagePending.add(key)
    try {
      const response = await fetch(`/images/${encodeURIComponent(key)}`)
      if (!response.ok) return
      const image = await createImageBitmap(await response.blob(), { resizeWidth: 112 })
      if (this.images.size >= 64) {
        const first = this.images.keys().next().value
        if (first) { this.images.get(first)?.close(); this.images.delete(first); for (const entry of this.entries.values()) entry.worker?.postMessage({ kind: 'images', images: [[first, null]] }) }
      }
      this.images.set(key, image)
      for (const entry of this.entries.values()) void this.sendImage(entry, key, image)
    } catch { /* A missing public image does not interrupt a widget. */ }
    finally { this.imagePending.delete(key) }
  }
  private async sendImage(entry: Entry, key: string, image: ImageBitmap): Promise<void> {
    try { const copy = await createImageBitmap(image); if (!entry.worker) { copy.close(); return }; entry.worker.postMessage({ kind: 'images', images: [[key, copy]] }, [copy]) } catch { /* Image eviction can race an optional image clone. */ }
  }
  private disposeEntry(entry: Entry): void { entry.worker?.terminate(); entry.worker = null; this.frames.get(entry.id)?.close(); this.frames.delete(entry.id) }
  clear(): void { for (const entry of this.entries.values()) this.disposeEntry(entry); this.entries.clear() }
  close(): void { this.clear(); for (const image of this.images.values()) image.close(); this.images.clear() }
}
