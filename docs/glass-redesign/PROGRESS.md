# Liquid Glass — progress log

## Stage 3 — Sohbetler, DM, gruplar, mesaj menüsü, ek, composer, duyurular · 2.9.155

iPhone-only (`html.glass-ui`). Desktop, web, Electron, Android and iPad stay on the previous UI.

### Compare (440×956 @3x)

Geometry measured against `final/src/glass.css`. Shotkit names, previews and avatars are fixture data, so full-frame pixel % is not the acceptance number. Boxes below are in points.

| Screen | Result |
|---|---|
| 02 chats | Row 16×247×408×76, avatar 56, name line 22, preview line 19. Unread badge `#587AF6`, muted badge `rgba(255,255,255,0.18)`. |
| 02b groups | Row 16×247×408×89, squircle avatar, member stack 20pt. Shotkit has one group. |
| 03 DM | Back 12,60,48. Peer capsule 68,60,166×48. Action capsule 242,60,186×48 (five 36pt buttons). Composer plus 52 at y880, field 356×52. Other bubbles start at x60; own bubbles end at x426. |
| 04 menu | Emoji bar 296×56, menu 250×252.5, radius 26. Vertical position follows the pressed bubble. |
| 05 attach | Sheet 12,664,236×196, radius 30. Items at y672 / 732 / 792: Görsel Yükle, Dosya Yükle, GIF Gönder. |
| 16 announcements | Sheet from top 14%, inset 14, title “📢 Duyurular”. |

Long name + admin (`Ayşe Nur Karadenizlioğlu`, shield): one line with ellipsis at 440 and at 375. At 375 the header tightens to 44pt so the shield stays inline.

Side by side (mockup | app):

- `docs/glass-redesign/compare/stage3-02-chats-side-by-side.png`
- `docs/glass-redesign/compare/stage3-02b-groups-side-by-side.png`
- `docs/glass-redesign/compare/stage3-03-dm-side-by-side.png`
- `docs/glass-redesign/compare/stage3-04-menu-side-by-side.png`
- `docs/glass-redesign/compare/stage3-05-attach-side-by-side.png`
- `docs/glass-redesign/compare/stage3-16-announcements-side-by-side.png`

Known, not style bugs: Chrome has no SF Pro (both sides fall back; the app ships its own Inter, so glyph widths differ). Sample copy and avatars. One group in the fixture. Menu y follows the live message. Announcement badge has no API count. Open-swipe, light theme, a colored theme, Reduce Transparency, Increase Contrast and glass-lite were checked in CSS (tokens + `a11y-solid` / `a11y-contrast` / `--g-blur`) and not re-shot as full frames.

### Zero-diff

Glass off, synced mock servers. 0 px and identical DOM on desktop, mobile web, Electron, Android, iPad, groups, and iPhone with `descall:glass=0`.

Friends and calls differ only by the mock port inside the invite link (`localhost:3101` vs `localhost:3110`): 250–262 px. After normalising `localhost:\d+` the DOM matches. `glass-ui` was absent on every scenario.

### Tests

78 selftests pass. The five pre-existing failures are unchanged: Skeleton, AppLayout.view-transition, AdminPanel.analytics, useCall, sitemap. `npm run build:prod` perf-budget ok (marketing first-paint 202 KB / 220 KB). Styles gzip 106.72 KB.

### CI

Commit `b78b715`. Tag `v2.9.155` points at `60110a7`.

CI for `60110a7920ccdae588189d5a7c4fe151be407950`:

- Marketing quality gates: success (run 37972752993)
- Publish Descall release (Windows): success (run 37972754711)
- iOS TestFlight: success (run 37972754684)
- Deploy SPA to Vercel: success (run 37972752755)
- Deploy to Render: success (run 37972752896)

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.155**. Yalnız iPhone. Başka bir temada da bir kez dene.

- [ ] Sohbetler satırları: avatar 56, isim tek satır, önizleme, saat, okunmamış mavi rozet. Sessiz sohbette rozet soluk.
- [ ] Satırı sola kaydır: Sabitle (turuncu), Sessiz (mor), Okundu (mavi), Kapat (kırmızı). Parmakla birebir gider; hızlı fırlatınca açılır, ters bırakınca kapanır. Snap anında titreşim.
- [ ] Gruplar: yuvarlatılmış kare avatar, üye yığını, “N üye”.
- [ ] DM başlığı: geri · avatar + isim + “Çevrimiçi” · Ara, Sabitle, Ses, Görüntülü, Engelle. Uzun isim + yönetici kalkanı tek satırda, harf harf kırılmaz (375 ve büyük iPhone).
- [ ] Mesaja dokununca menü açılmaz. Basılı tutunca (hemen basış tepkisi, tetikte titreşim) menü balondan çıkar: 👍❤️😂😮😢, Yanıtla, Sabitle, Düzenle, Daha fazla tepki, Sil. Başkasının mesajında Düzenle/Sil yok, Şikayet var.
- [ ] Balonu yana kaydırınca yanıtla.
- [ ] + menüsü yalnız Görsel Yükle, Dosya Yükle, GIF Gönder. GIF seçici açılır.
- [ ] Sesli mesaj kaydı ve oynatma, “düzenlendi”, sabitlenmiş, “Yeni mesajlar”, yazıyor…
- [ ] Klavye açıkken composer klavyenin üstünde kalır.
- [ ] Duyurular: “📢 Duyurular”, zil, göreli süre.
- [ ] Masaüstü / web / Android aynı eski görünümde.

