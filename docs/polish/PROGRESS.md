# Polish progress

## 2.9.193 — auth and session hardening

Account changes now need the current password (or a code sent to the confirmed email for a social-only account). Changing email stores `pending_email` and does not turn off 2FA or clear `email_confirmed_at`. Password reset emails go only to a confirmed address, and the public forgot/reset responses no longer say whether the account exists. A signed-in password change also requires the current password when the account has one. Old clients that omit it receive a Turkish error.

Login, register, reset, 2FA, email codes, username checks, Google/Apple, and socket handshakes are rate limited in memory (failures for login; generous caps). `429` includes `Retry-After` and `Çok fazla deneme. Lütfen biraz sonra tekrar dene.` Set `REVIEW_DEMO_USERNAMES` (comma-separated) so those accounts skip the per-account bucket. Successful logins do not consume the budget.

One-time codes use `crypto.randomInt` and `timingSafeEqual`. Wrong guesses are counted in `auth_code_attempts` for an hour and are not reset when a new code is sent. Sessions are checked against `users.active_sessions` (20s cache) plus the in-memory revoke set. Password reset/change and email change revoke the other sessions, including ones dropped by the 10-session cap. Tokens that already omit a session id stay valid if they were issued before 2026-10-11T12:00:00Z. Newer session-less tokens are rejected. Token lifetime is still 7 days. No refresh-token flow.

`/api/errors` list, resolve, and delete require an admin. The public test routes and `/api/auth/test` are gone. `/debug/*` cannot be enabled in production. Admin role changes require username `admin` or `users.is_super_admin` (set for the admin account only). New passwords must be at least 10 characters and are checked against Have I Been Pwned (fail-open, 2s); set `PASSWORD_HIBP=0` to skip. The signup, reset, and change forms show a Turkish strength meter. Email 2FA stays optional. Authenticator-app 2FA was not added. iOS still keeps the JWT in localStorage; the desktop app stores it with `safeStorage` and loads packaged pages from `descall://app` with `webSecurity` on.

Migration `20261011_auth_security.sql` is applied: `pending_email`, `is_super_admin`, and `auth_code_attempts` (RLS on, no anon access).

### TestFlight checklist (Demir)

Sürüm **2.9.193**. Eski uygulama (2.9.182) açılmaya devam eder. Demo hesaplar kilitlenmez.

- [ ] Demo hesapla birkaç kez giriş yap; yanlış şifreden sonra da giriş çalışır.
- [ ] Ayarlar → e-posta kodu isterken mevcut şifreyi yaz. Şifresiz dene: Türkçe uyarı gör.
- [ ] İki adımlı doğrulama açıkken e-posta değiştirince kapanmasın. Yeni adres doğrulanınca açılsın.
- [ ] Şifre değiştirirken mevcut şifre + en az 10 karakter. Zayıf şifrede Türkçe uyarı.
- [ ] Başka bir oturumdan şifreyi değiştirince o oturum düşsün.
- [ ] Bilinmeyen kullanıcı adı ile şifre sıfırlama, var olan hesapla aynı genel cümleyi göstersin.

## 2.9.190 — icon buttons have accessible names

Icon-only `<button>` and `<motion.button>` controls now have an accessible name. Where a `title` already existed, the same expression is copied to `aria-label` (including the hand-raise ternary). Close, end-call, mute, grid/focus, bet, and copy/revoke controls use existing translation keys. Four new Turkish strings: Grid view, Decrease bet, Increase bet, Audio settings. Switches in profile customization and the rebuilt settings panel set `aria-label` from the visible row label and `aria-pressed` from the boolean field. The shared admin `Toggle` takes a `label` prop so each row is named, not the last row in the file.

`node frontend/src/lib/iconButtonNames.selftest.mjs` walks the frontend and fails if an icon-only button has neither visible text, a `*Content` row, `aria-label`, nor `aria-labelledby`. `title` alone does not count. Changed JSX parses with esbuild.

Pixels do not change. Glass, desktop, web, and Android stay on the same layout. Legal/consent files (`index.html`, `main.jsx`, `legalContent.js`, `EmailCapture`, age gate) were not edited.

### TestFlight checklist (Demir)

Sürüm **2.9.190**. Görünüm aynı. Ekran okuyucu isimleri.

- [ ] Arama çubuğunda kapat / aramayı bitir / el kaldır düğmeleri VoiceOver’da isimli.
- [ ] Sohbet mesajı menüsü (yanıtla, sil, tepki) isimli; fotoğrafa uzun basınca menü hâlâ kapanıyor.
- [ ] Ayarlar anahtarları satır adını okuyor ve açık/kapalı durumu doğru.
- [ ] Türkçe arayüzde “Bahsi azalt” / “Bahsi artır” ve “Izgara görünümü” duyuluyor.

