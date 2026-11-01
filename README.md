# RapidCast

An AI-native Twitch studio where viewers help build the show. Built with Codex in one continuous chat for the Codex x TwitchCon Hackathon.

**Current stage: P7, v0.5 portable overlay packs; streaming engine beta.** Export and review/import four-scene .rcpack layouts with widgets, parameters, themes and embedded images. Imported widget configurations pass the existing isolated tests before installation. Guided setup, capture/audio, MP4/Twitch output, OBS overlays, approved viewer ideas and session analytics remain available. Local setup/recording, practice statistics, packs and builtin widgets work without Twitch or AI.

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
npm run smoke:setup
npm run smoke:stats
npm run smoke:stats:long
npm run smoke:packs
npm run check:rtmp
```

`build` includes strict TypeScript checks. `smoke` opens a real Electron window with a temporary profile, visits all five tabs, fires follow/chat simulations, switches scenes, rejects an invalid Client ID, tests an actual safeStorage encryption round trip, and checks OS sandbox and renderer Node isolation. It also attempts to save `out/smoke.png`; unavailable screenshot capture produces a separate warning after the startup checks pass. It does not log in or contact Twitch. `npm run test:watch` runs Vitest interactively.

`smoke:engine` records synthetic video/audio while minimized, verifies H.264/AAC MP4 and synthetic sync, exercises auto/CPU/60 fps output and captures the test app's own window through MediaStreamTrackProcessor. It saves test clips and timing evidence under `out/engine-smoke/`. `check:rtmp` verifies simultaneous RTMP/MP4 and recovery after a loopback receiver disconnect. Run these sequentially. Neither test contacts Twitch or records the user's screen/camera/microphone.

Earlier Electron screenshot attempts returned `UnknownVizError`; recent engine tests produced screenshots successfully. Streaming output uses canvas tracks, not capturePage. The full ten-minute Twitch/fullscreen-game test is still pending; see [P2 acceptance](docs/P2-TESTS.md).

`smoke:widgets` proves a simulated follow appears in the compositor, verifies the transparent OBS canvas and separate widget renderer process, probes enforced Worker network/eval/DOM/Node restrictions, and injects throwing and infinite-loop widgets during an uninterrupted recording. It also tests scene changes, runtime heartbeat failure and recovery. Evidence is saved in `out/widget-smoke/`. See [P3 tests and widget contract](docs/P3-TESTS.md). The automated browser-source check uses Electron Chromium; importing the URL in OBS itself remains a manual check.

`smoke:ai` uses a local, explicitly mocked OpenAI-compatible endpoint and real Electron/Workers/FFmpeg. It tests encrypted key restoration and isolation, models/completion requests, suggestion screening, static/runtime failures and two repairs, three-second preflight, approval/publication, program pixels and credit, prompt edits, automatic publishing after approval, cancellation and continuous recording. Evidence is in `out/ai-smoke/`. It does not call a paid model or Twitch. Real provider quality/latency and the second-account acceptance remain unverified; see [P4 acceptance](docs/P4-TESTS.md).

`smoke:setup` verifies a fresh six-step local route, device discovery without capture, explicit selection of only its own test window, cancellation/locks, a full 15-second minimized encoder sample, actual 720p H.264/AAC output, strict theme JSON/four previews, saved readiness and nondestructive Repair. It proves that local results cannot unlock Twitch. It uses a fixed-response style endpoint and no physical camera/mic/system-audio capture or real Twitch connection. Screenshots, clips and report are in `out/setup-smoke/`; see [P5 tests](docs/P5-TESTS.md). Automated local completion is not evidence that a person completed the real Twitch route within five minutes.

`smoke:stats` checks automatic session boundaries, separate Twitch/simulator metrics, one actual widget trigger without duplicates from extra overlays, history replay, Chart.js rendering and an explicitly requested anonymous AI Markdown report. `smoke:stats:long` runs the same path with ten actual minutes of minimized local H.264/AAC recording and a complete two-minute before/after window. Both use simulator events and a fixed-response loopback AI endpoint. They do not verify real Twitch delivery or model quality. Run all native/GPU checks sequentially. Evidence is in `out/stats-smoke/`; see [P6 tests](docs/P6-TESTS.md).

`smoke:packs` exports through the actual Studio UI, exits, and launches a separate clean Electron profile to review/test/install the result. It checks code/parameter/dimension testing, a real Worker failure with imported parameters, static network rejection, cancellation/locks, all four scene layouts, theme/credit/image persistence, program pixels and H.264/AAC recording. The harness chooses owned fixture files instead of displaying OS file dialogs. Evidence is in `out/packs-smoke/`; see [P7 tests](docs/P7-TESTS.md). It does not log in, call an AI provider, capture physical devices or start Twitch/OBS output.

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
3. Settings selects 1080p/720p at 30/60 fps, bitrate, encoder and simultaneous recording. The program canvas stays 1920×1080; FFmpeg scales only the encoded 720p output. Auto probes NVENC and falls back to x264 veryfast. Stop output before changing these output settings; live layer/audio changes remain available.
4. Connect Twitch and keep Private Twitch bandwidth test enabled for testing. The host retrieves the key and default ingest; it adds bandwidthtest=true so test streams do not go public. Disable that option only when ready to Go Live on Twitch.
5. Complete the real device, ten-minute minimized/fullscreen-game and short public-stream checks in [docs/P2-TESTS.md](docs/P2-TESTS.md). Until then, the engine stays beta. Studio's OBS browser sources are available as the fallback.

The compositor has its own hidden BrowserWindow with background throttling disabled and reads VideoFrames directly from capture tracks. A 30/60 fps canvas and mixed Web Audio feed MediaRecorder, bounded acknowledged IPC chunks, then the bundled FFmpeg process. UI thumbnails update at 2 fps independently of output. Actual frame timing is logged as local JSONL. Stream keys and credential-bearing process arguments are never logged or exposed to the compositor/UI.

**Machine gotcha:** FFmpeg on PATH is a fake Python launcher. Never call it. All engine code and verification scripts require the absolute binary path from `ffmpeg-static`.

## First-run setup and Repair

New/incomplete profiles open Setup automatically and resume their saved step. Choose Twitch or Local recording, then work through Welcome → Twitch → Devices → Performance → Style → Ready. The Twitch step shows the existing device login code/browser flow; local setup can skip it honestly.

Entering Devices refreshes choices without starting capture. Select a display/window, optional camera/mic and desktop audio, then Apply. This replaces display/camera choices in Live, keeps other layers/scenes and starts the selected capture. Check the actual picture, audio meters and a recording yourself. None is an explicit choice for a widgets-only or silent program. Readiness also checks that selected tracks are open; a frozen last frame does not count as healthy capture.

Performance samples the Live scene for 15 seconds after output startup and stops automatically. Local tests verify encoding only. Private Twitch tests use the host-held bandwidth-test target; sender observations do not prove remote ingestion or maximum upload capacity. Review the test in Twitch Inspector and confirm your review. Apply a conservative 720p/1080p, 30/60 fps and bitrate recommendation; heavier/changed output needs another test. Setup locks program changes and other output starts during its test; Stop remains available.

Style accepts a description through the configured AI or offers presets without AI. Only validated colors, a supported system font, layout and four short titles are accepted. Review all four placeholder layouts, then Apply to managed backgrounds/titles and builtin widget styling/layout. Custom widget code is kept. Recheck the picture and Performance after styling.

Ready distinguishes local recording from public Twitch output. It requires current preview/tracks, your picture/audio checks, rendered active widgets and recent matching performance evidence; Twitch also requires a connected account, its private test and your Inspector review. Results expire after 30 minutes and bind to the program/widget params, output load, encoder and channel. Save setup or explicitly Start local recording / Go Live on Twitch. Short setup checks do not replace the full P2 game/audio acceptance.

Settings and Setup both offer Recheck setup. It checks encryption, encoder, choices and overlay; a saved Twitch login is revalidated and a configured AI gets a small completion check. It keeps sources/settings/credentials, clears stale performance approvals and asks for a fresh test. Cancel waits for any already-running diagnostic to finish; Repair never stops an existing live output or silently starts a private/public stream. Details and manual acceptance are in [P5-TESTS.md](docs/P5-TESTS.md).

## Widgets and OBS

Open Studio, select a scene and fire a simulator event. The five builtins are chat, alerts, countdown, recent events/ending credits and a follow goal. Add instances from the library; select an instance to edit its parameters, restart or remove it. Parameter changes restart that instance, including its countdown. Use Live's Scene layers for geometry, crop, visibility, opacity and order.

Choose Cut, Fade or Swipe. Global shortcuts Ctrl+Alt+F1/F2/F3/F4 select Starting Soon/Live/BRB/Ending; Settings shows registration status. Games or other apps may intercept a shortcut, so test on the actual game before streaming.

In Studio, copy **Follow active scene** or a fixed scene's OBS URL. Add an OBS Browser source at 1920×1080 and 30 fps. Widget-specific URLs are also available beside each instance. Keep RapidCast open; the loopback server sends only transparent widgets and public events, so add game/camera sources directly in OBS. The normal port starts at 17638 and is persisted; if occupied, RapidCast chooses and saves another port. Copy the current URL after a port change. URLs also accept `localhost` instead of `127.0.0.1`.

Advanced users can install a widget ES module through Studio's code panel. Every installation uses the same validator and Worker isolation. Errors or deadlines produce a visible WIDGET PAUSED badge; output continues. Edit parameters/restart after fixing a widget, or remove it. A runtime-process failure pauses widgets together and Restart reconnects the runtime. See [the widget API and limits](docs/P3-TESTS.md).

## Share and import overlay packs

In Studio, expand **Overlay packs**. Enter a name, optional author and description, then **Export current layout**. Choose where to save the .rcpack file. It includes all four scene layouts, placed widget code/parameters/credits, transition, optional theme and embedded PNG images. Its thumbnail is a layout diagram, not a screenshot of your capture. Scene text, widget source and image pixels are shared; review them before distributing the file.

Capture identities and window titles become hidden, unbound display/camera placeholders. Account credentials, AI/provider settings, audio devices, output settings, ports, hotkeys, stats and chat history are omitted. PNG/JPEG layer images are normalized to PNG and resized to fit 1920×1080; if an existing WebP or another image cannot be decoded, convert it to PNG/JPEG first. Packs support 16 MB total, 16 images (2 MB each, 8 MB combined), a 512 KB PNG thumbnail, 32 widget definitions/instances, eight widgets and 24 total layers per scene. Only used code/images are included.

Choose **Open pack to review**. Inspect its metadata, author thumbnail, four generated layer diagrams and widget source/credits. Author information and the provided thumbnail are unverified. No widget code runs while opening/reviewing the file. Stop engine output before testing/installing; stop OBS yourself before replacing layouts used by its browser sources. **Test in sandbox** checks every unique code/parameter/size combination for three seconds, including hidden widgets. Cancel keeps the current layout. Invalid code or a failing configuration prevents installation; imports are never silently rewritten or repaired by AI.

After all tests pass, **Replace four scenes** explicitly installs the reviewed snapshot. Export your existing layout first to keep it. Installation stops compositor preview, replaces all placed layers/widgets, retains the existing widget library and your host output/audio settings, stores the imported theme, and clears old setup approvals. It does not start capture or streaming. Select your own capture sources, start preview, inspect all scenes and repeat Setup picture/audio/performance checks. Scene/program OBS URLs stay the same; widget-specific URLs change and must be copied again.

Layout files are saved as a group with a private rollback journal. A save/application failure restores the prior files; an interrupted process is recovered before the next startup loads its settings. The journal contains only previous engine/widget/setup files and is never included in a shared pack. Newly staged PNG files may remain unused after a failed import. Imported widgets retain Worker/CSP/watchdog isolation at runtime; passing a short test is not a guarantee of permanent correctness. See [format, checks and manual acceptance](docs/P7-TESTS.md). The optional community gallery is not included.

## AI Studio

1. In Settings, choose OpenAI, OpenRouter, Ollama, LM Studio or Custom. Enter the OpenAI-compatible base URL, optional API key and a text model ID. Save, List models, select an ID, Save again, then Test connection. Remote URLs require HTTPS; HTTP loopback is allowed. A blank key keeps the saved key only for the same endpoint. Changing endpoints clears it.
2. In Studio, describe a widget or choose a placed widget in Build mode and describe an edit. The pipeline shows Writing, Testing, Fixing and Ready. Every module passes static validation and three seconds of simulated events in the same Worker sandbox; at most two repairs. Preview first, then Publish. Prompt edits keep the original on the scene until publication and retain its instance/credit.
3. Enable Accept viewer suggestions. Viewers use `!widget <idea>`; own messages are ignored. Up to 400 characters, per-user cooldown (60 seconds by default), one global intake per five seconds and 20 active queue entries. AI screening must explicitly pass before Approve. Reject or Edit and screen again. AI screening can make mistakes: review the idea and preview yourself.
4. By default, approval builds a preview and waits for Publish. The explicit auto-publish option authorizes publication after your approval and a passed test. Viewer widgets receive a host-drawn `idea by @user` credit. Real Twitch suggestions get a host chat acknowledgment after publication; local simulations never send chat. Account changes prevent approval/publication for another channel.
5. Affiliate/Partner channels can create/update the app-owned Suggest a widget channel point reward in Studio. Its exact reward ID is matched; chat commands remain the fallback. Pause the reward in Twitch when closing RapidCast or disabling intake. Test the full real-model/second-account path in [P4-TESTS.md](docs/P4-TESTS.md).

Large local models can compete for GPU/memory while recording. Provider calls may incur charges. Use a text model that supports Chat Completions; the output-token field is configurable for compatibility. Configuration follows [OpenAI's Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [LM Studio endpoints](https://lmstudio.ai/docs/developer/openai-compat) and [OpenRouter's reference](https://openrouter.ai/docs/api_reference/overview). Codex SDK/ChatGPT sign-in is optional in the brief and is not included in this version.

## Sessions, charts and reports

Open Stats during recording, a private test or public output. Tracking starts with the output request and ends after Stop; reconnects stay in the session. Setup performance tests are excluded. For OBS, connect Twitch and click **Track OBS stream**, then **Stop tracking** when finished. These controls only collect metrics; they do not start or stop OBS. **Start practice** records simulator events only; start preview to run widgets and use Studio's simulator. Practice needs no Twitch connection.

Choose a session and either **Twitch events only** or **Simulator only · TEST**. They are never combined. Counts include observed messages, unique chatters, follows, new subs/resub announcements/gift batches, bits, raids/raid viewers, redemptions and visible widget triggers. Own chat is excluded. Gift recipients are not counted again after their gift batch. Twitch viewer values are channel samples from Helix, including when local output is only recording or private testing. Unknown values stay unknown; the average is the arithmetic mean of successful samples.

The timeline shows messages in each elapsed minute, sampled viewers at their poll times and orange widget-trigger markers. Hover to inspect. A partial final minute is counted without extrapolation; missing chat coverage appears as a gap. A widget trigger means a registered handler completed and returned a visible frame. Initial history replay, inactive scenes, Studio previews, preflight tests and duplicate overlay clients do not inflate totals. This cannot prove that OBS was on air, that a widget was unobscured, or that a viewer saw it.

The impact table compares two minutes before and after each trigger, ranks average message-rate changes per widget, and excludes partial/disconnected windows. A zero baseline has no percentage lift. Overlapping windows are flagged. These are associations; changes in audience, raids or other events may explain the activity.

Stop saves separate measured Markdown reports for Twitch and simulator data. **Write AI analysis** optionally sends anonymous aggregate totals and numbered widget comparisons to the configured provider. The auto-report checkbox authorizes future requests after Stop and defaults off. Cancel or provider errors retain the measured report. Use **Copy Markdown** or **Show saved file**. Reports are displayed as plain text. Provider keys stay in the existing encrypted host boundary.

Session journals and reports live in Electron userData under `sessions/`; `stats.json` contains only the auto-report preference. Journals omit raw chat text and event user names and use a random per-session HMAC for chatter/event identifiers; the salt is not persisted. Public channel IDs and local widget labels are retained. The picker shows the latest 200 journals; older files are kept. Collection stops at 120,000 metric rows, 20,000 widget triggers, 48 hours, a 64 MB journal or a 1 MB pending-write limit. A limit/disk failure marks the session incomplete and preserves streaming output. Restart recovers an unfinished journal at its last readable timestamp. Local files are not encrypted and may be removed from the app data folder while RapidCast is closed.

## Project map

- `src/main`: privileged desktop services.
- `src/main/ai`: provider transport, encrypted settings, generation/repair, isolated testing and suggestion approvals.
- `src/main/stats`: bounded session journals, recovery, history and measured/AI reports.
- `src/main/packs`: portable export, bounded review, sandbox configuration tests and transactional installation.
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
