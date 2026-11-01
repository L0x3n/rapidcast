import { afterEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './studio'
import { Storage } from './storage'
import { OAuth, type TokenSet } from './twitch/oauth'
import { TWITCH_SCOPES } from '../shared/twitch'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn().mockResolvedValue(undefined) }, safeStorage: {} }))
class FakeWebSocket {
  static sockets: FakeWebSocket[] = []
  private listeners: Record<string, ((event: { data: string }) => void)[]> = {}
  close = vi.fn()
  constructor() { FakeWebSocket.sockets.push(this) }
  addEventListener(name: string, callback: (event: { data: string }) => void): void {
    const listeners = this.listeners[name] ?? []
    listeners.push(callback)
    this.listeners[name] = listeners
  }
  emit(type: string, payload: unknown, id = 'delivery'): void {
    for (const callback of this.listeners.message ?? []) callback({ data: JSON.stringify({
      metadata: { message_type: type, message_id: id, message_timestamp: new Date().toISOString() }, payload
    }) })
  }
}
const tokens: TokenSet = { clientId: 'public123', accessToken: 'fake-access-private', refreshToken: 'fake-refresh-private', expiresAt: Date.now() + 3600000, scopes: [...TWITCH_SCOPES] }
const running: Studio[] = []

function setup(monetized = true) {
  FakeWebSocket.sockets = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input)
    let value: unknown
    if (url.endsWith('/device')) value = { device_code: 'private-device', user_code: 'ABCD', interval: 5, expires_in: 60, verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD' }
    else if (url.endsWith('/validate')) value = { client_id: 'public123', user_id: 'me', login: 'linus', expires_in: 3600, scopes: TWITCH_SCOPES }
    else if (url.endsWith('/users')) value = { data: [{ id: 'me', display_name: 'Linus', broadcaster_type: monetized ? 'affiliate' : '' }] }
    else if (url.includes('/streams?')) value = { data: [] }
    else if (url.includes('/streams/key?')) value = { data: [{ stream_key: 'fake_private_stream_key' }] }
    else if (url === 'https://ingest.twitch.tv/ingests') value = { ingests: [{ default: false, name: 'Default', url_template_secure: 'rtmps://ingest.global-contribute.live-video.net/app/{stream_key}' }] }
    else if (url.endsWith('/eventsub/subscriptions')) value = { data: [{ status: 'enabled' }] }
    else if (url.includes('/channel_points/custom_rewards?')) value = { data: init?.method === 'GET' ? [] : [{ id: 'app-owned-reward', title: 'Suggest a widget' }] }
    else if (url.endsWith('/revoke')) return new Response('')
    else throw new Error('Unexpected endpoint')
    return new Response(JSON.stringify(value))
  })
  vi.stubGlobal('fetch', fetcher)
  vi.spyOn(OAuth.prototype, 'poll').mockResolvedValue(tokens)
  const storage = new Storage('unused-in-test')
  vi.spyOn(storage, 'preferences').mockResolvedValue({ clientId: 'public123', activeScene: 'brb' })
  vi.spyOn(storage, 'readTokens').mockResolvedValue(null)
  vi.spyOn(storage, 'saveTokens').mockResolvedValue(undefined)
  vi.spyOn(storage, 'clearTokens').mockResolvedValue(undefined)
  vi.spyOn(storage, 'savePreferences').mockResolvedValue(undefined)
  const studio = new Studio(storage, vi.fn())
  running.push(studio)
  return { studio, storage, fetcher }
}

