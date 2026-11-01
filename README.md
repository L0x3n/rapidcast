# RapidCast

An AI-native Twitch studio where viewers help build the show. Built with Codex in one continuous chat for the Codex x TwitchCon Hackathon.

**Current stage: P4, v0.2 AI Studio and viewer ideas; streaming engine beta.** Five tabs provide Twitch chat/events, a separate 1080p compositor, capture/audio, local MP4 recording, Twitch output, five canvas widgets, transitions, hotkeys, OBS overlays, optional AI generation/prompt editing and screened viewer suggestions. Preview, recording, simulation and builtin/OBS widgets work without an account or AI key.

Twitch transport and OAuth are implemented and covered by controlled integration tests. Real-account login and the under-two-second chat acceptance check still need Linus's public Client ID and interactive login. They have not been claimed as verified.

## Run on Windows

Requirements: Windows 11, Node.js 24 and npm 11. No OBS, Python, node-gyp or globally installed FFmpeg is needed.

```powershell
cd C:\Users\coute\rapidcast
npm ci
npm run dev
```

For the production build:

```powershell
npm run build
npm start
```

This builds a runnable local Electron app under `out/`. It does not yet create a Windows installer. Exit the window and stop the development terminal with Ctrl+C when finished.

## Verify

```powershell
npm test
npm run build
npm run smoke
npm run smoke:engine
npm run smoke:widgets
npm run smoke:ai
npm run check:rtmp
```

`build` includes strict TypeScript checks. `smoke` opens a real Electron window with a temporary profile, visits all five tabs, fires follow/chat simulations, switches scenes, rejects an invalid Client ID, tests an actual safeStorage encryption round trip, and checks OS sandbox and renderer Node isolation. It also attempts to save `out/smoke.png`; unavailable screenshot capture produces a separate warning after the startup checks pass. It does not log in or contact Twitch. `npm run test:watch` runs Vitest interactively.

`smoke:engine` records synthetic video/audio while minimized, verifies H.264/AAC MP4 and synthetic sync, exercises auto/CPU/60 fps output and captures the test app's own window through MediaStreamTrackProcessor. It saves test clips and timing evidence under `out/engine-smoke/`. `check:rtmp` verifies simultaneous RTMP/MP4 and recovery after a loopback receiver disconnect. Run these sequentially. Neither test contacts Twitch or records the user's screen/camera/microphone.

Earlier Electron screenshot attempts returned `UnknownVizError`; recent engine tests produced screenshots successfully. Streaming output uses canvas tracks, not capturePage. The full ten-minute Twitch/fullscreen-game test is still pending; see [P2 acceptance](docs/P2-TESTS.md).

`smoke:widgets` proves a simulated follow appears in the compositor, verifies the transparent OBS canvas and separate widget renderer process, probes enforced Worker network/eval/DOM/Node restrictions, and injects throwing and infinite-loop widgets during an uninterrupted recording. It also tests scene changes, runtime heartbeat failure and recovery. Evidence is saved in `out/widget-smoke/`. See [P3 tests and widget contract](docs/P3-TESTS.md). The automated browser-source check uses Electron Chromium; importing the URL in OBS itself remains a manual check.

`smoke:ai` uses a local, explicitly mocked OpenAI-compatible endpoint and real Electron/Workers/FFmpeg. It tests encrypted key restoration and isolation, models/completion requests, suggestion screening, static/runtime failures and two repairs, three-second preflight, approval/publication, program pixels and credit, prompt edits, automatic publishing after approval, cancellation and continuous recording. Evidence is in `out/ai-smoke/`. It does not call a paid model or Twitch. Real provider quality/latency and the second-account acceptance remain unverified; see [P4 acceptance](docs/P4-TESTS.md).

## Configuration and security

The public Twitch Client ID belongs in `config/public.json` and is currently blank pending Linus's ID. A local Settings override is available. A client secret is never needed. Do not put tokens, stream keys or AI keys in that file or paste them into chat.

