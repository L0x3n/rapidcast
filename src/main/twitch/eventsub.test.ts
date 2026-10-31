import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventSub, type SocketConnection } from './eventsub'

class FakeSocket implements SocketConnection {
  onMessage: (data: string) => void = () => undefined
  onClose: () => void = () => undefined
  onError: () => void = () => undefined
  close = vi.fn()
  message(handler: (data: string) => void): void { this.onMessage = handler }
  closed(handler: () => void): void { this.onClose = handler }
  failed(handler: () => void): void { this.onError = handler }
  emit(type: string, payload: unknown = {}, id = 'id'): void {
    this.onMessage(JSON.stringify({ metadata: { message_type: type, message_id: id, message_timestamp: '2026-10-31T20:00:00Z' }, payload }))
  }
  welcome(id = 'session'): void { this.emit('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } }) }
}
function setup() {
  const sockets: FakeSocket[] = []
  const factory = vi.fn((_url: string) => { const socket = new FakeSocket(); sockets.push(socket); return socket })
  const hooks = { subscribe: vi.fn().mockResolvedValue(undefined), notification: vi.fn(), status: vi.fn(), revoked: vi.fn(), problem: vi.fn() }
  const client = new EventSub(hooks, factory)
  client.start()
  return { sockets, factory, hooks, client }
}
describe('EventSub lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('subscribes immediately after welcome and delivers only one copy of a notification', async () => {
    const { sockets, hooks, client } = setup()
    const socket = sockets[0]!
    socket.welcome()
    expect(hooks.subscribe).toHaveBeenCalledWith('session')
    await Promise.resolve()
    const payload = { subscription: { type: 'channel.follow' }, event: { user_name: 'Linus' } }
    socket.emit('notification', payload)
    socket.emit('notification', payload)
    expect(hooks.notification).toHaveBeenCalledTimes(1)
    expect(hooks.status).toHaveBeenLastCalledWith('connected')
    client.stop()
  })
  it('retains the old socket until replacement welcome and preserves subscriptions', async () => {
    const { sockets, hooks, client, factory } = setup()
    const old = sockets[0]!
    old.welcome()
    await Promise.resolve()
    old.emit('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?opaque=one' } })
    expect(factory).toHaveBeenLastCalledWith('wss://eventsub.wss.twitch.tv/ws?opaque=one')
    expect(old.close).not.toHaveBeenCalled()
    sockets[1]!.welcome('replacement')
    await Promise.resolve()
    expect(old.close).toHaveBeenCalledOnce()
    expect(hooks.subscribe).toHaveBeenCalledOnce()
    client.stop()
  })
  it('reconnects and resubscribes after a silent keepalive timeout', async () => {
    const { sockets, hooks, client, factory } = setup()
    sockets[0]!.welcome()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(12000)
    expect(factory).toHaveBeenCalledTimes(2)
    sockets[1]!.welcome('new')
    await Promise.resolve()
    expect(hooks.subscribe).toHaveBeenCalledTimes(2)
    client.stop()
  })
  it('extends the watchdog after keepalive messages', async () => {
    const { sockets, client, factory } = setup()
    sockets[0]!.welcome()
    await vi.advanceTimersByTimeAsync(9000)
    sockets[0]!.emit('session_keepalive')
    await vi.advanceTimersByTimeAsync(9000)
    expect(factory).toHaveBeenCalledOnce()
    client.stop()
  })
  it('handles revocation and ignores malformed input', () => {
    const { sockets, hooks, client } = setup()
    sockets[0]!.welcome()
    sockets[0]!.onMessage('not-json')
    sockets[0]!.emit('revocation', { subscription: { type: 'channel.follow', status: 'authorization_revoked' } })
    expect(hooks.revoked).toHaveBeenCalledWith('channel.follow', 'authorization_revoked')
    expect(hooks.notification).not.toHaveBeenCalled()
    client.stop()
  })
  it('does not follow foreign reconnect hosts or reconnect after stop', async () => {
    const { sockets, client, factory } = setup()
    sockets[0]!.welcome()
    sockets[0]!.emit('session_reconnect', { session: { reconnect_url: 'wss://evil.example/' } })
    expect(factory).toHaveBeenCalledOnce()
    client.stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(factory).toHaveBeenCalledOnce()
  })
})
