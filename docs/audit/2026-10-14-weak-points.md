# Descall weak-point audit — 2026-10-14

Static, read-only review of web, Electron, iOS, Android, and the Express/Socket.IO backend. Base: `main` at `813e339` (v2.10.66). No runtime pentest, no device pass, no production log review. Findings are things verified in this tree. Design reference: `docs/glass-redesign/apple-design.md` (fluid response, 44pt targets, reduced motion, visible focus, inline validation).

Effort: **S** a focused change in one or two files, **M** a feature slice with tests, **L** a cross-platform or architectural change.

## P0 — critical

### P0-1. Session revocation fails open when the database lookup throws

- **What:** `sessionAllowed()` returns `{ ok: true, degraded: true }` if reading `users.active_sessions` throws. HTTP `requireAuth` treats any `ok` as a valid session.
- **Where:** `frontend/backend/lib/sessionGuard.js` (`sessionAllowed`), `frontend/backend/middleware/auth.js` (`requireAuth`).
- **Why it matters:** Logout, password change, and admin revoke depend on that lookup. A Supabase blip lets a revoked JWT keep calling the API until it expires.
- **Effort:** S
- **Suggested fix:** Fail closed with `503 SESSION_CHECK_FAILED`, or accept only a short cache of `(userId, sid)` pairs that were validated in this process. Never return `ok: true` from the `catch`.

### P0-2. Socket authentication completes when session or age-gate checks throw

- **What:** After a valid JWT, `sessionAllowed()` and `ageGate.enforceChildClosure()` run in a promise. The `.catch()` still calls `assign()` and `next()`, so the socket is authenticated.
- **Where:** `frontend/backend/middleware/socketAuth.js` (`socketAuthMiddleware`).
- **Why it matters:** Real-time DMs, calls, and group signaling stay available to a revoked session or an under-13 account when the check errors. This is independent of P0-1: even a fail-closed `sessionAllowed` still fails open if the promise rejects.
- **Effort:** S
- **Suggested fix:** `catch` must call `next(new Error(...))` only. Do not assign `socket.user`.

### P0-3. CI never runs the test suite

- **What:** About 167 selftests and backend integration tests exist (`frontend/src/**/*.selftest.mjs`, `frontend/backend/test/*.integration.test.cjs`, `frontend/backend/**/*.selftest.cjs`). No workflow invokes them. `frontend/package.json` has no `test` script. Tag workflows run `build:prod` and a backend syntax check, then ship Windows and TestFlight.
- **Where:** `.github/workflows/release.yml`, `ios-testflight.yml`, `marketing-quality.yml`, `render-deploy.yml`, `vercel-deploy.yml`.
- **Why it matters:** Auth, bans, shop, and call regressions can be tagged and published. `conv-rows.selftest.mjs` is already red (`html.glass-ui` is present in `frontend/src/styles/conv-rows.css`; the test expects it not to be) and nothing in CI notices.
- **Effort:** M
- **Suggested fix:** Add a `ci-tests` job on pull requests and as `needs` of Publish and TestFlight: run every `*.selftest.*` plus `frontend/backend/test/*.integration.test.cjs`. Add `npm run test:selftest`. Fix or update the red conv-rows assertion in the same change.

## P1 — high

### P1-1. Non-friends can send DMs and start DM calls

- **What:** `dm:send` checks bans, timeouts, blocks, and a per-user rate limit, then inserts the message and can push. `call:offer` checks blocks, then rings (including VoIP push). Neither requires an accepted friendship. `dm:history` and several other DM events do.
- **Where:** `frontend/backend/socket/handlers.js` (`dm:send` around the block checks, `call:offer`; contrast `dm:history` which calls `isAcceptedFriend`).
- **Why it matters:** Anyone with a user id can harass with persisted messages and phone-call rings. History is hidden from non-friends, so the product looks closed while delivery is open.
- **Effort:** M
- **Suggested fix:** Require `isAcceptedFriend` before insert, push, and `call:offer`, unless you add an explicit message-request model. Cover it with a socket integration test.

### P1-2. Group call signaling does not check membership

- **What:** `group:message` checks `group_members`. `group:call:start` joins `group:${groupId}`, creates an in-memory call, writes `group_calls`, and rings members loaded from the database, without checking that the caller is a member. Offer, answer, ICE, join, and accept handlers relay to `user:${toUserId}` the same way. `group:call:check` returns the live banner for any `groupId`.
- **Where:** `frontend/backend/socket/groupHandlers.js` (`group:call:start`, `group:call:check`, `group:call:join`, `group:call:accept`, `group:call:offer`, `group:call:answer`, `group:call:ice`).
- **Why it matters:** A logged-in user who knows or guesses a group id can ring that group and inject SDP/ICE toward arbitrary user ids.
- **Effort:** M
- **Suggested fix:** One `assertGroupMember(myId, groupId)` used by every group-call event. Relay SDP/ICE only when both users are in `activeGroupCalls.get(groupId).participants`.

