import { useEffect, useState } from 'react'
import type { PageProps } from '../types'
import { EventFeed, PanelTitle } from '../components'

function TwitchConnection(props: PageProps): React.JSX.Element {
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

export function SetupPage(props: PageProps): React.JSX.Element {
  const account = props.state.twitch.account
  return <div data-page="setup" className="setup-layout"><div className="main-column">
    <div className="welcome-banner"><span>✦</span><div><span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span><h2>Less setup. More show.</h2><p>Connect your channel now. Device discovery and the guided performance check arrive with the streaming engine.</p></div></div>
    <TwitchConnection {...props} /><section className="panel"><PanelTitle title="Ready when you are" detail="READINESS" /><div className="checklist">
      <Check ready={props.info.secureStorageAvailable} title="Secure desktop storage" detail={props.info.secureStorageAvailable ? 'Windows encryption is available for credentials.' : 'Restart Windows and try again.'} />
      <Check ready={Boolean(props.state.twitch.clientId)} title="Public Twitch Client ID" detail={props.state.twitch.clientId ? 'Your application ID is configured.' : 'Add your public Client ID in Settings.'} />
      <Check ready={props.state.twitch.phase === 'connected'} title="Twitch chat and events" detail={account ? props.state.twitch.message : 'Sign in to your channel to connect chat.'} />
      <Check ready={false} title="Streaming engine" detail="Capture, audio and a bandwidth test arrive in P2. Full onboarding follows in P5." />
    </div></section>
  </div><aside className="side-column"><section className="panel"><PanelTitle title="Your first five minutes" /><ol className="setup-roadmap"><li><b>Connect Twitch</b><span>Device login. Your account stays yours.</span></li><li><b>Find your devices</b><span>Displays, camera and audio. In P2.</span></li><li><b>Check your connection</b><span>A private bandwidth test. In P2.</span></li><li><b>Set the scene</b><span>Widgets and your own style. In P3 + P4.</span></li><li><b>Go make a moment</b><span>Finish the ready-to-stream checklist.</span></li></ol></section>
    <button className="secondary full" onClick={() => props.go('live')}>Open Live workspace ↗</button></aside></div>
}
function Check({ ready, title, detail }: { ready: boolean; title: string; detail: string }): React.JSX.Element {
  return <div className={`check-row ${ready ? 'ready' : ''}`}><span>{ready ? '✓' : '○'}</span><div><strong>{title}</strong><p>{detail}</p></div></div>
}

export function SettingsPage(props: PageProps): React.JSX.Element {
  const [clientId, setClientId] = useState(props.state.twitch.clientId)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setClientId(props.state.twitch.clientId) }, [props.state.twitch.clientId])
  return <div data-page="settings" className="settings-layout"><div className="main-column"><section className="panel"><PanelTitle title="Twitch application" detail="PUBLIC CLIENT" />
    <p className="muted">Use a Twitch application registered with Client Type set to Public. No client secret is needed.</p>
    <form onSubmit={event => { event.preventDefault(); void props.action('Saving Client ID', () => window.rapidcast.saveClientId(clientId)).then(setSaved) }}>
      <label>Public Client ID<input placeholder="Paste your public Twitch Client ID" autoComplete="off" spellCheck={false} maxLength={128} value={clientId} onChange={event => { setClientId(event.target.value); setSaved(false) }} /></label>
      <div className="form-footer"><span>{saved ? 'Client ID saved.' : 'This ID is public. Never paste a client secret or token here.'}</span><button className="primary" disabled={props.busy}>Save Client ID</button></div>
    </form></section><TwitchConnection {...props} />
    <section className="panel"><PanelTitle title="Event subscriptions" detail={`${props.state.twitch.subscriptions.filter(s => s.status === 'enabled').length} ACTIVE`} />
      {!props.state.twitch.subscriptions.length ? <p className="muted">Connect Twitch to see which events your channel can receive.</p> : <div className="subscriptions">{props.state.twitch.subscriptions.map(subscription => <div key={subscription.type}><div><strong>{subscription.type.replace('channel.channel_points_custom_reward_redemption.add', 'channel.point_redemption')}</strong><p>{subscription.detail}</p></div><span className={`subscription-status ${subscription.status}`}>{subscription.status.toUpperCase()}</span></div>)}</div>}
    </section></div><div className="side-column"><section className="panel"><PanelTitle title="AI provider" detail="IN P4" /><div className="provider-badge">✦ <strong>Bring your own model</strong></div><p className="muted">OpenAI, OpenRouter, Ollama, LM Studio or a custom OpenAI-compatible endpoint.</p><p className="muted">No AI is required for Twitch, chat or the event simulator.</p></section>
    <section className="panel"><PanelTitle title="Output" detail="ENGINE IN P2" /><dl className="settings-values"><div><dt>Canvas</dt><dd>1920 × 1080</dd></div><div><dt>Video default</dt><dd>6000 kbps</dd></div><div><dt>Audio default</dt><dd>AAC · 160 kbps</dd></div><div><dt>Encoder plan</dt><dd>NVENC / x264</dd></div></dl></section>
    <section className="panel"><PanelTitle title="Devices & hotkeys" /><p className="muted">Device controls arrive in P2. Scene hotkeys arrive in P3.</p></section>
    <section className="panel"><PanelTitle title="Repair connection" /><p className="muted">Revalidate the saved Twitch login and recreate event subscriptions.</p><button className="secondary full" disabled={props.busy || !props.state.twitch.clientId} onClick={() => { void props.action('Repairing Twitch', () => window.rapidcast.retryTwitch()) }}>↻ Repair Twitch connection</button></section>
  </div></div>
}

