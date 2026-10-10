# Stage 7 — mühendislik QA (440×956 @3x)

Tarih: 2026-10-09. Karşılaştırma Chrome’da, üst güvenli alan 62 / alt 34 maskelenerek. Mockup solda, uygulama sağda: `docs/glass-redesign/compare/stage7/*-side-by-side.png`.

Bu tablo **2.9.171** cila turunun yeniden çekilen ekranlarını (02, 04, 09, 10, 11, 12, 16, 18) ve 2.9.170’te kalan satırları gösterir. Piksel eşiği (HANDOFF) maskelenmiş alanda ≤%0,5, bilinen veri ve yazı tipi farkları dışında. Yüzdeler o eşiğin üstünde kalır: Inter glif genişliği, fikstür metni, avatar rengi ve mağaza karosu. Cila: duyuru rozeti, smile-plus, davet altın satırı, ekle-arkadaş etiketleri, 30px ses satırı, kanal yer tutucusu, duyuru ikonları, durum yer tutucusu. Ayrıntı “Cila” bölümünde.

Görsel denetim, App Store ekran görüntüleri ve “Bu sürümde yenilikler” Dimaru’da. Bu turda App Store’a gönderilmedi. `styles/mobile-glass.css` duruyor.

## Ekran özeti

Maskelenmiş piksel farkı (eşik 0.15, `includeAA`). 21b, kaydırılmış mağaza çekiminden yeniden ölçüldü.

| Ekran | Fark | Karar |
| --- | --- | --- |
| 01-login | %12.65 | Google düğmesi iOS’ta yok (bilinçli). |
| 02-chats | %10.69 | Megafon rozeti 2 (okunmamış sayaç). |
| 02b-groups | %9.30 | Grup listesi, üye yığını kare çerçevesiz. |
| 03-dm | %9.70 | Üst solma `.g-edge-conv` 150px, maske %72 opak. |
| 04-msg-menu | %13.62 | “Daha fazla tepki” smile-plus. Menü ilk kalkışta açık kalıyor. |
| 05-attach | %3.76 | `+` z-index 85, scrim 70. Düğme scrim’in üstünde (elementFromPoint path). |
| 06-call-11 | %6.93 | Saç teli konuşma halkası (dolgu yok). Kalite çubukları mavi tonda. |
| 07-group-call | %20.19 | Grup ızgarasında avatar halkası gizli; karo kenarı yeşil. Karo gradyanları ayrı. |
| 08-incoming | %7.67 | Hap y 148. Avatar kutu gölgesi 3px beyaz halka. |
| 09-friends | %9.56 | Davet: “Arkadaş davet et” / “Descall'a katıl — ikimiz de DesCoin kazanırız” / “Sen 100 · onlar 50 DesCoin”. |
| 10-add-friend | %9.25 | Hızlı Ekle / Arkadaş / Grup. Alan ikonu ve “Kullanıcı adıyla arkadaşlık isteği gönder”. |
| 11-servers | %4.49 | Ses üye satırı 30px. Kanal “···” gizli. |
| 12-server-channel | %7.70 | Yer tutucu `#genel'e mesaj yaz…`. |
| 13-server-menu | %7.10 | Düz bildirim satırları, mavi çek sağda. Sahip satırı “Sunucuyu sil”. Alt yazı “· 4 sesli”. |
| 14-profile | %8.19 | Bannersız hesapta marka şeridi. Durum 22×22, 3px halka. Üyelik Tarihi 10 Oca 2026. |
| 14b-profile-edit | %10.89 | Gruplar: Kimlik, Hakkımda, Banner, Özel durum. “Banner'ı değiştir”, “Avatarı değiştir”, salt okunur kullanıcı adı. |
| 15-settings | %6.97 | Ayarlar açıkken sekme vurgusu yok (`.g-tab.on` boş). Profil kartı %4.5 beyaz + blur. |
| 15b-settings-notifications | %7.93 | Dipnot kartın altında, sol boşluk 16px. Satır ikonları gizli. |
| 16-notifications | %6.13 | Satır ikonları kayıtlı emoji/renk: zil, çanta, kişiler. |
| 17-play | %15.80 | Başlık zemini saydam, alt solma. Çipler tek satır 32px. Kart blur. Competitive mavi, Unrated yeşil, Swiftplay amber. |
| 18-status | %3.47 | “Aklınızdan neler geçiyor?” kırpılmıyor (scrollWidth = clientWidth). |
| 19-calls | %11.34 | İçerik üstü `chrome + 142px`. Görüntülü satırda video ikonu. Grup satırında yalnız telefon. |
| 20-activity | %18.45 | Durum kartı harfi 21.84px beyaz, durum noktası 14px. Avatar 52. |
| 21-shop | %27.91 | Cüzdan saydam, altı blur solma. Davet: “Arkadaş davet et” + “Sen 100 DesCoin · onlar 50 kazanır”. Hedefler Mesajlar / Ekran. |
| 21b-shop-items | %22.91 | Kaydırılmış kartlar cam + kenar. Kart sanatı mockup SVG’si değil. |

