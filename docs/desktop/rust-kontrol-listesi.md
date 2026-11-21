# Rust (Tauri) Windows uygulaması: kontrol listesi

Yeni Rust masaüstü uygulamasını kendi bilgisayarında denerken bu listeyi baştan sona geç.
Her maddeyi aynı şeyi Electron uygulamasında (veya descall.com'da) yaparak karşılaştır.
Bir şey farklıysa ekran görüntüsünü at; hangi maddede olduğunu yazman yeterli.

Bilinen ve şu an düzeltilen sorunlar (tekrar bildirmene gerek yok):

- Descall+ masaüstü özellikleri "Masaüstü / Kilitli" görünüyor (uygulama kendini masaüstü sanmıyor).
- Ayarlar açıkken üst çubuk bulanıklaşıyor.
- Mağaza sayfası boş açılıyor.
- Profil fotoğrafı / banner menüsü, kırpma ve GIF adımı açılıp kayboluyor.
- Oturum süresi dolunca giriş ekranında İngilizce "Authentication failed" yazısı.

## 1. Kurulum, açılış, güncelleme

- [ ] Kurulum dosyası sorunsuz kuruluyor; SmartScreen uyarısında yayıncı adı doğru.
- [ ] İlk açılış süresi Electron'dan kısa (kronometreyle 3 kez dene).
- [ ] Görev yöneticisinde boşta bellek kullanımı Electron'dan az.
- [ ] İkinci kez çift tıklayınca yeni pencere açılmıyor, açık olan öne geliyor.
- [ ] Windows açılışında başlat ayarı açıkken uygulama tepside başlıyor; kapalıyken başlamıyor.
- [ ] Ayarlar > Güncellemeler: "Güncellemeleri denetle" çalışıyor, sürüm numarası doğru.
- [ ] Bir aramadayken güncelleme gelirse yeniden başlatma onay sorusu çıkıyor, aramayı kesmiyor.

## 2. Pencere ve üst çubuk

- [ ] Küçült / büyüt / kapat düğmeleri çalışıyor; kapat tepsiye gizliyor.
- [ ] Üst çubuktan sürükleyerek taşıma, çift tıkla büyütme, Windows 11 Snap düzenleri çalışıyor.
- [ ] Pencere boyutu ve konumu kapatıp açınca korunuyor; ikinci monitörde de.
- [ ] Ayarlar, profil kartı ve diğer pencereler açıkken üst çubuk net kalıyor.
- [ ] Ctrl + fare tekerleği ve Ctrl +/- ile yakınlaştırma çalışıyor, değer korunuyor.
- [ ] Windows'ta "şeffaflık efektleri" kapalıyken cam görünümü düz renge geçiyor.

## 3. Tepsi

- [ ] Tepsi simgesi ve avatar düzgün (yamuk değil); tıklayınca menü açılıyor.
- [ ] Durum değiştirme, sessize alma, sağırlaştırma, çıkış tepsiden çalışıyor.
- [ ] Okunmamış mesajda tepsi simgesinde rozet çıkıyor.

## 4. Giriş ve oturum

- [ ] Electron'dan geçişte oturum açık geliyor, tekrar giriş istemiyor.
- [ ] Çıkış yap → tekrar giriş; Google ve Apple ile giriş.
- [ ] 2FA kodu isteniyor ve kabul ediliyor.
- [ ] Uygulamayı kapatıp açınca oturum açık kalıyor.

## 5. Mesajlaşma

- [ ] DM, grup ve sunucu kanalında mesaj gönderme; Enter ile gönder, Shift+Enter yeni satır.
- [ ] Gönderince sohbet en altta kalıyor, yukarı kaymıyor.
- [ ] Ctrl+V ile ekran görüntüsü yapıştırma; dosya sürükle bırak; dosya indirme (indirilenler klasörüne iniyor).
- [ ] Mesaj ve bağlantı kopyalama (pano) çalışıyor.
- [ ] Emoji, çıkartma, GIF, @etiket önerisi, yanıt, düzenle, sil.
- [ ] Bağlantılar varsayılan tarayıcıda açılıyor, uygulamanın içinde değil.

## 6. Bildirimler

- [ ] Uygulama arka plandayken gelen mesaj bildirimi çıkıyor; tıklayınca doğru sohbet açılıyor.
- [ ] Gelen arama bildiriminde Kabul / Reddet düğmeleri çalışıyor.
- [ ] Rahatsız etme açıkken bildirim gelmiyor.
- [ ] Bildirim sesleri çalıyor.

## 7. Sesli ve görüntülü arama

- [ ] DM araması: mikrofon, hoparlör, kulaklık seçimi; Ayarlar'daki cihaz listesi dolu.
- [ ] Gürültü engelleme açık / kapalı, ses seviyesi ve yankı.
- [ ] Kamera açma, kamera seçimi.
- [ ] Sunucu ses kanalına katılma, kanal değiştirme, ayrılma.
- [ ] Arama sonu DesCoin özeti çıkıyor.
- [ ] Arama sırasında pencereyi küçültünce mini arama kartı çıkıyor.

## 8. Ekran paylaşımı (ayrıntılı test: docs/desktop/ekran-paylasimi-testi.md)

- [ ] Ekran ve pencere listesi canlı önizlemeli geliyor.
- [ ] Bir video açıkken paylaş: karşı taraf sesi duyuyor, Descall'ın kendi sesi (yankı) paylaşıma girmiyor.
- [ ] 1080p60 ve 1440p60 akıcı; HDR monitörde görüntü soluk değil.
- [ ] Paylaşılan pencere kapanınca paylaşım hemen bitiyor; pencereyi başka monitöre taşıyınca devam ediyor.

## 9. Ayarlar, mağaza, Descall+

- [ ] Ayarlar'daki her sekme açılıyor: Hesabım, Profil, Gizlilik, Görünüm, Bildirimler, Dil, Ses ve Görüntü, Ses Efektleri.
- [ ] Profil fotoğrafı ve banner değiştirme (kırpma ve GIF dahil).
- [ ] Mağaza: vitrin, setler, gece pazarı, envanter, satın alma, deneme; DesCoin bakiyesi.
- [ ] Tema değiştirme, mağaza temaları.
- [ ] Descall+ sayfası: özellikler "Masaüstü" kilidi göstermiyor, açılıp kapanabiliyor.

## 10. Descall+ masaüstü özellikleri (her birini aç, dene, kapat)

- [ ] Genel sessize alma kısayolu (başka uygulama öndeyken).
- [ ] Genel bas-konuş: klavye tuşu ve fare yan tuşu, oyun açıkken de.
- [ ] Kişi başı ses kısayolları.
- [ ] Medya tuşları (arama sırasında).
- [ ] Özel kısayollar ve komut merkezi.
- [ ] Hızlı başlatıcı.
- [ ] Ses HUD'u ve oyun HUD'u (tıklama içinden geçiyor).
- [ ] Görüntü içinde görüntü arama penceresi.
- [ ] Widget'lar ve masaüstü kenar çubuğu.
- [ ] Her zaman üstte, pencere saydamlığı, pencere düzenleri, çoklu pencere.
- [ ] Hızlı dosya bırakma.
- [ ] Bildirimden hızlı yanıt.
- [ ] Görev çubuğu: simge rozeti ve küçük resim düğmeleri.
- [ ] Uygulama kilidi (PIN, boşta kilit, Windows kilitlenince kilit).
- [ ] Anlık klip (son N saniyeyi kaydet).
- [ ] Odak modu, otomasyonlar, çalışma alanı profilleri, oturumu geri yükleme.
- [ ] Çoklu hesap.

## 11. Yönetici

- [ ] Admin paneli ayrı pencerede açılıyor (pazarlama sayfası değil).
- [ ] Admin Token sekmesi görünüyor; token oluşturma 2FA istiyor.

## 12. Geri dönüş

- [ ] Bir sorun çıkarsa Electron'a geri dönüş (docs/desktop/gecis-testi.md, "Geri alma" bölümü) çalışıyor ve oturum açık kalıyor.
