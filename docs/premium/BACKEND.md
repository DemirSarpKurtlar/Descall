# Descall+ and Descall Ultra: backend (phase 1)

This is the server side of `docs/premium/CONTRACT.md`. Phase 1 has no payments. Admins grant memberships, and `free_membership` campaigns grant them too. Every membership gives a DesCoin gift each 30-day cycle: 5000 for `plus` and 15000 for `ultra`. The first gift is paid at the grant.

## Migration

| File | Live name (Descall-EU) | Status |
|---|---|---|
| `supabase/migrations/20261106_premium_memberships.sql` | `20261106_premium_memberships` | **Not applied yet.** The Supabase `apply_migration` call on 2026-11-02 asked for a confirmation that got no answer, and nothing was written. Read-only checks show no premium tables or functions and the old ledger CHECK. Apply the file as it is. |

The migration only adds things:
- New tables.
- New functions.
- One new partial unique index on `descoin_ledger`.
- A wider `descoin_ledger_reason_check`, which adds `premium_gift` and keeps every live value (the live definition was checked on 2026-11-02).

Nothing is dropped or renamed. The R3 tables are not touched. You can run the file twice safely.

Until the migration is applied, the backend still runs:
- `/api/premium/me` answers `plan: null`.
- Admin premium routes answer 503 `premium_unavailable`.
- `requireFeature` / `hasFeature` fail closed.
- The scheduler logs one warning.

## Data model

| Table | Notes |
|---|---|
| `premium_plans` | `plus` and `ultra` are seeded. Price columns stay null. `features` holds the effective key list. |
| `user_subscriptions` | One row per user (`user_id` is the primary key). The CHECK requires `unlimited` to match `ends_at is null`. Extra columns: `coin_cycles_paid` and `created_at`. |
| `subscription_events` | Append-only. A trigger rejects UPDATE, DELETE and TRUNCATE. The unique index on (`request_id`, `user_id`) makes retries idempotent. The unique index on (`user_id`, `cycle_at`) where `kind = 'coin_grant'` allows one gift per cycle. Extra columns: `campaign_id`, `coins`, `cycle_at` and `meta`. |
| `premium_bulk_batches` / `premium_bulk_results` | One batch per bulk `request_id`, with one result row per user. |
| `premium_campaigns` / `premium_campaign_redemptions` | Kinds are `free_membership`, `percent` and `fixed`. Only `free_membership` does anything in phase 1. The other two answer `not_redeemable`. |
| `payment_transactions` | Empty. Nothing writes to it in phase 1. |

Security:
- RLS is on for every table.
- `anon` and `authenticated` lose all grants.
- `authenticated` may SELECT only its own `user_subscriptions` row and its own events (`auth.uid()` policy).
- Every function is SECURITY DEFINER with a pinned `search_path`, and only `service_role` may execute it.

Membership state is lazy. A membership is active while `status = 'active'` and (`unlimited` or `ends_at > now()`), as with `ban_expires_at`. Reads never wait for the sweeper.

## SQL functions

| Function | What it does |
|---|---|
| `premium_admin_apply(p_actor, p_user, p_op, p_plan, p_days, p_ends_at, p_unlimited, p_is_free, p_reason, p_note, p_request_id, p_batch)` | Handles grant, extend, change_plan, cancel, set_end and set_unlimited (see the rules below). Takes a per-user advisory lock, then the row FOR UPDATE, and writes exactly one op event. If `request_id` was seen before for this user, it returns the first result with `replay: true`. |
| `premium_admin_bulk(p_actor, p_user_ids[], ...same..., p_request_id)` | Up to 500 users. Each user runs in its own subtransaction, so one failure never undoes the others. A repeated `request_id` returns the stored batch. |
| `premium_bulk_get(p_batch)` | Returns a batch and its per-user results. |
| `premium_pay_cycles(p_user)` | Internal. Pays every due cycle that started before `ends_at`, each exactly once. In one transaction it writes the event, the `users.descoin_balance` update, and a `descoin_ledger` row (`reason 'premium_gift'`, `meta.idempotency_key`, unique). A frozen wallet or a deleted account still records the cycle, with `coins 0` and `meta.withheld`. |
| `premium_grant_due_coins(p_user default null)` | Pays due cycles for up to 500 members. Uses FOR UPDATE SKIP LOCKED. |
| `premium_expire_due()` | Pays any cycles still owed, then marks ended rows `expired` and writes an `expire` event. Memberships of deleted accounts end the same way, with reason `account_deleted`. Returns `user_ids`. |
| `premium_run_scheduled()` | Takes `pg_try_advisory_xact_lock`, then runs coins and expiry. Another instance that holds the lock gets `{skipped:true}`. |
| `premium_campaign_redeem(p_user, p_code)` | Redeems a free_membership code. Checks the active flag and dates, the allowed users, the total limit (guarded counter), the per-user limit and that no membership is active. Writes a `campaign_redeem` event and pays the first gift. |
| `premium_me`, `premium_active_for(uuid[])` | User status. The second one looks up badges for many users at once. |
| `premium_admin_user_search(q, limit)` | Matches the id (exact), username, display name and e-mail. LIKE wildcards are treated as literal text. Returns only `email_masked` (`premium_mask_email`). |
| `premium_admin_user`, `premium_admin_dashboard`, `premium_admin_analytics(from, to, bucket)`, `premium_campaign_stats(id)` | Read models. They use real data only. A missing metric is null, `paid` is null and `payments_integrated` is false. |

