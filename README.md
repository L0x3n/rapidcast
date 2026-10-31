# RapidCast

An AI-native Twitch studio where viewers help build the show. Built with Codex in one continuous chat for the Codex x TwitchCon Hackathon.

**Current stage: P0, foundation only.** The desktop app opens a local concept preview and checks its desktop bridge and secure storage availability. Twitch login, streaming, widgets and AI arrive in later phases. No account or AI key is required to run this stage.

## Run on Windows

Requirements: Windows 11, Node.js 24 and npm 11. No OBS, Python, node-gyp or globally installed FFmpeg is needed for P0.

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

`build` includes strict TypeScript checks. `smoke` opens a real Electron window with a temporary profile, checks React, typed preload IPC, OS sandbox and renderer Node isolation, then closes. It also attempts to save `out/smoke.png`; unavailable screenshot capture produces a separate warning after the startup checks pass. It does not log in or contact Twitch. `npm run test:watch` runs Vitest interactively.

On the development machine, Electron's `capturePage` returned `UnknownVizError` with both GPU and software rendering. The app was visually verified through native Windows window capture instead. This screenshot limitation is not evidence about the future streaming compositor; P2 still requires full capture and minimized-stream testing.

## Configuration and security

The public Twitch Client ID belongs in `config/public.json` and is currently blank. Settings override and public-client device login arrive in P1. A client secret is never needed. Do not put tokens, stream keys or AI keys in that file or paste them into chat.

Secrets will be encrypted through Electron safeStorage in the main process and stored under the OS app data directory. P0 checks encryption availability but stores no credentials. The renderer has no Node access and only a specific read-only desktop API. No widget or AI-generated code runs yet.

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
