# Yerel ekran paylaşımı testi (DescallCaptureBench)

Bu test, yeni yerel ekran paylaşımının (Rust, `desktop/crates/descall-capture`) kendi bilgisayarında P0 kabul testlerini geçip geçmediğini ölçer. Asıl amaç yankının kalıcı olarak bittiğini kanıtlamak: paylaşımı izleyenler aramanın sesini hiçbir zaman geri duymamalı.

Test tek bir dosyadır: `descall-capture-bench.exe`. Kurulum gerektirmez, Descall'a ya da hesabına dokunmaz, internete bağlanmaz. Yaklaşık 1,5 dakika sürer.

## 1. Gerekenler

- Windows 10 2004 (build 19041) ya da daha yenisi. Windows 11 önerilir.
- Hoparlör ya da kulaklık takılı olmalı (varsayılan ses çıkışı). Ses seviyesi önemli değil, kısık da olabilir. Ses yerine ulaşmazsa kontrol satırı bunu yakalar ve yanlış bir "geçti" çıkmaz.
- İsteğe bağlı: ikinci monitör (pencereyi başka ekrana taşıma testi için), HDR monitör (HDR testi için), 1440p monitör (1440p60 testi en doğru sonucu bu durumda verir).
- Test sırasında açık oyun ya da tam ekran video olmasın.

## 2. Dosyayı almak

İki yol var, birini seç:

1. **GitHub Actions'tan (önerilen):** GitHub'da depo, sonra **Actions**, sonra soldan **Capture bench**. Son yeşil çalıştırmayı aç. Sayfanın altındaki **Artifacts** bölümünden `descall-capture-bench` dosyasını indir ve zip'i aç. İçinden `descall-capture-bench.exe` çıkar. Yeni bir çalıştırma için **Run workflow** düğmesini kullanabilirsin.
2. **Kendin derlemek istersen:** `desktop` klasöründe `cargo build --release -p descall-capture-bench` komutunu çalıştır. Dosya `desktop/target/release/descall-capture-bench.exe` konumunda oluşur.

Windows SmartScreen "tanınmayan uygulama" uyarısı verirse **Ek bilgi**, sonra **Yine de çalıştır** seç. Dosya imzasız bir test aracıdır.

## 3. Testi çalıştırmak

1. Açık uygulamaları olabildiğince kapat. Descall açıksa kapat.
2. `descall-capture-bench.exe` dosyasına çift tıkla. Siyah bir konsol penceresi açılır.
3. İlk satırlarda bilgisayarın özeti görünür: Windows sürümü, ekran kartı, monitör sayısı, HDR, ses çıkışı.
4. **Test boyunca fareye ve klavyeye dokunma.** Sırasıyla şunlar olur:
   - **Yankı testi (yaklaşık 4 sn):** Hoparlörden üç ton aynı anda duyulur: 1000 Hz, 1250 Hz ve 440 Hz. Bu normal.
   - **Seçici:** Ekranların küçük resimleri alınır, ekranda bir şey görünmez.
   - **1080p60 ve 1440p60 (her biri yaklaşık 15 sn):** Ekranın sol üstünde renk değiştiren bir pencere açılır. Üst kenarında siyah beyaz bir şerit (barkod) vardır. Gecikmeyi bu şeritten ölçeriz.
   - **Pencere takibi (yaklaşık 8 sn):** "DescallCaptureBench follow" adlı pencere kayar, varsa ikinci monitöre geçer, büyür, üstü başka bir pencereyle kapanır, en sonda kendiliğinden kapanır.
   - **Renk ve HDR (yaklaşık 5 sn):** Altı gri şeritli bir pencere açılır. HDR monitör varsa pencere o monitörde de bir kez açılır.
5. Sonunda bir tablo ve `JSON report: ...` satırı çıkar. Pencere, Enter'a basana kadar açık kalır.

Gelişmiş seçenekler (komut isteminden):

| Seçenek | Ne yapar |
|---|---|
| `--only echo` | Yalnızca yankı testini çalıştırır. Gruplar: `echo,video,follow,color,picker` |
| `--seconds 20` | 60 fps ölçümlerini daha uzun yapar (varsayılan 10 sn) |
| `--out C:\rapor.json` | Raporu başka bir yere yazar |
| `--list` | Yalnızca ekran ve pencere listesini, cihaz yeteneklerini yazar |
| `--ci` | Sonda Enter beklemez |

## 4. Tabloyu okumak

Her satırın sonucu: **PASS** (geçti), **FAIL** (kaldı), **SKIP** (bu bilgisayarda çalıştırılamadı, sebebi altında yazar), **INFO** (yalnızca bilgi, karar vermez). En alttaki satır `P0 OK` ise bütün kabul testleri geçmiştir. `P0 FAILED` ise en az bir test kalmıştır.