## Hotfix — araç çubuğu basışı, durum menüsü, Oyna, duyurular · 2.9.156

TestFlight 2.9.155 notları. Yalnız `html.glass-ui`.

- Araç çubuğu (avatar, grup, +) basınca 0.88 ölçeğe iner ve titreşir. Buzlu cam dolgusu alt öğede; WebKit, `backdrop-filter` taşıyan öğedeki `transform`u yok sayıyordu.
- Durum menüsü soldan 16, alttan 100, genişlik 280. Keskin lens avatar araç çubuğundaki yerinde (y 60), menü avatar yönünden büyür (`transform-origin: 32px 0`).
- Oyna: cam liste çekmecesi tam ekran ortamı LFG’nin üstüne boyuyordu. Çekmece gizlenir; hub 440×956 görünür; cam sekme çubuğu durur.
- Duyurular: API `created_at` döndürür, sayfa `createdAt` okuyordu. İkisi de kabul edilir, sayfa her açılışta yenilenir, liste kayar. Boş veya hata durumu görünür.

440×956 ölçüm (Vite + shotkit, cam açık): menü 16,421,280×435 (alt kenar 100); lens 16,60,44; duyuru sayfası y 134, iki satır ve tarih; Oyna hub 0,0,440×956, çekmece `display:none`, sekme çubuğu duruyor. Basış ölçeği grup 0.885, avatar 0.885, artı 0.890.

## Hotfix — duyuru kartı, sohbet başlığı, liste avatarı · 2.9.157

TestFlight 2.9.156. Yalnız `html.glass-ui`.

- Duyuru kartı artık üstte hizalı: ikon solda, başlık tek satır, gövde en fazla iki satır, süre sağ üstte, “admin tarafından” gövdenin altında. Uzun metin kartın dışına taşmıyor.
- Sohbet başlığı `contain: paint` olan 0 yükseklikteki kutuya sabitlendiği için görünmüyordu. DM, grup ve sunucu kanalları geri · kimlik kapsülü · eylem kapsülü ile açılır. Kanal başlığı: `#` + ad, “Sunucu · N üye”, ara / üyeler / sabitle.
- Sohbet listesindeki avatarların iç gölge çerçevesi kalktı. Durum noktası ayrımı duruyor.

440×956 ölçüm: DM başlığı 12,60,416×48 (geri 48, kimlik 166×48, eylemler 186×48). Kanal başlığı 12,60,416×48; başlık “genel”, alt yazı “Oyun Gecesi · 128 üye”, sağda ara / üyeler / sabitle. Duyuru kartı 380×104, ikon 40×40 kartın içinde, gövde iki satır.

## Hotfix — GIF seçici aramayı kendiliğinden açmasın · 2.9.158

TestFlight. Yalnız `html.glass-ui`.

GIF seçici açılınca arama alanı odaklanıyor, iPhone klavyeyi trendlerin üstüne çıkarıyordu. Seçici altta bir sayfa olarak açılır, Trendler seçilidir, arama salt okunurdur. Arama kutusuna veya Ara’ya dokununca klavye gelir.

440×956: sayfa 12,290,416×620, alt kenar 910. Açılışta odak `body`, alan `readOnly`. Dokununca odak arama alanına geçer.

## Hotfix — grup listesi üye simgelerindeki kare çerçeve · 2.9.159

TestFlight. Yalnız `html.glass-ui`.

Grup satırındaki üye yığını (20pt) kare `.ui-avatar` kutusuna `box-shadow: 0 0 0 2px` çiziyordu; daire içeride olduğu için her simgenin etrafında siyah kare görünüyordu. Gölge, kenarlık ve dış çizgi kaldırıldı. Üst üste binme (`margin-left: -6px`) ve “N üye” duruyor. Büyük grup ikonu (squircle) aynı.

440×956, cam açık: dört simge, `box-shadow: none`, kenarlık 0, iç daire `border-radius: 50%`. Kutunun köşe pikseli sayfa rengiyle aynı `(22, 23, 32)`; ortası avatar rengi. `glass-scope` 669 seçici.
