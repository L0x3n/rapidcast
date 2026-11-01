import { makeLayer, type EngineSettings } from '../../shared/engine'
import { SCENES } from '../../shared/scenes'
import type { StreamTheme } from '../../shared/setup'

export function themedScenes(settings: EngineSettings, theme: StreamTheme): EngineSettings {
  const next = structuredClone(settings)
  for (const scene of SCENES) {
    let bg = next.scenes[scene.id].find(layer => layer.id === `${scene.id}-bg`)
    if (!bg) { bg = { ...makeLayer(`${scene.id}-bg`, 'color'), z: -100 }; next.scenes[scene.id].push(bg) }
    bg.color = theme.background
    let title = next.scenes[scene.id].find(layer => layer.id === `${scene.id}-title`)
    if (!title) { title = { ...makeLayer(`${scene.id}-title`, 'text'), x: 110, y: scene.id === 'starting' || scene.id === 'ending' ? 120 : 440, width: 1700, height: 180 }; next.scenes[scene.id].push(title) }
    title.color = theme.accent; title.font = theme.font; title.text = theme.titles[scene.id]
  }
  const right = theme.layout === 'chat-right'
  for (const layer of next.scenes.live) {
    if (layer.kind === 'camera') { layer.x = right ? 40 : 1400; layer.y = 770; layer.width = 480; layer.height = 270 }
    if (layer.source === 'builtin-chat') { layer.x = right ? 1420 : 40; layer.y = 240; layer.width = 460; layer.height = 640 }
    if (layer.source === 'builtin-goal') { layer.x = right ? 1260 : 40; layer.y = 900; layer.width = 620; layer.height = 150 }
    if (layer.source === 'builtin-ticker') { layer.x = right ? 550 : 670; layer.y = 970; layer.width = 700; layer.height = 96 }
  }
  return next
}
