import type { PageProps } from '../types'
import { PanelTitle } from '../components'

export function SetupRepair(props: PageProps): React.JSX.Element {
  return <section className="panel"><PanelTitle title="Repair setup" /><p className="muted">Recheck encryption, encoder, device choices and overlay. Revalidate a saved Twitch login and test the configured AI model, if present. AI checks may use provider credits. Existing layers and credentials are kept; the short performance test must be run again.</p>
    <button className="secondary full" disabled={props.busy || Boolean(props.engine.mode)} onClick={() => { void props.action('Starting setup checks', () => window.rapidcast.repairSetup()).then(async ok => { if (ok) { await props.action('Opening readiness', () => window.rapidcast.setupStep(5, props.setup.goal)); props.go('setup') } }) }}>↻ Recheck setup</button></section>
}