### P1-3. TURN credentials are on an unauthenticated endpoint

- **What:** `GET /api/webrtc/ice-config` is public, cached for 5 minutes, and returns `buildIceServersFromEnv()`, including TURN username and credential when those env vars are set. The comment says browsers need ICE before auth.
- **Where:** `frontend/backend/routes/webrtc.js` (`/ice-config`, `buildIceServersFromEnv`).
- **Why it matters:** Anyone can relay traffic through the TURN server and run up the bill. The client never reads `turnConfigured`.
- **Effort:** M
- **Suggested fix:** Public response is STUN only. Mint short-lived TURN credentials behind `requireAuth` (same idea as the LiveKit token). Await `preloadIceServers()` in `frontend/src/lib/iceConfig.js` before the first `RTCPeerConnection` (`frontend/src/lib/webrtcPeerFactory.js`).

### P1-4. Settings updates return the raw `users` row

- **What:** Profile update uses `toPublicUser()`. Notification, privacy, and regional updates `.select()` the row and send `user: data` with the service role. That row includes `password_hash` and OAuth identifiers when those columns exist.
- **Where:** `frontend/backend/server.js` (`PUT /api/user/notifications`, `/api/user/privacy`, `/api/user/regional`). Profile update just above them uses `toPublicUser`.
- **Why it matters:** A settings save puts credential material in the JSON body. Any XSS, extension, or client log then sees it. The same handlers also return `error.message` from Supabase on failure.
- **Effort:** S
- **Suggested fix:** Return `toPublicUser()` (or an explicit column list) on every user update. Send a generic 500 to the client.

### P1-5. `POST /api/errors` is unauthenticated and unthrottled

- **What:** The handler accepts `stack`, `userId`, `username`, and `severity` from the body and stores them, then notifies the admin room.
- **Where:** `frontend/backend/routes/errors.js` (`POST /`).
- **Why it matters:** The table and the admin error feed can be filled with forged users and stacks. Real crashes disappear in the noise.
- **Effort:** S
- **Suggested fix:** Rate-limit by IP. If a JWT is present, bind `userId` to it; otherwise store null. Cap body size.

### P1-6. `/debug/peek/:tableName` is on whenever `NODE_ENV` is not `production`

- **What:** The route uses the service role to `select *` limit 5 from the table name in the URL. It is not behind admin auth. The comment says `ENABLE_DEBUG_ROUTES` must not reopen it, but the flag is only `NODE_ENV !== "production"`.
- **Where:** `frontend/backend/server.js` (`debugRoutesEnabled`, `/debug/tables`, `/debug/peek/:tableName`).
- **Why it matters:** A staging or mis-set Render service exposes user rows. Production with `NODE_ENV=production` is off; the switch is one env var.
- **Effort:** S
- **Suggested fix:** Require `ENABLE_DEBUG_ROUTES=true` and an admin JWT. Ignore `NODE_ENV` alone.

### P1-7. Group calls are an uncapped full mesh

- **What:** `useGroupCall` opens one peer connection per remote participant and encodes screen share per peer. Server comments mention a small group. Nothing rejects a join past a limit. Server voice can use LiveKit (`routes/webrtc.js` `preferSfu`); `useGroupCall.js` has no LiveKit path.
- **Where:** `frontend/src/hooks/useGroupCall.js` (`startGroupCall`, `startScreenShare`); `frontend/backend/socket/groupHandlers.js`.
- **Why it matters:** CPU and bandwidth grow with the square of the group. A busy group plus screen share drops audio and leaves black tiles. This is the main call-stability ceiling.
- **Effort:** L
- **Suggested fix:** Enforce a server-side participant cap now (reject with a clear error). Move group calls onto the existing LiveKit SFU when `preferSfu` is true.

### P1-8. A long socket drop can leave the client in a dead group call

- **What:** The server removes a participant after the disconnect grace. `group:call:resume` is a no-op when that user is gone, and the handler ignores the failure. The client still thinks it is in the call.
- **Where:** `frontend/backend/socket/groupCallLifecycle.js` (`scheduleParticipantDisconnectGrace`, `resumeParticipantInGroupCall`); `frontend/src/hooks/useGroupCall.js` (socket `connect` handler).
- **Why it matters:** The user sees an in-call UI with no media and no automatic leave. They have to discover it themselves.
- **Effort:** M
- **Suggested fix:** Emit `group:call:ended` (or an error) when resume finds no participant. Client `cleanup()` on that event.

