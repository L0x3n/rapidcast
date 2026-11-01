# P4: AI Studio and chat suggestions

## Automated evidence

Run sequentially from the repository:

```powershell
npm test
npm run build
npm run smoke:ai
npm run smoke:widgets
```

The native AI check uses a loopback test endpoint with fixed responses. It makes no paid model requests, no Twitch calls and no personal-device capture. It does use actual Electron sandboxed pages, the production Worker runtime, safeStorage and FFmpeg recording. This proves wiring and failure handling, not real model output quality or latency.

Verified behaviors:

- Models listing and a test Chat Completion use a saved endpoint/model and optional bearer header. API keys encrypt/restore through Windows safeStorage and never appear in public AI state, widget code or plaintext config. Changing the base URL clears the old key.
- A local viewer suggestion is screened, approved by the actual Studio button and built. A forbidden fetch causes static rejection; a deliberate thrown draw error fails native preflight; both are repaired. Only the third valid version passes three seconds of simulated events. Untested attempts never enter the live library/scene.
- Manual Publish creates a widget with host-controlled `idea by @pixelpilot` credit. A chat event triggers it, and its colored pixels reach the actual compositor canvas and decoded H.264/AAC recording.
- A blocked idea cannot be approved. Editing triggers new screening. Prompt editing keeps the old widget source until Publish, then preserves instance identity/credit and applies the tested replacement size. Explicit auto-publish runs only after a streamer approval and successful test.
- Cancellation discards late model responses. Recording stays active throughout. Simulator publication sends zero Twitch acknowledgments.
- P3's runtime-isolation/crash/infinite-loop regression still passes after the new test routes and generated-widget integration.

Vitest adds URL/config/text boundaries, strict safety JSON parsing, own-message filtering, exact reward IDs, cooldowns, bounded intake, fail-closed approval/rejection, account binding, single acknowledgment, provider-switch races, workflow preferences, transport error redaction/size limits/credential echo rejection, token-field compatibility, and at most two repairs. Twitch transport fixtures cover Affiliate reward creation and standard-channel fallback. These are controlled transport tests, not live Twitch acceptance.

Artifacts: ignored `out/ai-smoke/report.json`, `studio-ready.png` (when native capture succeeds), `generated-program.png`, `ai-flow.mp4`. `buildToVisibleMs` measures only the fixed-response test flow and must never be presented as a real-model benchmark.

## Manual acceptance with your provider and channel

1. **Configure AI.** In Settings choose a preset, save the endpoint/key/model, list models and test a completion. OpenAI/OpenRouter need account access and normally a key; local Ollama/LM Studio can omit it. Select a text Chat Completions model. Confirm no raw key is returned after saving/reopening. Do not paste keys in chat. Test authentication failure, a stopped local server and a missing model: errors should explain the next action.
2. **Build and edit.** In Studio generate a neon chat/follow interaction. Observe Writing → Testing, with Fixing only when needed, then Ready. Review the simulated preview and source. Publish to a scene and fire events. Choose that instance in Build mode and request “bigger text and confetti”; the original stays until you publish the tested edit. Test Cancel while generating. Failed generation must leave existing output intact.
3. **Review viewer ideas.** Connect the channel and enable suggestions. From a second Twitch account send `!widget A neon meter that grows when chat speaks`. Observe screening, short title, Approve/Reject/Edit. Repeated commands from the same account must respect the configured cooldown; the broadcaster's own commands are ignored. Approve, inspect the tested preview and Publish. Confirm visible credit and one bot acknowledgment in the real channel. Repeat with the explicit auto-publish option, which still requires Approve.
4. **Rewards and guardrails.** On Affiliate/Partner, create/update Suggest a widget and redeem it from another account with text. Confirm its exact saved ID reaches the same queue. Standard channels use !widget. Reject an unwanted idea, edit a blocked/error idea to trigger a fresh screen, and switch/disconnect accounts: old-channel ideas must not be approved/published to another account. Pause the app-owned reward in Twitch when intake/app is off; automatic pause/refund on shutdown is not implemented.
5. **Record the acceptance.** Time the real second-account command → approval → visible widget path, aiming for about 60 seconds with a suitable model. Record the provider/model, retries, result and actual duration in PLAN. Run while recording/minimized and observe output health, particularly with a large local GPU model. Then complete the existing P1/P2 real Twitch/device/game checks. A fixed-response local test does not establish the real-provider or ten-minute stream result.

