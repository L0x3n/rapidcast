# P6 session analytics acceptance

## Automated checks

Run from this repository with no other native/GPU smoke running:

```powershell
npm test
npm run build
npm run smoke:stats
npm run smoke:stats:long
```

The short native test records roughly 13 seconds including output startup. The long test records at least ten actual minutes at 720p30 while the Studio is minimized. Both use the real Electron compositor, Worker alert handler and bundled FFmpeg, plus two extra Chromium overlays (OBS-style and Studio preview) to detect duplicate counting. Only the Live alert is visible. A controlled simulator chat rate increases around one follow trigger. The test checks exact message/follow/trigger counts, no Twitch-data contamination, complete or partial window handling, history reload, no raw chat/user fields in the journal, a rendered chart, explicit-only AI requests, saved/copied Markdown and a decoded H.264/AAC MP4. Its local AI endpoint returns a fixed TEST ONLY analysis after checking the anonymous aggregate request. It is not a model-quality test.

Artifacts under ignored `out/stats-smoke/` are overwritten by each run: `report.json`, `session.jsonl`, `simulator-report.md`, `stats.png` when capturePage works, and `stats.mp4`. Screenshot failure is separate from functional results. Preserve long-run evidence before rerunning the short check.

Verified November 1: 179 tests across 24 files, strict production build, short native stats, native widget and fresh setup regressions all passed. The actual long run lasted 602.815 seconds with 720 messages, one unique simulated chatter, one follow, one visible Alert box trigger and 18,037 encoded frames. Its complete impact window measured 60.5 vs 119.5 msg/min (+59, 97.52% association), with no partial/overlapping windows. Journal restoration, exactly one explicit anonymous test AI request, saved/copied Markdown, chart and H.264/AAC decode passed. Preserved long artifacts are in `out/stats-smoke-long/`; later short reruns additionally captured `timeline.png`, `impact.png` and `report.png` for visual inspection. The setup regression explicitly checked that owned benchmarks create zero sessions and the Ready recording creates exactly one.

Unit tests additionally cover a deterministic ten-minute input with 720 messages, 11 unique chatters, 10 minute buckets, a 60 to 120 msg/min complete impact window, 100% association lift, viewer nulls/sample averages, replay and cross-source rejection, own chat exclusion, gift-batch deduplication, partial/disconnected/overlapping windows, zero baselines, corrupt/truncated journal recovery, path validation, output/manual/account boundaries, setup-test exclusion, output continuing when metrics are incomplete, no default AI call and cancellation retaining measured results. Existing widget watchdog tests remain in place.

## Manual checks with a real channel

1. Supply the public Client ID through Settings, connect Twitch and inspect enabled/unavailable event subscriptions. Use a real model in Settings; enter keys only in the app. Prepare actual OBS output or the beta engine's private bandwidth test. OBS **Track OBS stream** collects data only. Setup's performance benchmark is intentionally excluded.
2. Keep Stats on Twitch only, start output/tracking and send known messages from a second account for ten minutes. Send at least one event after minute two and before minute eight that a visible widget handles. Leave four minutes between triggers for isolated windows. Compare totals with a manual event tally; own streamer messages and simulator events must not inflate the Twitch dataset. Account changes must finish the old session instead of mixing channels.
3. Check viewer polls roughly every 60 seconds, including repeated identical values. Counts are Twitch channel viewers; private tests/local recordings do not create a public audience. Disconnect/reconnect the network briefly and verify unknown chat intervals and incomplete impact windows rather than false zero activity. A non-Affiliate account may lack monetized events; missing subscriptions cannot establish zero activity.
4. Stop, switch between Twitch and TEST datasets, inspect impact windows, generate a real-model report, Copy Markdown and Show saved file. Check model claims against measured counts, hypotheses and limits. Cancel another request and verify the measured report persists. Change the provider while a report is running and verify no stale result crosses providers.
5. Restart the app, choose the saved session and verify the same counts/report. For interrupted recovery, close the test process abruptly during a disposable local recording, then restart: a readable unfinished journal should end as interrupted at its last recorded metric, not at restart time. Do not run this destructive test during a real broadcast.