### P1-9. Group network recovery restarts ICE without a new offer

- **What:** Network and visibility handlers call `pc.restartIce()` only. A failed ICE state path does call `renegotiateWithPeer`. DM calls renegotiate on the same class of recovery (`useCall.js`).
- **Where:** `frontend/src/hooks/useGroupCall.js` (`subscribeNetworkChange`, visibility handler, `renegotiateWithPeer`).
- **Why it matters:** Wi-Fi to cellular handoff often leaves one-way or silent audio until the user leaves and rejoins.
- **Effort:** M
- **Suggested fix:** On reconnect, call `renegotiateWithPeer(..., { iceRestart: true })` for each peer connection that is not `connected`.

### P1-10. Android version and push are behind the shipped app

- **What:** `frontend/package.json` is `2.10.66`. `frontend/android/app/build.gradle` is `versionName "2.9.91"` / `versionCode 20991`. `release.yml` publishes the Windows installer only. `build.gradle` comments say CI overwrites those fields from the tag; no Android job exists. `google-services.json` is absent; the Gradle file applies the Google services plugin only when that file is present, while `frontend/src/lib/nativePush.js` still registers FCM on Android.
- **Where:** `frontend/android/app/build.gradle`, `.github/workflows/release.yml`, `frontend/android/README.md`, `frontend/src/lib/nativePush.js`.
- **Why it matters:** Sideload and Play updates can no-op or look like a downgrade. Android call and message push cannot be reliable without Firebase config. There is no Gradle job to catch a broken manifest.
- **Effort:** M
- **Suggested fix:** Teach `sync-version.cjs` to set `versionName` and a monotonic `versionCode`. Add a signed `assembleRelease` job to the tag workflow. Either ship `google-services.json` via CI secrets or stop advertising Android push until FCM exists.

### P1-11. App shell weight sits next to a mesh call stack

- **What:** The production build of v2.10.66 keeps marketing first paint inside budget (207.2 KB gzip, budget 220 KB). The authenticated shell does not: `App-*.js` is about 1000 KB (274 KB gzip), `styles-*.css` about 925 KB (152 KB gzip), `vendor-livekit` about 551 KB, `vendor-react` about 142 KB. `frontend/src/App.jsx` is about 5100 lines.
- **Where:** `frontend/src/App.jsx`, Vite output from `npm run build:prod`, `frontend/scripts/perf-budget.mjs` (marketing routes only).
- **Why it matters:** Cold start and memory on mid-range phones compete with a mesh call. The perf budget does not see this chunk. A call that already struggles (P1-7) starts from a heavy JS parse.
- **Effort:** L
- **Suggested fix:** Route-split `App.jsx` so call, shop, and admin chunks load on entry. Extend the perf budget to the authenticated entry, or set a separate cap, without raising the marketing 220 KB limit.

## P2 — medium

### P2-1. Privacy toggles are stored and not enforced

- **What:** `PUT /api/user/privacy` writes `allow_friend_requests`, `profile_visible_to`, online/last-seen/typing flags. Backend friend-request and public profile reads do not consult them. A repo search shows the columns written only in `server.js`.
- **Where:** `frontend/backend/server.js`; `frontend/backend/routes/friends.js`; `frontend/backend/routes/auth.js` (`GET /auth/users/:id`).
- **Why it matters:** The settings screen promises a control the server ignores.
- **Effort:** M
- **Suggested fix:** Reject friend requests and group invites when the flag is off. Hide or reduce `GET /auth/users/:id` when `profile_visible_to` says so.

### P2-2. Web session token lives in `localStorage`

- **What:** `getToken()` / `writeLocalToken()` use `localStorage` on web. iOS moves the token to the Keychain after hydration. Electron can use the safeStorage bridge.
- **Where:** `frontend/src/lib/storage.js`.
- **Why it matters:** Any XSS reads a bearer token. Combined with P1-4, a settings response makes that token enough to replay credential-bearing JSON. JWT lifetime is on the order of days.
- **Effort:** L
- **Suggested fix:** HttpOnly `Secure` cookie for the web session, with a CSRF approach that fits Socket.IO auth. Keep Keychain and Electron safeStorage.

### P2-3. Chat and voice attachments use public storage URLs

- **What:** Uploads go to the `media` bucket and the API returns `getPublicUrl()`.
- **Where:** `frontend/backend/routes/media.js` (`uploadToSupabase`).
- **Why it matters:** Anyone with the URL can fetch the file without a conversation check. Account deletion does not, by itself, make that URL stop working.
- **Effort:** M
- **Suggested fix:** Private bucket and short-lived signed URLs authorized against conversation membership.

