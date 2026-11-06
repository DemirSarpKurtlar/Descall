# Descall+ and Descall Ultra: shared contract (phase 1)

Owner decisions (2026-11-02):
- Two tiers: `plus` (Descall+) and `ultra` (Descall Ultra). The data model must allow more plans later.
- Phase 1 has **no payments**. Admins grant memberships, for testing. Real money comes later; users can never buy a tier with DesCoin.
- On every 30-day renewal cycle, an active membership gifts DesCoin: `plus` 5000, `ultra` 15000. The first gift is paid at the grant. Admin-granted memberships also receive the gift.
- No prices are set. Never invent prices or revenue. The finance views state "Odeme altyapisi henuz entegre edilmedi" through i18n, and show estimates only when clearly labelled, never as revenue.
- The premium UI is visible only on the desktop app and the web. iOS shows only the user's status and badge, with no upsell (App Store guideline 3.1.1).

All times are stored in UTC. All user-visible strings go through i18n in 7 locales (en, tr, de, es, fr, pt-BR, ru). No emojis in UI, code or commits. The glass design language is preserved.

## Database (Supabase Postgres, additive migrations only, `supabase/migrations/`)

- `premium_plans`
  - Columns: `id text pk` ('plus', 'ultra'), `name`, `description`, `features jsonb`, `status` ('active', 'archived'), `visible bool`, `monthly_descoin int`, `price_minor int null`, `currency text null`, `sort int`, `created_at`, `updated_at`.
  - Seeded with plus (5000) and ultra (15000); the price columns stay null.
- `user_subscriptions`
  - Holds at most one current row per user, enforced by a unique index on `user_id`.
  - Columns: `user_id uuid pk -> users`, `plan_id -> premium_plans`, `status` ('active', 'expired', 'cancelled'), `started_at`, `ends_at timestamptz null`, `unlimited bool`, `is_free bool`, `source` ('admin', 'campaign', 'payment'), `next_coin_at timestamptz null`, `updated_at`.
  - Check constraint: `unlimited = true` requires `ends_at is null`, and `unlimited = false` requires `ends_at is not null`.
- `subscription_events` is append-only. A trigger rejects UPDATE and DELETE.
  - Columns: `id uuid`, `user_id`, `kind`, `prev_plan`, `new_plan`, `prev_ends_at`, `new_ends_at`, `prev_unlimited`, `new_unlimited`, `actor_id null`, `actor_kind` ('admin', 'system', 'campaign', 'payment'), `reason text`, `note text`, `is_free bool`, `batch_id uuid null`, `request_id text null`, `created_at`.
  - `kind` is one of: grant, extend, change_plan, cancel, set_end, set_unlimited, expire, coin_grant, campaign_redeem.
  - A unique index on (`request_id`, `user_id`) where `request_id` is not null makes retries idempotent.
- `premium_bulk_batches` (`id`, `actor_id`, `plan_id`, `params jsonb`, `total`, `ok`, `failed`, `created_at`) and `premium_bulk_results` (`batch_id`, `user_id`, `ok bool`, `error text`).
- `premium_campaigns` and `premium_campaign_redemptions`: coupons. Fields: code, plan limit, start and end dates, total limit, per-user limit, allowed user list, kind ('free_membership', 'percent', 'fixed'), duration in days, active.
  - In phase 1 only `free_membership` changes anything: it grants a membership.
  - `percent` and `fixed` coupons are stored for the future and have no monetary effect.
- `payment_transactions`: an empty table with a provider-agnostic shape, for the future. Only verified provider webhooks will write to it. No code writes to it in phase 1.
- Security:
  - RLS is on for every table, with no direct client writes.
  - A user may SELECT their own `user_subscriptions` row and their own events.
  - Every write goes through SECURITY DEFINER functions that the backend calls with the service role.
- Functions, each atomic and each writing exactly one event per affected user:
  - `premium_admin_apply(actor uuid, user uuid, op text, plan text, days int, ends_at timestamptz, unlimited bool, is_free bool, reason text, note text, request_id text, batch uuid)`
  - `premium_expire_due()`
  - `premium_grant_due_coins()`, which credits DesCoin through the existing ledger path, exactly once per cycle.

- Future item, not built in phase 1 (owner decision 2026-11-06): when paid subscriptions start, a new subscriber gets a 3-day free trial. The model leaves room for it:
  - an optional `user_subscriptions.trial_ends_at`, which stays NULL in phase 1;
  - an event `kind` value `'trial'`;
  - one trial per user, enforced by a unique index on `subscription_events (user_id)` where `kind = 'trial'`.

## Backend (Express, `frontend/backend`)

- Admin router: `routes/adminPremium.js`, mounted inside `routes/admin.js`, so `requireAuth` and `requireAdmin` already apply.
  - Writes require the existing admin step-up token, the same way other admin changes do.
  - Every write is also recorded in the existing admin action/audit log.
  - Unauthorized attempts are logged.
