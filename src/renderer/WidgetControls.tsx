import { useState } from 'react'
import type { PageProps } from './types'
import type { ParamValue, Transition } from '../shared/widgets'
import { SCENES } from '../shared/scenes'
import { PanelTitle } from './components'

const example = `let api;
export default {
  meta: {
    name: 'Hello chat', description: 'A small canvas widget.',
    defaultSize: { w: 420, h: 120 },
    params: { title: { type: 'string', default: 'HELLO, CHAT!' } }
  },
  init(host) { api = host; },
  update(dt) {},
  draw(ctx, w, h) {
    ctx.fillStyle = '#18231b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#cbfa54'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText(api.params.title, 24, 72, w - 48);
  }
};`

export function TransitionControl(props: PageProps): React.JSX.Element {
  return <label className="transition-control">Scene transition <select aria-label="Scene transition" value={props.widgets.transition} disabled={props.busy}
    onChange={event => { void props.action('Changing transition', () => window.rapidcast.setTransition(event.target.value as Transition)) }}>
    <option value="cut">Cut</option><option value="fade">Fade · 450 ms</option><option value="swipe">Swipe · 450 ms</option>
  </select></label>
}

export function WidgetLibrary(props: PageProps): React.JSX.Element {
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<Record<string, ParamValue>>({})
  const [code, setCode] = useState(example)
  const [copied, setCopied] = useState('')
  const scene = props.state.activeScene
  const layers = props.engine.settings.scenes[scene].filter(layer => layer.kind === 'widget')
  const instance = props.widgets.instances.find(item => item.id === selected)
  const layer = layers.find(item => item.id === selected)
  const definition = props.widgets.definitions.find(item => item.id === layer?.source)
  const copy = (id: string): void => { void props.action('Copying OBS URL', () => window.rapidcast.copyOverlay(id)).then(ok => { if (ok) setCopied(id) }) }
  return <>
    <section className="panel"><PanelTitle title="Widget stage" detail="TRANSPARENT OVERLAY · LIVE RUNTIME" />
      <div className="overlay-preview"><iframe title="Live widget scene preview" src={`${props.widgets.baseUrl}/overlay/program`} sandbox="allow-scripts allow-same-origin" /></div>
      <div className="builder-footer"><span className="muted">{SCENES.find(item => item.id === scene)?.name} · simulator events appear here</span><TransitionControl {...props} /></div>
    </section>
    <section><PanelTitle title="Widget library" detail="ADD TO THE SELECTED SCENE" />
      <div className="widget-library">{props.widgets.definitions.map(item => <div className="widget-card" key={item.id}>
        <span>{item.builtin ? '✦' : '⌘'}</span><strong>{item.meta.name}</strong><p>{item.meta.description}</p>
        <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Adding widget', () => window.rapidcast.addWidget(item.id, scene)) }}>Add to {SCENES.find(s => s.id === scene)?.name} +</button>
      </div>)}</div>
    </section>
    <section className="panel"><PanelTitle title="Widgets in this scene" detail={`${layers.length} / 8`} />
      <div className="widget-instances">{layers.map(item => {
        const saved = props.widgets.instances.find(next => next.id === item.id)
        const status = props.widgets.statuses.find(next => next.id === item.id)
        return <div key={item.id} className={`widget-instance ${selected === item.id ? 'selected' : ''}`}>
          <button onClick={() => { setSelected(item.id); setDraft({ ...saved?.params }) }}><strong>{item.name}</strong><small>{saved?.disabled ? 'PAUSED' : status?.state.toUpperCase() ?? 'OPEN PREVIEW TO RUN'}{status?.state === 'ready' ? ` · ${status.renderMs.toFixed(1)} ms` : ''}</small></button>
          <button className="secondary" disabled={props.busy} onClick={() => copy(item.id)}>{copied === item.id ? 'Copied' : 'OBS URL'}</button>
        </div>
      })}</div>
      {!layers.length && <p className="muted">Add a widget from the library to this scene.</p>}
      {instance && definition && <div className="widget-inspector" key={instance.id}>
        <h3>{definition.meta.name}</h3>{instance.disabled && <p role="alert" className="warning-text">{instance.reason}</p>}
        {Object.entries(definition.meta.params).map(([name, schema]) => <label key={name}>{name}
          {schema.type === 'boolean' ? <input type="checkbox" checked={Boolean(draft[name])} onChange={e => setDraft({ ...draft, [name]: e.target.checked })} />
            : <input type={schema.type === 'number' ? 'number' : schema.type === 'color' ? 'color' : 'text'} value={String(draft[name] ?? schema.default)} min={schema.min} max={schema.max} maxLength={500}
              onChange={e => setDraft({ ...draft, [name]: schema.type === 'number' ? Number(e.target.value) : e.target.value })} />}
        </label>)}
        <div className="button-row"><button className="primary" disabled={props.busy} onClick={() => { void props.action('Applying widget parameters', () => window.rapidcast.configureWidget(instance.id, draft)) }}>Apply parameters</button>
          <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Restarting widget', () => window.rapidcast.restartWidget(instance.id)) }}>Restart</button>
          <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Removing widget', () => window.rapidcast.removeWidget(instance.id)).then(ok => { if (ok) setSelected('') }) }}>Remove</button></div>
        <p className="muted">Position, crop, opacity and layer order are editable in Live → Layers.</p>
      </div>}
    </section>
    <section className="panel"><PanelTitle title="Use in OBS" detail="WORKS WITHOUT THE RAPIDCAST ENCODER" />
      <p className="muted">Add a Browser source at 1920 × 1080, 30 fps. Keep RapidCast open. These transparent URLs contain widgets; add your game and camera in OBS.</p>
      {['program', ...SCENES.map(item => item.id)].map(id => <div className="overlay-url" key={id}><label>{id === 'program' ? 'Follow active scene' : SCENES.find(s => s.id === id)?.name}<input readOnly aria-label={`${id} OBS URL`} value={`${props.widgets.baseUrl}/overlay/${id}`} /></label><button className="secondary" onClick={() => copy(id)}>{copied === id ? 'Copied' : 'Copy'}</button></div>)}
      <p className="muted">Global scenes: Ctrl + Alt + F1/F2/F3/F4. {props.widgets.hotkeys.filter(item => !item.registered).map(item => `${item.accelerator} is unavailable. `).join('')}</p>
    </section>
    <details className="panel"><summary>Install a canvas widget from code</summary>
      <p className="muted">Default export: meta, init(api), update(dt), draw(ctx, w, h). API: on(type, handler), params, now(), random(), image(key). Images use avatar:user_id or emote:emote_id. Code is checked and runs in an isolated Worker with a deadline.</p>
      <textarea className="widget-code" aria-label="Widget source code" spellCheck={false} rows={18} value={code} onChange={event => setCode(event.target.value)} />
      <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Checking and installing widget', () => window.rapidcast.installWidget(code)) }}>Check and add to library</button>
    </details>
  </>
}
