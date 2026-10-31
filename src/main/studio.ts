import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type { StudioState, TwitchState, SubscriptionState } from '../shared/contracts'
import { appendEvent, count, normalizeEvent, record, text, type StreamEvent } from '../shared/events'
import { resolveTwitchClientId } from '../shared/config'
import type { SceneId } from '../shared/scenes'
import { simulatedEvent, type Simulation } from '../shared/simulator'
import { subscriptionSpecs } from '../shared/twitch'
import { Storage, type Preferences } from './storage'
import { OAuth, type TokenSet } from './twitch/oauth'
import { TwitchSession } from './twitch/session'
import { Helix } from './twitch/helix'
import { EventSub } from './twitch/eventsub'
import { TwitchError } from './twitch/http'

const offline = (): TwitchState => ({ clientId: '', phase: 'disconnected',
  message: 'Connect Twitch to bring your chat into the studio.', account: null, device: null,
  subscriptions: [], socket: 'offline', viewers: null, channelLive: false })

export class Studio {
  private state: StudioState = { revision: 0, twitch: offline(), events: [], activeScene: 'starting' }
  private preferences: Preferences = { clientId: '', activeScene: 'starting' }
  private readonly oauth = new OAuth()
  private controller = new AbortController()
  private session: TwitchSession | null = null
  private helix: Helix | null = null
  private events: EventSub | null = null
  private validationTimer: ReturnType<typeof setInterval> | null = null
  private viewerTimer: ReturnType<typeof setInterval> | null = null
  private maintenanceBusy = false
  private lastValidation = 0

