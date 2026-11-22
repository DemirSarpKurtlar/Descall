# Rust (Tauri) uygulaması: ikinci tarama raporu (22 Kasım 2026)

Dal: `ts2-integ` (PR henüz açılmadı)

## Özet

- 10 ajan ikinci kez bütün masaüstü uygulamasını taradı ve ilk turda kaçan 65'ten fazla sorunu düzeltti.
- En önemlileri:
  - bas-konuş tuşu bazı durumlarda mikrofonu açık bırakıyordu (bütün platformlarda);
  - Windows açılışında başlayan uygulama, güncellemeden ya da "Yeniden başlat"tan sonra gizli geri geliyordu;
  - görev çubuğunda iki Descall düğmesi çıkıyordu;
  - tepsideyken gelen mesajlar okundu sayılıyordu;
  - açılırken ikinci kez tıklamak işe yaramıyordu;
  - gizli bilgiler (oturum anahtarları, imzalı adresler) log dosyasına ve hata raporlarına yazılıyordu.
- Ajanların aynı soruna getirdiği farklı çözümler tek çözümde birleştirildi:
  - güncelleme sonrası açılış,
  - açılırken ikinci tıklama,
  - pencereyi öne getirme.
- Birleştirmede ayrıca bir sorun bulundu ve düzeltildi: Snap düzenleri için eklenen kontrol, uygulama tepsideyken de her saniye çalışıyordu.
- Rust kodunun tamamı Windows için derlendi; hata ve uyarı yok. Platformdan bağımsız Rust testlerinin (372) hepsi geçiyor.
- Web testleri (767 dosya; önceden bekletmeye alınmış 7 dosya dışında hepsi), masaüstü testleri ve Tauri benzetim testleri geçiyor. Web derlemesi sorunsuz.
- Gerçek Windows'ta denenmedi. Aşağıdaki "Senin denemen gerekenler" bölümü bunun için.

## Kritik

- **Bas-konuş, pencere değişince:** tuşa basılıyken Alt+Tab yapınca ya da oyuna tıklayınca mikrofon açık kalıyordu. Düzeltildi, bütün platformlarda.
- **Bas-konuş, bırakma sırası:** kombinasyonda önce Shift ya da Ctrl bırakılınca mikrofon açık kalıyordu. Düzeltildi, bütün platformlarda.

## Yüksek

