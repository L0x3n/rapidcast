import { randomUUID } from 'node:crypto'
import type { EngineSettings } from '../../shared/engine'
import type { OverlayPack } from '../../shared/packs'
import { SCENES } from '../../shared/scenes'
import { portableLayer, validatePack } from '../../shared/pack-validation'
import { validParams, type WidgetDefinition, type WidgetInstance, type WidgetState } from '../../shared/widgets'
import type { PackMetadata } from '../../shared/packs'
import type { StreamTheme } from '../../shared/setup'
import type { WidgetStore } from '../widgets/store'
import { portableImage } from './images'

export async function exportLayout(settings: EngineSettings, widgets: WidgetState, theme: StreamTheme | null, metadata: PackMetadata, preview: string, image: (id: string) => Promise<string>): Promise<OverlayPack> {
  const pack: OverlayPack = { format: 'rapidcast-pack', version: 1, metadata, preview, theme, transition: widgets.transition, definitions: [], assets: [], scenes: { starting: [], live: [], brb: [], ending: [] } }
  const definitions = new Map<string, string>(); const assets = new Map<string, string>()
  for (const scene of SCENES) for (const [index, layer] of settings.scenes[scene.id].entries()) {
    const portable = portableLayer(layer, scene.id, index)
    if (layer.kind === 'widget') {
      const definition = widgets.definitions.find(d => d.id === layer.source); const instance = widgets.instances.find(i => i.id === layer.id)
      if (!definition || !instance) throw new Error('A placed widget is missing its code or parameters. Repair or remove it before exporting.')
      let id = definitions.get(definition.id)
      if (!id) { id = `definition-${definitions.size}`; definitions.set(definition.id, id); pack.definitions.push({ id, code: definition.code, credit: definition.credit ?? '' }) }
      portable.source = id; portable.params = validParams(definition.meta.params, instance.params)
    } else if (layer.kind === 'image') {
      let id = assets.get(layer.source)
      if (!id) { id = `image-${assets.size}`; assets.set(layer.source, id); pack.assets.push({ id, data: portableImage(await image(layer.source)) }) }
      portable.source = id
    }
    pack.scenes[scene.id].push(portable)
  }
  return validatePack(pack)
}
export function installLayout(pack: OverlayPack, current: EngineSettings, store: WidgetStore, assets: Map<string, string>): { settings: EngineSettings; definitions: WidgetDefinition[]; instances: WidgetInstance[] } {
  const definitions = [...store.definitions]; const ids = new Map<string, string>(); const instances: WidgetInstance[] = []
  for (const definition of pack.definitions) {
    let installed = definitions.find(d => d.code === definition.code && (d.credit ?? '') === definition.credit)
    if (!installed) { installed = { ...store.definition(`custom-${randomUUID()}`, definition.code), ...(definition.credit ? { credit: definition.credit } : {}) }; definitions.push(installed) }
    ids.set(definition.id, installed.id)
  }
  if (definitions.length > 64) throw new Error('This import would exceed the 64-widget library limit. Use a smaller pack.')
  const settings = structuredClone(current)
  for (const scene of SCENES) settings.scenes[scene.id] = pack.scenes[scene.id].map(layer => {
    const { params, ...copy } = structuredClone(layer)
    // Managed title/background IDs keep subsequent Setup style edits compatible.
    copy.id = layer.id === `${scene.id}-bg` || layer.id === `${scene.id}-title` ? layer.id : `pack-${randomUUID()}`
    if (layer.kind === 'widget') { copy.source = ids.get(layer.source)!; instances.push({ id: copy.id, params: params!, createdAt: Date.now(), disabled: false, reason: '' }) }
    if (layer.kind === 'image') { const image = assets.get(layer.source); if (!image) throw new Error('An embedded image was not staged. Retry the import.'); copy.source = image }
    return copy
  })
  return { settings, definitions, instances }
}
