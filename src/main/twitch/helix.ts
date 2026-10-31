import type { TwitchSession } from './session'
import { request, TwitchError, type Fetcher } from './http'

export class Helix {
  constructor(private readonly session: TwitchSession, private readonly fetcher: Fetcher = fetch) {}

  async call(path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tokens = await this.session.token(attempt === 1)
      try {
        return await request(`https://api.twitch.tv/helix/${path}`, {
          method, signal: this.session.signal,
          headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': tokens.clientId, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        }, this.fetcher)
      } catch (error: unknown) {
        if (!(error instanceof TwitchError) || error.status !== 401 || attempt === 1) throw error
      }
    }
    throw new TwitchError(401)
  }
}
