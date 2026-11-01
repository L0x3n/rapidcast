import type { PageProps } from '../types'
import { PanelTitle } from '../components'
import { OutputSettings } from '../engine-controls/Output'

export function PerformanceStep(props: PageProps): React.JSX.Element {
  const result = props.setup.benchmark; const recommendation = props.setup.recommendation
  const running = ['starting', 'testing', 'stopping'].includes(props.setup.task.phase)
  return <>
    <section className="panel"><PanelTitle title="Find a stable starting point" detail={props.engine.nvenc === null ? 'PROBING ENCODER' : props.engine.nvenc ? 'NVENC AVAILABLE' : 'CPU ENCODER'} />
      <p className="muted">Select the Live scene first. The test encodes that program and selected audio for 15 seconds after startup, then stops automatically. Minimize RapidCast or put your game in focus while it runs.</p><button className="text-button" disabled={props.busy || running} onClick={() => { void props.action('Selecting the test scene', () => window.rapidcast.selectScene('live')) }}>Use Live scene for test</button>
      <p className="muted">A local test checks encoding. The private Twitch test checks the sender while using bandwidthtest=true; review actual delivery in Twitch Inspector. Neither measures maximum upload speed.</p>
      <div className="button-row wrap"><button className="secondary" disabled={props.busy || running || Boolean(props.engine.mode)} onClick={() => { void props.action('Starting local setup test', () => window.rapidcast.testSetup('local')) }}>15s local encoder test</button>
        <button className="primary" disabled={props.busy || running || Boolean(props.engine.mode) || props.state.twitch.phase !== 'connected'} onClick={() => { void props.action('Starting private setup test', () => window.rapidcast.testSetup('twitch')) }}>15s private Twitch test</button>
        {running && <button className="danger" disabled={props.busy} onClick={() => { void props.action('Cancelling setup test', () => window.rapidcast.cancelSetup()) }}>Cancel test</button>}</div>
      {running && <div className="test-progress"><progress max={15} value={props.setup.task.seconds} /><span>{props.setup.task.seconds} / 15 seconds</span></div>}
      {result && <div className="test-result"><strong>{result.stable ? 'Short test stable' : 'Retest needed'} · {result.kind === 'local' ? 'LOCAL ONLY' : 'PRIVATE SENDER'}</strong><p>{result.profile.resolution} / {result.profile.fps} fps / {result.profile.bitrate} kbps target / {result.encoder}</p><dl className="settings-values"><div><dt>Measured frame cadence</dt><dd>{result.fps.toFixed(2)} fps</dd></div><div><dt>Missed compositor slots</dt><dd>{result.missedPercent.toFixed(2)}%</dd></div><div><dt>Encoded frames in sample</dt><dd>{result.encodedFrames}</dd></div><div><dt>Encoder drops / output issues</dt><dd>{result.encoderDrops} / {result.outputIssues}</dd></div><div><dt>Peak input queue</dt><dd>{Math.round(result.queuePeak / 1024)} KB</dd></div></dl>
        <p className="muted">{result.duration.toFixed(1)} seconds. Encoder drops, compositor misses and network delivery are separate. Remote ingestion loss is not measured here.</p></div>}
      {recommendation && <div className="recommendation"><h3>{recommendation.resolution} · {recommendation.fps} fps · {recommendation.bitrate} kbps</h3><p>{recommendation.reason}</p><button className="primary" disabled={props.busy || running || Boolean(props.engine.mode)} onClick={() => { void props.action('Applying output recommendation', () => window.rapidcast.applySetupRecommendation()) }}>Apply recommendation</button></div>}
      {result?.kind === 'twitch' && <InspectorCheck {...props} />}
      {props.engine.recordingPath && <button className="text-button" onClick={() => { void props.action('Opening test recordings', () => window.rapidcast.revealRecording()) }}>Open test recording folder ↗</button>}
    </section><OutputSettings {...props} />
  </>
}
export function InspectorCheck(props: PageProps): React.JSX.Element {
  return <div className="setup-confirmations"><button className="secondary" onClick={() => { void props.action('Opening Twitch Inspector', () => window.rapidcast.openTwitchInspector()) }}>Open Twitch Inspector ↗</button><label className="toggle"><input aria-label="Inspector reviewed" type="checkbox" disabled={props.busy || props.setup.benchmark?.kind !== 'twitch'} checked={Boolean(props.setup.benchmark && props.setup.inspectorId === props.setup.benchmark.id)} onChange={event => { void props.action('Saving Inspector review', () => window.rapidcast.confirmSetup('inspector', event.target.checked)) }} />I reviewed this private test in Inspector and checked its delivery.</label></div>
}