## Uzun ad + yönetici rozeti

Fikstür: `Ayşe Nur Karadenizlioğlu`, `ayse_uzun_kullanici_adi`, `is_admin`.

| Yer | 375 | 440 |
| --- | --- | --- |
| Sohbet listesi `.dm-name` | tek satır, nowrap, h 22 | tek satır, kutu ada sığıyor |
| DM başlığı `.g-peer-name-text` | nowrap, h 20, taşan kısım kesik. Rozet 18×18, etiket gizli (≤430) | aynı, etiket gizli |
| Arkadaş satırı | **önce** h 40 (ad + “Yönetici” alt satıra kayıyordu). **2.9.167 sonrası** h 22.4, rozet 76×18 kırpılmadan | aynı, h 22.4 |

Grup üye satırı (`.member-name-row`) camda artık `flex-wrap: nowrap`; ad ellipsis, rozet sabit. Ayarlardaki mini profil adı `.us-mini-name` ile tek satırda kesiliyor. Profil sayfasında rozet adın yanında değil, çip satırında (mockup düzeni).

## Matris

| Koşul | Sonuç |
| --- | --- |
| 32 tema (dark … desertbloom) | `glass-ui` açık kaldı. 32 farklı `--g-brand`. dark `#587AF6`, light `#4F7CFF`, ocean `#22C7D6`, sakura `#F679A3`, neonjungle `#51F628`. |
| Reduce Transparency | `html.a11y-solid`, sekme `backdrop-filter: none`. |
| Increase Contrast | `html.a11y-contrast`, blur yok. |
| Low Power / glass-lite | `html.glass-lite`, blur `blur(12px) saturate(1)`. |
| Reduce Motion | `prefers-reduced-motion: reduce` eşleşiyor. Basışta `transform: none`. |
| Büyük yazı (kök 20px) | `.g-large-title` 34px, h 40, nowrap. Başlıklar mockup pt’sine kilitli; rem’e çevrilmedi. |
| 375 ve 440 | Uzun ad tablosu yukarıda. |
| Yatay 844×390 (iPhone UA) | `glass-ui` açık, sekme 12,302,820×64, `display: grid`. |
| 956×440 sekme yok | Denetim artefaktı: genişlik ≥900 Playwright’ı masaüstü UA’ya alıyor. `useMobile` telefon UA’sı veya ≤768. Ürün hatası değil. |

## Platform (cam sınıfı yok)

| Yüzey | `glass-ui` | `.g-tabbar` |
| --- | --- | --- |
| Electron masaüstü 1280×800 | yok | yok |
| Android 412×915 | yok | yok |
| iPad 1032×1376, platform ios | yok | yok |
| iPhone `descall:glass=0` | yok | yok |

`glass-scope.selftest`: 915 seçicinin hepsi `html.glass-ui` altında. Cam CSS’i bu sınıf olmadan boyamaz.

v2.9.150 iş ağacı yeniden kurulup piksel piksel `zero-diff.mjs` çalıştırılmadı. 2.9.150’den beri cam dışı ürün düzeltmeleri (arama, duyuru, GIF, …) o karşılaştırmayı 0 piksel yapmaz; bu turda kapı “cam sınıfı yok” oldu.

