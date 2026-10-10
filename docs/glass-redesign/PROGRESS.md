# Liquid Glass — progress log

## Cihaz düzeltmeleri · 2.9.184

Sohbet listesinde aynı önizleme bazen İngilizce (“Call”, “Attachment”), bazen Türkçe (“Arama”) duruyordu. Sunucu bu satırları İngilizce token olarak gönderiyor; sohbet açılınca istemci çeviriyordu, liste ise gelen metni olduğu gibi basıyordu. Artık satır çizilirken yalnız bu sistem önizlemeleri dile çevriliyor: Call → Arama, Attachment → Ek dosya, Photo → Fotoğraf, Voice message → Sesli mesaj. Grup satırındaki “ada: 📞 Call” de çevrilir. Kullanıcının kendi mesajı (“Call me”) aynı kalır.

Mesaj yazarken satır klavyenin altında kalıyordu; iPhone’un ok ve onay çubuğu da alanın üstünü kapatıyordu. Cam yazı kapsülü artık klavyenin kapattığı şerit kadar yukarı çıkar, yazılan satır görünür. Çubuk, klavye açılınca da yeniden gizlenir. Düzenleme kipi aynı kapsülü kullanır.

Fotoğrafa uzun basınca GIF’teki gibi görsel kaybolup sağda mavi bir kutu kalıyordu. Uzantısız depo adresi de fotoğraf sayılır. Kalkmış kopya, ekrandaki görselin boyunu alır; boş yazı balonu çizilmez. Kısa dokunuş ışık kutusunu açar. Masaüstü ve web aynı. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.184**. Yalnız iPhone. Dil Türkçe.

- [ ] Sohbetler: arama satırı “Arama”, dosya satırı “Ek dosya”. “Call” veya “Attachment” yok. Kendi yazdığın mesaj aynı.
- [ ] Bir sohbet aç, klavyeyle yaz: yazdığın kelime klavyenin üstünde durur. Ok ve onay çubuğu görünmez.
- [ ] Bir mesajı Düzenle: aynı alanda yazı görünür, onayla kaydolur.
- [ ] Bir fotoğrafa uzun bas: fotoğraf bulanıklığın üstünde durur. Sağda mavi boş kutu yok. Kısa dokunuş fotoğrafı açar.
- [ ] GIF aynı. Masaüstü / tarayıcı listesi ve menüsü bozulmaz.

## Mağaza temaları · 2.9.183

Sekiz yeni tema, mevcut tema kataloğunun üstüne eklendi. Aynı `shop_items` satırı, aynı kuşanma, aynı `[data-theme]`. Eski satırlar değişmedi. Sunucu açılışında yalnız eksik SKU eklenir; güncelleme veya silme yok. Üretim veritabanına elle SQL çalıştırılmadı.

Palet (en ucuz temaların yanında): Lagoon 340, Grove 350, Hanami 370. Hareketli: Emberfall 520, Borealis 580, Starwell 640. İkisinin üstünde, bugünkü tavanın (650) üstünde: Chrome Veil 760, Iriscape 880. Yazı kontrastı camda AA. Azaltılmış Hareket, Azaltılmış Saydamlık, Artırılmış Kontrast ve Düşük Güç hareketsiz kareye döner. Uygulama gizlenince animasyon durur. Kartlarda “Yeni”. 2.9.182 mağazayı açar; bu temaları satın alamaz ve kuşanamaz, paleti bozulmaz. Masaüstü ve web aynı paleti görür. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.183**. Yalnız iPhone. Sistem Dokunuşları açık kalabilir.

- [ ] Mağaza → Temalar: Lagoon, Grove, Hanami, Emberfall, Borealis, Starwell, Chrome Veil, Iriscape. Her kartta “Yeni” ve fiyat.
- [ ] Lagoon’u al ve uygula: sohbet, ayarlar ve sekme çubuğu su yeşili cam. Hareket yok.
- [ ] Borealis: perde yavaş kayar. Starwell: yıldızlar. Iriscape: renk döner, cam kenarı kayar.
- [ ] Azaltılmış Hareket: perde ve kenar durur, palet kalır.
- [ ] Masaüstü: aynı temalar uygulanır. Eski temalar (Midnight, Aurora, Phoenix Fire) durur.

## Cihaz düzeltmeleri · 2.9.182

