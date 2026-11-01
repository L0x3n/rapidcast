# RapidCast engineering guide

## Scope and workflow

- This independent repository is `C:\Users\coute\rapidcast`. Always set the working directory explicitly. Never run git commands in `C:\Users\coute`, which is a separate repository.
- Linus owns the project. Talk to him in Swedish. All repository content, code, comments, UI, docs and commit messages use English.
- Read this file and `docs/PLAN.md` at the start of every phase. Read `docs/BRIEF.md` for the full product contract.
- Build everything in the original Codex chat. Preserve its session ID for submission; do not invent an ID. No delegation unless Linus requests it.
- Work one phase per turn. End in Swedish with what is done, how to test (at most five steps), and what comes next. Linus replies `nästa` to continue.
- Decide routine implementation details and record them in PLAN. Ask only for actions Linus must perform: Client ID, logins, live tests and permissions.
- Run tests and build before claiming success. Distinguish automated verification from unperformed hardware or live tests.
- Commit each completed phase with a clear English message. Never push without explicit authorization. Keep `main` unless a branch is needed.

## Deadlines (Europe/Stockholm)

- New project code only, written from October 23, 2026 onward. Libraries and templates are allowed.
- Feature freeze: November 2, 2026 at 14:00. Afterward only fixes, documentation and submission material.
- Target submission: November 2 at 20:00, allowing YouTube processing. Hard deadline: 23:00.
- P1-P4 must ship; P5-P6 should ship; P7 and the gallery are optional.
- If the engine remains unstable November 1 at 13:00, label it beta and prioritize the OBS browser source demo.

## Commands (Node 24, npm 11, Windows 11)

