import type { EventSource } from '../../shared/events'
import type { SessionView } from '../../shared/stats'

const n = (v: number | null): string => v === null ? 'unavailable' : v.toFixed(1).replace(/\.0$/, '')
const label = (v: string): string => v.replace(/[\r\n|<>`\[\]#!*_\\]/g, ' ').slice(0, 100)
export function reportPayload(view: SessionView, source: EventSource): string {
  const d = view.datasets[source]
  return JSON.stringify({ dataSource: source === 'simulator' ? 'SIMULATOR TEST ONLY' : 'Observed Twitch events', mode: view.meta.mode, seconds: ((view.meta.endedAt ?? view.meta.startedAt) - view.meta.startedAt) / 1000,
    observedSeconds: d.observedMs / 1000, incomplete: view.meta.incomplete, totals: d.totals, sampledViewerAverage: d.viewerAverage, sampledViewerPeak: d.viewerPeak, viewerSamples: d.viewerSamples,
    peakMinute: d.peakMinute ? { elapsedMinute: Math.floor((d.peakMinute.at - view.meta.startedAt) / 60000), messages: d.peakMinute.messages } : null,
    widgets: d.impacts.slice(0, 30).map((w, index) => ({ widget: `Widget ${index + 1}`, triggers: w.triggers, completeWindows: w.complete, partialWindows: w.partial, overlappingWindows: w.overlapping, beforeMessagesPerMinute: w.beforePerMinute, afterMessagesPerMinute: w.afterPerMinute, difference: w.changePerMinute, percent: w.liftPercent })), limitations: view.warnings })
}
export function measuredReport(view: SessionView, source: EventSource): string {
  const d = view.datasets[source]; const t = d.totals
  const header = `# RapidCast stream report${source === 'simulator' ? ' · SIMULATOR TEST' : ''}\n\nSession: ${view.meta.id}\n\nStarted: ${new Date(view.meta.startedAt).toISOString()}\n\nMode: ${view.meta.mode}. Status: ${view.meta.status}. Duration: ${n(((view.meta.endedAt ?? view.meta.startedAt) - view.meta.startedAt) / 60000)} minutes.\n\nSource: ${source === 'simulator' ? 'Simulator only. These are test events, not audience results.' : 'Twitch only. Counts include only events observed during this session.'}\n\n`
  return header + `## Measured activity\n\n- Messages: ${t.messages}; unique chatters: ${t.uniqueChatters}\n- Follows: ${t.follows}; new subscriptions: ${t.newSubs}; resubs: ${t.resubs}; gift subscriptions: ${t.giftSubs}\n- Bits: ${t.bits}; raids: ${t.raids}; raid viewers: ${t.raidViewers}; redemptions: ${t.redemptions}\n- Visible widget triggers: ${t.triggers}\n- EventSub coverage: ${n(d.observedMs / 60000)} minutes${source === 'simulator' ? ' (simulator observation)' : ''}\n- Viewer sample average: ${n(d.viewerAverage)}; peak: ${n(d.viewerPeak)}; samples: ${d.viewerSamples}\n- Busiest observed minute: ${d.peakMinute ? `${new Date(d.peakMinute.at).toISOString()}, ${d.peakMinute.messages} messages (partial final minute is not extrapolated)` : 'unavailable'}\n\n## Widget associations\n\n` +
    (d.impacts.length ? '| Widget | Triggers | Complete / partial windows | Before msg/min | After msg/min | Change | Overlapping |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n' + d.impacts.map(w => `| ${label(w.widgetName)} | ${w.triggers} | ${w.complete} / ${w.partial} | ${n(w.beforePerMinute)} | ${n(w.afterPerMinute)} | ${n(w.changePerMinute)} | ${w.overlapping} |`).join('\n') : 'No visible widget trigger was confirmed in this dataset.') +
    '\n\nEach complete window compares two minutes before and two minutes after a trigger. A zero baseline has no percentage lift. Partial or disconnected windows are excluded. Multiple widgets may respond to one event.\n\n## Limits\n\n' + view.warnings.map(w => `- ${w}`).join('\n') + '\n\n## Next stream\n\nTry one widget at a time, leave four minutes between trigger moments, and compare complete windows across similar streams. Review source/audio quality separately.\n'
}
export function safeAiReport(value: string): string { return value.replace(/<[^>]*>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '[link removed]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 16000) }
