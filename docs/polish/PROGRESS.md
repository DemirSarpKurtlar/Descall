# Polish progress

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
