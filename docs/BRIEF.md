You are the lead engineer of RapidCast (working name), my entry to the Codex x TwitchCon Hackathon on Devpost. I am Linus. Talk to me in Swedish. Everything in the repo (code, comments, UI text, README, docs, commit messages) is in English.

# Deadline and rules that shape the build
- Hard deadline: Monday Nov 2, 23:00 Swedish time (14:00 PT). I submit by 20:00 so YouTube can process the video.
- Feature freeze: Monday 14:00 Swedish time. After that only fixes, docs and submission material.
- The project must connect to Twitch and be built with Codex in THIS thread. Its session ID goes into the submission, so do all build work here.
- All code is new, written from Oct 23 2026. Libraries and templates are fine.
- The repo must hold everything needed to run the app, with setup instructions and no secrets.
- Judges may only watch a 3 minute video and read the text, so what shows on stream matters most. Four equally weighted criteria: originality, usefulness or entertainment for streamers and their chat, technical quality including how well Codex was used, and design ("easy to use and fun to watch").

# Machine
- Windows 11, Node 24, npm 11, i7-11700F, 32 GB RAM, RTX 3060 Ti (NVENC), three 1920x1080 monitors.
- The project lives in C:\Users\coute\rapidcast, already its own empty git repo on branch main. C:\Users\coute is a separate git repo: never run git commands there.
- The ffmpeg on PATH is a fake Python launcher. Never call it. Use the ffmpeg-static npm package and its binary by full path.

# Product
RapidCast is an AI-native streaming studio for Twitch: its own streaming engine (no OBS needed), near-automatic setup for new streamers, a prompt window that builds interactive overlay widgets, viewers who suggest widgets that get built live on stream, stats with an AI stream report, shareable overlay packs, and bring-your-own AI model (paid or local).

Tabs:
1. Live: program preview, scene switcher, Go Live/Stop, health bar (fps, bitrate, dropped frames), chat and event feed.
2. Studio: prompt window, widget library, preview with event simulator, queue of chat suggestions.
3. Setup: first-run onboarding for new streamers.
4. Stats: live charts, history, widget impact, AI stream report.
5. Settings: AI provider, Twitch account, output, devices, hotkeys, Repair.

# Stack
- Electron + Vite + React + TypeScript (strict). electron-vite or Electron Forge's vite-typescript template, your choice.
- No native Node modules (no node-gyp). Data as JSON/JSONL in the app data folder.
- Vitest for all pure logic: event normalization, widget validation, stats aggregation, pack import/export, scene model.
- Secrets (Twitch tokens, stream key, AI keys) live only in Electron safeStorage. Never log them, never expose them to widget code, never commit them. .gitignore covers .env*, data/, *.log, out/, dist/.
- Files under about 400 lines. Errors shown in plain words with what to do next.

