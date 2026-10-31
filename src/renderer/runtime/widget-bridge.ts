import type { EngineCommand } from '../../shared/engine'
import type { WidgetStatus } from '../../shared/widgets'

export class WidgetBridge {
  readonly frames = new Map<string, ImageBitmap>()
  readonly statuses = new Map<string, WidgetStatus>()
  private iframe: HTMLIFrameElement | null = null
  private origin = ''
  private scene = 'starting'
  private allowed = new Set<string>()
  private heartbeat = 0
  private failed = false
  private count = 0
  private listener = (event: MessageEvent): void => {
    if (!this.iframe || event.source !== this.iframe.contentWindow || event.origin !== this.origin || event.data?.channel !== 'rapidcast-widget') return
    const data = event.data
    this.heartbeat = performance.now()
    if (data.kind === 'frame') {
      if (!(data.bitmap instanceof ImageBitmap)) return
      if (!this.allowed.has(data.id) || data.bitmap.width > 1920 || data.bitmap.height > 1080) { data.bitmap.close(); return }
      this.count++; this.frames.get(data.id)?.close(); this.frames.set(data.id, data.bitmap)
    } else if (data.kind === 'statuses' && Array.isArray(data.statuses) && data.statuses.length <= 32) {
      for (const status of data.statuses) if (this.allowed.has(status.id) && ['loading', 'ready', 'disabled'].includes(status.state)) {
        this.statuses.set(status.id, status as WidgetStatus)
        if (status.state === 'disabled') { this.frames.get(status.id)?.close(); this.frames.delete(status.id) }
      }
    }
  }
  constructor() { window.addEventListener('message', this.listener) }
  configure(command: EngineCommand): void {
    this.allowed = new Set(Object.values(command.settings.scenes).flat().filter(layer => layer.kind === 'widget').map(layer => layer.id))
    for (const id of this.frames.keys()) if (!this.allowed.has(id)) { this.frames.get(id)?.close(); this.frames.delete(id); this.statuses.delete(id) }
    this.scene = command.scene
    if (!command.widgetOrigin) return
    if (this.origin !== command.widgetOrigin || !this.iframe) {
      this.iframe?.remove(); this.origin = command.widgetOrigin; this.failed = false; this.heartbeat = performance.now()
      const iframe = document.createElement('iframe')
      iframe.sandbox.add('allow-scripts', 'allow-same-origin')
      iframe.title = 'RapidCast isolated widget runtime'
      iframe.src = `${this.origin}/runtime/frame`
      iframe.style.position = 'fixed'; iframe.style.width = '1px'; iframe.style.height = '1px'; iframe.style.opacity = '0'; iframe.style.pointerEvents = 'none'; iframe.style.top = '0'; iframe.style.left = '0'
      iframe.onload = () => this.sendScene()
      this.iframe = iframe; document.body.append(iframe)
    }
    this.sendScene()
  }
  private sendScene(): void { this.iframe?.contentWindow?.postMessage({ channel: 'rapidcast-widget', kind: 'configure', scene: this.scene }, this.origin) }
  check(now: number): void {
    if (!this.iframe || this.failed || !this.allowed.size || now - this.heartbeat < 6000) return
    this.failed = true
    for (const id of this.allowed) {
      this.frames.get(id)?.close(); this.frames.delete(id)
      this.statuses.set(id, { id, state: 'disabled', reason: 'The isolated widget runtime stopped. Restart widgets from Studio.', frames: 0, triggers: 0, renderMs: 0 })
    }
    this.iframe.remove(); this.iframe = null
    window.compositor.widgetsFailed('The isolated widget runtime stopped. Output continues. Restart widgets from Studio.')
  }
  capabilities(): string[] { return [`widget-frames:${this.count}`, `widgets-ready:${[...this.statuses.values()].filter(status => status.state === 'ready').length}`, `widgets-disabled:${[...this.statuses.values()].filter(status => status.state === 'disabled').length}`] }
  close(): void {
    this.iframe?.remove(); this.iframe = null; this.origin = ''; this.allowed.clear()
    for (const frame of this.frames.values()) frame.close()
    this.frames.clear(); this.statuses.clear()
  }
}