GIF’e uzun basınca görsel kayboluyordu. Menü bulanıklığın üstünde açılıyor, asıl balon gizleniyor; kalkmış kopya yalnız yazıyı taşıyordu. GIF’in yazısı boş olduğu için o kopya sağda küçük mavi bir kutuydu. Artık görsel de kalkıyor: tepki çubuğu, GIF (köşede GIF etiketi) ve menü. Boş yazı balonu çizilmiyor. Görselin kendisine basılı tutmak da menüyü açar; kısa dokunuş ışık kutusunu açar. Uzun basışın bıraktığı tık bir sonraki açılışı yutmaz. Düzenle yine yalnız yazısı olan mesajda. DM, grup ve sunucu. Masaüstü ve web aynı. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.182**. Yalnız iPhone.

- [ ] Bir GIF’e (DM, grup veya sunucu) uzun bas: GIF bulanıklığın üstünde durur, tepki çubuğu ve menü görünür. Sağda mavi boş kutu yok.
- [ ] Kısa dokunuş GIF’i açar, menü açılmaz.
- [ ] Menüyü kapatıp tekrar kısa dokununca GIF yine açılır.
- [ ] Yazısı olan görselde hem yazı hem görsel kalkar. Düzenle yalnız yazı varsa çıkar.
- [ ] Masaüstü / tarayıcı: üzerine gelince menü aynı, görsele tıklamak yine açar.

## Cihaz düzeltmeleri · 2.9.181

Mesaj düzenleme iPhone’da artık balonun içinde kutu açmıyor. Düzenle denince balon yerinde kalır, ince bir çerçeveyle vurgulanır. Alt yazı alanı düzenleme kipine geçer: yanıt şeridiyle aynı cam şerit, kalem, “Mesajı düzenle”, tek satırlık alıntı ve ×. Alan mesajın yazısıyla dolar, imleç sonda, klavye açık kalır. Gönder oku onay işaretine döner; yazı boşsa veya değişmediyse kapalıdır. Kayıt olunca başarı titremesi, balon yerinde “(düzenlendi)” olur. × normal yazı alanına döner, klavye açık kalır. Hata olursa hata titremesi ve düzenleme durur. iPhone klavyesinin üstündeki ok ve onay çubuğu bütün uygulamada kapalı. DM, grup ve sunucu kanalı. Masaüstü ve web balonun içindeki kutuyu korur. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.181**. Yalnız iPhone.

- [ ] Kendi mesajına uzun bas → Düzenle: balon yerinde, altta cam şerit “Mesajı düzenle”, yazı dolu, imleç sonda.
- [ ] Klavyenin üstünde yukarı/aşağı ok ve onay çubuğu yok.
- [ ] Yazı değişmeden onay kapalı. Değiştirip onayla: başarı titremesi, balonda “(düzenlendi)”.
- [ ] × yazı alanını eski haline alır, klavye açık kalır.
- [ ] Aynı şey grupta ve sunucu kanalında.
- [ ] Masaüstü / tarayıcı: düzenleme yine balonun içinde.

## Cihaz düzeltmeleri · 2.9.180

Takım bul üstü kesiliyordu. Filtre çipleri satırdan taşıyor, “Silver 3” ekranın sağında kesiliyordu; çiplerin altı da düz siyah bir şeritti. Çipler artık seçili yazıya göre daralır, satır ekranın içinde kalır, taşan olursa kayar. Mikrofon şartı ikon olarak durur, yazısı VoiceOver’da kalır. Liste zemini saydam; başlığın gradyanı boş duruma kadar iner. Geri ve artı durur. Masaüstü ve web aynı. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.180**. Yalnız iPhone.

- [ ] Oyna → Takım bul: “Tüm modlar”, “Avrupa” ve rank çipi (Silver 3) tam görünür, sağdan kesilmez.
- [ ] Çiplerin altı siyah bir şerit değil; gradyan boş lobiye kadar iner.
- [ ] Mikrofon çipi ikon; dokununca açılıp kapanır.
- [ ] Geri ve artı durur. Lobi oluştur hâlâ çalışır.
- [ ] Masaüstü / tarayıcıda Play aynı.

## Cihaz düzeltmeleri · 2.9.179

iPhone’daki onay pencereleri tek bir Liquid Glass uyarısı oldu. Ortada, yaklaşık 300 pt, kalın ortalanmış başlık, ortalanmış ikincil metin, saç teliyle ayrılmış tam genişlik düğmeler. İptal yarı kalın, yıkıcı eylem kırmızı. Arkada karartma ve bulanıklık. Açılış kritik sönümlü yay (1.1 → 1) ve solma; Azaltılmış Hareket’te yalnız solma. Dışarı dokunmak kapatmaz. Görününce uyarı titremesi.

Aynı pencere: sohbeti kapat, engelle, gruptan ayrıl, sunucudan ayrıl / sunucuyu sil (ad yazma durur), kanal / kategori / klasör / rol sil, at, Valorant bağlantısını kaldır, lobiyi kapat, hesabı sil (şifre alanı durur). Masaüstü ve web kendi kutularını korur.

