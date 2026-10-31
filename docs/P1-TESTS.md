# P1 acceptance and verification

## Automated checks

```powershell
cd C:\Users\coute\rapidcast
npm test
npm run build
npm run smoke
```

Vitest checks public configuration, renderer sender URLs, event normalization, bounded/deduplicated buffers, scene IDs, subscription conditions, trusted reconnect URLs, OAuth request fields and polling, refresh serialization, Helix 401 retry, cancellation, ciphertext-only storage and full studio orchestration with a fake Twitch transport. There are no real credentials or external requests in these tests.

Native smoke checks use a disposable profile: five tabs, follow/chat rendering over real IPC, saved scene switching, simulator clearing, invalid input rejection, renderer Node isolation, actual OS sandboxing and a Windows safeStorage round trip. Encryption test values are placeholders. The temporary profile is removed afterward. Electron capturePage still warns separately; use native window inspection for visual QA.

## Local simulation (no Twitch required)

1. Run `npm run dev` or build and `npm start`. Open Studio and choose New follow, then Fire event.
2. Confirm PixelPilot followed appears in the preview and test event feed, explicitly marked simulated. Switch to Live and confirm the same activity is present.
3. Try each simulator event type, including chat, gifts, resubscriptions, raids and redemptions. Test events must never change the real Twitch channel status or send anything to Twitch.
4. Switch between all four scene layouts. Restart the app and confirm the selected scene is restored. Use Clear simulated events to remove test data while retaining any real Twitch events.
5. Open Stats. Twitch-only counts exclude simulations. Include simulated events adds them and labels the result. Counts describe the bounded 200-event app buffer, not a persisted stream session.

## Real Twitch acceptance (Linus required)

1. Supply the public application Client ID, save it in Settings, and click Connect Twitch. Verify the code and browser activation, then authorize manually. Never paste tokens or a Client Secret into chat.
2. Send a clearly identifiable chat message on the connected channel. Confirm it appears in Live within two seconds of sending. The displayed delivery timing compares Twitch's event timestamp to the computer clock; it is diagnostic and does not replace this end-to-end check.
3. Send from the RapidCast composer and confirm it appears on Twitch and returns marked YOU. Own-account messages remain visible; P4 command handling must ignore events with own=true.
4. Restart RapidCast and confirm automatic session restoration. Check subscription states. Standard accounts should show five active subscriptions and five unavailable monetized types. Affiliate/Partner accounts should attempt all ten, subject to granted permissions.
5. Briefly disconnect networking and restore it. Confirm reconnect status and resumed chat. Disconnect Twitch in Settings, restart and verify it remains disconnected. Revocation may need manual removal in Twitch Connections if the network was unavailable during logout.

## Status and boundaries

- Local simulator rendering, native smoke and controlled transport integration are verified in P1.
- Real Twitch login, real EventSub delivery, real server revocation and under-two-second end-to-end chat latency remain unverified until Client ID/login are supplied.
- Stream output and actual FPS/bitrate/drop measurements are P2. Current scenes are labeled UI layout previews, not compositor output.
- Runtime widgets and OBS overlay URLs are P3. AI, moderation of viewer widget suggestions and bot acknowledgments are P4.
- Device discovery/full onboarding is P5. Persistent metrics, charts and reports are P6. Sharing is P7.
- The Settings Repair action currently repairs Twitch login/event subscriptions only; full device/performance Repair follows the relevant phases.
