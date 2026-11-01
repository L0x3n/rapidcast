# RapidCast v1.0 release

The application includes the P1-P7 studio workflow. The streaming engine remains BETA. This release is prepared locally; repository publishing, real-account acceptance, video upload and Devpost submission are separate user actions. No push or external publication is authorized by the local release build.

## Run the portable build

Extract `out/release/RapidCast-1.0.0-windows-x64.zip` completely and launch `RapidCast.exe` inside RapidCast-win32-x64. Keep the executable and supporting files together. The portable folder includes Electron, runtime dependencies, FFmpeg and their license/build notices; no Node installation, OBS or global FFmpeg is needed to launch it. The build is unsigned. The app's source license is MIT; third-party licenses are unchanged.

The archive checksum is in SHA256SUMS.txt and manifest.json. Verify with PowerShell Get-FileHash before copying/distributing. The manifest records the source commit, version, Electron version, size and hash. Public configuration includes Linus's Twitch application ID. A fresh profile starts signed out and prompts for normal device login. Credentials stay in encrypted Windows app data stores, outside the ZIP. AI is optional and configured in the app.

## Reproduce the checks

Use Windows 11 x64, Node.js 24 and npm 11, from a committed checkout:

```powershell
npm ci
npm test
npm run build
npm audit
npm run check:secrets
npm run check:clean-clone
```

Stage/commit new tracked files before secret scanning, so the tracked working snapshot includes them. The scan runs Gitleaks 8.30.1 against all reachable Git refs and a copy of tracked working files, with full redaction and no inline suppression. It bootstraps the official Windows x64 release only after matching its pinned SHA256. Reports stay under ignored out/security. No scan output or report should contain raw finding values. The public Client ID initially matched the Twitch-token detector. The only exception requires both its exact known public value and the config/public.json path; no broad credential-rule or test-folder exclusion is used.

Clean-clone verification refuses a dirty source checkout. It creates an independent clone with --no-local and --no-hardlinks, installs dependencies from the lockfile, runs tests/build/audit and the engine/widget/AI/setup/stats/pack/loopback checks sequentially, then packages and tests the extracted portable ZIP. It does not contact Twitch or a paid model. Only the controlled test app window is selected by device smokes. Results are in out/clean-clone-report.json. Verified artifact files are copied back to out/release. Old verification clones/extractions are retained under ignored out for inspection.

To package or test an already built checkout independently:

```powershell
npm run package:win
npm run smoke:portable
```

Package contents are allowlisted to compiled main/preload/renderer/overlay files, public configuration, public documentation/licenses, the package metadata and the actual production dependency closure. Source Git metadata, .env files, app data, dev dependencies and smoke/security artifacts are excluded. ASAR is disabled so the host can execute the separate bundled FFmpeg binary by its absolute path. The extracted-build smoke uses a new temporary profile, checks shipped public configuration and runs the real recording/widget/chart/report path with simulator data and a marked test endpoint.

## Current verification record

| Check | Evidence/status |
| --- | --- |
| Strict build and unit tests | Working release candidate: 220 tests in 28 files passed; build passed. |
| Dependencies | npm audit reports zero vulnerabilities, including development tooling. |
| History secrets | Initial scan: all eight existing commits passed; final reachable-history and tracked-tree scan runs again before tagging. |
| Clean clone | Final committed-release verification is pending while this document is prepared. |
| Portable archive | Initial build created; final extracted-build verification is pending while this document is prepared. |
| P6 long statistics run | Preserved 602.815-second local/minimized run, exactly 720 simulator messages and one visible trigger; not real audience/network evidence. |
| P7 sharing | Two-profile native export/import passed, with eight tested configurations, four-scene/theme/params/image/credit persistence and decoded local output. |

The scanner also self-tests its boundary: the known public ID at its config path passes, while the same value at another path and a changed value at the same config path must still be detected. The exception is attached only to the Twitch-token rule; it does not skip the entire config file. These test findings are synthetic public-ID strings, never real tokens, and their reports are redacted.

The final clean-clone report and portable manifest identify the exact checked commit. The local v1.0 tag is added only after release tooling, the final scan and committed clean-clone checks pass. Passing automated checks does not mark the manual rows below as passed.

## Interactive checks still required

- Twitch login, actual EventSub/chat latency, real viewer polling and second-account suggestion approval/publication/acknowledgment using the shipped public application.
- Real provider/model widget, theme and report quality/latency. Local smoke endpoints are fixed-response fixtures; they are not benchmarks of a real model.
- The original ten-minute private Twitch sender test while minimized under the actual fullscreen game load, below 1% dropped frames, plus user-confirmed physical microphone/camera/desktop-audio quality and synchronization. Then an intentional short public stream, performed by Linus.
- Actual OBS browser-source/on-air behavior, game hotkeys, native file-picker cancellation/overwrite and a shared pack on another physical machine.
- A human completing the real Twitch setup route within five minutes. Automated local setup timing is a different result.

Follow P1-TESTS.md through P7-TESTS.md for procedures. Use the OBS fallback if the beta engine is not ready for the demonstration. Never describe pending manual acceptance as verified in the video or submission.

## Submission checklist for Linus

1. Open the portable build and perform interactive login/model/device checks. Enter secrets only in the app.
2. Publish the repository/release when ready and explicitly authorize any Git push. No remote is configured yet. The actual original Codex chat ID is `01a19363-ba10-7cd0-a5b7-58c1e60e709d`, verified from the current environment and Codex app metadata.
3. Record/edit the three-minute demonstration using VIDEO.md. Label any simulator/fixed-response segments. Upload and wait for processing.
4. Paste the narrative from DEVPOST.md, add the actual public repository/video URLs and the chat ID, review all claims and submit yourself.
5. Follow the brief's Stockholm schedule: November 2 feature freeze 14:00; submission target 20:00; hard deadline 23:00.

## Build-tool notes

Electron Packager 20.3.0 is development tooling only. Its ASAR dependency initially resolved to glob/minimatch versions covered by October 2026 moderate denial-of-service advisories. Scoped overrides pin glob 14.0.2 and minimatch 11.0.1; the full npm audit and actual Windows packaging are checked with them. Runtime dependencies are unchanged. References: [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Primary tooling references: [Electron Packager options](https://electron.github.io/packager/main/interfaces/Options.html), [Gitleaks usage](https://github.com/gitleaks/gitleaks#usage), [pinned Gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). The scanner archive checksum is d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e.
