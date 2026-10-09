# Stage 7 — mühendislik QA (440×956 @3x)

Tarih: 2026-10-09. Karşılaştırma Chrome’da, üst güvenli alan 62 / alt 34 maskelenerek. Mockup solda, uygulama sağda: `docs/glass-redesign/compare/stage7/*-side-by-side.png`.

Piksel eşiği (HANDOFF) maskelenmiş alanda ≤%0,5, bilinen veri ve yazı tipi farkları dışında. Aşağıdaki yüzdeler o eşiğin üstünde; ölçüldüğü yerde krom geometrisi ±1pt. Yüksek yüzde, eksik bir eylemden değil, fikstür metni / avatar / Inter glif genişliği / arama karosu görselinden geliyor. Gerçek stil farkı olarak bulunan tek şey arkadaş satırındaki uzun ad + yönetici rozetiydi; **2.9.167** ile düzeltildi.

Görsel denetim, App Store ekran görüntüleri ve “Bu sürümde yenilikler” Dimaru’da. Bu turda App Store’a gönderilmedi. `styles/mobile-glass.css` duruyor.

## Ekran özeti

Maskelenmiş piksel farkı (eşik 0.15, `includeAA`). 21b, kaydırılmış mağaza çekiminden yeniden ölçüldü.

| Ekran | Fark | Karar |
| --- | --- | --- |
| 01-login | %12.65 | Google düğmesi iOS’ta yok (bilinçli). Kart ~64pt kısa, Giriş ~68pt yukarıda. Kalan krom duruyor. |
| 02-chats | %10.89 | Başlık 20,112,400×40. Arama 16,162,408×42. Sekme 12,868,416×64. Satır 408×76. Metin farkı fikstür. |
| 02b-groups | %9.29 | Grup listesi, üye yığını kare çerçevesiz (2.9.160). Ad: Akşam Ekibi. |
| 03-dm | %9.50 | Başlık kapsülü, sohbet içi arama başlığın altında (2.9.162). |
| 04-msg-menu | %9.04 | Hızlı tepkiler + Yanıtla / Sabitle / Düzenle / Sil. İlet / Kopyala yok. |
| 05-attach | %6.91 | Görsel, Dosya, GIF. |
| 06-call-11 | %16.29 | Başlık 12,60,416×56. Kontrol 12,856,416×76. PIP 110×148. Karo sanatı mockup karesi değil. |
| 07-group-call | %23.61 | İlk karo 12,132,203×349. 2×2. Yüksek fark gradyan karo. |
| 08-incoming | %9.50 | Reddet / Kabul Et. |
| 09-friends | %9.36 | Başlık ve arama 02 ile aynı yerde. Satır 76, avatar 52 (Aşama 5). |
| 10-add-friend | %9.52 | Hızlı Ekle / Arkadaş / Grup sayfası. |
| 11-servers | %4.59 | Ray + kanal bölmesi. Başlık eylemleri 30px daire, aralık 6 (2.9.166). |
| 12-server-channel | %4.14 | Kanal kapsülü. Fikstürde `#duyurular` boş. |
| 13-server-menu | %6.84 | Alt sayfa: kanal, rol, davet, ayarlar. |
| 14-profile | %16.59 | Banner, 88pt avatar, Mesaj / Arkadaşlar, Engelle / Şikayet. |
| 14b-profile-edit | %24.52 | İptal · Profil · Kaydet. Kimlik grubu. Fark alan düzeni + fikstür. |
| 15-settings | %11.93 | Profil 28,134,408×68. Grup 22,232,396×212. Satır ~59. Çıkış 26,804,388×52. |
| 15b-settings-notifications | %9.12 | Mesaj / arama bildirimleri, aktivite durumu. |
| 16-notifications | %6.18 | Duyurular sayfası. |
| 17-play | %16.34 | Sekme çubuğu duruyor (2.9.163). Liste çekmecesi gizli. Companion yok. |
| 18-status | %3.58 | Dört durum + özel + Kullanıcı Ayarları. En düşük fark. |
| 19-calls | %11.68 | Tümü / Cevapsız / Gelen / Giden / Grup. |
| 20-activity | %14.61 | Durum kartı, Arkadaşlar / Geçmiş. |
| 21-shop | %26.59 | Cüzdan 1.250 (mockup 8.325), günlük ödül, davet, kategori çipleri, banner kartları. |
| 21b-shop-items | %28.17 | Aynı mağaza, `.us-main-scroll` kaydırılmış. Çerçeve / banner kartları listede. |

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

## 2.9.167

Arkadaş listesinde uzun ad, `flex-wrap: wrap` yüzünden yönetici rozetini ikinci satıra itiyordu (satır adı 22pt yerine 40pt). Cam kuralı adı ellipsis’li ayrı bir span’a alıyor, rozeti `flex: 0 0 auto` tutuyor. Grup üye satırı ve ayar mini profili aynı sözleşmeye çekildi. Masaüstü / web / Android / iPad seçicileri `html.glass-ui` dışında değişmedi.

## TestFlight kontrol listesi (Demir)

Sürüm **2.9.167**. Yalnız iPhone. App Store’a gönderme.

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
