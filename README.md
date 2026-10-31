# RapidCast

An AI-native Twitch studio where viewers help build the show. Built with Codex in one continuous chat for the Codex x TwitchCon Hackathon.

**Current stage: P1, studio shell and Twitch connection.** Five tabs provide scene layout previews, Twitch device login, live chat, activity feed, event simulation, connection settings and a current-session activity buffer. Streaming output arrives in P2, widget execution in P3, and AI generation in P4. You can explore scenes and simulations without an account or AI key.

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
```

`build` includes strict TypeScript checks. `smoke` opens a real Electron window with a temporary profile, visits all five tabs, fires follow/chat simulations, switches scenes, rejects an invalid Client ID, tests an actual safeStorage encryption round trip, and checks OS sandbox and renderer Node isolation. It also attempts to save `out/smoke.png`; unavailable screenshot capture produces a separate warning after the startup checks pass. It does not log in or contact Twitch. `npm run test:watch` runs Vitest interactively.

On the development machine, Electron's `capturePage` returned `UnknownVizError` with both GPU and software rendering. The app was visually verified through native Windows window capture instead. This screenshot limitation is not evidence about the future streaming compositor; P2 still requires full capture and minimized-stream testing.

## Configuration and security

The public Twitch Client ID belongs in `config/public.json` and is currently blank pending Linus's ID. A local Settings override is available. A client secret is never needed. Do not put tokens, stream keys or AI keys in that file or paste them into chat.

Twitch tokens are encrypted through Electron safeStorage in the main process under the OS app data directory. There is no plaintext fallback. Settings are JSON; the encrypted login is `twitch.bin`. The renderer has no Node access and only specific validated IPC actions. No access/refresh token or private device code is exposed to it. No widget or AI-generated code runs yet.

## Connect Twitch

1. [Register a Twitch application](https://dev.twitch.tv/docs/authentication/register-app/) with Client Type **Public**. Device login does not require a callback server or client secret. If the console requires a redirect URL, register `http://localhost`; this flow does not use it.
2. Open Settings, paste the public Client ID and click **Save Client ID**. Changing the ID disconnects the previous account.
3. Click **Connect Twitch**. RapidCast shows a large code, opens Twitch in your browser and polls until you authorize. Log in and approve in the browser yourself. You can cancel or reopen the activation page.
4. Verify **Chat and live events are connected**. Settings lists enabled, unavailable and revoked subscriptions. Non-Affiliate channels retain chat, follows, raids and online/offline events; monetized event types show their requirements.
5. Send a message on your Twitch channel and watch it appear in Live. The composer sends as your connected account. Own messages are marked YOU and normalized with `own: true` for the future command parser.

Tokens refresh automatically, with a single refresh shared by concurrent requests. Twitch validation runs at startup and hourly; expiry is checked every minute. Network drops and keepalive timeouts trigger EventSub reconnection. Planned reconnects keep the old socket until the replacement welcome; ordinary drops recreate subscriptions. Events missed during an outage cannot be replayed by Twitch. Disconnect clears local credentials and attempts server revocation.

See [docs/P1-TESTS.md](docs/P1-TESTS.md) for manual acceptance steps and known limits. Implementation follows Twitch's [device-flow documentation](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), and [token validation requirements](https://dev.twitch.tv/docs/authentication/validate-tokens/).

**Machine gotcha:** the FFmpeg on PATH is a fake Python launcher. Never call it. The engine phase will use the full binary path from `ffmpeg-static`.

## Project map

- `src/main`: privileged desktop services.
- `src/preload`: typed, narrow bridge into the UI.
- `src/renderer`: React studio UI.
- `src/shared`: contracts, configuration and pure logic tests.
- `config/public.json`: public application configuration.
- [AGENTS.md](AGENTS.md): engineering rules and commands.
- [docs/PLAN.md](docs/PLAN.md): phases, acceptance criteria, decisions and verification evidence.
- [docs/BRIEF.md](docs/BRIEF.md): original product requirements.

Uses Electron, electron-vite, Vite, React, TypeScript and Vitest. The lockfile pins dependencies. P0 architecture follows the [electron-vite guide](https://electron-vite.org/guide/) and [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Build process and license

Linus directs scope, design and real stream testing. Codex implements the app in the original project chat, runs checks and records phase decisions in the plan. Each phase ends in a local commit. Nothing is pushed without Linus's instruction.

MIT, copyright 2026 Linus. See [LICENSE](LICENSE).
