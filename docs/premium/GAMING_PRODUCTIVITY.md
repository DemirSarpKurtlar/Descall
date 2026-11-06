# Descall+ / Ultra: gaming, HUD and productivity (phase 1)

Feature keys from `docs/premium/CONTRACT.md`. Every feature is gated three times: the UI (`usePremium().has`), the Electron main gate (`electron/premium/gate.cjs`, renderer claim intersected with main's own `/api/premium/me`), and the server for anything stored there (`backend/lib/premium/entitlements.js` `requireFeature`). Everything is off until the user turns it on; a member with every feature off costs the same CPU and RAM as a free user (measured below).

## Where the code is

| Part | Files |
|---|---|
| Renderer host (mounted by `AppLayout` only for members, never on iOS / Android) | `frontend/src/premium/gaming/PremiumGamingHost.jsx` |
| Settings panels (`{ key, Panel }`) | `frontend/src/premium/settings/<key>.jsx` for the 16 keys of this group; also rendered by the Descall+ settings tab (`PremiumSettingsTab.jsx` globs the folder) |
| Hub (all of the above in one window; Ctrl/Cmd+Shift+G, or Settings in the command center) | `frontend/src/premium/gaming/GamingHub.jsx` |
| Pure logic + selftests | `ruleEngine.js`, `clipRing.js`, `timeline.js`, `clipboardHistory.js` (`premiumGaming.selftest.mjs`), `electron/premium/pinHash.cjs` (`pinHash.selftest.mjs`) |
| Main-process modules | `frontend/electron/premium/features/{voice_hud,gaming_hud,widgets,custom_layouts,instant_clip,quick_file_drop,app_lock,workspace_profiles,desktop_automations,command_center,multi_account}.cjs`, wrapped by `premium/compat.cjs`; overlay windows from `premium/overlayKit.cjs` + `hudHtml.cjs` + `hudPreload.cjs` |
| Server | `backend/routes/premiumGaming.js` at `/api/premium/gaming` (`/sessions`, `/prefs`, `/status/:userId`), `backend/lib/premium/entitlements.js` |
| Migration (coordinator applies) | `supabase/migrations/20261107_premium_gaming.sql` |
| i18n | `src/i18n/locales/premiumGaming.{en,tr}.js`, inline `premiumGaming` blocks in de / es / fr / pt-BR / ru |
| Smoke | `electron/e2e/premiumGaming.e2e.cjs` |

## Overlays (voice HUD, gaming HUD, widgets, quick drop)

- Plain always-on-top, frameless, transparent BrowserWindows at the `screen-saver` level, loaded from a `data:` URL (no temp file), own tiny preload, channel `descall:hud:*` (not `premium:*`: these pages are not app documents and get no token or premium bridge).
- **Nothing is injected into any game.** They show over games in borderless or windowed mode and over games using Windows "fullscreen optimizations". **Exclusive fullscreen is not supported**: the game owns the display and nothing can draw over it without injecting into the game, which anti-cheat systems flag.
- The HUDs are click-through (`setIgnoreMouseEvents(true, { forward: true })`); Windows stops forwarding while an elevated window has focus. Kept small and movable (corner, size, opacity, margin).
- **No FPS**: reading a game's frame rate needs injection or admin-level ETW / PresentMon tracing. The gaming HUD shows the clock, ping to the Descall API (`/api/health` round trip every 5 s, only while the HUD is on), the call and online friends. LiveKit RTT is not exposed by `useServerVoice`; the HUD hides that row.
- Each overlay window is its own renderer: about 85 MB working set each (measured). Widgets are capped at 4.

## Instant clip

- WebCodecs `VideoEncoder` (hardware preferred, H.264 then VP8), keyframe every 1 s, encoded chunks in a RAM ring that always starts on a keyframe (`clipRing.pruneCount`), capped by `memoryCapBytes` (720p30: 20 MB for 30 s, 35 MB for 60 s). A frame is dropped rather than queued when the encoder lags. No MediaRecorder (its chunks are not independently playable).
- Save (hotkey, default Ctrl+Shift+F9, global only while the buffer is on) freezes the ring and opens the editor; trim snaps the start back to a keyframe; mux with **mediabunny 1.61.6** (MPL-2.0, lazy chunk ~730 KB on web; the Electron build is one IIFE bundle, so it is included there). Send goes through `/api/media/upload` + the normal socket send; "Save to disk" uses a save dialog.
- **Video only.** On Windows the only system-audio source (loopback) is the whole output mix, which contains the voice call; Descall does not record calls (2.9.141). Game-only audio needs a native per-app capture module.

## App lock

- PIN of 4-12 digits, scrypt (N=16384, r=8, p=1, 16-byte random salt), constant-time compare, stored in `userData/premium/app-lock.bin` encrypted with `safeStorage` (DPAPI on Windows). 5 free tries, then 30 s doubling up to 15 min.
- Locks on idle (powerMonitor, polled every 15 s only when enabled), on minimize and on OS lock. Main holds the locked flag, so a reload stays locked.
- Limits: DPAPI protects against another person at the keyboard, not against software running as the user; it is a UI lock, not encryption at rest; production DevTools can bypass any UI lock. **Windows Hello is not offered**: no Electron API, and `electron-windows-hello` (0.1.0) is untested; it needs a native WinRT component.
- If the membership ends, the module stops and any active lock is released (a premium feature must not lock people out of the free app).

## Multiple accounts

- Each extra account (max 3) runs in its own window on `session.fromPartition('persist:acct-<id>')`: separate localStorage, IndexedDB, cookies, cache. The partition gets the same `descall://` handler (`registerAppProtocolOn`) and media permission list; the CSP comes with the protocol response, unchanged.
- Token per account: `main.cjs` `tokenFilePath(event)` asks `premium/hostHooks.cjs` for the sender's partition file `userData/premium/accounts/<id>/auth-token.bin` (safeStorage). Account windows are trusted senders through the `isAccountWebContents` host hook. `secure-token:clear` from an account window does not reset the main gate.
- Premium IPC from an account window is refused (entitlements belong to the main account). The tray label is the username claim of the account's own JWT.
- Cost: one full renderer per extra account (~250-400 MB).

## Game status and game history

- Detection is the existing 30 s `tasklist` scan. Members get `extraGames.js` (our own list, ~140 executables) merged in; free detection is unchanged.
- Game history and the timeline reuse `user_activity_log` (app_type `game`), served by `/api/premium/gaming/sessions` with `requireFeature(['game_session_history','activity_timeline'])`, up to 366 days / 1000 rows. A local log (`descall:pg:gameSessions`, 500 entries) covers sessions the server does not have yet.
- Game card on the hover profile card: `/api/premium/gaming/status/:userId` answers only when the **subject** has `game_status` and their `game_card` visibility (`everyone | friends | nobody`, new column) and activity privacy allow the viewer. Shown only when the free activity row is not already shown.

## Clipboard history

Only text copied inside Descall (`copy` / `cut` events in the app document) or pasted into Descall. The system clipboard is never read or polled. Password fields are skipped. 50 items, 4000 characters each, local, clearable.

## Quick actions, workspace profiles, automations

- One fixed action set (`actions.js`): set status, open DM, join voice channel, focus on / off / toggle, switch profile, open a HUD. No scripts, programs or URLs.
- Focus mode, notification profiles and audio profiles belong to other Descall+ features; this group asks them through window events `descall:premium:focus`, `descall:premium:notification-profile`, `descall:premium:audio-profile`. Audio profiles also write the noise / push-to-talk fields of `voiceProfile` directly.
- Workspace profiles (Gaming / Work / Everyday) switch from the UI, tray submenu, global hotkeys (Ctrl+Alt+1..3 by default, registered only while the feature runs) or an automation.
- Automations: triggers game started / stopped (optional name filter), call joined / left, time window (overnight allowed, weekdays), idle (main polls powerMonitor only when an idle rule exists). 30 s cooldown per rule.
- `listQuickActions()` is exported for the quick launcher.

## Measured cost (xvfb, software GL, `electron/e2e/premiumGaming.e2e.cjs`)

| State | Total CPU (10 s) | Working set (all processes) |
|---|---|---|
| Free user, idle | 17.1 % (16.8 % is xvfb software compositing in the GPU process) | 811 MB, 5 processes |
| Ultra, every feature off | 17.2 % / 10.1 % (same GPU artifact) | 809 / 799 MB, 5 processes |
| Voice HUD + gaming HUD + 1 widget + clip buffer (720p30 VP8 software, static screen) | 7-8 % (renderer 2.2 %, browser 2.7 %, GPU 1.9 %) | 1132-1150 MB, 8 processes (3 overlay renderers about 85 MB each, clip about +30 MB renderer, +38 MB browser) |
| Everything turned off again | 0.1 % | 838-844 MB, 5 processes, 0 overlay windows |

A moving game at 720p30 will cost more encoder CPU than this static screen; with a hardware H.264 encoder (Windows) the research estimate is 1-3 %.
