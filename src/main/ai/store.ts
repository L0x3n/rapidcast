import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { defaultAiSettings, validateAiSettings, type Suggestion } from '../../shared/ai'
import { record } from '../../shared/events'

export class AiStore {
  settings = defaultAiSettings()
  suggestions: Suggestion[] = []
  reward: { channelId: string; id: string } | null = null
  private key = ''
  private writes = Promise.resolve()
  constructor(private readonly directory: string) {}
  get secret(): string { return this.key }
  private async read(name: string): Promise<Buffer | null> {
    try { return await readFile(join(this.directory, name)) } catch (error: unknown) { if (record(error).code === 'ENOENT') return null; throw new Error('AI settings could not be read. Check the app data folder permissions.') }
  }
  async load(): Promise<void> {
    const saved = await this.read('ai.json')
    if (saved) {
      try {
        const data = record(JSON.parse(saved.toString('utf8')))
        this.settings = validateAiSettings(data.settings)
        const reward = record(data.reward)
        if (typeof reward.channelId === 'string' && typeof reward.id === 'string') this.reward = { channelId: reward.channelId, id: reward.id }
        if (Array.isArray(data.suggestions)) for (const raw of data.suggestions.slice(-50)) {
          const v = record(raw); const u = record(v.user)
          if (typeof v.id !== 'string' || v.id.length > 80 || !['twitch', 'simulator'].includes(String(v.source)) || typeof v.channelId !== 'string' || typeof v.idea !== 'string' || v.idea.length > 400 || typeof u.id !== 'string' || typeof u.login !== 'string' || typeof u.name !== 'string' || typeof v.createdAt !== 'number') continue
          this.suggestions.push({ id: v.id, user: { id: u.id.slice(0, 80), login: u.login.slice(0, 40), name: u.name.slice(0, 100) }, source: v.source as Suggestion['source'], channelId: v.channelId,
            idea: v.idea, title: typeof v.title === 'string' ? v.title.slice(0, 60) : 'Viewer idea', reason: typeof v.reason === 'string' ? v.reason.slice(0, 180) : '', createdAt: v.createdAt,
            state: ['published', 'rejected', 'blocked'].includes(String(v.state)) ? v.state as Suggestion['state'] : 'waiting' })
        }
      } catch { throw new Error('Saved AI settings are invalid. Rename ai.json in app data, then restart.') }
    }
    const encrypted = await this.read('ai-key.bin')
    if (encrypted) {
      try {
        if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Unavailable')
        const value = await safeStorage.decryptStringAsync(encrypted); const data = record(JSON.parse(value.result))
        if (data.baseUrl === this.settings.baseUrl && typeof data.key === 'string') this.key = data.key
        if (value.shouldReEncrypt && this.key) await this.setKey(this.key)
      } catch { throw new Error('The AI key cannot be unlocked. Clear it in AI settings and save it again.') }
    }
  }
  async setKey(value: string): Promise<void> {
    if (value.length > 2048 || /[\r\n\x00-\x1f]/.test(value)) throw new Error('Enter an API key without whitespace or line breaks.')
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows secure storage is unavailable. The AI key will not be saved as plain text.')
    let bytes: Buffer
    try { bytes = await safeStorage.encryptStringAsync(JSON.stringify({ baseUrl: this.settings.baseUrl, key: value })) } catch { throw new Error('Windows could not encrypt the AI key. Restart Windows and retry.') }
    await this.atomic('ai-key.bin', bytes); this.key = value
  }
  async clearKey(): Promise<void> { await this.atomic('ai-key.bin', null); this.key = '' }
  save(): Promise<void> { return this.atomic('ai.json', JSON.stringify({ settings: this.settings, suggestions: this.suggestions, reward: this.reward }, null, 2)) }
  private atomic(name: string, value: string | Buffer | null): Promise<void> {
    const work = this.writes.then(async () => { await mkdir(this.directory, { recursive: true }); const path = join(this.directory, name); if (value === null) { await rm(path, { force: true }); return }; await writeFile(`${path}.tmp`, value); await rename(`${path}.tmp`, path) })
      .catch(() => { throw new Error('AI settings could not be saved. Check disk space and app data permissions.') })
    this.writes = work.catch(() => undefined); return work
  }
}
