import { useEffect, useState } from 'react'
import type { ActionResult, AppInfo, StudioState } from '../shared/contracts'
import { LivePage, StudioPage } from './pages/LiveStudio'
import { SetupPage, SettingsPage, StatsPage } from './pages/AccountPages'
import type { Action, PageProps, Tab } from './types'
import type { EngineState } from '../shared/engine'
import type { WidgetState } from '../shared/widgets'

const tabs: { id: Tab; name: string; icon: string; description: string }[] = [
  { id: 'live', name: 'Live', icon: '◉', description: 'Your stage, your rules.' },
  { id: 'studio', name: 'Studio', icon: '✦', description: 'Make chat part of the show.' },
  { id: 'setup', name: 'Setup', icon: '↗', description: 'From first idea to first stream.' },
  { id: 'stats', name: 'Stats', icon: '▥', description: 'Find the moments that matter.' },
  { id: 'settings', name: 'Settings', icon: '⚙', description: 'Make this studio yours.' }
]

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('live')
  const [state, setState] = useState<StudioState | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [engine, setEngine] = useState<EngineState | null>(null)
  const [widgets, setWidgets] = useState<WidgetState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => {
    let active = true
    const apply = (incoming: StudioState): void => {
      if (active) setState(current => !current || incoming.revision >= current.revision ? incoming : current)
    }
    const unsubscribe = window.rapidcast.onStudio(apply)
    const applyEngine = (incoming: EngineState): void => { if (active) setEngine(current => !current || incoming.revision >= current.revision ? incoming : current) }
    const unsubscribeEngine = window.rapidcast.onEngine(applyEngine)
    const applyWidgets = (incoming: WidgetState): void => { if (active) setWidgets(current => !current || incoming.revision >= current.revision ? incoming : current) }
    const unsubscribeWidgets = window.rapidcast.onWidgets(applyWidgets)
    window.rapidcast.getWidgets().then(applyWidgets).catch(() => { if (active) setError('The widget service could not connect. Restart RapidCast.') })
    window.rapidcast.getEngine().then(applyEngine).catch(() => { if (active) setError('The engine could not connect. Restart RapidCast.') })
    Promise.all([window.rapidcast.getAppInfo(), window.rapidcast.getStudio()]).then(([appInfo, studio]) => {
      if (active) { setInfo(appInfo); apply(studio) }
    }).catch(() => { if (active) setError('The desktop connection could not start. Restart RapidCast and try again.') })
    return () => { active = false; unsubscribe(); unsubscribeEngine(); unsubscribeWidgets() }
  }, [])

  const action: Action = async (label, run) => {
    setBusy(label)
    setError('')
    try {
      const result: ActionResult = await run()
      if (!result.ok) { setError(result.error); return false }
      return true
    } catch { setError('The desktop action could not finish. Restart RapidCast and try again.'); return false }
    finally { setBusy('') }
  }
  const current = tabs.find(item => item.id === tab) ?? tabs[0]!
  const titles: Record<Tab, string> = { live: 'Run the show.', studio: 'Build the unexpected.', setup: 'Your first great stream.', stats: 'Read the room.', settings: 'Your studio. Your way.' }
  const props: PageProps | null = state && info && engine && widgets ? { state, info, engine, widgets, action, busy: Boolean(busy), go: setTab } : null

  return <div className="app-shell" data-app-ready={props ? 'true' : 'false'}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol">R<span>↗</span></span>RapidCast</div>
      <span className="sidebar-caption">YOUR STREAMING STUDIO</span>
      <nav aria-label="Main navigation">{tabs.map(item => <button key={item.id} data-tab={item.id}
        className={`nav-item ${tab === item.id ? 'active' : ''}`} aria-current={tab === item.id ? 'page' : undefined}
        onClick={() => setTab(item.id)}><span aria-hidden="true">{item.icon}</span>{item.name}{tab === item.id && <i />}</button>)}</nav>
      <div className="sidebar-bottom"><span className="accent">✦ BUILT WITH CODEX</span><p>Big ideas.<br />Live possibilities.</p><span className="mono muted">ENGINE BETA · WIDGETS READY</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">YOUR WORKSPACE<span>/</span><strong>{current.name.toUpperCase()}</strong></div>
        <div className={`connection-pill ${state?.twitch.phase === 'connected' ? 'connected' : ''}`}><i />
          {state?.twitch.phase === 'connected' ? `@${state.twitch.account?.login}` : state?.twitch.socket === 'reconnecting' ? 'TWITCH RECONNECTING' : state?.twitch.phase === 'waiting' ? 'WAITING FOR TWITCH' : state?.twitch.phase === 'connecting' ? 'CONNECTING TWITCH' : state?.twitch.phase === 'error' ? 'TWITCH NEEDS ATTENTION' : 'TWITCH NOT CONNECTED'}</div>
        <span className="offline-badge">{engine?.mode ? engine.mode === 'test' ? 'PRIVATE TEST' : engine.mode === 'record' ? 'LOCAL RECORDING' : 'TWITCH OUTPUT' : 'OUTPUT OFFLINE'}</span></header>
      <main className="page-content">
        <div className="page-heading"><div><span className="eyebrow">{current.description}</span><h1>{titles[tab]}</h1></div>
          <div className="heading-actions">{busy && <span className="muted" role="status">{busy}…</span>}
            <button className="primary" onClick={() => setTab('setup')}>{state?.twitch.account ? 'Readiness checks' : 'Connect your stream'} <span>↗</span></button></div></div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        {!props ? <div className="empty-state">Opening your desktop studio…</div> : <>
          {tab === 'live' && <LivePage {...props} />}
          {tab === 'studio' && <StudioPage {...props} />}
          {tab === 'setup' && <SetupPage {...props} />}
          {tab === 'stats' && <StatsPage {...props} />}
          {tab === 'settings' && <SettingsPage {...props} />}
        </>}
      </main>
      <footer><span><i className="dot" />DESKTOP STUDIO <span className="muted">/</span> {info?.secureStorageAvailable ? 'SECURE STORAGE READY' : 'CHECKING SECURE STORAGE'}</span><span>RapidCast {info?.version ?? '0.0.0'} <b>✦</b></span></footer>
    </div>
  </div>
}
