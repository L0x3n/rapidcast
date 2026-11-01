import type { StreamEvent } from './events'
import type { SceneId } from './scenes'
import type { Simulation } from './simulator'
import type { EngineUiApi } from './engine-api'
import type { WidgetApi } from './widgets'
import type { AiApi } from './ai'
import type { SetupApi } from './setup'

export interface AppInfo {
  name: string
  version: string
  platform: string
  secureStorageAvailable: boolean
  twitchClientConfigured: boolean
}

export interface RapidCastApi extends EngineUiApi, WidgetApi, AiApi, SetupApi {
  getAppInfo(): Promise<AppInfo>
  getStudio(): Promise<StudioState>
  onStudio(listener: (state: StudioState) => void): () => void
  saveClientId(value: string): Promise<ActionResult>
  connectTwitch(): Promise<ActionResult>
  openTwitchLogin(): Promise<ActionResult>
  disconnectTwitch(): Promise<ActionResult>
  retryTwitch(): Promise<ActionResult>
  sendChat(message: string): Promise<ActionResult>
  simulate(type: Simulation): Promise<ActionResult>
  clearSimulations(): Promise<ActionResult>
  selectScene(id: SceneId): Promise<ActionResult>
}

export type ActionResult = { ok: true } | { ok: false; error: string }
export interface TwitchAccount { id: string; login: string; name: string; broadcasterType: string }
export interface DeviceLogin { userCode: string; verificationUri: string; expiresAt: number }
export interface SubscriptionState { type: string; status: 'enabled' | 'unavailable' | 'error' | 'revoked'; detail: string }
export interface TwitchState {
  clientId: string
  phase: 'disconnected' | 'requesting' | 'waiting' | 'connecting' | 'connected' | 'error'
  message: string
  account: TwitchAccount | null
  device: DeviceLogin | null
  subscriptions: SubscriptionState[]
  socket: 'offline' | 'connecting' | 'connected' | 'reconnecting'
  viewers: number | null
  channelLive: boolean
}
export interface StudioState { revision: number; twitch: TwitchState; events: StreamEvent[]; activeScene: SceneId }

export const IPC = {
  appInfo: 'rapidcast:app-info', studio: 'rapidcast:studio', update: 'rapidcast:studio-update',
  saveClient: 'rapidcast:save-client', connect: 'rapidcast:connect', openLogin: 'rapidcast:open-login',
  disconnect: 'rapidcast:disconnect', retry: 'rapidcast:retry', sendChat: 'rapidcast:send-chat',
  simulate: 'rapidcast:simulate', clearSimulations: 'rapidcast:clear-simulations', scene: 'rapidcast:scene'
} as const
