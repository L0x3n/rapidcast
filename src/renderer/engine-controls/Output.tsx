import { useState } from 'react'
import type { PageProps } from '../types'
import { PanelTitle } from '../components'

export function OutputControls(props: PageProps): React.JSX.Element {
  const [test, setTest] = useState(true)
  const { engine, action, busy } = props
  const active = Boolean(engine.mode) || engine.phase === 'starting' || engine.phase === 'stopping'
  return <section className="panel output-controls"><PanelTitle title="Streaming engine" detail={`BETA · ${engine.phase.toUpperCase()}`} />
    <p className={engine.phase === 'error' ? 'inline-error' : 'muted'} role="status">{engine.message}</p>
    <div className="button-row"><button className="secondary" disabled={busy || active} onClick={() => { void action('Starting compositor', () => window.rapidcast.startPreview()) }}>{engine.previewActive ? 'Preview running' : 'Start preview'}</button>
      <button className="secondary" disabled={busy || active || !engine.previewActive} onClick={() => { void action('Releasing devices', () => window.rapidcast.stopPreview()) }}>Release devices</button>
      {active ? <button className="danger" disabled={busy} onClick={() => { void action('Stopping output', () => window.rapidcast.stopOutput()) }}>■ Stop output</button> : <button className="secondary" disabled={busy} onClick={() => { void action('Starting recording', () => window.rapidcast.startOutput('record')) }}>● Record locally</button>}</div>
    <label className="toggle"><input type="checkbox" checked={test} disabled={active || busy} onChange={event => setTest(event.target.checked)} />Private Twitch bandwidth test</label>
    <button className={test ? 'primary full' : 'danger full'} disabled={busy || active || !props.state.twitch.account} onClick={() => { void action(test ? 'Starting bandwidth test' : 'Going live', () => window.rapidcast.startOutput(test ? 'test' : 'live')) }}>{test ? '↗ Start private bandwidth test' : '↗ Go Live on Twitch'}</button>
    <p className="output-note">{test ? 'Test output adds bandwidthtest=true to the host-held stream key and never goes public.' : 'Live output sends the selected scene and mixed audio to your Twitch channel.'}</p>
    {engine.recordingPath && <button className="text-button" onClick={() => { void action('Opening recordings', () => window.rapidcast.revealRecording()) }}>Open recording folder ↗</button>}
  </section>
}
export function EngineHealth({ engine }: Pick<PageProps, 'engine'>): React.JSX.Element {
  const previous = engine.mode === null && engine.encodedFrames > 0
  const metrics = [
    ['COMPOSITOR', engine.telemetry ? engine.telemetry.fps.toFixed(1) : '--', 'fps'],
    [previous ? 'LAST OUTPUT BITRATE' : 'OUTPUT BITRATE', engine.bitrateKbps === null ? '--' : Math.round(engine.bitrateKbps), 'kbps'],
    ['MISSED FRAME SLOTS', engine.telemetry ? `${engine.telemetry.dropPercent.toFixed(2)}%` : '--', ''],
    [previous ? 'LAST ENCODED FRAMES' : 'ENCODED FRAMES', engine.encodedFrames || '--', engine.encoder === 'h264_nvenc' ? 'NVENC' : engine.encoder === 'libx264' ? 'CPU' : '']
  ]
  return <section className="health-strip engine-health" aria-label="Stream health">{metrics.map(([name, value, unit]) => <div key={name}><span>{name}</span><strong>{value} <small>{unit}</small></strong></div>)}<p>{previous ? 'Encoder values describe the previous output. ' : ''}{!engine.previewActive ? 'Compositor stopped. ' : ''}Compositor: {engine.telemetry?.frames ?? 0} frames, {engine.telemetry?.dropped ?? 0} missed slots. Encoder: {engine.outputDropped} drops, {engine.outputDuplicated} duplicates. Input queue: {Math.round(engine.queueBytes / 1024)} KB.<br />{engine.bitrateKbps === null ? 'This muxer does not report a measured output bitrate. ' : ''}Target: {engine.settings.bitrate} kbps. Frame timing logs stay in your app data folder.</p></section>
}
export function OutputSettings(props: PageProps): React.JSX.Element {
  const { engine } = props
  const settings = engine.settings
  const change = (value: Partial<typeof settings>): void => { void props.action('Saving output settings', () => window.rapidcast.configureEngine({ ...settings, ...value })) }
  const locked = props.busy || Boolean(engine.mode)
  return <section className="panel"><PanelTitle title="Video output" detail={engine.nvenc === null ? 'CHECKING ENCODERS' : engine.nvenc ? 'NVENC AVAILABLE' : 'CPU ENCODER'} />
    <div className="field-grid"><label>Frame rate<select disabled={locked} value={settings.fps} onChange={event => change({ fps: Number(event.target.value) as 30 | 60 })}><option value={30}>1080p · 30 fps</option><option value={60}>1080p · 60 fps</option></select></label>
      <label>Bitrate (kbps)<input type="number" min={500} max={10000} step={100} defaultValue={settings.bitrate} disabled={locked} onBlur={event => { const bitrate = Number(event.target.value); if (bitrate !== settings.bitrate) change({ bitrate }) }} /></label>
      <label>Encoder<select value={settings.encoder} disabled={locked} onChange={event => change({ encoder: event.target.value as typeof settings.encoder })}><option value="auto">Auto: NVENC, then CPU</option><option value="nvenc">NVENC preferred</option><option value="x264">CPU: x264 veryfast</option></select></label></div>
    <label className="toggle"><input type="checkbox" checked={settings.recordWhileLive} disabled={locked} onChange={event => change({ recordWhileLive: event.target.checked })} />Also save MP4 while streaming</label><p className="muted">H.264, a keyframe every 2 seconds, AAC stereo at 160 kbps / 48 kHz. Complete the minimized/game acceptance test before relying on the beta engine.</p>
  </section>
}
