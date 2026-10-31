# P3: widgets, scenes and browser sources

## Automated checks

Run sequentially in the repository after `npm ci`:

```powershell
npm test
npm run build
npm run smoke:widgets
npm run smoke:engine
```

Vitest covers validation of all five actual builtin modules, prohibited capabilities, executable metadata, parameter validation, generation changes, timing, independent Worker response CSP, loopback Host/Origin restrictions, SSE, execution deadlines, bounded event queues and explicit restart. Native Electron checks use an isolated temporary profile, no Twitch connection and no personal device capture.

`smoke:widgets` starts a real compositor and a separate Chromium browser-source window. It verifies that:

- The runtime iframe has a different renderer process ID from the compositor and has no studio/compositor/Node bridge.
- A probe Worker cannot fetch, import another script or construct executable code. The server receives zero probe fetch/import requests. DOM and Node are unavailable.
- The OBS canvas background alpha is zero. A simulated follow triggers the alert Worker, produces bright alert pixels on the compositor and appears in saved program/browser-source PNGs.
- Deliberately throwing and infinite-loop draw callbacks become disabled. Recording continues while the main app is minimized. A paused badge is saved as a PNG.
- Fade/swipe/cut scene changes keep recording. Removing the runtime iframe triggers the six-second heartbeat failure, pauses widgets together and preserves recording. Restart reconnects the runtime.
- The resulting MP4 decodes as H.264 video and AAC audio using the absolute bundled FFmpeg executable.

Artifacts: `out/widget-smoke/report.json`, `follow-program.png`, `follow-obs.png`, `paused-badges.png` and `widgets.mp4`. These are ignored build outputs. `out/smoke.png` shows the Studio UI when capture succeeds. Short synthetic checks do not establish full-game or real Twitch acceptance.

## Manual acceptance

1. Build/start, open Studio, select Live and fire Follow, Chat, Sub, Cheer and Raid. Confirm test labels, alert confetti, chat text, follow goal and recent ticker. Try Starting Soon's countdown and Ending's supporter credits. Edit parameters, Apply and Restart; restart resets the countdown. Change geometry/crop/order in Live, then verify persistence after reopening.
2. While recording locally, switch Fade/Swipe/Cut and use Ctrl+Alt+F1 through F4 with another app focused. Confirm Settings reports all four registered. Test again with the actual fullscreen game; OS/other-app shortcut conflicts and GPU load remain machine dependent.
3. Copy a fixed scene, active-program and individual-widget URL from Studio into actual OBS Browser sources. Use 1920×1080, 30 fps for scenes; widget URLs use their layer dimensions. Verify transparency, simulator updates, scene following and a minimized RapidCast. Keep Browser source active when testing. Game/camera/audio remain native OBS sources. Reopen RapidCast and check the saved port/URLs.
4. Install this faulty widget through the code panel, add it to Live during local recording, and confirm WIDGET PAUSED appears without stopping output. Replacing its draw body with `while (true) {}` tests the watchdog. Remove the faulty instance after testing. Installing `fetch(...)` or `import(...)` must fail before execution.

```js
export default {
  meta: {
    name: 'Failure test', description: 'Deliberate failure',
    defaultSize: { w: 320, h: 120 }, params: {}
  },
  init(api) {}, update(dt) {},
  draw(ctx, w, h) { throw new Error('Deliberate failure'); }
};
```

5. After supplying the public Client ID and logging in interactively, confirm real chat and public emotes/avatars, plus actual follow/sub/cheer/raid events available to the account. Complete P1/P2's real Twitch and ten-minute game/device checks. Never paste tokens or stream keys into chat.

## Contract and limits

The ES module default export has literal `meta` with name, description, defaultSize `{ w, h }` and parameter schemas, plus synchronous `init(api)`, `update(dt)` and `draw(ctx,w,h)`. Top-level helpers are supported. `update` receives seconds, capped at 0.1 after a delay. Drawing uses a fresh transparent frame/context state each tick. Each instance has its own seeded random sequence and Worker.

API:

- `api.on(type, handler)`: normalized chat/follow/sub/cheer/raid/redeem/streamOnline/streamOffline events; at most 16 handlers per type. Simulator events explicitly carry `source: 'simulator'`.
- `api.params`: frozen number/string/color/boolean settings. Schema: `{type, default, min?, max?}`. Colors are #RRGGBB. Up to 16 parameters and 500 characters per string.
- `api.now()`: host time in milliseconds. Internal `_createdAt` parameter persists a countdown's starting time.
- `api.random()`: deterministic seeded values in [0,1).
- `api.image(key)`: host-supplied ImageBitmap or null. Keys: `avatar:<Twitch user ID>` and `emote:<emote ID>`. No arbitrary URLs. Public Twitch chat prompts the host to fetch CDN images. Missing images fall back to text. Image cache: 64, four pending requests, maximum 1 MB per response, thumbnails resized to 112 pixels wide.

No imports, dynamic import, eval, DOM, Node, direct network, custom timers or additional Workers. Acorn validates source (40–40000 characters); Worker response CSP independently forbids network/eval/imports. The trusted harness hides transport/network globals and canvas internals. The cross-site sandboxed iframe runs outside the compositor process. Only validated IDs, bounded ImageBitmaps and status reports cross back; credentials and capture settings never enter it.

Startup deadline: two seconds. Per-tick response deadline: 250 ms. Three consecutive draws over 25 ms disable a Worker even before that deadline. A host resuming after a long scheduler pause grants a fresh deadline to avoid treating a suspended host as slow widget code. Runtime heartbeat failure: six seconds, with widget-only shutdown. This protects output from widget errors; it is not a guarantee against system-wide CPU/GPU/memory exhaustion.

Maximum: 64 definitions, 32 instances across the app, eight widgets per scene, 1920×1080 per widget, 30 widget fps (the main compositor can run at 60). Inactive instances process event-only ticks so supporter history survives scene changes. Public event replay is bounded to 200; clearing simulator events rebuilds Workers. The goal is a session/replayed-event increment over the supplied starting value, not an authoritative lifetime follower total. Countdown start persists between app launches. Removing an instance does not delete its custom library definition; definition deletion/editing is deferred.

Browser sources use the same host and Worker modules as the compositor. Each open source creates an independent rendering set; keep the number of open browser sources small. Loopback binds only 127.0.0.1, checks Host, denies cross-origin status POSTs and has no credential-bearing routes. Stable preferred port is 17638, with a saved ephemeral fallback when occupied. No externally hosted page or internet exposure is required.
