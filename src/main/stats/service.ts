import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { clipboard, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StudioState } from '../../shared/contracts'
import type { EngineState } from '../../shared/engine'
import type { EventSource, StreamEvent } from '../../shared/events'
import type { MetricRow, SessionMeta, SessionView, StatsReport, StatsState } from '../../shared/stats'
import { StatsAccumulator } from '../../shared/stats-aggregate'
import type { ConfirmedTrigger } from '../widgets/service'
import { StatsStore, historyOf } from './store'
import { measuredReport, reportPayload, safeAiReport } from './report'

interface EngineSource { snapshot(): EngineState; setupTestActive: boolean }
interface AiReporter { writeStreamReport(payload: string, signal: AbortSignal): Promise<string> }
export class Stats {
  readonly store: StatsStore
  private active: StatsAccumulator | null = null
  private salt = randomBytes(32)
  private seen = new Set<string>()
  private viewerAt = 0
  private connection: boolean | null = null
  private scene = ''
  private healthAt = 0
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private closed = false
  private limited = false
  private finishing: Promise<void> = Promise.resolve()
  private selecting = 0
  private state: StatsState = { revision: 0, activeId: null, history: [], selectedId: null, view: null, source: 'twitch', report: null,
    reportJob: { phase: 'idle', sessionId: '', message: 'A measured Markdown report is saved after Stop. AI analysis is optional.' }, autoReport: false, message: 'Output sessions are tracked automatically. OBS and practice tracking can be started here.' }
  constructor(private readonly directory: string, private readonly engine: EngineSource, private readonly studio: { snapshot(): StudioState }, private readonly ai: AiReporter,
    private readonly publish: (state: StatsState) => void) {
    this.store = new StatsStore(directory, id => { if (this.active?.meta.id === id) this.limit('disk-error'); this.state.message = 'Metrics could not be saved completely. Check disk space. Output continues.'; this.changed() })
  }
  async initialize(): Promise<void> {
    try {
      this.state.history = await this.store.initialize()
      try { this.state.autoReport = JSON.parse(await readFile(join(this.directory, 'stats.json'), 'utf8')).autoReport === true } catch { /* Default is no automatic AI requests. */ }
      for (const event of this.studio.snapshot().events) this.seen.add(`${event.source}:${event.id}`)
      if (this.state.history[0]) {
        try { await this.select(this.state.history[0].id, this.state.history[0].mode === 'practice' ? 'simulator' : 'twitch') }
        catch { this.state.message = 'The latest journal could not open. Choose another saved session or start new tracking.' }
      }
    } catch { this.state.message = 'Session history could not open. Check app data permissions and restart. Output is available.' }
    this.timer = setInterval(() => this.tick(), 1000); this.changed()
  }
  snapshot(): StatsState { return this.state }
  private changed(): void {
    if (this.active && this.state.selectedId === this.active.meta.id) this.state.view = this.active.view()
    this.state.activeId = this.active?.meta.id ?? null
    const current = this.active ? historyOf(this.active.view()) : null
    if (current) this.state.history = [current, ...this.state.history.filter(item => item.id !== current.id)].slice(0, 200)
    this.state = { ...this.state, revision: this.state.revision + 1 }; this.publish(this.state)
  }
  private hash(value: string): string { return createHmac('sha256', this.salt).update(value).digest('hex') }
  private row(row: MetricRow): void {
    if (!this.active || this.limited) return
    if (this.active.size >= 120000 || row.at - this.active.meta.startedAt >= 172800000) { this.limit('collection-limit'); return }
    if (this.active.apply(row)) this.store.append(this.active.meta.id, row)
  }
  limit(reason: 'collection-limit' | 'disk-error' | 'trigger-overflow'): void {
    if (!this.active || this.limited) return
    this.limited = true; const row: MetricRow = { kind: 'gap', at: Date.now(), reason }; this.active.apply(row); this.store.append(this.active.meta.id, row)
    this.state.message = 'Collection is incomplete. Output continues; session metrics are observed lower bounds.'
  }
  private begin(mode: SessionMeta['mode']): void {
    this.selecting++
    const at = Date.now(); const meta: SessionMeta = { id: `${at}-${randomUUID()}`, startedAt: at, endedAt: null, mode, channelId: mode === 'practice' ? '' : this.studio.snapshot().twitch.account?.id ?? '', status: 'running', incomplete: false }
    this.active = new StatsAccumulator(meta); this.salt = randomBytes(32); this.limited = false; this.viewerAt = 0; this.connection = null; this.scene = ''; this.healthAt = 0
    this.state.selectedId = meta.id; this.state.source = mode === 'practice' ? 'simulator' : 'twitch'; this.state.report = null
    this.row({ kind: 'start', at, meta }); this.observeStream(this.studio.snapshot()); this.changed()
  }
  start(mode: 'obs' | 'practice'): void {
    if (this.closed || this.active || this.engine.snapshot().mode || this.engine.setupTestActive) throw new Error('Stop the current output or tracking session first.')
    if (mode === 'obs' && !this.studio.snapshot().twitch.account) throw new Error('Connect Twitch before tracking an OBS stream.')
    this.begin(mode)
  }
  stop(): void {
    if (!this.active || !['obs', 'practice'].includes(this.active.meta.mode)) throw new Error('Use the output Stop control to finish an engine session.')
    this.end('stopped')
  }
  private end(status: 'stopped' | 'failed' | 'interrupted'): void {
    if (!this.active) return
    this.selecting++
    const ended = this.active; const row: MetricRow = { kind: 'end', at: Date.now(), status }
    ended.apply(row); this.store.append(ended.meta.id, row)
    const view = ended.view(); this.active = null
    this.state.history = [historyOf(view), ...this.state.history.filter(item => item.id !== view.meta.id)].slice(0, 200)
    if (this.state.selectedId === view.meta.id) { this.state.view = view; this.state.report = this.reportFor(view, this.state.source) }
    this.finishing = this.finishing.then(async () => {
      await this.store.summary(view)
      if (view.meta.incomplete && !view.warnings.some(w => w.startsWith('Collection is incomplete'))) view.warnings.unshift('Collection is incomplete. Some observed metrics could not be saved to the journal.')
      this.state.history = this.state.history.map(h => h.id === view.meta.id ? historyOf(view) : h)
      if (this.state.selectedId === view.meta.id && this.state.view?.meta.status !== 'running') { this.state.view = view; this.state.report = this.reportFor(view, this.state.source) }
      await this.store.report(view.meta.id, 'twitch', measuredReport(view, 'twitch')); await this.store.report(view.meta.id, 'simulator', measuredReport(view, 'simulator'))
      this.changed()
      if (this.state.autoReport && !this.closed && !this.controller) this.generate(view, view.meta.mode === 'practice' ? 'simulator' : 'twitch')
    }).catch(() => { this.state.message = 'The session report could not be saved. Check disk space; available metrics can still be copied.'; this.changed() })
    this.changed()
  }
  observeEngine(state: EngineState): void {
    if (this.closed) return
    const mode = this.engine.setupTestActive ? null : state.mode
    if (this.active && !['obs', 'practice'].includes(this.active.meta.mode) && !mode) this.end(state.phase === 'error' ? 'failed' : 'stopped')
    if (mode && this.active && this.active.meta.mode !== mode) this.end('stopped')
    if (mode && !this.active) this.begin(mode)
  }
  observeStream(state: StudioState): void {
    if (this.closed) return
    const active = this.active
    if (active && active.meta.mode !== 'practice' && active.meta.channelId !== (state.twitch.account?.id ?? '')) {
      for (const event of state.events) this.seen.add(`${event.source}:${event.id}`)
      this.end('interrupted'); return
    }
    if (active) {
      const at = Date.now(); const connected = state.twitch.socket === 'connected' && Boolean(state.twitch.account) && state.twitch.subscriptions.some(item => item.type === 'channel.chat.message' && item.status === 'enabled')
      if (active.meta.mode !== 'practice' && connected !== this.connection) { this.connection = connected; this.row({ kind: 'connection', at, connected }) }
      if (active.meta.mode !== 'practice' && state.twitch.viewersSampleAt && state.twitch.viewersSampleAt !== this.viewerAt && state.twitch.viewersSampleAt >= active.meta.startedAt) { this.viewerAt = state.twitch.viewersSampleAt; this.row({ kind: 'viewers', at: this.viewerAt, value: state.twitch.viewers }) }
      if (state.activeScene !== this.scene) { this.scene = state.activeScene; this.row({ kind: 'scene', at, scene: state.activeScene }) }
    }
    for (const event of state.events) {
      const id = `${event.source}:${event.id}`; if (this.seen.has(id)) continue; this.seen.add(id)
      if (!active || event.receivedAt < active.meta.startedAt || Date.now() - event.receivedAt > 30000 || active.meta.mode === 'practice' && event.source !== 'simulator') continue
      this.event(event)
    }
    if (this.seen.size > 1000) this.seen = new Set(state.events.map(event => `${event.source}:${event.id}`))
  }
  private event(event: StreamEvent): void {
    const row: MetricRow = { kind: 'event', at: event.receivedAt, source: event.source, id: this.hash(`${event.source}:${event.id}`), eventType: event.type,
      ...(event.type === 'chat' ? { own: event.own, userKey: this.hash(`user:${event.user.id}`) } : {}),
      ...(event.type === 'sub' ? { subKind: event.kind, gifted: event.gifted, count: Math.min(1e9, event.count) } : {}),
      ...(event.type === 'cheer' ? { bits: Math.min(1e9, event.bits) } : {}), ...(event.type === 'raid' ? { raidViewers: Math.min(1e9, event.viewers) } : {}) }
    this.row(row)
  }
  trigger(value: ConfirmedTrigger): void {
    if (!this.active || this.limited || this.closed || this.engine.setupTestActive) return
    const mode = this.active.meta.mode
    if (mode === 'practice' && value.source !== 'simulator' || (mode === 'obs' ? value.runtime !== 'obs' : value.runtime !== 'engine')) return
    if (this.active.datasets.twitch.triggers.length + this.active.datasets.simulator.triggers.length >= 20000) { this.limit('collection-limit'); return }
    this.row({ kind: 'trigger', at: Date.now(), source: value.source, eventId: this.hash(`${value.source}:${value.eventId}`), widgetId: value.widgetId, widgetName: value.widgetName, definitionId: value.definitionId })
  }
  private tick(): void {
    if (this.closed || !this.active) return
    this.observeStream(this.studio.snapshot())
    const state = this.engine.snapshot(); const at = Date.now()
    if (state.previewActive && state.telemetry && at - this.healthAt >= 10000) { this.healthAt = at; this.row({ kind: 'health', at, fps: state.telemetry.fps, missedPercent: state.telemetry.dropPercent, encoderDrops: state.outputDropped, outputIssues: state.outputIssues }) }
    this.changed()
  }
  async select(id: string, source: EventSource): Promise<void> {
    if (!this.state.history.some(item => item.id === id)) throw new Error('Choose a session from history.')
    const ticket = ++this.selecting
    const view = this.active?.meta.id === id ? this.active.view() : (await this.store.load(id)).view()
    const text = view.meta.status === 'running' ? null : await this.store.readReport(id, source)
    if (ticket !== this.selecting) return
    this.state.selectedId = id; this.state.source = source; this.state.view = view
    this.state.report = view.meta.status === 'running' ? null : text ? { sessionId: id, source, text, kind: text.includes('## AI analysis') ? 'ai' : 'measured', generatedAt: Date.now() } : this.reportFor(view, source)
    this.changed()
  }
  private reportFor(view: SessionView, source: EventSource): StatsReport { return { sessionId: view.meta.id, source, text: measuredReport(view, source), kind: 'measured', generatedAt: Date.now() } }
  generate(view = this.state.view, source = this.state.source): void {
    if (!view || view.meta.status === 'running') throw new Error('Stop the session before generating its AI report.')
    if (this.controller) throw new Error('Finish or cancel the current report first.')
    const controller = new AbortController(); this.controller = controller
    const captured = structuredClone(view)
    this.state.reportJob = { phase: 'writing', sessionId: captured.meta.id, message: 'Writing analysis from anonymous aggregate metrics. The measured report is retained.' }; this.changed()
    void this.finishing.then(() => {
      if (controller.signal.aborted) throw new Error('Report cancelled.')
      if (this.store.hasFailure(captured.meta.id)) { captured.meta.incomplete = true; captured.warnings.unshift('Some observed metrics could not be saved. The journal is incomplete.') }
      return this.ai.writeStreamReport(reportPayload(captured, source), controller.signal)
    }).then(async result => {
      if (controller.signal.aborted) return
      const baseline = this.reportFor(captured, source)
      const text = `${baseline.text}\n## AI analysis\n\nAI interpretation can be wrong. Use measured counts above as the source of truth.\n\n${safeAiReport(result)}\n`
      await this.store.report(captured.meta.id, source, text)
      if (!controller.signal.aborted) {
        if (this.state.selectedId === captured.meta.id && this.state.source === source) this.state.report = { ...baseline, text, kind: 'ai', generatedAt: Date.now() }
        this.state.reportJob = { phase: 'ready', sessionId: captured.meta.id, message: 'AI analysis saved beside the measured Markdown report.' }; this.changed()
      }
    }).catch((error: unknown) => { if (!controller.signal.aborted) { this.state.reportJob = { phase: 'error', sessionId: captured.meta.id, message: error instanceof Error ? error.message : 'Analysis failed. The measured report is available.' }; this.changed() } })
      .finally(() => { if (this.controller === controller) this.controller = null })
  }
  cancel(): void { this.controller?.abort(); this.state.reportJob = { ...this.state.reportJob, phase: 'cancelled', message: 'AI analysis cancelled. The measured report remains available.' }; this.changed() }
  copy(): void { if (!this.state.report) throw new Error('Stop and select a session report first.'); clipboard.writeText(this.state.report.text) }
  async reveal(): Promise<void> { const r = this.state.report; if (!r) throw new Error('Select a finished session first.'); await this.finishing; if (await this.store.readReport(r.sessionId, r.source) === null) await this.store.report(r.sessionId, r.source, r.text); shell.showItemInFolder(this.store.path(r.sessionId, `${r.source}.md`)) }
  async auto(enabled: boolean): Promise<void> { await writeFile(join(this.directory, 'stats.json'), JSON.stringify({ autoReport: enabled }), { mode: 0o600 }); this.state.autoReport = enabled; this.changed() }
  async close(): Promise<void> {
    if (this.closed) { await this.finishing; await this.store.flush(); return }
    this.closed = true; if (this.timer) clearInterval(this.timer); this.controller?.abort(); if (this.active) this.end('interrupted')
    await this.finishing; await this.store.flush()
  }
}