Mesaj silme artık iPhone’da onay ister: başlık “Mesajı sil”, gövde “Bu mesaj herkes için silinecek. Bu işlem geri alınamaz.”, İptal ve kırmızı Sil. Uzun basış menüsü ve üzerine gelince çıkan silme. Uyarı titremesi pencerede, başarı silme oturunca, hata olursa hata titremesi. DM ve grup silme artık sunucuda da herkes için siler (önceden olay gidiyor, satır duruyordu). Masaüstünde onay kutusu yok; silme yine hemen gider. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.179**. Yalnız iPhone. Sistem Dokunuşları açık.

- [ ] Bir DM’yi kapat: ortadan cam uyarı, kalın ortalanmış başlık, ortalanmış gövde, İptal yarı kalın, “Sohbeti kapat” kırmızı, düğmeler saç teliyle ayrık. Dışarı dokununca kapanmaz. Açılınca uyarı titremesi.
- [ ] Aynı cam: engelle, gruptan ayrıl, sunucudan ayrıl / sunucuyu sil, klasör veya rol sil, at, Valorant bağlantısını kaldır, lobiyi kapat, hesabı sil.
- [ ] Mesaja uzun basıp sil: “Mesajı sil” / herkes için / İptal ve kırmızı Sil. Pencere açılınca uyarı, silinince başarı, olmazsa hata titremesi. DM, grup ve sunucu kanalı.
- [ ] Azaltılmış Hareket: yay yok, yalnız solma.
- [ ] Masaüstü / tarayıcı: eski kutular durur, mesaj silme yine onaysız.

## Cihaz düzeltmeleri · 2.9.178

Giden 1:1 aramada kendi büyük avatarı sese tepki vermiyordu. iOS, dokunuştan sonra açılan AudioContext’i askıda bırakıyor; CallKit ses oturumu da eski analizörü susturuyordu. Mikrofon yakalama, dokunuşun içinde context’i uyandırır; CallKit `didActivate` grafiği yeniden kurar. Halka ~25 fps, karo ekran dışındayken ve uygulama gizlenince durur. Sessizde halka yok. Azaltılmış Hareket nabız yerine sabit yeşil halka. Camda halka fotoğrafın merkezinde, seviye ile büyür. Aynı grafik grup araması ve sunucu ses odasında da kullanılır. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.178**. Yalnız iPhone. Sistem Dokunuşları açık kalabilir; bu tur ses halkası.

- [ ] Xest gibi birine ara, açılmasını beklemeden konuş: kendi büyük avatarının çevresinde yeşil halka sesine göre nabız atar. Çerçeve ortada kalır.
- [ ] Sessize alınca halka hemen söner. Tekrar açınca konuşunca geri gelir.
- [ ] Karşı taraf açınca hem sende hem onda halka çalışır.
- [ ] Grup araması ve sunucu ses odasında kendi sesin halkayı yakalar.
- [ ] Azaltılmış Hareket açıkken nabız yok; konuşurken sabit yeşil halka durur.
- [ ] Masaüstü / tarayıcıda arama ekranı eskisi gibi.

## Cihaz düzeltmeleri · 2.9.177

iPhone’da dokunuşlar tek bir yerden titrer: `src/lib/fluid/haptics.js`. Web, Electron ve Android sessiz. Sistemin Haptics anahtarı UIKit’te durur; Azaltılmış Hareket animasyonu kısar, onay titreşimini kesmez. Aynı tür 50 ms içinde ikinci kez çalmaz. Kaydırma ve basılı tutulan jest tekrar etmez; eşik bir kez.

Seçim: sekme, çip, filtre, tema, durum, emoji, tepki, anahtar. Hafif: birincil düğme, ek menüsü, emoji seçici, profil sayfası, yanıt eşiği, geri kaydırma, sayfayı aşağı bırakma. Orta: uzun basış menüsü, satır menüsü, sabitleme, sürükleyerek sıralama, aramayı kapatma. Başarı: kendi mesajın, arkadaş kabulü, mağaza alış/günlük ödül, kayıt, kopyalama, arama bağlandı. Uyarı: engelle, sunucudan ayrıl, hesap sil, at, rol sil. Hata: gönderilemeyen mesaj, alış, kayıt, giriş. Gelen mesajda ve listede kaydırırken yok. App Store’a gönderilmedi.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.177**. Yalnız iPhone. Ayarlar → Ses ve Dokunuş → Sistem Dokunuşları açık.