## Özellik envanteri

Kaynak: `docs/glass-redesign/final/feature-inventory.md`. “Var” = cam kabuğunda eylem duruyor. Bilinçli sapmalar sonda.

| Ekran | Öğe | Durum |
| --- | --- | --- |
| Nav | Sohbetler, Gruplar, Sunucular, Oyna, Arkadaşlar, Aktivite, Aramalar | Var. Aynı `buildMainNavItems` sırası. |
| 01 | Logo, slogan, Giriş/Kayıt, kullanıcı adı, şifre, göster, unuttum, Giriş, şartlar | Var. |
| 01 | Apple → Google → veya → form | Apple ve form var. **Google iOS’ta yok.** |
| 02 | Avatar, Ara, Duyurular, Geri Bildirim, Ekle, arama, satır, kaydırma eylemleri, yazıyor, 7 sekme | Var. |
| 02b | Grup listesi, üye yığını, rozet, Akşam Ekibi | Var. |
| 03 | Geri, avatar, ad, durum, Ara, Pin, Ses, Video, Engelle, composer (+ emoji mic gönder) | Var. |
| 03 | “Camın altında…” debug | Yok (doğru). |
| 04 | 👍❤️😂😮😢, Yanıtla, Sabitle, Düzenle, Sil | Var. İlet/Kopyala yok (doğru). |
| 05 | Görsel, Dosya, GIF | Var. Konum/kişi yok (doğru). |
| 06–08 | Kapsül, 6’lı kontrol, konuşma halkası, PIP, 2×2, Reddet/Kabul | Var. Ekran paylaşma gerçek iPhone’da gizli; karşılaştırma çekimi çubuğu çiziyor. |
| 09–10 | Davet kartı, Bekleyen, Çevrimiçi, Çevrimdışı, mesaj/ara, kabul/red, Hızlı Ekle/Arkadaş/Grup | Var. |
| 11–13 | Ray, yazı/ses, üye, menü (rol, davet, ayarlar, topluluk, ikon, bildirim, ayrıl) | Var. |
| 14 | Banner, çerçeve, unvan, Mesaj/Arkadaşlar, Engelle/Şikayet | Var. Valorant yalnız hesap bağlıysa. |
| 14b | Avatar, kimlik, hakkımda, banner, özel durum | Var. |
| 15 | Hesap / Uygulama / Medya / Kişiselleştirme, Çıkış | Var. |
| 15b | Mesaj/arama bildirimleri, iPhone izin, aktivite anahtarları | Var. |
| 16 | Duyurular | Var. |
| 17 | LFG: geri, filtre, lobi | Var. **Companion sekmesi yok. Sekme çubuğu var** (mockupta yoktu; ürün kararı). |
| 18 | 4 durum + özel + Kullanıcı Ayarları | Var. |
| 19 | 5 filtre, hızlı ara, son aramalar | Var. |
| 20 | Durumun, Durum Ayarla, Arkadaşlar/Geçmiş | Var. |
| 21 / 21b | Geri, Mağaza, DesCoin hapı, günlük ödül, davet, kategori, banner ve çerçeve kartları | Var. Bakiye fikstürde 1.250. |

Bilinçli olarak olmayanlar: DimaAI, arama kaydı, ilet/kopyala, “Valorant Squad” adı, sahte Sen sekmesi.

## Testler

- Selftest turu: 84 dosya. 79 geçti. Bilinen 5 kalıcı kırık (bu tura ait değil): `Skeleton`, `AppLayout.view-transition`, `AdminPanel.analytics`, `useCall`, `sitemap`.
- `glass-scope.selftest` 915 seçici. `edgeSwipeBack.selftest` geçti. `navInventory.selftest` geçti (arkadaş satırı nowrap dahil).
- `npm run build:prod`: pazarlama ilk boya JS **202.0 KB / 220 KB**. `perf-budget: ok`.
- Sentry bu ortamda okunmadı. Yeni cam kaynaklı hata tipi iddia edilmiyor.

