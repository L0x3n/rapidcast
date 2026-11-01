import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StatsStore } from './store'
import { StatsAccumulator } from '../../shared/stats-aggregate'
import { measuredReport, reportPayload, safeAiReport } from './report'
import type { SessionMeta } from '../../shared/stats'
const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })
const at = 1800000000000
const meta: SessionMeta = { id: `${at}-00000000-0000-0000-0000-000000000001`, startedAt: at, endedAt: null, mode: 'record', channelId: '', status: 'running', incomplete: false }
async function fixture() { const directory = await mkdtemp(join(tmpdir(), 'rapidcast-stats-')); directories.push(directory); const store = new StatsStore(directory, () => undefined); await store.initialize(); return store }
describe('bounded session storage', () => {
  it('serializes concurrent atomic report writes', async () => {
    const store = await fixture()
    await Promise.all([store.report(meta.id, 'twitch', 'first'), store.report(meta.id, 'twitch', 'second')])
    expect(await store.readReport(meta.id, 'twitch')).toBe('second')
  })
  it('bounds queued writes and reports disk failure without unhandled rejections', async () => {
    const store = await fixture(); const failure = vi.fn(); const blocked = new StatsStore(join(store.directory, 'missing'), failure)
    blocked.append(meta.id, { kind: 'start', at, meta }); await blocked.flush()
    expect(failure).toHaveBeenCalledOnce(); expect(blocked.hasFailure(meta.id)).toBe(true)
    expect(blocked.append(meta.id, { kind: 'end', at, status: 'stopped' })).toBe(false)
    const overload = vi.fn(); const bounded = new StatsStore(store.directory, overload)
    for (let index = 0; index < 2000; index++) bounded.append(meta.id, { kind: 'start', at, meta: { ...meta, channelId: 'x'.repeat(1000) } })
    await bounded.flush(); expect(overload).toHaveBeenCalledOnce(); expect(bounded.hasFailure(meta.id)).toBe(true)
  })
  it('replays JSONL, preserves summaries and saves separate Markdown reports', async () => {
    const store = await fixture(); store.append(meta.id, { kind: 'start', at, meta }); store.append(meta.id, { kind: 'end', at: at + 600000, status: 'stopped' })
    const v = (await store.load(meta.id)).view(); await store.summary(v)
    await store.report(meta.id, 'simulator', measuredReport(v, 'simulator'))
    expect(await store.initialize()).toEqual([expect.objectContaining({ id: meta.id, status: 'stopped', messages: 0 })])
    expect(await store.readReport(meta.id, 'simulator')).toContain('SIMULATOR TEST'); expect(await store.readReport(meta.id, 'twitch')).toBeNull()
  })
  it('recovers an unfinished/truncated journal at its last readable time, without invented downtime', async () => {
    const store = await fixture(); store.append(meta.id, { kind: 'start', at, meta }); store.append(meta.id, { kind: 'viewers', at: at + 2000, value: 4 }); await store.flush()
    await appendFile(store.path(meta.id), '{"kind":"event",')
    const history = await store.initialize(); expect(history[0]).toMatchObject({ endedAt: at + 2000, status: 'interrupted', incomplete: true })
    expect((await store.load(meta.id)).meta).toMatchObject({ endedAt: at + 2000, status: 'interrupted', incomplete: true })
  })
  it('rejects traversal and exposes only aggregate anonymous data to AI', async () => {
    const store = await fixture(); expect(() => store.path('../secret')).toThrow('session')
    const a = new StatsAccumulator(meta); a.apply({ kind: 'event', at: at + 1000, id: 'a'.repeat(64), userKey: 'b'.repeat(64), eventType: 'chat', source: 'simulator' }); a.apply({ kind: 'trigger', at: at + 1000, eventId: 'a'.repeat(64), source: 'simulator', widgetId: 'foo', widgetName: 'Viewer named secret', definitionId: 'bar' }); a.apply({ kind: 'end', at: at + 600000, status: 'stopped' })
    const payload = reportPayload(a.view(), 'simulator')
    expect(payload).toContain('Widget 1'); expect(payload).not.toContain('Viewer named secret'); expect(payload).not.toContain('a'.repeat(64)); expect(payload).not.toContain('b'.repeat(64))
    expect(safeAiReport('<script>code</script> [click](https://example.com) https://example.com')).not.toMatch(/<script>|https:/)
    await store.report(meta.id, 'twitch', 'saved'); expect(await readFile(store.path(meta.id, 'twitch.md'), 'utf8')).toBe('saved')
  })
})
