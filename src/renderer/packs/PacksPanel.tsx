import { useEffect, useState } from 'react'
import type { PackState } from '../../shared/packs'
import type { PageProps } from '../types'
import { layoutThumbnail, PackScenePreview } from './Preview'
import './packs.css'

export function PacksPanel(props: PageProps): React.JSX.Element {
  const [state, setState] = useState<PackState | null>(null)
  const [name, setName] = useState('My RapidCast look'); const [author, setAuthor] = useState(''); const [description, setDescription] = useState('')
  useEffect(() => {
    let active = true
    const apply = (value: PackState): void => { if (active) setState(current => !current || value.revision >= current.revision ? value : current) }
    const off = window.rapidcast.onPacks(apply); void window.rapidcast.getPacks().then(apply).catch(() => undefined)
    return () => { active = false; off() }
  }, [])
  const working = Boolean(state && ['reading', 'exporting', 'testing', 'installing'].includes(state.phase)); const review = state?.review
  return <details className="panel pack-panel"><summary><div><span className="eyebrow">TAKE YOUR LOOK WITH YOU</span><strong>Overlay packs</strong></div><span className="mono">EXPORT / IMPORT .RCPACK ↗</span></summary>
    <p className="muted">Share four scenes, widgets, parameters, theme and images. Capture sources become hidden placeholders. Your account, AI settings, audio devices and stream settings stay on this computer.</p>
    <form className="pack-export" onSubmit={e => { e.preventDefault(); void props.action('Exporting overlay pack', () => window.rapidcast.exportPack({ name, author, description, preview: layoutThumbnail(props.engine.settings) })) }}>
      <div className="pack-fields"><label>Pack name<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label><label>Author (optional)<input value={author} maxLength={80} onChange={e => setAuthor(e.target.value)} /></label></div>
      <label>Description<textarea value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} placeholder="What makes this look yours?" /></label>
      <div className="button-row"><button className="secondary" disabled={props.busy || working || !state || !name.trim()}>Export current layout</button><button type="button" className="primary pack-open" disabled={props.busy || working || !state} onClick={() => { void props.action('Opening overlay pack', () => window.rapidcast.openPack()) }}>Open pack to review ↗</button></div>
      <p className="muted pack-note">Export includes your scene text, widget source, attribution and embedded images. Images are resized to fit 1920×1080. Review the file before sharing it.</p>
    </form>
    {state && <div className={`pack-status ${state.phase === 'error' ? 'inline-error' : ''}`} role="status"><strong>{state.phase.toUpperCase()}{state.phase === 'testing' ? ` · ${state.completed}/${state.total}` : ''}</strong><p>{state.message}</p></div>}
    {review && <div className="pack-review" data-pack-id={review.id}>
      <div className="pack-review-title"><div><span className="eyebrow">REVIEW BEFORE INSTALLING</span><h3>{review.metadata.name}</h3><p className="muted">{review.metadata.author ? `Author (unverified): ${review.metadata.author} · ` : ''}Exported {new Date(review.metadata.createdAt).toLocaleDateString()} · RapidCast {review.metadata.appVersion}</p></div><span className="offline-badge">4 SCENES · {review.definitions.length} WIDGETS</span></div>
      <p>{review.metadata.description || 'No description provided.'}</p>
      <div className="pack-preview-row"><div><img src={review.preview} alt="Pack author’s layout thumbnail" /><small>Author-provided thumbnail. Layer diagrams below are generated from the reviewed data.</small></div><dl className="settings-values"><div><dt>Theme</dt><dd>{review.theme?.name ?? 'Custom scene styling'}</dd></div><div><dt>Transition</dt><dd>{review.transition}</dd></div><div><dt>Embedded images</dt><dd>{review.images}</dd></div><div><dt>Capture placeholders</dt><dd>{review.placeholders}</dd></div><div><dt>Configurations to test</dt><dd>{review.testCases} × 3 seconds</dd></div></dl></div>
      <PackScenePreview review={review} />
      <details className="pack-source"><summary>Inspect widget source and credits ({review.definitions.length})</summary>{review.definitions.map(d => <details key={d.id}><summary>{d.name} · {d.code.length.toLocaleString()} characters{d.credit ? ` · ${d.credit}` : ''}</summary><p className="muted">{d.description}</p><pre tabIndex={0}>{d.code}</pre></details>)}</details>
      <div className="notice">Installing replaces all four scene layouts and placed widgets. Export your current layout first if you want to keep it. Capture placeholders remain hidden; choose your own devices afterward. Testing and installation require output stopped.</div>
      <div className="button-row">{state?.phase === 'testing' ? <button className="secondary" onClick={() => { void props.action('Cancelling pack test', () => window.rapidcast.cancelPack()) }}>Cancel sandbox tests</button> : <button className="secondary pack-test" disabled={props.busy || working || Boolean(props.engine.mode)} onClick={() => { void props.action('Testing pack', () => window.rapidcast.testPack(review.id)) }}>Test in sandbox</button>}
        <button className="primary pack-install" disabled={props.busy || state?.phase !== 'ready' || Boolean(props.engine.mode)} onClick={() => { void props.action('Installing reviewed pack', () => window.rapidcast.installPack(review.id)) }}>Replace four scenes</button></div>
      <p className="muted pack-note">Every unique code/parameter/size combination must pass the same isolated test used by AI widgets. Runtime watchdogs remain active afterward. A short test cannot guarantee that third-party code will never fail.</p>
    </div>}
  </details>
}
