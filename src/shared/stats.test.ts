import { describe, expect, it } from 'vitest'
import { StatsAccumulator } from './stats-aggregate'
import { metricRow } from './stats-validate'
import type { MetricRow, SessionMeta } from './stats'

const start = 1800000000000
const meta: SessionMeta = { id: `${start}-00000000-0000-0000-0000-000000000001`, startedAt: start, endedAt: null, mode: 'test', channelId: 'channel', status: 'running', incomplete: false }
let sequence = 0
const event = (seconds: number, extra: Partial<Extract<MetricRow, { kind: 'event' }>> = {}): Extract<MetricRow, { kind: 'event' }> => ({ kind: 'event', at: start + seconds * 1000, id: (++sequence).toString(16).padStart(64, '0'), source: 'twitch', eventType: 'chat', userKey: 'a'.repeat(64), ...extra })
const trigger = (e: Extract<MetricRow, { kind: 'event' }>, widgetId = 'alerts'): Extract<MetricRow, { kind: 'trigger' }> => ({ kind: 'trigger', at: e.at, eventId: e.id, source: e.source, widgetId, widgetName: 'Alerts', definitionId: 'builtin-alerts' })
function fixture(): StatsAccumulator { const a = new StatsAccumulator(meta); a.apply({ kind: 'connection', at: start, connected: true }); return a }
describe('session metrics and two-minute windows', () => {
  it('measures a deterministic ten-minute stream independently of the 200-event UI buffer', () => {
    const a = fixture()
    for (let second = 0; second < 600; second++) a.apply(event(second, { userKey: String(second % 10).padStart(64, 'a') }))
    const e = event(300, { eventType: 'follow' }); a.apply(e); a.apply(trigger(e)); a.apply(trigger(e))
    for (let second = 300; second < 420; second++) a.apply(event(second + .5))
    a.apply({ kind: 'viewers', at: start + 60000, value: 10 }); a.apply({ kind: 'viewers', at: start + 120000, value: 20 }); a.apply({ kind: 'viewers', at: start + 180000, value: null })
    a.apply({ kind: 'end', at: start + 600000, status: 'stopped' })
    const d = a.view().datasets.twitch
    expect(d.totals).toMatchObject({ messages: 720, follows: 1, triggers: 1, uniqueChatters: 11 })
    expect(d.points).toHaveLength(10); expect(d.points.reduce((sum, p) => sum + (p.messages ?? 0), 0)).toBe(720)
    expect(d.impacts[0]).toMatchObject({ complete: 1, beforePerMinute: 60, afterPerMinute: 120, changePerMinute: 60, liftPercent: 100 })
    expect(d.viewerAverage).toBe(15); expect(d.viewerPeak).toBe(20); expect(d.points[4]!.viewers).toBeNull()
  })
  it('separates simulator, ignores own chat, and counts gift batches once', () => {
    const a = fixture(); const chat = event(1); a.apply(chat); a.apply(chat); a.apply(event(2, { own: true })); a.apply(event(3, { source: 'simulator' }))
    a.apply(event(4, { eventType: 'sub', subKind: 'gift', count: 5, gifted: true })); a.apply(event(5, { eventType: 'sub', subKind: 'new', gifted: true })); a.apply(event(6, { eventType: 'sub', subKind: 'resub' })); a.apply(event(7, { eventType: 'sub', subKind: 'new' }))
    a.apply(event(8, { eventType: 'cheer', bits: 100 })); a.apply(event(9, { eventType: 'raid', raidViewers: 25 })); a.apply(event(10, { eventType: 'redeem' }))
    const v = a.view(start + 60000)
    expect(v.datasets.twitch.totals).toMatchObject({ messages: 1, uniqueChatters: 1, newSubs: 1, resubs: 1, giftSubs: 5, bits: 100, raids: 1, raidViewers: 25, redemptions: 1 })
    expect(v.datasets.simulator.totals.messages).toBe(1); expect(v.datasets.simulator.viewerPeak).toBeNull()
  })
  it('excludes partial or disconnected windows and never invents a zero-baseline percentage', () => {
    const a = fixture(); const early = event(30); a.apply(early); a.apply(trigger(early, 'early'))
    const zero = event(180, { eventType: 'follow' }); a.apply(zero); a.apply(trigger(zero, 'zero'))
    const gap = event(400); a.apply(gap); a.apply(trigger(gap, 'gap'))
    a.apply({ kind: 'connection', at: start + 450000, connected: false }); a.apply({ kind: 'connection', at: start + 480000, connected: true })
    const d = a.view(start + 600000).datasets.twitch
    expect(d.impacts.find(w => w.widgetId === 'early')).toMatchObject({ complete: 0, partial: 1, changePerMinute: null })
    expect(d.impacts.find(w => w.widgetId === 'zero')).toMatchObject({ complete: 1, beforePerMinute: 0, liftPercent: null })
    expect(d.impacts.find(w => w.widgetId === 'gap')).toMatchObject({ complete: 0, partial: 1 })
    expect(d.points[7]!.messages).toBeNull(); expect(d.observedMs).toBe(570000)
  })
  it('deduplicates multiple runtimes, rejects unknown/cross-source witnesses, flags overlaps', () => {
    const a = fixture(); const e = event(180); a.apply(e)
    expect(a.apply({ ...trigger(e), at: e.at - 1 })).toBe(false); expect(a.apply({ ...trigger(e), at: e.at + 31000 })).toBe(false)
    expect(a.apply(trigger(e))).toBe(true); expect(a.apply(trigger(e))).toBe(false)
    expect(a.apply({ ...trigger(e), source: 'simulator' })).toBe(false)
    expect(a.apply(trigger(event(181)))).toBe(false)
    a.apply(trigger(e, 'ticker'))
    expect(a.view(start + 600000).datasets.twitch.impacts.every(w => w.overlapping === 1)).toBe(true)
  })
  it('marks collection gaps incomplete, and never extrapolates a partial minute', () => {
    const a = fixture(); a.apply(event(1)); expect(a.view(start + 2000).datasets.twitch.points[0]!.messages).toBe(1)
    a.apply({ kind: 'gap', at: start + 3000, reason: 'collection-limit' })
    expect(a.view(start + 600000).meta.incomplete).toBe(true); expect(a.view(start + 600000).datasets.twitch.points[1]!.messages).toBeNull()
  })
  it('uses exact viewer sample timestamps and breaks stale polls', () => {
    const a = fixture(); a.apply({ kind: 'viewers', at: start + 61000, value: 10 }); a.apply({ kind: 'viewers', at: start + 250000, value: 20 })
    expect(a.view(start + 600000).datasets.twitch.viewerTimeline).toEqual([{ at: start + 61000, value: 10 }, { at: start + 151000, value: null }, { at: start + 250000, value: 20 }, { at: start + 340000, value: null }])
  })
})
describe('journal validation', () => {
  it('copies only approved fields and rejects invalid metrics', () => {
    const row = event(1)
    expect(metricRow({ ...row, text: 'private chat', token: 'secret' })).toEqual(row)
    expect(metricRow({ ...row, bits: -1 })).toBeNull(); expect(metricRow({ ...row, source: 'combined' })).toBeNull()
    expect(metricRow({ ...row, userKey: 'viewer-name' })).toBeNull(); expect(metricRow({ ...row, id: '../path' })).toBeNull()
    expect(metricRow({ kind: 'viewers', at: Infinity, value: 0 })).toBeNull()
  })
})
