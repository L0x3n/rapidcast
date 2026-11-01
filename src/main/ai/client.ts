import { record } from '../../shared/events'
import type { AiSettings } from '../../shared/ai'

export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export class AiClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  private async request(settings: AiSettings, key: string, path: string, signal: AbortSignal, body?: unknown): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await this.fetcher(`${settings.baseUrl}/${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutSeconds * 1000)]), headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    } catch { throw new Error(signal.aborted ? 'The AI request was cancelled.' : 'The AI endpoint could not be reached in time. Check its URL, server and timeout.') }
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 401 || response.status === 403 ? 'The AI endpoint rejected authentication. Check the saved key and account access.' : response.status === 429 ? 'The AI endpoint is rate limited or out of credit. Wait or check your provider account.' : response.status === 400 ? 'The AI endpoint rejected the request. Check the model and output token field in Settings.' : `The AI endpoint returned HTTP ${response.status}. Check the model, URL and server.`) }
    const reader = response.body?.getReader(); if (!reader) throw new Error('The AI endpoint returned an empty response.')
    let size = 0; const chunks: Uint8Array[] = []
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 512000) { await reader.cancel(); throw new Error('The AI response was too large. Reduce the output token limit.') }; chunks.push(part.value) }
    } catch { throw new Error('The AI response could not be read within its size or time limit. Retry with a smaller output.') }
    const value = Buffer.concat(chunks).toString('utf8')
    if (key && value.includes(key)) throw new Error('The endpoint returned credential data. Its response was discarded. Check the provider configuration.')
    let parsed: unknown
    try { parsed = JSON.parse(value) } catch { throw new Error('The endpoint did not return OpenAI-compatible JSON. Check the base URL.') }
    if (key && JSON.stringify(parsed).includes(JSON.stringify(key).slice(1, -1))) throw new Error('The endpoint returned credential data. Its response was discarded. Check the provider configuration.')
    return record(parsed)
  }
  async models(settings: AiSettings, key: string, signal: AbortSignal): Promise<string[]> {
    const value = await this.request(settings, key, 'models', signal)
    if (!Array.isArray(value.data)) throw new Error('The endpoint did not return a model list. Enter a model ID manually.')
    return [...new Set(value.data.flatMap(item => { const id = record(item).id; return typeof id === 'string' && id.length > 0 && id.length <= 160 && !/[\x00-\x1f]/.test(id) ? [id] : [] }))].sort().slice(0, 1000)
  }
  async complete(settings: AiSettings, key: string, messages: Message[], signal: AbortSignal, maxTokens = settings.maxTokens): Promise<string> {
    if (!settings.model) throw new Error('Choose a model in Settings before using AI.')
    const value = await this.request(settings, key, 'chat/completions', signal, { model: settings.model, messages, stream: false, [settings.tokenField]: maxTokens,
      ...(new URL(settings.baseUrl).hostname === 'api.openai.com' ? { store: false } : {}) })
    const choice = record(Array.isArray(value.choices) ? value.choices[0] : null); const message = record(choice.message)
    if (choice.finish_reason === 'length') throw new Error('The model reached its output token limit. Increase the limit or use a simpler idea.')
    if (typeof message.content !== 'string' || !message.content.trim()) throw new Error('The model returned no text. Choose a model that supports Chat Completions text output.')
    return message.content
  }
}
