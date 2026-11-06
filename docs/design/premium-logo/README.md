# Descall+ ve Descall Ultra logo taslakları

Dört konsept var. Her konseptte bir Descall+ ve bir Ultra işareti bulunuyor. Hepsi Descall logosundaki aynı parçalardan çıkıyor: kalın uçları yuvarlak halka, ortadaki nokta ve 45 derecelik eksen.

Renkler: Descall+ mor (`#A99BFF` → `#6A60EF`), Ultra altın (`#FFCB5C` → `#E97A2C`). Altın kartın üstündeki koyu çizgiler marka kömür rengi `#2B2D3A`. Marka mavisini Descall+ için kullanmadık, çünkü aynı mavi zaten yetkili (staff) rozetinde var.

## Konseptler

- **A · Halka:** Logodaki halkadan çıkıyor. Descall+ tek bir halka ve halkanın açık ucunda bir artı. Ultra iki halka ve ortadaki noktayla bağı tamamlıyor, yani altın renkli marka sembolü.
- **B · Yayın:** Ortadaki nokta kişi, halkalar da yayılan ses. Descall+ tek halkalı. Ultra ters yöne dönük ikinci bir halka ekliyor; daha çok halka, daha üst seviye demek.
- **C · Balon:** Halkanın açık köşesi kare bir köşeye dönüşüyor ve sohbet balonu oluyor. Descall+ içinde artı olan tek bir balon. Ultra'da altın balonun arkasında mor Plus balonu duruyor, çünkü Ultra Plus'ı da kapsıyor.
- **D · Harf:** Uygulama ikonundaki yuvarlak kare ve içinde net bir harf. Descall+ için artı, Ultra için halka yayından çizilmiş bir U. En kolay okunan ve bugünkü rozete en yakın konsept bu.

## Dosyalar

- `A-plus.svg`, `A-ultra.svg` … `D-ultra.svg`: büyük kullanım için (20 px ve üstü).
- `*-small.svg`: 14–16 px için sadeleştirilmiş çizimler. Çizgiler daha kalın, aralar daha geniş. B Ultra'nın küçük çiziminde dış halka kısaldı. D Ultra'nın küçük çiziminde iç çerçeve ve nokta yok.
- `sheet.html`: sunum sayfası. Her konsept için 128 px koyu ve açık zemin, 16 ve 14 px rozet, 32 px ayar karesi, boyut merdiveni ve yazılı logo (lockup) var.
- `concept-A.png` … `concept-D.png`, `overview.png`: sayfanın 2x çıktıları.
- `build.cjs`: bütün dosyaları yeniden üretir (`node docs/design/premium-logo/build.cjs`).

## Notlar

- A konseptinde Ultra işareti, marka sembolünün altın rengi. Bu güçlü bir bağ kuruyor ama uygulama logosuyla karışabilir.
- Hiçbir dosyada emoji, raster görüntü ya da gömülü font yok. C Ultra'da bir `mask` var; React içinde satır içi kullanırken id'lerin benzersiz olması gerekiyor.
- Yazılı logolardaki "ultra" kelimesi şimdilik Inter Display ile yazıldı. Son halinde marka yazı karakteriyle çizilmesi gerekiyor.
