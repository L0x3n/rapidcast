import { describe, expect, it, vi } from 'vitest'
import { AiClient } from './client'
import { defaultAiSettings } from '../../shared/ai'
const settings = { ...defaultAiSettings(), model: 'test-model' }
describe('host-only OpenAI-compatible transport', () => {
  it('uses selected token field, bearer header and never follows redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] })))
    const client = new AiClient(fetcher)
    expect(await client.complete(settings, 'test-key', [{ role: 'user', content: 'ping' }], new AbortController().signal, 512)).toBe('OK')
    const init = fetcher.mock.calls[0]![1]!
    expect(init.redirect).toBe('error'); expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(init.body))).toMatchObject({ max_completion_tokens: 512, store: false, stream: false })
    expect(String(init.body)).not.toContain('test-key')
  })
  it('never surfaces credential-bearing remote error bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('RAW PRIVATE KEY VALUE', { status: 401 }))
    const work = new AiClient(fetcher).models(settings, 'key', new AbortController().signal)
    await expect(work).rejects.toThrow('authentication')
    await expect(work).rejects.not.toThrow('RAW PRIVATE')
  })
  it('rejects credential echoes, truncated output, missing text and oversized responses', async () => {
    for (const body of [{ choices: [{ message: { content: 'private-key' } }] }, { choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }, { choices: [{ message: { content: null, tool_calls: [] } }] }]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)))
      await expect(new AiClient(fetcher).complete(settings, 'private-key', [], new AbortController().signal)).rejects.toThrow()
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(512001)))
    await expect(new AiClient(fetcher).models(settings, '', new AbortController().signal)).rejects.toThrow('limit')
  })
  it('normalizes bounded model IDs without returning endpoint metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'model-b', private: 'ignored' }, { id: 'model-a' }, { id: 'model-a' }, { id: 'bad\nid' }] })))
    expect(await new AiClient(fetcher).models(settings, '', new AbortController().signal)).toEqual(['model-a', 'model-b'])
  })
  it('rejects credential echoes even when the endpoint JSON-escapes them', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"choices":[{"message":{"content":"\\u0070rivate-key"}}]}'))
    await expect(new AiClient(fetcher).complete(settings, 'private-key', [], new AbortController().signal)).rejects.toThrow('credential')
  })
})
