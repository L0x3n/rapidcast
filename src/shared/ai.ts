import { record } from './events'
import type { SceneId } from './scenes'
import type { ActionResult } from './contracts'

export const AI_PRESETS = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  ollama: { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  lmstudio: { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  custom: { name: 'Custom', baseUrl: '' }
} as const
export type AiPreset = keyof typeof AI_PRESETS
export interface AiSettings { preset: AiPreset; baseUrl: string; model: string; tokenField: 'max_tokens' | 'max_completion_tokens'; maxTokens: number; timeoutSeconds: number; suggestionsEnabled: boolean; autoPublish: boolean; cooldownSeconds: number }
export const defaultAiSettings = (): AiSettings => ({ preset: 'openai', baseUrl: AI_PRESETS.openai.baseUrl, model: '', tokenField: 'max_completion_tokens', maxTokens: 6000, timeoutSeconds: 60, suggestionsEnabled: false, autoPublish: false, cooldownSeconds: 60 })
export interface Suggestion { id: string; user: { id: string; login: string; name: string }; source: 'twitch' | 'simulator'; channelId: string; idea: string; title: string; reason: string; createdAt: number; state: 'waiting' | 'screening' | 'pending' | 'blocked' | 'building' | 'ready' | 'published' | 'rejected' | 'error' }
export interface AiDraft { id: string; code: string; name: string; prompt: string; scene: SceneId; editInstanceId: string; suggestionId: string; credit: string; source: 'twitch' | 'simulator' | 'streamer'; previewUrl: string }
export interface AiJob { phase: 'idle' | 'writing' | 'testing' | 'fixing' | 'ready' | 'publishing' | 'published' | 'error' | 'cancelled'; attempt: number; message: string; startedAt: number }
export interface AiState { revision: number; settings: AiSettings; hasKey: boolean; models: string[]; connection: string; job: AiJob; draft: AiDraft | null; suggestions: Suggestion[]; reward: { channelId: string; id: string } | null }
export interface GenerateRequest { prompt: string; scene: SceneId; editInstanceId?: string }
export interface AiApi {
  getAi(): Promise<AiState>
  onAi(listener: (state: AiState) => void): () => void
  saveAi(settings: AiSettings, key?: string): Promise<ActionResult>
  clearAiKey(): Promise<ActionResult>
  listAiModels(): Promise<ActionResult>
  testAi(): Promise<ActionResult>
  generateWidget(request: GenerateRequest): Promise<ActionResult>
  cancelAi(): Promise<ActionResult>
  publishAiDraft(id: string): Promise<ActionResult>
  approveSuggestion(id: string, scene: SceneId): Promise<ActionResult>
  rejectSuggestion(id: string): Promise<ActionResult>
  editSuggestion(id: string, idea: string): Promise<ActionResult>
  simulateSuggestion(idea: string): Promise<ActionResult>
  createSuggestionReward(cost: number): Promise<ActionResult>
}
export const AI_IPC = { state: 'ai:state', update: 'ai:update', save: 'ai:save', clearKey: 'ai:clear-key', models: 'ai:models', test: 'ai:test', generate: 'ai:generate', cancel: 'ai:cancel', publish: 'ai:publish', approve: 'ai:approve', reject: 'ai:reject', edit: 'ai:edit', simulate: 'ai:simulate', reward: 'ai:reward' } as const
export function validateAiSettings(input: unknown): AiSettings {
  const v = record(input)
  if (!Object.hasOwn(AI_PRESETS, String(v.preset)) || typeof v.baseUrl !== 'string' || v.baseUrl.length > 300 || typeof v.model !== 'string' || v.model.length > 160 || /[\r\n\x00-\x1f]/.test(v.model) ||
    !['max_tokens', 'max_completion_tokens'].includes(String(v.tokenField)) || !Number.isInteger(v.maxTokens) || Number(v.maxTokens) < 256 || Number(v.maxTokens) > 16000 ||
    !Number.isInteger(v.timeoutSeconds) || Number(v.timeoutSeconds) < 10 || Number(v.timeoutSeconds) > 180 || !Number.isInteger(v.cooldownSeconds) || Number(v.cooldownSeconds) < 10 || Number(v.cooldownSeconds) > 600 || typeof v.suggestionsEnabled !== 'boolean' || typeof v.autoPublish !== 'boolean') throw new Error('Check the AI model, token limit (256–16000), timeout (10–180 seconds) and cooldown (10–600 seconds).')
  let url: URL
  try { url = new URL(v.baseUrl.trim()) } catch { throw new Error('Enter an OpenAI-compatible base URL ending in /v1.') }
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS, or HTTP on localhost. Put the API key in its separate field; URLs cannot contain credentials or query parameters.')
  return { preset: v.preset as AiPreset, baseUrl: url.href.replace(/\/+$/, ''), model: v.model.trim(), tokenField: v.tokenField as AiSettings['tokenField'], maxTokens: Number(v.maxTokens), timeoutSeconds: Number(v.timeoutSeconds), suggestionsEnabled: v.suggestionsEnabled, autoPublish: v.autoPublish, cooldownSeconds: Number(v.cooldownSeconds) }
}
export function ideaText(input: unknown, max = 400): string {
  if (typeof input !== 'string' || !input.trim() || input.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input)) throw new Error(`Enter an idea between 1 and ${max} characters.`)
  return input.trim()
}
export function extractModule(value: string): string {
  const trimmed = value.trim(); const fence = trimmed.match(/^```(?:javascript|js|mjs)?\s*\n([\s\S]*?)\n```$/i)
  const code = fence?.[1]?.trim() ?? trimmed
  if (code.length > 40000) throw new Error('Generated code exceeds 40000 characters. Make the widget simpler.')
  return code
}
export function screening(value: string): { safe: boolean; title: string; reason: string } {
  const plain = value.trim().replace(/^```json\s*\n([\s\S]*)\n```$/i, '$1')
  let v: Record<string, unknown>
  try { v = record(JSON.parse(plain)) } catch { throw new Error('The model did not return a valid safety decision. Edit the idea to screen it again.') }
  if (typeof v.safe !== 'boolean' || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 60 || typeof v.reason !== 'string' || v.reason.length > 180) throw new Error('The model returned an incomplete safety decision. Edit the idea to screen it again.')
  return { safe: v.safe, title: v.title.replace(/[\r\n]/g, ' '), reason: v.reason.replace(/[\r\n]/g, ' ') }
}
