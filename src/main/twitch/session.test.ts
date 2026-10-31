import { describe, expect, it, vi } from 'vitest'
import { OAuth, type TokenSet } from './oauth'
import { TwitchSession } from './session'
import { Helix } from './helix'
import { TwitchError } from './http'

const old: TokenSet = { clientId: 'public', accessToken: 'fake-old', refreshToken: 'fake-refresh-old', expiresAt: 0, scopes: [] }
const fresh: TokenSet = { ...old, accessToken: 'fake-new', refreshToken: 'fake-refresh-rotated', expiresAt: Date.now() + 3600000 }

describe('token refresh lifecycle', () => {
  it('coalesces concurrent refreshes and persists the rotated refresh token once', async () => {
    const oauth = new OAuth()
    const refresh = vi.spyOn(oauth, 'refresh').mockResolvedValue(fresh)
    const storage = { saveTokens: vi.fn().mockResolvedValue(undefined) }
    const session = new TwitchSession(old, oauth, storage, new AbortController().signal)
    const [a, b] = await Promise.all([session.token(), session.token()])
    expect(refresh).toHaveBeenCalledOnce()
    expect(a.refreshToken).toBe('fake-refresh-rotated')
    expect(a).toBe(b)
    expect(storage.saveTokens).toHaveBeenCalledOnce()
    expect((await session.token()).accessToken).toBe('fake-new')
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('does not persist a refresh result after cancellation', async () => {
    const oauth = new OAuth()
    const controller = new AbortController()
    vi.spyOn(oauth, 'refresh').mockImplementation(async () => { controller.abort(); return fresh })
    const storage = { saveTokens: vi.fn() }
    const session = new TwitchSession(old, oauth, storage, controller.signal)
    await expect(session.token()).rejects.toThrow()
    expect(storage.saveTokens).not.toHaveBeenCalled()
  })
  it('validates startup identity and retries a 401 with a refreshed token', async () => {
    const oauth = new OAuth()
    const validate = vi.spyOn(oauth, 'validate').mockRejectedValueOnce(new TwitchError(401)).mockResolvedValueOnce({ userId: 'me', login: 'linus', scopes: ['user:read:chat'], expiresIn: 3600 })
    vi.spyOn(oauth, 'refresh').mockResolvedValue(fresh)
    const session = new TwitchSession({ ...old, expiresAt: Date.now() + 3600000 }, oauth, { saveTokens: vi.fn() }, new AbortController().signal)
    expect(await session.validate()).toMatchObject({ userId: 'me' })
    expect(validate).toHaveBeenCalledTimes(2)
    expect(session.current().scopes).toEqual(['user:read:chat'])
  })
  it('preserves a newer refresh token if validation of the old token finishes later', async () => {
    const oauth = new OAuth()
    let finish: ((value: { userId: string; login: string; scopes: string[]; expiresIn: number }) => void) | undefined
    vi.spyOn(oauth, 'validate').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    vi.spyOn(oauth, 'refresh').mockResolvedValue(fresh)
    const session = new TwitchSession({ ...old, expiresAt: Date.now() + 3600000 }, oauth, { saveTokens: vi.fn() }, new AbortController().signal)
    const validating = session.validate()
    await Promise.resolve()
    await session.token(true)
    if (!finish) throw new Error('Validation did not start')
    finish({ userId: 'me', login: 'linus', scopes: [], expiresIn: 100 })
    await validating
    expect(session.current().refreshToken).toBe('fake-refresh-rotated')
  })
})
describe('Helix authentication', () => {
  it('retries a 401 once using the refreshed token in headers only', async () => {
    const oauth = new OAuth()
    vi.spyOn(oauth, 'refresh').mockResolvedValue(fresh)
    const session = new TwitchSession({ ...old, expiresAt: Date.now() + 3600000 }, oauth, { saveTokens: vi.fn() }, new AbortController().signal)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"data":[]}'))
    await new Helix(session, fetcher).call('users')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.twitch.tv/helix/users')
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer fake-new', 'Client-Id': 'public' })
  })
})
