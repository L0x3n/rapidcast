import { useEffect, useRef, useState } from 'react'
import { describeEvent, type StreamEvent } from '../shared/events'
import { SCENES } from '../shared/scenes'
import { SIMULATIONS, type Simulation } from '../shared/simulator'
import type { PageProps } from './types'
import type { EngineState } from '../shared/engine'

export function PanelTitle({ title, detail }: { title: string; detail?: string }): React.JSX.Element {
  return <div className="panel-title"><h2>{title}</h2>{detail && <span className="mono muted">{detail}</span>}</div>
}
export function EventFeed({ events, compact = false }: { events: StreamEvent[]; compact?: boolean }): React.JSX.Element {
  const filtered = events.filter(event => event.type !== 'chat').slice(compact ? -5 : -40).reverse()
  return <div className="event-feed" aria-live="polite">{filtered.length ? filtered.map(event => <div className="event-row" key={`${event.source}-${event.id}`}>
    <span className={`event-icon ${event.type}`}>{event.type === 'follow' ? '♡' : event.type === 'raid' ? '↗' : '✦'}</span>
    <div><strong>{describeEvent(event)}</strong><span>{event.source === 'simulator' ? 'SIMULATED · ' : ''}{new Date(event.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
  </div>) : <div className="empty-state small"><span>✦</span><strong>No events yet</strong><p>Connect Twitch or fire a simulated event.</p></div>}</div>
}
export function ProgramPreview({ state, engine }: Pick<PageProps, 'state'> & { engine?: EngineState }): React.JSX.Element {
  const scene = SCENES.find(item => item.id === state.activeScene) ?? SCENES[0]
  const latest = state.events.filter(event => event.type !== 'chat').at(-1)
  if (engine?.previewActive && engine.preview) return <div className="program-preview actual-preview"><img src={engine.preview} alt="Live compositor program preview" /><span className="preview-caption">PROGRAM CANVAS · UI PREVIEW 2 FPS · OUTPUT {engine.settings.fps} FPS</span></div>
  return <div className={`program-preview scene-${scene.id}`}>
    <div className="art-grid" /><div className="orbit" /><div className="orbit inner" />
    <div className="preview-corner"><span className="tiny-mark">R↗</span><span>{scene.name.toUpperCase()}</span></div>
    <div className="program-copy"><span>{scene.headline}</span><strong>{scene.title}</strong><p>{scene.subtitle}</p></div>
    {latest && <div key={latest.id} className="alert-preview"><span>✦</span><div><small>{latest.source === 'simulator' ? 'SIMULATED EVENT' : 'TWITCH EVENT'} · PREVIEW</small><strong>{describeEvent(latest)}</strong></div></div>}
    <div className="preview-caption">SCENE LAYOUT PREVIEW · NO STREAM OUTPUT</div>
  </div>
}
export function SceneSwitcher({ state, action, busy }: PageProps): React.JSX.Element {
  return <div className="scene-switcher" aria-label="Scene switcher">{SCENES.map((scene, index) => <button key={scene.id}
    className={`scene-button ${state.activeScene === scene.id ? 'selected' : ''}`} disabled={busy}
    onClick={() => { void action('Switching scene', () => window.rapidcast.selectScene(scene.id)) }}>
    <div className={`scene-thumb thumb-${scene.id}`}><span>{`0${index + 1}`}</span><b>{scene.name === 'Live' ? 'ON AIR' : scene.name.toUpperCase()}</b></div>
    <div>{scene.name}<i /></div></button>)}</div>
}
export function Simulator(props: PageProps): React.JSX.Element {
  const [type, setType] = useState<Simulation>('follow')
  const labels: Record<Simulation, string> = { chat: 'Chat message', follow: 'New follow', sub: 'New subscriber', gift: 'Gift 5 subscriptions', resub: '12-month resub', cheer: '500 bits cheer', raid: '42-viewer raid', redeem: 'Widget idea redemption', streamOnline: 'Channel online', streamOffline: 'Channel offline' }
  return <section className="panel simulator"><PanelTitle title="Event simulator" detail="LOCAL ONLY" />
    <p className="muted">Rehearse the moment. Test events stay clearly marked and never reach Twitch.</p>
    <label>Event type<select value={type} onChange={event => setType(event.target.value as Simulation)}>{SIMULATIONS.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
    <button className="primary full" disabled={props.busy} onClick={() => { void props.action('Firing event', () => window.rapidcast.simulate(type)) }}>✦ Fire event</button>
    <button className="text-button full" disabled={props.busy || !props.state.events.some(e => e.source === 'simulator')} onClick={() => { void props.action('Clearing test events', () => window.rapidcast.clearSimulations()) }}>Clear simulated events</button>
  </section>
}
export function Chat(props: PageProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const chat = props.state.events.filter(event => event.type === 'chat')
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [chat.length])
  return <section className="panel chat-panel"><PanelTitle title="Stream chat" detail={props.state.twitch.socket.toUpperCase()} />
    <div className="chat-messages" ref={scroll} role="log" aria-label="Chat messages">
      {!chat.length && <div className="empty-state small"><span>◌</span><strong>The room is yours.</strong><p>Your channel’s messages will appear here.</p></div>}
      {chat.map(event => <div className="chat-message" key={`${event.source}-${event.id}`}>
        <span className="chat-meta" title="Delivery time compares Twitch’s event timestamp with this computer’s clock. Check end-to-end latency by sending a message on Twitch.">{event.source === 'simulator' ? 'TEST' : `${new Date(event.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${event.receivedAt >= Date.parse(event.at) ? `${event.receivedAt - Date.parse(event.at)} ms delivery` : 'CLOCK MISMATCH'}`}{event.own ? ' · YOU' : ''}</span>
        <p><strong style={{ color: event.color }}>{event.user.name}</strong><span>{event.text}</span></p>
      </div>)}
    </div>
    <form className="chat-compose" onSubmit={event => { event.preventDefault(); void props.action('Sending chat', () => window.rapidcast.sendChat(message)).then(ok => { if (ok) setMessage('') }) }}>
      <input aria-label="Message to your Twitch chat" placeholder={props.state.twitch.account ? 'Send a message to Twitch…' : 'Connect Twitch to chat'} maxLength={500} value={message} onChange={event => setMessage(event.target.value)} disabled={!props.state.twitch.account || props.busy} />
      <button aria-label="Send message to Twitch" className="send-button" disabled={!props.state.twitch.account || !message.trim() || props.busy}>↗</button>
    </form>
  </section>
}
