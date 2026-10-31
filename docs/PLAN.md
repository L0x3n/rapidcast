# RapidCast delivery plan

All times are Europe/Stockholm. The full original request is in [BRIEF.md](BRIEF.md). Read this file and AGENTS.md at each phase start. Update status, decisions and evidence before each phase commit.

## Schedule and acceptance

| Phase | Window | Scope | Acceptance | Status |
| --- | --- | --- | --- | --- |
| P0 | Sat Oct 31 evening | Rules, durable plan, Electron/React/TypeScript scaffold, MIT license, initial commit | Strict checks, Vitest, production build and actual Electron smoke check pass; ask for public Client ID | Complete |
| P1 | Sat night | Five real tab layouts, public-client device login, refresh, EventSub, chat/feed, simulator | Linus's chat appears within 2 seconds; simulated events render | Implemented; real-account acceptance pending Client ID/login |
| P2 | Sun Nov 1 morning | 1080p compositor, display/window/camera layers, crop/z-order/opacity, mic/desktop mixer, FFmpeg, RTMP reconnect, recording, health | 10-minute bandwidth test with <1% dropped frames while minimized and fullscreen game runs; short real Twitch stream with synchronized audio | Not started |
| P3 | Sun midday | Worker/OffscreenCanvas runtime, five built-ins, four scenes, fade/swipe, hotkeys, localhost overlay | Simulated follow reaches program; broken/slow widget is disabled without interrupting output; tag v0.1 | Not started |
| P4 | Sun afternoon/evening | AI providers, generation/repair/preview, prompt editing, screening, suggestion queue, approvals, attribution/chat reply | Second account sends !widget, approve, widget appears on stream in about 60 seconds | Not started |
| P5 | Sun late | Six-step first-run wizard, devices, 15-second bandwidth test, recommendations, style, Repair | Fresh profile reaches ready to go live in under 5 minutes | Not started |
| P6 | Mon Nov 2 morning | JSONL sessions, live charts, history, widget impact, Markdown AI report | Correct metrics and report after a 10-minute test stream | Not started |
| P7 | Mon late morning | .rcpack export/import, preview before install, sandbox imported code | Export and import on clean profile; scenes/widgets/theme work | Not started |
| P8 | Mon 14:00-20:00 | Fixes only, README, DEVPOST, VIDEO, history scan, clean clone, v1.0 | Reproducible setup, no secrets, release and submission materials ready by 20:00 | Not started |

Feature freeze is Monday 14:00. Submission target is 20:00 for YouTube processing, hard deadline 23:00. P1-P4 are required, P5-P6 preferred, P7 optional. Only consider a community gallery if all other work is complete by Monday 10:00. If engine instability persists Sunday 13:00, mark it beta, make OBS browser sources the main demo path and continue to P3.

## Architecture and product commitments