Rules for `premium_admin_apply`:
- `grant` refuses with `already_active` when the user already has an active membership: one active membership per user. A grant needs `unlimited`, `days` or `ends_at`.
- `extend` takes days and refuses unlimited memberships.
- `change_plan` keeps the dates.
- `cancel` ends the membership now.
- `set_end` needs a future time.
- `set_unlimited` with `unlimited:false` needs `days` or `ends_at`.

Error codes are returned as `{ok:false, error}` and mapped to HTTP statuses in `lib/premium/service.js`:

| Code | HTTP status |
|---|---|
| `invalid_op`, `invalid_plan`, `invalid_duration`, `invalid_end`, `reason_required`, `too_long`, `invalid_request_id` | 400 |
| `user_not_found` | 404 |
| `plan_archived`, `already_active`, `not_active`, `already_unlimited`, `not_unlimited`, `same_plan` | 409 |
| Redeem: `invalid` | 404 |
| Redeem: `expired` | 410 |
| Redeem: `used`, `limit`, `not_redeemable`, `unavailable`, `already_active` | 409 |

Gift timing: a membership that lasts exactly 30 days gets one gift, because the next cycle would start at the end. After a long sleep (Render free plan), each missed cycle is paid once, in order, up to 240 cycles per call. Later calls continue from there.

## HTTP endpoints

Admin routes live under `/api/admin/premium` (and `/admin/premium`) in `routes/adminPremium.js`. They are mounted in `routes/admin.js` behind the full admin chain:
1. `requireAuth`
2. `requireAdmin`
3. `adminRateLimit`
4. `requireAdmin2fa`
5. `requireStepUp`: every POST and PATCH needs `X-Admin-Step-Up`
6. `requireAdminSection("premium")`

Every write is also recorded in the admin audit log (`state.appendAudit` → `admin_audit`). The actions are:
- `premium_grant`, `premium_extend`, `premium_change_plan`, `premium_cancel`, `premium_set_end`, `premium_set_unlimited`
- `premium_bulk`
- `premium_plan_update`
- `premium_campaign_create` and `premium_campaign_update`

Any 401 or 403 on `/premium` is logged by `logDenied` as `premium_denied` (console plus audit). It never logs bodies or tokens, and it logs each account and path at most once per 10 s.

| Method | Path | Notes |
|---|---|---|
| GET | `/plans` | All plans |
| PATCH | `/plans/:id` | Only name, description, features (known keys), visible and status. Price, currency and monthly_descoin answer 400 `field_not_editable`. |
| GET | `/users/search?q=` | Returns `{users:[{id, username, display_name, avatar_url, email_masked, subscription}]}`. Limited to 120 per minute per admin. |
| GET | `/users/:id` | Returns `{user, subscription, events}` |
| POST | `/users/:id/apply` | Body `{op, plan, days?, ends_at?, unlimited?, is_free, reason, note, request_id}`. Returns `{subscription, event, replay}`. Sends `premium:updated`. |
| POST | `/bulk` | Body `{user_ids[], op, ..., request_id}` (request_id is required). Returns `{batch:{id,total,ok,failed,created_at}, results:[{user_id,ok,error}], replay}` |
| GET | `/bulk/:batchId` | |
| GET | `/events?user=&kind=&plan=&actor=&batch=&from=&to=&cursor=&limit=` | Returns `{events, next_cursor}` |
| GET | `/dashboard` | Returns `{active_total, active_plus, active_ultra, expired, expiring_7d, new_7d, new_30d, free_count, paid_count:null, payments_integrated:false, ...}` |
| GET | `/analytics?from=&to=&bucket=day\|week\|month` | Returns series (acquisitions, active, cancellations, expirations, renewals, upgrades and downgrades, coin cycles), plan split, free/paid (`paid: null`), average duration, conversion with its numerator and denominator labels, and per-campaign figures |
| GET | `/finance` | Returns `{payments_integrated:false, revenue:null, mrr:null, ..., message_key:"premium.finance.notIntegrated"}` |
| GET | `/audit?actor=&q=&from=&to=` | `premium*` entries from `admin_audit`, merged with memory |
| GET / POST | `/campaigns` | |
| PATCH | `/campaigns/:id` | `{active:false}` disables a campaign |
| GET | `/campaigns/:id/stats` | |

