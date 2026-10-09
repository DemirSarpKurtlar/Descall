# Descall iOS Liquid Glass FINAL — Feature Inventory (2.9.147)

Kaynak: `frontend/src` (AppLayout, NavigationRail, navConfig, ChatPanel, MessageComposer, MessageList, CallOverlay, IncomingCallCard, ServerSidebar, ServersSidebar, UserPanel, ShopPanel, CallsView, ActivityView, ValorantHub, AuthView).  
Kural: **özellik 1:1** — yalnızca görsel (Liquid Glass / iOS 27). Eksik veya ekstra özellik yok.

## Mobil navigasyon (gerçek 2.9.147)

Gerçek native/mobilde `.mobile-tab-bar { display: none }` — birincil navigasyon **NavigationRail** (`navConfig.buildMainNavItems`):

| Sıra | id | İkon | TR |
| --- | --- | --- | --- |
| 1 | chat | MessageSquare | Sohbetler |
| 2 | groups | Users | Gruplar |
| 3 | servers | Server | Sunucular |
| 4 | play | Crosshair | Oyna |
| 5 | friends | UserPlus | Arkadaşlar |
| 6 | activity | Zap | Aktivite |
| 7 | calls | Phone | Aramalar |

Altta avatar → durum picker + Kullanıcı Ayarları. Mockupta floating 7’li glass tab bar aynı sırayı taşır; avatar toolbar’da solda.

## 01 Login (AuthView)

| Öğе | Mockup |
| --- | --- |
| Orijinal Descall logo | ✓ |
| Tagline TR | ✓ |
| Giriş / Kayıt ol sekmeleri | ✓ |
| Apple → Google → veya → form | ✓ sıraya uygun |
| Kullanıcı adı, Şifre, göster | ✓ |
| Şifrenizi mi unuttunuz? | ✓ |
| Giriş | ✓ |
| Hizmet Şartları / Gizlilik | ✓ |

## 02 Sohbetler (DMList)

| Öğе | Mockup |
| --- | --- |
| Avatar toolbar, Ara, Duyurular (badge), Geri Bildirim, Ekle | ✓ |
| Arama alanı | ✓ |
| SOHBETLER satırları (avatar+durum, önizleme, zaman, badge, pin/mute) | ✓ |
| Swipe: Sabitle / Sessiz / Okundu / Kapat | ✓ |
| Yazıyor… | ✓ |
| Floating 7-tab; satırlar camın altına uzar | ✓ |

## 02b Gruplar (GroupList) — eklendi (nav parity)

| Öğе | Mockup |
| --- | --- |
| GRUPLAR listesi, üye stack, badge | ✓ |
| Akşam Ekibi (Valorant Squad yerine) | ✓ |

## 03 DM (ChatPanel + MessageList + MessageComposer)

| Öğе | Mockup |
| --- | --- |
| Geri · avatar+isim+Çevrimiçi · Ara · Pin(badge) · Ses · Video · Engelle | ✓ |
| Discord-style gruplar: avatar 36 + durum, isim, zaman | ✓ |
| Own mesajlar sağda + Demir avatarı + ✓/✓✓ | ✓ |
| Reply quote, Sabitlenmiş, (düzenlendi), tepkiler, sesli mesaj, Yeni mesajlar, yazıyor | ✓ |
| Composer: + · input · Emoji · Mic · Gönder | ✓ |
| Debug “Camın altında…” **yok** | ✓ |

## 04 Mesaj menüsü

| Öğе | Mockup |
| --- | --- |
| Quick: 👍❤️😂😮😢 + daha fazla | ✓ |
| Own: Yanıtla, Sabitle, Düzenle, Daha fazla tepki, Sil | ✓ |
| Forward/Copy **yok** | ✓ |

## 05 Ekle

| Öğе | Mockup |
| --- | --- |
| Görsel Yükle, Dosya Yükle, GIF Gönder | ✓ yalnızca bunlar |

## 06–08 Aramalar

| Öğе | Mockup |
| --- | --- |
| Capsule header (isim · süre · kalite) | ✓ |
| Mute, Deafen, Kamera, Ekranı sun(+kalite), Diğer, Bitir | ✓ mobil 6’lı |
| Speaking ring, name chip, mute/cam-off chip, self PIP | ✓ |
| 07: Akşam Ekibi · 2×2 dolu grid · kontrol bar boşluksuz | ✓ |
| Gelen: Reddet / Kabul Et | ✓ |

