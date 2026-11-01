import type { ActionResult } from './contracts'
import type { EventSource, EventType } from './events'
import type { SceneId } from './scenes'

export type StatsMode = 'live' | 'test' | 'record' | 'obs' | 'practice'
export type SessionStatus = 'running' | 'stopped' | 'failed' | 'interrupted'
export interface SessionMeta { id: string; startedAt: number; endedAt: number | null; mode: StatsMode; channelId: string; status: SessionStatus; incomplete: boolean }
export type MetricRow =
  | { kind: 'start'; at: number; meta: SessionMeta }
  | { kind: 'end'; at: number; status: Exclude<SessionStatus, 'running'> }
  | { kind: 'event'; at: number; source: EventSource; id: string; eventType: EventType; userKey?: string; own?: boolean; subKind?: 'new' | 'resub' | 'gift'; gifted?: boolean; count?: number; bits?: number; raidViewers?: number }
  | { kind: 'viewers'; at: number; value: number | null }
  | { kind: 'connection'; at: number; connected: boolean }
  | { kind: 'trigger'; at: number; source: EventSource; widgetId: string; widgetName: string; definitionId: string; eventId: string }
  | { kind: 'health'; at: number; fps: number; missedPercent: number; encoderDrops: number; outputIssues: number }
  | { kind: 'scene'; at: number; scene: SceneId }
  | { kind: 'gap'; at: number; reason: 'collection-limit' | 'disk-error' | 'trigger-overflow' | 'unclean-close' }
export interface StatsTotals { messages: number; uniqueChatters: number; follows: number; newSubs: number; resubs: number; giftSubs: number; bits: number; raids: number; raidViewers: number; redemptions: number; triggers: number }
export interface StatsPoint { at: number; messages: number | null; uniqueChatters: number; follows: number; subs: number; bits: number; raids: number; redemptions: number; triggers: number; viewers: number | null }
export interface WidgetImpact { widgetId: string; widgetName: string; triggers: number; complete: number; partial: number; overlapping: number; beforePerMinute: number | null; afterPerMinute: number | null; changePerMinute: number | null; liftPercent: number | null }
export interface StatsDataset {
  source: EventSource; totals: StatsTotals; observedMs: number; points: StatsPoint[]; impacts: WidgetImpact[]
  markers: { at: number; widgetName: string; widgetId: string }[]; viewerPeak: number | null; viewerAverage: number | null; viewerSamples: number
  viewerTimeline: { at: number; value: number | null }[]
  rollingMessages: number; peakMinute: { at: number; messages: number } | null
}
export interface SessionView { meta: SessionMeta; datasets: Record<EventSource, StatsDataset>; health: { at: number; fps: number; missedPercent: number; encoderDrops: number; outputIssues: number }[]; scenes: { at: number; scene: SceneId }[]; warnings: string[] }
export interface SessionHistory extends SessionMeta { messages: number; simulatedMessages: number; triggers: number; simulatedTriggers: number; viewerPeak: number | null }
export interface StatsReport { sessionId: string; source: EventSource; text: string; kind: 'measured' | 'ai'; generatedAt: number }
export interface StatsState { revision: number; activeId: string | null; history: SessionHistory[]; selectedId: string | null; view: SessionView | null; source: EventSource; report: StatsReport | null; reportJob: { phase: 'idle' | 'writing' | 'ready' | 'error' | 'cancelled'; sessionId: string; message: string }; autoReport: boolean; message: string }
export interface StatsApi {
  getStats(): Promise<StatsState>
  onStats(listener: (state: StatsState) => void): () => void
  selectStatsSession(id: string, source: EventSource): Promise<ActionResult>
  startStatsSession(mode: 'obs' | 'practice'): Promise<ActionResult>
  stopStatsSession(): Promise<ActionResult>
  generateStatsReport(): Promise<ActionResult>
  cancelStatsReport(): Promise<ActionResult>
  copyStatsReport(): Promise<ActionResult>
  revealStatsReport(): Promise<ActionResult>
  setAutoStatsReport(enabled: boolean): Promise<ActionResult>
}
export const STATS_IPC = { state: 'stats:state', update: 'stats:update', select: 'stats:select', start: 'stats:start', stop: 'stats:stop', report: 'stats:report', cancel: 'stats:cancel', copy: 'stats:copy', reveal: 'stats:reveal', auto: 'stats:auto' } as const
export const sessionIdValid = (id: unknown): id is string => typeof id === 'string' && /^\d{13}-[a-f0-9-]{36}$/.test(id)
