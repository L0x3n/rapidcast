import type { Layer } from '../../shared/engine'
import type { WidgetStatus } from '../../shared/widgets'

export function drawWidget(ctx: CanvasRenderingContext2D, layer: Layer, frames: Map<string, ImageBitmap>, statuses: Map<string, WidgetStatus>): void {
  const status = statuses.get(layer.id)
  if (status?.state === 'disabled') {
    ctx.save(); ctx.fillStyle = '#501f25e8'; ctx.beginPath(); ctx.roundRect(layer.x, layer.y, Math.min(layer.width, 300), 46, 8); ctx.fill()
    ctx.fillStyle = '#ffbaa5'; ctx.font = '700 16px sans-serif'; ctx.fillText('WIDGET PAUSED · CHECK STUDIO', layer.x + 14, layer.y + 29, Math.min(layer.width, 300) - 28); ctx.restore()
    return
  }
  const frame = frames.get(layer.id)
  if (!frame) return
  const crop = layer.crop
  ctx.drawImage(frame, frame.width * crop.left, frame.height * crop.top, frame.width * (1 - crop.left - crop.right), frame.height * (1 - crop.top - crop.bottom), layer.x, layer.y, layer.width, layer.height)
}
