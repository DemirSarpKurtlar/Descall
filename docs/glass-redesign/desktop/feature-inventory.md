# Descall Desktop (Electron · Windows) + Web — Liquid Glass Özellik Envanteri

Kaynak: `/workspace/Descall/frontend/src` (git `b37fb36`, 2026-10-11 pull). Etiketler `i18n/locales/tr.js` üzerinden birebir Türkçe.
Kural: **özellik 1:1** — mockuplar yalnızca görsel katmanı değiştirir. Hariç tutulanlar: arama kaydı, DimaAI, Valorant Companion (gizli).
Her satır: öğe → kaynak dosya → mockup karesi.

## 0 · Uygulama kabuğu (AppLayout + TitleBar + NavigationRail)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Electron başlık çubuğu: Descall logosu + “Descall”, Küçült / Büyüt (Geri yükle) / Kapat | `TitleBar.jsx` (yalnızca Electron) | tüm masaüstü kareleri |
| Grid: ray (`--nav-rail-width`) · liste kenar çubuğu (`--sidebar-width`) · ana alan; Play’de liste sütunu yok | `app-layout.css` | tümü |
| Ray üst: Descall logosu (admin ise Yönetici paneli düğmesi) | `NavigationRail.jsx` | tümü |
| Ray ana öğeler (sıra): Sohbetler · Gruplar · Sunucular · Oyna · Arkadaşlar · Aktivite · Aramalar (+ okunmamış pip) | `navConfig.buildMainNavItems` | tümü |
| Ray araçlar: Yeni Ekle (+), Kullanıcı Ayarları (dişli) | `buildToolNavItems` | tümü |
| Ray alt: avatar + durum noktası → Durum seçici | `NavigationRail.jsx` | 19 |
| Ray tooltip (hover) | `RailButton` | 02, 06 |
| Web: “Mesajlar, aramalar ve bahsetmeler için bildirimlere izin ver” banner (İzin ver / kapat) | `AppLayout.jsx` | 21a |
| Geri bildirim nudge banner, Quick Feedback modal (Öneri/Hata Bildirimi/Övgü) | `FeedbackNudgeBanner`, `QuickFeedbackModal` | (envanterde; kare dışı) |

## 01 · Giriş / Kayıt (AuthView)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Orijinal Descall logosu, “Descall”, “Arkadaşlarınla ses, görüntü ve mesajlaşmayla bağlan” | `AuthView` | 01 |
| Sekmeler: Giriş · Kayıt ol | `auth-tabs` | 01 |
| Apple ile giriş → **yalnızca iOS** (`isNativeIOS`) — masaüstü/web’de YOK | `AppleSignInButton` | — |
| Google ile devam et (GSI “continue_with”) — masaüstü/web’de VAR | `GoogleSignInButton` | 01 |
| “veya” ayırıcı | | 01 |
| Kullanıcı adı, Şifre + Şifreyi göster/gizle | | 01 |
| Giriş: “Şifrenizi mi unuttunuz?” | | 01 |
| Kayıt: Doğum tarihi (Gün/Ay/Yıl), E-posta (opsiyonel) + açıklama, Şartlar onay kutusu (Hizmet Şartları ve Gizlilik Politikası + sıfır tolerans notu), Hesap Oluştur | `BirthDateInput`, `TermsConsent` | 01 (sağ panel: Kayıt) |
| Altbilgi: “Devam ederek Hizmet Şartlarımızı kabul etmiş olursunuz”, Hizmet Şartları · Gizlilik Politikası | | 01 |

