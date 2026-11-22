# Rust (Tauri) uygulaması: 10 ajanlık gece çalışması raporu (21-22 Kasım 2026)

PR: DemirSarpKurtlar/Descall#433

## Özet

- Bildirdiğin hataların hepsinin kök nedeni bulundu ve düzeltildi:
  - pencere düğmeleri,
  - Descall+ "Kilitli",
  - bulanık üst çubuk,
  - boş mağaza,
  - tarayıcı menüsü,
  - admin paneli,
  - kaybolan profil menüsü,
  - İngilizce oturum hatası.
- Ajanlar bunların dışında yaklaşık 60 açık daha buldu. En önemlileri:
  - sürükle-bırak hiç çalışmıyordu;
  - Descall+ pencereleri hiç açılmıyordu;
  - bildirim pencereleri sistem komutlarını çağırabiliyordu;
  - her güncelleme "Windows ile başlat"ı kapatıyordu;
  - Sentry'ye hiç hata raporu gelmiyordu;
  - bildirimler donma ve odak çalma yapıyordu.
- Rust kodu ilk kez hep birlikte derlendi: hatasız ve uyarısız. Testlerin hepsi geçiyor.
- Gerçek Windows'ta denenmedi. Aşağıdaki "Senin denemen gerekenler" bölümü bunun için.

## Alan alan

### 1. Senin bildirdiklerin
| Sorun | Neden | Durum |
|---|---|---|
| Pencere düğmeleri çalışmıyor | WebView2, CSS sürükleme alanını gerçek başlık çubuğu yapıp tıklamaları yutuyordu | Düzeltildi. Admin, istatistik, uygulama kilidi, HUD ve açılır pencere çubuklarında da düzeltildi |
| Descall+ "Masaüstü / Kilitli" | Descall+ köprüsü, Tauri'nin altyapısı yüklenmeden çalışıp çıkıyordu | Düzeltildi. Ayrıca açılıştaki bir yarış yüzünden kısayollar ölü kalıyordu, o da düzeldi |
| Üst çubuk bulanık | Modal arka planının bulanıklığı üst çubuğu da kapsıyordu | Düzeltildi. Sahne temalarında modalın üst çubuğu örtmesi de düzeldi |
| Mağaza boş | Pencere geri gelince uygulama kendini "arka planda" sanıyor, kart animasyonları görünmez ilk karede donuyordu | Düzeltildi (test: 0/9 kart → 9/9 kart) |
| Profil fotoğrafı / banner / kırpma / GIF kayboluyor | Mağaza ile aynı neden | Düzeltildi. Menünün dışına tıklayınca Ayarlar'ın kapanması da düzeldi |
| Sağ tık tarayıcı menüsü | WebView2'nin kendi menüsü açıktı | Electron gibi oldu: seçimde Kopyala, yazı alanında düzenleme menüsü, başka yerde menü yok. Ctrl+R, F5, Alt+Sol ok kapalı |
| Admin paneli açılmıyor | Pencere açılıyordu ama uygulama açılmadı sanıyordu | Düzeltildi. Panel ekrana sığıyor, korumaları var |
| İngilizce "Authentication failed" | Sunucunun hata metni olduğu gibi gösteriliyordu | Türkçe ve 6 dilde anlaşılır mesaj |

### 2. Güvenlik
- **Bildirim pencerelerinin yetkisi:** bildirim, tepsi ve HUD gibi küçük pencereler ekran paylaşımı başlatma, panoyu okuma ve işlemleri tarama gibi her komutu çağırabiliyordu. Artık her pencere yalnızca kendi işini yapabiliyor.
- **Oturum bilgisi:** artık sayfada açıkta durmuyor.
- **Hata metinleri:** bilgisayarındaki dosya yollarını içermiyor.
- **Güvenlik politikası:** gereksiz bir istisna ("unsafe-eval") kaldırıldı.
- **İndirmeler:** artık birbirinin üzerine yazmıyor.

### 3. Güncelleme, kurulum, çökme
- **Windows ile başlat:** her güncelleme bu ayarı sessizce kapatıyordu. Düzeltildi.
- **Otomatik başlatma:** hiç açılmıyordu. Artık Electron gibi ilk açılışta bir kez açılıyor ve senin tercihine saygı duyuyor.
- **Sentry:** Rust uygulamasında tamamen kapalıydı, uygulamanın kendi çökmeleri de hiç raporlanmıyordu. İkisi de düzeltildi.
- **WebView2 çökmesi:** ölü bir sayfa kalıyordu. Artık sayfa kendini yeniliyor.
- **`descall://` bağlantıları:** hiç çalışmıyordu. Artık açılıyor, telefondakiyle aynı kurallarla.
- **Ayarlar'da yeni "Masaüstü uygulaması" sekmesi:** sürüm, güncelleme durumu ve "Güncellemeleri denetle".

