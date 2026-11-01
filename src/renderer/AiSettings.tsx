import { useEffect, useState } from 'react'
import { AI_PRESETS, type AiPreset } from '../shared/ai'
import type { PageProps } from './types'
import { PanelTitle } from './components'

export function AiSettingsPanel(props: PageProps): React.JSX.Element {
  const [settings, setSettings] = useState(props.ai.settings)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const signature = JSON.stringify(props.ai.settings)
  useEffect(() => { setSettings(props.ai.settings) }, [signature])
  return <section className="panel ai-settings"><PanelTitle title="Bring your own model" detail="AI PROVIDER" />
    <p className="muted">Use a paid API or a local OpenAI-compatible server. AI is optional; Twitch, recording and builtin widgets work without it.</p>
    <form onSubmit={event => { event.preventDefault(); void props.action('Saving AI settings', () => window.rapidcast.saveAi(settings, key || undefined)).then(ok => { setSaved(ok); if (ok) setKey('') }) }}>
      <div className="ai-fields"><label>Provider<select aria-label="AI provider" value={settings.preset} onChange={event => { const preset = event.target.value as AiPreset; setSettings({ ...settings, preset, baseUrl: AI_PRESETS[preset].baseUrl || settings.baseUrl, model: '', tokenField: preset === 'openai' ? 'max_completion_tokens' : 'max_tokens' }); setKey(''); setSaved(false) }}>{Object.entries(AI_PRESETS).map(([id, value]) => <option value={id} key={id}>{value.name}</option>)}</select></label>
        <label>Base URL<input aria-label="AI base URL" value={settings.baseUrl} maxLength={300} spellCheck={false} onChange={event => { setSettings({ ...settings, baseUrl: event.target.value }); setSaved(false) }} /></label>
        <label>API key {props.ai.hasKey ? '(encrypted key saved)' : '(optional for local servers)'}<input aria-label="AI API key" type="password" autoComplete="new-password" spellCheck={false} maxLength={2048} placeholder="Blank keeps the key for the same endpoint" value={key} onChange={event => { setKey(event.target.value); setSaved(false) }} /></label>
        <label>Model ID<input aria-label="AI model" list="ai-models" placeholder="List models or enter a text model ID" value={settings.model} maxLength={160} spellCheck={false} onChange={event => { setSettings({ ...settings, model: event.target.value }); setSaved(false) }} /><datalist id="ai-models">{props.ai.models.map(model => <option key={model} value={model} />)}</datalist></label>
        <label>Output token field<select value={settings.tokenField} onChange={event => setSettings({ ...settings, tokenField: event.target.value as typeof settings.tokenField })}><option value="max_completion_tokens">max_completion_tokens</option><option value="max_tokens">max_tokens</option></select></label>
        <label>Maximum output tokens<input type="number" min={256} max={16000} value={settings.maxTokens} onChange={event => setSettings({ ...settings, maxTokens: Number(event.target.value) })} /></label>
        <label>Request timeout (seconds)<input type="number" min={10} max={180} value={settings.timeoutSeconds} onChange={event => setSettings({ ...settings, timeoutSeconds: Number(event.target.value) })} /></label>
        <label>Viewer cooldown (seconds)<input type="number" min={10} max={600} value={settings.cooldownSeconds} onChange={event => setSettings({ ...settings, cooldownSeconds: Number(event.target.value) })} /></label>
      </div>
      <p className="muted">Save before listing models or testing. Changing the endpoint removes its saved key. Keys stay in encrypted desktop storage and are never returned to widgets.</p>
      <div className="button-row wrap"><button className="primary" disabled={props.busy}>{saved ? 'Saved' : 'Save AI settings'}</button><button type="button" className="secondary" disabled={props.busy} onClick={() => { void props.action('Listing models', () => window.rapidcast.listAiModels()) }}>List models</button><button type="button" className="secondary" disabled={props.busy || !props.ai.settings.model} onClick={() => { void props.action('Testing completion', () => window.rapidcast.testAi()) }}>Test connection</button><button type="button" className="text-button" disabled={props.busy || !props.ai.hasKey} onClick={() => { void props.action('Removing AI key', () => window.rapidcast.clearAiKey()).then(ok => { if (ok) setKey('') }) }}>Clear saved key</button></div>
    </form>
    <p role="status" className="notice">{props.ai.connection}</p>
    <p className="warning-text">Large local models can compete with the compositor/encoder for GPU and memory. Test while recording. Model requests may incur provider charges.</p>
    <p className="muted">Ollama: start its server and download a text model. LM Studio: load a model and enable its local server. Use HTTPS for remote servers. ChatGPT sign-in through Codex is not included in this version.</p>
  </section>
}
