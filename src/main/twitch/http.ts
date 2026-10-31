import { record, text } from '../../shared/events'

const oauthCodes = new Set(['authorization_pending', 'slow_down', 'access_denied', 'expired_token',
  'invalid_device_code', 'invalid_refresh_token', 'invalid_client', 'invalid_client_id'])
export class TwitchError extends Error {
  constructor(readonly status: number, readonly code = 'request_failed') {
    super(code === 'access_denied' ? 'Twitch authorization was declined. Click Connect Twitch to try again.' :
      code === 'expired_token' || code === 'invalid_device_code' ? 'This Twitch login code has expired. Cancel login and request a new code.' :
      code === 'invalid_refresh_token' ? 'Your saved Twitch login expired. Disconnect and sign in again.' :
      code === 'invalid_client' || code === 'invalid_client_id' ? 'Twitch did not recognize the Client ID. Check the public Client ID in Settings.' :
      status === 401 ? 'Your Twitch login needs attention. Disconnect and sign in again.' :
      status === 403 ? 'Twitch did not allow this action. Check your account permissions and reconnect.' :
      status === 429 ? 'Twitch is receiving too many requests. Wait a moment and try again.' :
      'Twitch could not finish this request. Check your connection and Client ID, then try again.')
  }
}

export type Fetcher = typeof fetch
export async function request(url: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<Record<string, unknown>> {
  let response: Response
  try {
    const timeout = AbortSignal.timeout(8000)
    response = await fetcher(url, { ...init, redirect: 'error',
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
  } catch { throw new TwitchError(0, init.signal?.aborted ? 'cancelled' : 'network') }
  let body: Record<string, unknown> = {}
  try {
    const content = await response.text()
    body = content.trim() ? record(JSON.parse(content)) : {}
  } catch {
    if (response.ok && response.status !== 204) throw new TwitchError(502)
  }
  if (!response.ok) {
    const candidates = [body.error, body.message].map(value => text(value).toLowerCase().replaceAll(' ', '_'))
    throw new TwitchError(response.status, candidates.find(code => oauthCodes.has(code)) || 'request_failed')
  }
  return body
}

export function formRequest(body: Record<string, string>, signal?: AbortSignal): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), ...(signal ? { signal } : {}) }
}