## 2.9.189 — sitemap selftest uses the published catalog

`sitemap.selftest.cjs` asserted `/faq` against `staticPages`, which is only the three-page fallback used when the ESM catalog fails to load. The live sitemap (`catalogEntries`, served by `/sitemap-pages.xml` and the child tables) already includes `/faq`. The test now checks that catalog, and checks the fallback stays the three-page list. `node frontend/backend/routes/sitemap.selftest.cjs` passes.

`idx_group_messages_group_created` was applied to production on 2026-10-10 with Demir's approval. The migration file now says not to run it again. It was not re-applied.

### TestFlight checklist (Demir)

Sürüm **2.9.189**. Uygulama davranışı değişmedi. Site haritası.

- [ ] https://descall.com/sitemap-core.xml içinde `https://descall.com/faq` durur.
- [ ] Sohbet, mağaza ve aramalar 2.9.188 ile aynı.

## 2.9.188 — anon lockdown, purchase idempotency, daily claim

### P0

The publishable anon role could read and delete public tables that had no row level security, including server messages (27 rows visible) and shop purchases (92 rows). `users` was already hidden by RLS, but anon still had `TRUNCATE`, which ignores RLS.

`supabase/migrations/20261010_lock_anon_table_access.sql` revokes all public-schema table, sequence, and function privileges from `anon` and `authenticated`, turns RLS on for the 21 open tables, and pins `search_path` on five functions. Applied to production. Afterward anon `SELECT`/`DELETE`/`TRUNCATE` are false, the service role still has `SELECT` and `UPDATE`, and `SET ROLE anon` on `server_messages` returns `42501 permission denied`. No rows were changed.

### P1

Overlapping `POST /api/shop/purchase` calls could debit DesCoin twice and grant the item once. Purchases now run one-at-a-time per user, and a grant that inserts nothing is refunded as `shop_refund` (not counted toward the earning cap). The shop Buy button ignores a second tap until the request returns. `shop.integration.test.cjs`: two parallel buys of a 300-coin item from a 900 balance end at 600, with one ledger debit and one inventory row. A forced lost grant refunds 250 and leaves the balance unchanged.

`claimDaily` stored today's claim date before the credit. A ledger failure rolled the coins back and blocked a retry. The streak and date are restored on failure. `descoin.unit.test.cjs` fails one ledger write, asserts the date is cleared, then claims successfully.

### P2

Composer attach, emoji, and voice buttons now have `aria-label`s. `MessageComposer.sendlock.selftest.mjs`.

### Measurements

- Marketing first paint: 202.1 KB (budget 220 KB). `npm run build:prod` exit 0 on this tree before the version-number bump; rebuilt after rebase onto `v2.9.187`.
- Chat cache paint: 0.03 ms memory, 0.22 ms IndexedDB (target &lt; 150 ms).
- List latency model (unchanged, from 2.9.173): warm group list ~840 ms, warm DM messages ~500 ms. Cold list on a warm Render instance was not re-timed from this VM.
- Backend listened on port 3999 with dummy Supabase credentials. Moderation load failed closed (`fetch failed`) because those credentials are not the production database. Live Render health after deploy is watched in CI.
- Electron pack and a physical iPhone were not run here. Electron's updater binary was not downloaded. Windows and TestFlight builds are the CI check.

### Migrations

- `20261010_lock_anon_table_access.sql` — applied.
- `20261010_chat_list_indexes.sql` — `idx_group_messages_group_created` was already applied to production on 2026-10-10 with Demir's approval (valid and ready). Do not re-apply.

### Env

No env var changes.

### Still open

See `docs/polish/AUDIT.md`. Next: `/faq` in the sitemap selftest, a browser pass at 375/440/1280/1920, message-list virtualization only if a scroll profile needs it.

### TestFlight checklist (Demir)

Sürüm **2.9.188**. iPhone, masaüstü ve tarayıcı. App Store incelemesine gönderilmedi.

- [ ] Mağaza: bir ürünü hızlıca iki kez Satın al. Bakiye bir kez düşer, ürün bir kez gelir.
- [ ] Günlük DesCoin: al. Sayfayı yenile, aynı gün tekrar alma. İkinci deneme yeni coin yazmaz.
- [ ] Sohbet yazı alanı: ekle, emoji ve sesli mesaj düğmeleri VoiceOver'da isimlidir.
- [ ] Sohbetler, arama ve fotoğraf ışık kutusu 2.9.187'deki gibi durur.
