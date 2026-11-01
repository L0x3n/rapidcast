import { SCENES } from '../../shared/scenes'
import type { EngineSettings } from '../../shared/engine'
import type { PackReview } from '../../shared/packs'

export function layoutThumbnail(settings: EngineSettings): string {
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, 960, 540)
  for (const [index, scene] of SCENES.entries()) {
    const x = index % 2 * 480 + 10; const y = Math.floor(index / 2) * 270 + 26
    ctx.save(); ctx.translate(x, y); ctx.scale(460 / 1920, 230 / 1080); ctx.fillStyle = '#15202b'; ctx.fillRect(0, 0, 1920, 1080)
    ctx.beginPath(); ctx.rect(0, 0, 1920, 1080); ctx.clip()
    for (const layer of [...settings.scenes[scene.id]].sort((a, b) => a.z - b.z)) {
      if (!layer.visible) continue
      ctx.save(); ctx.globalAlpha = layer.opacity
      if (layer.kind === 'color') { ctx.fillStyle = layer.color; ctx.fillRect(layer.x, layer.y, layer.width, layer.height) }
      else if (layer.kind === 'text') { ctx.fillStyle = layer.color; ctx.font = `bold ${Math.min(90, layer.height * .6)}px ${layer.font ?? 'Segoe UI'}`; ctx.fillText(layer.text.slice(0, 80), layer.x, layer.y + layer.height * .6, layer.width) }
      else { ctx.fillStyle = '#193344'; ctx.fillRect(layer.x, layer.y, layer.width, layer.height); ctx.strokeStyle = '#6f879b'; ctx.lineWidth = 4; ctx.strokeRect(layer.x, layer.y, layer.width, layer.height); ctx.fillStyle = '#d4e8f7'; ctx.font = 'bold 40px Segoe UI'; ctx.fillText(layer.kind === 'widget' ? layer.name.slice(0, 35) : layer.kind === 'image' ? 'IMAGE' : 'CAPTURE PLACEHOLDER', layer.x + 12, layer.y + Math.min(60, layer.height / 2), Math.max(1, layer.width - 24)) }
      ctx.restore()
    }
    ctx.restore(); ctx.fillStyle = '#cbfa54'; ctx.font = 'bold 12px Segoe UI'; ctx.fillText(scene.name.toUpperCase(), x, y - 8)
  }
  return canvas.toDataURL('image/png')
}
export function PackScenePreview({ review }: { review: PackReview }): React.JSX.Element {
  return <div className="pack-scenes">{SCENES.map(scene => <div key={scene.id}><span>{scene.name}</span><svg viewBox="0 0 1920 1080" role="img" aria-label={`${scene.name} imported layer layout`}>
    <rect width="1920" height="1080" fill="#15202b" />
    {[...review.scenes[scene.id]].sort((a, b) => a.z - b.z).filter(l => l.visible || l.kind === 'display' || l.kind === 'camera').map(l => <g key={l.id} opacity={l.visible ? l.opacity : .45}>
      {l.kind === 'text' ? <text x={l.x} y={l.y + l.height * .6} fill={l.color} fontSize={Math.min(90, l.height * .6)} fontFamily={l.font ?? 'Segoe UI'}>{l.text.slice(0, 55)}</text> : <><rect x={l.x} y={l.y} width={l.width} height={l.height} fill={l.kind === 'color' ? l.color : '#193344'} stroke={l.kind === 'color' ? 'none' : '#6f879b'} strokeWidth="4" />{l.kind !== 'color' && <text x={l.x + 12} y={l.y + Math.min(60, l.height / 2)} fill="#d4e8f7" fontSize="40">{l.kind === 'widget' ? l.name.slice(0, 30) : l.kind === 'image' ? 'EMBEDDED IMAGE' : 'BIND YOUR CAPTURE'}</text>}</>}
    </g>)}
  </svg></div>)}</div>
}
