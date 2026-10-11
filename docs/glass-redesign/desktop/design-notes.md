# Descall Masaüstü (Electron · Windows) + Web — Liquid Glass Tasarım Notları

Kapsam: 37 kare (1440×900 @2x; dar pencere 1024×768 @2x), `overview.png` iletişim sayfası, kaynak dosyalar.
Görsel dil iPhone FINAL setiyle (`../final/`) birebir aynı malzeme sistemini kullanır; yalnızca yerleşim masaüstüne çevrildi.
Özellik paritesi: her karede yalnızca bugünkü masaüstü/web uygulamasında olan öğeler var — ayrıntı `feature-inventory.md`.
Logo: depodaki orijinal Descall ikonu (`assets/brand/descall-icon.png`). © 2026 Demir Sarp Kurtlar.

## 1 · Malzeme (glass.css ile aynı tokenlar)

| Katman | Kullanım | Değer |
| --- | --- | --- |
| `glass` (standart) | başlık kapsülleri, düğme grupları, dock, toast, video etiketleri | beyaz tint `rgba(255,255,255,.06–.13)` + `blur(26px) saturate(190%)` |
| `glass.panel` (zemin) | ray, kenar çubuğu, üye listesi | tint `.035–.085` + koyu taban `rgba(18,20,30,.40)` + `blur(40px) saturate(190%)` |
| `glass.heavy` (yüzen) | menüler, modallar, popover’lar, gelen arama kartı | tint `.05–.12` + taban `rgba(20,21,30,.62)` + `blur(40px) saturate(200%)` |
| `glass-chip` | arama alanı, filtre çipleri, segment kontrol zemini | en hafif tint, iç çizgi 0.5px |
| `lens` | seçili segment / aktif ray öğesi | parlak dikey gradyan + yumuşak gölge |

Her cam yüzeyde üç katman var: (1) **speküler kenar** — `::before` ile 160° gradyanlı 1px maske kenarı (üst-sol parlak, alt-sağ yansıma), (2) **iç vurgu** — `::after` iç gölge ile kırılma hissi, (3) **yumuşak dış gölge** (`0 16–24px 40–60px` siyah %35–55).
Malzeme ağırlığı = hiyerarşi: zemin paneller en hafif, yüzen kontroller orta, geçici katmanlar (menü/modal) en ağır. Modallar arkasında `scrim` (koyu + blur 6px) — Electron’da başlık çubuğunun altından başlar (TitleBar her zaman en üstte).
Arka plan: iPhone setindeki koyu ambient (mavi/mor ışık lekeleri) — camın renk alabileceği zengin bir sahne.

## 2 · Yerleşim ızgarası

- 8 pt ızgara; panel aralığı 8 px; panel köşe yarıçapı 24 px, kart 18 px, kapsül = yükseklik/2.
- Electron başlık çubuğu 40 px (cam, Windows tarzı Küçült/Büyüt/Kapat; Kapat hover’da kırmızı). Web’de başlık çubuğu yok.
- Sütunlar (1440 px): ray 72 · liste kenar çubuğu 296 · ana alan esnek · üye listesi 256. Sunucu görünümünde kenar çubuğu içinde 64 px sunucu sütunu + kanallar.
- Ana alan başlığı **yüzen kapsüller**: solda kişi/kanal kapsülü, sağda düğme grubu (52 px). İçerik altından akar; üstte ve altta scroll-edge fade.
- Composer yüzen: + düğmesi (52 px daire) + cam alan (emoji, mikrofon, gönder).
- Dar pencere (769–1024 px): ray 64, kenar çubuğu 240, düğme grubu arama alanının yanına iner; üye listesi gizlenir.

## 3 · Tipografi

| Rol | Boyut / satır | Ağırlık | İzleme |
| --- | --- | --- | --- |
| Büyük başlık (Ayarlar, Aktivite, Aramalar) | 28–30 / 34 | 700 | −0.035em |
| Kenar çubuğu başlığı | 24 / 30 | 700 | −0.026em |
| Modal başlığı | 19–20 | 700 | −0.02em |
| Gövde / mesaj | 14–15 / 20 | 400–500 | −0.006em |
| Liste başlığı (isim) | 14 | 600 | — |
| İkincil metin | 12.5–13 | 500 | — |
| Bölüm etiketi (BÜYÜK HARF) | 11 | 700 | +0.06em |

Font: SF Pro → Inter → Segoe UI Variable yedeği. Sayılar `tabular-nums` (süre, sayaç, bakiye).

## 4 · Yüzeylere göre cam kullanımı