## 09–10 Arkadaşlar

| Öğе | Mockup |
| --- | --- |
| Davet kartı (DesCoin), Bekleyen, Çevrimiçi, Çevrimdışı | ✓ |
| Mesaj + Arama; kabul/red | ✓ |
| Modal: Hızlı Ekle / Arkadaş / Grup | ✓ |

## 11–13 Sunucular

| Öğе | Mockup |
| --- | --- |
| Server rail + Yazı/Ses kanalları + ses üyeleri | ✓ |
| #genel Discord-style + kod bloğu + tepkiler + yanıt | ✓ |
| Menü: Roller, Davet, Ayarlar, Topluluk, İkon, Bildirim seviyeleri, Ayrıl | ✓ |
| Akşam Ekibi | ✓ |

## 14 Profil (+ düzenle)

| Öğе | Mockup |
| --- | --- |
| Diğer kullanıcı modalı: banner, frame, unvan, Valorant, bio, Mesaj/Arkadaşlar, Engelle/Şikayet | ✓ |
| 14b: Avatar, Kimlik, Hakkımda, Banner, Özel durum | ✓ |

## 15 Ayarlar (+ Bildirimler)

| Öğе | Mockup |
| --- | --- |
| Hesap / Uygulama / Medya / Kişiselleştirme + Çıkış Yap | ✓ |
| 15b: Mesaj/Arama bildirimleri, iPhone izin, Aktivite durumu toggle’ları | ✓ |

## 16 Duyurular · 17 Oyna · 18 Durum

| Öğе | Mockup |
| --- | --- |
| Duyurular modal | ✓ |
| ValorantHub: back, Companion/LFG, filtreler, lobi Kartıl — **tab bar yok** (play sayfası) | ✓ |
| Durum picker: 4 durum + özel + Kullanıcı Ayarları | ✓ |

## 19 Aramalar (CallsView)

| Öğе | Mockup |
| --- | --- |
| 5 filtre: Tümü / Cevapsız / Gelen / Giden / Grup | ✓ |
| Hızlı ara, Son, geri ara/video, Akşam Ekibi cevapsız | ✓ |

## 20 Aktivite

| Öğе | Mockup |
| --- | --- |
| Durumun, Durum Ayarla, Arkadaşlar/Geçmiş, Şu an aktif | ✓ |

## 21 Mağaza (ShopPanel) + 21b

| Öğе | Mockup |
| --- | --- |
| Header: geri · Mağaza · kapat (X) | ✓ |
| DesCoin pill (coin + bakiye + DESCOİN) | ✓ 8.325 |
| Intro: Aramalarda konuşarak… | ✓ |
| Günlük ödül kartı: Seri + **40 DesCoin al** + hedefler (Konuşma/Mesajlar/Ekran) | ✓ |
| Arkadaş davet et (InviteCard compact): 100/50, link, Linki kopyala + Paylaş | ✓ |
| Kategori chip’leri + **PROFİL BANNERLARI** list cards | ✓ |
| Emerald Forest RARE 280, Aurora Borealis RARE 300 (gradient preview) | ✓ |
| 21b: daha fazla banner + Avatar Çerçeveleri | ✓ |

## Bilinçli olarak eklenmeyenler

- DimaAI / arama kaydı / AI
- Forward / Copy / Konum / Kişi attachment
- “Valorant Squad” mock grup adı → **Akşam Ekibi**
- Sahte “Sen” sekmesi (gerçekte NavigationRail avatarı)

---

## FINAL polish (2026-10-09)

- **21-shop** yeniden yazıldı: gerçek ShopPanel (wallet pill, günlük ödül, InviteCard, banner list cards). **21b-shop-items** eklendi.

- overview.png: 6 kolon temiz grid, Descall logo + başlık, tam downscale tile’lar.
- 07 grup arama yeniden düzenlendi; 06/08 uyumlu.
- 03/12 Discord-style MessageList (avatar, isim, zaman, reply, pin, code, reactions, ticks).
- Tab bar: 7 gerçek nav öğesi, okunabilir etiketler.
- Tüm PNG 1320×2868; v2 dokunulmadı; repo commit/push yok.