  constructor(private readonly storage: Storage, private readonly publish: (state: StudioState) => void) {}
  snapshot(): StudioState { return this.state }
  private update(twitch: Partial<TwitchState> = {}): void {
    this.state = { ...this.state, revision: this.state.revision + 1, twitch: { ...this.state.twitch, ...twitch } }
    this.publish(this.state)
  }
  private push(event: StreamEvent): void {
    const events = appendEvent(this.state.events, event)
    if (events === this.state.events) return
    this.state = { ...this.state, events }
    this.update()
  }
  async initialize(): Promise<void> {
    const signal = this.controller.signal
    try {
      const preferences = await this.storage.preferences()
      if (signal.aborted) return
      this.preferences = preferences
      this.state.activeScene = this.preferences.activeScene
      const clientId = resolveTwitchClientId(this.preferences.clientId) || ''
      this.update({ clientId })
      const tokens = await this.storage.readTokens()
      if (!signal.aborted && tokens && tokens.clientId === clientId) await this.attach(tokens, signal)
    } catch (error: unknown) { if (!signal.aborted) this.fail(error) }
  }
  private fail(error: unknown): void {
    this.stop()
    this.update({ phase: 'error', socket: 'offline', device: null, message: error instanceof Error ? error.message : 'The Twitch connection needs attention. Try connecting again.' })
  }
  private stop(): void {
    this.controller.abort()
    this.events?.stop()
    this.events = null
    if (this.validationTimer) clearInterval(this.validationTimer)
    if (this.viewerTimer) clearInterval(this.viewerTimer)
    this.validationTimer = null
    this.viewerTimer = null
    this.session = null
    this.helix = null
  }
  dispose(): void { this.stop() }
  async saveClientId(value: string): Promise<void> {
    const clientId = resolveTwitchClientId(value) || ''
    if (clientId !== this.state.twitch.clientId) await this.disconnect()
    this.preferences = { ...this.preferences, clientId: value.trim() }
    await this.storage.savePreferences(this.preferences)
    this.update({ clientId, message: clientId ? 'Client ID saved. Connect Twitch when you are ready.' : 'Add your public Twitch Client ID to connect.' })
  }
  async connect(): Promise<void> {
    if (this.state.twitch.phase === 'waiting' || this.state.twitch.phase === 'requesting') return
    const clientId = this.state.twitch.clientId
    if (!clientId) throw new Error('Add your public Twitch Client ID in Settings, then click Connect Twitch.')
    await this.disconnect()
    this.controller = new AbortController()
    const signal = this.controller.signal
    this.update({ phase: 'requesting', message: 'Requesting your Twitch login code.' })
    try {
      const grant = await this.oauth.device(clientId, signal)
      if (signal.aborted) return
      this.update({ phase: 'waiting', device: grant.public, message: 'Enter this code on Twitch and approve the connection.' })
      this.oauth.poll(clientId, grant, signal).then(async tokens => {
        if (signal.aborted) return
        await this.storage.saveTokens(tokens, signal)
        if (!signal.aborted) await this.attach(tokens, signal)
      }).catch((error: unknown) => { if (!signal.aborted) this.fail(error) })
      try { await shell.openExternal(grant.public.verificationUri) } catch {
        if (!signal.aborted) this.update({ message: 'Your code is ready. Click Open Twitch in browser, or visit twitch.tv/activate yourself.' })
      }
    } catch (error: unknown) { if (!signal.aborted) { this.fail(error); throw error } }
  }
  async openLogin(): Promise<void> {
    const device = this.state.twitch.device
    if (!device || Date.now() >= device.expiresAt) throw new Error('Request a new Twitch login code before opening the browser.')
    await shell.openExternal(device.verificationUri)
  }
  async disconnect(): Promise<void> {
    let tokens = this.session?.current()
    this.stop()
    let readable = true
    if (!tokens) {
      try { tokens = await this.storage.readTokens() ?? undefined } catch { readable = false }
    }
    await this.storage.clearTokens()
    this.state = { ...this.state, events: this.state.events.filter(e => e.source !== 'twitch') }
    this.update({ ...offline(), clientId: this.state.twitch.clientId })
    if (tokens) {
      try { await this.oauth.revoke(tokens) } catch {
        this.update({ message: 'Local login removed. Twitch could not confirm revocation. Remove RapidCast in Twitch Connections to revoke access fully.' })
      }
    } else if (!readable) {
      this.update({ message: 'Local login removed. The saved token could not be unlocked. Remove RapidCast in Twitch Connections to revoke access fully.' })
    }
  }
  async retry(): Promise<void> {
    this.stop()
    this.controller = new AbortController()
    this.update({ phase: 'connecting', socket: 'connecting', device: null, message: 'Reconnecting your saved Twitch session.' })
    try {
      const tokens = await this.storage.readTokens()
      if (!tokens || tokens.clientId !== this.state.twitch.clientId) throw new Error('No saved login is available. Click Connect Twitch to sign in.')
      await this.attach(tokens, this.controller.signal)
    } catch (error: unknown) { this.fail(error); throw error }
  }
  private async attach(tokens: TokenSet, signal: AbortSignal): Promise<void> {
    this.update({ phase: 'connecting', device: null, subscriptions: [], message: 'Checking your account and connecting live events.' })
    const session = new TwitchSession(tokens, this.oauth, this.storage, signal)
    this.session = session
    const identity = await session.validate()
    this.lastValidation = Date.now()
    const helix = new Helix(session)
    const profile = await helix.call('users')
    if (signal.aborted) return
    const user = record(Array.isArray(profile.data) ? profile.data[0] : null)
    if (user.id !== identity.userId) throw new TwitchError(401)
    this.helix = helix
    this.update({ account: { id: identity.userId, login: identity.login, name: text(user.display_name, identity.login), broadcasterType: text(user.broadcaster_type) } })
    this.events = new EventSub({
      subscribe: async id => { await this.subscribe(helix, session, id, signal) },
      notification: (type, value, id, at) => {
        if (signal.aborted) return
        const event = normalizeEvent(type, value, id, at, identity.userId)
        if (event) {
          if (event.type === 'streamOnline' || event.type === 'streamOffline') this.update({ channelLive: event.type === 'streamOnline' })
          this.push(event)
        }
      },
      status: socket => {
        if (signal.aborted) return
        const chat = this.state.twitch.subscriptions.find(s => s.type === 'channel.chat.message')?.status === 'enabled'
        this.update({ socket, phase: socket === 'connected' ? chat ? 'connected' : 'error' : 'connecting',
          message: socket === 'reconnecting' ? 'Reconnecting Twitch events. Messages during a network outage may be missed.' :
            socket === 'connected' ? (chat ? 'Chat and live events are connected.' : 'Events connected, but chat needs attention. Check Settings.') : 'Connecting Twitch events.' })
      },
      revoked: (type, reason) => {
        if (signal.aborted) return
        const revoked: SubscriptionState = { type, status: 'revoked', detail: 'Twitch revoked this subscription. Reconnect your account.' }
        this.update({ subscriptions: [...this.state.twitch.subscriptions.filter(s => s.type !== type), revoked] })
        if (type === 'channel.chat.message') this.update({ phase: 'error', message: 'Twitch stopped chat events. Disconnect and reconnect your account to restore chat.' })
        if (reason === 'authorization_revoked' || reason === 'user_removed') {
          this.stop()
          this.update({ phase: 'error', account: null, socket: 'offline', message: 'Twitch authorization was revoked. Connect your account again.' })
          this.storage.clearTokens().catch(() => this.update({ message: 'Twitch authorization was revoked. Disconnect in Settings to clear the saved login.' }))
        }
      },
      problem: message => { if (!signal.aborted) this.update({ message }) }
    })
    this.events.start()
    this.validationTimer = setInterval(() => { void this.maintain(session, signal) }, 60000)
    this.viewerTimer = setInterval(() => { void this.viewers(helix, identity.userId, signal) }, 60000)
    void this.viewers(helix, identity.userId, signal)
  }
  private async subscribe(helix: Helix, session: TwitchSession, sessionId: string, signal: AbortSignal): Promise<void> {
    const account = this.state.twitch.account
    if (!account) return
    const scopes = session.current().scopes
    const states = await Promise.all(subscriptionSpecs(account.id).map(async (spec): Promise<SubscriptionState> => {
      if ((spec.monetized && !account.broadcasterType) || (spec.scope && !scopes.includes(spec.scope))) {
        return { type: spec.type, status: 'unavailable', detail: spec.monetized && !account.broadcasterType ? 'Requires Twitch Affiliate or Partner. Chat commands remain available.' : 'Missing permission. Disconnect and reconnect Twitch.' }
      }
      try {
        await helix.call('eventsub/subscriptions', 'POST', { type: spec.type, version: spec.version, condition: spec.condition, transport: { method: 'websocket', session_id: sessionId } })
        return { type: spec.type, status: 'enabled', detail: 'Receiving events' }
      } catch (error: unknown) {
        if (error instanceof TwitchError && error.status === 401 && !signal.aborted) this.fail(error)
        return { type: spec.type, status: 'error', detail: error instanceof Error ? error.message : 'Subscription failed. Reconnect Twitch.' }
      }
    }))
    if (!signal.aborted) this.update({ subscriptions: states.map(state => this.state.twitch.subscriptions.find(s => s.type === state.type && s.status === 'revoked') ?? state) })
    if (!signal.aborted && !states.some(state => state.status === 'enabled')) throw new Error('No Twitch event subscriptions could be created. Check Settings and try repairing the connection.')
  }
  private async maintain(session: TwitchSession, signal: AbortSignal): Promise<void> {
    if (this.maintenanceBusy || signal.aborted) return
    this.maintenanceBusy = true
    try {
      await session.token()
      if (Date.now() - this.lastValidation >= 3600000) {
        await session.validate()
        this.lastValidation = Date.now()
      }
    } catch (error: unknown) {
      if (!signal.aborted) {
        if (error instanceof TwitchError && error.status === 0) this.update({ message: 'Twitch validation is waiting for your connection. It will retry in one minute.' })
        else this.fail(error)
      }
    } finally { this.maintenanceBusy = false }
  }
  private async viewers(helix: Helix, userId: string, signal: AbortSignal): Promise<void> {
    try {
      const response = await helix.call(`streams?user_id=${encodeURIComponent(userId)}`)
      if (signal.aborted) return
      const streams = Array.isArray(response.data) ? response.data : []
      this.update({ channelLive: streams.length > 0, viewers: streams.length ? count(record(streams[0]).viewer_count) : 0 })
    } catch { if (!signal.aborted) this.update({ viewers: null }) }
  }
  async sendChat(message: string): Promise<void> {
    const account = this.state.twitch.account
    if (!this.helix || !account) throw new Error('Connect Twitch before sending a chat message.')
    if (!message.trim() || message.length > 500) throw new Error('Enter a chat message between 1 and 500 characters.')
    const response = await this.helix.call('chat/messages', 'POST', { broadcaster_id: account.id, sender_id: account.id, message: message.trim() })
    const result = record(Array.isArray(response.data) ? response.data[0] : null)
    if (result.is_sent !== true) throw new Error('Twitch did not send the message. Check channel moderation settings and try again.')
  }
  simulate(type: Simulation): void { this.push(simulatedEvent(type, `sim-${randomUUID()}`)) }
  clearSimulations(): void { this.state = { ...this.state, events: this.state.events.filter(e => e.source !== 'simulator') }; this.update() }
  async selectScene(activeScene: SceneId): Promise<void> {
    const preferences = { ...this.preferences, activeScene }
    await this.storage.savePreferences(preferences)
    this.preferences = preferences
    this.state = { ...this.state, activeScene }
    this.update()
  }
}
