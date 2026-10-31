import { beforeEach, describe, expect, it, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: { twitchClientId: 'publicDefault123' } }))
vi.mock('../../config/public.json', () => ({ default: config }))
import { resolveTwitchClientId } from './config'

describe('Twitch public configuration', () => {
  beforeEach(() => { config.twitchClientId = 'publicDefault123' })

  it('remains unconfigured when no public ID or override is supplied', () => {
    config.twitchClientId = ''
    expect(resolveTwitchClientId()).toBeNull()
  })

  it('uses the shipped public Client ID', () => {
    expect(resolveTwitchClientId()).toBe('publicDefault123')
  })

  it('prefers and trims the Settings override', () => {
    expect(resolveTwitchClientId('  localOverride456  ')).toBe('localOverride456')
  })

  it('falls back to the public default for a blank override', () => {
    expect(resolveTwitchClientId('  ')).toBe('publicDefault123')
  })

  it.each(['https://twitch.tv', 'oauth:token', 'has spaces', 'x'.repeat(129)])(
    'rejects malformed client IDs: %s', (value) => {
      expect(() => resolveTwitchClientId(value)).toThrow('Enter the Client ID')
    }
  )
})
