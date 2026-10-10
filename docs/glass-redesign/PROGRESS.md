# Liquid Glass — progress log

## Round 2 audit fixes · 2.9.169

Dimaru’nun 2.9.168 turu. Fotoğraf avatarı grup aramasında 72pt çekirdeğe sığıyor (konuşma halkası merkezde). Uzun basışın parmak kalkışı menüyü (Düzenle / Şikayet / kapat) tetiklemiyor. Oyna: Valorant hub başlığı kalkıyor, cam LFG başlığı, çip filtreler, cam kart, Katıl. Mağaza: yapışkan cüzdan + “Bannerlar · N”, günlük ödül listenin altında kayboluyor. Ek menüsü scrim’i `+` düğmesinin altında. Aktivite durum kartında harf ve durum noktası. Ayarlar: Çıkış Yap listeyle kayıyor, ad 17px, sol üst avatar noktalı. Sohbet üst solması 150px. App Store’a gönderilmedi. `mobile-glass.css` duruyor. Ölçüler: `docs/glass-redesign/compare/stage7/REPORT.md`.

## Stage 7 audit fixes · 2.9.168

Dimaru’nun 25 ekran denetimindeki zorunlu farklar (ayarlar/profil/oyna/mağaza düz panel, arama kontrol çubuğu, 1:1 karo, mesaj menüsü, sohbet üst solması, aktivite durum kartı, mağaza çipleri, konuşma halkası, ek menüsü, harf avatarları). Ölçüler: `docs/glass-redesign/compare/stage7/REPORT.md` son bölüm. App Store’a gönderilmedi. `mobile-glass.css` duruyor.

## Stage 7 — Mühendislik QA · 2.9.167

25 ekranın yan yana PNG’leri ve tablo: `docs/glass-redesign/compare/stage7/REPORT.md`. App Store’a gönderilmedi. `mobile-glass.css` duruyor. Görsel denetim, mağaza ekran görüntüleri ve “Bu sürümde yenilikler” Dimaru’da.

Düzeltme: arkadaş satırında uzun ad + yönetici rozeti ikinci satıra kayıyordu (`flex-wrap: wrap`). Camda ad ellipsis, rozet sabit, satır yüksekliği 22pt. Grup üye satırı ve ayar mini profili aynı sözleşme.

Chrome matrisi: 32 tema, Reduce Transparency / Increase Contrast (blur yok), glass-lite, Reduce Motion, 375 ve 440, yatay 844×390’ta sekme duruyor. Electron, Android, iPad ve `descall:glass=0` üzerinde `glass-ui` yok. `build:prod` 202.0 KB / 220 KB. Sentry bu ortamda okunmadı.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.167**. Yalnız iPhone.

- [ ] Uzun ad + yönetici rozeti tek satır (arkadaş satırında “Yönetici” alt satıra kaymaz).
- [ ] Oyna sekmesinde cam sekme çubuğu duruyor. Companion yok. Google ile giriş yok.
- [ ] Sohbet içi arama başlığın altında. Sunucu başlık daireleri ayrı. Grup üye simgelerinde kare çerçeve yok.
- [ ] Reduce Transparency, Increase Contrast, Reduce Motion, Düşük Güç.
- [ ] Masaüstü / tarayıcı eski görünüm.

## Stage 6 — Ayarlar, Oyna, Aktivite, Mağaza · 2.9.165

iPhone-only (`html.glass-ui`). New sheets: `styles/glass/settings.css`, `shop.css`, `play.css`. Companion / LFG segment stays hidden on iOS (parity). The Play tab bar condition is unchanged.

### Compare (440×956, safe area top 62 / bottom 34)

Settings menu (Kullanıcı Ayarları): title height 40 at y 80. Profile row 28,134,408×68. First group 22,232,396×212. Row 22,269,396×59 (“Hesabım”). Çıkış Yap 26,804,388×52. Groups are static glass (no per-row blur). Toggles are 51×31.

Play and Activity use the same glass tokens on the existing LFG cards and the activity status card. The list drawer on Play stays hidden.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.165**. Yalnız iPhone.