- Main process owns tokens, safeStorage, Twitch OAuth/EventSub/Helix, AI, FFmpeg and userData JSON/JSONL. Renderer receives sanitized state through narrow IPC. No native Node addons.
- Public Client ID lives in `config/public.json`; blank until Linus supplies it. Settings override comes in P1. App works without Twitch/AI configured and explains next steps.
- Renderer tabs: Live (program, scenes, Go Live/Stop, health, chat/feed), Studio (prompt, library, simulator, suggestions), Setup, Stats, Settings (AI, Twitch, output, devices, hotkeys, Repair).
- Separate unthrottled compositor supplies 1920x1080 at 30/60 fps. Frame timing, backpressure and real dropped-frame counters are required evidence for P2. MediaRecorder/loopback compatibility must be proven on Linus's Windows machine early.
- P3 worker contract: default export with meta/name/description/defaultSize/params, init(api), update(dt), draw(ctx,w,h). API: on, params, now, seeded random, image. Host fetches emotes/avatars. Worker sandbox must deny network and terminate slow execution without blocking compositor/UI.
- Built-ins use code-drawn paths/gradients/text: chat box, alert box, countdown, recent events ticker, goal bar. Optional synthesized alert audio. Starting Soon, Live, BRB, Ending with recent-supporter credits. Same runtime behind localhost overlay URLs for OBS.
- P4 supports OpenAI-compatible URLs, optional keys, /models, test connection and presets OpenAI/OpenRouter/Ollama/LM Studio/Custom. Warn about GPU contention from large local models. AI is optional. Check current Codex SDK docs only in P4; ChatGPT sign-in is optional if time permits.
- Pipeline displays Writing, Testing, Fixing, Ready. Code-only output -> static rejection of imports/network/eval/DOM -> 3-second simulated sandbox test -> at most two repair retries -> preview. Prompt edits reuse this pipeline.
- Suggestions: !widget with per-user cooldown and max length; Affiliate/Partner reward if available; AI safety/title screening; Approve/Reject/Edit queue; optional auto-publish after approval; credit `idea by @user`; host sends bot acknowledgment. Ignore own messages.
- Metrics: viewers every 60s; messages/minute, unique chatters, follows, subs, bits, raids, redemptions, widget triggers. Impact compares 2 minutes after vs 2 minutes before each trigger. Chart triggers on timeline, save reports as Markdown with Copy.
- Packs: JSON .rcpack with metadata, scene/widget/theme definitions, params, code and preview image. Preview contents before installing, validate strictly, sandbox code.
- Setup: Welcome -> Twitch device code/browser -> discovered displays/windows/cameras/mics/meters -> encoders + 15s bandwidth test + one-click output recommendation -> AI style and four-scene preview -> readiness checks and Go Live. Settings Repair reruns checks.
- Output defaults: H.264 NVENC or libx264 veryfast; 2s keyframes; CBR 6000 kbps; AAC 160 kbps 48kHz; RTMP FLV; optional local MP4. Resolve Twitch ingest/key through host APIs and redact credentials everywhere.

## Decisions

### P0, October 31

- Verified the target is its own empty git repo on main. No git commands run in the home repository.
- Use electron-vite with React and strict TypeScript. Build all three process boundaries explicitly. Pin exact npm versions and commit the lockfile. Use current compatible package releases checked against npm metadata and official electron-vite docs.
- Start with an honest foundation screen, not simulated streaming controls. P1 adds the five functional layouts. P0's public-config resolver is tested because it establishes the shipped Client ID / future Settings override behavior.
- Security defaults: sandboxed renderer, context isolation, no Node integration, restrictive CSP, blocked navigation/popups/permissions, validated IPC sender. P2 adds specific device permissions when capture is implemented.
- Add a real Electron smoke script using a disposable profile. It checks React rendering, preload IPC, absence of renderer Node access and actual OS renderer sandboxing, then attempts a screenshot. No secrets or account needed.
- Development React refresh and CSS updates need CSP nonces. A development-only HTML transform generates a fresh nonce per document and marks Vite's injected scripts/styles. Production keeps script-src/style-src self only. Renderer IPC URL validation normalizes the dev server trailing slash and permits in-page anchors while rejecting other origins, ports, paths and queries.
- Electron 45 uses async safeStorage availability checks. No deprecated synchronous storage API. App runtime dependencies are only React/React DOM; Electron and build tools use downloaded prebuilt binaries, with no node-gyp build step.
- `capturePage` failed with UnknownVizError both normally and with a diagnostic --disable-gpu run. Keep GPU defaults unchanged. Startup checks fail on actual app/IPC/isolation problems; screenshot failure is a separate warning. Native Windows computer-use capture successfully displayed the real app and its ready/encryption statuses. P2 must investigate capture separately and prove the real compositor path before claiming reliability.
- No ffmpeg dependency until P2, avoiding accidental PATH execution during scaffolding. No AI SDK until P4. No installer tooling yet; build/start run the bundled app locally and Windows packaging can be added for release.
- Deadline dates follow the brief (November 2, 2026). No claims about external hackathon rules have been independently verified in P0.

## Verification evidence

### P1, October 31

