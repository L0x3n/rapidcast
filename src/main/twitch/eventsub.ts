import { record, text, count } from '../../shared/events'
import { trustedReconnectUrl } from '../../shared/twitch'

export interface SocketConnection {
  message(handler: (data: string) => void): void
  closed(handler: () => void): void
  failed(handler: () => void): void
  close(): void
}
export type SocketFactory = (url: string) => SocketConnection
export const twitchSocket: SocketFactory = url => {
  const socket = new WebSocket(url)
  return {
    message: handler => socket.addEventListener('message', event => { if (typeof event.data === 'string') handler(event.data) }),
    closed: handler => socket.addEventListener('close', handler),
    failed: handler => socket.addEventListener('error', handler),
    close: () => socket.close()
  }
}

interface Hooks {
  subscribe(sessionId: string): Promise<void>
  notification(type: string, value: unknown, id: string, at: string): void
  status(status: 'connecting' | 'connected' | 'reconnecting'): void
  revoked(type: string, reason: string): void
  problem(message: string): void
}
interface Link { socket: SocketConnection; active: boolean; welcome: boolean; timeout: ReturnType<typeof setTimeout> | null; keepalive: number }

export class EventSub {
  private links = new Set<Link>()
  private current: Link | null = null
  private replacement: Link | null = null
  private stopped = true
  private retries = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private seen = new Set<string>()

  constructor(private readonly hooks: Hooks, private readonly factory: SocketFactory = twitchSocket) {}
  start(): void {
    this.stop()
    this.stopped = false
    this.retries = 0
    this.hooks.status('connecting')
    this.open('wss://eventsub.wss.twitch.tv/ws', false)
  }
  stop(): void {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    for (const link of this.links) this.close(link)
    this.current = null
    this.replacement = null
  }
  private close(link: Link): void {
    link.active = false
    if (link.timeout) clearTimeout(link.timeout)
    this.links.delete(link)
    link.socket.close()
  }
  private arm(link: Link, duration: number): void {
    if (link.timeout) clearTimeout(link.timeout)
    link.timeout = setTimeout(() => this.lost(link), duration)
  }
  private lost(link: Link): void {
    if (!link.active || this.stopped) return
    this.close(link)
    if (link === this.replacement) {
      this.replacement = null
      if (this.current) this.close(this.current)
      this.current = null
    } else if (link === this.current) {
      this.current = null
      if (this.replacement) return
    }
    this.retry()
  }
  private retry(): void {
    if (this.stopped || this.retryTimer) return
    this.hooks.status('reconnecting')
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.open('wss://eventsub.wss.twitch.tv/ws', false)
    }, Math.min(30000, 1000 * 2 ** this.retries++))
  }
  private open(url: string, transfer: boolean): void {
    if (this.stopped) return
    let socket: SocketConnection
    try { socket = this.factory(url) } catch { this.retry(); return }
    const link: Link = { socket, active: true, welcome: false, timeout: null, keepalive: 10000 }
    this.links.add(link)
    if (transfer) this.replacement = link
    else this.current = link
    this.arm(link, 10000)
    socket.message(data => {
      this.handle(link, data, transfer).catch(() => {
        if (link.active && !this.stopped) {
          this.hooks.problem('Twitch events could not be connected. Check the subscription details or reconnect your account.')
          this.lost(link)
        }
      })
    })
    socket.closed(() => this.lost(link))
    socket.failed(() => this.lost(link))
  }
  private async handle(link: Link, data: string, transfer: boolean): Promise<void> {
    if (!link.active || this.stopped || data.length > 1_000_000) return
    let message: Record<string, unknown>
    try { message = record(JSON.parse(data)) } catch { return }
    const metadata = record(message.metadata)
    const payload = record(message.payload)
    const type = text(metadata.message_type)
    if (type === 'session_welcome') {
      if (link.welcome) return
      const session = record(payload.session)
      const id = text(session.id)
      if (!id) { this.lost(link); return }
      link.welcome = true
      link.keepalive = Math.max(10000, count(session.keepalive_timeout_seconds, 10) * 1000)
      this.arm(link, link.keepalive + 1000)
      if (transfer) {
        const old = this.current
        this.current = link
        this.replacement = null
        if (old && old !== link) this.close(old)
      } else {
        // Start Helix subscriptions immediately after welcome, without a token-validation round trip.
        await this.hooks.subscribe(id)
      }
      if (!link.active || this.stopped) return
      this.retries = 0
      this.hooks.status('connected')
      return
    }
    if (!link.welcome) return
    if (type === 'session_keepalive' || type === 'notification' || type === 'session_reconnect') this.arm(link, link.keepalive + 1000)
    if (type === 'session_reconnect') {
      if (this.replacement) return
      const url = trustedReconnectUrl(record(payload.session).reconnect_url)
      if (!url) { this.lost(link); return }
      this.hooks.status('reconnecting')
      this.open(url, true)
    } else if (type === 'notification') {
      const id = text(metadata.message_id)
      if (!id || this.seen.has(id)) return
      this.seen.add(id)
      if (this.seen.size > 1000) { const first = this.seen.values().next().value; if (first) this.seen.delete(first) }
      this.hooks.notification(text(record(payload.subscription).type, text(metadata.subscription_type)), payload.event,
        id, text(metadata.message_timestamp))
    } else if (type === 'revocation') {
      const subscription = record(payload.subscription)
      this.hooks.revoked(text(subscription.type), text(subscription.status))
    }
  }
}