- [ ] Ayarlar: Hesap, Uygulama, Medya, Kişiselleştirme grupları ve Çıkış Yap. Her alt sayfa açılıyor, kenardan kaydırarak geri.
- [ ] Bildirim anahtarları anında dönüyor. iPhone izin satırı duruyor.
- [ ] Oyna: Companion sekmesi yok. LFG kartları, oluştur, katıl, parti kodu. Sekme çubuğu duruyor.
- [ ] Aktivite: durum kartı, Durum Ayarla, Arkadaşlar / Geçmiş.
- [ ] Mağaza: cüzdan hapı, günlük ödül, kategori chipleri, ürün kartları. Satın al / kuşan bakiyeyi güncelliyor.
- [ ] Masaüstü / web / Android aynı eski görünümde.

## Stage 5 — Arkadaşlar, sunucular, profil · 2.9.164

iPhone-only (`html.glass-ui`). Desktop, web, Electron, Android and iPad stay on the previous UI. New rules live in `styles/glass/social.css`. `servers.css` was not edited. The Play tab bar condition stays `showMobileTabBar && (!isPlayPage || glassShell)`.

### Compare (440×956 @3x, safe area top 62 / bottom 34)

| Screen | Result |
|---|---|
| 09 friends | Title 20,112,400×40. Search 16,162,408×42. Invite card 16,222,408×129. Row 16,394,408×76. Avatar 52. Message / call and accept / decline buttons 38. Sections: Bekleyen, Çevrimiçi, Çevrimdışı. |
| 10 add | Sheet 12,115,416×305 (top 12%). “Yeni Oluştur”, Hızlı Ekle / Arkadaş Ekle / Grup Oluştur, username field, “Arkadaşlık İsteği Gönder”. |
| 11 servers | Rail 12,120, width 68, icons 48. Glass pane 88,120,340×716. Selected server “Oyun Gecesi”, text and voice channels, voice members. Category label one line (28.8pt). |
| 12 channel | Header capsule 12,60,416×48. “# duyurular”, “Oyun Gecesi · 128 üye”, search / members / pin. Same capsule as DM and group. In-chat search stays under the header (2.9.162). |
| 13 menu | Bottom sheet 8,202,424×746. Server identity, Roller, davet, ayarlar, topluluk, ikon, bildirim seviyeleri, yasaklar, denetim, ayrıl/sil. |
| 14 profile | Sheet top 8% (y 76.5), inset 12. Banner, 88pt avatar, Mesaj Gönder / Arkadaşlar, üyelik ve ortak arkadaşlar, Engelle / Şikayet et. |
| 14b edit | İptal · Profil · Kaydet. 96pt avatar, Kimlik (görünen ad, biyografi, özel durum), banner under that group. |

Side by side (mockup | app):

- `docs/glass-redesign/compare/stage5-09-friends-side-by-side.png`
- `docs/glass-redesign/compare/stage5-10-add-side-by-side.png`
- `docs/glass-redesign/compare/stage5-11-servers-side-by-side.png`
- `docs/glass-redesign/compare/stage5-12-channel-side-by-side.png`
- `docs/glass-redesign/compare/stage5-13-menu-side-by-side.png`
- `docs/glass-redesign/compare/stage5-14-profile-side-by-side.png`
- `docs/glass-redesign/compare/stage5-14b-edit-side-by-side.png`

Known, not style bugs: the fixture has five online friends and one offline, plus one pending request; the mockup draws four and three. Avatar colors are initials. The invite card keeps Paylaş as an icon, so the DesCoin line wraps. The server header keeps geri, kanal oluştur and sırala next to the menu chevron. Category titles are the server’s own names. Profile edit keeps bio and custom status in the Kimlik group, with the banner after that group. The channel compare opened `#duyurular`, which has no fixture messages; the header is the check.

### Tests

`glass-scope.selftest` ok (862 selectors). `edgeSwipeBack.selftest` ok, including the Play tab-bar regex.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.164**. Yalnız iPhone. Oyna sekmesinde cam sekme çubuğu duruyor; liste çekmecesi gizli.

