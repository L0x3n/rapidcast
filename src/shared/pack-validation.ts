import { record } from './events'
import { defaultEngineSettings, validateEngineSettings, type Layer } from './engine'
import { SCENES, type SceneId } from './scenes'
import { validateTheme } from './setup'
import { validCredit, validParams } from './widgets'
import { validateWidgetCode } from './widget-validation'
import { PACK_LIMIT, type OverlayPack, type PackLayer, type PackMetadata } from './packs'

function keys(value: unknown, allowed: string[]): Record<string, unknown> {
  const v = record(value)
  if (Object.keys(v).some(key => !allowed.includes(key))) throw new Error('This pack contains unsupported fields. Export it again with a compatible RapidCast version.')
  return v
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
function string(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || required && !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('Pack text is missing, too long or contains unsupported characters.')
  return value.trim()
}
export function packMetadata(input: unknown): PackMetadata {
  const v = keys(input, ['name', 'author', 'description', 'createdAt', 'appVersion'])
  const createdAt = string(v.createdAt, 30, true); const appVersion = string(v.appVersion, 30, true)
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt)) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(appVersion)) throw new Error('This pack has an invalid creation date or app version.')
  return { name: string(v.name, 80, true), author: string(v.author, 80), description: string(v.description, 1000), createdAt, appVersion }
}
export function pngData(value: unknown, preview = false): string {
  const max = preview ? 512 * 1024 : 2 * 1024 * 1024
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 + 22 || !/^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/.test(value)) throw new Error('Use an embedded PNG image, not a path, URL or SVG. Preview limit: 512 KB; image limit: 2 MB.')
  return value
}
export function validatePack(input: unknown): OverlayPack {
  const v = keys(input, ['format', 'version', 'metadata', 'preview', 'theme', 'transition', 'definitions', 'assets', 'scenes'])
  if (v.format !== 'rapidcast-pack' || v.version !== 1) throw new Error('This file is not a supported RapidCast pack (version 1).')
  if (!['cut', 'fade', 'swipe'].includes(String(v.transition)) || !Array.isArray(v.definitions) || v.definitions.length > 32 || !Array.isArray(v.assets) || v.assets.length > 16) throw new Error('A pack supports 32 widget definitions, 16 images and a cut/fade/swipe transition.')
  const definitions = v.definitions.map(raw => { const d = keys(raw, ['id', 'code', 'credit']); if (!id(d.id) || typeof d.code !== 'string' || d.credit !== '' && !validCredit(d.credit)) throw new Error('A widget definition has an invalid ID, code or credit.'); validateWidgetCode(d.code); return { id: d.id, code: d.code, credit: String(d.credit) } })
  const assets = v.assets.map(raw => { const a = keys(raw, ['id', 'data']); if (!id(a.id)) throw new Error('An embedded image has an invalid ID.'); return { id: a.id, data: pngData(a.data) } })
  if (new Set(definitions.map(d => d.id)).size !== definitions.length || new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Pack definition and image IDs must be unique.')
  const schemas = new Map(definitions.map(d => [d.id, validateWidgetCode(d.code).meta.params]))
  const scenes = keys(v.scenes, SCENES.map(s => s.id)); const normalized = {} as OverlayPack['scenes']; let widgets = 0
  const usedDefinitions = new Set<string>(); const usedImages = new Set<string>()
  for (const scene of SCENES) {
    const layers = scenes[scene.id]
    if (!Array.isArray(layers) || layers.length > 24) throw new Error('Include all four scenes, each with up to 24 layers.')
    normalized[scene.id] = layers.map(raw => {
      const l = keys(raw, ['id', 'name', 'kind', 'source', 'text', 'color', 'x', 'y', 'width', 'height', 'z', 'opacity', 'visible', 'crop', 'font', 'params'])
      keys(l.crop, ['left', 'right', 'top', 'bottom'])
      if (!id(l.id) || typeof l.source !== 'string') throw new Error('A scene layer has an invalid identity or reference.')
      if (l.kind === 'display' || l.kind === 'camera') { if (l.source || l.visible !== false) throw new Error('Capture layers must be unbound, hidden placeholders. Choose your own devices after installing.') }
      else if (l.kind === 'widget') { if (!schemas.has(l.source)) throw new Error('A widget layer references a missing definition.'); usedDefinitions.add(l.source); widgets++ }
      else if (l.kind === 'image') { if (!assets.some(a => a.id === l.source)) throw new Error('An image layer references a missing embedded image.'); usedImages.add(l.source) }
      else if (l.source !== '') throw new Error('Text and color layers cannot reference files or URLs.')
      if (l.kind !== 'widget' && l.params !== undefined) throw new Error('Only widget layers may contain parameters.')
      if (l.kind === 'widget') {
        const schema = schemas.get(l.source)!
        if (Object.keys(record(l.params)).some(key => !Object.hasOwn(schema, key))) throw new Error('A widget contains unknown parameters.')
        if (l.text !== '' && !validCredit(l.text)) throw new Error('Widget credits must use idea by @user, optionally marked TEST.')
      }
      const layer = structuredClone(l) as unknown as PackLayer
      if (l.kind === 'widget') layer.params = validParams(schemas.get(l.source)!, l.params)
      return layer
    })
    if (normalized[scene.id].filter(l => l.kind === 'widget').length > 8) throw new Error('Use at most eight widgets in each scene.')
  }
  if (widgets > 32 || usedDefinitions.size !== definitions.length || usedImages.size !== assets.length) throw new Error('Use at most 32 placed widgets and include only definitions/images used by a scene.')
  validateEngineSettings({ ...defaultEngineSettings(), scenes: normalized })
  if (v.theme !== null) { const t = keys(v.theme, ['name', 'background', 'accent', 'font', 'layout', 'titles']); keys(t.titles, SCENES.map(s => s.id)) }
  return { format: 'rapidcast-pack', version: 1, metadata: packMetadata(v.metadata), preview: pngData(v.preview, true), theme: v.theme === null ? null : validateTheme(v.theme), transition: v.transition as OverlayPack['transition'], definitions, assets, scenes: normalized }
}
export function parsePack(source: string): OverlayPack {
  if (new TextEncoder().encode(source).length > PACK_LIMIT) throw new Error('Choose a .rcpack file smaller than 16 MB.')
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error('This pack is not readable JSON. Ask its author to export it again.') }
  return validatePack(value)
}
export interface PackCase { definition: OverlayPack['definitions'][number]; params: NonNullable<PackLayer['params']>; width: number; height: number }
export function packCases(pack: OverlayPack): PackCase[] {
  const seen = new Set<string>(); const result: PackCase[] = []
  for (const scene of SCENES) for (const layer of pack.scenes[scene.id]) if (layer.kind === 'widget') {
    const definition = pack.definitions.find(d => d.id === layer.source)!; const params = layer.params!
    const key = JSON.stringify([definition.code, params, layer.width, layer.height])
    if (!seen.has(key)) { seen.add(key); result.push({ definition, params, width: layer.width, height: layer.height }) }
  }
  return result
}
export function portableLayer(layer: Layer, scene: SceneId, index: number): PackLayer {
  const capture = layer.kind === 'display' || layer.kind === 'camera'
  return { id: layer.id === `${scene}-bg` || layer.id === `${scene}-title` ? layer.id : `layer-${scene}-${index}`, name: capture ? `${layer.kind === 'camera' ? 'Camera' : 'Display / window'} placeholder` : layer.name,
    kind: layer.kind, source: '', text: capture ? '' : layer.kind === 'widget' ? validCredit(layer.text) ? layer.text : '' : layer.text, color: layer.color,
    x: layer.x, y: layer.y, width: layer.width, height: layer.height, z: layer.z, opacity: layer.opacity, visible: capture ? false : layer.visible,
    crop: { left: layer.crop.left, right: layer.crop.right, top: layer.crop.top, bottom: layer.crop.bottom }, ...(layer.font ? { font: layer.font } : {}) }
}