### P2-4. Legacy voice-recording objects are outside account deletion

- **What:** `/api/voice-recordings` returns 410. Account deletion removes `voice_recordings` rows. `AGENTS.md` says `media/voice-recordings/` is left in place on purpose.
- **Where:** `frontend/backend/routes/gone.js`, `frontend/backend/lib/accountDeletion.js`, `AGENTS.md`.
- **Why it matters:** A deleted account can still have call audio in object storage. That is an erasure gap for GDPR and App Store account-deletion review, even though the product feature is gone.
- **Effort:** M
- **Suggested fix:** A deletion job that lists and removes the user's recording prefix, then document the retention window in the privacy policy.

### P2-5. Rate limits and several abuse counters are process memory

- **What:** Auth, socket, DM, and analytics limits use in-memory maps (`lib/rateLimit.js` and similar). Report-alert email throttling is also in memory. Render restarts clear them. The socket middleware calls `recordFailure` on every connection attempt after a successful peek, so healthy reconnects count toward the same 120/minute lockout.
- **Where:** `frontend/backend/lib/rateLimit.js`, `frontend/backend/middleware/socketAuth.js`, `frontend/backend/lib/reportAlertEmail.js`.
- **Why it matters:** Brute-force and report floods get a fresh window on every deploy. A campus NAT can lock itself out by reconnecting.
- **Effort:** M for the socket counter, L for shared storage.
- **Suggested fix:** Count failures only when auth fails. Move auth and `/api/errors` limits to a shared store if more than one instance runs.

### P2-6. `room:join` accepts any room id

- **Status:** fixed in 2.11.1. Both handlers removed; `backend/socket/roomJoinRemoved.selftest.cjs`.

- **What:** An authenticated socket can `socket.join(roomId)` and emit `room:message` to it. No membership check. No current client caller was found; the handler is still registered.
- **Where:** `frontend/backend/socket/handlers.js` (`room:join`, `room:message`).
- **Why it matters:** A future feature that uses a guessable room name inherits eavesdropping.
- **Effort:** S
- **Suggested fix:** Delete the handlers, or namespace rooms and check membership.

### P2-7. Group call client drops work on the floor

- **What:** Incoming offers return immediately when `localStreamRef` is empty (no queue). `onParticipantJoined` returns when the peer connection is `connecting`, so a banner join may never send an offer. `onAccept` and `onAnswer` use empty `catch` blocks. Unmount stops tracks locally and does not emit `group:call:leave`.
- **Where:** `frontend/src/hooks/useGroupCall.js` (`onOffer`, `onParticipantJoined`, `onAccept`, `onAnswer`, unmount effect, `leaveCall`).
- **Why it matters:** These are the silent “I joined and nobody can hear me” paths, especially on iOS while the mic permission prompt is up, and they leave a ghost on the roster until the 45s grace.
- **Effort:** M
- **Suggested fix:** Queue offers the way ICE candidates are queued. Retry a `connecting` peer. Surface negotiation errors and reset that peer. Emit leave on unmount if `isInCallRef` is set.

### P2-8. DM “unreachable” does not end the outgoing call

- **What:** `call:unreachable` marks quality failed and leaves the outgoing UI up. Ring ICE from the caller is capped (`MAX_BUFFERED_ICE` 64) while the callee has not answered, which matters for a VoIP-woken iPhone that resumes pending ICE.
- **Where:** `frontend/src/hooks/useCall.js` (`onUnreachable`); `frontend/backend/lib/dmCallLog.js` (`bufferCallerIce`).
- **Why it matters:** The caller stares at a ringing screen that will not connect. A woken callee can miss candidates that were dropped.
- **Effort:** S
- **Suggested fix:** End the outgoing call after a short grace with a toast. Raise the ring buffer or drop oldest with a log.

### P2-9. Group call roster is memory on one Node process

- **What:** `activeGroupCalls` is a `Map` in `runtime/sharedState.js`. A restart drops it. Database rows can still say the call is active. There is no boot reconciliation.
- **Where:** `frontend/backend/runtime/sharedState.js`, `frontend/backend/socket/groupHandlers.js`.
- **Why it matters:** A deploy mid-call desyncs banners, join, and the “call in progress” state. A second instance would not see the first instance’s calls.
- **Effort:** M
- **Suggested fix:** On boot, mark stale `group_calls` ended, or hydrate the map from rows that are still active. Do not run more than one call-holding instance until that exists.

### P2-10. iOS group rings are not CallKit; Android calls depend on a foreground service

