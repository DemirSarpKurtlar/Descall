# iOS screen sharing (iPhone and iPad, whole screen)

The iOS app is a Capacitor WKWebView. WKWebView has no `getDisplayMedia`, so the
web capture path (desktop, Android, Electron) cannot run there. Screen sharing on
iOS uses Apple's ReplayKit **Broadcast Upload Extension** instead, the documented
LiveKit approach (client-sdk-swift `LKSampleHandler` + `BroadcastManager`,
pinned at 2.19.0). It shares the **whole device screen**, also while you are in
another app.

Status: **server voice channels: implemented. DM and group calls: plan below.**

## How it works

```
Share Screen (voice dock)
  -> web: GET /api/webrtc/livekit-screen-token?channelId=...      (companion token)
  -> plugin DescallScreenBroadcast.start({ url, token, anchor })
       native LiveKit room connects as "<userId>:screen"
       RPSystemBroadcastPickerView, preselected to Descall (iPad: popover at the button)
  -> user taps "Start Broadcast" (3 s countdown)
  -> DescallBroadcast.appex (LKSampleHandler)  --frames over App Group socket-->  app process
  -> app publishes the screen share track (LiveKit Swift SDK, VP8, 1080p box, 15 fps)
  -> web: server:voice:screen:start, dock shows "Sharing your screen" + timer + Stop
```

* **Screen companion identity.** The share is published by a second LiveKit
  participant `<userId>:screen`. Its token (routes/webrtc.js
  `/livekit-screen-token`) requires a signed-in user who is **seated** in that
  voice channel and has **SPEAK + STREAM** there (stage: speakers only), is
  valid 10 minutes (only needed to connect), may publish `screen_share` /
  `screen_share_audio` only, cannot subscribe and cannot send data. Rate limit:
  20 per 10 minutes per user.
* **Other clients** (web, desktop, Electron, iOS) map that identity onto its
  owner in `useServerVoice.js` through `src/lib/screenCompanion.js`: its tracks
  are the owner's screen share in the share stage, tile grid and sidebar LIVE
  badge; it is never a member tile, active speaker or link quality entry. When
  it leaves, only the owner's share goes away. Your own companion is never
  subscribed (no mirror loop, no wasted bandwidth).
* **Live state.** The dock chip (`components/voice/IosBroadcastShareChip.jsx`)
  shows Preparing, Start the broadcast (picker up, Cancel), Sharing your screen
  (timer, Stop) and Stopping. The share counts as started only once the native
  room reports `live`, so a dismissed picker never shows a share. An unanswered
  picker ends quietly after 75 s.
* **Stopping.** Stop in the dock, the red status pill / Control Center, leaving
  the channel, a stage demotion, a kick or move all end it. Leaving voice on the
  server also removes the companion from the LiveKit room
  (`backend/lib/screenCompanion.js` + `removeFromVoice`), even if the app could
  not stop it itself.
* **Control Center start.** Long-press Screen Recording, choose Descall, Start
  Broadcast: if you are in a voice channel where you may share, the app mints a
  token and attaches the broadcast; otherwise it ends it within 20 s and says
  "Join a voice channel first".
* **Older app builds** (no plugin) and builds where CI did not ship the extension
  keep the Share Screen button hidden on iOS (capability check:
  `Capacitor.isPluginAvailable("DescallScreenBroadcast")` +
  `getStatus().available`, which checks `PlugIns/DescallBroadcast.appex` and the
  App Group container).

### Memory and quality

Broadcast extensions are killed above roughly 50 MB. The extension does no
encoding: `LKSampleHandler` sends one JPEG frame at a time over the App Group
socket (back-pressure: a frame is dropped while the previous one is in flight),
so it stays far below the limit. Scaling, encoding (VP8) and publishing happen in
the app process: the screen is aspect-fit to a longest side of 1920 px (iPhone
portrait about 887x1920, iPad 1440x1920), 15 fps, 2.5 Mbps, which is LiveKit's
`presetScreenShareH1080FPS15` budget.
`appAudio` is off (system audio is not shared; your microphone stays in voice).
iOS 27's in-process ScreenCaptureKit picker is not used
(`useScreenCaptureKit: false`), so every iOS version follows the same path.

The app has to stay alive while you are in other apps: server voice already
keeps an active audio session (`audio` background mode, CallKeepAlive), which
keeps the companion publishing.

