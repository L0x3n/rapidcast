import { record, type EventSource, type EventType } from './events'
import { SCENES } from './scenes'
import { sessionIdValid, type MetricRow, type SessionMeta } from './stats'

const number = (v: unknown, max = 1e15): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const text = (v: unknown, max = 100): v is string => typeof v === 'string' && v.length <= max && !/[\x00-\x1f]/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
export function sessionMeta(raw: unknown): SessionMeta | null {
  const v = record(raw)
  if (!sessionIdValid(v.id) || !number(v.startedAt) || !(v.endedAt === null || number(v.endedAt) && v.endedAt >= v.startedAt) ||
      !['live', 'test', 'record', 'obs', 'practice'].includes(String(v.mode)) || !text(v.channelId) ||
      !['running', 'stopped', 'failed', 'interrupted'].includes(String(v.status)) || typeof v.incomplete !== 'boolean') return null
  return { id: v.id, startedAt: v.startedAt, endedAt: v.endedAt, mode: v.mode as SessionMeta['mode'], channelId: v.channelId, status: v.status as SessionMeta['status'], incomplete: v.incomplete }
}
export function metricRow(raw: unknown): MetricRow | null {
  const v = record(raw); if (!number(v.at)) return null
  const at = v.at
  if (v.kind === 'start') { const meta = sessionMeta(v.meta); return meta ? { kind: 'start', at, meta } : null }
  if (v.kind === 'end' && ['stopped', 'failed', 'interrupted'].includes(String(v.status))) return { kind: 'end', at, status: v.status as 'stopped' | 'failed' | 'interrupted' }
  if (v.kind === 'viewers' && (v.value === null || number(v.value, 1e9))) return { kind: 'viewers', at, value: v.value }
  if (v.kind === 'connection' && typeof v.connected === 'boolean') return { kind: 'connection', at, connected: v.connected }
  if (v.kind === 'scene' && SCENES.some(s => s.id === v.scene)) return { kind: 'scene', at, scene: v.scene as 'live' | 'starting' | 'brb' | 'ending' }
  if (v.kind === 'gap' && ['collection-limit', 'disk-error', 'trigger-overflow', 'unclean-close'].includes(String(v.reason))) return { kind: 'gap', at, reason: v.reason as Extract<MetricRow, { kind: 'gap' }>['reason'] }
  if (v.kind === 'health' && ['fps', 'missedPercent', 'encoderDrops', 'outputIssues'].every(key => number(v[key], 1e9))) return { kind: 'health', at, fps: Number(v.fps), missedPercent: Number(v.missedPercent), encoderDrops: Number(v.encoderDrops), outputIssues: Number(v.outputIssues) }
  if (v.source !== 'twitch' && v.source !== 'simulator') return null
  const source: EventSource = v.source
  if (v.kind === 'trigger' && text(v.widgetId, 80) && text(v.widgetName) && text(v.definitionId) && hash(v.eventId)) return { kind: 'trigger', at, source, widgetId: v.widgetId, widgetName: v.widgetName, definitionId: v.definitionId, eventId: v.eventId }
  if (v.kind !== 'event' || !hash(v.id) || !['chat', 'follow', 'sub', 'cheer', 'raid', 'redeem', 'streamOnline', 'streamOffline'].includes(String(v.eventType)) ||
      v.userKey !== undefined && !hash(v.userKey) || v.own !== undefined && typeof v.own !== 'boolean' || v.gifted !== undefined && typeof v.gifted !== 'boolean' ||
      v.subKind !== undefined && !['new', 'resub', 'gift'].includes(String(v.subKind)) || ['count', 'bits', 'raidViewers'].some(key => v[key] !== undefined && (!number(v[key], 1e9) || !Number.isInteger(v[key])))) return null
  return { kind: 'event', at, source, id: v.id, eventType: v.eventType as EventType,
    ...(hash(v.userKey) ? { userKey: v.userKey } : {}), ...(typeof v.own === 'boolean' ? { own: v.own } : {}), ...(typeof v.gifted === 'boolean' ? { gifted: v.gifted } : {}),
    ...(v.subKind ? { subKind: v.subKind as 'new' | 'resub' | 'gift' } : {}), ...(number(v.count) ? { count: v.count } : {}), ...(number(v.bits) ? { bits: v.bits } : {}), ...(number(v.raidViewers) ? { raidViewers: v.raidViewers } : {}) }
}