## Implementation decisions and limits

All AI requests originate in main through native fetch. Endpoint configuration accepts HTTPS or HTTP loopback, forbids URL credentials/query/fragment and disables redirects. POST uses `/chat/completions`; GET uses `/models`. Only model IDs leave the model-list response. Response bodies are bounded to 512 KB. Errors are mapped by HTTP status without exposing provider bodies. Credential echoes, including JSON-escaped echoes, are discarded. The model must return text; tool calls are never executed. Per-request timeout is 10–180 seconds, output budget 256–16000 tokens. Screening is capped at 20 seconds and 1000 tokens; generation uses the configured budget. There is no automatic transport retry that could duplicate charges. Static/test code failures get at most two model repair requests.

`max_completion_tokens` is the OpenAI preset's default; other presets default to `max_tokens`, and the user can change this for their model/server. Optional sampling parameters are omitted to improve compatibility with reasoning models. OpenAI requests use `store:false`. The model list is unfiltered by provider capabilities, so selecting an embedding-only or otherwise incompatible model produces a plain-language error. No model availability or pricing is hardcoded.

The generation prompt supplies the runtime contract and one small example; an edit also supplies the original source as untrusted data. Three seconds of simulated chat/follow/sub/cheer/raid/redeem/online/offline events run in a temporary sandboxed BrowserWindow with no preload/Node/permissions, using the same Worker harness/CSP/watchdogs as live widgets. At least 30 frames are required. Failed candidates are removed. Tested previews use nonce URLs and cannot join the program before publication. Preview replay uses test data only and may continue drawing after its three-second result; live watchdogs remain active after publication.

There is one foreground build/draft at a time and one background screening request; they may briefly overlap if a build is started while screening is in flight. New builds replace/discard old previews. Provider/model/key changes cancel builds and stale screening, while intake/auto-publish preferences preserve an existing preview. Auto-publish intent is captured at Approve; Cancel stops a build before publication. Once publication starts, wait for it to finish. A publication capacity failure leaves the tested draft available for manual retry.

The local queue stores at most 50 entries, including at most 20 active entries. The UI shows the latest 20. On restart, unfinished/unpublished decisions return to waiting for fresh screening; previous approvals do not silently restart a build. Intake sees only fresh events (30 seconds), deduplicates source/event IDs, and applies a per-user cooldown plus a five-second global cooldown. Simulator intake is explicitly initiated and bypasses chat-command rate limiting. Screening must return a complete boolean/title/reason object; malformed or unavailable decisions never become approvable. Screening is model judgment, not a guarantee of content suitability.

Viewer code is tagged by the trusted compositor/OBS drawer, outside the generated code. Real suggestion publication is bound to the receiving Twitch channel and sends a short host acknowledgment once. Test suggestions never send chat. A failed acknowledgment does not undo a published widget. Channel point creation lists manageable rewards before creating/updating the same title; conflicting rewards owned by another app produce a Twitch error and !widget remains available. Automatic reward shutdown/refunds, custom-definition deletion and Codex/ChatGPT sign-in are deferred. Theme generation belongs to P5 and stream reports to P6.

## Primary documentation consulted

- HTTP schemas/token limits and the Chat Completions compatibility choice: [OpenAI reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). OpenAI documents Responses as its newer API path; RapidCast uses Chat Completions for the requested multi-provider compatibility.
- Local endpoints: [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [LM Studio endpoints](https://lmstudio.ai/docs/developer/openai-compat). Provider routing: [OpenRouter reference](https://openrouter.ai/docs/api_reference/overview).
- Reward scope, input and manageable-reward routes: [Twitch API reference](https://dev.twitch.tv/docs/api/reference/#create-custom-rewards).
- Optional SDK was reviewed: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk). It controls local agents; its documentation directs custom authentication clients to the app server. Integrating that additional process/authentication surface was deferred to prioritize the required direct-provider and approval pipeline. No ChatGPT sign-in or plan entitlement is claimed.