export function StatsPage(props: PageProps): React.JSX.Element {
  const [includeTests, setIncludeTests] = useState(false)
  const events = props.state.events.filter(event => includeTests || event.source === 'twitch')
  const chats = events.filter(event => event.type === 'chat')
  const unique = new Set(chats.map(event => event.user.id)).size
  const follows = events.filter(event => event.type === 'follow').length
  const bits = events.reduce((sum, event) => sum + (event.type === 'cheer' ? event.bits : 0), 0)
  return <div data-page="stats"><div className="notice stats-notice"><span>STUDIO ACTIVITY BUFFER</span><p>These are the latest {props.state.events.length} of up to 200 events in this app session. Stream history, charts, widget impact and AI reports arrive in P6.</p></div>
    <label className="toggle"><input type="checkbox" checked={includeTests} onChange={event => setIncludeTests(event.target.checked)} />Include simulated events <span className="mono">{includeTests ? 'TWITCH + TEST DATA' : 'TWITCH DATA ONLY'}</span></label>
    <div className="stat-grid">{[['Chat messages', chats.length], ['Unique chatters', unique], ['New follows', follows], ['Bits cheered', bits]].map(([label, value]) => <section className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{includeTests ? 'INCLUDES TEST EVENTS' : 'CURRENT TWITCH BUFFER'}</small></section>)}</div>
    <div className="stats-layout"><section className="panel"><PanelTitle title="Recent activity" detail={includeTests ? 'TWITCH + TEST' : 'TWITCH ONLY'} /><EventFeed events={events} /></section><div className="side-column"><section className="panel"><PanelTitle title="Twitch channel" /><dl className="settings-values"><div><dt>Channel status</dt><dd>{props.state.twitch.account ? props.state.twitch.channelLive ? 'Live on Twitch' : 'Offline on Twitch' : 'Not connected'}</dd></div><div><dt>Viewers</dt><dd>{props.state.twitch.viewers ?? '--'}</dd></div><div><dt>Refresh</dt><dd>Every 60 seconds</dd></div></dl><p className="muted">Channel status describes Twitch. RapidCast output is not implemented yet.</p></section><section className="panel"><PanelTitle title="Your next stream report" detail="IN P6" /><div className="empty-state small"><span>✦</span><strong>Find your next big moment.</strong><p>Session peaks, widget impact and ideas to try next. AI reports will be optional.</p></div></section></div></div>
  </div>
}