- **Güncelleme sonrası gizli pencere:** Windows açılışında başlayan uygulamada "Şimdi yeniden başlat" ya da sessiz güncelleme pencereyi tepside gizli bırakıyordu. Düzeltildi; pencere bırakıldığı gibi geri geliyor.
- **"Yeniden başlat" sonrası gizli pencere:** Ayarlar'daki "Yeniden başlat" ve çökme sonrası "Yeniden dene" de pencereyi gizli açıyordu. Düzeltildi.
- **Açılırken ikinci tıklama:** uygulama açılırken kısayola ya da görev çubuğuna tekrar tıklamak yok sayılıyordu, pencere hiç gelmiyordu. Düzeltildi.
- **Geç görünen pencere:** soğuk açılışta pencere yaklaşık 3 saniye geç görünüyordu. Artık açılış ekranı çizilir çizilmez görünüyor.
- **Takılan güncelleme denetimi:** bağlantı yanıt vermezse denetim sonsuza kadar bekliyordu. Düzeltildi.
- **İkinci kopya kurulumu:** DescallSetup ile kurulan uygulama güncellenince ayrı bir klasöre ikinci kopya kuruluyordu. Düzeltildi.
- **İki görev çubuğu düğmesi:** otomatik başlatma, güncelleme, bildirim ya da bağlantıyla açılınca sabitlenmiş düğmenin yanında ikinci bir düğme çıkıyordu. Düzeltildi.
- **Tepsideyken okundu bilgisi:** açık kalan DM ya da grup sohbetine tepsideyken gelen mesajlar okundu sayılıyordu (Electron'da da). Düzeltildi.
- **Tepsiden Çık:** yazılmamış taslak kayboluyor, ses kanalında hayalet kalınıyor, kullanım süresi gönderilmiyordu. Düzeltildi.
- **"Açılıp kaybolan" pencereler:** uygulama boştayken ya da arka plandayken açılan mağaza kartları, güncelleme bildirimi ve arama sonu DesCoin görünmez kalıyordu; tıklama arkadaki alana gidiyordu. Düzeltildi.
- **Panodan büyük resim:** 4K ekran görüntüsü yapıştırmak bütün pencereleri donduruyordu. Düzeltildi.
- **Türkçe kullanıcı adı:** adında "İ" gibi harf olan Windows kullanıcılarında Electron'dan geçiş aracı otomatik başlatmayı bozuyor ya da çöküyordu. Düzeltildi.
- **Ctrl+Shift+K çakışması:** komut merkezi ile hızlı başlatıcı aynı kısayolu kullanıyor ve biri sessizce çalışmıyordu; özel kısayollar da yanlışlıkla "başka bir uygulama kullanıyor" diyordu. Artık hangi özelliğin tuttuğu yazıyor (7 dil). Varsayılanlar değişmedi.

## Orta

- **Güncelleme adresi:** `api.descall.com` güncelleme adresi 404 veriyordu. Sunucuya eklendi; sorun olursa GitHub'a düşüyor ve uzaktan durdurulabiliyor.
- **Çıkarken istenmeyen yeniden açılış:** bekleyen güncelleme varken "Çık" denince uygulama kurulup kendiliğinden yeniden açılıyordu. Düzeltildi.
- **Kurulamayan güncelleme:** kart sessizce kayboluyordu. Artık hata kartı çıkıyor (7 dil).
- **İndirme sayfası:** Electron sürümünün sayfasını açıyordu. Düzeltildi.
- **DescallSetup yedek sunucu:** bir indirme sunucusu hata verince diğerine geçmiyordu. Düzeltildi.
- **Tepsideki bellek:** tepsideyken uygulama tam bellek tutuyordu. Artık 30 saniye sonra azaltıyor; arama, çalma ya da paylaşım varken azaltmıyor.
- **Kapalı uygulamada bildirim tıklaması:** yalnızca pencere açılıyordu. Artık o sohbet açılıyor (bildirimde ad ya da mesaj metni taşınmadan).
- **Descall+ ile öne gelme:** bildirim, kısayol ya da tepsi menüsüyle gelen pencerede sayfa kendini hâlâ arka planda sanıyordu; tepsideyken yüklenen sayfa da öndeyim sanıyordu. Düzeltildi.
- **Tepsiden açılan pencere:** odak almıyordu, hemen yazılamıyordu. Düzeltildi.
- **Windows 11 Snap düzenleri:** büyüt düğmesinin üzerinde bekleyince açılan menü eklendi (Electron'da yoktu). Ana pencere, admin, uygulama kilidi ve kayıt istatistiklerinde.
- **Klavye:** Alt+Boşluk Windows pencere menüsünü açıyor; Alt+F4 doğru pencereyi kapatıyor.
- **Mini arama kartı:** farklı ölçekli monitörlerde yanlış yerde çıkıyordu. Düzeltildi.
- **Kamera adı:** yeni kurulumda ilk görüntülü aramadan önce Ayarlar'da kamera adı boş görünüyordu. Düzeltildi.
- **Ekran paylaşımı uyarıları:** Almanca, İspanyolca, Fransızca, Portekizce ve Rusçada İngilizce çıkıyordu. Düzeltildi.
- **Kalite değişince paylaşım bitmesi:** eski paylaşımın geç gelen durdurma isteği yenisini kapatabiliyordu. Düzeltildi.
- **Oturum geri yükleme:** kapanışta kaydedilen pencere düzeni yarışa girip kaybolabiliyordu. Düzeltildi.
- **Hızlı dosya bırakma:** büyük dosyalar sessizce kayboluyordu. Artık "Bazı dosyalar gönderilemedi" yazıyor.
- **Anlık klip:** çok büyük kayıt parçalarında taşma ve sınırsız bellek büyümesi vardı. Düzeltildi.
- **Descall+ büyük veri kaydı:** 100 MB'a kadar veri yazarken arayüz donuyordu. Düzeltildi.
- **HUD:** eylemler sırasız uygulanıyor, HUD kırpık kalıyordu. Düzeltildi.
- **Donma penceresi:** birkaç saniyede bir tekrar çıkıyor, tepsideyken de çıkıyor, rapor yağdırıyor ve arama durumunu sıfırlıyordu. Artık bir kez, 10 saniye sonra ve yalnızca pencere görünürken çıkıyor.
- **"Descall açılamadı" penceresi:** uygulama tepsideyken de çıkıyordu. Düzeltildi.
- **Simge durumunda açılış:** odağı çalıyordu. Düzeltildi.
- **Güvenli depo hatası:** Windows depoyu reddedince oturum kayboluyordu. Düzeltildi.
- **Electron'dan geçiş (açılınca):** ikinci aktarım ve geçiş sırasında çıkış yapınca geri alma sorunları düzeltildi.
- **Başka uygulamaların erişimi:** bilgisayarda başka bir portta çalışan yerel bir sunucu uygulamanın komutlarını çağırabiliyordu. Düzeltildi.
- **Tanınmayan pencereler:** tam yetki alıyordu. Artık hiçbir yetki almıyor.
- **Gizli bilgiler:** oturum anahtarları, imzalı adresler ve API anahtarları log dosyasına, çökme raporuna ve Sentry'ye yazılıyordu. Artık gizleniyor.
- **Resim yükleme:** bildirim kartı, arama kartı ve HUD her adresten resim yükleyebiliyordu (IP adresi sızabilirdi). Artık yalnızca izinli adresler.
- **Resim görüntüleyici:** fare mesajın üzerindeyken açılınca Escape ile kapanmıyordu. Düzeltildi, bütün platformlarda.
- **Snap kontrolü tepside (birleştirmede bulundu):** düğme yeri kontrolü tepsideyken de her saniye çalışıyordu. Artık tepsideyken duruyor.

## Az

- **Hayalet tepsi simgesi:** güncelleme kurulduktan sonra tepside kalıyordu ve son log satırları yazılmıyordu. Düzeltildi.
- **DescallSetup kaldırıcı:** `descall://` kaydını ve başlangıç ayarını bırakıyordu. Düzeltildi.
- **"Denetle" düğmesi:** indirme sürerken "güncel" diyordu. Düzeltildi.
- **Eski kurulum dosyaları:** geçici klasörde birikiyordu. Artık temizleniyor.
- **Görev çubuğu rozeti:** Windows Gezgini yeniden başlayınca kayboluyordu; küçük resim düğmelerinin ipuçları dil değişince güncellenmiyordu. Düzeltildi.
- **Yedek tepsi menüsü:** sıra Electron'daki gibi.
- **Büyüt simgesi:** uygulama kilidi ve kayıt istatistikleri çubuğunda hep aynı simge görünüyordu. Düzeltildi.
- **Açılır ve hesap pencereleri:** büyütülmüş olduklarını bilmiyordu. Düzeltildi.
- **Ekran dışı pencere:** ekran dışında açılan pencere görünür alana alınıyor.
- **Admin penceresi:** en küçük boyutu küçük ekranlardan (1366x768) büyüktü. Düzeltildi.
- **Mini arama kartı:** kapatılınca aynı aramada bir daha gelmiyordu. Düzeltildi.
- **İndirilen dosyalar:** "internetten indirildi" işareti almıyordu; bazı özel Windows adları da engellenmiyordu. Düzeltildi.
- **HUD avatarı:** avatar adresindeki tırnak işaretiyle görünüm bozulabiliyordu. Düzeltildi.
- **`descall://` bağlantısı:** bağlantıya gizli açılış ayarı eklenebiliyordu. Düzeltildi.
- **Telefon bağlantıları:** `tel:` bağlantıları artık dışarıda açılmıyor (web, e-posta açılıyor).
- **Ek pencereler:** açılır, Descall+ ve hesap pencerelerinde bağlantı ve indirme kuralları tek kural oldu.
- **Oturum deposu:** yarıda kalan yazmaya karşı korunuyor.
- **Arka plan uyarısı:** "Arka planda çalışıyor" uyarısı Electron'dan gelen kullanıcılara iki kez gösteriliyordu. Düzeltildi.
- **Test ve CI:** Windows denetimi uyarıları da hata sayıyor; PIN testleri 70 saniyeden 1,6 saniyeye indi; yeni testler CI'a eklendi.

## Senin denemen gerekenler (gerçek Windows)

1. **Bas-konuş:**
   1. Tuşa basılıyken Alt+Tab yap ya da oyuna tıkla. Mikrofon kapanmalı.
   2. Shift+M gibi bir kombinasyonda önce Shift'i bırak. Mikrofon kapanmalı.
2. **Güncelleme ve yeniden başlatma:**
   1. "Windows ile başlat" açıkken bilgisayarı yeniden başlat ve Descall'ı tepsiden aç.
   2. Bir güncelleme gelince "Şimdi yeniden başlat" de. Pencere açık geri gelmeli.
   3. Ayarlar > Masaüstü uygulaması > "Yeniden başlat" ile aynısını dene.
3. **Açılış:**
   1. Normal açılışta açılış ekranı hemen görünmeli.
   2. Windows açılışında pencere görünmemeli, yalnızca tepsi simgesi olmalı.
   3. Açılırken kısayola ikinci kez tıkla. Pencere gelmeli.
4. **Görev çubuğu:** otomatik başlatmadan, güncellemeden ve bildirim tıklamasından sonra yalnızca bir Descall düğmesi olmalı.
5. **Tepsi:**
   1. Tepsideyken birinden açık sohbetine DM iste. Okundu görünmemeli; pencereyi açınca okundu olmalı.
   2. 40 saniye bekle. Görev Yöneticisi'nde bellek düşmeli. Pencereyi açınca normal çalışmalı. Arama sırasında düşmemeli.
   3. Tepsiden aç. Pencere odak almalı, hemen yazabilmelisin.
   4. Mesaj kutusuna bir şey yaz, tepsiden "Çık" de, yeniden aç. Taslak durmalı. Ses kanalındaysan hemen çıkmış görünmelisin.
6. **Bildirim:** Descall kapalıyken Bildirim Merkezi'ndeki bir mesaj bildirimine tıkla. O sohbet açılmalı.
7. **Pencere (Windows 11):**
   1. Büyüt düğmesinin üzerinde bekle. Snap düzenleri çıkmalı.
   2. Alt+Boşluk ile Windows menüsü açılmalı.
8. **Arama ve paylaşım:**
   1. Farklı ölçekli iki monitörde mini arama kartı doğru köşede çıkmalı.
   2. Yeni kurulumda Ayarlar > Ses ve Görüntü'de kamera adı görünmeli.
   3. Ekran paylaşımı sırasında kaliteyi değiştir. Paylaşım kesilmemeli.
9. **Descall+:**
   1. Ctrl+Shift+K: komut merkezi ve hızlı başlatıcı ikisi de açıksa uyarı görünmeli.
   2. Büyük bir dosyayı hızlı bırakmaya at. Gönderilemezse uyarı çıkmalı.
   3. Widget'ları sürükle.
10. **Arka plandan dönüş:** uygulamayı boşta bırak ya da küçült, sonra mağazayı ve profil menüsünü aç. Görünür olmalılar.
11. **DescallSetup ile kurulu bilgisayar:** güncellemeden sonra `%LOCALAPPDATA%\Descall` altında ikinci bir kopya olmamalı.
12. **Sorun olursa log:** `%LOCALAPPDATA%\com.descall.app\logs\main.log` dosyasını gönder.

## Senin kararın gerekenler

1. **Güncellemeler:**
   - Kurulum sessiz mi olsun, yoksa ilerleme penceresi mi görünsün?
   - Electron gibi açılışta da güncelleme yapılsın mı?
   - Beta kanalı olsun mu?
   - Güncellemeleri uzaktan durdurma ayarı Render'a eklensin mi?
   - DescallSetup ve standart kurulum, iki yol da kalsın mı?
   - Pencere görünür ama bir oyunun arkasındayken sessiz güncelleme olursa pencere odak almadan mı gösterilsin?
2. **Kısayollar:**
   - Komut merkezi ile hızlı başlatıcının ortak varsayılanı (Ctrl+Shift+K): biri değişsin mi?
   - Electron'daki özel kısayol mesajı da düzeltilsin mi?
3. **Bildirimler ve görev çubuğu:**
   - Windows Odak Yardımı açıkken bildirim kartları gizlensin mi?
   - Grup mesajlarında görev çubuğu yanıp sönsün mü?
   - Görev çubuğu simgesine sağ tıklama listesi eklensin mi?
   - Descall+ olmadan da rozet ya da tepsi ipucunda okunmamış sayısı görünsün mü?
   - Sessize alınmış sohbetler rozete sayılsın mı?
   - Arayan aramayı iptal edince görev çubuğunun yanıp sönmesi "cevapsız arama" işareti olarak kalsın mı?
4. **Pencere:**
   - Snap düzenleri Windows 11'de varsayılan açık kalsın mı? (Açıkken büyüt düğmesinin ipucu görünmüyor.)
   - Yayın tam ekranı yalnızca pencereyi mi doldursun (Electron gibi), gerçek tam ekran mı olsun?
   - Kalite değişince paylaşım seçicisinin yeniden açılması (Electron'da da böyle) kalsın mı?
5. **Görünüm ve performans:**
   - "Açılıp kaybolan pencere" düzeltmesi Electron, web ve mobilde de açılsın mı?
   - Fare hareket edince arka plan durumu kalksın mı? (Şu an dönen göstergeler tıklayana kadar duruyor.)
   - Arka planda yavaşlatma kapalı kalsın mı? (Öneri: kalsın.)
   - Tepside bellek azaltma için 30 saniye uygun mu?
   - Kullanım istatistiklerinde Rust uygulaması "electron" olarak görünüyor. Ayrı "tauri" etiketi olsun mu?
6. **Donma penceresi:** düğmeler "Yeniden dene / İptal" mi kalsın, "Bekle / Yenile" mi olsun?
7. **Electron'dan geçiş:** geçiş sırasında sunucu oturumu reddederse (401/403) "çıkış yapılmış" olarak tamamlansın mı, yoksa geri mi alınsın?
8. **Güvenlik:**
   - Üçüncü taraf ölçüm betikleri (Google Analytics, Tag Manager, PostHog) ana pencerede tam yetkiyle çalışıyor (Electron'da da). Masaüstünde kapatılsın mı?
   - Geçiş aracı imza denetimi olmadan yönetici olarak çalışıyor. Bunun için kod imzalama sertifikası gerekiyor.
   - İndirilen dosyalara artık "internetten indirildi" işareti konuyor. İmzasız kurulum dosyaları bu yüzden SmartScreen uyarısı gösterecek.

## Açık kalanlar

- **Uygulamanın kendi Rust testleri (27 adet):** Windows için derlendi ama burada çalıştırılamadı (Windows yok, Windows benzetimi bu ortamda çalışmıyor). CI'daki Windows adımı çalıştıracak.
- **Hatalı sürümü geri alma:** Electron'daki "açılış başarılı" işareti Rust uygulamasında yok; bozuk bir sürüm otomatik geri alınmıyor.
- **Güncelleme bilgileri:** sunucudaki sürüm bilgisi ile GitHub'daki birbirinden ayrışabilir. `api.descall.com/api/desktop/setup` hâlâ 404 (yalnızca yerel derlemeler kullanıyor).
- **Sayfanın kapanış işleri:** sessiz güncelleme kurulurken ve Windows kapanırken hâlâ atlanıyor.
- **Uyanma ve kilit açma:** bunlardan sonra güncelleme denetimi yapılmıyor.
- **Snap ile yapıştırılmış pencere:** yeniden açılınca yapıştırılmış boyutta açılıyor (Electron normal boyutu saklıyordu).
- **Kurulum arayüzü:** başlık çubuğu olduğu gibi bırakıldı.
- **Tek başına admin penceresi:** çekmeceler başlık çubuğunu örtebilir.
- **Tepki balonu:** en üstteki resimli mesajda sohbet başlığının altında kalıyor (bütün platformlarda).
- **Görev çubuğu rozeti:** ekran okuyucu açıklaması yok.
- **Descall+ ana pencere komutları:** bir yan etkisi açılır pencereden de tetiklenebiliyor.
- **Bildirim kapatma:** her pencereden kabul ediliyor (düşük risk).
- **Tauri'nin kendi eklenti komutları:** ikinci yetki denetiminden geçmiyor (Tauri'deki bir sorun).
- **Electron HUD avatarı:** aynı görünüm açığı Electron'da da var; tek satırlık düzeltme yapılmadı.
- **Kodda kalan iş:** yaklaşık 18 dosya Descall+ köprüsünü ortak yardımcı yerine doğrudan okuyor.
- **CI'da olmayan uzun testler:** ekran taraması (yaklaşık 60 ekran, 20-25 dakika), bildirim, boşta kalma, Snap ve Descall+ masaüstü testleri şimdilik yalnızca elle çalıştırılıyor.