Run in this repository:

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm test -- src/shared/config.test.ts
npm test -- src/shared/config.test.ts -t "rejects malformed client IDs"
npm run test:watch
npm run build
npm run smoke
npm run smoke:engine
npm run smoke:widgets
npm run smoke:ai
npm run smoke:setup
npm run check:rtmp
npm start
```

- `build` runs strict type checks and builds main, preload and renderer into `out/`. `smoke` requires a current build, opens a real Electron window using a temporary profile, verifies IPC and isolation, attempts `out/smoke.png`, and exits. Screenshot failure is reported separately from startup-check results; see PLAN for the capturePage limitation.
- P1 smoke also visits all five tabs, renders follow/chat simulations, persists scene selection, checks invalid Client IDs and performs a real Windows safeStorage encryption round trip. See `docs/P1-TESTS.md` for real-account acceptance.
- P2 `smoke:engine` performs native synthetic 1080p30/60 and CPU recordings, minimized timing, audio/video pulse comparison, and capture of the test app's own window. `check:rtmp` uses loopback only and verifies receiver-disconnect recovery plus simultaneous MP4. Run these sequentially; artifacts are in ignored out/engine-smoke. See `docs/P2-TESTS.md` for the mandatory real Twitch/game tests, which remain pending.
- P3 `smoke:widgets` verifies compositor follow pixels, transparent browser-source canvas, separate widget renderer process, enforced Worker CSP, exception/infinite-loop termination, scene changes, runtime heartbeat loss/recovery and continuous H.264/AAC recording. Artifacts are in ignored out/widget-smoke. OBS itself, real Twitch images/events and fullscreen-game hotkeys still require manual checks in `docs/P3-TESTS.md`.
- P4 `smoke:ai` uses a marked local test endpoint and real Electron/Workers/FFmpeg. It checks encrypted key restore/no secret in public state, screening/approval, two repairs, three-second preflight, visible program/credit/events, prompt replacement, automatic publication after approval, cancellation and continuous recording. It is not a real-model quality/latency or second-account Twitch acceptance. See `docs/P4-TESTS.md`; artifacts in ignored out/ai-smoke.
- P5 `smoke:setup` verifies fresh local onboarding, explicit own-window selection, discovery without camera/mic capture, full 15-second minimized encoding, 720p H.264/AAC, cancellation/locks, strict style data/four previews, saved readiness and Repair. It must not call local completion a real Twitch/network or human five-minute acceptance. Test windows may need show/restore/focus before Windows lists their own source; never substitute another open RapidCast window. See `docs/P5-TESTS.md`.
- Restart the development process after main/preload changes. A stale P0 process cannot serve the new P1 IPC API even if Vite refreshes the renderer.
- No native Node addons or node-gyp. Prebuilt Electron and build-tool binaries are permitted. Keep `package-lock.json` committed and use npm.
- Never execute `ffmpeg` from PATH: it is a fake Python launcher. P2 must use the absolute binary path returned by `ffmpeg-static`.

## Structure and code quality

- `src/main`: privileged Electron services, Twitch, AI, engine, local persistence.
- `src/preload`: narrow typed contextBridge API. Never expose ipcRenderer or generic invoke.
- `src/renderer`: React studio UI, no Node access.
- `src/shared`: platform-independent contracts and logic with Vitest tests.
- Keep source files about 400 lines or fewer. Strict TypeScript, no `any` escapes, actionable plain-language errors.
- Vitest covers event normalization, widget validation, stats aggregation, packs and scene models as those features land. Use deterministic tests for behavior and failure cases.
- Dark, energetic UI, one strong accent, big readable type. No em dash characters in UI, README or submission copy. Free-text time inputs parsed to HH:MM, never input type=time. Date fields open a calendar on click.
- Never show simulated metrics as real stream health. Mark previews and simulator data explicitly.

## Security and data boundaries

- Twitch tokens, stream keys and AI keys exist only in the main process and encrypted Electron safeStorage persistence. Never log them or expose them to renderer/widget code. Do not fall back to plaintext if encryption is unavailable.
- Client ID is public. Ship Linus's ID in `config/public.json` once supplied, with a future Settings override. Never add a client secret.
- Local JSON/JSONL data belongs in Electron userData, not the repository. Ignore `.env*`, `data/`, `*.log`, `out/`, `dist/` and `node_modules/`.
- Use contextIsolation, sandbox, nodeIntegration=false, CSP, sender validation and specific IPC channels. Deny arbitrary navigation, popups and permissions; add narrow device permission handling in P2.
- AI endpoints and Twitch credentials are handled by the host. Widgets receive normalized public events and host-fetched image bitmaps only.
- AI keys are write-only IPC input and encrypted in ai-key.bin, associated with their exact base URL. Never return them in AI state or model lists, echo provider error bodies, follow credential-bearing redirects or reuse a key after endpoint change. ai.json holds nonsecret config and a bounded suggestion queue. No AI build publishes before its isolated three-second test passes; at most two code repairs. Real viewer publication requires approval, even with auto-publish enabled. Never send simulator acknowledgments to Twitch.
- Each widget runs in a separate Worker with OffscreenCanvas, no DOM, Node, network or tokens. Static checks alone are not isolation: enforce runtime network restrictions and watchdog termination. Widget failure must never stop the stream.
- Validate imported packs before installation. Imported and generated code always goes through the same sandbox pipeline.

## Twitch and engine gotchas

- Device flow is a Public client with no secret. Device request uses `scopes` plural; token grant is `urn:ietf:params:oauth:grant-type:device_code`. Refresh automatically.
- Use Electron 45 async safeStorage APIs. Store only ciphertext in twitch.bin. Cancellation must prevent late encryption/refresh work from restoring credentials after logout. Refresh requests are single-flight because Public-client refresh tokens rotate.
- Validate Twitch tokens at startup and hourly, check expiry each minute, and retry a Helix 401 once with refreshed credentials. Never echo remote error bodies into logs/UI. Twitch revocation can return HTTP 200 with an empty body.
- Full scopes, Helix routes and EventSub types are listed in BRIEF. Subscribe within 10 seconds of welcome; support keepalive, reconnect and revocation. Follow v2 uses moderator_user_id equal to the logged-in user.
- Ignore the app account's own chat messages when parsing commands. Custom rewards require Affiliate/Partner; chat commands are the fallback.
- Resolve the stream key and default ingest through Twitch APIs. Bandwidth tests append `?bandwidthtest=true` and never go public.
- P2: compositor -> MediaRecorder -> bounded IPC chunks -> ffmpeg-static -> H.264/AAC FLV RTMP, optional MP4. NVENC preferred, libx264 veryfast fallback, 2-second keyframes, default 6000 kbps video / 160 kbps 48 kHz audio.
- Streaming must survive minimizing and fullscreen games. Use a dedicated compositor window with background throttling disabled or offscreen rendering, track-based frame reading and frame timing logs. Measure, do not assume.
- P2 uses a hidden, sandboxed compositor BrowserWindow with backgroundThrottling=false and its own nonpersistent session. The same bundled preload branches on a host-supplied additional argument; the compositor receives only compositor APIs, never the studio/Twitch bridge. Keep the preload a single bundled CJS entry because sandboxed preload cannot require split local chunks.
- Camera/display reads use MediaStreamTrackProcessor with one retained VideoFrame per source; close replaced frames. MediaRecorder queues are bounded and host writes are acknowledged. Restarted FFmpeg requires a fresh recorder/header. Do not skip input WebM chunks to relieve pressure.
- FFmpeg tee uses global -use_fifo/-fifo_options and disables FIFO on its file slave. Nested FIFO options in the slave string were proven to be misparsed by this binary. Preserve the real loopback integration test, including spaces/apostrophes in paths. Never log credential-bearing arguments or raw stderr.
- Secrets stay in main even for output. Retrieve the key and default ingest through Twitch, prefer the supplied RTMPS URL and append bandwidthtest=true only for test mode. Stop Twitch output on account disconnect/revocation. Local recording can work without Twitch.
- Compositor missed slots, encoder drops/duplicates and network outage packets are separate metrics. Unknown muxer bitrate is null. After stop, label retained encoder measurements as last output. UI thumbnails are only 2 fps and do not measure output smoothness.
- Source failures warn and preserve the last frame; compositor crash/watchdog failure stops output. Release devices stops tracks/audio and releases the suspension blocker. Keep runtime warnings plain and actionable. Do not claim the full ten-minute game/Twitch acceptance from short synthetic benchmarks.
- P5 keeps the compositor canvas at 1920×1080 and uses FFmpeg scaling for 720p output. Missing resolution in older settings migrates to 1080p. Setup tests own an output lease: block competing starts/program/scene/widget changes, retain emergency Stop, release the lease even on cancellation/shutdown error. A local result never authorizes Twitch readiness. Private sender tests still require the user's Inspector review. Bind evidence to current program/widget params, encoder/channel, tested load and a 30-minute lifetime; selected tracks must actually be open.
- Exclude secret-bearing ffmpeg arguments and URLs from logs/errors. Reconnect on RTMP drops with clear user-facing recovery status.

## Release

- P3 tags v0.1 after its acceptance test; P8 tags v1.0 only after release checks.
- P8 includes README, DEVPOST, 3-minute VIDEO shot list, git-history secret scan and clean-clone test. No secrets in submission artifacts.
- Judges may only see the video and text. Prioritize visible chat-to-widget interaction, legibility, reliability and honest status.
