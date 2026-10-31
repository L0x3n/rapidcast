export const TWITCH_SCOPES = [
  'user:read:chat', 'user:write:chat', 'moderator:read:followers', 'channel:read:subscriptions',
  'bits:read', 'channel:read:redemptions', 'channel:manage:redemptions',
  'channel:read:stream_key', 'channel:manage:broadcast'
] as const

export interface SubscriptionSpec { type: string; version: string; condition: Record<string, string>; scope: string | null; monetized: boolean }
export function subscriptionSpecs(userId: string): SubscriptionSpec[] {
  const broadcaster = { broadcaster_user_id: userId }
  return [
    { type: 'channel.chat.message', version: '1', condition: { ...broadcaster, user_id: userId }, scope: 'user:read:chat', monetized: false },
    { type: 'channel.follow', version: '2', condition: { ...broadcaster, moderator_user_id: userId }, scope: 'moderator:read:followers', monetized: false },
    ...['channel.subscribe', 'channel.subscription.gift', 'channel.subscription.message'].map(type => ({ type, version: '1', condition: broadcaster, scope: 'channel:read:subscriptions', monetized: true })),
    { type: 'channel.cheer', version: '1', condition: broadcaster, scope: 'bits:read', monetized: true },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: userId }, scope: null, monetized: false },
    { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: broadcaster, scope: 'channel:read:redemptions', monetized: true },
    ...['stream.online', 'stream.offline'].map(type => ({ type, version: '1', condition: broadcaster, scope: null, monetized: false }))
  ]
}

export function trustedReconnectUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'wss:' && url.hostname === 'eventsub.wss.twitch.tv' && !url.port &&
      !url.username && !url.password ? value : null
  } catch { return null }
}

export function pollDecision(code: string): 'wait' | 'slower' | 'stop' {
  if (code === 'authorization_pending') return 'wait'
  if (code === 'slow_down') return 'slower'
  return 'stop'
}
