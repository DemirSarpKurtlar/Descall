# Electron → Tauri geçiş testi (sahibin kendi Windows bilgisayarı)

Amaç: geçişi önce yalnızca senin hesabında, gerçek Windows'ta uçtan uca denemek.
Her şey varsayılan olarak KAPALI: yüzde 0, izin listesi boş, imza anahtarı yok, köprü bayrağı `false`.

## 0. Hazırlık (bir kez)

- [ ] İmza anahtarı üret: `node frontend/backend/scripts/desktopMigrationKeygen.cjs`
  - `DESKTOP_MIGRATION_PLAN_KEY=...` satırını **yalnızca** Render ortam değişkenine koy (repoya, sohbete, issue'ya asla).
  - Açık anahtarı (`MCowBQYDK2Vw...`) `frontend/electron/migrationBridgeConfig.cjs` → `PLAN_PUBLIC_KEYS` içine yaz.
- [ ] İstersen `supabase/migrations/20261118_desktop_migration.sql` dosyasını uygula. Uygulanmazsa da çalışır: ayar bellekte tutulur, sunucu yeniden başlayınca KAPALI'ya döner.
- [ ] Köprü yapısı (yalnızca test için): `migrationBridgeConfig.cjs` içinde `MIGRATION_BRIDGE_ENABLED: true`, sürümü 3.10.0-test yap, Electron kurulumunu üret. Bu yapıyı yayınlama.
- [ ] `DescallMigrator.exe` (imzalı) ve Tauri `Descall-Setup-4.x.exe` dosyalarını bir GitHub sürümüne yükle. Her biri için:
  `Get-FileHash .\DescallMigrator.exe -Algorithm SHA256` ve `(Get-Item .\DescallMigrator.exe).Length`
- [ ] Yedek: `%APPDATA%\Descall` klasörünü ve kurulum klasörünü (genelde `%LOCALAPPDATA%\Programs\Descall`) kopyala. Bir sistem geri yükleme noktası da al.

## 1. Sunucuyu yalnızca sana aç

Yönetim konsolu arayüzü henüz yok; API hazır. descall.com'da admin olarak açıkken tarayıcı konsolunda:

```js
const T = localStorage.getItem("descall_token");
const H = (s) => ({ "Content-Type": "application/json", Authorization: `Bearer ${T}`, ...(s ? { "X-Admin-Step-Up": s } : {}) });
const step = (await (await fetch("/api/admin/step-up", { method: "POST", headers: H(), body: JSON.stringify({ code: "<2FA kodu>" }) })).json()).token;
await fetch("/api/admin/desktop-migration", { method: "PATCH", headers: H(step), body: JSON.stringify({ reason: "sahip testi", patch: {
  migrator: { url: "<migrator URL>", sha256: "<hash küçük harf>", size: <bayt> },
  setup: { url: "<setup URL>", sha256: "<hash>", size: <bayt>, version: "4.0.0" } } }) });
await fetch("/api/admin/desktop-migration/allowlist", { method: "POST", headers: H(step), body: JSON.stringify({ user: "admin", op: "add", reason: "sahip testi" }) });
await (await fetch("/api/admin/desktop-migration/preview?user=admin", { headers: H() })).json(); // decision.action === "migrate" olmalı
```

- [ ] `GET /api/admin/desktop-migration` → `signing.configured: true`, `config.percent: 0`, izin listesinde yalnızca sen.

## 2. Mutlu yol

- [ ] Köprü yapısını kur, giriş yap, Descall'ı tepside bırak, aramada olma, yazı yazma.
- [ ] En geç 2 dakika sonra `%APPDATA%\Descall\logs\main.log` içinde `[migration]` satırları görünür.
- [ ] Electron kapanır; `%LOCALAPPDATA%\Descall-Migration\` içinde `state.json`, `migrator.log` oluşur; `handoff.bin` kısa süre var olur, sonra silinir.
- [ ] Kurulum klasörünün yanında `Descall.legacy` oluşur; yeni `Descall.exe` **aynı yolda**.
- [ ] Yeni uygulama gizli (tepside) açılır, **oturum açık**, tema / ses / dil ayarları aynı.
- [ ] Görev çubuğu sabitlemesi, masaüstü kısayolu, bildirimler ve "Windows ile başlat" (Görev Yöneticisi'ndeki açık/kapalı durumu dahil) aynı.
- [ ] "Uygulamalar" listesinde eski Electron görünmez.
- [ ] `DescallMigrator.exe --status` çıktısında `"event":"done"`; konsolda `summary.byEvent.done` 1 artar.

## 3. Hata senaryoları (her biri öncesinde 0'daki yedeğe dön)

- [ ] **Geri alma:** `setup` için "ready" sinyali yazmayan bir yapı ver (ör. eski bir Tauri sürümü). 3 dakika içinde: yeni dosyalar silinir, `.legacy` geri adlandırılır, Electron `--migration-failed` ile **oturum açık** geri gelir; konsolda `rollback_ok` ve neden kodu (`health_timeout`).
- [ ] **kill -9:** kurulum sürerken Görev Yöneticisi'nden `DescallMigrator.exe`'yi sonlandır. Electron'u açınca (ya da oturumu kapatıp açınca, RunOnce) geçiş kaldığı yerden geri alınır. Elle: `DescallMigrator.exe --resume`.
- [ ] **Bilgisayar kapanırsa:** kurulum sırasında fişi çek; açılışta aynı geri alma çalışmalı.
- [ ] **Arama sırasında:** sesli aramadayken plan gelse bile geçiş başlamaz (log: `wait`); aramadan çıkınca başlar.
- [ ] **Disk dolu:** küçük bir sanal disk (VHD) üzerine kurulu Electron ile dene: ya hiç başlamaz (`disk_full`, hiçbir şey değişmez) ya da geri alınır.
- [ ] **Özel klasör:** Electron'u `D:\Oyunlar\Descall` gibi bir yere kur → yerinde taşınır. İçinde başka dosyalar da olan bir klasöre kur → yeni uygulama `%LOCALAPPDATA%\Programs\Descall`'a kurulur, kısayollar oraya çevrilir.
- [ ] **Makine geneli (Program Files):** bir sanal makinede "tüm kullanıcılar için" kur → UAC sorulmadan kullanıcıya özel kurulur, Program Files'a dokunulmaz.
- [ ] **Durdurma:** `POST /api/admin/desktop-migration/kill { on: true, reason }` → yeni planlar hemen `kill_switch` döner.

## 4. 14 günlük temizlik

- [ ] `%LOCALAPPDATA%\Descall-Migration\cleanup.json` içinde `committedAtUnix` değerini 15 gün geri al, sonra `DescallMigrator.exe --cleanup` çalıştır (ya da yeni uygulamayı yeniden aç).
- [ ] `Descall.legacy` silinir, yeni uygulama ve `%APPDATA%\Descall\auth-token.bin` yerinde kalır, yalnızca önbellek klasörleri silinir.

## 5. Bitirince

- [ ] Kendini izin listesinden çıkar (`op: "remove"`), test yapısını kaldır, bayrağı yeniden `false` yap.
- [ ] Sorun olursa şunları gönder (gizli bilgi içermez): `state.json`, `migrator.log`, `DescallMigrator.exe --status` çıktısı, `main.log` içindeki `[migration]` satırları.