- Endpoints, all under `/api/admin/premium`:
  - `GET /plans` and `PATCH /plans/:id`. Only name, description, features, visible and status can be edited; price stays null in phase 1.
  - `GET /users/search?q=` matches username, user id, email and display name, and returns `{users:[{id, username, display_name, avatar_url, email_masked, subscription}]}`.
  - `GET /users/:id` returns `{user, subscription, events:[...]}`.
  - `POST /users/:id/apply`, body `{op, plan, days?, ends_at?, unlimited?, is_free, reason, note, request_id}`, returns `{subscription, event}`.
    - `op` is one of: grant, extend, change_plan, cancel, set_end, set_unlimited.
  - `POST /bulk`, body `{user_ids[], op, plan, days?, ends_at?, unlimited?, is_free, reason, note, request_id}`, returns `{batch:{id, total, ok, failed, created_at}, results:[{user_id, ok, error}]}`.
    - Each user is processed independently, so one failure never rolls back the others.
  - `GET /bulk/:batchId`
  - `GET /events?user=&kind=&plan=&actor=&from=&to=&cursor=` returns paged history.
  - `GET /dashboard` returns:
    - `{active_total, active_plus, active_ultra, expired, expiring_7d, new_7d, new_30d, free_count, paid_count:null, payments_integrated:false}`
  - `GET /analytics?from=&to=&bucket=day|week|month` returns real series only. A metric with no data returns null, never a fabricated value. The response holds:
    - acquisitions;
    - active per day;
    - plan split;
    - cancellations and renewals;
    - free/paid split;
    - average duration;
    - upgrades and downgrades;
    - conversion, with its denominator stated;
    - per-campaign performance.
  - `GET /finance` returns `{payments_integrated:false, revenue:null, ...}` for now.
  - `GET /audit?actor=&q=&from=&to=` is the premium admin action log.
  - Campaigns: `GET /campaigns`, `POST /campaigns`, `PATCH /campaigns/:id` (which also disables), and `GET /campaigns/:id/stats`.
- User endpoints:
  - `GET /api/premium/me` returns `{plan:null|'plus'|'ultra', status, ends_at, unlimited, features:[...], monthly_descoin, next_coin_at}`.
  - `GET /api/premium/plans` returns the visible plans with their features, and no prices in phase 1.
  - `POST /api/premium/redeem`, body `{code}`, redeems a `free_membership` campaign.
- Entitlements:
  - `lib/premium/entitlements.js` exports `featuresFor(plan)` and `requireFeature(feature)` Express middleware.
  - The socket layer gets a `hasFeature(userId, feature)` helper with a short cache.
  - Premium-only server behaviour must check these on the server, never only in the UI.
- Scheduler: a lightweight interval in the backend process, guarded by a Postgres advisory lock, calls `premium_expire_due()` and `premium_grant_due_coins()` every 5 minutes.

## Feature keys

The client and server share these keys through one list, `frontend/src/premium/features.js`, which the backend mirrors.
- Free baseline keys stay free; they are not listed.
- A key marked `plus` is also available on `ultra`.
- Desktop-only keys are marked `desktop`.

| Key | Tier | Desktop only |
|---|---|---|
| mini_mode | plus | no |
| always_on_top | plus | yes |
| pip_call | plus | yes |
| multi_window | plus | yes |
| window_opacity | plus | yes |
| session_restore | plus | yes |
| tray_controls_plus | plus | yes |
| taskbar_plus | plus | yes |
| global_mute | plus | yes |
| global_ptt | plus | yes |
| custom_hotkeys | plus | yes |
| media_keys | plus | yes |
| quick_launcher | plus | yes |
| notification_history | plus | no |
| focus_mode | plus | no |
| notification_profiles | plus | no |
| mic_presets | plus | no |
| noise_gate | plus | no |
| mic_monitor | plus | no |
| voice_activity_monitor | plus | no |
| auto_device_switch | plus | no |
| audio_routing | plus | no |
| audio_device_profiles | plus | no |
| game_status | plus | yes |
| game_session_history | plus | yes |
| smart_game_notifications | plus | yes |
| clipboard_history | plus | yes |
| quick_file_drop | plus | yes |
| app_lock | plus | yes |
| quick_actions | plus | no |
| desktop_sidebar | ultra | yes |
| screen_edge_actions | ultra | yes |
| window_layouts | ultra | yes |
| advanced_window_mgmt | ultra | yes |
| voice_hud | ultra | yes |
| gaming_hud | ultra | yes |
| instant_clip | ultra | yes |
| per_user_volume_hotkeys | ultra | yes |
| stream_audio_control | ultra | yes |
| workspace_profiles | ultra | no |
| desktop_automations | ultra | yes |
| activity_timeline | ultra | no |
| command_center | ultra | yes |
| widgets | ultra | yes |
| custom_layouts | ultra | yes |
| multi_account | ultra | yes |
| quick_reply | plus | yes |

Not offered, with reasons recorded in the final report:
- Injected game overlay, because of anti-cheat risk.
- Reading in-game FPS, which needs injection or admin-level tracing.
- Call recording, because of a prior product decision.
- Per-app audio capture, which needs a native module; revisit later.

## Client

- `frontend/src/premium/usePremium.js` is a hook, backed by a shared store, that reads `/api/premium/me` and refreshes on socket event `premium:updated`.
- `hasFeature(key)` in the client is a UX gate only. The server and main process also check.
- Electron main receives the entitlement list over IPC (`premium:entitlements`) and refuses to enable gated desktop features without it.
- The user surfaces:
  - a Descall+ or Ultra badge next to the name in profile cards;
  - Settings > "Descall+" with status, end date, the next DesCoin gift, a feature list and per-feature settings;
  - a plan comparison page with no purchase button in phase 1, which says membership is currently given by the Descall team.