## 02 · DM listesi + açık DM (ServerSidebar DMList + ChatPanel)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Başlık “Sohbetler”; butonlar: Ara · Duyurular (badge) · Geri Bildirim Gönder · Ekle (+) | `ServerSidebar` header | 02 |
| Arama alanı “Ara” | `sidebar-search` | 02 |
| Bölüm “SOHBETLER” + daralt chevron | `DMList` | 02 |
| Satır: avatar 40 + durum, isim, pin/sessiz bayrakları, zaman, önizleme (yazıyor…), okunmamış badge, hover’da ⋯ (Daha fazla) | `DmRowContent`, `ConvMoreButton` | 02, 03 |
| DM sağ tık / ⋯ menüsü: Sabitle(Kaldır) · Sessiz(Sesi Aç) · Okundu/Okunmadı işaretle · — · Engelle · Şikayet et · Kapat | `DmContextMenu` | 03 |
| Sohbet başlığı: avatar+durum (Profili gör), isim + admin rozeti, alt satır durum | `ChatPanel` header | 02 |
| Başlık aksiyonları (DM): Ara · Sabitlenmiş mesajlar (badge) · Sesli Arama · Görüntülü Arama · Engelle | | 02 |
| Mesaj araması çubuğu “Mesajlarda ara...” | `chat-search-bar` | (envanter) |
| MessageList: gün ayırıcı (Bugün/Dün), Yeni mesajlar, yanıt alıntısı, Sabitlendi rozeti, (düzenlendi), tepkiler, görsel/GIF, dosya, sesli mesaj, arama özeti balonu (Cevapsız/Sesli arama…), iletim (Gönderildi/İletildi), yazıyor göstergesi | `MessageList`, `CallSummaryBubble`, `TypingIndicator` | 02, 03, 05 |
| Composer: + (Ek Ekle) · metin “Mesaj…” · Emoji · Sesli Mesaj · Gönder | `MessageComposer` | 02 |

## 03 · Mesaj hover araç çubuğu + menü + yanıt/düzenle

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Hover bar: hızlı tepkiler 👍 ❤️ 😂 😮 😢 · Daha fazla tepki · Yanıtla · Sabitle · Düzenle (kendi) · Sil (yetki) · Şikayet et (başkası) | `message-hover-bar` | 03 |
| Daha fazla tepki paneli “Tepki ver”: 👍❤️😂😮😢🎉🔥👏🤔👎 | `message-inline-picker` | 03 |
| Mesajlarda **sağ tık menüsü yok** (yalnızca hover bar); sağ tık menüsü DM/grup/sunucu/kanal satırlarında | `ContextMenu.parity.selftest` | 03 (DM satırı menüsü) |
| Composer yanıt şeridi: “Yanıtlanıyor <isim>” + alıntı + Yanıtı iptal et | `composer-reply-bar` | 03 |
| Composer düzenleme şeridi: “Mesajı düzenle” + metin + Düzenlemeyi iptal et; gönder ikonu ✓ (Kaydet) | `composer-edit-bar` | 03 |
| Satır içi düzenleme (desktop): giriş + Kaydet / İptal | `msg-edit-box` | 03 |
| Sil onayı: “Mesajı sil — Bu mesaj herkes için silinecek…” | `MessageList` | 20 |

## 04 · Ek / Emoji / GIF

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Ek menüsü: Görsel Yükle · Dosya Yükle · GIF Gönder (yalnızca bu üçü) | `attachment-menu` | 04 |
| Emoji seçici: başlık “Emojiler” + kapat; kategoriler Suratlar · İşaretler · Kalpler | `emoji-picker` | 04 |
| GIF seçici: “GIF seç”, kapat, “GIF ara…”, Trendler, ızgara, “GIPHY tarafından desteklenir” | `GiphyPicker` | 04 |
| Slash komut menüsü (grup/sunucu): “Komutlar” listesi | `slash-command-menu` | 05 |
| Ek önizleme şeridi (Eki kaldır) | `composer-attach-preview` | (envanter) |

## 05 · Grup sohbeti

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Liste “Gruplar” + “GRUPLAR” bölümü, grup satırı (ikon/baş harf, isim, önizleme, zaman, badge, ⋯) | `GroupList` | 05 |
| Grup menüsü: İnsanları Davet Et · Üye Ekle · Grubu Yeniden Adlandır · Gruptan Ayrıl | `GroupContextMenu` | (envanter) |
| Başlık: grup ikonu, ad, “{n} üye”; aksiyonlar: Ara · Üyeler · Sabitlenmiş · Sesli · Görüntülü | `ChatPanel` | 05 |
| Aktif arama banner’ı: Ses Odası · {n} katılımcı katıldı · {isim} başlattı · Katıl · Kapat | `ActiveCallBanner` | 05 |
| Üyeler paneli: “Üyeler {n}” + kapat, Çevrimiçi — n / Çevrimdışı — n, Sahip rozeti, durum etiketi | `members-panel` | 05 |
| Slash komutları (ör. /poll, /help) | `slashCommands.js` | 05 |