User routes are in `routes/premium.js` (requireAuth):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/premium/me` | Returns `{plan, status, ends_at, unlimited, features, monthly_descoin, next_coin_at, started_at}` |
| GET | `/api/premium/plans` | Visible, active plans with their features and no prices |
| POST | `/api/premium/redeem` | Body `{code}`. Limits: 10 tries per 10 min per account, 60 per hour per IP, and 5 wrong or expired codes per 10 min. Sends `premium:updated`. |

## Entitlements, socket and scheduler

- `lib/premium/features.js` is the CJS mirror of `frontend/src/premium/features.js` (`FEATURES`, `featuresFor`). `lib/premium/features.selftest.cjs` checks that the client list, the mirror, the CONTRACT table and the migration seed agree.
- `lib/premium/entitlements.js` provides:
  - `featuresFor(plan)`
  - `planFor(userId)`
  - `hasFeature(userId, key)`, with a 30 s cache that `invalidate(userId)` clears
  - `requireFeature(key)`, Express middleware that answers 403 `PREMIUM_REQUIRED`
  - `publicMe`

  Everything fails closed.
- `socket/premium.js` provides:
  - `hasFeature(userId, key)` and `socketHasFeature(socket, key)` for socket handlers
  - `emitPremiumUpdated(io, userId)`, which clears the cache and emits `premium:updated` to `user:<id>`
- Scheduler: `startPremiumScheduler({io})` runs at boot in `server.js`. It ticks every 5 minutes (the first tick is 30 s after boot) and calls `premium_run_scheduled()`. The members it touched get `premium:updated`. Set `PREMIUM_SCHEDULER=off` to disable it. It does not run under `NODE_ENV=test`.

## Admin access

Section `premium` is in `GRANTABLE_SECTIONS` and in `SENSITIVE_SECTIONS`. Memberships mint DesCoin, so admins whose `admin_permissions` is NULL (the legacy "every section" default) do **not** get it automatically. The owner account sees it. Other admins need the owner to tick "premium" in Yoneticiler. The left menu lists `premium` in the content group (`adminNav.js`). The `TABS` entry and the UI belong to the admin UI work.

## How to grant a membership by hand

From the admin panel, or with HTTP (this needs a step-up token from `POST /api/admin/step-up {code}`):

```
POST /api/admin/premium/users/<userId>/apply
X-Admin-Step-Up: <token>
{"op":"grant","plan":"plus","days":30,"is_free":true,"reason":"beta tester","request_id":"grant-<userId>-1"}
```

Use `"unlimited":true` instead of `days` for no end date. If the call times out, send it again with the same `request_id`: it never grants twice.

You can also use SQL (Supabase SQL editor, service role). Each call writes the event and pays the first gift through the ledger:

```sql
SELECT public.premium_admin_apply(
  '<admin uuid>', '<user uuid>', 'grant', 'ultra', 30, NULL, false, true,
  'manual grant', NULL, 'manual-<user uuid>-1', NULL);
```

Never INSERT into `user_subscriptions` or `descoin_ledger` by hand. That would skip the event, the gift and the idempotency keys.

## Tests

| File | What it covers | Runs in |
|---|---|---|
| `backend/test/premium.db.test.cjs` | Real Postgres. Every op; unlimited vs dated; one active membership per user; lazy expiry and the sweeper; one gift per cycle, catch-up and a frozen wallet; idempotent retry; bulk partial failure and retry; append-only events; own-row RLS; campaign limits; read models; races (parallel grants, the same request sent 15 times, extend vs cancel, parallel sweepers, a campaign rush); ledger equals balance; the migration run twice | "Premium (Postgres)" CI job |
| `backend/test/premium.http.db.test.cjs` | The real routes against the real SQL | "Premium (Postgres)" CI job |
| `backend/test/premium.integration.test.cjs` | Stubbed database. 401/403 for anonymous users, non-admins and admins without the section; step-up on every write; refused attempts logged; audit entries; `premium:updated`; whitelists; redeem limits | `node scripts/run-tests.mjs` (it also runs in the Premium job) |
| `backend/lib/premium/features.selftest.cjs` | The feature lists and entitlements | `node scripts/run-tests.mjs` (it also runs in the Premium job) |

Run the Postgres tests locally with `PREMIUM_TEST_PG_URL=postgresql://user@127.0.0.1:5432/postgres`. It must be a throwaway server; Supabase URLs are refused.
