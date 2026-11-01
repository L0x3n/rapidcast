import type { EventSource } from './events'
import type { MetricRow, SessionMeta, SessionView, StatsDataset, StatsPoint, StatsTotals, WidgetImpact } from './stats'

const windowMs = 120000
const totals = (): StatsTotals => ({ messages: 0, uniqueChatters: 0, follows: 0, newSubs: 0, resubs: 0, giftSubs: 0, bits: 0, raids: 0, raidViewers: 0, redemptions: 0, triggers: 0 })
interface Bucket { messages: number; users: Set<string>; follows: number; subs: number; bits: number; raids: number; redemptions: number; triggers: number }
interface Data { totals: StatsTotals; users: Set<string>; chats: number[]; triggers: Extract<MetricRow, { kind: 'trigger' }>[]; buckets: Map<number, Bucket> }
const data = (): Data => ({ totals: totals(), users: new Set(), chats: [], triggers: [], buckets: new Map() })
function lower(values: number[], value: number): number { let a = 0; let b = values.length; while (a < b) { const m = (a + b) >>> 1; if (values[m]! < value) a = m + 1; else b = m }; return a }
function insert(values: number[], value: number): void { if (!values.length || values.at(-1)! <= value) values.push(value); else values.splice(lower(values, value), 0, value) }
export class StatsAccumulator {
  readonly datasets: Record<EventSource, Data> = { twitch: data(), simulator: data() }
  readonly events = new Map<string, Extract<MetricRow, { kind: 'event' }>>()
  private triggered = new Set<string>()
  private connections: Extract<MetricRow, { kind: 'connection' }>[] = []
  private viewers: Extract<MetricRow, { kind: 'viewers' }>[] = []
  private health: Extract<MetricRow, { kind: 'health' }>[] = []
  private scenes: Extract<MetricRow, { kind: 'scene' }>[] = []
  private gaps: Extract<MetricRow, { kind: 'gap' }>[] = []
  private count = 0
  meta: SessionMeta
  constructor(meta: SessionMeta) { this.meta = structuredClone(meta) }
  get size(): number { return this.count }
  apply(row: MetricRow): boolean {
    if (!Number.isFinite(row.at) || row.at < this.meta.startedAt) return false
    if (row.kind === 'event') {
      if (this.events.has(row.id)) return false
      this.events.set(row.id, row)
      const d = this.datasets[row.source]; const bucket = this.bucket(d, row.at)
      if (row.eventType === 'chat' && !row.own) {
        d.totals.messages++; bucket.messages++; insert(d.chats, row.at)
        if (row.userKey) { d.users.add(row.userKey); bucket.users.add(row.userKey); d.totals.uniqueChatters = d.users.size }
      } else if (row.eventType === 'follow') { d.totals.follows++; bucket.follows++ }
      else if (row.eventType === 'sub') {
        if (row.subKind === 'gift') { d.totals.giftSubs += row.count ?? 0; bucket.subs += row.count ?? 0 }
        else if (!row.gifted) { if (row.subKind === 'resub') d.totals.resubs++; else d.totals.newSubs++; bucket.subs++ }
      } else if (row.eventType === 'cheer') { d.totals.bits += row.bits ?? 0; bucket.bits += row.bits ?? 0 }
      else if (row.eventType === 'raid') { d.totals.raids++; d.totals.raidViewers += row.raidViewers ?? 0; bucket.raids++ }
      else if (row.eventType === 'redeem') { d.totals.redemptions++; bucket.redemptions++ }
    } else if (row.kind === 'trigger') {
      const key = `${row.widgetId}:${row.eventId}`
      const event = this.events.get(row.eventId)
      if (this.triggered.has(key) || event?.source !== row.source || row.at < event.at || row.at - event.at > 30000) return false
      this.triggered.add(key); const d = this.datasets[row.source]; d.triggers.push(row); d.totals.triggers++; this.bucket(d, row.at).triggers++
    } else if (row.kind === 'viewers') this.viewers.push(row)
    else if (row.kind === 'connection') this.connections.push(row)
    else if (row.kind === 'health') this.health.push(row)
    else if (row.kind === 'scene') this.scenes.push(row)
    else if (row.kind === 'gap') { this.gaps.push(row); this.meta.incomplete = true }
    else if (row.kind === 'end') { this.meta.endedAt = row.at; this.meta.status = row.status }
    this.count++; return true
  }
  private bucket(d: Data, at: number): Bucket {
    const index = Math.floor((at - this.meta.startedAt) / 60000)
    let bucket = d.buckets.get(index)
    if (!bucket) { bucket = { messages: 0, users: new Set(), follows: 0, subs: 0, bits: 0, raids: 0, redemptions: 0, triggers: 0 }; d.buckets.set(index, bucket) }
    return bucket
  }
  private intervals(end: number): [number, number][] {
    const result: [number, number][] = []; let open: number | null = null
    for (const c of [...this.connections].sort((a, b) => a.at - b.at)) { if (c.connected && open === null) open = c.at; else if (!c.connected && open !== null) { result.push([open, c.at]); open = null } }
    if (open !== null) result.push([open, end])
    return result
  }
  view(now = Date.now()): SessionView {
    const end = Math.max(this.meta.startedAt, this.meta.endedAt ?? now)
    const intervals = this.intervals(end)
    const observedEnd = this.gaps.reduce((earliest, gap) => Math.min(earliest, gap.at), end)
    const coverage = (from: number, to: number, source: EventSource): number => source === 'simulator' ? Math.max(0, Math.min(to, observedEnd) - from) : intervals.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(to, b, observedEnd) - Math.max(from, a)), 0)
    const datasets = {} as Record<EventSource, StatsDataset>
    for (const source of ['twitch', 'simulator'] as const) {
      const d = this.datasets[source]; const points: StatsPoint[] = []; let peakMinute: StatsDataset['peakMinute'] = null
      const last = Math.min(2880, Math.max(0, Math.ceil((end - this.meta.startedAt) / 60000) - 1))
      for (let minute = 0; minute <= last; minute++) {
        const at = this.meta.startedAt + minute * 60000; const to = Math.min(end, at + 60000); const b = d.buckets.get(minute)
        const complete = to > at && coverage(at, to, source) >= to - at && !this.gaps.some(gap => gap.at < to)
        const sample = source === 'twitch' ? this.viewers.filter(value => value.at <= to && value.at >= at - 90000).at(-1) : undefined
        const messages = complete ? b?.messages ?? 0 : null
        points.push({ at, messages, uniqueChatters: b?.users.size ?? 0, follows: b?.follows ?? 0, subs: b?.subs ?? 0, bits: b?.bits ?? 0, raids: b?.raids ?? 0, redemptions: b?.redemptions ?? 0, triggers: b?.triggers ?? 0, viewers: sample && sample.at >= to - 90000 && sample.value !== null && coverage(sample.at, to, source) >= to - sample.at ? sample.value : null })
        if (messages !== null && (!peakMinute || messages > peakMinute.messages)) peakMinute = { at, messages }
      }
      const triggers = [...d.triggers].sort((a, b) => a.at - b.at)
      const impacts = new Map<string, { item: WidgetImpact; before: number; after: number }>()
      for (let index = 0; index < triggers.length; index++) {
        const t = triggers[index]!
        let group = impacts.get(t.widgetId)
        if (!group) { group = { item: { widgetId: t.widgetId, widgetName: t.widgetName, triggers: 0, complete: 0, partial: 0, overlapping: 0, beforePerMinute: null, afterPerMinute: null, changePerMinute: null, liftPercent: null }, before: 0, after: 0 }; impacts.set(t.widgetId, group) }
        group.item.triggers++
        const full = t.at - windowMs >= this.meta.startedAt && t.at + windowMs <= end && coverage(t.at - windowMs, t.at + windowMs, source) >= windowMs * 2 && !this.gaps.some(gap => gap.at < t.at + windowMs)
        if (!full) { group.item.partial++; continue }
        group.item.complete++
        if (index > 0 && t.at - triggers[index - 1]!.at < windowMs * 2 || index + 1 < triggers.length && triggers[index + 1]!.at - t.at < windowMs * 2) group.item.overlapping++
        group.before += lower(d.chats, t.at) - lower(d.chats, t.at - windowMs)
        group.after += lower(d.chats, t.at + windowMs) - lower(d.chats, t.at)
      }
      const ranked = [...impacts.values()].map(({ item, before, after }) => item.complete ? { ...item, beforePerMinute: before / (item.complete * 2), afterPerMinute: after / (item.complete * 2), changePerMinute: (after - before) / (item.complete * 2), liftPercent: before > 0 ? (after - before) / before * 100 : null } : item).sort((a, b) => (b.changePerMinute ?? -Infinity) - (a.changePerMinute ?? -Infinity))
      const samples = source === 'twitch' ? this.viewers.flatMap(sample => sample.value !== null ? [sample.value] : []) : []
      const viewerTimeline: StatsDataset['viewerTimeline'] = []
      if (source === 'twitch') for (let index = 0; index < this.viewers.length; index++) {
        const sample = this.viewers[index]!
        viewerTimeline.push({ at: sample.at, value: sample.value })
        const next = this.viewers[index + 1]?.at ?? end
        if (sample.value !== null && next - sample.at > 90000) viewerTimeline.push({ at: sample.at + 90000, value: null })
      }
      datasets[source] = { source, totals: { ...d.totals }, observedMs: coverage(this.meta.startedAt, end, source), points, impacts: ranked,
        markers: triggers.slice(-200).map(t => ({ at: t.at, widgetName: t.widgetName, widgetId: t.widgetId })), viewerPeak: samples.length ? samples.reduce((peak, value) => Math.max(peak, value), 0) : null,
        viewerAverage: samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null, viewerSamples: samples.length, viewerTimeline,
        rollingMessages: lower(d.chats, end + 1) - lower(d.chats, Math.max(this.meta.startedAt, end - 60000)), peakMinute }
    }
    return { meta: { ...this.meta }, datasets, health: this.health.slice(-3000), scenes: this.scenes.slice(-1000), warnings: [
      ...(this.meta.mode === 'practice' ? ['Practice session: simulator data is not a real stream.'] : []),
      ...(this.meta.incomplete ? ['Collection is incomplete. Counts are observed lower bounds and impact windows may be unavailable.'] : []),
      ...(coverage(this.meta.startedAt, end, 'twitch') < end - this.meta.startedAt ? ['Twitch connection did not cover the entire session. Unknown intervals are gaps, not zero activity.'] : []),
      'Viewer values are Twitch channel samples, not recording viewers. Chat excludes the connected account’s own messages. Gift recipients are not added again to gift-batch totals.',
      'Widget impact is association, not causation. Overlapping triggers can share the same chat activity.'
    ] }
  }
}
