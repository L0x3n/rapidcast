import { useState } from 'react'
import type { PageProps } from '../types'
import { PanelTitle } from '../components'
import { SCENES } from '../../shared/scenes'
import { defaultTheme, THEME_PRESETS, type StreamTheme } from '../../shared/setup'

export function FourSceneStyle({ theme }: { theme: StreamTheme }): React.JSX.Element {
  const right = theme.layout === 'chat-right'
  return <div className="theme-scenes">{SCENES.map(scene => <figure key={scene.id}><svg viewBox="0 0 1920 1080" role="img" aria-label={`${scene.name} style layout preview`}>
    <rect width="1920" height="1080" fill={theme.background} />
    {scene.id === 'live' ? <><rect x="40" y="200" width="1840" height="820" rx="26" fill="#ffffff0c" /><text x="960" y="550" textAnchor="middle" fill="#ffffff70" fontSize="65" fontFamily={theme.font}>YOUR GAME / WINDOW</text><rect x={right ? 1420 : 40} y="240" width="460" height="640" rx="22" fill="#0b1016" /><text x={right ? 1460 : 80} y="310" fill={theme.accent} fontSize="38" fontFamily={theme.font}>THE ROOM</text><rect x={right ? 40 : 1400} y="770" width="480" height="270" rx="18" fill="#263943" /><text x={right ? 280 : 1640} y="920" fill="#eeeeee" fontSize="36" textAnchor="middle" fontFamily={theme.font}>CAMERA</text></>
      : <><text x="110" y="240" fill={theme.accent} fontSize="120" fontWeight="900" fontFamily={theme.font}>{theme.titles[scene.id]}</text><rect x={scene.id === 'ending' ? 480 : 600} y={scene.id === 'ending' ? 320 : 440} width={scene.id === 'ending' ? 960 : 720} height={scene.id === 'ending' ? 650 : 380} rx="26" fill="#0b1317" /><text x="960" y="650" textAnchor="middle" fill={theme.accent} fontSize="60" fontFamily={theme.font}>{scene.id === 'starting' ? '05:00' : scene.id === 'ending' ? 'YOUR SUPPORTERS' : 'BE RIGHT BACK'}</text></>}
  </svg><figcaption>{scene.name}</figcaption></figure>)}</div>
}
export function StyleStep(props: PageProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('A bold neon studio for a late-night gaming community')
  const theme = props.setup.themeDraft ?? props.setup.theme ?? defaultTheme()
  const running = props.setup.task.phase === 'styling'
  return <section className="panel"><PanelTitle title="Make it look like you" detail="PALETTE · FONT · LAYOUT" />
    <p className="muted">Describe your stream for your configured model, or choose a preset with no AI. These are layout previews with source placeholders; actual captures/widgets appear in Live.</p>
    <textarea aria-label="Stream style description" rows={3} maxLength={1000} value={prompt} onChange={event => setPrompt(event.target.value)} />
    <div className="button-row wrap"><button className="primary" disabled={props.busy || running || !props.ai.settings.model || !prompt.trim()} onClick={() => { void props.action('Generating stream style', () => window.rapidcast.generateSetupTheme(prompt)) }}>✦ Preview AI style</button>{!props.ai.settings.model && <button className="text-button" onClick={() => props.go('settings')}>Configure AI ↗</button>}
      {THEME_PRESETS.map(item => <button className="secondary" disabled={props.busy || running} key={item.name} onClick={() => { void props.action('Previewing style preset', () => window.rapidcast.previewSetupTheme(item)) }}>{item.name}</button>)}</div>
    <h3 className="theme-title">{theme.name}</h3><p className="muted">{theme.font} · {theme.layout} · {theme.background} / {theme.accent}</p><FourSceneStyle theme={theme} />
    <p className="muted">Apply updates managed backgrounds/titles, builtin accents/fonts and Live chat/camera/goal/ticker layout. Custom widget code and other layer types are kept. Recheck picture and Performance after Apply.</p>
    <button className="primary" disabled={props.busy || running || !props.setup.themeDraft || Boolean(props.engine.mode)} onClick={() => { void props.action('Applying stream style', () => window.rapidcast.applySetupTheme()) }}>Apply this style</button>
  </section>
}
