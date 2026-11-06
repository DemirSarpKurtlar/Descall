# Descall+ and Descall Ultra: backend (phase 1)

This is the server side of `docs/premium/CONTRACT.md`. Phase 1 has no payments. Admins grant memberships, and `free_membership` campaigns grant them too. Every membership gives a DesCoin gift each 30-day cycle: 5000 for `plus` and 15000 for `ultra`. The first gift is paid at the grant.

## Migration

| File | Live name (Descall-EU) | Status |
|---|---|---|
| `supabase/migrations/20261106_premium_memberships.sql` | `premium_ledger_reason_premium_gift`, `premium_memberships_tables`, `premium_memberships_write_functions`, `premium_memberships_read_functions` | **Applied to Descall-EU on 2026-11-06** in four parts with the same SQL (triggers use `CREATE OR REPLACE TRIGGER`). Verified: 8 tables, 18 `premium_*` functions, both plans seeded (plus 5000 / 31 keys, ultra 15000 / 47 keys), 2 append-only triggers, ledger CHECK includes `premium_gift`. |

The migration only adds things:
- New tables.
- New functions.
- One new partial unique index on `descoin_ledger`.
- A wider `descoin_ledger_reason_check`, which adds `premium_gift` and keeps every live value (the live definition was checked on 2026-11-02).

Nothing is dropped or renamed. The R3 tables are not touched. You can run the file twice safely.

After applying, run these read-only checks:

```sql
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN
         ('premium_plans','user_subscriptions','subscription_events','premium_bulk_batches','premium_bulk_results',
          'premium_campaigns','premium_campaign_redemptions','payment_transactions')) AS tables,          -- 8
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'premium%') AS functions, -- 18
       (SELECT string_agg(id || ':' || monthly_descoin, ',' ORDER BY sort) FROM public.premium_plans) AS plans,       -- plus:5000,ultra:15000
       (SELECT pg_get_constraintdef(oid) LIKE '%premium_gift%' FROM pg_constraint WHERE conname = 'descoin_ledger_reason_check') AS ledger_ok, -- true
       (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('premium_plans','user_subscriptions','subscription_events',
          'premium_bulk_batches','premium_bulk_results','premium_campaigns','premium_campaign_redemptions','payment_transactions')) AS rls, -- true
       (SELECT has_function_privilege('anon', 'public.premium_campaign_redeem(uuid,text)', 'EXECUTE')) AS anon_exec; -- false
```

Until the migration is applied, the backend still runs:
- `/api/premium/me` answers `plan: null`.
- Admin premium routes answer 503 `premium_unavailable`.
- `requireFeature` / `hasFeature` fail closed.
- The scheduler logs one warning.

## Future: 3-day free trial (not built)

Owner decision, 2026-11-06: when paid subscriptions start, a new subscriber gets a 3-day free trial. Phase 1 does **not** build the trial flow. The schema only leaves room for it:
- `user_subscriptions.trial_ends_at timestamptz` is optional. Nothing sets it in phase 1, so it stays NULL.
- `subscription_events.kind` accepts `'trial'`. No phase 1 code writes it.
- The unique index `subscription_events_one_trial_uq` on (`user_id`) where `kind = 'trial'` allows one trial per user, ever.

When payments arrive, the payment flow writes the `trial` event and sets `trial_ends_at` in the same transaction. It must also decide whether the trial pays the DesCoin gift (phase 1 code does not decide this).

## Data model

| Table | Notes |
|---|---|
| `premium_plans` | `plus` and `ultra` are seeded. Price columns stay null. `features` holds the effective key list. |
| `user_subscriptions` | One row per user (`user_id` is the primary key). The CHECK requires `unlimited` to match `ends_at is null`. Extra columns: `coin_cycles_paid`, `created_at` and `trial_ends_at` (future trial, always NULL now). |
| `subscription_events` | Append-only. A trigger rejects UPDATE, DELETE and TRUNCATE. The unique index on (`request_id`, `user_id`) makes retries idempotent. The unique index on (`user_id`, `cycle_at`) where `kind = 'coin_grant'` allows one gift per cycle, and the one on (`user_id`) where `kind = 'trial'` allows one future trial per user. Extra columns: `campaign_id`, `coins`, `cycle_at` and `meta`. |
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
| GET | `/users/:id` | Returns `{user, subscription, events}`; events carry `user` and `actor_username` like `/events` |
| POST | `/users/:id/apply` | Body `{op, plan, days?, ends_at?, unlimited?, is_free, reason, note, request_id}`. Returns `{subscription, event, replay}`. Sends `premium:updated`. |
| POST | `/bulk` | Body `{user_ids[], op, ..., request_id}` (request_id is required). Returns `{batch:{id,total,ok,failed,created_at}, results:[{user_id,ok,error}], replay}` |
| GET | `/bulk/:batchId` | |
| GET | `/events?user=&kind=&plan=&actor=&batch=&from=&to=&cursor=&limit=` | Returns `{events, next_cursor}`. `user` and `actor` take an id or a username (an unknown username gives an empty page). Each event also has `user` `{id, username, display_name, avatar_url}` and `actor_username`. |
| GET | `/dashboard` | Returns `{active_total, active_plus, active_ultra, expired, expiring_7d, new_7d, new_30d, free_count, paid_count:null, payments_integrated:false, ...}` |
| GET | `/analytics?from=&to=&bucket=day\|week\|month` | The stable shape below ("Analytics response"), built from `premium_admin_analytics` |
| GET | `/finance` | Returns `{payments_integrated:false, revenue:null, mrr:null, ..., free_count, active_total, manual_grants, campaign_grants, message_key:"premium.finance.notIntegrated"}`. `manual_grants` counts all-time `grant` events by an admin, `campaign_grants` all-time `campaign_redeem` events; both are membership counts, not money. |
| GET | `/audit?actor=&q=&from=&to=&cursor=&limit=` | `premium*` entries from `admin_audit`, merged with memory. Returns `{items:[{id, at, actor_id, actor_username, action, target, target_username, meta}], next_cursor, durable}`. `actor` takes an id or a username. `meta.reason` holds the reason of an apply or bulk write. |
| GET / POST | `/campaigns` | GET returns `{campaigns}`. Each row has the table columns plus `value` (`percent_off` or `amount_off_minor`, by kind) and `allowed_users` `[{id, username, display_name, avatar_url}]`. POST takes the columns, or `value` for percent and fixed coupons (fixed also needs `currency`). Returns 201 `{campaign}`. |
| PATCH | `/campaigns/:id` | Partial body, same fields. `{active:false}` disables a campaign |
| GET | `/campaigns/:id/stats` | `premium_campaign_stats` plus `redemptions` (all-time uses, = `used_count`), `still_active` (= `active_now`) and `recent[].at` |

