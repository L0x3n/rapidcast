import { useEffect, useState } from 'react'
import { makeLayer, type Layer, type LayerKind } from '../../shared/engine'
import type { PageProps } from '../types'
import { PanelTitle } from '../components'

export function LayerControls(props: PageProps): React.JSX.Element {
  const [selected, setSelected] = useState('')
  const [kind, setKind] = useState<LayerKind>('display')
  const settings = props.engine.settings
  const scene = props.state.activeScene
  const layers = settings.scenes[scene]
  const persisted = layers.find(item => item.id === selected)
  const signature = JSON.stringify(persisted)
  const [layer, setLayer] = useState<Layer | null>(null)
  useEffect(() => { setLayer(persisted ? structuredClone(persisted) : null) }, [signature, selected, scene])
  const save = (next: Layer[]): Promise<boolean> => props.action('Updating scene layers', () => window.rapidcast.configureEngine({ ...settings, scenes: { ...settings.scenes, [scene]: next } }))
  const edit = (update: Partial<Layer>): void => { setLayer(current => current ? { ...current, ...update } : null) }
  const add = async (): Promise<void> => {
    const next = makeLayer(crypto.randomUUID(), kind)
    next.z = Math.min(100, Math.max(0, ...layers.map(item => item.z)) + 1)
    if (kind === 'image') {
      const result = await window.rapidcast.importImage()
      if (!result.id) { if (result.error) await props.action('Importing image', () => Promise.resolve({ ok: false, error: result.error! })); return }
      next.source = result.id
    }
    if (await save([...layers, next])) setSelected(next.id)
  }
  return <section className="panel layer-controls"><PanelTitle title="Scene layers" detail="1920 × 1080 CANVAS" />
    <div className="layer-add"><select aria-label="Layer type" value={kind} onChange={event => setKind(event.target.value as LayerKind)}><option value="display">Display or window</option><option value="camera">Camera</option><option value="image">Image</option><option value="text">Text</option><option value="color">Color</option></select><button className="secondary" disabled={props.busy || layers.length >= 24} onClick={() => { void add() }}>+ Add</button></div>
    <button className="text-button" disabled={props.busy} onClick={() => { void props.action('Finding displays and windows', () => window.rapidcast.refreshSources()) }}>↻ Refresh displays and windows</button>
    <div className="layer-list">{[...layers].sort((a, b) => b.z - a.z).map(item => <button key={item.id} className={selected === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)}><span>{item.visible ? '◉' : '○'} {item.name}</span><small>{item.kind.toUpperCase()} · Z {item.z}</small></button>)}</div>
    {layer && <div className="layer-editor" key={layer.id}><div className="field-grid"><label>Name<input defaultValue={layer.name} maxLength={100} onBlur={event => edit({ name: event.target.value })} /></label>
      {layer.kind === 'display' && <label>Capture source<select value={layer.source} onChange={event => edit({ source: event.target.value })}><option value="">Choose a display or window</option>{props.engine.sources.map(source => <option key={source.id} value={source.id}>{source.kind === 'screen' ? 'Display' : 'Window'}: {source.name}</option>)}</select></label>}
      {layer.kind === 'camera' && <label>Camera<select value={layer.source} onChange={event => edit({ source: event.target.value })}><option value="">Choose a camera</option><option value="default">Default camera</option>{props.engine.cameras.filter(camera => camera.id && camera.id !== 'default').map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>}
      {layer.kind === 'text' && <label>Text<input defaultValue={layer.text} maxLength={1000} onBlur={event => edit({ text: event.target.value })} /></label>}
      {(layer.kind === 'text' || layer.kind === 'color') && <label>Color<input type="color" value={layer.color} onChange={event => edit({ color: event.target.value })} /></label>}
    </div><div className="geometry-grid">{(['x', 'y', 'width', 'height', 'z', 'opacity'] as const).map(key => <label key={`${key}-${layer[key]}`}>{key}<input type="number" step={key === 'opacity' ? .1 : 1} defaultValue={layer[key]} onBlur={event => { const value = Number(event.target.value); if (value !== layer[key]) edit({ [key]: value }) }} /></label>)}</div>
      <div className="geometry-grid crop-grid">{(['left', 'top', 'right', 'bottom'] as const).map(key => <label key={`${key}-${layer.crop[key]}`}>Crop {key} %<input type="number" min={0} max={95} defaultValue={Math.round(layer.crop[key] * 100)} onBlur={event => edit({ crop: { ...layer.crop, [key]: Number(event.target.value) / 100 } })} /></label>)}</div>
      <div className="button-row"><button className="primary" disabled={props.busy} onClick={() => { void save(layers.map(item => item.id === layer.id ? layer : item)) }}>Apply layer</button><button className="secondary" disabled={props.busy} onClick={() => edit({ visible: !layer.visible })}>{layer.visible ? 'Hide layer' : 'Show layer'}</button><button className="text-button" disabled={props.busy} onClick={() => { void save(layers.filter(item => item.id !== layer.id)); setSelected('') }}>Remove layer</button></div><p className="output-note">Adjust the layer, then Apply. Changes affect the selected scene and ongoing output.</p></div>}
  </section>
}