| Satır | Ne ölçer | Sınır |
|---|---|---|
| Echo: own 1 kHz tone in loopback | Descall'ın kendi çaldığı ses (aramadaki konuşmalar yerine 1 kHz ton) paylaşılan seste ne kadar duyuluyor | **-60 dBFS altı**. Pratikte -100 civarı görmeyi bekliyoruz (hiç duyulmuyor). |
| Echo: child process tone (tree) | Aynı ölçüm, Descall'ın açtığı alt süreçteki ses için. Gerçekte aramanın sesini WebView2 alt süreci çalar, bu yüzden bu satır en az ilki kadar önemli. | -60 dBFS altı |
| Other app audio is captured | Başka bir uygulamanın sesi (oyun, YouTube yerine 440 Hz) paylaşıma giriyor mu | **-40 dBFS üstü** |
| Echo control: tones reached mixer | Kontrol ölçümü. Test tonlarının gerçekten çalındığını doğrular. Bu kalırsa yankı satırlarının sonucu geçersizdir. | -30 dBFS üstü |
| Echo guard audit (info) | Ses oturumlarının Descall'ın süreç ağacının içinde olup olmadığını denetler. Ağacın dışına kaçmış bir WebView2 sesi bulursa FAIL olur. | kaçak yok |
| Picker sources + live thumbnails | Seçicideki her ekranın canlı küçük resmi var mı, yenileme kaç ms sürüyor | her ekranda resim |
| 1080p60: added latency p95 | Yerel yolun eklediği gecikme (GPU dönüşümü, GPU'dan okuma, halkaya kopya), %95'lik değer | **≤ 5 ms** |
| 1080p60: added CPU | Yakalamanın eklediği işlemci yükü (Görev Yöneticisi gibi, bütün çekirdeklere göre) | **≤ %3** |
| 1440p60: frame drops | 1440p60'ta kaybolan kare oranı | **≤ %1** |
| ... glass-to-ring p95 (info) | Pencerenin çizildiği andan karenin halkaya yazıldığı ana kadar geçen toplam süre (Windows'un ekran birleştirmesi dahil) | bilgi |
| Window follow: moved / other monitor / resized / covered | Paylaşılan pencere taşınınca, başka monitöre geçince, boyutu değişince ve üstü kapanınca görüntü sürüyor mu | saniyede en az 15 kare |
| Cursor toggle mid-share | Paylaşım sırasında imleci açıp kapatma | ikisi de uygulanmalı |
| Window closed ends the share | Pencere kapanınca paylaşım kendiliğinden bitiyor mu | 3 sn içinde |
| Colour accuracy (SDR path) | Gri şeritlerin parlaklığı izleyiciye doğru gidiyor mu | en fazla 4 birim hata |
| HDR ...: SDR content not washed out | HDR açıkken normal içerik soluk mu. Beyaz gri olmamalı. | en fazla 8 birim hata, beyaz ≥ 222 |
| HDR histogram ... (info) | HDR monitörün tek karesinin parlaklık dağılımı (16 kutu). Ortalama ve patlayan piksel oranı. | bilgi |

Notlar:

- Ekran kartı "Microsoft Basic Render Driver" (yazılımsal) çıkarsa 60 fps ve renk satırları ölçülür ama karar verilmez (INFO). Bu, sürücü kurulu olmayan ya da uzak masaüstündeki makinelerde olur.
- Monitör 1440p'den küçükse 1440p60 satırının altında `captured ...x...` yazar. 1440p kararını 1440p ya da daha büyük bir monitörde ver.
- Monitör 60 Hz'den hızlıysa (144 Hz gibi) kare düşüşü 60 fps hedefe göre hesaplanır.
- **HDR'ı göz ile de kontrol et:** Windows Ayarlar, Sistem, Ekran, HDR'ı aç ve testi çalıştır. Sonra Descall'da bir arkadaşınla ekranını paylaş, karşı tarafta görüntü soluk ya da gri görünmemeli. Raporun `hdr.histogram` kısmındaki `meanY` normal bir masaüstünde 60 ile 180 arasında olur. `clippedPct` değerinin %20'yi geçmesi, parlak alanların patladığı anlamına gelir.
- **Gerçek bir uygulamayla yankı kontrolü (isteğe bağlı, 1 dakika):** Descall'da bir arkadaşınla sesli aramadayken bir YouTube videosu aç ve ekranını sesle paylaş. Arkadaşın YouTube'u duymalı ama kendi sesini geri duymamalı. Test, bunu otomatik olarak tonlarla ölçer. Bu adım yalnızca gönül rahatlığı için.

## 5. Sonucu iletmek

Pencerenin altında yazan JSON dosyasını (varsayılan olarak exe ile aynı klasörde `descall-capture-report.json`) bize gönder. Ekran görüntüsü yerine bu dosya tercih edilir, çünkü bütün ölçümler içinde. Dosyada kişisel bilgi yoktur: Windows sürümü, ekran kartı adı, monitör çözünürlükleri, ölçüm sonuçları ve o an ses çalan uygulamaların süreç adları (ör. `chrome.exe`) bulunur. Pencere başlıkları dosyaya yazılmaz.

## 6. Bir satır FAIL olursa

| Satır | İlk yapılacak |
|---|---|
| Echo satırlarından biri | **En önemlisi.** Raporu hemen gönder. Bu düzelene kadar yerel yolda ses paylaşımı kapatılır (yalnızca görüntü, L2). |
| Echo control | Ses çıkışı yok ya da devre dışı. Hoparlörü veya kulaklığı tak, Windows ses ayarlarından varsayılan çıkışı seç, tekrar dene. |
| Other app audio | Windows'un uygulama sesi yakalaması bu sürümde çalışmıyor olabilir. Windows Update'i çalıştır, tekrar dene. |
| 1080p60 gecikme / CPU, 1440p60 düşüş | Ekran kartı sürücüsünü güncelle, dizüstündeysen prize tak ve "En iyi performans" güç modunu seç, `--seconds 20` ile tekrar çalıştır. |
| Window follow | Raporu gönder. `details` kısmı hangi adımın kaldığını gösterir. |
| Colour / HDR | Raporu gönder. Windows HDR ayarındaki "SDR içerik parlaklığı" değerini de yaz. |

P0 kararı (plan bölüm 6): bütün kabul satırları geçmeli. Biri kalırsa uygulama o bilgisayarlarda WebView2'nin kendi ekran paylaşımına (L4) düşer ve sorun yeniden değerlendirilir. Yankı kuralı L4'te de geçerlidir: yankısız ses garanti edilemiyorsa ses hiç paylaşılmaz.