- [ ] Arkadaşlar: büyük başlık, arama hapı, davet kartı (kopyala ve paylaş), bekleyen istekte kabul/red, çevrimiçi satırda mesaj ve ara, çevrimdışı satırda ara yok.
- [ ] + sayfası: Hızlı Ekle, Arkadaş, Grup. Kullanıcı adıyla istek gidiyor. Grup oluşturma duruyor.
- [ ] Sunucular: solda ray, sağda kanal listesi. Yazı kanalına girince başlık `#ad` ve “Sunucu · N üye”. Geri kaydırma kanal → liste.
- [ ] Ses kanalına girme duruyor. Üye satırları görünüyor.
- [ ] Sunucu menüsü: Roller, davet, ayarlar, topluluk, ikon, bildirim seviyesi, ayrıl veya sil.
- [ ] Başkasının profili: banner, çerçeve, unvan, Mesaj / Arkadaşlar, Engelle / Şikayet.
- [ ] Profil düzenle: avatar kırpma, banner, özel durum kaydediliyor. İptal menüye döner, Kaydet yazar.
- [ ] Sohbet içi arama hâlâ başlığın hemen altında.
- [ ] Masaüstü / web / Android aynı eski görünümde.

## Stage 4 — Aramalar · 2.9.161

iPhone-only (`html.glass-ui`). Desktop, web, Electron, Android and iPad stay on the previous UI. While a call is open the document gets `g-in-call`, which drops blur to the glass-lite budget. Tiles are flat gradients. The header capsule and the control bar are the real blur surfaces.

### Compare (440×956 @3x)

| Screen | Result |
|---|---|
| 06 1:1 call | Header capsule 12,60,416×56 (title starts at x68). Control bar 12,856,416×76. Self PIP 110×148 at the lower right. Speaking tile has a green rim, name chip, and “Mükemmel”. |
| 07 group | 2×2 tiles from 12,132, each 203×349, gap 10. Header shows the group name, “Grup araması · 4 katılımcı · 12:08”, quality bars, and the people button. |
| 08 incoming | Full-screen. “GELEN SESLİ ARAMA”, rings, “Mert K. arıyor”, “Sesli arama”, Reddet / Kabul Et at 76pt. |
| 19 calls | Chips at 16,178,408×34 (Tümü Cevapsız Gelen Giden Grup). Quick-dial cards 88pt. Rows 76pt. Copy: “Gelen · 18 dk · 04:12”, “Giden · 1 sa · 12:40”, “Cevapsız grup · 4 kişi · Dün”, “Görüntülü · Giden · 2g · 08:05”. |

Long name + admin (`Ayşe Nur Karadenizlioğlu`, shield) stays one line in the call capsule at 440 and at 375. The shield stays inline.

Side by side (mockup | app):

- `docs/glass-redesign/compare/stage4-06-call-side-by-side.png`
- `docs/glass-redesign/compare/stage4-07-group-side-by-side.png`
- `docs/glass-redesign/compare/stage4-08-incoming-side-by-side.png`
- `docs/glass-redesign/compare/stage4-19-calls-side-by-side.png`

Known, not style bugs: Chrome has no SF Pro. Fixture has five online friends (idle and dnd count); the mockup draws three. Avatar colors are initials, not the mockup gradients. On a real iPhone the screen-share button stays hidden (`screenShareUnavailableOnIos`); the compare shot draws the six-button bar so the capsule can be checked. 2.9.156 had inverted the Play tab-bar hide (`|| glassShell` inside the glass branch); this stage restores `!isPlayPage`.

### Zero-diff

Glass off, against 2.9.159, synced mock servers. 0 px and identical DOM on desktop, mobile web, Electron, Android, iPad, groups, servers, activity, and iPhone with `descall:glass=0`.

Friends and calls differ only by the mock port inside the invite link (`localhost:3216` vs `localhost:3214`): 974–1012 px. After normalising `localhost:\d+` the DOM matches. `glass-ui` was absent on every scenario.

### Tests

78 selftests pass. The five pre-existing failures are unchanged: Skeleton, AppLayout.view-transition, AdminPanel.analytics, useCall, sitemap. `edgeSwipeBack` passes again after the Play tab-bar restore. Styles gzip 109.33 KB.

### CI

Commit `77d2203`. Tag `v2.9.161`.

- Marketing quality gates: success (run 37981412397)
- Deploy to Render: success (run 37981412395)
- Deploy SPA to Vercel: success (run 37981412444)
- Publish Descall release (Windows): success (run 37981413840)
- iOS TestFlight: success (run 37981413819)

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.161**. Yalnız iPhone. Bir aramayı başka bir temada da dene. Telefon ısınırsa cam kendiliğinden hafifler.

