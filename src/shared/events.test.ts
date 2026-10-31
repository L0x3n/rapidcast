import { describe, expect, it } from 'vitest'
import { appendEvent, normalizeEvent } from './events'
import { simulatedEvent, SIMULATIONS } from './simulator'
import { isSceneId, SCENES } from './scenes'
import { subscriptionSpecs, trustedReconnectUrl, TWITCH_SCOPES } from './twitch'

const at = '2026-10-31T20:00:00.000Z'
describe('Twitch event normalization', () => {
  it.each(SIMULATIONS)('runs %s through the production normalizer with a simulator source', type => {
    const event = simulatedEvent(type, 'test-id', Date.parse(at))
    expect(event.id).toBe('test-id')
    expect(event.source).toBe('simulator')
    expect(event.at).toBe(at)
  })
  it('preserves chat text, emotes, badges and own-account identity', () => {
    const event = normalizeEvent('channel.chat.message', {
      chatter_user_id: 'me', chatter_user_login: 'linus', chatter_user_name: 'Linus', color: '#AABBCC',
      message_id: 'chat-id', message: { text: '!widget a goal bar Kappa', fragments: [{ type: 'emote', text: 'Kappa', emote: { id: '25' } }] },
      badges: [{ set_id: 'broadcaster', id: '1' }]
    }, 'delivery-id', at, 'me', 10)
    expect(event).toMatchObject({ id: 'chat-id', type: 'chat', own: true, text: '!widget a goal bar Kappa',
      user: { id: 'me', name: 'Linus' }, emotes: [{ id: '25', text: 'Kappa' }], badges: ['broadcaster'], receivedAt: 10 })
  })
  it('uses a safe color and bounds chat text and fragments', () => {
    const event = normalizeEvent('channel.chat.message', { chatter_user_id: 'a', color: 'url(evil)',
      message: { text: 'a'.repeat(3000), fragments: Array(120).fill({ type: 'emote', emote: { id: 'x' }, text: 'x' }) } }, 'x', at, 'me')
    if (event?.type !== 'chat') throw new Error('Expected chat')
    expect(event.color).toBe('#cbfa54')
    expect(event.text.length).toBe(2000)
    expect(event.emotes.length).toBe(100)
    expect(event.own).toBe(false)
  })
  it('preserves gift totals and resub months without conflating their kinds', () => {
    expect(simulatedEvent('gift', 'a')).toMatchObject({ type: 'sub', count: 5, gifted: true, kind: 'gift' })
    expect(simulatedEvent('resub', 'b')).toMatchObject({ type: 'sub', months: 12, kind: 'resub', tier: '2000' })
  })
  it('normalizes anonymous cheers and invalid counts safely', () => {
    expect(normalizeEvent('channel.cheer', { user_name: null, bits: -2 }, 'x', at, 'me')).toMatchObject({ user: { name: 'Anonymous' }, bits: 0 })
    expect(normalizeEvent('channel.raid', { viewers: Number.NaN }, 'x', at, 'me')).toMatchObject({ viewers: 0 })
  })
  it('rejects unknown types, malformed chat, missing IDs and timestamps', () => {
    expect(normalizeEvent('evil', {}, 'a', at, '')).toBeNull()
    expect(normalizeEvent('channel.chat.message', {}, 'a', at, '')).toBeNull()
    expect(normalizeEvent('channel.follow', {}, '', at, '')).toBeNull()
    expect(normalizeEvent('channel.follow', {}, 'a', 'not-date', '')).toBeNull()
  })
  it('deduplicates by source and event ID and bounds the buffer to 200', () => {
    const event = simulatedEvent('follow', 'same')
    expect(appendEvent([event], event)).toEqual([event])
    expect(appendEvent([event], { ...event, source: 'twitch' })).toHaveLength(2)
    const events = Array.from({ length: 200 }, (_, index) => simulatedEvent('follow', String(index)))
    const next = appendEvent(events, event)
    expect(next).toHaveLength(200)
    expect(next[0]?.id).toBe('1')
  })
})
describe('Twitch subscriptions and scenes', () => {
  it('defines all ten event types with correct chat/follow/raid conditions', () => {
    const specs = subscriptionSpecs('me')
    expect(specs).toHaveLength(10)
    expect(specs.find(s => s.type === 'channel.follow')).toMatchObject({ version: '2', condition: { broadcaster_user_id: 'me', moderator_user_id: 'me' } })
    expect(specs.find(s => s.type === 'channel.chat.message')?.condition).toEqual({ broadcaster_user_id: 'me', user_id: 'me' })
    expect(specs.find(s => s.type === 'channel.raid')?.condition).toEqual({ to_broadcaster_user_id: 'me' })
    expect(specs.every(s => !s.scope || TWITCH_SCOPES.some(scope => scope === s.scope))).toBe(true)
  })
  it.each(['wss://evil.example/ws', 'ws://eventsub.wss.twitch.tv/ws', 'wss://user@eventsub.wss.twitch.tv/ws', 'wss://eventsub.wss.twitch.tv:444/ws', 'invalid'])(
    'rejects untrusted reconnect URLs: %s', url => expect(trustedReconnectUrl(url)).toBeNull())
  it('retains a trusted reconnect URL exactly', () => {
    const url = 'wss://eventsub.wss.twitch.tv/ws?session=opaque%2Bvalue'
    expect(trustedReconnectUrl(url)).toBe(url)
  })
  it('has four unique scene IDs and rejects unrecognized choices', () => {
    expect(new Set(SCENES.map(scene => scene.id)).size).toBe(4)
    expect(isSceneId('brb')).toBe(true)
    expect(isSceneId('../bad')).toBe(false)
  })
})
