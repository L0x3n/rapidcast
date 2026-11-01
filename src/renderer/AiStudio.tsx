import { useState } from 'react'
import type { PageProps } from './types'
import type { Suggestion } from '../shared/ai'
import { SCENES } from '../shared/scenes'
import { PanelTitle } from './components'

export function AiBuilder(props: PageProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [edit, setEdit] = useState('')
  const [replay, setReplay] = useState(0)
  const job = props.ai.job; const draft = props.ai.draft
  const building = ['writing', 'testing', 'fixing', 'publishing'].includes(job.phase)
  const scene = props.state.activeScene
  return <section className="panel builder-panel"><PanelTitle title="What should we build?" detail="YOUR MODEL · YOUR STAGE" />
    <div className="builder-prompt"><span>✦</span><div><h3>Let chat build the unexpected.</h3><p>Describe an interaction. Test it in isolation. Decide what goes live.</p></div></div>
    {!props.ai.settings.model && <div className="notice">Choose an AI model to build widgets. You can still use the builtin library.<button className="text-button" onClick={() => props.go('settings')}>Set up AI ↗</button></div>}
    <form onSubmit={event => { event.preventDefault(); void props.action('Starting widget build', () => window.rapidcast.generateWidget({ prompt, scene, ...(edit ? { editInstanceId: edit } : {}) })) }}>
      <label className="ai-edit-choice">Build mode<select aria-label="Widget build mode" value={edit} onChange={event => setEdit(event.target.value)}><option value="">New widget in {SCENES.find(item => item.id === scene)?.name}</option>{props.engine.settings.scenes[scene].filter(item => item.kind === 'widget').map(item => <option key={item.id} value={item.id}>Edit: {item.name}</option>)}</select></label>
      <textarea aria-label="Widget idea" placeholder={edit ? 'Bigger text, and add confetti when someone follows…' : 'A neon energy meter that fills with each chat message and bursts into confetti…'} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={2000} rows={3} disabled={building} />
      <div className="builder-footer"><span className="muted">{edit ? 'The original stays on the scene until you publish.' : 'Up to two repairs, then your preview.'}</span><button className="primary" disabled={props.busy || building || !prompt.trim() || !props.ai.settings.model}>✦ {edit ? 'Build edit' : 'Build widget'}</button></div>
    </form>
    <div className="pipeline-steps" aria-label="Widget pipeline">{['writing', 'testing', 'fixing', 'ready'].map(phase => <span key={phase} className={job.phase === phase ? 'active' : ''}>{phase === 'fixing' ? `FIXING ${job.attempt}/2` : phase.toUpperCase()}</span>)}</div>
    <p className={job.phase === 'error' ? 'inline-error' : 'muted'} role="status" data-ai-phase={job.phase}>{job.message}</p>
    {(building || draft) && <button className="text-button" disabled={props.busy || job.phase === 'publishing'} onClick={() => { void props.action('Cancelling build', () => window.rapidcast.cancelAi()) }}>{draft ? 'Discard preview' : 'Cancel build'}</button>}
    {draft && <div className="ai-draft"><PanelTitle title={draft.name} detail={draft.source === 'simulator' ? 'TEST IDEA · SIMULATED PREVIEW' : 'SIMULATED PREVIEW'} />
      <div className="overlay-preview"><iframe key={`${draft.id}-${replay}`} title="Generated widget simulated preview" src={draft.previewUrl} sandbox="allow-scripts allow-same-origin" /></div>
      {draft.credit && <p className="accent">{draft.credit}</p>}
      <div className="button-row wrap"><button className="primary" disabled={props.busy || job.phase !== 'ready'} onClick={() => { void props.action('Publishing widget', () => window.rapidcast.publishAiDraft(draft.id)) }}>{draft.editInstanceId ? 'Replace original widget' : `Publish to ${SCENES.find(item => item.id === draft.scene)?.name}`}</button><button className="secondary" onClick={() => setReplay(value => value + 1)}>Replay test events</button></div>
      <details><summary>Review generated source</summary><pre className="ai-source">{draft.code}</pre></details>
    </div>}
  </section>
}

