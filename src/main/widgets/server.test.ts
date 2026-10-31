import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from 'node:http'
import { OverlayServer } from './server'
import { builtinWidgets } from './builtins'
import { defaultEngineSettings } from '../../shared/engine'

let server: OverlayServer | null = null
afterEach(async () => { await server?.close(); server = null })
async function start(): Promise<{ server: OverlayServer; report: ReturnType<typeof vi.fn> }> {
  const definitions = builtinWidgets(); const report = vi.fn()
  server = new OverlayServer('out/overlay', {
    snapshot: () => ({ revision: 1, activeScene: 'live', scenes: defaultEngineSettings().scenes, definitions, instances: [], events: [], transition: 'fade' }),
    definition: id => definitions.find(item => item.id === id), report, image: async () => null
  }, 'file:', true)
  await server.start()
  return { server, report }
}
describe('loopback overlay security', () => {
  it('restricts Worker responses independently of the document CSP', async () => {
    const { server } = await start()
    const response = await fetch(`${server.baseUrl}/worker/builtin-chat.mjs`)
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain("script-src 'none'")
    const source = await response.text()
    expect(source).toContain('function createWidget')
    expect(source).toContain('transferToImageBitmap')
  })
  it('rejects foreign or absent Origin on state mutation and accepts same-origin JSON', async () => {
    const { server, report } = await start()
    for (const origin of ['', 'https://attacker.example', 'null']) {
      const response = await fetch(`${server.baseUrl}/api/status`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })
      expect(response.status).toBe(403)
    }
    expect(report).not.toHaveBeenCalled()
    const response = await fetch(`${server.baseUrl}/api/status`, { method: 'POST', headers: { Origin: server.baseUrl, 'Content-Type': 'application/json' }, body: '{"statuses":[]}' })
    expect(response.status).toBe(204); expect(report).toHaveBeenCalledWith({ statuses: [] })
  })
  it('rejects DNS-rebinding Host headers and unrecognized routes', async () => {
    const { server } = await start()
    const status = await new Promise<number>(resolve => { const call = request(`${server.baseUrl}/api/snapshot`, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode!) }); call.end() })
    expect(status).toBe(403)
    expect((await fetch(`${server.baseUrl}/assets/../../package.json`)).status).toBe(404)
    expect((await fetch(`${server.baseUrl}/images/avatar:invalid`)).status).toBe(404)
  })
  it('starts SSE with an atomic current snapshot and then delivers a broadcast', async () => {
    const { server } = await start()
    const controller = new AbortController()
    const response = await fetch(`${server.baseUrl}/api/events`, { signal: controller.signal })
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot')
    server.broadcast('event', { id: 'test-event' })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('test-event')
    await reader.cancel(); controller.abort()
  })
})