- [ ] Sekme değiştir, çip veya tema seç: kısa seçim tiki. Aynı sekmeye tekrar basınca susar.
- [ ] Mesaj gönder: bir başarı tiki. Gelen mesajda tik yok. Gönderilemezse hata tiki.
- [ ] Mesaja uzun bas: menüyle birlikte orta tik, basılı tutarken tekrar yok. Yanıt eşiğinde bir hafif tik.
- [ ] Profil aç: hafif tik. Aşağı sürükleyip bırakınca bir hafif tik daha.
- [ ] Sessize al / kamerayı kapat: seçim. Aramayı kapat: daha tok. Arama bağlanınca bir başarı.
- [ ] Engelle, sunucudan ayrıl veya hesabı sil onayı açılınca uyarı tiki.
- [ ] Masaüstü / tarayıcıda hiç titreşim yok.

## Cihaz düzeltmeleri · 2.9.175

Demir’in 2.9.174 iPhone testi. DM’de karşı kullanıcının avatarına veya adına dokununca profil iki kez açılıyordu ve tam kart, yüzen sohbet başlığının altında kalıyordu.

Tam kart `position: fixed` olduğu halde sohbet panelinin `overflow` / `background-attachment` kutusuna sıkışıyordu; başlık (z-index 60) banner’ı kesiyordu. Cam profil artık `document.body` üzerinde tek bir sayfa: güvenli alanın altında (`max(8%, safe-top + 12px)`), arkada karartılmış blur örtü, aşağı sürükleyince yay + hız devri, örtüye veya × ile kapanma. Azaltılmış hareket 0.2s solma, sürükleme kapalı. iOS dokunuşu `mouseenter` ürettiği için camda küçük hover kartı hiç açılmaz; masaüstünde hover duruyor. Uzun ad tek satırda ellipsis, rozet ve Certified aynı satırda. İçerik aynı: banner, avatar + durum, ad efekti, taç, Certified, @kullanıcı · durum, YÖNETİCİ, Riot kartı, biyografi, Üyelik Tarihi, Ortak Arkadaşlar, Özel durum, Mesaj Gönder / Arkadaşlar, Engelle / Şikayet. Aynı kart grup sohbeti, sunucu kanalı ve üye listesinden de açılır. App Store’a gönderilmedi. `mobile-glass.css` duruyor.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.175**. Yalnız iPhone, cam açık.

- [ ] DM’de karşı kullanıcının avatarına veya adına bir kez dokun: yalnız bir cam profil açılır. Altta küçük kart (YÖNETİCİ / Certified / Silver) çıkmaz.
- [ ] Kart Dynamic Island ve sohbet başlığının altında durur; banner kesilmez. Arkada sohbet kararır ve bulanıklaşır.
- [ ] Örtüye dokununca, × ile veya banner’dan aşağı sürükleyince kapanır. Hızlı sürükleme kartı aşağı bırakır.
- [ ] Uzun yönetici adı tek satırda kesilir; rozet alta kaymaz.
- [ ] Grup sohbetinde ve sunucu kanalında da tek kart, aynı yerde açılır.
- [ ] Masaüstü / tarayıcı eski profil kartı; üzerine gelince küçük kart duruyor.

## Cihaz düzeltmeleri · 2.9.174

Demir’in 2.9.171 iPhone testi, dördüncü madde. Yanıtlarken önizleme (“Yanıtlanıyor …” + alıntı) 52px kapsülün içine eziliyordu: yazı alanı kayboluyor, iptal × gönder okunun üstüne biniyordu.

Önizleme artık kapsülün üstünde ayrı bir cam şerit: yanıt ikonu, “Yanıtlanıyor &lt;isim&gt;”, tek satır alıntı (ellipsis), şeridin sağında kendi × düğmesi. Alttaki besteci aynı (+, yazı alanı, emoji, mikrofon, gönder). Gönder ile × çakışmaz. Şerit standart yay ile girer çıkar (ζ = 1, 0.35s); iptal klavyeyi kapatmaz. Düzenleme bu şeridi kullanmaz; balonun içinde Kaydet / İptal olarak durur. App Store’a gönderilmedi. `mobile-glass.css` duruyor.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.174**. Yalnız iPhone, cam açık.

- [ ] Bir mesaja yanıtla: üstte “Yanıtlanıyor &lt;isim&gt;” ve alıntı, altta normal yazı alanı ve yer tutucu. Gönder oku × ile örtülmez.
- [ ] Uzun isim ve uzun alıntı tek satırda kesilir.
- [ ] × yanıtı kapatır, klavye açık kalır, şerit yay ile iner.
- [ ] Mesajı düzenle balonun içinde kalır (Kaydet / İptal).
- [ ] Masaüstü / tarayıcı eski besteci.

