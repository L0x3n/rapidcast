import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuth, type DeviceGrant, type TokenSet } from './oauth'
import { TwitchError } from './http'
import { TWITCH_SCOPES } from '../../shared/twitch'

function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status }) }
const tokens: TokenSet = { clientId: 'public123', accessToken: 'fake-old', refreshToken: 'fake-refresh', scopes: [], expiresAt: 0 }
describe('public-client device OAuth', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000) })
  afterEach(() => vi.useRealTimers())
  it('sends scopes plural, no secret, and exposes only public activation details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ device_code: 'private-device', user_code: 'ABCD', interval: 5, expires_in: 60, verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD' }))
    const grant = await new OAuth(fetcher).device('public123', new AbortController().signal)
    const body = new URLSearchParams(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.get('scopes')).toBe(TWITCH_SCOPES.join(' '))
    expect(body.has('client_secret')).toBe(false)
    expect(grant.public).not.toHaveProperty('deviceCode')
    expect(grant.public.expiresAt).toBe(160000)
  })
  it('rejects an activation URL outside Twitch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ verification_uri: 'https://evil.example/activate', device_code: 'x', user_code: 'x', expires_in: 100 }))
    await expect(new OAuth(fetcher).device('public123', new AbortController().signal)).rejects.toBeInstanceOf(TwitchError)
  })
  it('waits for pending authorization, then obtains a token using the device grant', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ message: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(json({ access_token: 'fake-new', refresh_token: 'fake-rotated', expires_in: 3600, scope: ['user:read:chat'] }))
    const grant: DeviceGrant = { deviceCode: 'private-device', interval: 5, public: { userCode: 'ABCD', verificationUri: 'https://www.twitch.tv/activate', expiresAt: 160000 } }
    const wait = vi.fn().mockResolvedValue(undefined)
    const promise = new OAuth(fetcher, wait).poll('public123', grant, new AbortController().signal)
    const result = await promise
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(wait.mock.calls.map(call => call[0])).toEqual([5000, 5000])
    expect(result.refreshToken).toBe('fake-rotated')
    const body = new URLSearchParams(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    expect(body.get('scopes')).toBe(TWITCH_SCOPES.join(' '))
    expect(body.get('device_code')).toBe('private-device')
  })
  it('adds five seconds to the polling interval after slow_down', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ message: 'slow_down' }, 400))
      .mockResolvedValueOnce(json({ access_token: 'fake-new', refresh_token: 'fake-rotated', expires_in: 3600 }))
    const wait = vi.fn().mockResolvedValue(undefined)
    const grant: DeviceGrant = { deviceCode: 'private', interval: 5, public: { userCode: 'ABCD', verificationUri: 'https://www.twitch.tv/activate', expiresAt: 200000 } }
    await new OAuth(fetcher, wait).poll('id', grant, new AbortController().signal)
    expect(wait.mock.calls.map(call => call[0])).toEqual([5000, 10000])
  })
  it('does not poll if the code expires during the wait', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const wait = vi.fn().mockImplementation(async () => { vi.setSystemTime(200000) })
    const grant: DeviceGrant = { deviceCode: 'private', interval: 5, public: { userCode: 'ABCD', verificationUri: 'https://www.twitch.tv/activate', expiresAt: 101000 } }
    await expect(new OAuth(fetcher, wait).poll('id', grant, new AbortController().signal)).rejects.toThrow('expired')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('stops polling after cancellation or expiration', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const grant: DeviceGrant = { deviceCode: 'private', interval: 0, public: { userCode: 'ABCD', verificationUri: 'https://www.twitch.tv/activate', expiresAt: 90000 } }
    await expect(new OAuth(fetcher).poll('id', grant, new AbortController().signal)).rejects.toThrow('expired')
    const controller = new AbortController()
    controller.abort()
    await expect(new OAuth(fetcher).poll('id', { ...grant, public: { ...grant.public, expiresAt: 200000 } }, controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rotates public-client refresh tokens without a client secret', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ access_token: 'fake-new', refresh_token: 'fake-rotated', expires_in: 3600, scope: [] }))
    const result = await new OAuth(fetcher).refresh(tokens, new AbortController().signal)
    const body = new URLSearchParams(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('fake-refresh')
    expect(body.has('client_secret')).toBe(false)
    expect(result.accessToken).toBe('fake-new')
  })
  it('rejects a token validated for a different client', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ client_id: 'someoneElse', user_id: '123', login: 'viewer', expires_in: 100 }))
    await expect(new OAuth(fetcher).validate(tokens, new AbortController().signal)).rejects.toMatchObject({ status: 401 })
  })
  it('does not expose server responses or credentials in errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ message: 'server echoed fake-refresh and fake-old' }, 400))
    await expect(new OAuth(fetcher).refresh(tokens, new AbortController().signal)).rejects.not.toThrow('fake-refresh')
  })
  it('accepts a successful empty token-revocation response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }))
    await expect(new OAuth(fetcher).revoke(tokens)).resolves.toBeUndefined()
  })
})
