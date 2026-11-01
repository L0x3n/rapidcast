import { clipboard, globalShortcut } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { record } from '../../shared/events'
import { makeLayer, type EngineSettings } from '../../shared/engine'
import { SCENES, type SceneId } from '../../shared/scenes'
import { validParams, validCredit, widgetGeneration, type OverlaySnapshot, type WidgetState, type WidgetStatus, type Transition } from '../../shared/widgets'
import type { StudioState } from '../../shared/contracts'
import type { Engine } from '../engine/controller'
import type { Studio } from '../studio'
import { WidgetStore } from './store'
import { OverlayServer } from './server'
import { HostImages } from './images'
import { simulatedEvent, SIMULATIONS } from '../../shared/simulator'
import type { WidgetDefinition } from '../../shared/widgets'
import type { EventSource } from '../../shared/events'

export interface ConfirmedTrigger { widgetId: string; widgetName: string; definitionId: string; eventId: string; source: EventSource; runtime: 'engine' | 'obs' }

export class Widgets {
  trigger: (value: ConfirmedTrigger) => void = () => undefined
  triggerOverflow: () => void = () => undefined
  readonly store: WidgetStore
  readonly server: OverlayServer
  private revision = 0
  private statuses = new Map<string, WidgetStatus>()
  private lastSceneSignature = ''
  private stream: StudioState
  private hotkeys: WidgetState['hotkeys'] = []
  private seen = new Set<string>()
  private initialized = false
  private readonly images: HostImages
  private candidates = new Map<string, WidgetDefinition>()
  constructor(directory: string, private readonly engine: Engine, private readonly studio: Studio,
    parentOrigin: string, private readonly publish: (state: WidgetState) => void, testMode = false) {
    this.store = new WidgetStore(directory); this.stream = studio.snapshot()
    this.images = new HostImages(id => studio.publicAvatar(id))
    this.server = new OverlayServer(join(__dirname, '../overlay'), { snapshot: () => this.overlaySnapshot(),
      definition: id => this.store.definitions.find(item => item.id === id) ?? this.candidates.get(id), report: value => this.report(value), image: key => this.images.get(key), test: id => this.testSnapshot(id) }, parentOrigin, testMode)
  }
  async initialize(): Promise<void> {
    const exists = await this.store.load()
    if (!exists) await this.seed()
    this.reconcile()
    await this.store.save()
    await this.server.start(this.server.testMode ? 0 : this.store.port)
    this.store.port = Number(new URL(this.server.baseUrl).port)
    if (!this.server.testMode) await this.store.save()
    this.initialized = true
    this.engine.setWidgetRuntime(this.server.sandboxUrl, this.store.transition)
    this.engine.widgetFailure = message => {
      for (const instance of this.store.instances) { instance.disabled = true; instance.reason = message }
      this.engine.notice(message)
      this.changed(); void this.store.save().catch(() => undefined)
    }
    this.registerHotkeys()
    this.changed()
  }
  private reconcile(): void {
    const placed = Object.values(this.engine.snapshot().settings.scenes).flat().filter(layer => layer.kind === 'widget')
    this.store.instances = this.store.instances.filter(instance => placed.some(layer => layer.id === instance.id))
    for (const layer of placed) {
      const definition = this.store.definitions.find(item => item.id === layer.source)
      if (!definition) continue
      const instance = this.store.instances.find(item => item.id === layer.id) ?? this.store.create(layer.id, definition)
      try { instance.params = validParams(definition.meta.params, instance.params) } catch {
        instance.params = validParams(definition.meta.params, {}); instance.disabled = true; instance.reason = 'Saved parameters were invalid. Review them and restart the widget.'
      }
    }
  }
  snapshot(): WidgetState { return { revision: this.revision, definitions: this.store.definitions, instances: this.store.instances,
    statuses: [...this.statuses.values()], baseUrl: this.server.baseUrl, transition: this.store.transition, hotkeys: this.hotkeys } }
  overlaySnapshot(): OverlaySnapshot {
    const scenes = structuredClone(this.engine.snapshot().settings.scenes)
    for (const scene of SCENES) scenes[scene.id] = scenes[scene.id].filter(layer => layer.kind === 'widget')
    return { revision: this.revision, activeScene: this.stream.activeScene, scenes, definitions: this.store.definitions,
      instances: this.store.instances, events: this.stream.events, transition: this.store.transition }
  }
  private changed(): void {
    this.revision++; this.publish(this.snapshot())
    if (this.initialized) this.server.broadcast('snapshot', this.overlaySnapshot())
  }
  refresh(): void { this.changed() }
  engineChanged(settings: EngineSettings): void {
    const signature = JSON.stringify(settings.scenes)
    if (signature === this.lastSceneSignature) return
    this.lastSceneSignature = signature
    if (this.initialized) { this.reconcile(); this.changed() }
  }
  streamChanged(state: StudioState): void {
    const previous = this.stream; this.stream = state
    const cleared = previous.events.some(event => !state.events.some(next => next.id === event.id && next.source === event.source)) && state.events.length < previous.events.length
    if (cleared) { this.seen.clear(); this.server.broadcast('reset', this.overlaySnapshot()) }
    for (const event of state.events) {
      const id = `${event.source}:${event.id}`
      if (this.seen.has(id)) continue
      this.seen.add(id); this.server.broadcast('event', event)
    }
    if (this.seen.size > 1000) this.seen = new Set(state.events.map(event => `${event.source}:${event.id}`))
    if (previous.activeScene !== state.activeScene || cleared) this.changed()
  }
  async add(definitionId: string, scene: SceneId, credit = ''): Promise<string> {
    const definition = this.store.definitions.find(item => item.id === definitionId)
    if (!definition) throw new Error('Choose a widget from the library.')
    const settings = this.engine.snapshot().settings
    if (settings.scenes[scene].filter(layer => layer.kind === 'widget').length >= 8) throw new Error('Use up to eight widgets in one scene.')
    const id = `widget-${randomUUID()}`
    const position: Record<string, [number, number]> = { 'builtin-chat': [1420, 240], 'builtin-alerts': [580, 70], 'builtin-countdown': [600, 440], 'builtin-ticker': [210, 970], 'builtin-goal': [40, 790] }
    const [x, y] = position[definitionId] ?? [600, 250]
    const layer = { ...makeLayer(id, 'widget'), name: definition.meta.name, source: definitionId, text: validCredit(credit) ? credit : definition.credit || '',
      x, y, width: definition.meta.defaultSize.w, height: definition.meta.defaultSize.h, z: 20 + settings.scenes[scene].filter(item => item.kind === 'widget').length }
    this.store.create(id, definition)
    try { await this.engine.configure({ ...settings, scenes: { ...settings.scenes, [scene]: [...settings.scenes[scene], layer] } }) }
    catch (error: unknown) { this.store.instances = this.store.instances.filter(item => item.id !== id); throw error }
    await this.store.save(); this.changed()
    return id
  }
  candidate(code: string): WidgetDefinition {
    if (this.candidates.size >= 4) throw new Error('Close an older test preview before creating another widget.')
    const definition = this.store.definition(`candidate-${randomUUID()}`, code)
    this.candidates.set(definition.id, definition); return definition
  }
  discardCandidate(id: string): void { this.candidates.delete(id) }
  private testSnapshot(id: string): OverlaySnapshot | null {
    const definition = this.candidates.get(id); if (!definition) return null
    const layer = { ...makeLayer(id, 'widget'), source: id, width: definition.meta.defaultSize.w, height: definition.meta.defaultSize.h }
    return { revision: 1, activeScene: 'live', scenes: { starting: [], live: [layer], brb: [], ending: [] }, definitions: [definition],
      instances: [{ id, params: validParams(definition.meta.params, {}), disabled: false, reason: '', createdAt: Date.now() }],
      events: SIMULATIONS.map(type => simulatedEvent(type, `preflight-${type}`)), transition: 'cut' }
  }
  async replace(id: string, code: string): Promise<void> {
    const settings = structuredClone(this.engine.snapshot().settings)
    const layer = Object.values(settings.scenes).flat().find(item => item.id === id && item.kind === 'widget')
    const instance = this.store.instances.find(item => item.id === id)
    if (!layer || !instance) throw new Error('The original widget was removed. Generate a new widget instead.')
    const definition = this.store.install(code, validCredit(layer.text) ? layer.text : '')
    layer.source = definition.id; layer.name = definition.meta.name; layer.width = definition.meta.defaultSize.w; layer.height = definition.meta.defaultSize.h
    await this.engine.configure(settings)
    instance.params = validParams(definition.meta.params, {}); instance.createdAt = Math.max(Date.now(), instance.createdAt + 1); instance.disabled = false; instance.reason = ''
    this.statuses.delete(id); await this.store.save(); this.changed()
  }
  async install(code: string, credit = ''): Promise<string> { const definition = this.store.install(code, credit); await this.store.save(); this.changed(); return definition.id }
  async params(id: string, params: unknown): Promise<void> {
    if (this.engine.setupTestActive) throw new Error('Finish or cancel the setup test before changing widgets.')
    const instance = this.store.instances.find(item => item.id === id)
    const layer = Object.values(this.engine.snapshot().settings.scenes).flat().find(item => item.id === id)
    const definition = this.store.definitions.find(item => item.id === layer?.source)
    if (!instance || !definition) throw new Error('Choose an installed widget instance.')
    instance.params = validParams(definition.meta.params, params)
    instance.createdAt = Math.max(Date.now(), instance.createdAt + 1)
    instance.disabled = false; instance.reason = ''; this.statuses.delete(id)
    await this.store.save(); this.changed()
    this.engine.setWidgetRuntime(this.server.sandboxUrl, this.store.transition)
  }
  async restart(id: string): Promise<void> {
    if (this.engine.setupTestActive) throw new Error('Finish or cancel the setup test before restarting widgets.')
    const instance = this.store.instances.find(item => item.id === id)
    if (!instance) throw new Error('Choose a widget to restart.')
    instance.disabled = false; instance.reason = ''; instance.createdAt = Math.max(Date.now(), instance.createdAt + 1); this.statuses.delete(id)
    await this.store.save(); this.changed()
    this.engine.setWidgetRuntime(this.server.sandboxUrl, this.store.transition)
  }
  async remove(id: string): Promise<void> {
    const settings = this.engine.snapshot().settings; const scenes = structuredClone(settings.scenes)
    for (const scene of SCENES) scenes[scene.id] = scenes[scene.id].filter(layer => layer.id !== id)
    await this.engine.configure({ ...settings, scenes })
    this.store.instances = this.store.instances.filter(item => item.id !== id); this.statuses.delete(id)
    await this.store.save(); this.changed()
  }
  report(raw: unknown): void {
    const data = record(raw)
    if (!Array.isArray(data.statuses) || data.statuses.length > 32) return
    if (data.runtime === 'engine' || data.runtime === 'obs') {
      if (data.overflow === true) this.triggerOverflow()
      if (Array.isArray(data.witnesses)) for (const raw of data.witnesses.slice(0, 16)) {
        const witness = record(raw)
        const scene = SCENES.find(scene => scene.id === witness.scene)
        const layer = scene && this.engine.snapshot().settings.scenes[scene.id].find(layer => layer.id === witness.widgetId)
        const instance = this.store.instances.find(item => item.id === witness.widgetId)
        const definition = this.store.definitions.find(item => item.id === layer?.source)
        const event = this.stream.events.find(event => event.id === witness.eventId && event.source === witness.source)
        if (!layer || layer.kind !== 'widget' || !instance || instance.disabled || !definition || witness.generation !== widgetGeneration(definition, instance, layer) ||
            !event || Date.now() - event.receivedAt > 30000 || !layer.visible || layer.opacity <= 0 || layer.x >= 1920 || layer.y >= 1080 || layer.x + layer.width <= 0 || layer.y + layer.height <= 0 ||
            data.runtime === 'engine' && scene.id !== this.stream.activeScene) continue
        this.trigger({ widgetId: instance.id, widgetName: definition.meta.name, definitionId: definition.id, eventId: event.id, source: event.source, runtime: data.runtime })
      }
    }
    let disabled = false
    for (const value of data.statuses) {
      const item = record(value); const instance = this.store.instances.find(next => next.id === item.id)
      const layer = Object.values(this.engine.snapshot().settings.scenes).flat().find(next => next.id === item.id)
      const definition = this.store.definitions.find(next => next.id === layer?.source)
      if (!instance || !layer || !definition || item.generation !== widgetGeneration(definition, instance, layer)) continue
      if (!instance || !['loading', 'ready', 'disabled'].includes(String(item.state)) || typeof item.reason !== 'string' ||
          !['frames', 'triggers', 'renderMs'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && Number(item[key]) >= 0 && Number(item[key]) <= 1e9)) continue
      if (item.state === 'disabled' && !instance.disabled) { instance.disabled = true; instance.reason = item.reason.slice(0, 180); disabled = true }
      this.statuses.set(instance.id, { id: instance.id, state: instance.disabled ? 'disabled' : item.state as WidgetStatus['state'],
        reason: instance.disabled ? instance.reason : '', frames: Number(item.frames), triggers: Number(item.triggers), renderMs: Number(item.renderMs) })
    }
    this.revision++; this.publish(this.snapshot())
    if (disabled) { this.server.broadcast('snapshot', this.overlaySnapshot()); void this.store.save().catch(() => undefined) }
  }
  async setTransition(value: Transition): Promise<void> {
    this.store.transition = value; this.engine.setWidgetRuntime(this.server.sandboxUrl, value)
    await this.store.save(); this.changed()
  }
  copy(scene: string): void {
    if (scene === 'program' || SCENES.some(item => item.id === scene)) clipboard.writeText(`${this.server.baseUrl}/overlay/${scene}`)
    else if (this.store.instances.some(item => item.id === scene)) clipboard.writeText(`${this.server.baseUrl}/widget/${scene}`)
    else throw new Error('Choose a scene or widget to copy its OBS URL.')
  }
  private registerHotkeys(): void {
    this.hotkeys = SCENES.map((scene, index) => {
      const accelerator = `Control+Alt+F${index + 1}`
      const registered = this.store.hotkeysEnabled && globalShortcut.register(accelerator, () => { void this.studio.selectScene(scene.id).catch(() => this.engine.notice('The scene hotkey could not switch scenes. Try the scene buttons.')) })
      return { scene: scene.id, accelerator, registered }
    })
  }
  private async seed(): Promise<void> {
    const settings = structuredClone(this.engine.snapshot().settings)
    const add = (scene: SceneId, name: string, x: number, y: number, width?: number, height?: number, params: unknown = {}): void => {
      const definition = this.store.definitions.find(item => item.id === `builtin-${name}`)!
      const id = `widget-${scene}-${name}`
      this.store.create(id, definition, params)
      settings.scenes[scene].push({ ...makeLayer(id, 'widget'), name: definition.meta.name, source: definition.id, x, y,
        width: width ?? definition.meta.defaultSize.w, height: height ?? definition.meta.defaultSize.h, z: 20 + settings.scenes[scene].filter(layer => layer.kind === 'widget').length })
    }
    for (const scene of SCENES) add(scene.id, 'alerts', 580, 60)
    add('starting', 'countdown', 600, 440)
    add('live', 'chat', 1420, 240); add('live', 'goal', 40, 790); add('live', 'ticker', 210, 970)
    add('brb', 'ticker', 210, 970)
    add('ending', 'ticker', 480, 320, 960, 650, { credits: true, title: 'THE PEOPLE WHO MADE THE SHOW' })
    for (const id of ['starting', 'ending'] as const) { const title = settings.scenes[id].find(layer => layer.id === `${id}-title`); if (title) title.y = 120 }
    const liveTitle = settings.scenes.live.find(layer => layer.id === 'live-title'); if (liveTitle) liveTitle.visible = false
    await this.engine.configure(settings)
  }
  async close(): Promise<void> { globalShortcut.unregisterAll(); await this.server.close() }
}