## Files

| Area | Files |
| --- | --- |
| Extension | `frontend/ios/App/DescallBroadcast/` (`SampleHandler.swift`, `Info.plist`, `DescallBroadcast.entitlements`), target `DescallBroadcast` in `App.xcodeproj`, embedded by the App target |
| App plugin | `frontend/ios/App/App/DescallScreenBroadcastPlugin.swift`, pure `DescallScreenBroadcastLogic.swift` (+ `frontend/ios/selftest/broadcast/main.swift`), registered in `DescallBridgeViewController.swift`; `App/Info.plist` keys `RTCAppGroupIdentifier`, `RTCScreenSharingExtension` |
| Swift package | `https://github.com/livekit/client-sdk-swift` exact 2.19.0, product `LiveKit` linked by App and DescallBroadcast |
| Backend | `frontend/backend/routes/webrtc.js` (`/livekit-screen-token`), `frontend/backend/lib/screenCompanion.js`, `frontend/backend/socket/serverVoiceHandlers.js` (companion kicked with its owner), test `frontend/backend/test/livekitScreenToken.integration.test.cjs` |
| Web | `src/lib/iosScreenBroadcast.js` (bridge, capability hook), `src/lib/iosScreenBroadcastModel.js` (pure state), `src/lib/screenCompanion.js`, `src/hooks/useServerVoice.js`, `src/components/servers/ServerVoicePanel.jsx`, `src/components/voice/IosBroadcastShareChip.jsx`, `src/styles/ios-broadcast-share.css`, copy `src/i18n/locales/iosShare.<locale>.js` (7 languages), test `src/lib/iosScreenBroadcast.selftest.mjs` |
| CI | `.github/workflows/ios-build-check.yml` (Swift logic selftest, appex embed checks), `.github/workflows/ios-testflight.yml` (gated shipping, signing, IPA checks) |

## Apple Developer portal (owner, once)

CI signs with Xcode cloud-managed automatic signing (App Store Connect API key
"Descall CI", Admin, `-allowProvisioningUpdates` at export). It creates the App
Store profile for the new extension by itself, but the identifier and its App
Group must exist. No certificate, profile or new secret is needed.

1. developer.apple.com > Certificates, Identifiers & Profiles > **Identifiers**,
   filter **App Groups**: `group.com.descall.app` already exists (the
   notification extensions use it). Nothing to create.
2. Identifiers > **+** > **App IDs** > **App**. Description `Descall Broadcast`,
   Bundle ID **Explicit** `com.descall.app.broadcast`. Under Capabilities tick
   **App Groups** only. Continue > Register.
3. Open `com.descall.app.broadcast` > App Groups > **Configure** > tick
   `group.com.descall.app` > Continue > Save (confirm the profile warning).
4. Open `com.descall.app`: App Groups must still list `group.com.descall.app`
   (it does today). No other capability changes; the main app needs nothing new.
5. Profiles: nothing to do for TestFlight (cloud-managed). Only if export ever
   reports "No profiles for 'com.descall.app.broadcast' were found": Profiles >
   **+** > **App Store Connect** > App ID `com.descall.app.broadcast` > the Apple
   Distribution certificate > name `Descall Broadcast App Store` > Generate, then
   re-run the workflow.
