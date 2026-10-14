# Web security checklist — 2026-10-14

This pass adds the items that were not already in the weak-point audit. Auth fail-open, admin and debug routes, permission checks, rate limits, public media URLs, the `localStorage` session token, and debug mode stay in that audit (batch 1 of those fixes shipped as v2.10.67). They are not repeated here.

Production web is Cloudflare Pages at `https://descall.com`. `frontend/vercel.json` is kept in sync, but the live site does not use those Vercel headers. The API is `https://des-call.onrender.com`.

## 1. Secrets in git history

- gitleaks 8.28.0 scanned 437 commits. After allowlisting public client identifiers (`.gitleaks.toml`), it reported no leaks. CI job: `.github/workflows/secret-scan.yml`.
- trufflehog 3.90.6 reported 0 verified secrets. The only hits were 6 unverified `example.com` URIs in `@types/node`.
- No server credential (service role, JWT signing secret, Resend, TURN, Riot client secret, private key, live Stripe key, AWS access key) is committed. Example env files use placeholders, not live values.
- The repo does contain public browser identifiers on purpose: the PostHog project key, the Giphy browser key, the IndexNow verification key, and the Google OAuth client id. Values are not copied into this note. They are not server secrets. The Giphy key can be scraped and used against that project's quota; rotating it is optional and needs Demir's approval. No live server secret was found, so nothing here is waiting on a rotation.

## 2. Client bundles

`frontend/.env.production` only has `VITE_` public build vars (API origin, socket origin, Google client id, PostHog project key and host). `node frontend/backend/lib/clientSecrets.selftest.cjs` scans `frontend/src`, `frontend/public`, that env file, and `frontend/dist`. It found no service-role key, JWT assignment, Resend key, TURN credential, Riot client secret, private key, Stripe live key, or AWS access key. The production build first-paint total stayed 207.2 KB (budget 220 KB).

## 3. Security headers

Set on every Cloudflare Pages response (`frontend/public/_worker.js`, with `frontend/public/_headers` as backup) and on `/(.*)` in `frontend/vercel.json`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` (enforcing). `frame-ancestors 'none'`. `script-src` includes `https://static.cloudflareinsights.com` because Cloudflare injects that beacon on the live zone. A local production-build pass of the public pages had no violations; the live beacon was the only extra host.
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), autoplay=(self)`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

The Render API sets the same HSTS, frame, permissions, nosniff, and referrer headers. Its CSP is `default-src 'none'; frame-ancestors 'none'` with inline styles only, so the marketing confirm page still renders and scripts do not. Shop SVG responses keep their own sandbox CSP.

Before this release, `https://descall.com` sent only nosniff and referrer-policy. Confirm the new headers with curl after the Cloudflare deploy.

## 4. HTTPS

`http://descall.com` and `http://des-call.onrender.com` already 301 to HTTPS at the edge. The Pages worker also redirects `http://descall.com` and `https://www.descall.com` to `https://descall.com`. Before this release, `https://www.descall.com` returned 200 because the worker ignored the `_redirects` host rules.

## 5. CORS

Express and Socket.IO share `frontend/backend/lib/corsOrigins.js`. Allowlist: `https://descall.com`, `https://www.descall.com`, localhost and `127.0.0.1` for dev, and `descall://app` for Electron. `credentials` stays false. There is no wildcard. `ALLOW_ALL_ORIGINS` is ignored, including if it is still set on Render. The string `null` is rejected. Missing `Origin` (curl, non-browser clients) is still allowed.

Before this release, `https://des-call.onrender.com/health` and the Socket.IO handshake reflected `https://evil.example` and `Origin: null`. The homepage asset response also carried `Access-Control-Allow-Origin: *` with no credentials header. The worker now drops that header. The API does not send a wildcard.

## 6. CSRF

The session is an `Authorization: Bearer` JWT in `localStorage`, not a cookie. CORS does not allow credentials. Classic cross-site request forgery does not apply to that session. PostHog may set its own first-party analytics cookie; that cookie does not authorize the API.

Moving the session to a cookie (audit item P2-2, not this release) needs `Secure`, `HttpOnly`, and `SameSite`, a CSRF token on cookie-authenticated mutations, and the same exact origin allowlist. A wildcard origin must not be combined with credentials. Socket.IO must not treat that cookie as enough to join a user room from another site.

## 7. Supabase

Project `nlhswwpakwtnmuerkzch`. Checked 2026-10-14:

- 80 public tables have row level security on. Zero public tables have it off.
- `anon` and `authenticated` have no `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` on public tables. The frontend does not ship a Supabase client or anon key. The API uses the service role.
- Five tables still have policies (`announcements`, `friendships`, `message_replies`, `reactions`, `yaldiz_scores`). Those policies do nothing while the grants are absent. `reactions` includes a `USING (true)` policy, which would matter only if table grants were added back.
- `public.get_user_friends(uuid)` is `SECURITY DEFINER` and returns friend usernames for any user id. Postgres had left `EXECUTE` granted to `PUBLIC`, so the anon key could call it. That grant is revoked from `PUBLIC`, `anon`, and `authenticated`. `service_role` can still execute it. The API does not call the function. Migration: `supabase/migrations/20261014_revoke_public_execute_get_user_friends.sql` (applied on the project).
- Security advisor after the revoke: the `SECURITY DEFINER` executable-by-anon warnings are gone. What remains is info lint `rls_enabled_no_policy` on 75 tables (RLS on, no policies). That is the closed service-role posture, not an anon write path. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## 8. XSS and SQL

- No `dangerouslySetInnerHTML` in the client.
- `innerHTML` is a static swipe-back skeleton and a clear of the Google button. Chat does not render markdown. Attachment previews are blob URLs. GIF previews are image URLs.
- Marketing confirm HTML escapes the title and body.
- Request handlers do not build SQL strings. The only `rpc` call is the fixed name `list_tables` on the admin debug route.

## 9. Spend caps (Demir, in the dashboards)

These cannot be set from the repo. None of the following were changed:

- Supabase (`nlhswwpakwtnmuerkzch`): set a spend cap and billing alerts in the org billing page.
- Render: service `des-call` is on the free plan, so it does not accrue instance spend. Set a budget alert before moving it off free. Workspace: Descall.
- Vercel: not the live host. The GitHub "Deploy SPA to Vercel" workflow skips the deploy when Vercel secrets are missing. If a project is still linked, set a spend cap there too.
- Resend: set a monthly usage alert on the sending domain.
- LiveKit: set a project spend or participant-minute alert.
- TURN: the credential lives in Render as `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`. Set a cap in that provider's dashboard (the URL names the provider). The public ICE endpoint is a separate audit item (P1-3) and is not changed here.

## 10. Production settings

Checked without reading secret values:

- `GET /debug/tables` and `GET /debug/peek/users` on the API return 404. Debug peeks stay off unless `ENABLE_DEBUG_ROUTES=true` and the caller is an admin.
- `GET /health` returns healthy.
- HTTP already redirects to HTTPS on both hosts.
- `https://www.descall.com` was still serving the site until this worker change.
- CORS reflected arbitrary origins until this allowlist change. Remove `ALLOW_ALL_ORIGINS` from the Render environment when convenient. The process ignores it either way.
- Confirm in the Render dashboard that `NODE_ENV` is `production` and `ENABLE_DEBUG_ROUTES` is unset. This pass did not print or edit environment values.