- **What:** DM `call:offer` sends a VoIP push (`lib/voipPush.js`, `DescallCallManager.swift`). Group start uses an alert push. `CallForegroundService.java` documents that the WebView call dies in the background without the foreground service, and `stopSelf()` runs if start fails.
- **Where:** `frontend/backend/socket/handlers.js` (VoIP block on `call:offer`), `frontend/backend/socket/groupHandlers.js` (group push), `frontend/ios/App/App/DescallCallManager.swift` (`prepareAudioSessionIfIdle`), `frontend/android/app/src/main/java/com/descall/app/CallForegroundService.java`, `frontend/src/lib/callWakeLock.js`.
- **Why it matters:** A backgrounded iPhone can miss a group ring that a DM would show as a system call. An Android call that fails to start the foreground service drops when the user leaves the app. The Swift comment is explicit that changing `AVAudioSession` category during capture produces silence.
- **Effort:** L for group CallKit, M for Android foreground-service failure UI.
- **Suggested fix:** If group CallKit is out of scope, say so in the incoming UI (“open Descall to join”). Treat foreground-service start failure as a user-visible error. Keep audio-session changes on the idle-only path.

### P2-11. Electron update busy-flag clears on `beforeunload`

- **What:** The renderer reports voice not-busy on page unload, including a reload during a call. Main re-checks before install, so this is not an automatic quit, but it clears the busy bit the deferral logic trusts.
- **Where:** `frontend/src/hooks/useElectronVoiceBusy.js`, `frontend/electron/main.cjs` (`voice:set-busy`, quiet install).
- **Why it matters:** A reload in a call can make a staged update eligible sooner than the in-call policy intends.
- **Effort:** S
- **Suggested fix:** Skip the unload clear when `deriveVoiceBusy()` is true. Let main’s crash/reload reset remain the backstop.

### P2-12. Electron download IPC and external opens are wider than the app needs

