# Stage 7 — mühendislik QA (440×956 @3x)

Tarih: 2026-10-09. Karşılaştırma Chrome’da, üst güvenli alan 62 / alt 34 maskelenerek. Mockup solda, uygulama sağda: `docs/glass-redesign/compare/stage7/*-side-by-side.png`.

Bu tablo **2.9.168** yeniden çekimidir (Dimaru denetimi sonrası). Piksel eşiği (HANDOFF) maskelenmiş alanda ≤%0,5, bilinen veri ve yazı tipi farkları dışında. Yüzdeler o eşiğin üstünde kalır: Inter glif genişliği, fikstür metni, avatar rengi ve mağaza karosu. Denetimdeki krom farkları (düz ayarlar/oyna/mağaza, kontrol çubuğu, 1:1 karo, menü, üst solma, aktivite kartı, çipler, konuşma halkası, ek menüsü, harf boyu) ölçüyle kapatıldı; ayrıntı sondaki “Dimaru denetim düzeltmeleri” bölümünde.

Görsel denetim, App Store ekran görüntüleri ve “Bu sürümde yenilikler” Dimaru’da. Bu turda App Store’a gönderilmedi. `styles/mobile-glass.css` duruyor.

## Ekran özeti

Maskelenmiş piksel farkı (eşik 0.15, `includeAA`). 21b, kaydırılmış mağaza çekiminden yeniden ölçüldü.

| Ekran | Fark | Karar |
| --- | --- | --- |
| 01-login | %12.65 | Google düğmesi iOS’ta yok (bilinçli). |
| 02-chats | %10.73 | Harf 23.52px / 56px avatar (0.42em). |
| 02b-groups | %9.30 | Grup listesi, üye yığını kare çerçevesiz. |
| 03-dm | %9.72 | Üst solma `.g-edge-conv` sabit, 440×124, işaretçi yok. |
| 04-msg-menu | %10.98 | Son balon menüsü alt 876 (güvenli alt 922). Üst balon da açıldı. |
| 05-attach | %3.97 | Tam ekran scrim, `+` 45°, köşe 30px, taşma gizli. |
| 06-call-11 | %6.52 | Kontrol ızgarası, kırmızı bitiş sağ 418. Ad hapı. (2.9.167’de %16.29.) |
| 07-group-call | %20.11 | Halka merkezi = çekirdek merkezi. Yalnız “Sen” nötr kamera çipi. Kalan fark gradyan karo. |
| 08-incoming | %6.95 | Reddet / Kabul Et. |
| 09-friends | %9.59 | Satır 76, avatar 52. |
| 10-add-friend | %8.70 | Hızlı Ekle / Arkadaş / Grup. |
| 11-servers | %8.26 | Ray + kanal bölmesi. Başlık eylemleri 30px daire. |
| 12-server-channel | %7.84 | Kanal sohbeti, üst solma duruyor. |
| 13-server-menu | %6.88 | Alt sayfa: kanal, rol, davet, ayarlar. |
| 14-profile | %22.60 | Banner, avatar, Mesaj / Arkadaşlar. Fark fikstür biyografisi. |
| 14b-profile-edit | %20.33 | İptal y 64, başlık ortalı, Kaydet sağda. Zemin ambient. |
| 15-settings | %7.17 | “Ayarlar”, kart ve satır x 16–424, sekme duruyor, X gizli. |
| 15b-settings-notifications | %7.99 | “Bildirimler” ortalı, kaydırma saydam, sekme gizli. |
| 16-notifications | %6.20 | Duyurular sayfası. |
| 17-play | %13.74 | Ambient, filtreler açık, kicker gizli, sekme duruyor, Companion yok. |
| 18-status | %3.41 | Dört durum + özel + Kullanıcı Ayarları. |
| 19-calls | %11.59 | Avatar `box-shadow: none`. |
| 20-activity | %16.61 | “DURUMUN … Durum Ayarla” ve “Arkadaşlar / Geçmiş”. |
| 21-shop | %26.92 | 14 çip, önizleme gizli, davet link + Linki kopyala + Paylaş. Bakiye 1.250. |
| 21b-shop-items | %30.19 | Aynı mağaza kaydırılmış. Kart sanatı mockup SVG’si değil. |

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

## TestFlight kontrol listesi (Demir)

Sürüm **2.9.168**. Yalnız iPhone. App Store’a gönderme.

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