## Dimaru denetim düzeltmeleri (2.9.168)

440×956, güvenli alan 62/34, `html.glass-ui`, Vite + shotkit. Sayılar `getBoundingClientRect` (pt).

| Konu | Ölçü |
| --- | --- |
| Ayarlar başlığı | “Ayarlar”, y 120, kapatma X `display: none` |
| Ayarlar sekmesi | 12,868,416×64, menünün üstünde |
| Profil kartı ve satır | ikisi de x 16, genişlik 408, sağ 424. DesCoin satırı var. İkonlar renkli. Grup zemini saydam, satır `rgba(255,255,255,0.06)` |
| Bildirimler | Başlık ortalı (“Bildirimler”), kaydırma zemini saydam, sekme gizli |
| 1:1 karo | x 14, y 208, 412×556, sağ 426, alt 764. Ad hapı genişlik ~114 (tam bar değil) |
| 6 düğmeli çubuk | kapsül 12,856,416×76. Son (kırmızı) düğme sağ 418. `display: grid` |
| Konuşma halkası | çekirdek merkezi ile halka merkezi aynı (grup, Ayşe) |
| Kamera kapalı | “Sen” nötr `is-cam`; mikrofon kapalı kırmızı `is-mic` |
| Aktivite | “DURUMUN … Durum Ayarla” ve “Arkadaşlar Geçmiş” |
| Mağaza | 14 yatay çip (Bannerlar, Çerçeveler, …). Önizleme `display: none`. Davet: link + Linki kopyala + Paylaş |
| Oyna | ambient gradyan, kicker gizli, filtreler `flex`, “Filtreler” düğmesi gizli |
| Harf | 56px avatar, harf `font-size` 23.52px (0.42em) |
| Aramalar | avatar `box-shadow: none` (saç çizgisi yok) |

Sohbet üst solması `.g-edge-conv` (sabit, üst, işaretçi yok). Mesaj menüsü güvenli alan 62/34 arasına sıkışır. Ek menüsü tam ekran scrim + `+` 45° döner.

## 2.9.167

Arkadaş listesinde uzun ad, `flex-wrap: wrap` yüzünden yönetici rozetini ikinci satıra itiyordu (satır adı 22pt yerine 40pt). Cam kuralı adı ellipsis’li ayrı bir span’a alıyor, rozeti `flex: 0 0 auto` tutuyor. Grup üye satırı ve ayar mini profili aynı sözleşmeye çekildi. Masaüstü / web / Android / iPad seçicileri `html.glass-ui` dışında değişmedi.

## 2. tur (2.9.169)

440×956, güvenli alan 62/34. Sayılar `getBoundingClientRect`.

| Konu | Ölçü |
| --- | --- |
| Grup fotoğraf avatarı | Çekirdek 72×72. Avatar inline min 96 iken kullanılan kutu 72. Fotoğraf 72×72, halka merkezi ile dx 0 dy 0. |
| Uzun basış | Parmak kalkınca menü açık, düzenleme kutusu yok. 400ms sonra menü öğesi kapanıyor (eylem çalışıyor). |
| Oyna | `data-glass-lfg=1`, hub başlığı yok. Geri 48×48. Select `appearance: none`, 34px çip. Kart cam. Düğme metni “Katıl”. |
| Mağaza | Cüzdan `sticky` z 8. Sayaç “Bannerlar · N”. “40 DesCoin al” `relative`; kaydırınca barın altında kalmıyor. |
| Ek menüsü | Açık `+` z-index 85, scrim 70. `elementFromPoint` düğmenin svg path’i. |
| Aktivite | Harf 21.84px `#fff`, durum noktası 14px yeşil, avatar 52. |
| Ayarlar | Ad 17px. Nav `overflow: visible`. Çıkış Yap `static`, son satırın 478px altında. Sol üst nokta 12px. |
| Sohbet üst solması | `.g-edge-conv` yükseklik 150px, maske 0–72% opak. |

`glass-scope.selftest` 1074 seçici. `glassMessageMenu.selftest` açılış koruması 400ms.

## 3. tur (2.9.170)