## 06 · Sunucu görünümü (ServersSidebar + ChatPanel + ServerMembersPanel)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Sunucu başlığı: Sunuculara dön (←), ad, “{n} üye · Sahip”, Kanal oluştur (+), Sunucu menüsü (⋯) | `server-shell-header` | 06 |
| Kategori satırı (aç/kapa) + hover: Kanal oluştur · Kanal erişimi · Kategoriyi düzenle · Kategoriyi sil | `server-channel-cat` | 06 |
| Kanal satırı: # / ses / sahne ikonu, NSFW/Duyuru etiketleri, sessiz ikonu, ses sayacı, okunmamış badge, ⋯ Kanal ayarları (Kanalı sessize al · Kanal erişimi · Kanalı düzenle · Kanalı sil) | `ChannelRow` | 06 |
| Ses kanalı üyeleri: avatar, isim, Konuşmacı/İstendi/Öncelik rozetleri, Sağırlaştırıldı/Sessiz ikonları | `ServersSidebar` | 06 |
| Metin kanalı başlığı: #kanal, alt satır; aksiyonlar: Ara · Üyeler · Sabitlenmiş | `ChatPanel` | 06 |
| Composer “#genel’e mesaj yaz…” | | 06 |
| Sunucu üyeleri paneli: Üyeler + kapat, Üye ara, hoist rol bölümleri (rol rengi), Çevrimiçi/Çevrimdışı, Sahip, Timeout rozeti | `ServerMembersPanel` | 06 |
| Üye menüsü: Profili gör · Mesaj · Kullanıcı adını kopyala · Engelle · Şikayet et · Takma adı değiştir · Roller · Timeout · At · Yasakla | `ServerMembersPanel` | (envanter) |
| Sunucu rayı (ikon sütunu) | **Not**: kodda yalnızca iOS glass’ta (`g-server-rail`); masaüstü şu an ← ile listeye döner. Kullanıcı brief’i “servers rail” istediği için iOS glass’taki ray taşındı, ← korundu. | 06, 07, 09 |

## 07 · Sunucu menüsü / ayarlar

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Menü: Kanal oluştur · Kategori oluştur · Roller · Kişi davet et · Sunucu Ayarları · Topluluk ve Keşif · Sunucu ikonunu değiştir | `ServerMenuFrame` | 07 |
| “BİLDİRİM AYARLARI”: Tüm mesajlar · Sadece @bahsetmeler · Hiçbiri (✓ aktif) | `NOTIF_LEVELS` | 07 |
| Yasaklar · Denetim kaydı · Sunucuyu sil (sahip) / Sunucudan ayrıl | | 07 |
| Sunucu Ayarları modalı: “Sunucu adı, açıklama, simge ve banner’ı güncelle.”, Banner (Banner yükle / değiştir / kaldır), Simge (Simgeyi değiştir), Sunucu adı, Açıklama, Sistem kanalları: AFK ses kanalı, AFK zaman aşımı (saniye), Sistem kanalı, Karşılama kanalı; İptal · Değişiklikleri Kaydet | `ServerSettingsModal` | 07 |

## 08 · 1:1 arama (CallOverlay, DM)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Üst bar: isim, alt satır (süre · Sesli/Görüntülü arama · Sunuyor), bağlantı kalitesi HUD (Mükemmel/İyi/Orta/Zayıf) + detay (Gecikme, Titreşim, Paket kaybı, Bit hızı), Katılımcıları göster, Sohbet, Küçült | `CallOverlay`, `CallQualityHud` | 08 |
| Kutucuklar: video, konuşma halkası, isim etiketi, Sessiz/Sağırlaştırıldı/Kamera kapalı rozetleri, kendi önizleme (Sen) | | 08 |
| Dock (geniş pencere): Mikrofon (+ Ses cihazları ▾) · Sağırlaştır · Kamera (+ ▾) · Ekranı sun (+ Ekran kalitesi) · El kaldır · Ses cihazları · Diğer seçenekler · Aramayı bitir | | 08 |
| Diğer seçenekler menüsü: Sohbet · El kaldır · Ses cihazları · Ekran kalitesi · Kamerayı aç/kapat · Mikrofonu kapat · Katılımcıları göster · Arama bilgisini kopyala · Aramadan ayrıl | | 08 |

