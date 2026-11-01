import { useState } from 'react'
import type { PageProps } from '../types'
import { SETUP_STEPS } from '../../shared/setup'
import { PanelTitle, ProgramPreview } from '../components'
import { TwitchConnection } from '../pages/AccountPages'
import { DeviceStep, UserChecks } from './Devices'
import { InspectorCheck, PerformanceStep } from './Performance'
import { StyleStep } from './Style'
import { SetupRepair } from './Repair'

const activePhases = ['discovering', 'starting', 'testing', 'stopping', 'styling', 'repairing']
export function SetupWizard(props: PageProps): React.JSX.Element {
  const { step, goal, task } = props.setup
  const [clientId, setClientId] = useState(props.state.twitch.clientId)
  const active = activePhases.includes(task.phase)
  const go = (next: number): void => { void props.action('Saving setup progress', () => window.rapidcast.setupStep(next, goal)) }
  const ready = props.setup.checks.every(item => !item.required || item.state === 'pass') && !active && !props.engine.mode
  return <div data-page="setup" data-setup-step={step} className="setup-wizard">
    <nav className="setup-steps" aria-label="Setup steps">{SETUP_STEPS.map((name, index) => <button data-step={index} key={name} disabled={props.busy || active} className={step === index ? 'active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}><span>{index + 1}</span>{name}</button>)}</nav>
    <div className="setup-task" role="status"><strong>{task.phase.toUpperCase()}</strong><span>{task.message}</span>{active && <button className="text-button" disabled={props.busy} onClick={() => { void props.action('Cancelling setup task', () => window.rapidcast.cancelSetup()) }}>Cancel task</button>}</div>
    <div className="setup-layout"><div className="main-column">
      {step === 0 && <section className="panel setup-welcome"><span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span><h2>Less setup. More show.</h2><p>Six steps to connect your channel, choose sources, check performance and make the stage yours. Aim for five minutes; real logins and device checks depend on your machine.</p><div className="setup-goals"><button className={goal === 'twitch' ? 'primary' : 'secondary'} disabled={props.busy} onClick={() => { void props.action('Choosing Twitch setup', () => window.rapidcast.setupStep(1, 'twitch')) }}>Set up my Twitch stream ↗</button><button className={goal === 'local' ? 'primary' : 'secondary'} disabled={props.busy} onClick={() => { void props.action('Choosing local setup', () => window.rapidcast.setupStep(1, 'local')) }}>Set up local recording</button></div><p className="muted">Local setup needs no Twitch or AI account. The engine remains beta; Studio also provides transparent OBS browser sources.</p></section>}
      {step === 1 && <>
        {!props.state.twitch.clientId && <section className="panel"><PanelTitle title="Public Twitch application ID" /><p className="muted">Enter the public Client ID of a Twitch Public application. No client secret or stream key is needed.</p><form onSubmit={event => { event.preventDefault(); void props.action('Saving public Client ID', () => window.rapidcast.saveClientId(clientId)) }}><label>Public Client ID<input aria-label="Setup Twitch Client ID" value={clientId} maxLength={128} autoComplete="off" onChange={event => setClientId(event.target.value)} /></label><button className="primary" disabled={props.busy || !clientId.trim()}>Save Client ID</button></form></section>}
        <TwitchConnection {...props} />{goal === 'local' ? <div className="notice">Local recording selected. You may continue without connecting Twitch; this will not mark Twitch or internet delivery as verified.</div> : <button className="text-button" disabled={props.busy} onClick={() => { void props.action('Continuing locally', () => window.rapidcast.setupStep(2, 'local')) }}>Continue with local recording instead</button>}
      </>}
      {step === 2 && <DeviceStep {...props} />}
      {step === 3 && <PerformanceStep {...props} />}
      {step === 4 && <StyleStep {...props} />}
      {step === 5 && <>
        <section className="panel"><PanelTitle title={goal === 'twitch' ? 'Ready to broadcast?' : 'Ready to record?'} detail={props.setup.completed ? 'SETUP SAVED' : 'READINESS'} /><div className="checklist">{props.setup.checks.map(item => <div key={item.id} className={`check-row ${item.state === 'pass' ? 'ready' : ''}`}><span>{item.state === 'pass' ? '✓' : item.state === 'info' ? 'i' : '○'}</span><div><strong>{item.title}{!item.required && item.state !== 'pass' ? ' · INFO' : ''}</strong><p>{item.detail}</p></div></div>)}</div>
          <UserChecks {...props} />{goal === 'twitch' && <InspectorCheck {...props} />}
          {props.state.activeScene !== 'live' && <button className="secondary" disabled={props.busy || active} onClick={() => { void props.action('Opening the source-check scene', () => window.rapidcast.selectScene('live')) }}>Select Live to check capture tracks</button>}
          <div className="button-row wrap"><button className="secondary" disabled={props.busy || !ready} onClick={() => { void props.action('Saving completed setup', () => window.rapidcast.finishSetup(false)) }}>Save setup</button><button className={goal === 'twitch' ? 'danger' : 'primary'} disabled={props.busy || !ready} onClick={() => { void props.action(goal === 'twitch' ? 'Going live on Twitch' : 'Starting local recording', () => window.rapidcast.finishSetup(true)).then(ok => { if (ok) props.go('live') }) }}>{goal === 'twitch' ? '● Go Live on Twitch (public)' : '● Start local recording'}</button></div>
          <p className="muted">{goal === 'twitch' ? 'Go Live sends your actual selected program and mixed audio to your channel publicly.' : 'Local recording writes your selected program/audio to an MP4. No Twitch output is started.'}</p>
        </section><section className="panel"><PanelTitle title="Final program check" /><ProgramPreview state={props.state} engine={props.engine} /></section>
        {props.setup.diagnostics.length > 0 && <section className="panel"><PanelTitle title="Repair results" />{props.setup.diagnostics.map(item => <div className="check-row" key={item.id}><span>{item.state === 'pass' ? '✓' : '○'}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</section>}
      </>}
      <div className="wizard-footer"><button className="secondary" disabled={props.busy || active || step === 0} onClick={() => go(step - 1)}>← Back</button>{step < 5 && <button className="primary" disabled={props.busy || active || step === 1 && goal === 'twitch' && props.state.twitch.phase !== 'connected'} onClick={() => go(step + 1)}>Continue →</button>}</div>
    </div><aside className="side-column"><section className="panel"><PanelTitle title="Your setup path" detail={goal.toUpperCase()} /><p>{goal === 'twitch' ? 'Connect → choose devices → private test → style → review → public Go Live.' : 'Choose devices → local encoder test → style → review → record.'}</p><p className="muted">Progress is saved locally. Required checks run again against current sources/settings, and short performance results expire after 30 minutes.</p><button className="text-button" disabled={props.busy || active} onClick={() => { void props.action('Changing setup path', () => window.rapidcast.setupStep(step, goal === 'twitch' ? 'local' : 'twitch')) }}>Switch to {goal === 'twitch' ? 'local recording' : 'Twitch'} setup</button></section>
      <SetupRepair {...props} /><button className="secondary" onClick={() => props.go('studio')}>Open widgets and OBS URLs ↗</button>
    </aside></div>
  </div>
}