### 4. Bildirimler ve tepsi
- **Bildirim ve arama kartı:** uygulamayı dondurabiliyor ve odağı çalıyordu. Tam ekran oyunu bile küçültebiliyordu. Düzeltildi.
- **Uygulama kilidi:** kilitliyken bildirimde gönderen adı ve mesaj görünüyordu. Artık görünmüyor.
- **Tepsi ve görev çubuğu:**
  - Tepsi simgesi artık net.
  - Görev çubuğu düğmeleri tepsiden dönünce kaybolmuyor.
  - Farklı ölçekli ikinci monitörde kart doğru yerde çıkıyor.
- **Yeni:**
  - Tepsiye ilk kapatmada "arka planda çalışıyor" uyarısı.
  - Mesaj gelince görev çubuğunun yanıp sönmesi.
  - Tepsi simgesinde okunmamış noktası.

### 5. Descall+ masaüstü özellikleri
- **Açılmayan pencereler:** HUD, widget, hızlı bırakma, açılır pencere ve hızlı başlatıcı büyük olasılıkla hiç açılmıyordu. Düzeltildi.
- **Saydamlık:** küçültüp açınca sıfırlanıyordu. Düzeltildi.
- **Widget'lar:** sonsuz bir kaydetme döngüsü vardı. Düzeltildi.
- **HUD:** oyunun odağını çalıyordu. Düzeltildi.
- **Çıkış yapınca:** Descall+ kısayolları çalışmaya devam ediyordu. Artık duruyor.
- **Karar senin:** komut merkezi ile hızlı başlatıcının varsayılan kısayolu aynı (Ctrl+Shift+K). Birinin değişmesi gerekiyor.

### 6. Pencere ve tarayıcı davranışı
- Sürükle-bırak bütün uygulamada çalışmıyordu: sohbete dosya, sıralama, hızlı bırakma. Düzeltildi.
- Ana penceredeki bildirim tıklaması açılır pencerelerde de çalışıyordu. Her pencere artık yalnızca kendi olaylarını alıyor.
- Karışık ölçekli iki monitörde pencere yanlış ekranda açılıyordu. Düzeltildi.
- Başlık çubuğuna sağ tıklayınca Windows'un pencere menüsü açılıyor.
- F11 ile büyütme çalışıyor.
- Otomatik doldurma kapalı.
- İndirmeler İndirilenler klasörüne gidiyor ve dosya gösteriliyor.
- Tarayıcı izin pencereleri artık çıkmıyor.

### 7. Arama ve ekran paylaşımı
- Kabul ve Reddet sonrası donma ihtimali giderildi.
- Ekran paylaşımı seçicisi düzeldi; kapanan bir pencere seçilemiyor.
- Paylaşım istatistiği artık gereksiz yere tekrar tekrar sorgulanmıyor.
- Gürültü engelleme güvenlik politikası altında yükleniyor.

## Senin denemen gerekenler (yeni sürüm kurulunca)

1. **Pencere:**
   - Küçült, büyüt ve kapat düğmeleri.
   - Üst çubuktan sürükleme ve çift tıklama.
   - Başlık çubuğuna sağ tıklama (Windows menüsü açılmalı).
   - F11.
2. **Arka plan durumu:** Win+D ile küçültüp geri getir, sonra tepsiden aç. Mağaza dolu açılmalı, profil fotoğrafı menüsü kaybolmamalı.
3. **Sürükle-bırak:** Gezgin'den sohbete dosya sürükle.
4. **Descall+:** sayfada kilit görünmemeli. Ctrl+Alt+M genel sessize alma, bas-konuş, HUD ve widget'ları dene.
5. **Bildirimler:** Descall küçükken DM ve arama al. Uygulama donmamalı ve odak kaçmamalı; Kabul ve Reddet çalışmalı.
6. **Sağ tık:** boş alanda menü çıkmamalı, seçili metinde yalnızca Kopyala, mesaj kutusunda düzenleme menüsü.
7. **Admin paneli:** açılmalı, düğmeleri çalışmalı.
8. **Ayarlar > Masaüstü uygulaması:** sürüm doğru görünmeli, "Güncellemeleri denetle" çalışmalı.
9. **Windows ile başlat:**
   1. Görev Yöneticisi > Başlangıç'ta Descall açık olmalı.
   2. Bir güncelleme sonrası ayar aynı kalmalı.
10. **`descall://`:** Win+R ile `descall://dm/<kullanıcı>` yaz; o sohbet açılmalı.
11. **Sorun olursa log:** `%LOCALAPPDATA%\com.descall.app\logs\main.log` dosyasını gönder.

## Açık kalanlar
- **Windows 11 Snap düzenleri:** büyüt düğmesinin üzerinde beklemeyle açılan menü. Plan hazır, ama derlenmeden riskli olduğu için yapılmadı.
- **Güncelleme adresi:** `api.descall.com/api/desktop/tauri/...` her 5 dakikada bir 404 veriyor. Güncelleme GitHub'dan yine çalışıyor, ama bu adres ya eklenmeli ya da kaldırılmalı.
- **Gerçek kurulumda kontrol:** güncelleme sırasındaki değişken adı ve kısayoldaki bildirim kimliği.
- **Bu ortamda yapılamayan:** uygulamanın kendi Rust testleri, Windows runner olmadığı için çalıştırılamadı.
