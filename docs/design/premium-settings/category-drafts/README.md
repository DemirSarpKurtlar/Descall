# Descall+ kategori içi taslakları (A-E)

Ayarlar > Descall+ > bir kategori açıldığında görünen sayfa için beş taslak. Hepsi gerçek uygulamanın içinde
çizildi: ayar penceresi, sol menü, yazı tipi, renk değişkenleri ve `us-card`, `us-toggle`, `us-btn`, `pp-ico`,
`pp-pill`, `pp-cat-head` sınıfları uygulamanın kendisinden. Her taslakta bir özellik kartı açık; kart kendi
içinde açılır, canlı önizleme ve başlıklı ayar grupları gösterir. Her ekran görüntüsünden iki tane var:
`<id>-windows.png` (Pencereler) ve `<id>-audio.png` (Ses). `current-*.png` bugünkü hali.

| Taslak | Fikir |
| --- | --- |
| A, Kart ızgarası | Üç sütunlu kart ızgarası; her kartta küçük önizleme, açık/kapalı anahtarı ve ayar özeti. Açılan kart satırın tamamına yayılır: solda büyük önizleme, sağda gruplar. |
| B, İki sütun | İki sütunlu yatay kartlar, kapalıyken altında ayar özeti. Açılan kart kendi sütununda uzar: üstte önizleme şeridi, altında çizgiyle ayrılmış gruplar. |
| C, Vitrin | Açılan özellik geniş bir sahneye dönüşür: üstte tam genişlikte büyük önizleme, altında gruplar iki sütun halinde. Diğer özellikler altta dörtlü küçük kutular. |
| D, Bento | Farklı boyutlarda, önizlemesi öne çıkan kutular. Açılan kutu ızgaranın tamamını kaplar; her ayar grubu kendi kutusu olur, büyük önizleme solda. |
| E, Hikaye | Üstte kategorinin tamamını gösteren bir sahne (numaralı işaretler) ve bölüm listesi; özellikler "Arama sırasında", "Pencerelerin" gibi numaralı bölümlerde. Açılan kartta önizleme solda, gruplar sağda. |

Ortak: seçimler görsel düğmeler (ekran köşesi seçici, kenar seçici, pencere türü kutuları, cihaz kutuları,
segment düğmeleri), önizlemeler ayar değişince güncellenir (taslak sayfada tıklanabilir, kaydedilmez).
Mini mod, sürüklenip bir köşeye bırakılabilen uygulama içi cam arama kartı olarak çizildi.

## Dosyalar

- `drafts-inject.js`: taslakların tamamı (veri, önizlemeler, ayar grupları, düzenler, CSS).
- `capture.cjs`: `frontend/dist-e2e` ve sahte sunucuyla uygulamayı açar, Ultra üyelik döndürür, kategori
  kutusuna tıklar ve geri bağlantısından sonrasını taslakla değiştirir. `frontend/` içinden:
  `node ../docs/design/premium-settings/category-drafts/capture.cjs [çıkış klasörü] [current a b c d e]`.
  `CHECK=1` ile her taslakta her kartı sırayla açar ve `checklist.json` ile karşılaştırır.
- `checklist.json`: iki kategorideki her özellik ve `frontend/src/premium/settings/<key>.jsx` panellerindeki
  her ayar (Pencereler 12 özellik / 54 madde, Ses 8 özellik / 46 madde).

## Notlar

- Mini moddaki "Konum" (başlangıç köşesi) yeni bir ayar önerisi; bugünkü panelde yok, kartın köşeye
  sürüklenebilmesinden geliyor.
- Masaüstüne özel özellikler web sürümünde "Masaüstü" etiketiyle kilitli görünür; taslaklar masaüstü
  uygulamasındaki hali gösterir.
- Hata ve boş liste mesajları (kayıtlı düzen yok, mikrofon açılamadı, tarayıcı çıkış seçemiyor) birer
  durum oldukları için çizilmedi; yerleri değişmiyor.