- **Ray**: `glass.panel`; aktif öğe `lens` + okunmamış pip; hover’da hafif tint + sağda cam tooltip.
- **Kenar çubuğu listeleri**: satır hover = `rgba(255,255,255,.06)`; seçili = marka tint `.24` + iç parlak çizgi; hover’da ⋯ cam düğme.
- **Mesajlar**: gelen balon nötr cam, giden balon marka mavisi gradyan; hover’da satır vurgusu + sağ üstte yüzen araç çubuğu (tepkiler, emoji, yanıtla, sabitle, şikayet).
- **Menüler / popover’lar**: `glass.heavy`, 12 px iç boşluk, 36–40 px satır, tehlikeli eylem kırmızı ve ayraçla ayrılır.
- **Arama ekranları**: tam pencere koyu sahne; video kutucukları 26 px köşe, konuşan kişi yeşil halka; dock tek cam kapsül, sonlandır kırmızı.
- **Ayarlar / Mağaza**: büyük cam sayfa (scrim üstünde), solda hafif tint gezinme, sağda kart grupları.
- **Toast**: sağ alt (composer’ın üstü), `glass.heavy`, ikon rengi türü belirtir (başarı yeşil, hata kırmızı, bilgi mavi, varlık = avatar).

## 5 · Hover / odak durumları

- Hover: tint +%4–6 parlaklık, imleç altındaki öğe 120 ms ease-out; tooltip 400 ms gecikme.
- Basma: `scale(.97)` yay animasyonu (iOS ile aynı his).
- Klavye odağı: 2 px koyu boşluk + 2 px `#8FA6FF` halka (`.focus`), yalnızca `:focus-visible` ile (örnek: 20 · İptal düğmesi, 11b/12c odaklı alanlar).
- Seçili/aktif: marka tint + iç vurgu; yalnızca renkle değil, ✓ veya dolgu ile de belirtilir.

## 6 · Performans (eski PC’lerde blur maliyeti)

- `backdrop-filter` GPU’da her karede yeniden örnekleme yapar; büyük alanlar (paneller) en pahalı. Öneri:
  1. **Statik zemin**: ambient arka plan tek bir önceden bulanıklaştırılmış görsel/gradyan; paneller yalnızca bunun üstünde blur yapar (scroll eden içerik paneli arkasında değil).
  2. **Blur bütçesi**: aynı anda en fazla ~6 blur katmanı; menü açılınca arkadaki kapsüller blur’u korur ama yeni katman sadece menü.
  3. **Düşük performans modu** (Ayarlar › Görünüm’e öneri; şu an uygulamada yok — yeni özellik sayılacağı için mockupa eklenmedi): `backdrop-filter: none`, tint opaklığı ×2.5 (ör. panel `rgba(24,26,36,.92)`), speküler kenar korunur. Otomatik tetik: `navigator.hardwareConcurrency <= 4`, düşük FPS ölçümü veya Windows “Saydamlık efektleri kapalı” (Electron `nativeTheme`/`systemPreferences`).
  4. **`prefers-reduced-transparency: reduce`** → aynı opak yedek.
  5. Video aramada kutucuk etiketleri küçük blur (12 px); dock tek katman.
  6. `will-change: transform` yalnızca animasyon süresince.

## 7 · Erişilebilirlik

- Kontrast: birincil metin `rgba(255,255,255,.96)` koyu cam üstünde ≥ 12:1; ikincil `.72` ≥ 7:1; üçüncül `.50` yalnızca yardımcı bilgi (≥ 4.5:1, AA). Marka mavisi üstünde beyaz metin ≥ 4.5:1 (`#587AF6`).
- Cam üstündeki metin her zaman koyu taban + blur üstünde; aydınlık arka planlara (Açık tema, açık video) karşı tint opaklığı otomatik artmalı.
- Odak halkası her etkileşimli öğede görünür; sekme sırası ray → liste → başlık → mesajlar → composer.
- Durum yalnızca renkle değil: Boşta = ay, Rahatsız Etme = çizgi, Görünmez = halka (avatar noktaları).
- **Azaltılmış hareket** (`prefers-reduced-motion`): yay animasyonları → 120 ms opaklık geçişi; gelen arama halkalarının nabzı durur; konuşma halkası sabit.
- Tüm ikon düğmeleri `title`/`aria-label` (Türkçe) taşır; mockupta da `title` ile işaretli.

## 8 · Kaynaklar ve yeniden üretim

```
desktop/
  src/desktop.css        malzeme + yerleşim (glass.css tokenları)
  src/icons.mjs          Lucide ikonları (uygulamayla aynı set)
  src/shared.mjs         demo kadrosu, avatar, ray, başlık, liste satırı, composer yardımcıları
  src/screens-a..e.mjs   kare HTML’leri (a: giriş/DM, b: grup/sunucu/1:1, c: ses/gelen arama,
                         d: arkadaşlar/profil/ayarlar/duyurular, e: Oyna/Aktivite/Aramalar/Mağaza/durum/onay/web/dar)
  src/build-screens.mjs  → src/screens/*.html
  render.mjs             Playwright → <ad>.png (@2x)
  tools/overview.mjs     → overview.png
```
Yeniden üretim: `node src/build-screens.mjs && node render.mjs [kare-adı…] && node tools/overview.mjs`
(`node_modules` → `../final/tools/node_modules` sembolik bağlantısı; Chrome `/usr/bin/google-chrome`).