function SuggestionCard({ item, ...props }: PageProps & { item: Suggestion }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [idea, setIdea] = useState(item.idea)
  const wrongChannel = item.source === 'twitch' && item.channelId !== props.state.twitch.account?.id
  return <article className={`suggestion-card ${item.state}`}>
    <div className="suggestion-meta"><strong>@{item.user.login}{item.source === 'simulator' ? ' · TEST' : ''}</strong><span>{item.state.toUpperCase()}</span></div>
    <h3>{item.title}</h3><p>{item.idea}</p><small className="muted">{wrongChannel ? 'Belongs to another channel. Reconnect it to approve.' : item.reason}</small>
    {editing && <label>Edit idea<textarea aria-label={`Edit idea from ${item.user.login}`} maxLength={400} rows={3} value={idea} onChange={event => setIdea(event.target.value)} /><button className="secondary" disabled={props.busy || !idea.trim()} onClick={() => { void props.action('Screening edited idea', () => window.rapidcast.editSuggestion(item.id, idea)).then(ok => { if (ok) setEditing(false) }) }}>Save and screen again</button></label>}
    <div className="button-row wrap">{item.state === 'pending' && <button className="primary" disabled={props.busy || wrongChannel || ['writing', 'testing', 'fixing', 'publishing'].includes(props.ai.job.phase)} onClick={() => { void props.action('Approving viewer idea', () => window.rapidcast.approveSuggestion(item.id, props.state.activeScene)) }}>Approve + build</button>}
      {!['published', 'building', 'screening'].includes(item.state) && <button className="secondary" disabled={props.busy || props.ai.job.phase === 'publishing'} onClick={() => setEditing(value => !value)}>Edit</button>}
      {!['published', 'rejected'].includes(item.state) && <button className="text-button" disabled={props.busy || props.ai.job.phase === 'publishing'} onClick={() => { void props.action('Rejecting idea', () => window.rapidcast.rejectSuggestion(item.id)) }}>Reject</button>}
    </div>
  </article>
}
export function SuggestionQueue(props: PageProps): React.JSX.Element {
  const [idea, setIdea] = useState('A neon confetti burst when chat gets loud')
  const [cost, setCost] = useState(500)
  const settings = props.ai.settings
  return <section className="panel suggestion-queue"><PanelTitle title="Chat builds the show" detail={`${props.ai.suggestions.filter(item => item.state === 'pending').length} TO REVIEW`} />
    <p className="muted">Viewers send !widget followed by an idea (up to 400 characters). AI screens; you approve. Own messages are ignored.</p>
    <label className="toggle"><input type="checkbox" checked={settings.suggestionsEnabled} disabled={props.busy} onChange={event => { void props.action('Changing suggestion intake', () => window.rapidcast.saveAi({ ...settings, suggestionsEnabled: event.target.checked })) }} />Accept viewer suggestions</label>
    <label className="toggle"><input type="checkbox" checked={settings.autoPublish} disabled={props.busy} onChange={event => { void props.action('Changing publishing mode', () => window.rapidcast.saveAi({ ...settings, autoPublish: event.target.checked })) }} />Publish after my approval and passed test</label>
    <p className="muted">{settings.autoPublish ? 'Your Approve action authorizes publication after the sandbox passes.' : 'Builds wait for your final Publish click.'} Per-user cooldown: {settings.cooldownSeconds}s. Global intake: one idea per 5s. Queue: 20 waiting ideas.</p>
    <details><summary>Channel point reward</summary><p className="muted">Affiliate/Partner only. Create or update the app-owned “Suggest a widget” reward. It needs viewer text. Pause it in Twitch rewards if you turn intake off.</p><label>Cost<input type="number" min={1} max={1000000} value={cost} onChange={event => setCost(Number(event.target.value))} /></label><button className="secondary" disabled={props.busy || !settings.suggestionsEnabled || !props.state.twitch.account} onClick={() => { void props.action('Creating suggestion reward', () => window.rapidcast.createSuggestionReward(cost)) }}>Create / update reward</button>{props.ai.reward && <p className="muted">Reward saved for channel {props.ai.reward.channelId}.</p>}</details>
    <details><summary>Simulate a viewer idea</summary><p className="muted">Local test only. No Twitch message is sent.</p><textarea aria-label="Simulated widget suggestion" maxLength={400} rows={3} value={idea} onChange={event => setIdea(event.target.value)} /><button className="secondary" disabled={props.busy || !idea.trim()} onClick={() => { void props.action('Adding test suggestion', () => window.rapidcast.simulateSuggestion(idea)) }}>Send test idea</button></details>
    {!props.ai.suggestions.length && <div className="empty-state small"><span>✧</span><strong>The next idea could be theirs.</strong><p>Enable suggestions and connect Twitch, or send a test idea.</p></div>}
    {[...props.ai.suggestions].reverse().slice(0, 20).map(item => <SuggestionCard key={item.id} {...props} item={item} />)}
  </section>
}