## 09 · Grup / sunucu ses araması

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Sunucu ses paneli başlığı: kanal adı, “Ses kanalı”, “Seste {n} kişi”, Bağlandı | `ServerVoicePanel` | 09 |
| Kutucuk ızgarası, Konuşuyor halkası, ekran paylaşımı sahnesi (“{isim} Ekranı”, büyütmek için tıkla, ses seviyesi) | | 09 |
| Dock: Mikrofon (+ Ses cihazları) · Sağırlaştır · Yapay zekâ gürültü engelleme rozeti · Kamera (+) · Ekranı Paylaş · Ayrıl | | 09 |
| Kanal listesinde ses üyeleri | | 09 |

## 10 · Gelen arama

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Kart: avatar, “{isim} arıyor”, Sesli/Görüntülü/Grup araması, Reddet · Kabul Et | `IncomingCallCard` | 10 |
| Grup araması gelen modal (Grup araması) | `GroupCallIncomingModal` | 10 (2. kart) |

## 11 · Arkadaşlar

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Başlık “Arkadaşlar”: Ara · Duyurular · Geri Bildirim · **Davet linkini kopyala** · Ekle | `ServerSidebar` | 11 |
| “ARKADAŞLAR” bölümü: bekleyen sayısı badge, Hızlı Ekle (✨), chevron | `FriendsList` | 11 |
| Davet kartı (compact): Arkadaş davet et · Sen 100 · onlar 50 DesCoin · Kopyala | `InviteCard` | 11 |
| Bekleyen — n (Kabul Et / Reddet), Çevrimiçi — n, Çevrimdışı — n, özel durum | `FriendsList` | 11 |
| **“Tümü / Çevrimiçi / Bekleyen / Engellenen” sekmeleri kodda YOK** → eklenmedi. Engellenenler: Ayarlar › Güvenlik › Engellenen kullanıcılar | | 11, 13 |
| Yeni Oluştur modalı: Hızlı Ekle · Arkadaş Ekle · Grup Oluştur; Hızlı Ekle önerileri (ortak arkadaş/grup, “Senin için önerildi”, Gönderildi); Arkadaş: “Eklemek için kullanıcı adı gir” + Arkadaşlık İsteği Gönder | `add-modal` | 11 |
| Ana alan boş durumu: “Arkadaşlarını bul” + Arkadaş ekle / Sohbetlere göz at | `ChatPanel` emptyCopy | (modal altında) |

## 12 · Profil

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Hover kartı (mesaj avatarı): banner, avatar, isim + rozet + admin, @kullanıcı, unvan, durum, özel durum, Valorant rozeti, biyografi, Son görülme | `UserHoverCard` | 12 |
| Profil modalı: banner/arkaplan, kapat, avatar+durum, isim, rozet, unvan, admin, durum satırı, Valorant rozeti, biyografi, Mesaj Gönder, Arkadaş Ekle/Arkadaşlar/Gönderildi, Üyelik Tarihi, Ortak Arkadaşlar, Özel durum, Engelle, Şikayet et | `UserProfileModal` | 12 |
| Profil düzenle (Ayarlar › Profil): “Başkalarının Descall'da sizi nasıl gördüğünü güncelleyin.”, Banner (ekle/değiştir/kaldır), Avatar (Fotoğraf yükle/değiştir/kaldır), Kimlik: Görünen ad, Hakkımda/Biyografi, Özel durum (emoji + metin), kayıt çubuğu “Kaydedilmemiş değişiklikler var” İptal · Kaydet | `UserPanel` profile | 12 |

