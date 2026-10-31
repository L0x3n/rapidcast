import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TokenSet } from './twitch/oauth'

const { encryption } = vi.hoisted(() => ({ encryption: {
  isAsyncEncryptionAvailable: vi.fn(), encryptStringAsync: vi.fn(), decryptStringAsync: vi.fn()
} }))
vi.mock('electron', () => ({ safeStorage: encryption }))
import { Storage } from './storage'

let directory: string
const tokens: TokenSet = { clientId: 'public', accessToken: 'fake-access', refreshToken: 'fake-refresh', scopes: [], expiresAt: 123456 }
describe('local storage boundaries', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'rapidcast-storage-test-'))
    encryption.isAsyncEncryptionAvailable.mockResolvedValue(true)
    encryption.encryptStringAsync.mockResolvedValue(Buffer.from('opaque-encrypted-test-payload'))
    encryption.decryptStringAsync.mockResolvedValue({ result: JSON.stringify(tokens), shouldReEncrypt: false })
  })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.resetAllMocks() })
  it('writes only safeStorage ciphertext and reads through safeStorage', async () => {
    const storage = new Storage(directory)
    await storage.saveTokens(tokens)
    const file = await readFile(join(directory, 'twitch.bin'))
    expect(file.toString()).not.toContain('fake-access')
    expect(file.toString()).not.toContain('fake-refresh')
    expect(await storage.readTokens()).toEqual(tokens)
    expect(encryption.decryptStringAsync).toHaveBeenCalledWith(file)
    await storage.clearTokens()
    expect(await storage.readTokens()).toBeNull()
  })
  it('refuses plaintext fallback when encryption is unavailable', async () => {
    encryption.isAsyncEncryptionAvailable.mockResolvedValue(false)
    await expect(new Storage(directory).saveTokens(tokens)).rejects.toThrow('secure storage')
    expect(encryption.encryptStringAsync).not.toHaveBeenCalled()
    await expect(readFile(join(directory, 'twitch.bin'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('does not resurrect credentials if logout interrupts encryption', async () => {
    const controller = new AbortController()
    encryption.encryptStringAsync.mockImplementation(async () => { controller.abort(); return Buffer.from('ciphertext') })
    const storage = new Storage(directory)
    await expect(storage.saveTokens(tokens, controller.signal)).rejects.toThrow('cancelled')
    expect(await storage.readTokens()).toBeNull()
  })
  it('serializes settings writes and preserves the last scene', async () => {
    const storage = new Storage(directory)
    await Promise.all([storage.savePreferences({ clientId: 'first', activeScene: 'starting' }), storage.savePreferences({ clientId: 'last', activeScene: 'brb' })])
    expect(await storage.preferences()).toEqual({ clientId: 'last', activeScene: 'brb' })
  })
})
