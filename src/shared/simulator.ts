import { normalizeEvent, type StreamEvent } from './events'

export const SIMULATIONS = ['chat', 'follow', 'sub', 'gift', 'resub', 'cheer', 'raid', 'redeem', 'streamOnline', 'streamOffline'] as const
export type Simulation = typeof SIMULATIONS[number]
export function isSimulation(value: unknown): value is Simulation { return SIMULATIONS.some(type => type === value) }

export function simulatedEvent(type: Simulation, id: string, now = Date.now()): StreamEvent {
  const person = { user_id: 'sim-viewer', user_login: 'pixelpilot', user_name: 'PixelPilot' }
  const fixtures: Record<Simulation, { type: string; event: Record<string, unknown> }> = {
    chat: { type: 'channel.chat.message', event: { chatter_user_id: 'sim-viewer', chatter_user_login: 'pixelpilot', chatter_user_name: 'PixelPilot', color: '#cbfa54', message: { text: 'Chat is ready. Let’s make something great! ✦', fragments: [] }, badges: [{ set_id: 'subscriber' }] } },
    follow: { type: 'channel.follow', event: person },
    sub: { type: 'channel.subscribe', event: { ...person, tier: '1000', is_gift: false } },
    gift: { type: 'channel.subscription.gift', event: { ...person, tier: '1000', total: 5 } },
    resub: { type: 'channel.subscription.message', event: { ...person, tier: '2000', cumulative_months: 12 } },
    cheer: { type: 'channel.cheer', event: { ...person, bits: 500, message: 'For the next great idea!' } },
    raid: { type: 'channel.raid', event: { from_broadcaster_user_id: 'sim-raider', from_broadcaster_user_login: 'neoncrew', from_broadcaster_user_name: 'NeonCrew', viewers: 42 } },
    redeem: { type: 'channel.channel_points_custom_reward_redemption.add', event: { ...person, reward: { title: 'Suggest a widget' }, user_input: 'A neon confetti storm when chat gets loud' } },
    streamOnline: { type: 'stream.online', event: {} },
    streamOffline: { type: 'stream.offline', event: {} }
  }
  const fixture = fixtures[type]
  const event = normalizeEvent(fixture.type, fixture.event, id, new Date(now).toISOString(), '', now, 'simulator')
  if (!event) throw new Error('This simulator event could not be created. Try another event.')
  return event
}