## 13 · Kullanıcı Ayarları (UserPanel)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Kenar: “Kullanıcı Ayarları / Descall hesabını yönet”, Kapat, mini profil (+ ◈ DesCoin) | `us-sidebar` | 13a–d |
| Gruplar: HESAP (Hesabım, Profil, Güvenlik) · UYGULAMA (Görünüm, Bildirimler, Dil [Türkçe]) · MEDYA (Ses ve Görüntü, Ses Efektleri) · KİŞİSELLEŞTİRME (Mağaza); Çıkış Yap | `SETTINGS_GROUPS` | 13a–d |
| Hesabım: hero (banner, avatar değiştir, Profili düzenle, isim, @, unvan, özel durum, Valorant), Valorant bağlama kartı (Riot ID, Bölge, Bağla ve rank getir), Hesap ayrıntıları (Kullanıcı adı + Değiştir, E-posta, Kullanıcı kimliği + Kimliği kopyala, Durum), Çıkış Yap | | 13a |
| Görünüm: Tema (Koyu, Açık, sahip olunan premium temalar / Mağazadan daha fazlasını al), Vurgu rengi (7), Sohbet yazı boyutu + örnek, Yoğunluk (Kompakt/Rahat/Geniş), Mesaj balonları (Modern/Klasik/Sade) + önizleme | | 13b |
| Bildirimler: Mesaj bildirimleri, Arama bildirimleri, Aktivite durumu (Oyun, Uygulama, Tarayıcı aktivitesi, Descall kullanım süresi) | | 13c |
| Ses ve Görüntü: Mikrofon, Konuşmacı, Kamera seçimi, Cihazları yenile, Gürültü engelleme (Yapay zekâ gürültü engelleme, Aktif motor: Hazır), Mikrofon testi | | 13d |
| Güvenlik: E-posta doğrulama, Şifreyi sıfırla, Two-Factor Authentication, Aktif oturumlar (Bu cihaz, Oturumu sonlandır, Diğer tüm oturumları kapat), Engellenen kullanıcılar, Tehlikeli alan · Hesabı sil | | 13c (sağ küçük önizleme yok; envanter) |
| Ses Efektleri: Mesaj sesleri, Arama sesleri · Dil: Uygulama dili (Türkçe / İngilizce) | | (envanter) |

## 14 · Bildirimler / Duyurular

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Duyurular modalı: başlık, liste (başlık, metin, “{yazar} tarafından”, tarih), boş “Duyuru yok” | `AnnouncementsModal` | 14 |
| Toast yığını (sağ alt): çevrimiçi arkadaş toast’u (“şimdi çevrimiçi”), başarı/hata/bilgi | `ToastContext` | 14, 20 |
| Masaüstü güncelleme toast’u: “Masaüstü güncelleme”, indiriliyor %, Şimdi yeniden başlat | `ElectronUpdateToast` | 14 |

## 15 · Oyna / LFG (ValorantHub → LfgWorkspace; Companion gizli)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Sol: Descall’a Dön (←), “VALORANT / Takım bul”, + Oluştur | `LfgWorkspace` | 15 |
| Filtreler: Tüm modlar · Tüm bölgeler · Rankım (filtre) · Mikrofon zorunlu | | 15 |
| Lobi kartı: mod, slot (n/5), rank aralığı, bölge, Mikrofon / Kod ayarlı etiketleri, not, host, Katıl | | 15 |
| Detay: “Lobi · açık”, slot, not, Oyuncular, Parti kodu (Görmek için tıkla / Kopyala / Düzenle, kilitli metin), Rankın, Lobiye katıl / Sese katıl / Sohbeti aç / Ayrıl (Lobiyi kapat) | `LobbyDetail`, `PartyCodeReveal` | 15 |
| Companion sekmesi → gizli (brief); sekme çubuğu da gizlenir (tek sekme) | | — |

## 16 · Aktivite

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Kenar: Aktivite / Varlığın ve geçmişin, Ara · Geri Bildirim · Arkadaş ekle; Durumun kartı (Arkadaşlara görünür, Durum Ayarla); Arkadaşlar/Geçmiş; “n çevrimiçi”, Şu an aktif — n, Çevrimiçi — n | `ActivitySidebar` | 16 |
| Ana: başlık + gizlilik seçici (Arkadaşlara görünür / Sadece ben / Gizli) + Durum Ayarla; Şu an aktif kartı (Başlangıç, Manuel durumu temizle); Geçmiş / Arkadaşlar sekmeleri | `ActivityView` | 16 |
| Özel durum ayarla modalı: öneriler, Temizlenme (1 Saat / 4 Saat / Temizlenene kadar) | `ManualStatusModal` | (envanter) |

