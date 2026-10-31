import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from './trusted-url'

describe('renderer IPC URL validation', () => {
  it('normalizes the development server trailing slash', () => {
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173')).toBe(true)
  })

  it('allows in-page navigation in the built app', () => {
    expect(isTrustedRendererUrl('file:///C:/rapidcast/out/renderer/index.html#foundation',
      'file:///C:/rapidcast/out/renderer/index.html')).toBe(true)
  })

  it.each([
    'https://example.com/', 'http://127.0.0.1:5174/',
    'http://127.0.0.1:5173/other', 'http://127.0.0.1:5173/?unexpected=true',
    'http://user@127.0.0.1:5173/', 'not a URL'
  ])('rejects an unexpected renderer URL: %s', (actual) => {
    expect(isTrustedRendererUrl(actual, 'http://127.0.0.1:5173/')).toBe(false)
  })

  it('rejects a different local file', () => {
    expect(isTrustedRendererUrl('file:///C:/untrusted.html',
      'file:///C:/rapidcast/out/renderer/index.html')).toBe(false)
  })
})
