import { safeStorage } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { record, text } from '../shared/events'
import { isSceneId, type SceneId } from '../shared/scenes'
import type { TokenSet } from './twitch/oauth'

export interface Preferences { clientId: string; activeScene: SceneId }
export class Storage {
  private writes: Promise<void> = Promise.resolve()
  constructor(private readonly directory: string) {}

  private async read(name: string): Promise<Buffer | null> {
    try { return await readFile(join(this.directory, name)) }
    catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw new Error('RapidCast could not read its saved data. Check your app data folder permissions, then restart.')
    }
  }

  private atomic(name: string, content: string | Buffer | null, signal?: AbortSignal): Promise<void> {
    const operation = this.writes.then(async () => {
      if (signal?.aborted) throw new Error('The Twitch connection was cancelled.')
      await mkdir(this.directory, { recursive: true })
      const path = join(this.directory, name)
      if (content === null) { await rm(path, { force: true }); return }
      await writeFile(`${path}.tmp`, content)
      await rename(`${path}.tmp`, path)
    }).catch(() => { throw new Error('RapidCast could not save its data. Check available disk space and app data folder permissions.') })
    this.writes = operation.catch(() => undefined)
    return operation
  }

  async preferences(): Promise<Preferences> {
    const raw = await this.read('settings.json')
    if (!raw) return { clientId: '', activeScene: 'starting' }
    try {
      const value = record(JSON.parse(raw.toString('utf8')))
      return { clientId: text(value.clientId, '', 128), activeScene: isSceneId(value.activeScene) ? value.activeScene : 'starting' }
    } catch { throw new Error('Your saved settings are unreadable. Rename settings.json in the RapidCast app data folder, then restart.') }
  }
  savePreferences(value: Preferences): Promise<void> { return this.atomic('settings.json', JSON.stringify(value, null, 2)) }

  async readTokens(): Promise<TokenSet | null> {
    const encrypted = await this.read('twitch.bin')
    if (!encrypted) return null
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows secure storage is unavailable. Sign in to Windows normally, then restart RapidCast.')
    try {
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const value = record(JSON.parse(decrypted.result))
      if (!text(value.accessToken) || !text(value.refreshToken) || !text(value.clientId) || typeof value.expiresAt !== 'number') throw new Error('Invalid session')
      const tokens: TokenSet = { accessToken: text(value.accessToken), refreshToken: text(value.refreshToken),
        clientId: text(value.clientId), expiresAt: value.expiresAt, scopes: Array.isArray(value.scopes) ? value.scopes.filter((s): s is string => typeof s === 'string') : [] }
      if (decrypted.shouldReEncrypt) await this.saveTokens(tokens)
      return tokens
    } catch { throw new Error('The saved Twitch login cannot be unlocked. Disconnect Twitch in Settings and sign in again.') }
  }
  async saveTokens(tokens: TokenSet, signal?: AbortSignal): Promise<void> {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows secure storage is unavailable. Restart Windows before connecting Twitch. Credentials will not be saved as plain text.')
    let encrypted: Buffer
    try { encrypted = await safeStorage.encryptStringAsync(JSON.stringify(tokens)) }
    catch { throw new Error('Windows could not protect your Twitch login. Restart Windows and connect Twitch again.') }
    if (signal?.aborted) throw new Error('The Twitch connection was cancelled.')
    await this.atomic('twitch.bin', encrypted, signal)
  }
  clearTokens(): Promise<void> { return this.atomic('twitch.bin', null) }
}