Twitch tokens and AI keys are encrypted through Electron safeStorage in the main process under the OS app data directory. There is no plaintext fallback. Settings are JSON; encrypted credentials are `twitch.bin` and `ai-key.bin`. The renderer has no Node access and only specific validated IPC actions. No saved key, token or private device code is returned to it. Widgets receive public events and host-fetched images, run in individual Workers in a separate renderer process, and cannot use network or eval. Static validation, enforced Worker CSP and host watchdogs work together.

## Connect Twitch

1. [Register a Twitch application](https://dev.twitch.tv/docs/authentication/register-app/) with Client Type **Public**. Device login does not require a callback server or client secret. If the console requires a redirect URL, register `http://localhost`; this flow does not use it.
2. Open Settings, paste the public Client ID and click **Save Client ID**. Changing the ID disconnects the previous account.
3. Click **Connect Twitch**. RapidCast shows a large code, opens Twitch in your browser and polls until you authorize. Log in and approve in the browser yourself. You can cancel or reopen the activation page.
4. Verify **Chat and live events are connected**. Settings lists enabled, unavailable and revoked subscriptions. Non-Affiliate channels retain chat, follows, raids and online/offline events; monetized event types show their requirements.
5. Send a message on your Twitch channel and watch it appear in Live. The composer sends as your connected account. Own messages are marked YOU and ignored by the !widget suggestion parser.

Tokens refresh automatically, with a single refresh shared by concurrent requests. Twitch validation runs at startup and hourly; expiry is checked every minute. Network drops and keepalive timeouts trigger EventSub reconnection. Planned reconnects keep the old socket until the replacement welcome; ordinary drops recreate subscriptions. Events missed during an outage cannot be replayed by Twitch. Disconnect clears local credentials and attempts server revocation.

See [docs/P1-TESTS.md](docs/P1-TESTS.md) for manual acceptance steps and known limits. Implementation follows Twitch's [device-flow documentation](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), and [token validation requirements](https://dev.twitch.tv/docs/authentication/validate-tokens/).

## Preview, record and stream

1. Open Live and Start preview. Refresh displays/windows, add a layer, choose its source and click Apply layer. Each of the four scenes stores its own layers. Position, size, z-order, opacity and crop are editable. Camera and image layers use explicit selection.
2. Choose a mic and desktop audio in the mixer if wanted. Check meters, gain and mute. Record locally, then Stop output and open the recording folder to inspect video and audio.
3. Settings selects 1080p30/60, bitrate, encoder and simultaneous recording. Auto probes NVENC and falls back to x264 veryfast. Stop output before changing these output settings; live layer/audio changes remain available.
4. Connect Twitch and keep Private Twitch bandwidth test enabled for testing. The host retrieves the key and default ingest; it adds bandwidthtest=true so test streams do not go public. Disable that option only when ready to Go Live on Twitch.
5. Complete the real device, ten-minute minimized/fullscreen-game and short public-stream checks in [docs/P2-TESTS.md](docs/P2-TESTS.md). Until then, the engine stays beta. Studio's OBS browser sources are available as the fallback.

The compositor has its own hidden BrowserWindow with background throttling disabled and reads VideoFrames directly from capture tracks. A 30/60 fps canvas and mixed Web Audio feed MediaRecorder, bounded acknowledged IPC chunks, then the bundled FFmpeg process. UI thumbnails update at 2 fps independently of output. Actual frame timing is logged as local JSONL. Stream keys and credential-bearing process arguments are never logged or exposed to the compositor/UI.

**Machine gotcha:** FFmpeg on PATH is a fake Python launcher. Never call it. All engine code and verification scripts require the absolute binary path from `ffmpeg-static`.

## Widgets and OBS

Open Studio, select a scene and fire a simulator event. The five builtins are chat, alerts, countdown, recent events/ending credits and a follow goal. Add instances from the library; select an instance to edit its parameters, restart or remove it. Parameter changes restart that instance, including its countdown. Use Live's Scene layers for geometry, crop, visibility, opacity and order.

Choose Cut, Fade or Swipe. Global shortcuts Ctrl+Alt+F1/F2/F3/F4 select Starting Soon/Live/BRB/Ending; Settings shows registration status. Games or other apps may intercept a shortcut, so test on the actual game before streaming.

In Studio, copy **Follow active scene** or a fixed scene's OBS URL. Add an OBS Browser source at 1920×1080 and 30 fps. Widget-specific URLs are also available beside each instance. Keep RapidCast open; the loopback server sends only transparent widgets and public events, so add game/camera sources directly in OBS. The normal port starts at 17638 and is persisted; if occupied, RapidCast chooses and saves another port. Copy the current URL after a port change. URLs also accept `localhost` instead of `127.0.0.1`.

Advanced users can install a widget ES module through Studio's code panel. Every installation uses the same validator and Worker isolation. Errors or deadlines produce a visible WIDGET PAUSED badge; output continues. Edit parameters/restart after fixing a widget, or remove it. A runtime-process failure pauses widgets together and Restart reconnects the runtime. See [the widget API and limits](docs/P3-TESTS.md).

## AI Studio

1. In Settings, choose OpenAI, OpenRouter, Ollama, LM Studio or Custom. Enter the OpenAI-compatible base URL, optional API key and a text model ID. Save, List models, select an ID, Save again, then Test connection. Remote URLs require HTTPS; HTTP loopback is allowed. A blank key keeps the saved key only for the same endpoint. Changing endpoints clears it.
2. In Studio, describe a widget or choose a placed widget in Build mode and describe an edit. The pipeline shows Writing, Testing, Fixing and Ready. Every module passes static validation and three seconds of simulated events in the same Worker sandbox; at most two repairs. Preview first, then Publish. Prompt edits keep the original on the scene until publication and retain its instance/credit.
3. Enable Accept viewer suggestions. Viewers use `!widget <idea>`; own messages are ignored. Up to 400 characters, per-user cooldown (60 seconds by default), one global intake per five seconds and 20 active queue entries. AI screening must explicitly pass before Approve. Reject or Edit and screen again. AI screening can make mistakes: review the idea and preview yourself.
4. By default, approval builds a preview and waits for Publish. The explicit auto-publish option authorizes publication after your approval and a passed test. Viewer widgets receive a host-drawn `idea by @user` credit. Real Twitch suggestions get a host chat acknowledgment after publication; local simulations never send chat. Account changes prevent approval/publication for another channel.
5. Affiliate/Partner channels can create/update the app-owned Suggest a widget channel point reward in Studio. Its exact reward ID is matched; chat commands remain the fallback. Pause the reward in Twitch when closing RapidCast or disabling intake. Test the full real-model/second-account path in [P4-TESTS.md](docs/P4-TESTS.md).

Large local models can compete for GPU/memory while recording. Provider calls may incur charges. Use a text model that supports Chat Completions; the output-token field is configurable for compatibility. Configuration follows [OpenAI's Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [LM Studio endpoints](https://lmstudio.ai/docs/developer/openai-compat) and [OpenRouter's reference](https://openrouter.ai/docs/api_reference/overview). Codex SDK/ChatGPT sign-in is optional in the brief and is not included in this version.

## Project map

- `src/main`: privileged desktop services.
- `src/main/ai`: provider transport, encrypted settings, generation/repair, isolated testing and suggestion approvals.
- `src/preload`: typed, narrow bridge into the UI.
- `src/renderer`: React studio UI.
- `src/overlay`: shared browser-source/isolated widget host.
- `src/shared`: contracts, configuration and pure logic tests.
- `config/public.json`: public application configuration.
- [AGENTS.md](AGENTS.md): engineering rules and commands.
- [docs/PLAN.md](docs/PLAN.md): phases, acceptance criteria, decisions and verification evidence.
- [docs/BRIEF.md](docs/BRIEF.md): original product requirements.

Uses Electron, electron-vite, Vite, React, TypeScript and Vitest. The lockfile pins dependencies. P0 architecture follows the [electron-vite guide](https://electron-vite.org/guide/) and [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Build process and license

Linus directs scope, design and real stream testing. Codex implements the app in the original project chat, runs checks and records phase decisions in the plan. Each phase ends in a local commit. Nothing is pushed without Linus's instruction.

MIT, copyright 2026 Linus. See [LICENSE](LICENSE).

Downloaded executables and dependencies retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), including the bundled FFmpeg build/source notices.
