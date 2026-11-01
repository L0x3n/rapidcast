import { describe, expect, it } from 'vitest'
import { defaultAiSettings, validateAiSettings, extractModule, ideaText, screening } from './ai'
import { SuggestionGate } from './suggestions'
import type { StreamEvent } from './events'

const chat = (text = '!widget A neon pulse', userId = 'viewer', own = false): StreamEvent => ({ id: 'chat', type: 'chat', source: 'twitch', user: { id: userId, login: userId, name: userId }, at: '', receivedAt: 0, text, color: '', emotes: [], badges: [], own })
describe('AI configuration and text boundaries', () => {
  it.each(['https://api.openai.com/v1/', 'https://models.example/custom/v1', 'http://localhost:1234/v1', 'http://127.0.0.1:11434/v1', 'http://[::1]:1234/v1'])('allows a deliberate endpoint: %s', baseUrl => {
    expect(validateAiSettings({ ...defaultAiSettings(), baseUrl }).baseUrl).toBe(baseUrl.replace(/\/+$/, ''))
  })
  it.each(['file:///etc/passwd', 'http://remote.example/v1', 'https://user:key@api.example/v1', 'https://api.example/v1?key=secret', 'https://api.example/v1#key'])('rejects credential-bearing or unsupported URL: %s', baseUrl => {
    expect(() => validateAiSettings({ ...defaultAiSettings(), baseUrl })).toThrow()
  })
  it('rejects invalid limits and treats model names as bounded text', () => {
    for (const change of [{ maxTokens: 20000 }, { timeoutSeconds: 2 }, { cooldownSeconds: 0 }, { model: 'bad\nmodel' }, { autoPublish: 'true' }]) expect(() => validateAiSettings({ ...defaultAiSettings(), ...change })).toThrow()
  })
  it('extracts one module fence and never accepts prose as a module automatically', () => {
    expect(extractModule('```js\nexport default {};\n```')).toBe('export default {};')
    expect(extractModule('Here is your code:\n```js\ncode\n```')).toContain('Here is your code:')
    expect(() => extractModule('x'.repeat(40001))).toThrow('40000')
  })
  it('requires an explicit, complete safety decision and enforces idea bounds', () => {
    expect(screening('{"safe":false,"title":"Blocked","reason":"Network access"}').safe).toBe(false)
    expect(screening('```json\n{"safe":true,"title":"Neon","reason":"Canvas only"}\n```').safe).toBe(true)
    for (const value of ['sure!', '{}', '{"safe":"yes","title":"x","reason":"x"}']) expect(() => screening(value)).toThrow('decision')
    expect(() => ideaText(' '.repeat(3))).toThrow()
    expect(() => ideaText('x'.repeat(401))).toThrow('400')
  })
})
describe('viewer idea intake', () => {
  it('ignores own messages, ordinary chat, empty/oversize commands and other command names', () => {
    const gate = new SuggestionGate()
    for (const event of [chat('!widget neon', 'viewer', true), chat('hello'), chat('!widgets neon'), chat('!widget '), chat(`!widget ${'x'.repeat(401)}`)]) expect(gate.accept(event, 60, '', 0)).toBeNull()
    expect(gate.accept(chat('!WIDGET Neon'), 60, '', 0)?.idea).toBe('Neon')
  })
  it('enforces per-user and global cooldowns independently', () => {
    const gate = new SuggestionGate()
    expect(gate.accept(chat(), 60, '', 0)).not.toBeNull()
    expect(gate.accept(chat('!widget next', 'second'), 60, '', 4999)).toBeNull()
    expect(gate.accept(chat('!widget next', 'second'), 60, '', 5000)).not.toBeNull()
    expect(gate.accept(chat(), 60, '', 59999)).toBeNull()
    expect(gate.accept(chat(), 60, '', 60000)).not.toBeNull()
  })
  it('accepts only the exact app-owned reward ID, not a matching title', () => {
    const event: StreamEvent = { id: 'r', source: 'twitch', type: 'redeem', at: '', receivedAt: 0, user: { id: 'v', login: 'v', name: 'V' }, reward: 'Suggest a widget', rewardId: 'owned', input: 'Confetti' }
    expect(new SuggestionGate().accept(event, 60, 'other', 0)).toBeNull()
    expect(new SuggestionGate().accept(event, 60, 'owned', 0)?.idea).toBe('Confetti')
  })
})