### Analytics response

`GET /analytics` answers one documented shape (`analyticsView` in `lib/premium/service.js`). Buckets are UTC periods. Every per-bucket list is `null` when no subscription event exists yet; nothing is estimated.

| Field | Shape | Meaning |
|---|---|---|
| `acquisitions` | `[{bucket, plus, ultra, total, free}]` | `grant` and `campaign_redeem` events per bucket, by plan |
| `active` | `[{bucket, total}]` | Members active at the end of each bucket, all plans together (the SQL does not split it by plan) |
| `cancellations_renewals` | `[{bucket, cancellations, renewals, expirations}]` | `cancel`, `extend` and `expire` events |
| `upgrades_downgrades` | `[{bucket, upgrades, downgrades}]` | `change_plan` events by plan sort order |
| `coin_cycles` | `[{bucket, total}]` | DesCoin gift cycles |
| `plan_split` | `{plus, ultra}` or null | Active members right now |
| `free_paid` | `{free, paid:null, payments_integrated:false}` or null | Active free members right now |
| `avg_duration_days` | number or null | Average start-to-end days of dated memberships (current rows) |
| `unlimited_count` | number or null | Active unlimited memberships |
| `conversion` | `{rate, numerator, denominator, numerator_label, denominator_label}` | `rate` is null when the denominator is 0 |
| `campaigns` | `[{id, code, kind, plan_id, active, redemptions, unique_users:null, still_active, used_total, total_limit}]` | `redemptions` in the range; `unique_users` per range is not computed yet |

### Start date

The SQL has no start date: every grant starts when it is applied (`started_at = now()`). The admin UI therefore offers no start field; an exact end date is sent as `ends_at`, a duration as `days`. `extend` only takes `days` (an exact new end is `set_end`).

User routes are in `routes/premium.js` (requireAuth):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/premium/me` | Returns `{plan, status, ends_at, unlimited, features, monthly_descoin, next_coin_at, started_at}` |
| GET | `/api/premium/plans` | Visible, active plans with their features and no prices |
| POST | `/api/premium/redeem` | Body `{code}`. Limits: 10 tries per 10 min per account, 60 per hour per IP, and 5 wrong or expired codes per 10 min. Sends `premium:updated`. |

## Badges of other people

`lib/premium/badges.js` adds `premium_plan` (`"plus"`, `"ultra"` or `null`) to the public user payloads the client renders for other people:
- `GET /api/auth/me` and `GET /api/auth/users/:userId` (profile and user card);
- the friend list and friend requests (`friend:list`, `friend:requests`, through `enrichFriendEntry`);
- `GET /api/servers/:id/members`, `GET /api/groups/:groupId/members` and the group list members;
- every `toPublicUser` payload (chat senders, `user:profile:updated`) and the presence roster rows (`users:update` / `presence:delta`).

Lookups use `premium_active_for(uuid[])` in batches of 200, cache each answer for 60 s (the synchronous builders read it for up to 10 minutes) and share one request per id in flight, so a list never costs one query per person. A synchronous builder leaves the key out while a user is still unknown, so the client keeps the last value it saw. `premium:updated` (`emitPremiumUpdated`) drops the entry, reads it again and refreshes the member's roster row. Errors fail closed (no badge). The client `PremiumBadge` reads `premium_plan` for other people and the live `/api/premium/me` store for the signed-in user.

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
| `backend/test/premiumAdmin.e2e.db.test.cjs` | Every admin premium page end to end: the real routes against the real SQL functions and tables (`test/pgQuery.cjs` runs the PostgREST-style table queries on Postgres), driven with the bodies `premiumModel.js` builds, and checking every field the pages read and that each error code has a message | "Premium (Postgres)" CI job |
| `backend/test/premium.integration.test.cjs` | Stubbed database. 401/403 for anonymous users, non-admins and admins without the section; step-up on every write; refused attempts logged; audit entries; `premium:updated`; whitelists; redeem limits | `node scripts/run-tests.mjs` (it also runs in the Premium job) |
| `backend/lib/premium/features.selftest.cjs` | The feature lists and entitlements | `node scripts/run-tests.mjs` (it also runs in the Premium job) |

Run the Postgres tests locally with `PREMIUM_TEST_PG_URL=postgresql://user@127.0.0.1:5432/postgres`. It must be a throwaway server; Supabase URLs are refused.

## Data export

The KVKK export (`lib/dataExport.js`) includes `premiumMembership` (the subscription row) and `premiumHistory` (events: kind, plans, dates, actor kind, coins). It leaves out admin ids, reasons and notes. Before the migration is applied, both show as `available: false`.