6. GitHub > repository Settings > Secrets and variables > Actions > **Variables**
   > New repository variable `IOS_BROADCAST_EXTENSION` = `1`. Existing secrets stay
   as they are (`ASC_KEY_P8`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID`).

Recommended order: run **iOS Build** (Actions > iOS Build > Run workflow) to
compile the Swift code first, then **iOS TestFlight** manually with
`broadcast_extension` ticked; when that upload is green, set the variable so tag
releases ship it.

## CI gating

* The extension target is always **compiled** (archive and the iOS Build check),
  so Swift errors surface on every iOS PR.
* `ios-testflight.yml` ships `DescallBroadcast.appex` only when
  `vars.IOS_BROADCAST_EXTENSION == '1'` or the manual run's `broadcast_extension`
  input is ticked. Otherwise the appex is removed from the archive before
  signing (a notice says so), export never asks for its profile, and the app
  hides Share Screen on iOS (it checks for the appex at run time).
* When shipped: the appex is ad-hoc signed with `DescallBroadcast.entitlements`
  before export, a stray `appex/Frameworks` folder is folded into
  `App.app/Frameworks` (App Store Connect rejects frameworks inside an appex),
  and the IPA check requires App Group `group.com.descall.app`, bundle id
  `com.descall.app.broadcast` and the app's version / build number.
* `ios-development-ipa.yml` (manual development IPA) still signs only
  `com.descall.app` with one profile; it does not cover any extension.

## Test on a device

Simulators cannot broadcast (the plugin reports `simulator`, the button stays
hidden).

1. iPhone in a server voice channel (SFU), with a second person on desktop / web
   in the same channel. Tap Share Screen: the system sheet opens with Descall
   selected. Tap Start Broadcast. After the countdown the dock says "Sharing your
   screen" with a timer; the desktop shows your screen in the share stage, your
   tile shows LIVE, there is no extra "Member" tile.
2. Go to Safari / Photos / Home: the desktop keeps seeing the whole screen.
3. Stop from the red status pill (or Control Center): the desktop share ends,
   the dock chip disappears, the stop sound plays.
4. Start again and leave the channel: the share ends for everyone.
5. Tap Share Screen and dismiss the sheet: Cancel in the chip, or it clears
   itself after 75 s; nobody saw a share.
6. iPad: the sheet is a popover pointing at the Share Screen button; rotate
   during a share (the frame follows the orientation).
7. Control Center > long-press Screen Recording > Descall > Start Broadcast
   while in a voice channel: it attaches; while not in voice: it stops with
   "Join a voice channel first".
8. A member without STREAM in that channel: the button is disabled, the token
   endpoint answers 403.

Logs: Console.app > device > filter category `LKSampleHandler` (extension) and
`[ScreenBroadcast]` / `[ServerVoice]` in the Safari Web Inspector (app).

| `getStatus().reason` | Meaning |
| --- | --- |
| `no-extension` | This build did not ship DescallBroadcast.appex (CI gate off) |
| `no-app-group` | The App Group entitlement is missing from the signed app |
| `simulator` | Broadcasts need a real device |

## DM and group calls (not implemented yet)

DM and group calls are browser WebRTC mesh inside the WKWebView (`useCall.js`,
`useGroupCall.js`); only an incoming DM call answered from CallKit runs in the
native engine (`DescallNativeCall.swift`, stasel WebRTC, audio only). Neither can
take the extension's frames: a WKWebView `RTCPeerConnection` cannot receive a
native video source, and piping JPEG frames into the page (canvas
`captureStream`) would not survive the app being in the background, which is
the whole point of a broadcast. The plan reuses the server voice pieces:

1. Backend: `GET /api/webrtc/livekit-call-screen-token?callId=` for an active DM
   or group call the caller is in (same companion grants, room
   `call-screen-<callId>`), plus a viewer token for the other participants
   (`canSubscribe` only, `canPublish: false`), both short-lived; revoke / kick
   on `call:end` like `removeFromVoice`.
2. iOS: `DescallScreenBroadcast.start` already takes any LiveKit URL and token;
   nothing native changes.
3. Signalling: the sharer sends the existing `screen:share-start` /
   `screen:share-stop` events with `{ via: "livekit", room }` so receivers know
   the share is not on the mesh.
4. Receivers (web / desktop / iOS): on `via: "livekit"`, connect a subscribe-only
   `livekit-client` Room to `call-screen-<callId>`, map `<userId>:screen` with
   `routeLiveKitTrack`, and feed the track into the existing call share stage
   (`CallOverlay` screen stream); disconnect on stop or call end.
5. UI: `screenShareUnavailableOnIos()` in `CallOverlay.jsx` / `useCall.js` becomes
   the same capability check as server voice (`useScreenShareCapability`).

Estimated effort: about one day (token route + tests, receiver room in
`useCall` / `useGroupCall`, overlay wiring). It needs LiveKit for calls even when
the call itself stays on the mesh.

## Risks

* The Swift code (plugin, extension, LiveKit API usage) was written against the
  LiveKit 2.19.0 sources but has not been compiled here (no macOS in this
  environment); the first **iOS Build** run is the compile check.
* The App target now links the LiveKit Swift SDK (LiveKitWebRTC, prefixed `LK`,
  coexists with stasel WebRTC used by the native DM engine); the app grows by
  roughly 10-15 MB. LiveKit's automatic audio session handling is switched off
  so it never touches the WKWebView / CallKit audio session.