afterEach(() => {
  for (const studio of running) studio.dispose()
  running.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Twitch studio integration with a fake transport', () => {
  it('connects, subscribes, delivers chat, separates simulator events and logs out without leaking tokens', async () => {
    const { studio, fetcher, storage } = setup()
    await studio.initialize()
    expect(studio.snapshot().activeScene).toBe('brb')
    await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    const socket = FakeWebSocket.sockets[0]!
    socket.emit('session_welcome', { session: { id: 'session', keepalive_timeout_seconds: 10 } })
    await vi.waitFor(() => expect(studio.snapshot().twitch.phase).toBe('connected'))
    expect(studio.snapshot().twitch.subscriptions.filter(s => s.status === 'enabled')).toHaveLength(10)
    socket.emit('notification', { subscription: { type: 'channel.chat.message' }, event: {
      chatter_user_id: 'me', chatter_user_login: 'linus', chatter_user_name: 'Linus', message: { text: 'Hello from my channel', fragments: [] }
    } })
    expect(studio.snapshot().events[0]).toMatchObject({ type: 'chat', own: true, source: 'twitch', text: 'Hello from my channel' })
    studio.simulate('follow')
    expect(JSON.stringify(studio.snapshot())).not.toMatch(/fake-access-private|fake-refresh-private|private-device/)
    expect(storage.saveTokens).toHaveBeenCalled()
    await studio.disconnect()
    expect(studio.snapshot().twitch.account).toBeNull()
    expect(studio.snapshot().events).toHaveLength(1)
    expect(studio.snapshot().events[0]?.source).toBe('simulator')
    expect(socket.close).toHaveBeenCalled()
    expect(fetcher.mock.calls.some(call => String(call[0]).endsWith('/revoke'))).toBe(true)
  })
  it('keeps standard channels connected while marking monetized event types unavailable', async () => {
    const { studio } = setup(false)
    await studio.initialize()
    await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    FakeWebSocket.sockets[0]!.emit('session_welcome', { session: { id: 'session', keepalive_timeout_seconds: 10 } })
    await vi.waitFor(() => expect(studio.snapshot().twitch.phase).toBe('connected'))
    expect(studio.snapshot().twitch.subscriptions.filter(s => s.status === 'enabled')).toHaveLength(5)
    expect(studio.snapshot().twitch.subscriptions.filter(s => s.status === 'unavailable')).toHaveLength(5)
  })
  it('resolves a host-only default ingest and adds bandwidthtest only for private tests', async () => {
    const { studio } = setup()
    await studio.initialize(); await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    const test = await studio.outputTarget(true)
    const live = await studio.outputTarget(false)
    expect(test).toBe('rtmps://ingest.global-contribute.live-video.net/app/fake_private_stream_key?bandwidthtest=true')
    expect(live).not.toContain('bandwidthtest')
    expect(JSON.stringify(studio.snapshot())).not.toContain('fake_private_stream_key')
  })
  it('ends the session and clears stored credentials when authorization is revoked', async () => {
    const { studio, storage } = setup()
    await studio.initialize()
    await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    const socket = FakeWebSocket.sockets[0]!
    socket.emit('session_welcome', { session: { id: 'session', keepalive_timeout_seconds: 10 } })
    await vi.waitFor(() => expect(studio.snapshot().twitch.phase).toBe('connected'))
    vi.mocked(storage.clearTokens).mockClear()
    socket.emit('revocation', { subscription: { type: 'channel.chat.message', status: 'authorization_revoked' } })
    expect(studio.snapshot().twitch.phase).toBe('error')
    expect(studio.snapshot().twitch.account).toBeNull()
    expect(storage.clearTokens).toHaveBeenCalled()
    expect(socket.close).toHaveBeenCalled()
  })
  it('allows disconnect to clear credentials even when the encrypted login cannot be unlocked', async () => {
    const { studio, storage } = setup()
    await studio.initialize()
    vi.mocked(storage.readTokens).mockRejectedValue(new Error('Cannot decrypt'))
    await studio.disconnect()
    expect(storage.clearTokens).toHaveBeenCalled()
    expect(studio.snapshot().twitch.phase).toBe('disconnected')
    expect(studio.snapshot().twitch.message).toContain('Twitch Connections')
  })
  it('shows an error rather than a connected state when Repair has no saved login', async () => {
    const { studio } = setup()
    await studio.initialize()
    await expect(studio.retry()).rejects.toThrow('No saved login')
    expect(studio.snapshot().twitch.phase).toBe('error')
    expect(studio.snapshot().twitch.socket).toBe('offline')
  })
  it('creates an input-required app-owned reward for an Affiliate channel', async () => {
    const { studio, fetcher } = setup()
    await studio.initialize(); await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    expect(await studio.suggestionReward(500)).toEqual({ channelId: 'me', id: 'app-owned-reward' })
    const call = fetcher.mock.calls.find(([url, init]) => String(url).includes('/channel_points/custom_rewards?') && init?.method === 'POST')
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ title: 'Suggest a widget', cost: 500, is_user_input_required: true, is_global_cooldown_enabled: true })
    expect(JSON.stringify(studio.snapshot())).not.toContain('fake-access-private')
  })
  it('keeps standard channels on the chat-command fallback without reward mutations', async () => {
    const { studio, fetcher } = setup(false)
    await studio.initialize(); await studio.connect()
    await vi.waitFor(() => expect(FakeWebSocket.sockets).toHaveLength(1))
    await expect(studio.suggestionReward(500)).rejects.toThrow('!widget')
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/channel_points/custom_rewards'))).toBe(false)
  })
})
