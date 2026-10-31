# P2 streaming engine beta

The engine is implemented as a beta. The short local checks below are not the required ten-minute Twitch/fullscreen-game acceptance test. A real Twitch Client ID/login, camera/microphone checks and the real stream acceptance are still pending.

## Reproducible automated checks

```powershell
cd C:\Users\coute\rapidcast
npm ci
npm test
npm run build
npm run smoke:engine
npm run check:rtmp
```

Run the GPU/CPU integration checks sequentially so they do not compete with each other while measuring timing. `smoke:engine` uses a disposable Electron profile and synthetic image/audio, not the user's screen, camera or microphone. It also captures the RapidCast test window itself to verify real MediaStreamTrackProcessor frame delivery. The only network destination in `check:rtmp` is a temporary loopback RTMP listener.

The standard native smoke also adds and edits a color layer through the actual UI and verifies Apply layer persists it. The native engine test verifies:

- A separate hidden compositor window has no UI bridge or Node access, exposes MediaStreamTrackProcessor and reports visibility as visible with backgroundThrottling disabled.
- Synthetic 1920x1080 canvas video and 48 kHz Web Audio pass through MediaRecorder, acknowledged IPC chunks, bundled FFmpeg and H.264/AAC fragmented MP4.
- Output continues while the app window is minimized for ten seconds. The JSON report contains measured frame slots, misses, worst gap and encoder frame/duplicate/drop counts. Startup is included in these short measurements.
- Audio beeps and white video pulses share the audio clock. FFmpeg detects their recorded edges; the test requires at least three matches and a maximum difference below 200 ms. This measures the synthetic pipeline, not physical camera/microphone latency.
- Auto encoder selection, an explicit x264 CPU recording and a 60 fps recording all decode correctly.
- A selected capture of the RapidCast window produces real VideoFrames through MediaStreamTrackProcessor. No hidden video element is used.

`check:rtmp` feeds synthetic Matroska into the same argument builder, publishes H.264/AAC to a local RTMP listener and writes MP4 simultaneously. It kills the listener midstream, restarts it and verifies the recovered stream and local MP4 decode with both tracks. Recording paths include spaces and an apostrophe to exercise tee escaping.

Artifacts from the latest engine run are retained under ignored `out/engine-smoke/`: `benchmark.json`, `frame-timing.jsonl`, `auto-1080p30.mp4`, `cpu-1080p30.mp4` and `auto-1080p60.mp4`. They contain synthetic test content. Regular compositor runs write timing JSONL under Electron userData/diagnostics. Regular recordings go into Videos/RapidCast. The UI exposes Open recording folder.

## Local capture and audio check

1. Open Live and click Start preview. In Scene layers, refresh displays/windows, add a Display or window layer, select its source and click Apply layer. Use a display source for a fullscreen game. Add a Camera layer and select its camera if desired. Capture starts only after selection/application.
2. Adjust X/Y/width/height/z-order/opacity and crop percentages, then Apply layer. Import PNG/JPG/WebP through the image picker. Text and color layers draw directly on the canvas. Each scene stores its own layers. P3 adds widget layers and transitions.
3. In Audio mixer, choose a microphone and enable Windows desktop audio if wanted. Check both meters, gain and mute. No local audio monitor is enabled, avoiding a feedback loop. Desktop audio includes all Windows playback. If Windows denies access, check its privacy settings yourself; do not automate security prompts.
4. Click Record locally, minimize the app, then restore and Stop output. Open the folder and play the MP4. Speak and clap on camera while playing recognizable desktop audio to check actual device sync. Use Release devices after the test to stop capture and audio tracks.
5. Select 60 fps in Settings only after stopping output, then repeat if needed. NVENC is probed with an actual encode, not just an encoder-list string. Auto falls back to x264 veryfast. Large local AI models may compete with streaming for GPU resources when P4 is implemented.

## Required real Twitch acceptance (Linus)

1. Add the public Twitch Client ID in Settings and authorize in your browser. The host retrieves the stream key via Helix. It chooses the ingest marked default, or the API's named Default/global ingest when all default flags are false. RTMPS is preferred when supplied. Keys never enter the renderer or diagnostics.
2. Keep Private Twitch bandwidth test enabled, then Start private bandwidth test. Confirm the UI says private test. The host appends `bandwidthtest=true`; this mode does not publish a public Twitch stream. Set a sensible bitrate/FPS before starting.
3. Run ten minutes with the app minimized and a game fullscreen. Inspect real frame timing and encoder counters afterward. Required result: under 1% dropped frames, continued encoding and no growing input queue. The compositor's missed slots, encoder drops/duplicates and any network recovery are separate observations. Unknown muxer bitrate stays unknown, rather than showing the configured target as a measurement.
4. Stop output. Only when ready to publish, disable Private Twitch bandwidth test and click Go Live on Twitch. Verify a short real stream on twitch.tv, video motion, mic/desktop mix and audio sync, then stop.
5. Record results and any fixes in PLAN. Until this passes, retain the beta label. If instability remains Sunday at 13:00, prioritize P3's OBS overlay URL as the main demo path, per the original fallback rule.

## Recovery and limits

- Browser blob queue and host input buffering are bounded. Chunks are acknowledged after FFmpeg accepts the write; partial WebM chunks are never silently skipped. A stalled or failed recorder triggers a fresh recorder/header and encoder attempt. Five failed process restarts stop output with an actionable error.
- RTMP uses a bounded FIFO with automatic recovery and keyframe restart. Its queue can drop encoded packets during a network outage. Events/output lost during outages are not replayed. A failed tee network slave forces a new process instead of letting a local recording silently masquerade as healthy streaming.
- Failed NVENC initialization switches subsequent attempts to CPU. Process restarts create recording segments with unique filenames. A failed local recording slave warns while allowing Twitch output to continue.
- Capture-source termination retains its last frame and displays a warning. Re-select the source to reopen it. Scene source errors warn while output continues. A crashed/stalled compositor is a fatal engine error and requires preview restart.
- Stop output before changing FPS, bitrate, encoder or recording policy. Live layer and audio changes use the existing output audio track. Device capture and desktop loopback still need real hardware testing on the intended stream setup.
- MP4 uses fragments for recoverability, but forced process termination or disk failure can still leave an incomplete recording. Use Stop output and inspect recordings before sharing.
- UI program thumbnails update at 2 fps. They are separate from the 30/60 fps output canvas and do not measure stream smoothness.
- The engine does not depend on Electron capturePage for video output. Its former screenshot error remains a separate optional screenshot warning; recent engine runs produced screenshots successfully.
