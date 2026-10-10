# Descall polish audit

Date: 2026-10-10. Baseline is `v2.9.186` (`b37fb36`) before this branch.
Local Node is 22.14.0. CI installs Node 24. Frontend `node_modules` was not in the snapshot; `npm ci` was started for the production build. Backend selftests ran on the existing install.

## Baseline

| Check | Result |
|---|---|
| `descoin.unit.test.cjs` | pass |
| `listLatency.selftest.cjs` | pass. Model: warm group list 840 ms, warm DM/group messages 500 ms (calibrated to a measured 6.4 s group list before the 2.9.173 batching) |
| `chatCache.selftest.mjs` | pass. Memory paint 0.03 ms for 200 merges. IndexedDB read 0.22 ms (target &lt; 150 ms) |
| Backend / electron / script selftests and integration tests | 46 pass. `sitemap.selftest.cjs` fails: `/faq` is not in `staticPages` (pre-existing). `callSummary.integration.test.cjs` passes when run alone |
| `shop.integration.test.cjs` | pass after `uuid` was available (the committed backend `node_modules` does not include it) |
| `npm run build:prod`, Electron pack, iOS bundle | not run yet at audit time (frontend install). Recorded in PROGRESS after the batch |
| Supabase advisors | pulled for project `nlhswwpakwtnmuerkzch` |

Cache work from 2.9.173 (`frontend/src/lib/chatCache.js`, gzip JSON, batched group list) is in place. This audit does not duplicate it.

## Findings

### P0 — Anonymous key can read and delete server data

- Area: Supabase / security.
- Symptom: `anon` and `authenticated` had `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` on public tables. Row level security was off on 21 tables, including `server_messages`, `servers`, `shop_purchases`, and `user_inventory`.
- Evidence: `has_table_privilege('anon', 'public.server_messages', 'DELETE')` was true. `SET ROLE anon` counted 27 `server_messages` and 92 `shop_purchases`. `users` already had RLS (anon saw 0 rows) but anon could still `TRUNCATE`, and `TRUNCATE` ignores RLS. The app never uses the anon key (`createClient` is only the backend service role).
- Impact: anyone with the publishable anon key could read or wipe servers, messages, inventory, and purchases.
- Fix: `supabase/migrations/20261010_lock_anon_table_access.sql`, applied. After: anon `SELECT`/`DELETE`/`TRUNCATE` are false, `server_messages` RLS is on, service role still has `SELECT`/`UPDATE`, and `SET ROLE anon` returns `42501 permission denied`.
- Still open: 51 tables have RLS and no policies (safe only because the service role bypasses RLS and anon no longer has grants). Five functions had a mutable `search_path`; the migration sets `search_path = public`. `get_user_friends` is `SECURITY DEFINER` and is not called by the app; execute was revoked from anon/authenticated with the rest of `public`.

### P1 — Double purchase can charge twice

- Area: shop.
- Symptom: `POST /api/shop/purchase` checked ownership, then debited, then upserted inventory with `ignoreDuplicates`. Two overlapping requests both passed the check when the balance covered the price twice. The second grant was a no-op and the second debit stayed.
- Evidence: `frontend/backend/routes/shop.js` (before this batch) and `grantItem` in `frontend/backend/lib/shop.js`. Balance CAS only protects the balance number, not “one grant”. The Buy button’s disabled state updates after render, so two taps in one frame both call `handleBuy`.
- Impact: DesCoin lost, one item owned.
- Fix: `lib/shopPurchase.js` serializes the purchase per user, re-checks ownership, and refunds with `shop_refund` if the grant inserts nothing. `shop_refund` does not count toward the earning cap and still lands if the wallet is frozen. The shop button ignores a second tap until the first request finishes. A 409 from “already owned” refreshes inventory and the returned balance.
- Proof: `shop.integration.test.cjs` concurrent purchase (900 → 600, one ledger debit, one inventory row) and a forced null grant (250 refunded, balance unchanged).

### P1 — Failed daily claim burns the day

