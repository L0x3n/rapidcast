import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { StatsAccumulator } from '../../shared/stats-aggregate'
import { metricRow, sessionMeta } from '../../shared/stats-validate'
import { sessionIdValid, type MetricRow, type SessionHistory, type SessionView } from '../../shared/stats'
import { record, type EventSource } from '../../shared/events'

export const historyOf = (view: SessionView): SessionHistory => ({ ...view.meta, messages: view.datasets.twitch.totals.messages, simulatedMessages: view.datasets.simulator.totals.messages,
  triggers: view.datasets.twitch.totals.triggers, simulatedTriggers: view.datasets.simulator.totals.triggers, viewerPeak: view.datasets.twitch.viewerPeak })
export class StatsStore {
  readonly directory: string
  private queue: Promise<void> = Promise.resolve()
  private writes: Promise<void> = Promise.resolve()
  private pending = 0
  private bytes = new Map<string, number>()
  private failed = new Set<string>()
  constructor(directory: string, private readonly failure: (id: string) => void) { this.directory = join(directory, 'sessions') }
  path(id: string, extension = 'jsonl'): string { if (!sessionIdValid(id)) throw new Error('Choose a saved session.'); return join(this.directory, `${id}.${extension}`) }
  async initialize(): Promise<SessionHistory[]> {
    await mkdir(this.directory, { recursive: true })
    const names = (await readdir(this.directory)).filter(name => name.endsWith('.jsonl') && sessionIdValid(name.slice(0, -6))).sort().reverse().slice(0, 200)
    const result: SessionHistory[] = []
    for (const name of names) {
      const id = name.slice(0, -6)
      try {
        const raw = record(JSON.parse(await readFile(this.path(id, 'meta.json'), 'utf8'))); const meta = sessionMeta(raw)
        if (meta && meta.id === id && meta.status !== 'running' && ['messages', 'simulatedMessages', 'triggers', 'simulatedTriggers'].every(key => typeof raw[key] === 'number' && Number.isFinite(raw[key]) && Number(raw[key]) >= 0) && (raw.viewerPeak === null || typeof raw.viewerPeak === 'number' && Number.isFinite(raw.viewerPeak) && raw.viewerPeak >= 0)) {
          result.push({ ...meta, messages: Number(raw.messages), simulatedMessages: Number(raw.simulatedMessages), triggers: Number(raw.triggers), simulatedTriggers: Number(raw.simulatedTriggers), viewerPeak: raw.viewerPeak as number | null }); continue
        }
      } catch { /* A missing or unfinished sidecar is recovered from its journal. */ }
      try { const loaded = await this.load(id, true); await this.summary(loaded.view()); result.push(historyOf(loaded.view())) } catch { /* Invalid journals stay on disk for inspection. */ }
    }
    return result
  }
  append(id: string, row: MetricRow): boolean {
    if (this.failed.has(id)) return false
    const line = JSON.stringify(row) + '\n'; const bytes = Buffer.byteLength(line)
    if (this.pending + bytes > 1024 * 1024 || (this.bytes.get(id) ?? 0) + bytes > 64 * 1024 * 1024) { this.failed.add(id); this.failure(id); return false }
    this.bytes.set(id, (this.bytes.get(id) ?? 0) + bytes); this.pending += bytes
    this.queue = this.queue.then(async () => { if (!this.failed.has(id)) await appendFile(this.path(id), line, { encoding: 'utf8', mode: 0o600 }) })
      .catch(() => { if (!this.failed.has(id)) { this.failed.add(id); this.failure(id) } }).finally(() => { this.pending -= bytes })
    return true
  }
  async flush(): Promise<void> { await this.queue; await this.writes }
  hasFailure(id: string): boolean { return this.failed.has(id) }
  async atomic(id: string, extension: string, value: string): Promise<void> {
    const path = this.path(id, extension)
    const work = this.writes.then(async () => { await writeFile(`${path}.tmp`, value, { mode: 0o600 }); await rename(`${path}.tmp`, path) })
    this.writes = work.catch(() => undefined); await work
  }
  async summary(view: SessionView): Promise<void> { await this.flush(); if (this.hasFailure(view.meta.id)) view.meta.incomplete = true; await this.atomic(view.meta.id, 'meta.json', JSON.stringify(historyOf(view))) }
  async load(id: string, recover = false): Promise<StatsAccumulator> {
    await this.flush()
    if ((await stat(this.path(id))).size > 64 * 1024 * 1024) throw new Error('This session journal exceeds the 64 MB reading limit.')
    const input = createReadStream(this.path(id), { encoding: 'utf8' }); const lines = createInterface({ input, crlfDelay: Infinity })
    let aggregate: StatsAccumulator | null = null; let last = 0; let invalid = false; let ended = false
    try {
      for await (const line of lines) {
        if (!line) continue
        let row: MetricRow | null = null
        if (line.length <= 4096) { try { row = metricRow(JSON.parse(line)) } catch { /* Includes an interrupted final line. */ } }
        if (!row) { invalid = true; continue }
        if (!aggregate) { if (row.kind !== 'start' || row.meta.id !== id || row.at !== row.meta.startedAt) throw new Error('Session header is invalid.'); aggregate = new StatsAccumulator(row.meta) }
        if (ended || row.at < aggregate.meta.startedAt || row.kind !== 'end' && row.kind !== 'gap' && row.at - aggregate.meta.startedAt > 172800000 || aggregate.size > 120010) { invalid = true; continue }
        aggregate.apply(row); last = Math.max(last, row.at); if (row.kind === 'end') ended = true
      }
    } finally { lines.close(); input.destroy() }
    if (!aggregate) throw new Error('This session has no readable metrics.')
    if (!ended) {
      aggregate.apply({ kind: 'gap', at: last, reason: 'unclean-close' }); aggregate.apply({ kind: 'end', at: last, status: 'interrupted' })
      if (recover) { await appendFile(this.path(id), '\n' + JSON.stringify({ kind: 'gap', at: last, reason: 'unclean-close' }) + '\n' + JSON.stringify({ kind: 'end', at: last, status: 'interrupted' }) + '\n') }
    }
    if (invalid) aggregate.meta.incomplete = true
    return aggregate
  }
  async report(id: string, source: EventSource, text: string): Promise<void> { await this.atomic(id, `${source}.md`, text) }
  async readReport(id: string, source: EventSource): Promise<string | null> { try { const path = this.path(id, `${source}.md`); if ((await stat(path)).size > 64000) return null; return await readFile(path, 'utf8') } catch { return null } }
}