- **What:** `download-file` fetches any URL the renderer passes and writes `path.join(downloads, filename)` with no host allowlist and no filename normalization. `setWindowOpenHandler` and `will-navigate` call `shell.openExternal(url)` for non-setup URLs without an `http:` / `https:` check. Packaged CSP is `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. `nodeIntegration` is false and `contextIsolation` is true.
- **Where:** `frontend/electron/main.cjs` (`download-file` handler, `setWindowOpenHandler`, `will-navigate`, CSP `onHeadersReceived`).
- **Why it matters:** A renderer bug or XSS can fetch internal URLs and write outside Downloads via `..` in `filename`, or hand a non-http URL to the shell. `unsafe-eval` weakens the CSP that would otherwise contain that.
- **Effort:** S for the allowlist and filename, M for CSP.
- **Suggested fix:** Allow only `https:` to known hosts. Use `path.basename` and reject absolute paths. Allow `shell.openExternal` only for `http:` and `https:`. Drop `unsafe-eval` in packaged builds if the bundle does not need it.

### P2-13. Glass UI keyboard focus is thinner than desktop glass

- **What:** `html.glass-desktop` sets a document `:focus-visible` outline in `glass-desktop/a11y.css`. `html.glass-ui` has no equivalent. Glass GIF cells set `outline: none` and do not replace it. The composer and GIF search field have no `:focus-within` ring. `GlassConfirm` is `role="alertdialog"` and closes on Escape, with no focus trap and no initial focus. The primary tab bar is `display: none` while `html.kb-open` is set, so keyboard users lose Friends / DMs / Settings while a field is focused. Tab buttons have names and no arrow-key roving tabindex.
- **Where:** `frontend/src/styles/glass-desktop/a11y.css`, `frontend/src/styles/glass/chat.css`, `frontend/src/styles/glass/shell.css` (`html.glass-ui.kb-open .g-tabbar`), `frontend/src/components/ui/GlassConfirm.jsx`, `frontend/src/components/layout/glass/GlassShell.jsx`.
- **Why it matters:** `apple-design.md` treats visible focus and “never trap the user” as part of making the interface predictable. These are the glass surfaces iPhone and narrow mobile web actually use. Auth errors in `AuthView.jsx` are a plain `<p class="error-message">` with no `role="alert"`; a repo search finds no `aria-invalid`.
- **Effort:** M
- **Suggested fix:** Port the desktop `:focus-visible` rule under `html.glass-ui`. Restore a GIF-cell focus ring. Focus the default button and trap Tab in `GlassConfirm`. Keep a way to reach the tab bar while the keyboard is open. Add `role="alert"` on auth errors.

### P2-14. Glass visuals leak onto non-glass platforms, and one scope test is already failing

- **What:** `.activity-current-card` applies `backdrop-filter: blur(22px)` with no `html.glass-ui` / `html.glass-desktop` guard. The comment says that is intentional. `conv-rows.selftest.mjs` asserts `conv-rows.css` does not contain `html.glass-ui`; the file does, and the test fails. `html.glass-ui` has no `forced-colors` block; desktop glass does.
- **Where:** `frontend/src/styles/activity-card.css`, `frontend/src/styles/conv-rows.css`, `frontend/src/styles/conv-rows.selftest.mjs`, `frontend/src/styles/glass-desktop/a11y.css`, `frontend/src/styles/glass/material.css`.
- **Why it matters:** Desktop, Android, and classic web are supposed to stay pixel-identical unless the glass class is on. An unscoped blur is extra GPU work and a visual drift. A red selftest that CI does not run will not catch the next leak.
- **Effort:** S
- **Suggested fix:** Scope the activity card blur to the glass classes. Move glass conversation rules into `styles/glass/` or teach the selftest to allow selectors that are themselves under `html.glass-ui`. Port `forced-colors` onto `html.glass-ui`.

### P2-15. Reduced motion and contrast are incomplete on glass controls

- **What:** Composer send and action buttons always use Framer `whileTap` / `whileHover` scale. `usePressFeedback` skips scale when reduced motion is on; these buttons do not. `--g-t3` is `rgba(235,238,255,0.46)` and is used for placeholders, hints, and empty copy. Toolbar segment buttons are 40×44. `prefers-contrast` solidifies materials, not this text.
- **Where:** `frontend/src/components/chat/MessageComposer.jsx`, `frontend/src/styles/glass/tokens.css`, `frontend/src/styles/glass/shell.css` (`.g-bgroup-btn`), `docs/glass-redesign/apple-design.md` (reduced motion, 44pt targets).
- **Why it matters:** Reduced-motion users still get scale animation on the control they hit most. Hint text on the dark glass field is the kind of contrast miss VoiceOver users and low-vision users hit first. 40px-wide segments miss the 44pt target on the edges.
- **Effort:** S for motion and hit area, M for a contrast pass.
- **Suggested fix:** Disable `whileHover` / `whileTap` when `useReducedMotion()` is true. Bump hint text under `a11y-contrast` and `prefers-contrast: more`. Make the segment hit target 44×44.

### P2-16. Activity empty state is still the pre-glass card

- **What:** Activity’s empty UI uses `activity-empty-state` from `app-layout.css`. Friends empty states have glass rules (`.g-friends-empty`). Activity does not. There is a server rules accept screen (`ServerRulesModal.jsx`) and no general first-run tour.
- **Where:** `frontend/src/components/activity/ActivityView.jsx`, `frontend/src/styles/app-layout.css`, `frontend/src/styles/glass/social.css`.
- **Why it matters:** New accounts land on Friends and Activity. One of those is glass, the other is the old card, which fights the Liquid Glass guide’s “one material system” on the first screen people judge.
- **Effort:** M
- **Suggested fix:** Restyle the Activity empty state with the same glass empty pattern as Friends. A short first-run sheet (voice, friends, a server) would cover onboarding; that part is L if it includes product copy in both languages.

### P2-17. Bans, account deletion, and group-call behavior are untested

- **What:** `lib/moderation.js` updates `bannedUserIds`, and both auth middlewares consult that set. No test asserts a banned user gets 403 or a rejected socket. `accountDeletion.js` (request, grace, sweeper) has no test. `useCall.selftest.mjs` mostly checks source text. There is no `useGroupCall` selftest. `callSummary.integration.test.cjs` is the strong call test and it is not in CI (P0-3).
- **Where:** `frontend/backend/lib/moderation.js`, `frontend/backend/lib/accountDeletion.js`, `frontend/src/hooks/useCall.selftest.mjs`, `frontend/src/hooks/useGroupCall.js`, `frontend/backend/test/`.
- **Why it matters:** Bans and erasure are the safety and App Store 5.1.1(v) paths. The group-call hook is about 2700 lines with the failure modes in P1-8 and P2-7.
- **Effort:** M
- **Suggested fix:** `moderation.selftest.cjs` for ban and unban. An account-deletion test on the fake Supabase. Extract the pure “should I send an offer / should I leave on unmount” decisions from `useGroupCall` and test those.

### P2-18. Hot files are too large to review safely

- **What:** Approximate sizes: `frontend/src/App.jsx` ~5140 lines, `frontend/src/hooks/useGroupCall.js` ~2680, `frontend/src/components/CallOverlay.jsx` ~2600, `frontend/backend/routes/auth.js` ~2150, `frontend/backend/socket/handlers.js` ~2110. There is no ESLint config in `frontend/`. TODO/FIXME markers are not how this debt shows up.
- **Where:** those files.
- **Why it matters:** Call, auth, and socket fixes land in files that do not fit in one review. That is how P1-1 and P2-7 survive next to well-tested neighbors.
- **Effort:** L
- **Suggested fix:** Split by feature when the next change touches them (socket routers, call state machine, auth route modules). Add ESLint for hooks and unused vars, warnings first, in the new test job.

### P2-19. App Store listing and privacy label can drift from the binary

- **What:** `PrivacyInfo.xcprivacy` lists 16 collected types and `NSPrivacyTracking` false. `appstore-metadata.yml` states nutrition labels are still edited in App Store Connect by hand. `Info.plist` background modes include `voip`, `audio`, and `remote-notification`, and `DescallCallManager.swift` uses PushKit and CallKit for DM calls. Repo screenshots under `appstore/screenshots/` were intentionally left unchanged during the Konsept 2 cleanup, so listing captures can still show the previous mark. This audit did not touch that directory or the in-review 2.9.182 submission.
- **Where:** `frontend/ios/App/App/PrivacyInfo.xcprivacy`, `frontend/ios/App/App/Info.plist`, `frontend/ios/App/App/DescallCallManager.swift`, `.github/workflows/appstore-metadata.yml`, `appstore/screenshots/`.
- **Why it matters:** Label drift is a rejection and a trust problem. VoIP push used for non-call alerts is a known rejection reason; the code path looks DM-only, which is what review will ask about. Stale screenshots advertise the old logo.
- **Effort:** S
- **Suggested fix:** A release checklist that diffs the manifest’s 16 types against the ASC form. Keep VoIP pushes on the CallKit path only. Refresh listing screenshots in a later submission, not by editing the in-review 2.9.182 package.

### P2-20. Marketing waitlist can email the operator without a limit

- **What:** `POST /api/marketing/waitlist` sends a Resend message per valid signup. No IP limit on that route.
- **Where:** `frontend/backend/server.js` (waitlist handler).
- **Why it matters:** It burns the Resend quota and fills the operator inbox. Report alerts have a throttle; this route does not.
- **Effort:** S
- **Suggested fix:** Per-IP limit and one email per address per day.

## P3 — nice to have

### P3-1. JWTs without a session id are still accepted until a cutoff

- **What:** Tokens with no `sid` stay valid when `iat` is before `SESSION_LESS_ACCEPT_BEFORE_MS` (2026-10-11) inside `decideSession`.
- **Where:** `frontend/backend/lib/sessionGuard.js`.
- **Why it matters:** Those tokens cannot be revoked via `active_sessions`. The window is short if expiry is days, and it is already in the past relative to this audit’s date, so impact depends on token lifetime.
- **Effort:** S
- **Suggested fix:** Reject session-less tokens outright once you are sure no supported client still holds one.

### P3-2. Public profanity list and analytics ingest

- **What:** `GET /api/features/profanity` returns the filter word list with no auth. `POST /api/analytics/collect` accepts a visitor key and event props with a light IP cap.
- **Where:** `frontend/backend/routes/publicFeatures.js`, `frontend/backend/routes/analytics.js`.
- **Why it matters:** The word list helps people evade the filter. Analytics is a privacy surface that should stay aligned with the consent banner and the iOS privacy manifest.
- **Effort:** S for the word list, M for analytics review.
- **Suggested fix:** Serve the list only to logged-in clients. Document retention for `visitorKey` next to the 16 privacy-manifest types.

### P3-3. VoIP status HMAC falls back to `JWT_SECRET`

- **What:** `signVoipStatus` uses `VOIP_STATUS_SECRET` or else `JWT_SECRET`.
- **Where:** `frontend/backend/lib/voipStatus.js`.
- **Why it matters:** Forging a status token and forging a session token share one secret if the dedicated one is unset.
- **Effort:** S
- **Suggested fix:** Require `VOIP_STATUS_SECRET` in production.

### P3-4. iOS auth shows an “or” divider with no Google button

- **What:** The divider renders for native iOS or when Google is offered. `GoogleSignInButton` returns null on iOS. Apple Sign-In is iOS-only, which matches App Store 4.8 for the iOS binary.
- **Where:** `frontend/src/components/AuthView.jsx`, `frontend/src/components/auth/GoogleSignInButton.jsx`, `frontend/src/lib/googleSignInOffer.js`, `frontend/src/components/auth/AppleSignInButton.jsx`.
- **Why it matters:** The divider implies a third option that is not there. The platform split itself is correct and should stay.
- **Effort:** S
- **Suggested fix:** Render the divider only when Google is actually offered.

### P3-5. Glass comments still say “iPhone only”

- **What:** `GlassShell.jsx` and `glass/tokens.css` describe iPhone-only glass. `glassUi.js` can also set `html.glass-ui` for a narrow phone-like browser when the desktop flag allows it.
- **Where:** `frontend/src/lib/glassUi.js`, `frontend/src/components/layout/glass/GlassShell.jsx`, `frontend/src/styles/glass/tokens.css`.
- **Why it matters:** People test the wrong surface and “fix” iPhone glass in a way that hits mobile web, or the reverse.
- **Effort:** S
- **Suggested fix:** Update the comments to match `glassUi.js`.

### P3-6. Avatar images use empty alt

- **What:** Loaded avatars render `<img alt="">`.
- **Where:** `frontend/src/components/ui/Avatar.jsx`.
- **Why it matters:** Fine when the row’s accessible name is the display name beside the image. Wrong when the image is the only name.
- **Effort:** S
- **Suggested fix:** Pass `alt=""` only when a sibling already names the person; otherwise `alt={displayName}`.

### P3-7. Removed DimaAI and recording routes are still in the tree

- **What:** `/api/dimaai` and `/api/voice-recordings` return 410. Deletion still knows the legacy tables. Shotkit still mocks DimaAI for design captures.
- **Where:** `frontend/backend/server.js`, `frontend/backend/routes/gone.js`, `frontend/backend/lib/accountDeletion.js`, `docs/glass-redesign/shotkit/routes.cjs`.
- **Why it matters:** New contributors treat 410 routes and shotkit mocks as live product. The tables are an intentional non-drop until a migration is safe.
- **Effort:** M
- **Suggested fix:** Keep the 410s until old clients are gone. Drop the tables in a dedicated migration when backups exist. Remove the shotkit mocks.

### P3-8. Discord-class product gaps (not bugs)

These are absent as product surfaces, not broken implementations. Marketing copy in `frontend/src/site/seo/nicheLandings.js` already says Descall is not competing on slash-command count.

- **Threads and forum channels.** “Thread” in the app means a DM conversation, not a Discord thread. No forum channel type showed up in client code.
- **Bots and a slash-command platform.** Casino commands exist as an in-app game (`frontend/src/lib/casinoCommands.js`). There is no third-party bot API.
- **Group screen share at Discord scale.** Server voice can prefer LiveKit. Group calls cannot (P1-7). iOS screen capture is intentionally unavailable (`screenShareUnavailableOnIos()` in `frontend/src/lib/webrtcScreenShare.js`).
- **Public macOS and Linux downloads.** Electron’s mac target exists; the download page must not list macOS or Linux (`AGENTS.md`). That is policy, not an accident. It is still a gap versus Discord’s desktop matrix.
- **Android notification parity.** See P1-10.

- **Effort:** L per item.
- **Suggested fix:** Pick one. The stability win is the group-call SFU (P1-7), not a bot platform.

### P3-9. Android release signing is optional on a local build

- **What:** If `keystore.properties` is missing, the release type warns and ships unsigned.
- **Where:** `frontend/android/app/build.gradle`, `frontend/android/keystore.properties.example`.
- **Why it matters:** Easy to upload an unsigned artifact by mistake. Secrets are correctly not in the repo. `allowBackup` is false and cleartext traffic is false, which is the right baseline.
- **Effort:** S
- **Suggested fix:** The CI job in P1-10 should fail the release build when the keystore secrets are missing.

## What is in good shape

- Electron renderer: `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`.
- iOS: Sign in with Apple on the native app, Google hidden there, privacy manifest present, account deletion route present, CallKit for DM calls.
- Auth and shop have real integration tests (`auth.integration.test.cjs`, `authSecurity.integration.test.cjs`, `shop.integration.test.cjs`, `authSocialSignup.selftest.cjs`). They need CI (P0-3) more than they need to be rewritten.
- Marketing first-paint budget is enforced in `build:prod` and is currently under 220 KB.
- Ban state is updated in `lib/moderation.js` on ban and unban, not only at boot.
- Glass CSS scope selftests exist for `styles/glass/` and `styles/glass-desktop/`. The hole is the shared sheets in P2-14, not the glass folders themselves.

## Suggested order

1. P0-1 and P0-2 before any other backend work. They are small and they fail open.
2. P0-3 so the rest of this list cannot regress silently. Fix the red `conv-rows` selftest in that job.
3. P1-1, P1-2, P1-3, P1-4 as the harassment and credential batch.
4. P1-7 through P1-9 as the call-stability batch, with P1-10 if Android ship is still a goal.
5. P2 privacy enforcement, media URLs, and glass focus after those.