## Cihaz düzeltmeleri · 2.9.172

Demir’in 2.9.171 iPhone testi. Üç düzeltme, yeni özellik yok.

Kaydırarak yanıt ile kenardan geri çakışıyordu. Sol kenar bandı (mevcut 28px, ~20–24pt geri bölgesini kapsar) her zaman geri gider; balonun üstünde kenardan uzakta yatay kaydırma yalnız yanıttır, sayfa oynamaz. Eksen ~10px sonra kilitlenir, bir parmak bir jesti alır. Kendi mesajı sola, başkasınınki sağa yanıtlanır — yön değişmedi; çakışma başkasının sağa kaydırmasının geri jestiyle aynı eksen olmasındandı. Eşik 48px’te tek titreşim. Dikey kaydırma durmuyor.

Mağaza cüzdanı başlığın altında boşluk bırakıyordu; kayan kart başlığı aradan görünüyor, satır sert bir banttı. Hap, ölçülen başlık altına yapışır (Dynamic Island 59–62pt). Başlık ve hap tek yumuşak solmada, içerik ikisinin altından kayar.

Uzun basışta iOS metin seçimi (mavi tutamaç, “Yanıtla” dahil) kapalı. Seçim yalnız yazı alanlarında ve bestecide. Kopyala eylemleri panoyu kullanır. App Store’a gönderilmedi. `mobile-glass.css` duruyor.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.172**. Yalnız iPhone, cam açık.

- [ ] Sohbet (DM, grup, sunucu): sol kenardan sağa kaydırınca yalnız geri git. Sayfa kayar, balon yanıtlamaz.
- [ ] Başkasının balonunda, kenardan uzakta sağa kaydırınca yalnız yanıt. Sayfa yerinde kalır. Eşikte tek titreşim.
- [ ] Kendi balonunda sola kaydırınca yanıt. Sağa kaydırmak yanıtlamaz.
- [ ] Balonu yukarı kaydırınca liste kayar; ne geri ne yanıt tetiklenir.
- [ ] Uzun basış: menü açılır, mavi seçim tutamacı çıkmaz (menü, balon, liste, başlık). Bestecide metin seçilir.
- [ ] Mağaza: aşağı kaydırınca DesCoin hapı + “Bannerlar · N” başlığın hemen altında, arada kart başlığı yok, sert bant yok. Kartlar alttan kayıp solar.

## Carry-over polish · 2.9.171

Stage 7’nin kalan cila turu. Yeni özellik yok. Duyuru rozeti, var olan okunmamış sayacından (`GET /api/announcements/unread/count`); sayaç yoksa rozet çizilmez. Duyuru satırı ikonu kayıtlı `emoji` + `color` alanından; bilinen glif Lucide, diğerleri glif olarak kalır. Mesaj menüsünde “Daha fazla tepki” smile-plus. Arkadaş davetinde altın satır “Sen 100 · onlar 50 DesCoin” (mağaza metni duruyor). Ekle sayfasında Hızlı Ekle / Arkadaş / Grup, kullanıcı alanı ikonu ve “Kullanıcı adıyla arkadaşlık isteği gönder”. Ses üye satırı 30px; kanal “···” camda gizli, menü eylemleri duruyor. Kanal yer tutucusu `#genel'e mesaj yaz…`. Özel durum yer tutucusu kırpılmıyor. Bu turdan sonra Stage 7 mühendisliği, Demir’in cihaz testinde sorun çıkmazsa kapalıdır. App Store’a gönderilmedi. `mobile-glass.css` duruyor. Ölçüler: `docs/glass-redesign/compare/stage7/REPORT.md`.

## Round 3 audit fixes · 2.9.170

Dimaru’nun 2.9.169 turu. Uzun basışta menü, parmak ne kadar tutulursa tutulsun ilk kalkışta satırı çalıştırmaz; yeni basış çalıştırır. Mağaza cüzdanı başlığın altında yumuşak blur. Davet kartında başlık satırı; günlük ve eşya kartları cam. Başkasının profilinde bannersız şerit, 22pt durum noktası, üyelik tarihi. Sunucu menüsü düz bildirim satırları ve ayrı kırmızı sahip/ayrıl satırı. Profil düzenleme grupları, bildirim dipnotu kartın altında, arama listesi 16pt yukarı, Oyna çipleri tek satır ve mod renkleri. App Store’a gönderilmedi. `mobile-glass.css` duruyor. Ölçüler: `docs/glass-redesign/compare/stage7/REPORT.md`.

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
