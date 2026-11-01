import { useEffect, useState } from 'react'
import type { PageProps } from '../types'
import { PanelTitle } from '../components'
import { OutputSettings } from '../engine-controls/Output'
import { AiSettingsPanel } from '../AiSettings'
import { SetupRepair } from '../setup/Repair'

export function TwitchConnection(props: PageProps): React.JSX.Element {
  const { twitch } = props.state
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!twitch.device) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [twitch.device])
  const waiting = twitch.phase === 'waiting' || twitch.phase === 'requesting'
  return <section className="panel twitch-connection"><PanelTitle title="Your Twitch connection" detail={twitch.phase.toUpperCase()} />
    <div className="account-card"><div className="account-avatar">{twitch.account?.name.slice(0, 1).toUpperCase() || '↗'}</div><div><h3>{twitch.account?.name || 'Bring your people along.'}</h3><p>{twitch.account ? `@${twitch.account.login} · ${twitch.account.broadcasterType || 'Standard account'}` : 'Connect your own channel. No stream key to copy.'}</p></div></div>
    <p className={twitch.phase === 'error' ? 'inline-error' : 'muted'} role="status">{twitch.message}</p>
    {twitch.device && <div className="device-login"><span className="mono">ENTER THIS CODE ON TWITCH</span><strong aria-label="Twitch activation code">{twitch.device.userCode}</strong><p>Expires in {Math.max(0, Math.ceil((twitch.device.expiresAt - now) / 60000))} min. Finish the login in your browser.</p><button className="primary" disabled={props.busy} onClick={() => { void props.action('Opening Twitch', () => window.rapidcast.openTwitchLogin()) }}>Open Twitch in browser ↗</button></div>}
    {!twitch.clientId && <div className="notice">A public Twitch Client ID is needed first. Add yours in Settings.<button className="text-button" onClick={() => props.go('settings')}>Open Settings ↗</button></div>}
    <div className="button-row">{!twitch.account && !waiting && <button className="primary" disabled={props.busy || !twitch.clientId || !props.info.secureStorageAvailable} onClick={() => { void props.action('Requesting login', () => window.rapidcast.connectTwitch()) }}>Connect Twitch ↗</button>}
      {twitch.account && <button className="secondary" disabled={props.busy} onClick={() => { void props.action('Reconnecting Twitch', () => window.rapidcast.retryTwitch()) }}>Reconnect events</button>}
      {(twitch.account || waiting || twitch.phase === 'error') && <button className="text-button" disabled={props.busy} onClick={() => { void props.action('Disconnecting Twitch', () => window.rapidcast.disconnectTwitch()) }}>{waiting ? 'Cancel login' : 'Disconnect'}</button>}</div>
    {!props.info.secureStorageAvailable && <p className="inline-error">Windows secure storage is unavailable. Restart Windows before connecting Twitch.</p>}
  </section>
}

export function SettingsPage(props: PageProps): React.JSX.Element {
  const [clientId, setClientId] = useState(props.state.twitch.clientId)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setClientId(props.state.twitch.clientId) }, [props.state.twitch.clientId])
  return <div data-page="settings" className="settings-layout"><div className="main-column"><AiSettingsPanel {...props} /><section className="panel"><PanelTitle title="Twitch application" detail="PUBLIC CLIENT" />
    <p className="muted">Use a Twitch application registered with Client Type set to Public. No client secret is needed.</p>
    <form onSubmit={event => { event.preventDefault(); void props.action('Saving Client ID', () => window.rapidcast.saveClientId(clientId)).then(setSaved) }}>
      <label>Public Client ID<input placeholder="Paste your public Twitch Client ID" autoComplete="off" spellCheck={false} maxLength={128} value={clientId} onChange={event => { setClientId(event.target.value); setSaved(false) }} /></label>
      <div className="form-footer"><span>{saved ? 'Client ID saved.' : 'This ID is public. Never paste a client secret or token here.'}</span><button className="primary" disabled={props.busy}>Save Client ID</button></div>
    </form></section><TwitchConnection {...props} />
    <section className="panel"><PanelTitle title="Event subscriptions" detail={`${props.state.twitch.subscriptions.filter(s => s.status === 'enabled').length} ACTIVE`} />
      {!props.state.twitch.subscriptions.length ? <p className="muted">Connect Twitch to see which events your channel can receive.</p> : <div className="subscriptions">{props.state.twitch.subscriptions.map(subscription => <div key={subscription.type}><div><strong>{subscription.type.replace('channel.channel_points_custom_reward_redemption.add', 'channel.point_redemption')}</strong><p>{subscription.detail}</p></div><span className={`subscription-status ${subscription.status}`}>{subscription.status.toUpperCase()}</span></div>)}</div>}
    </section></div><div className="side-column"><section className="panel"><PanelTitle title="Your AI workspace" /><p className="muted">{props.ai.settings.model || 'No model selected'}</p><p className="muted">Generate widgets or review viewer ideas in Studio. Every build passes the same isolated test before publishing.</p><button className="secondary" onClick={() => props.go('studio')}>Open AI Studio ↗</button></section>
    <OutputSettings {...props} />
    <SetupRepair {...props} />
    <section className="panel"><PanelTitle title="Devices & hotkeys" /><p className="muted">Capture sources and the audio mixer are in Live. Global scene shortcuts work while another app has focus.</p>{props.widgets.hotkeys.map(item => <p key={item.scene}><strong>{item.scene.toUpperCase()}</strong><br /><span className="muted">{item.accelerator} · {item.registered ? 'Registered' : 'Unavailable: another app may use it'}</span></p>)}<button className="secondary" onClick={() => props.go('live')}>Open capture controls ↗</button></section>
    <section className="panel"><PanelTitle title="Repair connection" /><p className="muted">Revalidate the saved Twitch login and recreate event subscriptions.</p><button className="secondary full" disabled={props.busy || !props.state.twitch.clientId} onClick={() => { void props.action('Repairing Twitch', () => window.rapidcast.retryTwitch()) }}>↻ Repair Twitch connection</button></section>
  </div></div>
}
