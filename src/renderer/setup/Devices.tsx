import { useEffect, useRef, useState } from 'react'
import type { PageProps } from '../types'
import { PanelTitle, ProgramPreview } from '../components'
import { AudioControls } from '../engine-controls/Audio'
import { audioSignature, visualSignature } from '../../shared/setup'

export function UserChecks(props: PageProps): React.JSX.Element {
  const toggle = (kind: 'visual' | 'audio', checked: boolean): void => { void props.action('Saving your check', () => window.rapidcast.confirmSetup(kind, checked)) }
  return <div className="setup-confirmations"><label className="toggle"><input aria-label="Picture checked" type="checkbox" checked={props.setup.visualSignature === visualSignature(props.engine.settings)} disabled={props.busy || !props.engine.previewActive} onChange={event => toggle('visual', event.target.checked)} />I checked the picture and selected sources.</label>
    <label className="toggle"><input aria-label="Audio checked" type="checkbox" checked={props.setup.audioSignature === audioSignature(props.engine.settings)} disabled={props.busy || !props.engine.previewActive} onChange={event => toggle('audio', event.target.checked)} />I checked audio meters and playback, or chose no audio.</label></div>
}
export function DeviceStep(props: PageProps): React.JSX.Element {
  const discovered = useRef(false)
  useEffect(() => { if (!discovered.current && !props.engine.mode) { discovered.current = true; void props.action('Finding device choices', () => window.rapidcast.discoverSetupDevices()) } }, [])
  const live = props.engine.settings.scenes.live
  const [displayId, setDisplay] = useState(live.find(layer => layer.kind === 'display')?.source || 'none')
  const [cameraId, setCamera] = useState(live.find(layer => layer.kind === 'camera')?.source || 'none')
  const [micId, setMic] = useState(props.engine.settings.audio.micId)
  const [desktop, setDesktop] = useState(props.engine.settings.audio.desktop)
  return <>
    <section className="panel"><PanelTitle title="Choose what becomes your show" detail="DEVICES" />
      <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Discovering devices', () => window.rapidcast.discoverSetupDevices()) }}>Find / refresh my devices</button>
      <p className="muted">Discovery lists choices without opening camera/microphone capture. Select devices, then Apply. A widgets-only show can leave all devices off.</p>
      <div className="ai-fields"><label>Display or window<select aria-label="Setup display" value={displayId} onChange={event => setDisplay(event.target.value)}><option value="none">None: widgets only</option>{props.engine.sources.map(item => <option key={item.id} value={item.id}>{item.kind}: {item.name}</option>)}</select></label>
        <label>Camera<select aria-label="Setup camera" value={cameraId} onChange={event => setCamera(event.target.value)}><option value="none">No camera</option><option value="default">Default camera</option>{props.engine.cameras.filter(item => item.id && item.id !== 'default').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Microphone<select aria-label="Setup microphone" value={micId} onChange={event => setMic(event.target.value)}><option value="none">No microphone</option><option value="default">Default microphone</option>{props.engine.microphones.filter(item => item.id && item.id !== 'default').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="toggle"><input type="checkbox" checked={desktop} onChange={event => setDesktop(event.target.checked)} />Include all Windows playback audio</label></div>
      <p className="muted">Apply replaces display/camera choices in Live and updates the audio mix. Other layer types and the other three scenes are kept. Hardware capture begins now only if selected.</p>
      <button className="primary" disabled={props.busy || Boolean(props.engine.mode)} onClick={() => { void props.action('Applying device choices', () => window.rapidcast.applySetupDevices({ displayId, cameraId, micId, desktop })) }}>Apply devices and start preview</button>
    </section>
    <section className="panel"><PanelTitle title="Check your program" detail="ACTUAL PREVIEW WHEN RUNNING" /><ProgramPreview state={props.state} engine={props.engine} /><UserChecks {...props} /></section>
    <AudioControls {...props} />
  </>
}
