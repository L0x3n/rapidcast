# RapidCast

## Submission fields

- Project name: RapidCast
- Tagline: A Twitch studio where approved chat ideas become interactive widgets, with isolated tests, portable overlays and stream reports.
- Built with: Codex, TypeScript, Electron, React, Vite, FFmpeg, Twitch Helix/EventSub, Web Workers, OffscreenCanvas, Chart.js, OpenAI-compatible APIs.
- Original Codex chat/session ID: `01a19363-ba10-7cd0-a5b7-58c1e60e709d`.
- Provenance: verified from CODEX_THREAD_ID and the Codex app's thread metadata for Build RapidCast Twitch Studio, whose current turn is the P8 release request. It was not inferred from an attachment or visualization path.
- Repository URL: https://github.com/L0x3n/rapidcast
- Video URL: https://www.youtube.com/watch?v=r1Yl0Qw2ghU
- Windows release: https://github.com/L0x3n/rapidcast/releases/tag/v1.0
- Final demo: 157-second edit with animated captions and original instrumental music, without narration. Simulator and fixed-response endpoint footage are labeled. See DEMO.md for production details.
- Release: published v1.0 submission build; streaming engine remains labeled beta. Read RELEASE.md for measured validation and remaining real-account checks.

The corresponding narrative and actual links were entered in the Devpost project. The fields above are submission notes. See SUBMISSION.md for the final publication record.

## Inspiration

Chat already supplies the energy of a stream. What if it could help build the stage as well?

RapidCast turns that idea into a workflow: a viewer suggests an interactive overlay, the streamer stays in control, and an approved idea becomes something visible in the show. The aim is to make creative stream interaction accessible without asking a new streamer to manage code, browser sources, credentials and model APIs by hand.

## What it does

RapidCast is a desktop Twitch studio with an AI widget builder, approved viewer suggestions, four scenes, portable overlay packs and local stream analytics.

Viewers can suggest a widget with `!widget`, or a channel-point reward when their channel supports it. The streamer can approve, reject or edit an idea. Approved ideas go through generation, static validation and a three-second isolated test before publication. The stream credits the viewer, and the host can acknowledge real Twitch suggestions in chat. Automatic publication is optional and still requires approval first.

The same widgets run in RapidCast's beta H.264/AAC streaming/recording engine or as transparent localhost browser sources in OBS. A guided setup helps select devices, run a short encoder/private sender test, preview a style and check readiness. AI is optional: builtin widgets, practice, recording and packs work without a model.

Stats keeps Twitch and simulator data separate, records local JSONL sessions, marks widget triggers on a timeline and compares chat activity in complete two-minute windows before and after a trigger. Optional Markdown AI reports work from anonymous aggregate metrics. The UI labels associations, missing data and test results clearly.

## How we built it with Codex

The project was built in one continuous Codex chat. Linus supplied the product brief, set priorities and directed phase changes. Codex implemented the Electron/React/TypeScript application, Twitch transport, compositor, Worker runtime, provider client, persistence, tests and release tooling in that same chat. Each phase produced a local Git commit and documented evidence in PLAN.md.

The main process owns credentials and network calls. Twitch and AI keys are encrypted through Electron safeStorage and never passed to widget code. A dedicated compositor uses frame-based capture and bounded MediaRecorder-to-FFmpeg input. Each widget has an OffscreenCanvas Worker in a separate renderer process with enforced network restrictions and watchdogs. The host controls events, images, viewer attribution and publication.

We used existing libraries and prebuilt Electron/FFmpeg binaries, with no native Node addons or node-gyp. New application code was written during the project period; dependencies retain their own licenses.

## Challenges we ran into

Keeping a live program responsive while the app is minimized required a separate compositor, explicit frame handling and measured timing. Backpressure, fresh recording headers during reconnects and simultaneous MP4/RTMP output needed controlled integration tests.

Generated code also needed an execution boundary, not just a syntax check. Workers, response CSP, watchdogs and actual draw tests prevent a failed widget from taking down the show. Imported packs test their actual parameters and dimensions, including hidden widgets, before replacing a layout.

The other challenge was honest evidence. A local encoder test does not prove Twitch delivery, a simulator is not an audience, and a fixed-response AI endpoint does not prove real-model quality. Those distinctions are reflected in the UI, test artifacts and release notes.

## Accomplishments that we're proud of

- A complete local workflow from a screened/approved test idea to an isolated, credited widget on the recorded program.
- Builtin overlays and the same runtime behind an OBS browser-source fallback.
- Guided setup, style previews, local/private output checks and actionable readiness states.
- A real ten-minute minimized local statistics run: 602.815 seconds, exactly 720 simulator messages, one confirmed visible alert trigger, correct history replay and a saved test AI report. These were controlled test events, not real audience results.
- Portable packs exported through Studio and imported in a separate clean profile, preserving all four scene layouts, parameters, theme, images and credits.
- Strict TypeScript, 220 automated test cases, native Electron/Workers/FFmpeg checks and reproducible release tooling. Final release evidence is in RELEASE.md.

## What we learned

AI-generated code becomes useful when it has a small contract, a visible approval step and a failure boundary. A three-second test is valuable evidence, but runtime isolation still has to remain active afterward.

Metrics also need a definition. Own chat, gift recipients, disconnected intervals, replayed events, duplicate overlay clients and incomplete impact windows can all make an attractive graph misleading. RapidCast records observed activity and makes those limits visible.

Codex was most useful when requirements became deterministic checks and actual native tests, with the plan and verification evidence kept in the repository between phases.

## What's next

Finish real-channel acceptance with a second Twitch account and a user-configured model, validate the beta engine under the actual fullscreen game/audio/device load, and gather streamer feedback on the end-to-end workflow. Signing/distribution polish and a community pack gallery are follow-up work. The gallery and optional Codex SDK/ChatGPT sign-in preset are not included in this version.

## Validation disclosure

The public Twitch application ID is included in the release. Real-account login, real-model widget/report quality and latency, actual OBS on-air behavior and the original ten-minute Twitch/fullscreen-game/device-sync acceptance still require Linus's interactive verification. Controlled test endpoints/simulator footage must be labeled in the video. No unperformed live test is claimed here.
