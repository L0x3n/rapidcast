import './style.css'
import { WidgetManager } from './manager'
import type { OverlaySnapshot } from '../shared/widgets'

const canvas = document.querySelector('canvas')!
const context = canvas.getContext('2d')!
const manager = new WidgetManager(null)
const id = location.pathname.split('/').at(-1) || ''
let snapshot: OverlaySnapshot | null = null
let started = 0
let replayed = false
let result = false
function finish(ok: boolean, error: string, frames: number): void {
  if (result) return
  result = true; document.documentElement.dataset.result = JSON.stringify({ ok, error, frames })
}
function draw(now: number): void {
  if (snapshot) {
    manager.tick('live', snapshot, now)
    const status = manager.statuses()[0]
    if (status?.state === 'disabled') finish(false, status.reason, status.frames)
    else if (status?.state === 'ready') {
      if (!started) started = now
      if (!replayed && now - started > 1500) { replayed = true; for (const event of snapshot.events) manager.event({ ...event, id: `${event.id}-again`, receivedAt: Date.now() }) }
      if (now - started >= 3000) finish(status.frames >= 30, status.frames >= 30 ? '' : 'The test drew too few frames. Simplify the widget.', status.frames)
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    const frame = manager.frames.get(id)
    if (frame) context.drawImage(frame, 0, 0, canvas.width, canvas.height)
  }
  setTimeout(() => draw(performance.now()), 1000 / 30)
}
void fetch(`/api/test/${id}`).then(async response => {
  if (!response.ok) throw new Error('The preview expired. Generate a widget again.')
  snapshot = await response.json() as OverlaySnapshot
  const layer = snapshot.scenes.live[0]!
  canvas.width = layer.width; canvas.height = layer.height
  manager.configure(snapshot); draw(performance.now())
}).catch(() => finish(false, 'The generated widget preview could not load. Generate again.', 0))
window.addEventListener('pagehide', () => manager.close())
