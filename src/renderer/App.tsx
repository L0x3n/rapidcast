import { useEffect, useState } from 'react'
import type { AppInfo } from '../shared/contracts'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.rapidcast.getAppInfo().then(setInfo).catch(() => {
      setError('The studio could not connect to its desktop services. Restart RapidCast and try again.')
    })
  }, [])

  return (
    <div className="studio" data-app-ready={info ? 'true' : 'false'}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="RapidCast home">
          <span className="brand-symbol" aria-hidden="true">R<span>↗</span></span>
          RapidCast<span className="version">PREVIEW 0.0</span>
        </a>
        <div className="local-status"><span className="status-dot" />LOCAL STUDIO<span className="divider">/</span>NOT LIVE</div>
      </header>

      <main id="home">
        <section className="intro">
          <div className="eyebrow"><span />THE NEXT GENERATION GOES LIVE</div>
          <h1>Your stream.<br /><span>Built live.</span></h1>
          <p className="lead">A studio for you. A playground for chat.<br />Turn your audience's ideas into part of the show.</p>
          <a className="primary-action" href="#foundation">Explore your studio <span aria-hidden="true">↗</span></a>
          <p className="phase-note">Foundation preview. Twitch connection comes next.</p>
        </section>

        <section className="preview" aria-label="Illustrative overlay preview">
          <div className="preview-header"><span><i /> PROGRAM CONCEPT</span><span>1920 × 1080</span></div>
          <div className="program-art">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="art-grid" />
            <div className="on-air-label">YOUR NEXT GREAT STREAM</div>
            <div className="preview-title">PRESS<br /><span>START.</span></div>
            <div className="idea-card"><span className="idea-icon">✦</span><div><small>CHAT HAS AN IDEA</small><strong>Make it rain confetti</strong><span>Imagine it. Approve it. Watch it happen.</span></div></div>
            <span className="preview-label">ILLUSTRATION · NO STREAM OUTPUT</span>
          </div>
          <div className="preview-footer"><span className="waveform" aria-hidden="true">▂▅▃▇▅▂▆▃▅▇▃▂</span><span>Made for the moments you can't script.</span><span>✦</span></div>
        </section>

        <section id="foundation" className="foundation">
          <div className="section-heading"><div><span className="eyebrow">01 / THE FOUNDATION</span><h2>A good show starts here.</h2></div><span className="build-badge">P0 · SETUP</span></div>
          <div className="feature-grid">
            <article><span className="feature-number">01 ↗</span><h3>One studio. Your show.</h3><p>Capture, scenes, audio and Twitch output are planned for the engine phase.</p><span className="feature-status">ENGINE IN P2</span></article>
            <article><span className="feature-number">02 ✦</span><h3>Chat joins the build.</h3><p>Viewers suggest a widget. You approve the idea. AI brings it to the stream.</p><span className="feature-status">WIDGETS IN P3 + P4</span></article>
            <article><span className="feature-number">03 ◈</span><h3>Your setup. Your choice.</h3><p>Start without AI. Later, connect your own provider or a local model.</p><span className="feature-status">AI IN P4</span></article>
          </div>
        </section>

        <section className="system-strip" aria-label="Desktop foundation status" aria-live="polite">
          <span className="system-label">SYSTEM CHECK</span>
          {error ? <p className="error" role="alert">{error}</p> : <>
            <span><i className={info ? 'check' : 'pending'} />{info ? 'Desktop bridge ready' : 'Checking desktop bridge'}</span>
            <span><i className={info?.secureStorageAvailable ? 'check' : 'pending'} />{info?.secureStorageAvailable ? 'Secure storage available' : 'Secure storage not confirmed'}</span>
            <span><i className="pending" />{info?.twitchClientConfigured ? 'Twitch login arrives in P1' : 'Twitch Client ID needed'}</span>
          </>}
        </section>
      </main>
      <footer><span>BUILT WITH CODEX · MADE FOR TWITCH</span><span>RapidCast / {info?.version ?? '0.0.0'}<span className="footer-star">✦</span></span></footer>
    </div>
  )
}
