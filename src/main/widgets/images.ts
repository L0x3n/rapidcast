export class HostImages {
  private cache = new Map<string, { bytes: Buffer; mime: string }>()
  private pending = new Map<string, Promise<{ bytes: Buffer; mime: string } | null>>()
  constructor(private readonly avatarUrl: (id: string) => Promise<string | null>) {}
  async get(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const cached = this.cache.get(key)
    if (cached) return cached
    const existing = this.pending.get(key)
    if (existing) return existing
    if (this.pending.size >= 4) return null
    const work = this.load(key).catch(() => null).finally(() => this.pending.delete(key))
    this.pending.set(key, work); return work
  }
  private async load(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
    let url: string | null = null
    if (/^emote:[a-zA-Z0-9_-]{1,80}$/.test(key)) url = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(key.slice(6))}/default/dark/2.0`
    if (/^avatar:[0-9]{1,24}$/.test(key)) url = await this.avatarUrl(key.slice(7))
    if (!url) return null
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'static-cdn.jtvnw.net') return null
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    const mime = response.headers.get('content-type')?.split(';')[0] || ''
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) || Number(response.headers.get('content-length')) > 1024 * 1024) return null
    const reader = response.body?.getReader(); if (!reader) return null
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 1024 * 1024) { await reader.cancel(); return null }; chunks.push(item.value) }
    const image = { bytes: Buffer.concat(chunks), mime }
    if (this.cache.size >= 64) { const first = this.cache.keys().next().value; if (first) this.cache.delete(first) }
    this.cache.set(key, image); return image
  }
}