## Definitions and limits

- Session time uses host receipt/processing timestamps. Output sessions begin at the start request and include startup/stopping time; they do not certify that Twitch or OBS was publicly live. Reconnects keep the current session. OBS tracking requires a connected account; practice admits simulator events only and needs compositor preview for triggers. Switching between OBS/manual tracking and engine output closes the previous tracking session.
- Messages exclude the connected account's own chat; unique chatters use per-session HMAC pseudonyms. Resubs count observed resub announcements, not silent renewals. Gift batches contribute their count once; individual gifted subscriptions are excluded from the new-sub total. Twitch/simulator datasets are never combined.
- Chat coverage requires a connected EventSub socket and enabled chat subscription. Other event types depend on their own subscription availability. Viewer polls are separate Helix channel samples; unknown values are null. Viewer average is an unweighted sample mean, not an audience-duration estimate. The viewer timeline uses actual sample times and breaks after 90 seconds without a fresh value.
- A widget trigger is one observed event handled by one placed widget and followed by a successful visible draw frame. It excludes initialization replay, inactive/transparent/offscreen layers, isolated AI preflight, Studio preview and per-widget browser-source previews. Duplicate engine/OBS reports share one host event/widget identity. Engine sessions accept compositor witnesses; OBS sessions accept OBS scene witnesses. Fixed OBS scene URLs can count that scene even when another scene is selected in RapidCast. Visibility does not prove actual viewing or account for full occlusion.
- Impact is the average before/after message count divided by two minutes for each complete window. Windows reaching outside the session, across an EventSub collection gap, or beyond a collection failure are excluded. Overlapping trigger windows remain included but flagged. Baseline zero means unavailable percentage, not infinite lift. At most the latest 200 trigger markers are drawn; totals and impact include all collected triggers.
- Collection freezes honestly after 120,000 rows, 20,000 triggers, 48 hours, a 64 MB journal or a 1 MB write backlog; disk/runtime-delivery failures also mark incomplete. Output keeps running. Reports describe observed lower bounds. Health is sampled at most every ten seconds; health/scene snapshot lists are bounded. The picker lists 200 sessions without deleting older files. Total disk retention is user-managed in this release.
- JSONL is authoritative for replay; atomic metadata sidecars speed the picker. Truncated/invalid rows are skipped and mark incomplete. Unfinished files recover at the last readable timestamp. App shutdown waits for output cleanup and journal/report flushing. Data is local plaintext metrics; encrypted Twitch/AI credentials stay in their existing separate host stores. Viewer/event identifiers are salted per session and the salt is not saved. Public channel IDs and local widget labels remain in metrics.
- A measured report is always available without AI. Optional manual or explicitly enabled automatic analysis sends only aggregate counts, elapsed times, limits and numbered widget comparisons to the configured provider. It reuses existing endpoint/key/timeout/cancellation controls. AI interpretations can be wrong. Reports are shown as plain text, with model HTML/links removed before saving; no model code runs. Original measured counts remain above the AI section.

## Primary references

- [Twitch Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams): channel viewer samples.
- [Twitch EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/): connection/reconnect boundaries and lost-event limitations.
- [Chart.js line charts](https://www.chartjs.org/docs/latest/charts/line.html): null gaps with spanGaps disabled.
- [Chart.js plugin API](https://www.chartjs.org/docs/latest/api/interfaces/Plugin): draw timeline markers after datasets.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): existing optional report transport.

Real-channel counts/viewer cadence, real-model report quality and actual OBS on-air behavior remain manual acceptance. This phase's local ten-minute statistics test does not replace P2's Twitch/fullscreen-game/audio acceptance.
