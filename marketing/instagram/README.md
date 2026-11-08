# Descall Instagram Reels hattı

Her gün bir Instagram Reel'i tamamen kodla üretip resmi Instagram Graph API ile yayınlayan hat. Ücretli araç, telif müzik ya da yayın anında çalışan bir yapay zekâ yok: içerik yalnızca bu klasördeki elle yazılmış ve denetlenmiş senaryolardan gelir.

- **İçerik:** `content/*.json` içinde 35 Türkçe Reel senaryosu, 11 tema.
- **Denetim:** `lib/validator.mjs` + `policy.json`. Emoji, yasaklı ve kanıtlanamayan ifadeler, uzunluk ve süre sınırları, son 30 paylaşımla tekrar ve her özellik iddiasının repodaki bir dosyayla kanıtlanması burada kontrol edilir.
- **Çizim:** `lib/render/` (Playwright ile Chromium kareleri, ffmpeg ile H.264 + AAC MP4 ve kapak JPEG'i).
- **Yayın:** `lib/graph.mjs` (REELS konteyneri, durum sorgusu, `media_publish`, kota kontrolü, token yenileme), `lib/storage.mjs` (Supabase Storage herkese açık `marketing-reels` kovası).
- **Zamanlama:** `.github/workflows/instagram-reels.yml`, her gün 16:15 UTC = **19:15 İstanbul**.
- **Kayıt:** `posted-log.json`. İş akışı her paylaşımdan sonra bu dosyayı repoya geri commit'ler; aynı senaryo iki kez paylaşılmaz.

DM, yorum, takip ya da beğeni otomasyonu **yoktur** ve eklenmemelidir.

## Nasıl çalışır

1. **Kapı (`bin/gate.mjs`):** Elle başlatılan çalıştırmalar varsayılan olarak *deneme* (dry run) modundadır. Gerçek paylaşım için şunların hepsi gerekir: `IG_AUTOPOST_ENABLED` değişkeni tam olarak `true`, `IG_USER_ID` ve `IG_ACCESS_TOKEN` gizli değerleri, herkese açık depolama ve bugün (İstanbul saatiyle) henüz paylaşım yapılmamış olması. Biri eksikse çalıştırma yeşil biter ve sebebini yazar.
2. **Seçim (`lib/picker.mjs`):** Hiç paylaşılmamış ve son 30 paylaşımın kancası ya da açıklamasıyla aynı olmayan senaryolar arasından, en uzun süredir paylaşılmayan temanın ilk senaryosu seçilir. Instagram hesabındaki son 30 gönderinin açıklamaları da kontrol edilir (kayıt commit'lenemezse bile tekrar paylaşım olmaz).
3. **Kota:** `content_publishing_limit` sorgulanır; kalan hak `IG_LIMIT_RESERVE` (varsayılan 5) veya altındaysa gün atlanır.
4. **Çizim ve kontrol:** 1080x1920, 30 fps, H.264 High, yuv420p, kapalı GOP, AAC 48 kHz stereo 128 kbps, `moov` kutusu başta (faststart), 10-30 saniye. ffprobe ve MP4 kutu kontrolü geçmezse yayın yapılmaz.
5. **Yükleme:** MP4 ve kapak Supabase Storage'daki herkese açık `marketing-reels` kovasına `reels/<tarih>-<senaryo>.mp4` olarak yüklenir, adres HEAD isteğiyle doğrulanır.
6. **Yayın:** `media_type=REELS` konteyneri (`video_url`, `caption`, `cover_url`, `share_to_feed=true`), `status_code` FINISHED olana kadar 10 saniyede bir sorgu, sonra `media_publish`. Kalıcı bağlantı (`permalink`), medya kimliği, senaryo kimliği ve tarih `posted-log.json`'a yazılır.

Ses: telif müzik yok. Her Reel'de sinüs dalgalarından üretilen, senaryo kimliğine göre değişen kısık bir akor altlığı var (`lib/audio.mjs`). Bir senaryoda `"audio": "silence"` verilirse sessiz ses kanalı kullanılır.

## Sahibin yapması gerekenler (bir kerelik)

Aşağıdaki menü adları Meta'nın arayüzü değiştikçe farklılaşabilir. Emin olduklarımı ve **kontrol etmen gerekenleri** ayrı yazdım.

### 1. Meta geliştirici uygulaması (ücretsiz)

1. https://developers.facebook.com adresinde Descall'ı yöneten Facebook hesabıyla geliştirici hesabı aç.
2. **Uygulamalarım > Uygulama oluştur.** Kullanım alanı olarak Instagram'daki içerikleri yönetmeye yönelik olanı seç (son ekranlarda "Business" türü ya da "Instagram'da mesajları ve içerikleri yönet" gibi bir seçenek). **Kontrol et:** Meta bu sihirbazı sık değiştiriyor; amaç, *Facebook Girişi ile Instagram API'si* (Instagram Graph API) ürününü ekleyebildiğin bir uygulama.
3. Uygulamaya **Instagram** ürününü ekle ve **"API setup with Facebook login"** (Facebook Girişi ile kurulum) yolunu seç. Bu hat `graph.facebook.com` uç noktalarını kullanır; hesap bir Facebook Sayfasına bağlı İşletme hesabı olduğu için doğru yol budur. (`graph.instagram.com` kullanan "Instagram Girişi ile API" farklı bir akıştır, bu kodda kullanılmaz.)
4. Uygulama ayarlarında gizlilik politikası adresi olarak `https://descall.com/privacy` gir.

### 2. İzinler

Token'da şu izinler olmalı:

| İzin | Neden |
|---|---|
| `instagram_basic` | Hesap kimliği, kullanıcı adı, son gönderiler |
| `instagram_content_publish` | Reel konteyneri oluşturma ve yayınlama |
| `pages_show_list` | Bağlı Facebook Sayfasını ve Instagram hesabını bulmak |
| `pages_read_engagement` | Sayfa üzerinden Instagram hesabına erişim (Meta bunu yayın için de istiyor) |
| `business_management` | Sayfa ve Instagram hesabı bir Meta işletme portföyündeyse ya da Sistem Kullanıcısı token'ı kullanacaksan |

### 3. Erişim seviyeleri ve Meta incelemesi

- **Emin olduğum kısım:** Uygulamada rolü olan (yönetici, geliştirici, test kullanıcısı) kişilerin kendi varlıkları için izinler *Standart Erişim* ile çalışır. Kendi Instagram hesabımıza paylaşım yapmak için bu yeterlidir; **Uygulama İncelemesi (App Review) ve Gelişmiş Erişim, başkalarının hesaplarına hizmet veren uygulamalar içindir.** İşletme doğrulaması da Gelişmiş Erişim için gerekir.
- **Kontrol etmen gereken kısım:** Uygulama *Geliştirme* modundayken yapılan paylaşımların herkese görünüp görünmediği. Facebook Sayfalarında geliştirme modundaki uygulamaların gönderileri yalnızca uygulamada rolü olanlara görünüyordu. Instagram için ilk gerçek paylaşımdan sonra gönderiyi **başka bir hesaptan ya da çıkış yapılmış bir tarayıcıdan** aç. Görünmüyorsa uygulamayı **Canlı (Live)** moda al (gizlilik politikası adresi ve veri silme talimatı adresi ister; Standart Erişim izinleri için yine inceleme gerekmez, ama Meta'nın o günkü kuralını panelde kontrol et).
- Meta, kullanılmayan izinleri ya da uzun süre hareketsiz uygulamaları zaman zaman yeniden doğrulamaya çağırır. Geliştirici panelindeki uyarıları ara sıra kontrol et.

### 4. Token ve Instagram kullanıcı kimliği

**Önerilen: Sistem Kullanıcısı token'ı (süresi dolmaz).**

1. https://business.facebook.com > **Ayarlar > Kullanıcılar > Sistem kullanıcıları > Ekle** (rol: Yönetici).
2. **Varlık ata:** Descall Facebook Sayfası, Instagram hesabı ve oluşturduğun uygulama (tam kontrol).
3. **Yeni token oluştur:** uygulamayı seç, son kullanma için **Asla (Never)** seç, yukarıdaki izinleri işaretle.
4. **Kontrol et:** İşletme portföyün yoksa ya da bu menü görünmüyorsa aşağıdaki yolu kullan.

**Alternatif: Uzun ömürlü kullanıcı token'ı (yaklaşık 60 gün).**

1. https://developers.facebook.com/tools/explorer adresinde uygulamanı seç, izinleri ekle, **Generate Access Token**.
2. Kısa ömürlü token'ı uzun ömürlüye çevir ve doğrudan GitHub'a yaz (token ekrana basılmaz):
   ```bash
   cd marketing/instagram
   META_APP_ID=... META_APP_SECRET=... IG_ACCESS_TOKEN=<kısa token> node bin/refresh-token.mjs --gh-secret
   ```
3. Bu token yaklaşık 60 günde biter ve **yalnızca hâlâ geçerliyken** yenilenebilir. 50. gün civarında aynı komutu mevcut token ile tekrar çalıştır. `node bin/check-limit.mjs` (yanında `META_APP_ID` ve `META_APP_SECRET` varsa) kalan günü gösterir ve 10 günden az kaldıysa uyarır.

**Instagram kullanıcı kimliği (`IG_USER_ID`):** Graph API Explorer'da şu isteği yap:

```
GET /me/accounts?fields=name,instagram_business_account
```

Descall Sayfasının satırındaki `instagram_business_account.id` değeri `IG_USER_ID`'dir (17 ile başlayan uzun bir sayı). Sayfa kimliğini biliyorsan `GET /<sayfa-id>?fields=instagram_business_account` da olur.

Yerelde deneme (hiçbir şey paylaşmaz):

```bash
IG_USER_ID=... IG_ACCESS_TOKEN=... node bin/check-limit.mjs
```

### 5. GitHub gizli değerleri ve değişkenleri

Repo > **Settings > Secrets and variables > Actions**.

Gizli değerler (Secrets):

| Ad | Değer |
|---|---|
| `IG_USER_ID` | Instagram işletme hesabı kimliği |
| `IG_ACCESS_TOKEN` | Sistem kullanıcısı ya da uzun ömürlü token |
| `SUPABASE_URL` | Backend'in kullandığı Supabase proje adresi (Render'daki değerle aynı) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend'in kullandığı service-role anahtarı (Render'daki değerle aynı) |

Not: Bu iki Supabase değeri şu an yalnızca Render'da tanımlı; GitHub Actions'ta hiçbir iş akışı kullanmıyor. Buraya ayrıca eklenmeleri gerekiyor.

Değişkenler (Variables):

| Ad | Değer |
|---|---|
| `IG_AUTOPOST_ENABLED` | `true` olunca otomatik paylaşım açılır. Başka her değer (ya da hiç olmaması) durdurur. **Kapatma anahtarı budur.** |
| `IG_GRAPH_VERSION` | İsteğe bağlı. Varsayılan `v24.0`. Meta bir sürümü emekliye ayırınca güncelle (https://developers.facebook.com/docs/graph-api/changelog). |
| `IG_MEDIA_FALLBACK` | İsteğe bağlı. Supabase yoksa `github-release` yaz: video herkese açık repodaki `instagram-reels-media` ön sürümüne yüklenir. **Kontrol et:** bu adres `objects.githubusercontent.com`'a yönlendirir; Instagram'ın yönlendirmeyi izlediğini ilk denemede doğrula. |
| `IG_LIMIT_RESERVE` | İsteğe bağlı. Kotada bu kadar ya da daha az hak kalınca gün atlanır (varsayılan 5). |

Supabase kovası: `marketing-reels` ilk yüklemede **herkese açık** olarak otomatik oluşturulur. İstersen Supabase panelinde Storage > New bucket ile kendin de açabilirsin (Public açık olmalı). İçindeki dosyalar herkese açıktır; oraya Reel dışında bir şey koyma.

### 6. İlk çalıştırma ve kapatma anahtarı

1. **Actions > Instagram Reels > Run workflow**, `dry_run` işaretli. Çalıştırma Reel'i üretir ve `instagram-reel-dry-run` adlı dosya olarak ekler (MP4, kapak, açıklama metni). İndir ve izle.
2. Hazır olunca `IG_AUTOPOST_ENABLED` değişkenini `true` yap.
3. Bir kez `dry_run` işaretsiz çalıştır ve gönderiyi kontrol et (başka bir hesaptan görünürlük dahil, bkz. 3. bölüm).
4. Bundan sonra her gün 19:15'te (GitHub zamanlanmış işleri bazen geç başlatır) bir Reel paylaşılır.

**Acil durdurma:** `IG_AUTOPOST_ENABLED` değerini `false` yap. Bir sonraki çalıştırma hiçbir şey yapmadan biter. Tamamen kapatmak için Actions'ta iş akışını devre dışı da bırakabilirsin.

`posted-log.json`'ı iş akışı `main` dalına commit'ler. `main` korumalıysa `github-actions[bot]`'un bu dosyayı push edebilmesine izin ver. Push başarısız olursa iş kırmızı görünür; Instagram açıklama kontrolü aynı senaryonun tekrar paylaşılmasını yine engeller, ama kaydı elle ekle.

## Yeni senaryo eklemek

1. Uygun temanın dosyasına (`content/<tema>.json`) bir nesne ekle:

```json
{
  "id": "ses-ornek-senaryo",
  "theme": "ses-kalitesi",
  "title": "Kısa iç başlık",
  "hook": { "lines": ["İlk 2 saniyedeki", "*vurgulu satır*"] },
  "scenes": [
    { "lines": ["Satır başına", "*en fazla 7 kelime*"], "visual": { "type": "toggles", "items": ["Gürültü engelleme"] } },
    { "lines": ["..."], "visual": { "type": "chips", "items": ["..."] } },
    { "lines": ["..."] }
  ],
  "caption": "Açıklama metni (hashtag'ler ayrı).",
  "hashtags": ["#descall", "#seslisohbet", "#mikrofon"],
  "sources": [
    { "claim": "Gürültü engelleme varsayılan olarak açık", "file": "frontend/src/lib/voiceProfile.js", "match": "noiseMode: \"on\"" }
  ]
}
```

2. Kurallar (doğrulayıcı hepsini zorlar):
   - Kanca en fazla 2 satır ve 2,5 saniye; 3-6 sahne; toplam süre 10-30 saniye. Süre kelime sayısından hesaplanır; gerekirse sahneye `"duration": 3.2` ver.
   - Ekrandaki her satır en fazla 7 kelime ve 34 karakter; görsel öğeler en fazla 4 kelime. `*yıldız*` arası vurgu rengiyle çizilir.
   - Görsel türleri: `chips`, `keys` (`{"keys": "Ctrl+Shift+M", "name": "..."}`), `channels` (`{"kind": "text|voice|stage", "name": "...", "active": true}`), `voice`, `roles`, `toggles`, `checklist`, `steps`, `stat` (`value`, `label`), `screenshot` (`ref`, yalnızca `screenshots.json`'daki onaylı görüntüler).
   - Açıklama en fazla 2200 karakter, 3-8 hashtag, emoji yok. `descall.com` geçmiyorsa sona "Ücretsiz indir: descall.com" eklenir. Ekrandaki son çağrı varsayılan olarak "descall.com'dan ücretsiz indir".
   - **Her özellik iddiası** için `sources`'a repodaki bir dosya ve o dosyada geçmesi gereken bir düzenli ifade yaz. Dosya yoksa ya da ifade bulunmazsa senaryo reddedilir. Böylece uygulamadan kaldırılan bir özellik, senaryoyu otomatik olarak geçersiz kılar.
   - `policy.json`'daki yasaklı ifadeler: kötüleme, kanıtlanamayan üstünlük ("en iyi", "daha hızlı", "gecikmesiz", "sınırsız"...), fiyat ve satın alma (Descall+ üyeliği şu an yalnızca Descall ekibi tarafından veriliyor), erişim/engel konuları, rakip ürün adları. 2.13.0'da kaldırılan oyun entegrasyonuyla ilgili adlar kodda ayrıca engellenir.
   - "Discord" adı yalnızca `discord-tasima` temasında geçebilir; olgusal olmalı, Discord logosu hiçbir zaman kullanılmaz. `surum-notlari` ve `descall-plus` temalarında iPhone / App Store anılmaz (bu özellikler önce Windows'a ve web'e çıkıyor; App Store sürümü geriden gelebilir).
3. Kontrol et ve izle:

```bash
cd marketing/instagram
npm run validate
node bin/render.mjs --id ses-ornek-senaryo --out /tmp/reels
```

Videolar repoya girmez (`bin/render.mjs` repo içine yazmayı reddeder).

35 senaryo yaklaşık 35 gün yeter. Hepsi paylaşılınca iş akışı "library exhausted" uyarısıyla durur; yeni senaryo ekleyene kadar paylaşım olmaz.

## Testler

```bash
cd marketing/instagram
npm ci                   # playwright paketi (tarayıcıyı ayrıca kurar: npx playwright install chromium)
npm test                 # birim testleri + çizim duman testi
npm run test:unit        # yalnızca birim testleri (Chromium ve ffmpeg gerekmez)
REQUIRE_RENDER=1 node --test test/render.smoke.test.mjs
```

ffmpeg sistemde olmalı (`ffmpeg`, `ffprobe`); farklı bir yoldaysa `FFMPEG_PATH` ve `FFPROBE_PATH` ver. GitHub Actions'ta yoksa iş akışı `apt-get` ile kurar.

## Sınırlar ve riskler

- **Yayın kotası:** Meta'nın belgelerine göre bir hesap kayan 24 saatte API ile en fazla 100 gönderi yayınlayabilir (eski belgelerde 50 ya da 25 yazıyordu; güncel değeri `bin/check-limit.mjs` gösterir). Günde 1 Reel bunun çok altında.
- **Hız sınırları:** Graph API çağrı sınırları uygulama ve işletme bazında; bu hat günde 10 civarı istek yapar.
- **Token süresi:** Sistem Kullanıcısı token'ı kullanılmıyorsa 60 günlük token'ı yenilemeyi unutma. Süresi dolarsa paylaşım hata verir, iş kırmızı olur, bir şey paylaşılmaz.
- **Graph API sürümü:** Sürümler yaklaşık iki yıl desteklenir. `IG_GRAPH_VERSION` ile güncelle.
- **Reel kuralları:** Meta, API ile paylaşılan Reel'lerde kendi müzik kütüphanesini sunmaz; bu yüzden ses altlığı kodla üretiliyor. Açıklama sınırı 2200 karakter, hashtag sınırı 30 (biz 3-8 kullanıyoruz).
- **İçerik doğruluğu:** Doğrulayıcı, iddiaların repodaki koda ya da yayınlanmış metne dayandığını kontrol eder; bir özelliğin canlı sürümde açık olup olmadığını bilemez. Sürüm notu senaryolarında "Windows uygulamasında ve web'de" diye sınırlandırma bu yüzden var.