# Twitch
- Login: Device Code Flow as a Public client, no secret. POST https://id.twitch.tv/oauth2/device takes client_id and "scopes" (plural). Poll the token endpoint with grant_type urn:ietf:params:oauth:grant-type:device_code. Refresh tokens automatically.
- Scopes: user:read:chat user:write:chat moderator:read:followers channel:read:subscriptions bits:read channel:read:redemptions channel:manage:redemptions channel:read:stream_key channel:manage:broadcast
- EventSub over WebSocket (wss://eventsub.wss.twitch.tv/ws). Subscribe within 10 s of session_welcome. Handle keepalive, session_reconnect and revocation. Types: channel.chat.message, channel.follow v2 (moderator_user_id = me), channel.subscribe, channel.subscription.gift, channel.subscription.message, channel.cheer, channel.raid, channel.channel_points_custom_reward_redemption.add, stream.online, stream.offline.
- Helix: GET /streams for viewers (every 60 s), GET /streams/key so nobody copies the key by hand, POST /chat/messages for bot replies, PATCH /channels for title and category. Custom rewards only work for Affiliate/Partner; otherwise use chat commands.
- Ingest: GET https://ingest.twitch.tv/ingests, use the default. Append ?bandwidthtest=true to the key for test streams that never go public.
- My Client ID is public (not a secret for a Public client). Ship it as the default in a config file so judges can log in, and let Settings override it.
- Ignore the app's own chat messages when parsing commands.

# Streaming engine
- The compositor renders a 1920x1080 program at 30 or 60 fps from layers: display or window capture, camera, image, text, color and widget. Each layer has position, size, z-order, opacity and crop.
- Audio mixer: mic and desktop audio (loopback) with gain, mute and meters.
- Output: program video + mixed audio -> MediaRecorder -> chunks over IPC -> ffmpeg-static stdin -> H.264 (h264_nvenc, fallback libx264 veryfast), keyframe every 2 s, CBR 6000 kbps by default, AAC 160 kbps 48 kHz -> FLV to Twitch RTMP. Optional tee to a local MP4 recording.
- It MUST keep streaming smoothly when the app is minimized or a fullscreen game has focus. Chromium throttles hidden windows, so run the compositor in its own offscreen-rendered BrowserWindow (webPreferences.offscreen, setFrameRate) or with backgroundThrottling false, and read capture frames with MediaStreamTrackProcessor instead of relying on <video> elements. Log frame timing so we can prove it.
- Reconnect automatically when RTMP drops. Translate ffmpeg errors into plain words.

# Widget runtime (heart of Studio)
- A widget is one ES module: export default { meta: { name, description, defaultSize: { w, h }, params }, init(api), update(dt), draw(ctx, w, h) }.
- Each widget runs in its own Worker with an OffscreenCanvas and hands frames to the compositor. No DOM, no Node, no network, no tokens. Emotes and avatars are fetched by the host and passed in as ImageBitmaps via api.image(key). A widget that throws or runs too slow is disabled with a visible badge; the stream never stops.
- api: on(type, handler), params, now(), random() (seeded), image(key). Normalized events: chat {user, color, text, emotes, badges}, follow {user}, sub {user, tier, months, gifted}, cheer {user, bits, text}, raid {from, viewers}, redeem {user, reward, input}, streamOnline, streamOffline.
- Built-in widgets: chat box, alert box (follow, sub, cheer, raid), countdown, recent events ticker, goal bar. Drawn with code only (paths, gradients, text), no bitmap assets. If time allows: a few synthesized alert sounds mixed into the stream.
- Scenes: Starting Soon, Live, BRB, Ending (credits with recent supporters). Transitions (fade, swipe) and global hotkeys.
- The same runtime serves http://localhost:<port>/overlay/<sceneId> so any scene or widget also works as a browser source in OBS. This is the fallback if the engine misbehaves on demo day.

# AI layer
- Any OpenAI-compatible endpoint: base URL, optional key, model (listed via /models). Presets: OpenAI (default), OpenRouter, Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1), Custom. Test connection button. Warn that big local models can starve the GPU while streaming.
- Optional preset "Codex (ChatGPT sign-in)" through the Codex SDK, so users without an API key can use their ChatGPT plan. Check the current SDK docs first, and only build it if it fits in P4.
- The app must work without any AI configured; AI features then explain how to set it up.
- Uses: build and edit widgets, theme from a description, screen chat suggestions, stream report.
- Widget pipeline: prompt + contract + examples -> code only -> static checks (no import, fetch, eval or DOM) -> 3 s sandbox test with simulated events -> on error, feed the error back, max 2 retries -> live preview. Show the steps in the UI (Writing, Testing, Fixing, Ready).
- Edit with prompt: pick a widget and type "bigger, and add confetti".

# Chat builds the stream (originality and fun to watch)
- Viewers suggest widgets with !widget <idea> (cooldown per user, max length) or a "Suggest a widget" channel point reward the app creates when the channel is Affiliate.
- AI screens each suggestion (safe or not, short title). Studio shows a queue: Approve, Reject, Edit.
- Approved ideas get built and appear on stream with a credit tag "idea by @user", and the bot posts in chat. A toggle publishes automatically after approval.

