# RapidCast delivery plan

All times are Europe/Stockholm. The full original request is in [BRIEF.md](BRIEF.md). Read this file and AGENTS.md at each phase start. Update status, decisions and evidence before each phase commit.

## Schedule and acceptance

| Phase | Window | Scope | Acceptance | Status |
| --- | --- | --- | --- | --- |
| P0 | Sat Oct 31 evening | Rules, durable plan, Electron/React/TypeScript scaffold, MIT license, initial commit | Strict checks, Vitest, production build and actual Electron smoke check pass; ask for public Client ID | Complete |
| P1 | Sat night | Five real tab layouts, public-client device login, refresh, EventSub, chat/feed, simulator | Linus's chat appears within 2 seconds; simulated events render | Not started |
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

- P0, October 31: npm install completed, 102 packages audited, zero reported vulnerabilities. Runtime audit also reported zero vulnerabilities.
- `npm test`: 17 passing cases in two files. Covers default/override/missing/malformed Client IDs and trusted renderer URL normalization/rejection.
- `npm run build`: passed strict TypeScript checks and all three production bundles. `npm run smoke`: exit 0, verified real Electron React/IPC, no renderer require/process, actual renderer OS sandbox. Screenshot warning is retained separately as described above.
- `npm run dev`: Electron and loopback Vite server started successfully. Native Windows capture showed the complete styled UI, Desktop bridge ready, Secure storage available and Twitch Client ID needed. Final optional native reinspection was stopped by Linus with Escape; no further UI automation performed.
- Direct loopback HTML checks verified distinct CSP nonces per development document and nonce-tagged injected scripts. Production HTML keeps the original restrictive CSP.
- Ignore checks cover .env.local, data/session.json, logs, out, dist and node_modules. No em dashes in the UI/README/docs; no time inputs in implemented UI.
- Hardware capture, microphone/loopback, Twitch authentication, EventSub, encoder throughput and live stream acceptance are not implemented or verified in P0.

## Next handoff

1. P0 is ready for its initial local commit. Ask Linus for the public Twitch Client ID in the phase handoff. No push.
2. On `nästa`, reread AGENTS and PLAN, add supplied Client ID and implement P1.
3. Ask for interactive Twitch login only once the actual device flow is ready. Never ask Linus to paste access tokens, stream keys or AI secrets into this chat.

## Submission tracking

- Working name: RapidCast. Owner: Linus. License: MIT.
- Original Codex chat/session ID: not yet confirmed. Keep build work in this chat and record the actual identifier for P8, never infer it from unrelated app/visualization paths.
- Judging categories are equally weighted per the brief: originality, streamer/chat utility or entertainment, technical quality and use of Codex, design/usability/watchability.