## 17 · Arama geçmişi

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Kenar (masaüstü): Aramalar + ARKADAŞLAR listesi | `ServerSidebar` calls | 17 |
| Ana: “Aramalar” + açıklama + Yenile; Hızlı ara (n çevrimiçi; sohbeti aç, Sesli/Görüntülü); Son (n cevapsız), filtreler Tümü/Cevapsız/Gelen/Giden/Grup, “Arama ara”, satırlar (Geri ara / Görüntülü arama, grup için Grup sesli/görüntülü araması başlat) | `CallsView` | 17 |

## 18 · Mağaza (Ayarlar › Mağaza = ShopPanel)

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Cüzdan pill: coin + bakiye + DesCoin | `shop-wallet-bar` | 18 |
| Tanıtım metni; Günlük ödül (Seri, Alındı, {n} DesCoin al, hedefler Konuşma/Mesaj/Ekran paylaşımı); Arkadaş davet et kartı | `ShopPanel`, `InviteCard` | 18 |
| Kategoriler (14): Bannerlar, Çerçeveler, Arkaplanlar, Temalar, Rozetler, Unvanlar, İsim Efektleri, Avatar Efektleri, Balonlar, Durum, Auralar, Yazma, Tepkiler, Arama Kaplamaları | `TABS` | 18 |
| Ürün kartı: önizleme, Yeni, nadirlik, ad, açıklama, fiyat / Sahip Olundu, Uygula/Kaldır/Satın Al, “Henüz yeterli DesCoin yok” | | 18 |

## 19 · Durum seçici

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| “Durum ayarla”, Çevrimiçi · Boşta · Rahatsız Etme · Görünmez | `NavigationRail` statusMenu | 19 |
| Özel durum: emoji düğmesi (💬😀🎮🎵💼📚☕🌙), “Aklınızdan neler geçiyor?”, Kaydet · İptal | | 19 |
| Kullanıcı Ayarları kısayolu (admin: Yönetici paneli yalnızca glass’ta) | | 19 |

## 20 · Onay diyaloğu + toast

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Masaüstü onay: “Bu sohbeti kapatmak istiyor musun?” / Mesajı sil / Gruptan ayrıl (İptal + tehlikeli eylem) | `ConfirmDialog`, `MessageList` | 20 |
| Toast tipleri: success / error / info / presence | `ToastContext` | 20 |

## 21 · Web + dar pencere

| Öğe | Kaynak | Kare |
| --- | --- | --- |
| Web: TitleBar yok (tarayıcı çerçevesi), bildirim izin banner’ı (“Mesaj, arama ve mention bildirimleri almak için izin verin” · İzin ver · ✕) | `TitleBar` (`!isElectron → null`) | 21a |
| 769–1024px: ray 68px, kenar çubuğu 240px, başlık butonları 28px | `mobile.css` tablet bloğu | 21b |
| Dar pencerede çağrı dock’u: El kaldır ve Ses cihazları “Diğer” menüsüne taşınır | `CallOverlay narrowViewport` | (not) |

## Bilinçli olarak eklenmeyenler
- Arama kaydı, DimaAI, AI özetleri · Valorant Companion (gizli)
- Mesaj iletme / kopyala menüsü (kodda yok) · Konum/Kişi eki
- Arkadaşlar sekme filtreleri (Tümü/Çevrimiçi/Bekleyen/Engellenen) — kodda yok
- Apple ile giriş (masaüstü/web’de render edilmiyor)
- Demo ismi “Valorant Squad” kullanılmadı → **Akşam Ekibi**

## Kare eşlemesi (render edilen 37 kare) ve parite kararları — rev 2

