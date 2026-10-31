import type { PageProps } from '../types'
import type { AudioSettings } from '../../shared/engine'
import { PanelTitle } from '../components'
import { useEffect, useState } from 'react'

export function AudioControls(props: PageProps): React.JSX.Element {
  const audio = props.engine.settings.audio
  const [gains, setGains] = useState({ mic: audio.micGain, desktop: audio.desktopGain })
  useEffect(() => setGains({ mic: audio.micGain, desktop: audio.desktopGain }), [audio.micGain, audio.desktopGain])
  const change = (update: Partial<AudioSettings>): void => { void props.action('Updating audio mix', () => window.rapidcast.configureEngine({ ...props.engine.settings, audio: { ...audio, ...update } })) }
  return <section className="panel"><PanelTitle title="Audio mixer" detail="48 KHZ · NO LOCAL MONITOR" />
    <label>Microphone<select disabled={props.busy} value={audio.micId} onChange={event => change({ micId: event.target.value })}><option value="none">No microphone</option><option value="default">Default microphone</option>{props.engine.microphones.filter(device => device.id && device.id !== 'default').map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
    <label className="toggle"><input type="checkbox" checked={audio.desktop} disabled={props.busy} onChange={event => change({ desktop: event.target.checked })} />Capture Windows desktop audio</label>
    {(['mic', 'desktop'] as const).map(type => <div className="mixer-channel" key={type}><div><strong>{type === 'mic' ? 'Microphone' : 'Desktop'}</strong><button disabled={props.busy} className={audio[`${type}Muted`] ? 'muted-button' : 'text-button'} onClick={() => change({ [`${type}Muted`]: !audio[`${type}Muted`] })}>{audio[`${type}Muted`] ? 'Unmute' : 'Mute'}</button></div><meter min={0} max={1} value={props.engine.telemetry?.[`${type}Level`] ?? 0} aria-label={`${type} audio level`} /><label>Gain {gains[type].toFixed(1)}×<input type="range" min={0} max={2} step={.1} value={gains[type]} disabled={props.busy} onChange={event => setGains(current => ({ ...current, [type]: Number(event.target.value) }))} onPointerUp={() => { if (gains[type] !== audio[`${type}Gain`]) change({ [`${type}Gain`]: gains[type] }) }} onKeyUp={() => { if (gains[type] !== audio[`${type}Gain`]) change({ [`${type}Gain`]: gains[type] }) }} /></label></div>)}
    <p className="output-note">Start preview to list devices. Microphone and camera capture begin only after you select them. Desktop audio includes all system playback.</p>
  </section>
}
