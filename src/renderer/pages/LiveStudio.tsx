import type { PageProps } from '../types'
import { Chat, EventFeed, PanelTitle, ProgramPreview, SceneSwitcher, Simulator } from '../components'
import { EngineHealth, OutputControls } from '../engine-controls/Output'
import { LayerControls } from '../engine-controls/Layers'
import { AudioControls } from '../engine-controls/Audio'
import { TransitionControl, WidgetLibrary } from '../WidgetControls'
import { AiBuilder, SuggestionQueue } from '../AiStudio'
import { PacksPanel } from '../packs/PacksPanel'

export function LivePage(props: PageProps): React.JSX.Element {
  const { state } = props
  return <div data-page="live" className="live-layout">
    <div className="main-column">
      <EngineHealth engine={props.engine} />
      <section className="panel program-panel"><PanelTitle title="Program" detail={`1920 × 1080 / ${props.engine.previewActive ? 'COMPOSITOR' : 'LAYOUT PREVIEW'}`} /><ProgramPreview state={state} engine={props.engine} />
        <div className="program-toolbar"><span><i className="dot" />{props.engine.phase.toUpperCase()} · ENGINE BETA</span><button className="secondary" disabled={props.busy || props.engine.previewActive} onClick={() => { void props.action('Starting program', () => window.rapidcast.startPreview()) }}>Start preview ↗</button></div>
      </section>
      <section className="scenes-section"><PanelTitle title="Your scenes" detail="CTRL + ALT + F1–F4" /><SceneSwitcher {...props} /><TransitionControl {...props} /></section>
      <LayerControls {...props} />
    </div>
    <div className="side-column"><Chat {...props} /><OutputControls {...props} /><AudioControls {...props} /><section className="panel"><PanelTitle title="Activity feed" detail="LIVE + TEST" /><EventFeed events={state.events} compact /></section>
      <button className="secondary full" onClick={() => props.go('studio')}>✦ Open event simulator</button>
    </div>
  </div>
}

export function StudioPage(props: PageProps): React.JSX.Element {
  return <div data-page="studio" className="studio-layout"><div className="main-column">
    <AiBuilder {...props} />
    <PacksPanel {...props} />
    <SceneSwitcher {...props} /><WidgetLibrary {...props} />
  </div><div className="side-column"><SuggestionQueue {...props} /><Simulator {...props} /><section className="panel"><PanelTitle title="Test events" /><EventFeed events={props.state.events.filter(e => e.source === 'simulator')} compact /></section></div></div>
}
