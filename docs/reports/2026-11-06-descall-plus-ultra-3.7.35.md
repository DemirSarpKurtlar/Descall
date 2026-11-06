# Descall+ / Ultra ve 3.7.35: tam rapor (6 Kasım 2026)

## Kısaca

- 3.7.35 ana dala alındı (PR #373, testlerin hepsi yeşil). Windows sürümü ve iPhone TestFlight derlemesi başlatıldı.
- Bu sürüm App Store incelemesine **gönderilmedi**. Gönderim senin onayını bekliyor.
- Sürüm numarası 3.7.27 değil, 3.7.35. Ben çalışırken başka oturumlar ana dala 3.7.34'e kadar sürüm çıkarmıştı; o değişikliklerin hepsi bu sürümün içinde.
- Descall+ ve Descall Ultra 1. aşamada: ödeme yok, üyeliği yalnızca yöneticiler veriyor. Veritabanı canlıda hazır.
- Senin `admin` hesabında Descall Ultra açık:
  - süresiz ve ücretsiz;
  - ilk 15.000 DesCoin hesabına yattı;
  - bir sonraki hediye 6 Aralık 2026'da.
- Arayüz denetimi (157 madde):
  - 19 yüksek: hepsi bitti;
  - orta, site/panel: 21 maddenin hepsi bitti;
  - orta, uygulama içi: 47 maddeden 40 bitti, 6 kısmen, 1 atlandı;
  - 72 düşük: 58 bitti, 10 kısmen, 4 atlandı.

  Orta maddeler iki ekibe bölündü ve birkaç madde iki listede de geçiyor; bu yüzden orta toplamı 66 yerine 68.

## Planlara göre özellikler

İşaretler:
- **Hazır**: bitti, otomatik testlerden geçti.
- **Windows'ta dene**: kod bitti ama gerçek bir Windows bilgisayarda denenmesi gerekiyor. Bu ortamda yalnızca Linux ile test edebildim.
- **Kısmi**: bir parçası eksik; nedeni yanında yazıyor.

Ultra, Descall+'ın her özelliğini de içerir. Her özelliğin açma-kapama düğmesi ve kendi ayarları **Ayarlar > Descall+** sayfasında.

### Descall+ (31 özellik, her yenilemede 5.000 DesCoin)

**Pencere ve masaüstü** (yalnızca bilgisayar uygulamasında)

| Özellik | Ne yapar | Durum |
|---|---|---|
| Mini mod | Uygulamayı küçük bir pencereye indirir | Windows'ta dene |
| Her zaman üstte | Pencereyi diğerlerinin üstünde tutar | Windows'ta dene |
| Aramayı ayrı pencerede (PiP) | Arama küçük, yüzen bir pencerede devam eder | Windows'ta dene |
| Çoklu pencere | Sohbetleri ayrı pencerelerde açar | Windows'ta dene. Her pencere yaklaşık 250 MB bellek kullanıyor |
| Pencere saydamlığı | Pencerenin opaklığını ayarlar | Windows'ta dene |
| Oturumu geri yükleme | Açık pencereleri bir sonraki açılışta geri getirir | Windows'ta dene |
| Gelişmiş tepsi menüsü | Durum, sessiz ve sağır kontrolleri tepside | Windows'ta dene |
| Görev çubuğu artıları | Görev çubuğunda sessize alma ve rozetler | Windows'ta dene |

**Kısayollar**

| Özellik | Ne yapar | Durum |
|---|---|---|
| Genel sessize alma | Oyundayken bile tek tuşla sessiz | Windows'ta dene |
| Genel bas-konuş | Basılı tutunca konuşur; farenin yan tuşları da çalışır | Windows'ta dene |
| Özel kısayollar | Kısayolları istediğin tuşlara atarsın | Windows'ta dene |
| Medya tuşları | Klavyedeki medya tuşlarıyla arama kontrolü | Windows'ta dene |
| Hızlı başlatıcı | Bir kısayolla sohbet ve kişi arama penceresi açar | Windows'ta dene |
| Hızlı yanıt | Bildirimden doğrudan cevap yazarsın | Windows'ta dene (bildirim davranışı) |

**Bildirimler** (bilgisayar ve web)

| Özellik | Ne yapar | Durum |
|---|---|---|
| Bildirim geçmişi | Kaçırdığın bildirimlerin listesi | Hazır |
| Odak modu | Belirlediğin süre boyunca bildirimleri susturur | Hazır |
| Bildirim profilleri | Oyun, iş ve günlük gibi hazır bildirim ayarları | Hazır |
| Akıllı oyun bildirimleri | Oyundayken yalnızca önemli bildirimler gelir | Windows'ta dene |

**Ses** (bilgisayar ve web)

| Özellik | Ne yapar | Durum |
|---|---|---|
| Mikrofon ön ayarları | Mikrofon seviyesi ve kayıtlı ayarlar | Hazır |
| Gürültü kapısı | Kendi eşiğinin altındaki sesi keser | Hazır |
| Kendini duyma | Mikrofonunu kulaklıktan dinlersin | Hazır |
| Ses etkinliği göstergesi | Konuşurken seviyeyi canlı gösterir | Hazır |
| Otomatik cihaz geçişi | Kulaklık takılınca ona geçer | Hazır |
| Ses yönlendirme | Arama, bildirim ve diğer sesler için ayrı çıkış cihazı | Kısmi: mağazadan alınan ses paketleri hâlâ varsayılan çıkıştan çalıyor |
| Cihaz profilleri | Mikrofon ve hoparlör setlerini kaydedip geçiş yaparsın | Hazır |

**Oyun ve verimlilik**

| Özellik | Ne yapar | Durum |
|---|---|---|
| Oyun durumu | Profil kartında oynadığın oyunun kartı (kim görebileceğini sen seçersin) | Hazır |
| Oyun oturumu geçmişi | Ne kadar süre, hangi oyunu oynadığın | Hazır |
| Pano geçmişi | Yalnızca Descall içinde kopyaladıkların; parola alanları atlanır | Windows'ta dene |
| Hızlı dosya bırakma | Dosyayı sürükleyip hızlıca gönderirsin | Windows'ta dene |
| Uygulama kilidi | PIN ile kilit. Boşta kalınca, küçültünce ya da bilgisayar kilitlenince devreye girer | Windows'ta dene. Windows Hello yok |
| Hızlı işlemler | Sık kullandığın işlemler tek menüde | Hazır |

### Descall Ultra (Descall+'ın hepsi ve 16 özellik daha, her yenilemede 15.000 DesCoin)

| Özellik | Ne yapar | Durum |
|---|---|---|
| Masaüstü kenar çubuğu | Ekranın kenarında arkadaşlar ve arama paneli | Windows'ta dene |
| Ekran kenarı işlemleri | Fareyi ekran kenarına götürünce işlem yapar | Windows'ta dene |
| Pencere yerleşimleri | Pencere düzenlerini kaydedip geri yüklersin | Windows'ta dene |
| Gelişmiş pencere yönetimi | Yapıştırma ve hizalama | Windows'ta dene |
| Ses HUD'u | Oyunun üstünde kimin konuştuğunu gösteren küçük panel | Windows'ta dene |
| Oyun HUD'u | Saat, Descall bağlantı gecikmesi, arama ve çevrimiçi arkadaşlar | Kısmi: sesli arama gecikmesi gösterilmiyor; LiveKit bu bilgiyi vermiyor |
| Anlık klip | Son 30-60 saniyeyi kaydeder; kesip gönderirsin | Windows'ta dene. Yalnızca görüntü: oyunun sesi, aramanın sesinden ayrılamıyor |
| Kişiye özel ses kısayolları | Belirli bir kişinin sesini kısayolla açıp kısarsın | Windows'ta dene |
| Yayın sesi kontrolü | Ekran paylaşımının sesini ayrı ayarlarsın | Kısmi: izleyici tarafı yalnızca sunucu ses kanallarında |
| Çalışma alanı profilleri | Oyun, iş ve günlük modları arasında tek tıkla geçiş | Hazır |
| Masaüstü otomasyonları | "Oyun başlayınca rahatsız etme", "aramaya girince sessiz" gibi kurallar | Windows'ta dene |
| Etkinlik zaman çizelgesi | Gün gün oyun ve arama geçmişin | Hazır |
| Komut merkezi | Her şeyi klavyeyle yönettiğin arama kutusu | Windows'ta dene |
| Widget'lar | Masaüstünde arkadaşlar ve arama widget'ları | Windows'ta dene |
| Özel yerleşimler | Uygulama içi panelleri istediğin gibi dizersin | Windows'ta dene |
| Çoklu hesap | Birden fazla Descall hesabına aynı anda girersin | Windows'ta dene |

### Bilerek eklenmeyenler

- **Oyunun içine çizen arayüz:** hile koruması sistemleri bunu hile sanabilir. HUD'lar oyunun içine girmeden, oyunun üstündeki ayrı pencerelerde duruyor. Tam ekran (exclusive) modda görünmezler.
- **Oyun FPS'i:** okumak için oyunun içine girmek gerekiyor.
- **Arama kaydı:** bu konuda daha önce aldığın karar geçerli.
- **Uygulama başına ses yakalama:** yerel (native) bir modül gerektiriyor; sonraya kaldı.

### iPhone

Apple kuralları gereği iPhone'da yalnızca üyelik durumu ve rozet görünüyor. Satın almaya ya da tanıtıma yönlendiren bir şey yok.

## Yönetici paneli: Premium bölümü (9 sayfa)

| Sayfa | Ne var |
|---|---|
| Genel bakış | Aktif üye sayıları (Descall+ ve Ultra ayrı), süresi dolanlar, 7 gün içinde bitecekler, yeni üyeler |
| Kullanıcılar | Kullanıcı adı, ID, e-posta veya görünen adla arama. Üyelik verme, uzatma, plan değiştirme, iptal, bitiş tarihi belirleme, süresiz yapma |
| Toplu işlem | Birden çok kullanıcıya aynı anda işlem. Sonuç her kişi için ayrı gösterilir; biri hata verirse diğerleri etkilenmez |
| Geçmiş | Yapılan her işlem. Bu kayıtlar silinemez ve değiştirilemez |
| Analiz | Yalnızca gerçek veri. Veri yoksa grafikte boşluk görünür, uydurma sayı yok |
| Finans | "Ödeme altyapısı henüz entegre edilmedi" yazar; hiçbir yerde tutar yok |
| Kampanyalar | Kupon kodları. Şimdilik yalnızca ücretsiz üyelik veren kuponlar işe yarıyor |
| İşlem kaydı | Hangi yöneticinin ne yaptığı |
| Planlar | Plan adı, açıklaması ve görünürlüğü. Fiyat alanı kapalı |

Güvenlik:
- Her işlem yönetici doğrulama kodu istiyor ve kayda geçiyor.
- Üyelik her zaman sunucuda kontrol ediliyor.
- Bilgisayar uygulaması üyeliği kendi başına da doğruluyor; arayüzün söylediğine tek başına güvenmiyor.

## Nasıl denersin

1. **Sürüm.** Ayarlar'da 3.7.35 yazmalı.
2. **Kendi üyeliğin.** `admin` hesabınla Ayarlar > Descall+ sayfasını aç. Beklenen: Descall Ultra, süresiz, bir sonraki hediye 6 Aralık 2026.
3. **Üyelik verme.** Yönetici paneli > Premium > Kullanıcılar'da bir test hesabı bul ve 30 günlük Descall+ ver. Beklenen:
   - Doğrulama kodu isteniyor.
   - Test hesabına 5.000 DesCoin geliyor.
   - Geçmiş sayfasında kayıt var.
   - Test hesabının profilinde rozet görünüyor.
4. **İptal.** Aynı test hesabının üyeliğini iptal et. Beklenen: rozet ve özellikler kayboluyor, geçmişte iptal kaydı var.
5. **Toplu işlem.** İki test hesabını seç ve üyelik ver. Beklenen: her hesap için ayrı sonuç.
6. **Finans.** "Ödeme altyapısı henüz entegre edilmedi" yazmalı.
7. **Windows özellikleri.** Ultra hesapla, aşağıdaki "Gerçek Windows'ta denenmesi gerekenler" listesini tek tek dene. Üyeliği olmayan bir hesapta bu özellikler kilitli olmalı.
8. **iPhone.** Ayarlar > Descall+ sayfasında yalnızca durum ve rozet görünmeli.

## Gerçek Windows'ta denenmesi gerekenler

Bu ortamda Linux ile test edebildim; aşağıdakiler Windows'a özgü davranışlar.

1. **Electron 45 geçişi.**
   - Güncellemeden sonra tekrar giriş yapman gerekmemeli; eski giriş bilgisi yeni güvenli saklamaya taşınıyor.
   - Panodaki ekran görüntüsünü yapıştırma çalışmalı.
   - Bildirimler eskisi gibi gelmeli.
   - Kurulum (NSIS) sorunsuz olmalı.
2. **Kısayollar oyunun içindeyken:** genel sessiz, bas-konuş ve farenin yan tuşları.
3. **HUD'lar:** oyunun penceresiz ya da kenarlıksız modunda görünmeli. Fare tıklamaları HUD'un içinden oyuna geçmeli.
4. **Uygulama kilidi:** PIN, boşta kalınca kilitlenme ve bilgisayar kilitlenince kilitlenme.
5. **Diğerleri:**
   - hızlı yanıt;
   - çoklu hesap;
   - hızlı dosya bırakma;
   - anlık klip (donanım kodlayıcıyla);
   - widget'lar ve kenar çubuğu.

## Arayüz denetimi (157 madde)

Tüm bulgular: `docs/ui-audit/2026-11-06-findings.md`.

### Yüksek öncelik

19 maddenin hepsi bitti.

### Orta öncelik: site, yönetici paneli ve App Store görselleri

21 maddenin hepsi bitti. App Store görselleri yalnızca yerelde yeniden üretildi; App Store'a yüklenmedi.

### Orta öncelik: uygulama içi (47 madde)

**Bitti (40):** 1, 3, 4, 6, 12, 13, 14, 17, 18, 19, 21, 29, 32, 35, 38, 40, 41, 46, 61, 62, 65, 66, 69, 72, 76, 78, 85, 86, 90, 91, 96, 107, 112, 113, 123, 124, 127, 132, 145, 147.

**Kısmen (6):**
- **#129:** yazı boyutları için ortak bir ölçü eklendi ve 279 boyut bu ölçüye geçti. Kalan 451 boyuta dokunulmadı; yuvarlansalar ekran düzenleri kayabilirdi. Bundan sonra eklenen yeni boyutlar ölçü dışına çıkarsa testler hata veriyor.
- **#142:** casino'daki "kredi" kelimesi bilerek bırakıldı. O bakiye DesCoin değil, ayrı bir bakiye.
- **#144:** boş kanalda karşılama yazısı var, ama "Kanalı düzenle" butonu yok. Bunun için gereken bağlantı henüz yok.
- **#70:** iPhone'daki alt sayfa ekranın altına oturdu. Profil kısa linki eklenmedi; sunucuda yeni bir adres gerekiyor.
- **#77 ve #79:** ana kısımları yapıldı; iPad'deki ek genişlik ayarı eklenmedi.

**Atlandı (1), senin onayladığın tasarımla çeliştiği için:**
- **#67:** özel mesaj başlığına ⋯ menüsü eklenip sonra geri alındı. Başlık senin onayladığın haliyle kaldı (#29/#30 taslakları: arama, sabitlenenler, arama, görüntülü, engelle). İstersen sonra açarım.

### Düşük öncelik (72 madde)

**Kısmen (10):**
- **#135:** video ikonu ve onay işareti yapıldı. Profildeki arkadaş düğmesi "Arkadaşsınız" yerine yine "Arkadaş" yazıyor, çünkü onayladığın tasarım ve testler bunu bekliyor.
- **#126:** saatin örnek verisi düzeldi. Ekran görüntüleri ve saatte sabit duran 9:41 için Xcode simülatörü gerekiyor.
- **#80:** 69 köşe yuvarlaklığı ortak ölçüye bağlandı.
- **#133:** okunabilir genişlik eklendi; iki sütunlu düzen eklenmedi.
- **#136:** üç rengin (gri, yeşil, kırmızı) 102 kullanımı ortak renklere bağlandı. Açık temadaki renkler değişmedi.
- **#143:** platforma göre Ctrl/⌘ gösteriliyor. Menünün tek sütun düzeni yapılmadı.
- **#153:** yalnızca köşe yuvarlaklığı kısmı yapıldı. 848 satır içi stil taşınmadı.
- **#117:** iki kez görünen bakım anahtarı yerinde bırakıldı; kaldırmak davranışı değiştirirdi.
- **#141:** eş anlamlı iki metin aynı yazıldı ama birleştirilmedi.
- **#129:** orta öncelikteki yazı ölçüsüyle birlikte kapsandı.

**Atlandı (4), büyük yapı değişikliği oldukları için:**
- **#81:** dört ayrı renk sistemini birleştirmek.
- **#131:** 895 gölgeyi birleştirmek.
- **#138:** web ve bilgisayar için ortak giriş kartı.
- **#149:** iPad ayarlarında iki sütunlu görünüm.

**Bitti (58):** geri kalan bütün düşük maddeler. Discord moru 37 dosyada logo mavisiyle değişti. Diğer örnekler: 404 sayfası, saat renkleri, ayar kartları, yönetici panelindeki boş ekranlar.

### Sürüm çıkarken düzelttiklerim

- **Çerez şeridi:** "Kabul et" düğmesinin rengi okunabilirlik testinden geçmiyordu. Ana sayfadaki koyu mavi kullanıldı.
- **Sayfa boyutu:** sitenin ilk yüklemesi sınırı 0.2 KB aşıyordu. Aynı liste iki kez yazılıydı; tek listeye indirildi. Ölçüm 234.9 KB'den 234.5 KB'ye düştü (sınır 235 KB).
- **Apple Watch testi:** saat uygulaması çökmediği halde "çöktü" diyordu. Hata testi çalıştıran betikteydi; düzeltildi.

## Bekleyenler

- **App Store:** 3.7.35 incelemeye gönderilmedi. Senin onayını bekliyor.
- **Ödemeler (2. aşama):** önerim:
  - web ve Windows için iyzico Abonelik;
  - iPhone'da Apple uygulama içi satın alma;
  - yedek olarak PayTR.

  Bu aşamaya geçildiğinde abonelik başlatan yeni üyeye 3 günlük deneme verilecek. Veri yapısında bunun için yer şimdiden ayrıldı.
- **Beklemeye aldıkların:** büyüme planı ve 3D dünya.
