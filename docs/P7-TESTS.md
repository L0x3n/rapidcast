# P7 portable overlay pack acceptance

## Automated verification

Run native/GPU checks sequentially from the repository:

```powershell
npm test
npm run build
npm run smoke:packs
npm run smoke:ai
```

Verified November 1 with version 0.5.0: strict production build and 195 tests in 27 files passed. The pack smoke passed in two sequential Electron processes using different temporary app profiles. It exported the actual Studio layout with the Electric ocean theme, five builtins plus custom code, nondefault amount=7, viewer credit, an embedded PNG and a hidden capture fixture. Private capture identity/title/text were omitted. Opening a pack changed no layout and started no capture. Installation was disabled before tests.

The clean importer first rejected a real Worker draw with the imported amount=7 (the code's default was 3), proving that imported parameters were used. Code containing fetch was rejected before execution. A cancelled test released its lease; competing configure/start/scene actions were blocked. Eight unique widget code/parameter/size combinations then passed their three-second tests. Explicit installation preserved four-scene geometry, theme, params, credit and embedded image through re-export and independently reloaded stores. The imported program rendered all four scenes, delivered simulator events, drew over 30,000 cyan custom-widget pixels in the controlled fixture, and recorded a decodable H.264/AAC MP4. Installation itself did not start preview/output. The native AI regression also passed generation, repairs, previews, approval, attribution, editing, cancellation and continuous output with the shared sandbox's default behavior.

Unit tests cover strict field/version/metadata validation, code/network rejection, missing references, duplicate IDs, parameters, hidden configuration deduplication, capture unbinding, embedded-image-only rules, invalid/oversized PNG headers, file size bounds, no execution on review, no install before tests, locks/cancellation/late results, save failure rollback, interrupted transaction recovery and refusal to overwrite a pending recovery. Existing runtime and AI tests remain intact. No new dependencies or native addons were added.

Artifacts in ignored `out/packs-smoke/`:

- `portable.rcpack`: the exported, self-contained fixture; `selected.rcpack`: owned input used for rejection and valid-import cases.
- `export.json` and `import.json`: controlled results.
- `export.png` and `review.png`: actual UI captures when capturePage succeeds.
- `starting.png`, `live.png`, `brb.png`, `ending.png`: actual compositor canvases with synthetic engine-test markings.
- `imported-pack.mp4`: locally recorded imported program.

Electron capturePage was intermittent on the first run; final export/review captures succeeded and were inspected, alongside actual Live/BRB program canvases. Screenshot warnings are separate from functional results. The harness supplies only its own fixture paths instead of opening native file dialogs. It uses no Twitch account/model or physical capture/audio devices. This is not real Twitch/OBS on-air acceptance or P2 game/audio acceptance.

## Manual acceptance

1. In Studio expand Overlay packs, give the look a name/author/description and Export current layout through the native Save dialog. Cancel once and verify it keeps your current layout. Inspect the resulting JSON before sharing; scene text, source code, credits and image pixels are intentional shared content. Local capture IDs, audio/output/provider settings and credentials must not appear as pack fields.
2. Open the file through the native Open dialog on a disposable clean profile or another supported Windows machine. Inspect the thumbnail, all four layer diagrams, image count, placeholders and source/credits. Cancel the picker and confirm that no layout/capture changed. An invalid file should give a plain error and never become installable.
3. Stop engine output and any OBS output that uses these overlays. Run Test in sandbox, cancel once, then complete it. Only a passing reviewed snapshot can enable Replace four scenes. An infinite loop/throw must fail without modifying the current program. The test may take about 100 seconds for 32 distinct configurations; each is isolated and bounded.
4. Export the destination's existing layout if needed, then Replace four scenes. Check text/colors/fonts, crop/geometry/opacity/order, transition, widget params/credits and images. Capture placeholders must stay hidden/unbound. Rebind your own devices, start preview and inspect simulator events in every scene. Check scene/program URLs in actual OBS; recopy widget-specific URLs after replacement. Recheck Setup picture/audio/performance before streaming.
5. Restart and verify persistence. If an import is interrupted or cannot save, preserve app data and allow startup recovery; the three owned layout files should restore together. Process-crash recovery is covered deterministically in unit tests, not by an abrupt native process kill in this phase. Actual native picker behavior, machine-to-machine sharing, unsupported/large source-image conversions and OBS on-air use still require this manual acceptance.

## Version 1 file contract

The format is UTF-8 JSON, not a ZIP/archive, with format `rapidcast-pack` and version `1`. Root fields are exactly format, version, metadata, preview, theme, transition, definitions, assets and scenes. Unknown fields are rejected rather than carried through into app configuration.

Metadata includes name, optional author/description, ISO creation timestamp and originating app version. The preview is an embedded PNG (up to 512 KB and 1024 pixels per side). It is author content, not proof of runtime behavior. The app generates an additional four-scene diagram from validated layer data.

Definitions contain local IDs, source modules and optional validated credit text. Widget metadata/schemas are derived through the existing Acorn validator; no module runs in main or the React renderer. Unused definitions are rejected. Layers reference definitions by local ID and carry validated params. Every unique code/parameter/width/height combination, including hidden placements, runs in the existing three-second sandbox with simulated events before installation. Runtime dimensions use the same existing Worker canvas limits. There are no automatic code repairs for imports. Changing the file afterward does not change the already reviewed in-memory snapshot.

Assets contain local IDs and PNG data URLs only. Header/dimension/size checks precede native decoding; decoded images are re-encoded. SVG, external URLs, filesystem paths and unused assets are rejected. Imported asset IDs are replaced with host-generated UUID PNG names in the existing app data assets directory. Existing images are exported as PNG at up to 1920×1080. PNG/JPEG decoding is supported by Electron; WebP conversion can fail and then requires a PNG/JPEG replacement.

Limits: 16 MB file, 32 definitions/instances, 16 images, 2 MB per embedded image, 8 MB combined normalized image bytes, 2048 pixels per image side and at most four megapixels, four scenes with 24 layers/eight widgets each, existing 40,000-character widget code limit and parameter schema limits. Host library capacity remains 64 definitions, deduplicating identical code plus definition credit when possible. Existing unplaced library definitions are retained.

Capture layers are hidden and unbound. Text/color layers have no source reference; image/widget references must resolve inside the pack. Scene titles/backgrounds retain their managed IDs where applicable; other imported layer/instance IDs are newly generated. Host output/audio, credentials, provider settings, ports/hotkeys and history are outside the pack. Imported scene styling is installed exactly; theme metadata is saved without reapplying a preset over custom positions.

Testing/installing owns a program lease and requires engine output stopped. It blocks program/scene/widget edits, new output/preview, AI builds/publication and setup mutations. Emergency Stop remains available. Runtime widget failure persistence is deferred until the lease ends. Installation pauses compositor preview, stages local images and saves engine.json/widgets.json/setup.json together using a fixed-name rollback journal. File writers are drained first. A failed apply restores files and memory; an unfinished journal is restored before engine/widget/setup startup. The temporary backup stays in app data and is never exported. New PNG files can remain unused if installation fails; old assets/library code are not deleted. Import does not auto-start capture, stream or recording and clears setup approvals.

## Primary references

- [Electron nativeImage](https://www.electronjs.org/docs/latest/api/native-image): decode, resize and normalize embedded raster images.
- [Electron dialog](https://www.electronjs.org/docs/latest/api/dialog): host-owned native file selection.
- [P3 runtime contract and tests](P3-TESTS.md), [P4 isolated generation tests](P4-TESTS.md): the same Worker/CSP/watchdog and preflight boundaries remain active for imported code.
