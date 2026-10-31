import type { TokenSet, OAuth, TokenIdentity } from './oauth'
import { TwitchError } from './http'

export interface TokenStorage { saveTokens(tokens: TokenSet, signal?: AbortSignal): Promise<void> }
export class TwitchSession {
  private refreshing: Promise<TokenSet> | null = null
  constructor(private tokens: TokenSet, private readonly oauth: OAuth, private readonly storage: TokenStorage,
    readonly signal: AbortSignal) {}

  async token(force = false): Promise<TokenSet> {
    if (this.signal.aborted) throw new Error('The Twitch connection was closed. Connect again to continue.')
    if (!force && this.tokens.expiresAt > Date.now() + 60000) return this.tokens
    if (!this.refreshing) {
      this.refreshing = this.oauth.refresh(this.tokens, this.signal).then(async tokens => {
        if (this.signal.aborted) throw new TwitchError(0, 'cancelled')
        await this.storage.saveTokens(tokens, this.signal)
        this.tokens = tokens
        return tokens
      }).finally(() => { this.refreshing = null })
    }
    return this.refreshing
  }

  async validate(): Promise<TokenIdentity> {
    let tokens = await this.token()
    let identity: TokenIdentity
    try { identity = await this.oauth.validate(tokens, this.signal) }
    catch (error: unknown) {
      if (!(error instanceof TwitchError) || error.status !== 401) throw error
      tokens = await this.token(true)
      identity = await this.oauth.validate(tokens, this.signal)
    }
    if (this.tokens.accessToken === tokens.accessToken) {
      this.tokens = { ...tokens, scopes: identity.scopes, expiresAt: Date.now() + identity.expiresIn * 1000 }
    }
    return identity
  }

  current(): TokenSet { return this.tokens }
}
