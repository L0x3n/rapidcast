export interface StreamUser { id: string; login: string; name: string }
export interface EmoteFragment { id: string; text: string }
export type EventType = 'chat' | 'follow' | 'sub' | 'cheer' | 'raid' | 'redeem' | 'streamOnline' | 'streamOffline'
export type EventSource = 'twitch' | 'simulator'
interface EventBase { id: string; at: string; receivedAt: number; source: EventSource }
export type StreamEvent = EventBase & (
  | { type: 'chat'; user: StreamUser; color: string; text: string; emotes: EmoteFragment[]; badges: string[]; own: boolean }
  | { type: 'follow'; user: StreamUser }
  | { type: 'sub'; user: StreamUser; tier: string; months: number; gifted: boolean; count: number; kind: 'new' | 'gift' | 'resub' }
  | { type: 'cheer'; user: StreamUser; bits: number; text: string }
  | { type: 'raid'; from: StreamUser; viewers: number }
  | { type: 'redeem'; user: StreamUser; reward: string; input: string }
  | { type: 'streamOnline' | 'streamOffline' }
)

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function text(value: unknown, fallback = '', max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback
}
export function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}
function user(event: Record<string, unknown>, prefix = 'user'): StreamUser {
  return { id: text(event[`${prefix}_id`]), login: text(event[`${prefix}_login`]), name: text(event[`${prefix}_name`], 'Anonymous', 100) }
}

export function normalizeEvent(type: string, value: unknown, id: string, at: string, ownId: string,
  receivedAt = Date.now(), source: EventSource = 'twitch'): StreamEvent | null {
  if (!id || !Number.isFinite(Date.parse(at))) return null
  const event = record(value)
  const base: EventBase = { id: text(event.message_id) || id, at, receivedAt, source }
  switch (type) {
    case 'channel.chat.message': {
      const message = record(event.message)
      if (typeof message.text !== 'string' || !event.chatter_user_id) return null
      const fragments = Array.isArray(message.fragments) ? message.fragments.slice(0, 100) : []
      const badges = Array.isArray(event.badges) ? event.badges.slice(0, 30) : []
      return { ...base, type: 'chat', user: user(event, 'chatter_user'), text: text(message.text),
        color: /^#[0-9a-f]{6}$/i.test(text(event.color)) ? text(event.color) : '#cbfa54',
        emotes: fragments.filter(f => record(f).type === 'emote').map(f => ({ id: text(record(record(f).emote).id), text: text(record(f).text) })),
        badges: badges.map(b => text(record(b).set_id)).filter(Boolean), own: event.chatter_user_id === ownId }
    }
    case 'channel.follow': return { ...base, type: 'follow', user: user(event) }
    case 'channel.subscribe':
    case 'channel.subscription.gift':
    case 'channel.subscription.message':
      return { ...base, type: 'sub', user: user(event), tier: text(event.tier, '1000'),
        months: count(event.cumulative_months, 1), gifted: event.is_gift === true || type.endsWith('.gift'),
        count: count(event.total, 1), kind: type.endsWith('.gift') ? 'gift' : type.endsWith('.message') ? 'resub' : 'new' }
    case 'channel.cheer': return { ...base, type: 'cheer', user: user(event), bits: count(event.bits), text: text(event.message) }
    case 'channel.raid': return { ...base, type: 'raid', from: user(event, 'from_broadcaster_user'), viewers: count(event.viewers) }
    case 'channel.channel_points_custom_reward_redemption.add':
      return { ...base, type: 'redeem', user: user(event), reward: text(record(event.reward).title), input: text(event.user_input) }
    case 'stream.online': return { ...base, type: 'streamOnline' }
    case 'stream.offline': return { ...base, type: 'streamOffline' }
    default: return null
  }
}

export function describeEvent(event: StreamEvent): string {
  switch (event.type) {
    case 'chat': return `${event.user.name}: ${event.text}`
    case 'follow': return `${event.user.name} followed`
    case 'sub': return event.kind === 'gift' ? `${event.user.name} gifted ${event.count} subs` : `${event.user.name} subscribed · ${event.months} month${event.months === 1 ? '' : 's'}`
    case 'cheer': return `${event.user.name} cheered ${event.bits} bits`
    case 'raid': return `${event.from.name} raided with ${event.viewers} viewers`
    case 'redeem': return `${event.user.name} redeemed ${event.reward}`
    case 'streamOnline': return 'Your channel went live'
    case 'streamOffline': return 'Your channel went offline'
  }
}

export function appendEvent(events: StreamEvent[], event: StreamEvent): StreamEvent[] {
  return events.some(item => item.id === event.id && item.source === event.source) ? events : [...events, event].slice(-200)
}
