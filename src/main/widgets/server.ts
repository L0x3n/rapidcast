import { createServer, type Server, type ServerResponse, type IncomingMessage } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import harness from './worker-harness.js?raw'
import { validateWidgetCode } from '../../shared/widget-validation'
import type { OverlaySnapshot, WidgetDefinition } from '../../shared/widgets'

interface ServerHooks {
  snapshot(): OverlaySnapshot
  definition(id: string): WidgetDefinition | undefined
  report(value: unknown): void
  image(key: string): Promise<{ bytes: Buffer; mime: string } | null>
}
export class OverlayServer {
  private server: Server | null = null
  private clients = new Set<ServerResponse>()
  private workerCache = new Map<string, string>()
  baseUrl = ''
  probeRequests = 0
  constructor(private readonly directory: string, private readonly hooks: ServerHooks, private readonly parentOrigin: string, readonly testMode = false) {}
  async start(preferredPort = 0): Promise<void> {
    const server = createServer((request, response) => { void this.handle(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end('The overlay could not load. Restart RapidCast.'); }) })
    server.requestTimeout = 10000; server.headersTimeout = 10000
    this.server = server
    const listen = (port: number): Promise<void> => new Promise((resolve, reject) => {
      const error = (value: Error): void => { server.off('listening', ready); reject(value) }
      const ready = (): void => { server.off('error', error); resolve() }
      server.once('error', error); server.once('listening', ready); server.listen(port, '127.0.0.1')
    })
    try { await listen(preferredPort) } catch (error: unknown) {
      if (preferredPort && error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') await listen(0)
      else throw new Error('The local overlay server could not start. Restart RapidCast and check the local port.')
    }
    server.on('error', () => { for (const client of this.clients) client.end(); this.clients.clear() })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('The local overlay server did not get a port.')
    this.baseUrl = `http://127.0.0.1:${address.port}`
  }
  get sandboxUrl(): string { return this.baseUrl.replace('127.0.0.1', 'localhost') }
  broadcast(kind: 'snapshot' | 'event' | 'reset', value: unknown): void {
    const message = `event: ${kind}\ndata: ${JSON.stringify(value)}\n\n`
    for (const client of this.clients) {
      if (client.destroyed || client.writableLength > 256000) { client.destroy(); this.clients.delete(client); continue }
      client.write(message)
    }
  }
  private headers(response: ServerResponse): void {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Origin-Agent-Cluster', '?1')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = new URL(this.baseUrl).port
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host || '')) { response.writeHead(403); response.end('Local overlays only.'); return }
    this.headers(response)
    const url = new URL(request.url || '/', this.baseUrl)
    const path = url.pathname
    if (request.method === 'POST' && path === '/api/status') {
      if (![this.baseUrl, this.sandboxUrl].includes(request.headers.origin || '') || request.headers['content-type'] !== 'application/json') { response.writeHead(403); response.end(); return }
      let bytes = 0; const chunks: Buffer[] = []
      for await (const chunk of request) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > 16000) { response.writeHead(413); response.end(); return }; chunks.push(buffer) }
      this.hooks.report(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      response.writeHead(204); response.end(); return
    }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
    if (path === '/api/snapshot') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(this.hooks.snapshot())); return }
    if (path === '/api/events') {
      if (this.clients.size >= 12) { response.writeHead(429); response.end('Too many overlay connections.'); return }
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
      response.write(`event: snapshot\ndata: ${JSON.stringify(this.hooks.snapshot())}\n\n`); this.clients.add(response)
      const timer = setInterval(() => { if (!response.destroyed) response.write(': keepalive\n\n') }, 15000)
      response.on('close', () => { clearInterval(timer); this.clients.delete(response) })
      return
    }
    const worker = path.match(/^\/worker\/([a-zA-Z0-9_-]{1,80})\.mjs$/)
    if (worker || this.testMode && path === '/security-probe.mjs') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'none'; connect-src 'none'; worker-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'")
      if (!worker) {
        response.end(`Promise.all([fetch('/probe-hit').then(()=>false,()=>true),import('/probe-hit.mjs').then(()=>false,()=>true)]).then(blocked=>{let evalBlocked=false;try{Function('return 1')();}catch{evalBlocked=true;}postMessage({networkBlocked:blocked.every(Boolean),evalBlocked,nodeHidden:typeof require==='undefined',domHidden:typeof document==='undefined'});});`)
        return
      }
      const definition = this.hooks.definition(worker[1]!)
      if (!definition) { response.writeHead(404); response.end(); return }
      let source = this.workerCache.get(definition.version)
      if (!source) { source = `function createWidget(){'use strict';\n${validateWidgetCode(definition.code).factoryBody}\n}\n${harness}(createWidget);`; this.workerCache.set(definition.version, source) }
      response.end(source); return
    }
    if (path.startsWith('/probe-hit')) { this.probeRequests++; response.writeHead(204); response.end(); return }
    if (path.startsWith('/images/')) {
      const key = decodeURIComponent(path.slice('/images/'.length))
      if (!/^(avatar|emote):[a-zA-Z0-9_-]{1,80}$/.test(key)) { response.writeHead(404); response.end(); return }
      const image = await this.hooks.image(key)
      if (!image) { response.writeHead(404); response.end(); return }
      response.setHeader('Content-Type', image.mime); response.end(image.bytes); return
    }
    if (/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path)) {
      response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8')
      response.end(await readFile(join(this.directory, path.slice(1)))); return
    }
    if (/^\/overlay\/(starting|live|brb|ending|program)$/.test(path) || /^\/widget\/[a-zA-Z0-9_-]{1,80}$/.test(path) || path === '/runtime/frame') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${this.parentOrigin}`)
      response.end(await readFile(join(this.directory, 'index.html'))); return
    }
    response.writeHead(404); response.end('Open an overlay URL from RapidCast Studio.')
  }
  async close(): Promise<void> {
    for (const client of this.clients) client.end()
    this.clients.clear()
    await new Promise<void>(resolve => { if (this.server) { this.server.close(() => resolve()); this.server.closeAllConnections() } else resolve() })
  }
}
