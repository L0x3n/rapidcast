import { setTimeout as delay } from 'node:timers/promises'
import { count, text } from '../../shared/events'
import { pollDecision, TWITCH_SCOPES } from '../../shared/twitch'
import type { DeviceLogin } from '../../shared/contracts'
import { formRequest, request, TwitchError, type Fetcher } from './http'

export interface TokenSet { clientId: string; accessToken: string; refreshToken: string; scopes: string[]; expiresAt: number }
export interface DeviceGrant { deviceCode: string; interval: number; public: DeviceLogin }
export interface TokenIdentity { userId: string; login: string; scopes: string[]; expiresIn: number }
type Wait = (milliseconds: number, signal: AbortSignal) => Promise<void>

function parseTokens(value: Record<string, unknown>, clientId: string): TokenSet {
  const accessToken = text(value.access_token)
  const refreshToken = text(value.refresh_token)
  if (!accessToken || !refreshToken || count(value.expires_in) < 1) throw new TwitchError(502)
  return { clientId, accessToken, refreshToken, expiresAt: Date.now() + count(value.expires_in) * 1000,
    scopes: Array.isArray(value.scope) ? value.scope.filter((scope): scope is string => typeof scope === 'string') : [] }
}

export class OAuth {
  constructor(private readonly fetcher: Fetcher = fetch,
    private readonly wait: Wait = (milliseconds, signal) => delay(milliseconds, undefined, { signal })) {}
  async device(clientId: string, signal: AbortSignal): Promise<DeviceGrant> {
    const value = await request('https://id.twitch.tv/oauth2/device', formRequest({ client_id: clientId, scopes: TWITCH_SCOPES.join(' ') }, signal), this.fetcher)
    const uri = new URL(text(value.verification_uri, 'https://www.twitch.tv/activate'))
    if (uri.protocol !== 'https:' || uri.hostname !== 'www.twitch.tv' || uri.pathname !== '/activate' || uri.username || uri.password || uri.port) throw new TwitchError(502)
    if (!text(value.device_code) || !text(value.user_code) || count(value.expires_in) < 1) throw new TwitchError(502)
    return { deviceCode: text(value.device_code), interval: Math.max(5, count(value.interval, 5)),
      public: { userCode: text(value.user_code, '', 32), verificationUri: uri.href, expiresAt: Date.now() + count(value.expires_in) * 1000 } }
  }

  async poll(clientId: string, grant: DeviceGrant, signal: AbortSignal): Promise<TokenSet> {
    let interval = grant.interval * 1000
    while (!signal.aborted && Date.now() < grant.public.expiresAt) {
      await this.wait(interval, signal)
      if (Date.now() >= grant.public.expiresAt) break
      try {
        const response = await request('https://id.twitch.tv/oauth2/token', formRequest({ client_id: clientId,
          device_code: grant.deviceCode, scopes: TWITCH_SCOPES.join(' '),
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, signal), this.fetcher)
        return parseTokens(response, clientId)
      } catch (error: unknown) {
        if (!(error instanceof TwitchError)) throw error
        const decision = pollDecision(error.code)
        if (decision === 'slower') interval += 5000
        else if (decision !== 'wait') throw error
      }
    }
    throw new Error('The Twitch login code expired. Click Connect Twitch to request a new code.')
  }

  async refresh(tokens: TokenSet, signal: AbortSignal): Promise<TokenSet> {
    const body = await request('https://id.twitch.tv/oauth2/token', formRequest({ client_id: tokens.clientId,
      refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }, signal), this.fetcher)
    return parseTokens(body, tokens.clientId)
  }

  async validate(tokens: TokenSet, signal: AbortSignal): Promise<TokenIdentity> {
    const result = await request('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${tokens.accessToken}` }, signal
    }, this.fetcher)
    if (result.client_id !== tokens.clientId || !text(result.user_id) || !text(result.login)) throw new TwitchError(401)
    return { userId: text(result.user_id), login: text(result.login), expiresIn: count(result.expires_in),
      scopes: Array.isArray(result.scopes) ? result.scopes.filter((s): s is string => typeof s === 'string') : [] }
  }
  async revoke(tokens: TokenSet): Promise<void> {
    await request('https://id.twitch.tv/oauth2/revoke', formRequest({ client_id: tokens.clientId, token: tokens.accessToken }), this.fetcher)
  }
}