- [ ] Aramalar sekmesi: başlık “Aramalar”, 5 filtre (Tümü / Cevapsız / Gelen / Giden / Grup), hızlı ara kartları, son aramalar, geri ara ve görüntülü ara.
- [ ] Cevapsız satır kırmızı. Grup satırında yuvarlatılmış kare avatar.
- [ ] 1:1 sesli arama: kapsül başlık (isim tek satır, süre, kalite), büyük karo, küçük “Sen” önizlemesi, alt kontrol kapsülü.
- [ ] Sessiz / sağırlaştır / kamera / Diğer menüsü / Bitir çalışıyor. Ses aygıtı Diğer menüsünden açılıyor. Küçült (aşağı ok) görüşmeyi karta indiriyor.
- [ ] Grup araması: 2×2 ızgara, konuşanın yeşil çerçevesi, sağ üstte sessiz/kamera kapalı rozeti.
- [ ] Gelen arama (uygulama açıkken): tam ekran, Reddet ve Kabul Et. CallKit’ten kabul/red aynı işi yapıyor (görünüm kodu CallKit’e dokunmaz).
- [ ] Uzun isim + yönetici kalkanı arama başlığında tek satır (375 ve büyük iPhone).
- [ ] 10 dakikalık görüşmede takılma yok; kontrol çubuğu dışında ağır blur yok.
- [ ] Masaüstü / web / Android aynı eski arama görünümünde.

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

## Hotfix — grup listesi üye simgelerindeki kare çerçeve · 2.9.161

TestFlight. Yalnız `html.glass-ui`.

Grup satırındaki üye yığını (20pt) kare `.ui-avatar` kutusuna `box-shadow: 0 0 0 2px` çiziyordu; daire içeride olduğu için her simgenin etrafında siyah kare görünüyordu. Gölge, kenarlık ve dış çizgi kaldırıldı. Üst üste binme (`margin-left: -6px`) ve “N üye” duruyor. Büyük grup ikonu (squircle) aynı.

440×956, cam açık: dört simge, `box-shadow: none`, kenarlık 0, iç daire `border-radius: 50%`. Kutunun köşe pikseli sayfa rengiyle aynı `(22, 23, 32)`; ortası avatar rengi. `glass-scope` 669 seçici.

## Hotfix — sohbet içi mesaj araması başlığın altında · 2.9.162

TestFlight. Yalnız `html.glass-ui`.

Sohbette Ara’ya basınca arama çubuğu akışta kalıyordu. Başlık sabit olduğu ve krom kutusu 0 yükseklikte olduğu için çubuk y=0’da, durum çubuğunun üstüne çıkıyordu. Artık başlık kapsülünün hemen altında cam bir alan. Mesaj listesinin üst boşluğu arama açıkken buna göre uzuyor. Yazı 16pt, iPhone yakınlaştırmaz.

## Hotfix — sunucu başlığındaki eylem daireleri · 2.9.166

TestFlight. Yalnız `html.glass-ui`.

Sunucu kanal panelinde kanal oluştur, sırala ve menü, mobil 44pt dokunma hedefi ve `gap: 0` yüzünden tek bir erimiş hapa dönüşüyordu. Üçü de ayrı 30×30 daire (yarıçap 15, aralık 6). Geri düğmesi de 30×30. İşlemler duruyor: kanal oluştur, sırala, sunucu menüsü. Üstteki mavi “Sunucular +” aynı.

440×956: pane 88,120,340×716. Eylemler 310,140, 346,140, 382,140; her biri 30×30, ikon 16. Üst üste binme yok. Kanal oluştur “Kanal oluştur” sayfasını açıyor, sırala `aria-pressed`, menü 13 öğe.

## Hotfix — Oyna’da cam sekme çubuğu · 2.9.163

2.9.161, cam dalındaki `(!isPlayPage || glassShell)` koşulunu `!isPlayPage` yaptı. 2.9.156’da bu çubuk Oyna’da bilerek duruyordu: liste çekmecesi gizlenir, hub görünür, sekmeler kalır. LFG alt boşluğu hâlâ sekme yüksekliğine göre. Çubuk Oyna’da yine duruyor. Çekmece gizli.