# Setup for new streamers (under 5 minutes)
1. Welcome. 2. Connect Twitch (big code, opens the browser). 3. Devices found automatically (displays, windows, cameras, mics, level meters). 4. Performance: detect encoders, run a 15 s bandwidth test, recommend resolution, fps and bitrate, accept with one click. 5. Style: "Describe your stream" -> AI theme (palette, fonts, layout) -> preview of the four scenes -> apply. 6. Ready checklist with green checks and Go Live. Repair in Settings reruns the checks.

# Stats and data
- Per stream session, stored locally as JSONL: viewers, chat messages per minute, unique chatters, follows, subs, bits, raids, redemptions and widget triggers.
- Live charts (uPlot or Chart.js) with widget triggers marked on the timeline.
- Widget impact: chat activity in the 2 minutes after a widget fires compared with the 2 minutes before, ranked per widget ("which widgets wake up chat").
- After Stop: an AI stream report (peaks, likely causes, what to try next time), saved as Markdown with a copy button.

# Sharing
- Export and import scenes, widgets and themes as a .rcpack file (JSON with metadata, code, params and a preview image). Import shows what the pack contains before installing, and imported widgets always run in the sandbox.
- Stretch: a community gallery (browse, upload, download), only if everything else is done by Monday 10:00.

# Design
- Dark UI, one strong accent color, big readable type, bold and energetic motion (glow, shine, spin). Never subtle or generic.
- No em-dashes in any UI text, README or Devpost copy.
- Time inputs are free text parsed to HH:MM, never <input type="time">. Date fields open a calendar on click.

# Phases (Swedish time), one phase per turn
P0 Setup (Sat evening): write AGENTS.md (rules, commands, gotchas from this prompt) and docs/PLAN.md (phases, acceptance tests, status) so the plan survives context compaction. Scaffold, add an MIT LICENSE, commit. Then ask me for the Twitch Client ID.
P1 Shell + Twitch (Sat night): five tabs with real layouts, device login, EventSub, chat and event feed, event simulator. Accept: my chat message shows within 2 s and simulated events render.
P2 Engine (Sun morning): compositor, capture, audio, ffmpeg output, health bar, recording. Accept: a 10 minute bandwidth-test stream with under 1 % dropped frames while the app is minimized and a game runs fullscreen, then a short real stream on twitch.tv with audio in sync.
P3 Widgets + scenes (Sun midday): runtime, built-in widgets, scenes, transitions, hotkeys, OBS overlay URL. Accept: a simulated follow shows on stream, and a broken widget is disabled without stopping the stream. Tag v0.1, the first version that could be submitted.
P4 AI + Studio + chat suggestions (Sun afternoon and evening). Accept: !widget from a second account, approve, and the widget is live on stream within about 60 s.
P5 Setup wizard (Sun late). Accept: a fresh profile reaches ready-to-go-live in under 5 minutes.
P6 Stats (Mon morning). Accept: correct numbers and an AI report after a 10 minute test stream.
P7 Sharing (Mon late morning). Accept: export, import on a clean profile, everything works.
P8 Ship (Mon 14:00 to 20:00): fixes only, README (what it is, how it was built with Codex, Twitch app registration, AI setup, run and build), docs/DEVPOST.md (inspiration, what it does, how we built it with Codex, challenges, accomplishments, what we learned, what's next), docs/VIDEO.md (3 minute shot list), secret scan of the git history, clean-clone test, tag v1.0.

Priorities: P1-P4 must ship, P5-P6 should, P7 and the gallery could. If the engine is still unstable Sunday 13:00, keep it as beta, make the OBS overlay URL the main demo path and move on to P3.

# How we work
- At the start of each phase, reread AGENTS.md and docs/PLAN.md.
- End every turn in Swedish with: what is done, how I test it (max 5 steps), and what comes next. I reply "nästa" to continue.
- Commit after each phase with a clear message. Never push until I say so.
- Only ask me for things only I can do (Client ID, logins, live tests, permissions). Otherwise decide yourself and write the decision in docs/PLAN.md.
- Run the tests and the build before saying something works, and say clearly what you could not verify.