440×956 @3x, güvenli alan 62/34 maskeli, `html.glass-ui`, Vite 5174 + shotkit 3000. Sayılar `getBoundingClientRect`.

| Konu | Ölçü |
| --- | --- |
| Uzun basış | 1600ms basılı tutup bırakınca menü açık (“Düzenle” görünür), rapor diyaloğu yok. Koruma süreye bağlı değil: ilk `pointerup` / `click` yutulur, sonraki `pointerdown` yeni basıştır. Satır, üzerine basılmadan çalışmaz. |
| Mağaza cüzdan | Çubuk zemini saydam. `::before` blur 16px, maske `rgba(13,14,19,0.88) → 0`. |
| Davet kartı | “Arkadaş davet et” / “Sen 100 DesCoin · onlar 50 kazanır” / Linki kopyala / Paylaş. Günlük kart `blur(18px) saturate(1.5)`. Hedefler: Konuşma, Mesajlar, Ekran. |
| Başkasının profili | Banner `linear-gradient` (banner yokken de). Durum 22×22, kenar 3px. Avatar `::after` halka. “Üyelik Tarihi 10 Oca 2026”. Özel durum satırı yalnız doluysa. |
| Sunucu menüsü | “İnsanları davet et”, “Sunucu Ayarları”, “Topluluk ve Keşif”. Bildirim satırları ikonsuz. Alt yazı “128 üye · 4 sesli”. Ayrı kırmızı satır: sahipte “Sunucuyu sil”. |
| Profil düzenle | “Banner'ı değiştir”, “Avatarı değiştir”, “Kullanıcı adı @deniz”, Hakkımda ve Özel durum ayrı grup. |
| Bildirimler | Dipnot kartın altında (y 436, kart altı 309), `padding-left` 16px. `.g-notif` satır ikonu `display: none`. |
| Aramalar | İçerik `--g-content-top: chrome + 142px`. |
| Oyna | Filtre `nowrap`, select 32px. Mod renkleri competitive `rgb(158,182,255)`, unrated `rgb(94,224,138)`, swiftplay `rgb(240,193,90)`. Kart blur. Başlık zemini saydam, alt solma. |
| Gelen arama | Hap y 148. Avatar `box-shadow` 3px beyaz. |
| Ayarlar sekmesi | Ayarlar açıkken `.g-tab.on` yok. |

`glass-scope.selftest` 1112 seçici. `glassMessageMenu.selftest`, `edgeSwipeBack.selftest`, `navInventory.selftest` geçti.

### Bilinçli olarak eklenmeyenler

- Mağaza davet kartında sağ üst × yok. Onaylı `21-shop` HTML’inde de kapatma yok; uygulamada davet kartını kapatan bir eylem yok.
- “Sunucudan Ayrıl” yalnız sahip olunmayan sunucuda. Çekimdeki sunucuların sahibi Deniz; kırmızı satır “Sunucuyu sil”. Ayrıl eylemi duruyor, silinmed.
- “· N sesli” yalnız o an ses kanalında biri varken. Çekimde 4 kişi olduğu için yazıldı.
- Özel durum satırı, kullanıcıda özel durum yokken çizilmez. Fikstürde yok; “Ranked arıyorum” uydurulmadı.
- Premier etiket rengi listede yok; gri kaldı.
- Taşınan düşük notlar 2.9.171 cila turunda işlendi. Aşağıya bakın.

## Cila (2.9.171)

440×956 @3x, güvenli alan 62/34 maskeli, `html.glass-ui`, Vite 5174 kaynak + shotkit 3300. Yeni eylem yok.

