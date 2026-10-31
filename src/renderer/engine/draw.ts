import type { Layer } from '../../shared/engine'
import type { Sources } from './sources'

export function drawProgram(ctx: CanvasRenderingContext2D, layers: Layer[], sources: Sources, test: boolean, now: number): void {
  ctx.fillStyle = '#090e0c'; ctx.fillRect(0, 0, 1920, 1080)
  for (const layer of [...layers].filter(layer => layer.visible).sort((a, b) => a.z - b.z)) {
    ctx.save(); ctx.globalAlpha = layer.opacity
    if (layer.kind === 'color') { ctx.fillStyle = layer.color; ctx.fillRect(layer.x, layer.y, layer.width, layer.height) }
    else if (layer.kind === 'text') {
      ctx.beginPath(); ctx.rect(layer.x, layer.y, layer.width, layer.height); ctx.clip()
      ctx.fillStyle = layer.color; ctx.font = `900 ${Math.min(140, layer.height * .75)}px 'Segoe UI', sans-serif`; ctx.textBaseline = 'middle'
      ctx.shadowColor = '#00000080'; ctx.shadowBlur = 20; ctx.fillText(layer.text, layer.x, layer.y + layer.height / 2, layer.width)
    } else {
      const image = layer.kind === 'image' ? sources.images.get(layer.source) : sources.videos.get(`${layer.kind}:${layer.source}`)?.frame
      if (image) {
        const width = image instanceof VideoFrame ? image.displayWidth : image.width
        const height = image instanceof VideoFrame ? image.displayHeight : image.height
        const crop = layer.crop
        ctx.drawImage(image, width * crop.left, height * crop.top, width * (1 - crop.left - crop.right), height * (1 - crop.top - crop.bottom), layer.x, layer.y, layer.width, layer.height)
      }
    }
    ctx.restore()
  }
  if (test) {
    ctx.fillStyle = now % 1000 < 80 ? '#ffffff' : '#000000'; ctx.fillRect(1800, 0, 100, 100)
    ctx.fillStyle = '#cbfa54'; ctx.fillRect((now / 10) % 1800, 850, 120, 120)
    ctx.fillStyle = '#ffffff'; ctx.font = '42px Consolas'; ctx.fillText(`SYNTHETIC ENGINE TEST ${Math.round(now)} ms`, 80, 100)
  }
}