- Implemented Live/Studio/Setup/Stats/Settings layouts, four persisted scene previews, chat/feed, ten simulator fixtures, local public Client ID override, device login/cancel/browser activation, encrypted credentials, auto restore/refresh/validation, subscription diagnostics, viewer polling, chat sending, disconnect/revoke and Twitch Repair.
- All Twitch/AI secrets stay in main; only normalized public events and sanitized account/connection state cross IPC. Public device activation data crosses the bridge, private device_code does not. Specific actions validate sender and inputs, serialize mutations and return plain-word errors.
- Native Node WebSocket and fetch avoid adding runtime network dependencies. Subscriptions start concurrently immediately on welcome. Keepalive watchdogs, planned two-socket transfer, ordinary retry/backoff, deduplication, revocation and unavailable Affiliate features are handled. Bound events to 200 and transport dedupe IDs to 1000.
- Token refresh is single-flight with durable rotation. Startup/hourly validation, per-minute expiry maintenance and one retry after Helix 401. Abort guards cover late OAuth/refresh/encryption completion. Disconnect retains only simulator events. Real revoke success may have an empty response.
- P1 previews are UI layouts with explicit no-output labels. No Go Live function, fabricated engine metrics, installed runtime widgets or AI configuration claims. Setup is a connection/readiness page; guided onboarding remains P5. Stats summarizes the current bounded buffer and excludes tests by default; persistent charts/reports remain P6.
- Final P1 verification: 71 Vitest cases in 8 files passed. `npm run build` passed strict TypeScript and all three production bundles. `npm run smoke` passed across tabs, scene selection, simulator IPC, input rejection, actual encrypted storage and renderer sandbox/isolation, with the known separate capturePage warning. The host's native fetch/WebSocket availability is also checked. Tests include logout with an unreadable encrypted login and failed Repair status.
- Native Windows inspection verified Live and Studio layouts and a clicked Fire event: PixelPilot followed appeared in both the scene preview and test feed with simulated labels. No login dialogs were automated.
- The final `npm run dev` restart built main/preload and started the renderer server successfully without reported startup errors. Linus stopped the optional follow-up native window lookup with Escape, so no further computer-use calls were made. Earlier native visual verification and the final automated smoke remain the UI evidence.
- Linus has not yet supplied the Client ID. config/public.json remains blank; Settings supports an override. Real Twitch login, delivery latency under 2 seconds, real EventSub payloads, restoration and revocation need the manual check in P1-TESTS.md. Do not call real-account acceptance passed.

### P0, October 31

- P0, October 31: npm install completed, 102 packages audited, zero reported vulnerabilities. Runtime audit also reported zero vulnerabilities.
- `npm test`: 17 passing cases in two files. Covers default/override/missing/malformed Client IDs and trusted renderer URL normalization/rejection.
- `npm run build`: passed strict TypeScript checks and all three production bundles. `npm run smoke`: exit 0, verified real Electron React/IPC, no renderer require/process, actual renderer OS sandbox. Screenshot warning is retained separately as described above.
- `npm run dev`: Electron and loopback Vite server started successfully. Native Windows capture showed the complete styled UI, Desktop bridge ready, Secure storage available and Twitch Client ID needed. Final optional native reinspection was stopped by Linus with Escape; no further UI automation performed.
- Direct loopback HTML checks verified distinct CSP nonces per development document and nonce-tagged injected scripts. Production HTML keeps the original restrictive CSP.
- Ignore checks cover .env.local, data/session.json, logs, out, dist and node_modules. No em dashes in the UI/README/docs; no time inputs in implemented UI.
- Hardware capture, microphone/loopback, Twitch authentication, EventSub, encoder throughput and live stream acceptance are not implemented or verified in P0.

## Next handoff

1. P1 implementation is ready and all required automated checks pass. Save the phase in a local commit; no push. Public Client ID was requested asynchronously at phase start and is still pending.
2. Add the supplied public ID to config/public.json, rebuild, then have Linus authorize in his browser and verify a real chat message within 2 seconds. See P1-TESTS.md. Do not request tokens/stream keys/AI keys in chat.
3. On `nästa` or `go`, reread AGENTS and PLAN. Next implementation phase is P2: compositor, capture/audio, FFmpeg RTMP, health and recording. Prioritize proving Windows MediaRecorder/desktop-loopback compatibility and minimized/fullscreen behavior. Keep P1 real-account acceptance explicitly pending if it has not yet been performed.

## Submission tracking

- Working name: RapidCast. Owner: Linus. License: MIT.
- Original Codex chat/session ID: not yet confirmed. Keep build work in this chat and record the actual identifier for P8, never infer it from unrelated app/visualization paths.
- Judging categories are equally weighted per the brief: originality, streamer/chat utility or entertainment, technical quality and use of Codex, design/usability/watchability.