| Konu | Ölçü |
| --- | --- |
| 02 rozet | `.g-nb` metni “2”. `aria-label` “Duyurular 2”. Sayaç `GET /api/announcements/unread/count`. Sayfa açılınca mevcut okundu ucu çağrılır, rozet sıfırlanır. |
| 04 ikon | “Daha fazla tepki” satırı SmilePlus (`M22 11v1a10…`). Besteci gülümsemesi duruyor. |
| 09 davet | “Arkadaş davet et Descall'a katıl — ikimiz de DesCoin kazanırız Sen 100 · onlar 50 DesCoin”. Mağaza kartı “Sen 100 DesCoin · onlar 50 kazanır”. |
| 10 ekle | Sekmeler “Hızlı Ekle / Arkadaş / Grup”. `.g-add-field` kullanıcı ikonu. Dipnot “Kullanıcı adıyla arkadaşlık isteği gönder”. |
| 11 sunucu | `.server-voice-user` yükseklik 30. Satır sayısı 4. Kanal “···” ve ses satırı “···” `display: none`. Menü eylemleri duruyor. |
| 12 yer tutucu | `#genel'e mesaj yaz…`. DM yer tutucusu `Mesaj…`. |
| 16 ikonlar | Üç `.g-ann-mark` svg. Zemin `rgb(88,122,246)`, `rgb(124,92,255)`, `rgb(48,209,88)`. Kaynak `emoji` + `color`. |
| 18 durum | Yer tutucu “Aklınızdan neler geçiyor?”. `scrollWidth` 188 = `clientWidth` 188. `clipped` false. |

`glass-scope.selftest` 1121 seçici. `glassMessageMenu.selftest`, `edgeSwipeBack.selftest`, `navInventory.selftest` geçti.

Stage 7 mühendisliği bu sürümle kapanır. Kalan fark, Demir’in cihaz testinde çıkarsa ayrıca ele alınır.

## TestFlight kontrol listesi (Demir)

Sürüm **2.9.171**. Yalnız iPhone. App Store’a gönderme.

- [ ] Sohbetler, Gruplar, Sunucular, Oyna, Arkadaşlar, Aktivite, Aramalar sekmesi duruyor. Oyna’da da sekme duruyor; liste çekmecesi yok.
- [ ] Uzun bir ad + yönetici rozeti: sohbet başlığında tek satır, rozet görünür (dar telefonda yalnız kalkan). Arkadaş satırında ad kesilir, “Yönetici” alt satıra kaymaz.
- [ ] Sohbet içi arama, başlık kapsülünün hemen altında.
- [ ] Grup listesindeki küçük üye simgelerinde kare çerçeve yok.
- [ ] Sunucu kanal başlığındaki +, sırala ve menü ayrı 30pt daireler.
- [ ] Ayarlar grupları ve Çıkış Yap. Bildirim anahtarları dönüyor.
- [ ] Mağaza: bakiye, günlük ödül, davet, kategori, banner/çerçeve. Satın al bakiyeyi günceller.
- [ ] Google ile giriş yok. Companion yok.
- [ ] Ayarlar → Reduce Transparency / Increase Contrast / Reduce Motion / Düşük Güç: cam kapanır veya sadeleşir, uygulama çökmez.
- [ ] Bir renkli temada vurgu rengi temadan gelir.
- [ ] Masaüstü Windows ve tarayıcı: cam sınıfı yok, eski görünüm.
- [ ] Grup aramasında fotoğraflı avatar, yeşil konuşma halkasının tam ortasında.
- [ ] Mesaja uzun basıp parmağı kaldırınca Düzenle / Şikayet kendiliğinden açılmaz.
- [ ] Oyna: cam başlık, çip filtreler, lobi kartında Katıl. Mağazada “Bannerlar · N” sayacı listenin üstünde kalır.
- [ ] Sohbetler megafonunda okunmamış duyuru sayısı (yoksa rozet yok). Duyuru satırlarında kayıtlı emoji/renk.
- [ ] Mesaj menüsünde “Daha fazla tepki” smile-plus. Arkadaş davetinde “Sen 100 · onlar 50 DesCoin”.
- [ ] Ekle: Hızlı Ekle / Arkadaş / Grup, kullanıcı ikonu, “Kullanıcı adıyla arkadaşlık isteği gönder”.
- [ ] Ses kanalındaki üye satırı sıkı (~30pt). Kanal satırında “···” yok. `#genel` yer tutucusu `#genel'e mesaj yaz…`.
- [ ] Durum menüsünde “Aklınızdan neler geçiyor?” kesilmeden görünür.