| Kare | İçerik |
| --- | --- |
| 01-login · 01b-register | Giriş / Kayıt (Google ile devam et var; Apple yok) |
| 02-dm | DM listesi + açık DM, hover ⋯, yazıyor, sesli mesaj, arama özeti, sabit mesaj |
| 03a-hover-reply · 03b-context-edit | Mesaj hover araç çubuğu + tepki seçici + yanıt şeridi · DM satırı sağ tık menüsü + düzenleme şeridi |
| 04a-attach · 04b-emoji · 04c-gif | Ek menüsü (Görsel Yükle / Dosya Yükle / GIF Gönder) · emoji seçici · GIPHY seçici |
| 05-group | Grup sohbeti, üyeler paneli, ActiveCallBanner, slash komut menüsü |
| 06-server · 07a-server-menu · 07b-server-settings | Sunucu görünümü (sunucu sütunu, kanallar, ses üyeleri, üye listesi) · sunucu menüsü · Sunucu Ayarları modalı |
| 08-call-1on1 · 09-server-voice · 09b-group-call | 1:1 görüntülü arama (+ kalite detayı, Diğer seçenekler) · sunucu ses kanalı (ekran paylaşımı) · grup araması |
| 10-incoming-call · 10b-incoming-group | Gelen arama kartı (DM görüntülü / grup sesli) |
| 11-friends · 11b-add-friend · 11c-quick-add | Arkadaşlar listesi (Bekleyen/Çevrimiçi/Çevrimdışı) + boş durum · Yeni Oluştur › Arkadaş Ekle · Hızlı Ekle |
| 12a-hover-card · 12b-profile · 12c-edit-profile | Kullanıcı hover kartı · profil modalı · Ayarlar › Profil (kaydedilmemiş değişiklik çubuğu) |
| 13a/b/c/d-settings-* | Hesabım · Görünüm · Bildirimler (+ Ses Efektleri) · Ses ve Görüntü |
| 14-announcements · 14b-toasts | Duyurular modalı · toast yığını (çevrimiçi, başarı, masaüstü güncelleme %) |
| 15-play-lfg · 16-activity · 17-calls · 18-shop | Oyna/LFG · Aktivite · Aramalar · Mağaza (Ayarlar › Mağaza) |
| 19-status-picker · 20-confirm-toasts | Durum seçici + özel durum · “Bu sohbeti kapatmak istiyor musun?” + toast türleri |
| 21a-web-browser · 21b-narrow-1024 | Web (tarayıcı çerçevesi, TitleBar yok, bildirim izni banner’ı) · 1024 px dar pencere |

Kararlar / belirsizlikler:
- **Arkadaş sekmeleri (Tümü/Çevrimiçi/Bekleyen/Engellenen) kodda yok** → eklenmedi; liste bölümleri Bekleyen / Çevrimiçi / Çevrimdışı. Engellenenler yalnızca Ayarlar › Güvenlik › Engellenen kullanıcılar (karesi yok, envanterde).
- **Profil düzenle** ayrı bir “önizleme” paneli içermiyor; kart (banner + avatar + isim + durum + Hakkımda) zaten canlı önizleme. Mockup buna göre.
- **Mağaza nadirlik etiketi** kodda çevrilmeden ham değer (`rare`, `epic`, `legendary`) olarak basılıyor → mockupta da öyle (i18n açığı).
- **Slash komutları**: `/cf` ve `/credits` açıklamalarının Türkçesi `tr.js`’de yok; mockupta makul Türkçe yazıldı (i18n açığı, uygulamada İngilizce görünür).
- **Tema adları** gerçek katalogdan: Lagoon, Emberfall, Borealis, Iriscape (`glassThemeScenes.js`).
- **Sunucu ray’i**: masaüstünde Sunucular görünümünde sunucu ikonları sütunu `ServersSidebar`’dan; kanal listesiyle tek cam panelde birleştirildi (görsel çeviri, yeni özellik değil).
- **Dar pencere**: 1024 px’te kenar çubuğu başlığındaki düğme grubu arama alanının yanına taşındı (başlık kırpılmasın diye; düğmeler aynı).
- Video karelerindeki kişiler gerçek fotoğraf değil, stilize silüet (telif/gizlilik).
- Gelen arama kartı uygulamada pencere üst-ortasında; Electron’da başlık çubuğunun altında konumlandırıldı.