- Area: DesCoin.
- Symptom: `claimDaily` wrote `descoin_last_daily_claim` before `credit()`. A ledger failure rolled the balance back and left the claim date set, so the next try returned already-claimed and paid nothing.
- Evidence: `frontend/backend/lib/descoin.js` `claimDaily`.
- Fix: on credit failure the streak and claim date are restored. `descoin.unit.test.cjs` fails the ledger write once, asserts the date is cleared, then claims successfully.

### P2 — Composer icon buttons had no accessible name

- Area: accessibility, DM/group/server composer (shared by iOS, desktop, web).
- Symptom: attach, emoji, and voice buttons exposed only `title`.
- Fix: `aria-label` set to the existing Turkish/English strings. Asserted by `MessageComposer.sendlock.selftest.mjs`.
- Follow-up (2.9.190): icon-only buttons across the app copy `title` onto `aria-label`, or get a name from the existing translation key (`Close`, `End Call`, `Mute`, …). Switches expose `aria-pressed`. `iconButtonNames.selftest.mjs` fails if a new icon button ships without a name. Buttons that already show text were left alone.

### P2 — Message lists are not virtualized

- Area: performance.
- Evidence: `MessageList.jsx` maps every loaded message. Pages are 50 (`limit: 50` in `App.jsx`). IndexedDB keeps 60 per conversation (`chatCache.js`).
- Impact: a long history that the user pages upward grows the DOM. No dropped-frame measurement on a device in this environment.
- Plan: virtualize only if a scroll profile shows it. Do not rewrite the glass message menu in the same change.

### P2 — Sitemap selftest expects `/faq`

- Area: SEO.
- Evidence: `sitemap.selftest.cjs` line 26 fails. `robots.txt` allows `/faq`. Pre-existing, called out in the glass handoff.
- Plan: confirm the marketing route, then add the URL or drop the assertion. Not in this batch.

### P3 — Group-message index

- `idx_group_messages_group_created` from `supabase/migrations/20261010_chat_list_indexes.sql` was applied to production on 2026-10-10 with Demir's approval. It is valid and ready. Do not re-apply.
- EXPLAIN at the time was 0.17 ms / 1.4 ms. The multi-second group list was HTTP fan-out, already batched. The index does not change that latency.

### P3 — Supabase performance advisors

- 57 unindexed foreign keys (INFO), 55 unused indexes (INFO), 3 duplicate indexes (WARN), 13 `auth_rls_initplan` (WARN), 20 multiple permissive policies (WARN).
- The backend uses the service role, which bypasses RLS, so initplan policies do not sit on the hot API path. Dropping unused indexes and rewriting policies needs a measured query, not a bulk change.

### Checked and not currently broken

- Read retry is GET/HEAD only (`transportRetry.js`), so a dropped purchase response is not submitted twice by the client.
- Daily claim and capped earnings already use the per-user queue.
- Socket.IO reconnects (`socket.js`, `socketResume.js`) and call listeners remove themselves in `useCall.js`.
- DM/group history merge dedupes by id (`App.jsx`, `reconcileHistoryWindow`).
- Electron update deferral during calls is covered by `updateDeferral.selftest.mjs` (passed in the backend/electron run).

## Browser and device

UNVERIFIED this session: iPhone 375/440 and desktop 1280/1920 screenshots, cold-start bundle sizes, and a physical iPhone. The composer and shop changes are shared code; glass CSS was not edited, so the iOS glass layout should stay as shipped. Closest proxies: the selftests above and the production build recorded in PROGRESS.

## Batch plan

1. **This batch (P0 + P1 + small P2):** anon lockdown, purchase idempotency, daily-claim rollback, composer labels. Ship as the next free patch.
2. **Next:** confirm `/faq` in the sitemap; profile one long message list and virtualize only if the DOM cost shows up; icon-button labels on the screens a browser pass flags; re-measure hot list endpoints against the 1.2 s cold target on a warm Render instance.
3. **Later, with care:** duplicate/unused indexes, `auth_rls_initplan` policy rewrites. No DesCoin price or balance changes. No App Store submission.
