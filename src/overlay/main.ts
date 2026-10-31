import './style.css'
import { WidgetManager } from './manager'
import type { OverlaySnapshot, WidgetStatus, Transition } from '../shared/widgets'
import type { StreamEvent } from '../shared/events'
import { SceneTransition } from '../renderer/runtime/transitions'
import { drawWidget } from '../renderer/runtime/widget-draw'

const embed = location.pathname === '/runtime/frame'
const canvas = document.querySelector('canvas')!
const context = canvas.getContext('2d')!
const transition = new SceneTransition()
let snapshot: OverlaySnapshot | null = null
let override = ''
let currentScene = ''
let lastReport = 0
let lastHeartbeat = 0
let transitionMode: Transition = 'fade'
const manager = new WidgetManager(embed ? (id, bitmap) => parent.postMessage({ channel: 'rapidcast-widget', kind: 'frame', id, bitmap }, '*', [bitmap]) : null)
const requested = location.pathname.split('/').at(-1) || 'program'
function selectedScene(): string { return override || (requested === 'program' || embed ? snapshot?.activeScene || 'starting' : requested) }
function apply(next: OverlaySnapshot, reset = false): void {
  if (snapshot && next.revision < snapshot.revision) return
  if (reset) manager.clear()
  snapshot = next; transitionMode = next.transition; manager.configure(next)
}
const events = new EventSource('/api/events')
events.addEventListener('snapshot', event => apply(JSON.parse((event as MessageEvent<string>).data) as OverlaySnapshot))
events.addEventListener('reset', event => apply(JSON.parse((event as MessageEvent<string>).data) as OverlaySnapshot, true))
events.addEventListener('event', event => manager.event(JSON.parse((event as MessageEvent<string>).data) as StreamEvent))
window.addEventListener('message', event => {
  if (!embed || event.source !== parent || event.data?.channel !== 'rapidcast-widget' || event.data.kind !== 'configure') return
  if (['starting', 'live', 'brb', 'ending'].includes(event.data.scene)) override = event.data.scene
})
function draw(now: number): void {
  if (snapshot) {
    let scene = selectedScene()
    if (location.pathname.startsWith('/widget/')) {
      const found = Object.entries(snapshot.scenes).find(([, layers]) => layers.some(layer => layer.id === requested))
      scene = found?.[0] || 'starting'
    }
    if (!embed && currentScene && currentScene !== scene) { transition.capture(canvas, transitionMode); transition.begin(now) }
    currentScene = scene
    manager.tick(scene, snapshot, now)
    const statuses = manager.statuses()
    if (!embed) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      const layers = (snapshot.scenes[scene as keyof typeof snapshot.scenes] || []).filter(layer => layer.visible && (!location.pathname.startsWith('/widget/') || layer.id === requested)).sort((a, b) => a.z - b.z)
      const statusMap = new Map<string, WidgetStatus>(statuses.map(status => [status.id, status]))
      for (const layer of layers) {
        if (location.pathname.startsWith('/widget/')) {
          if (canvas.width !== layer.width || canvas.height !== layer.height) { canvas.width = layer.width; canvas.height = layer.height }
          context.save(); context.globalAlpha = layer.opacity; drawWidget(context, { ...layer, x: 0, y: 0 }, manager.frames, statusMap); context.restore()
        } else { context.save(); context.globalAlpha = layer.opacity; drawWidget(context, layer, manager.frames, statusMap); context.restore() }
      }
      transition.draw(context, now)
    }
    if (now - lastReport > 1000) {
      lastReport = now
      void fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statuses }) }).catch(() => undefined)
      if (embed) parent.postMessage({ channel: 'rapidcast-widget', kind: 'statuses', statuses }, '*')
    }
    if (embed && now - lastHeartbeat > 500) { lastHeartbeat = now; parent.postMessage({ channel: 'rapidcast-widget', kind: 'heartbeat' }, '*') }
  }
  setTimeout(() => draw(performance.now()), 1000 / 30)
}
draw(performance.now())
window.addEventListener('pagehide', () => { events.close(); manager.close() })
