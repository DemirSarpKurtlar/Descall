# Descall · Liquid Glass (buzlu cam) — Uygulama Planı

*Hazırlanma: 9 Ekim 2026 · Kod tabanı: `main` @ `71b5863` (sürüm **2.9.150**, `v2.9.150` tag'li) · Yalnızca plan — kod değişikliği yok.*

Kaynaklar: onaylı mockuplar `/workspace/glass-redesign/final/*.png` (440×956 pt, @3x = 1320×2868), mockup kaynağı `final/src/glass.css` + `final/src/screens-*.mjs`, `design-notes.md`, `feature-inventory.md`, ve tasarım kuralları `/workspace/design/apple-design.md`.

---

## 0. Özet (bir paragrafta)

Yeniden tasarımı 7 aşamada, her aşama ayrı bir TestFlight sürümü olarak yapıyoruz. **Kural 1: Ekran, onaylı mockup ile birebir aynı olacak** (yerleşim, renk, cam malzemesi, köşe yarıçapları, boşluklar, yazı tipi, ikonlar, konumlar, metinler). Yalnızca örnek veriler (isimler, mesajlar) gerçek verilerle değişir. Her aşamada gerçek ekranın görüntüsü mockup'ın yanına konup otomatik ve göz ile karşılaştırılır; fark kalırsa sürüm çıkmaz. **Kural 2: Özellik eşitliği** — hiçbir özellik eklenmez/çıkarılmaz. **Kural 3: Masaüstü (Electron) ve web bozulmaz** — cam görünümü önce yalnızca iOS uygulamasında açılır (bir platform sınıfı + uzaktan kapatılabilir anahtar ile). Toplam süre ~1,5–2 hafta; sürümler 2.9.151'den başlar.

---

## 1. Kodda bulduklarım (planın dayandığı gerçekler)

| Konu | Gerçek durum | Plana etkisi |
|---|---|---|
| Uygulama iskeleti | Tek layout: `frontend/src/components/layout/AppLayout.jsx`. Mobilde `.app-root.is-mobile`; kök sekmelerde **sol NavigationRail + liste "drawer"** gösteriliyor; alttaki `.mobile-tab-bar` kodda var ama `ui-polish.css` içinde `display:none` (6 öğe + "Sen", eski sıra). | Aşama 2'de bu tab bar, `navConfig.buildMainNavItems` (7 öğe, doğru sıra) ile yeniden kurulup yüzen cam bar olur; mobilde rail gizlenir, avatar üst araç çubuğuna taşınır (durum seçici + Ayarlar aynı kalır). |
| Platform tespiti | `main.jsx` → `html.electron-app` (Electron) ve `html.native-app` (Capacitor iOS **ve** Android). `lib/platform.js` → `isNativeIOS()`. `hooks/useMobile.js` → UA + `innerWidth ≤ 768`. | Yeni sınıf: `html.glass-ui` — **yalnızca** iOS native + mobil genişlikte. Tüm yeni CSS bu sınıfın altında; Android, mobil web, masaüstü hiç etkilenmez. |
| CSS mimarisi | `src/styles.css` 40+ dosyayı `@import` ediyor (~34.700 satır). En büyükleri `app-layout.css` (4.940), `servers.css` (4.801), `ui-polish.css` (2.903), `settings.css`, `design-tokens.css` (15 tema). `styles/mobile-glass.css` **hiçbir yerde import edilmiyor** (v2.9.10'dan kalma ölü dosya). | Yeni stiller ayrı klasörde: `src/styles/glass/` (tokens, material, shell, ekran dosyaları), `styles.css`'in **en sonuna** import. Eski `mobile-glass.css` kullanılmaz (aynı sınıf adları çakışır). |
| Temalar | `data-theme`: dark, light + 13 premium tema (Mağaza'dan satın alınan: midnight, crimson, ocean, …). `App.jsx` ~899-937 temayı uyguluyor. | Mockuplar yalnızca varsayılan koyu tema. Premium tema/açık mod ile cam ilişkisi Demir'e soru (bkz. §6). |
| Hareket kodu | `framer-motion` v11 (83 dosyada). Swipe-back için **kendi fizik motorumuz** var: `lib/edgeSwipeBack.js` (`createSpring` damping/response, momentum projeksiyonu 0.998, rubber-band 0.55, birim testli) + `hooks/useEdgeSwipeBack.js` (DOM'a doğrudan yazan, React render'sız sürücü, haptik aynı karede). Kullanım: `AppLayout.jsx` (iç ekran geri + kök sekmede rubber-band), `UserPanel.jsx` ~2331, `LfgWorkspace.jsx` ~101. | Yeni kütüphane eklemiyoruz. Bu fizik çekirdeği `lib/fluid/` altına ortak modül olarak çıkarılır; framer-motion yay ayarları Apple değerlerinden türetilir. |
| Diğer jestler | `layout/SwipeRevealRow.jsx` + `ServerSidebar.jsx` (`SwipeableDmRow`, `SwipeableGroupRow`): her harekette React state, yalnızca konuma göre karar (hız yok). `MessageList.jsx` ~815: framer `drag` ile kaydır-yanıtla, yalnız ofset eşiği. | Davranış aynı kalır; his Apple kurallarına göre iyileştirilir (hız işaretiyle karar, momentum, yay ile hız aktarımı). |
| Mesaj menüsü | Dokunmatikte balona **dokununca** `.message-hover-bar` açılıyor: 5 hızlı tepki, Daha fazla tepki, Yanıtla, Sabitle/Kaldır, Düzenle, Sil (`MessageList.jsx` ~1020-1100). | Mockup 04 bunu odaklı cam menü olarak gösteriyor; öğeler birebir aynı. Tetikleyici sorusu §6'da. |
| Haptik | `lib/haptics.js` → `hapticLight()` (Capacitor Haptics, yalnız iOS). | Basma/snap anlarında aynı karede kullanılır. |
| Güvenli alanlar | `index.html`: `viewport-fit=cover`. `capacitor.config.ts`: `contentInset: "never"`, `backgroundColor #1E1F22`. `styles/native-app.css` güvenli alan bantlarını boyuyor. | Cam ambient arka planı tüm ekranı (çentik/Island ve home indicator dahil) kaplar → siyah bant olmaz; içerik `env(safe-area-inset-*)` ile Island altından başlar. |
| Erişilebilirlik | `prefers-reduced-motion` birkaç yerde var. **WKWebView `prefers-reduced-transparency`'yi desteklemiyor** (Safari/iOS 27.2'de bile yok). Low Power Mode web'e hiç açık değil. iOS hedefi **15.0** (iPhone 6s'e kadar). | Küçük bir native eklenti gerekir (`DescallDisplayPlugin.swift`): Reduce Transparency, Increase Contrast, Low Power, termal durum. iOS 15–17 için `-webkit-backdrop-filter` önekleri zorunlu. |
| Mockup üretimi | Mockuplar Chrome (Playwright) ile, 440×956 @3x, font olarak **Inter** (sistemde SF yok) ve **Lucide** ikonlarıyla (uygulamadaki `lucide-react` ile aynı set) çizildi. | Birebir eşleşme için uygulamada da Inter kullanılmalı (zaten `@fontsource/inter` paketli) — §6 soru 3. |
| Ekran görüntüsü altyapısı | `/workspace/shotkit`: sahte backend (`mock-server.cjs`, `data.cjs`), sahte Capacitor iOS köprüsü (`inject.js`), 440×956 @3x iPhone profili. | Mockup karşılaştırma hattının temeli hazır; sadece mockup verisiyle aynı demo verisi + diff aracı eklenecek. |
| Sürüm/yayın | `electron/sync-version.cjs` 3 `package.json` + Xcode `MARKETING_VERSION`'ı yazar; `frontend/package-lock.json` içindeki 2 alan (`version` ve `packages[""].version`) elle. `v*` tag → `ios-testflight.yml` **ve** `release.yml` (Windows masaüstü sürümü). `main`'e push → `vercel-deploy.yml` (web). | Her aşama, masaüstü ve web'e de aynı anda gider → platform kapısı (gate) şart, yoksa masaüstü/web kullanıcıları yarım tasarımı görür. |
| iOS'ta Oyna | `lib/publicFeatures.js`: iOS native'de **Valorant Companion gizli** (App Review). `ValorantHub.jsx` yalnız Companion+LFG ikisi de varsa sekme gösteriyor. | Mockup 17'deki "Companion / LFG" anahtarı iOS'ta **gösterilmeyecek** (özellik eşitliği + App Review). Masaüstü/web'de aynen kalır. |
| Görüşme self-PIP | `CallOverlay.jsx` yerel önizleme sürüklenemiyor. | Mockup 06'daki PIP konumu birebir uygulanır ama **sürükleme eklenmez** (yeni özellik olurdu). |

---

## 2. Genel teknik yaklaşım

### 2.1 Platform kapısı (masaüstü/web koruması)
- `main.jsx` `bootApp()` içinde: `isNativeIOS()` doğruysa `html.platform-ios`; buna ek olarak glass anahtarı açıksa `html.glass-ui`. Mobil genişlik koşulu CSS'te: tüm glass kuralları `html.glass-ui .app-root.is-mobile …` altında (iPad yatay/geniş ekranda masaüstü düzeni korunur).
- Anahtar üç katmanlı: (1) derleme sabiti `VITE_GLASS_UI` (varsayılan açık), (2) uzaktan kapatma `publicFeatures.iosGlass` (backend `server.js` public features — yeni build gerekmeden kapatılabilir), (3) geliştirici için `localStorage["descall:glass"]="0"`.
- JS tarafında yeni bileşenler/davranışlar `useGlassUi()` hook'u ile seçilir; kapalıyken eski JSX aynen render edilir. Böylece Electron, web ve Android'de **byte düzeyinde aynı DOM ve CSS etkisi** kalır.
- Otomatik koruma testi (selftest): `html.glass-ui` olmadan, yeni CSS dosyalarındaki her seçicinin `.glass-ui` ile başladığını doğrulayan `styles/glass/glass-scope.selftest.mjs`; ayrıca masaüstü 1440×900 ve web mobil ekran görüntülerinin aşama öncesi/sonrası piksel karşılaştırması (fark = 0 olmalı).

### 2.2 Malzeme (cam) sistemi — mockup değerleri birebir
`final/src/glass.css`'teki değerler **kopyalanarak** `src/styles/glass/tokens.css`'e taşınır (yuvarlama/yeniden yorumlama yok):
- Renk: `--brand #587AF6`, `--deep #0D0E13`, metin `--t1…--t4`, durum renkleri `#30D158/#FFD60A/#FF453A/#8E8E93`.
- Ölçü: `--top: 60px` (Island altı chrome), `--bar-bottom: 24px`, `--r-card 22px`, `--r-sheet 38px`, 8pt grid.
- Malzeme sınıfları: `.g-glass` (blur 26 + saturate 190% + brightness 1.06), `.g-heavy` (blur 40, sheet/menü), `.g-chip` (blur 16), `.g-lens` (seçili sekme), `.tint-brand/red/green`; specular kenar (`::before` maske gradyanı) ve iç kırılma (`::after` inset gölge) aynen.
- Ambient arka plan (5 katmanlı radial gradyan) `position:fixed; inset:0` tek katman — Island ve home indicator bölgesi dahil; böylece **üstte/altta siyah bant olmaz**.
- Önek: her `backdrop-filter` ile birlikte `-webkit-backdrop-filter` (iOS 15–17 yalnız önekliyi tanır); maske için `-webkit-mask-composite: xor`.
- Mockup kodunda ekran başına özel ölçüler (`screens-*.mjs` inline stiller) ekran dosyalarına taşınır: `styles/glass/shell.css`, `chat.css`, `call.css`, `social.css`, `settings.css`, `shop.css`, `play.css`, `auth.css`.

### 2.3 "Gerçek blur" ile "statik cam" ayrımı (performansın anahtarı)
Arka plan yumuşak, sabit bir gradyan. Sabit gradyanın blur'u, gradyanın kendisiyle neredeyse aynı görünür. Bu yüzden:
- **Gerçek `backdrop-filter`** yalnızca altında içerik kayan/değişen yüzeylerde: üst başlıklar, yüzen tab bar, composer, menüler/sheet'ler, arama kontrol çubuğu (video üstü), scroll-edge şeritleri.
- **Statik cam** (aynı gradyan dolgu + specular kenar + gölge, blur yok): liste kartları (LFG kartları, mağaza ürünleri, ayar grupları, arkadaş davet kartı). Görsel olarak mockup'la aynı kalır (diff testiyle doğrulanır), maliyeti ~sıfır.
- Bütçe: ekranda aynı anda **en fazla 4 büyük + 6 küçük** gerçek blur yüzeyi.

### 2.4 Hareket (motion) kütüphanesi — `src/lib/fluid/`
- `physics.js`: `lib/edgeSwipeBack.js`'teki `createSpring`, `project()` (0.998), `rubberband()` (0.55), `clamp` buraya taşınır; `edgeSwipeBack.js` buradan import eder (mevcut selftest'ler aynen geçmeli).
- `springs.js`: Apple tablosu → ön ayarlar: `default {damping 1.0, response 0.35}`, `sheet {0.8, 0.3}`, `move {1.0, 0.4}`, `flick {0.8, 0.35}`. framer-motion için dönüşüm: `stiffness = (2π/response)²`, `damping = 4π·ζ/response` (kütle 1). Tek yerden yönetilir.
- `usePressFeedback()`: `pointerdown`'da anında `scale(0.97)` + vurgulama (100 ms), `pointerup`'ta yayla dönüş; parmak 10 px dışarı kayarsa iptal. `touch-action: manipulation` ile 300 ms gecikme yok.
- `useDragSpring()`: Pointer Events + `setPointerCapture`, tutma ofseti korunur, son 90 ms hız geçmişi; bırakınca **hız işareti** ile karar, momentum projeksiyonu, hızla yaya devir; animasyon ortasında tekrar yakalanabilir (canlı değerden başlar). Swipe-back sürücüsüyle aynı tasarım.
- `useMaterialize()`: cam yüzeyi açılırken blur yarıçapı + ölçek birlikte (yalnızca fade değil); kapanırken aynı yoldan geri.
- Tüm kare animasyonları yalnızca `transform`/`opacity` (+ açılışta blur), React render'sız DOM yazımı.

### 2.5 Erişilebilirlik ve güç tasarrufu
- Yeni native eklenti `ios/App/App/DescallDisplayPlugin.swift` (`DescallBridgeViewController.capacitorDidLoad` içinde kayıt): `UIAccessibility.isReduceTransparencyEnabled`, `isDarkerSystemColorsEnabled`, `ProcessInfo.isLowPowerModeEnabled`, `thermalState`; değişim bildirimleriyle JS'e olay gönderir → `html.a11y-solid`, `html.a11y-contrast`, `html.glass-lite`.
  - **Reduce Transparency** → tüm cam yüzeyler opak (`rgba(20,21,30,0.96)`), blur yok.
  - **Increase Contrast** (+ CSS `prefers-contrast: more`) → neredeyse opak + belirgin 1 px kenar.
  - **Low Power / termal "serious"** → `glass-lite`: blur 26→12 px, saturate yok, kenar parlaması statik.
  - **Reduce Motion** (`prefers-reduced-motion`, WebKit destekli) → kaydırma/yay yerine 200 ms çapraz geçiş; sıçrama yok; haptik ve renk geri bildirimi kalır.
- **Dynamic Type**: aralıklar `rem`, metin kırpılması yok; `-apple-system-body` yerine ölçek değişkeni (mockup boyutu %100 = varsayılan).
- VoiceOver: yeni tab bar `role="tablist"`/`aria-selected`, menüler `role="menu"`, mevcut `aria-label`'lar korunur. Dokunma hedefi ≥ 44 pt.
- Cam üstünde metin: mockup'taki `--t1/--t2` yüksek kontrastlı değerler; gri düz metin yok. WCAG AA kontrast kontrolü diff hattında.

### 2.6 Performans bütçesi
| Cihaz sınıfı | Hedef | Kural |
|---|---|---|
| A15+ (iPhone 13 ve sonrası) | Kaydırmada 60 fps (ProMotion'da 120'ye yakın), kare süresi < 8–16 ms | Tam malzeme |
| A12–A14 (XS/XR, 11, 12) | 60 fps, uzun kaydırmada en fazla %2 kare kaybı | Gerçek blur yüzey sayısı ≤ 3 büyük |
| A9–A11 (6s–X, iOS 15–16) | 50+ fps | Otomatik `glass-lite` (model, native eklentiden `hw.machine`) |
- Çalışma anında kare izleyici: ilk 10 saniyede rAF ile kare süresi ölçülür; %10'dan fazla 32 ms+ kare varsa oturum boyunca `glass-lite`.
- Arama sırasında (video kod çözme + blur): kontrol çubuğu dışında gerçek blur yok; ekran paylaşımı açıkken `glass-lite`.
- Bellek: her `backdrop-filter` bir GPU katmanı; uzun listelerde satır başına blur **yasak** (statik cam kullanılır).
- `scripts/perf-budget.mjs` (mevcut) JS/CSS paket bütçesine yeni dosyalar dahil; glass CSS hedefi < 25 KB gzip.

### 2.7 Mockup ile birebir eşleşme süreci (her aşamada zorunlu)
**İlke:** Mockup "kaynak gerçek"tir. Fark kalırsa sürüm çıkmaz. Sadece örnek veriler farklı olabilir — ve bunu da ortadan kaldırmak için karşılaştırma ortamında **mockup'taki aynı demo verisi** kullanılır.

1. **Demo veri seti** — `shotkit/data.cjs`'e mockup verisinin aynısı: Ayşe Yılmaz, Mert K., Can Demir, Elif, Burak Ö., Selin A., Kaan; "Akşam Ekibi" grubu; mesajlar, saatler (21:16, 21:02…), rozet sayıları, DesCoin 8.325, mağaza ürünleri (Emerald Forest 280, Aurora Borealis 300) vb. Saat 9:41'e sabitlenir.
2. **Çekim** — `shotkit` sahte iOS köprüsü + 440×956 @3x, mockup ile **aynı motor (Chrome)** ve aynı font → 1320×2868 PNG. Her mockup için bir senaryo (ör. 02-chats'te Mert satırı "kaydırılmış" durumda, 04'te menü açık). İkinci geçiş Playwright **WebKit** ile (iOS'a özgü hatalar için: önekler, maske, blur).
3. **Otomatik diff** — yeni araç `glass-redesign/compare/compare.mjs`:
   - Piksel: `pixelmatch` (eşik 0.1), sabit maske yalnızca sistem durum çubuğu (y < 54) ve home indicator (mockup bunları çizer, cihaz kendi çizer). Çıktı: `mockup | uygulama | ısı haritası` yan yana PNG + farklı piksel yüzdesi. **Kabul: ≤ %0,5** (yalnız anti-aliasing/blur gürültüsü).
   - Geometri: mockup HTML'inde ve uygulamada aynı `data-gid` adları (ör. `tabbar`, `toolbar-avatar`, `search`, `row-1-avatar`, `composer`) → iki tarafın `getBoundingClientRect()` değerleri karşılaştırılır. **Kabul: konum/boyut ±1 px, köşe yarıçapı birebir.**
   - Stil: aynı öğeler için hesaplanan `font-family/size/weight/letter-spacing/line-height`, renkler, `backdrop-filter`, gölge değerleri JSON olarak karşılaştırılır. **Kabul: birebir.**
   - Metin: Türkçe kopya mockup'la karakter karakter aynı (i18n anahtarları `src/i18n` içinde gerekirse düzeltilir — örn. "Sohbetler", "Kapat", "Okundu").
4. **Göz kontrolü (diff checklist, ekran başına)** — yerleşim ve hizalar · renkler/tonlar · cam malzemesi (blur, kenar parlaması, gölge) · köşe yarıçapları · boşluklar (8pt) · yazı tipi/kalınlık/izleme · ikonlar (Lucide adı, boyut 20, çizgi 1.9) · konumlar (Island altı 60, alt bar 24) · metinler · durum noktaları/rozetler · kaydırma altı (scroll-under) görünümü.
5. **Cihaz doğrulaması** — Demir'in TestFlight'tan aldığı ekran görüntüleri (aynı demo hesabıyla) compare aracına verilir; cihazda (SF yerine Inter, gerçek Island) fark raporu.
6. **Düzelt → yeniden çek → tekrar diff** döngüsü; tüm ekranlar yeşil olmadan tag atılmaz. Rapor: `glass-redesign/compare/report-<sürüm>.html`.

Bilinen kaçınılmaz farklar (önceden kabul edilmesi gerekenler): gerçek kullanıcı verisi/avatar fotoğrafları; WebKit ile Chrome arasındaki blur pürüzü (piksel diff eşiği içinde); cihazın sistem durum çubuğu.

---

## 3. Aşamalar

> Sürüm numaraları "en erken" değerlerdir: main şu an 2.9.150. Aradaki bir düzeltme sürümü numaraları bir kaydırır. **2.9.147 (App Store incelemesinde) ve 2.9.148–150'ye dokunulmaz.**
>
> Her aşamanın yayın adımı aynı: (1) tüm selftest'ler + `npm run build:prod`, (2) mockup diff raporu yeşil, (3) masaüstü/web "fark = 0" kontrolü, (4) `node frontend/electron/sync-version.cjs X.Y.Z` + `frontend/package-lock.json` içindeki iki `version` alanı, (5) commit + push, (6) `vX.Y.Z` tag → TestFlight (ve Windows masaüstü sürümü — glass kapalı olduğu için görsel değişiklik yok).

### Aşama 1 — Cam temeli (+ pilot ekran: Giriş) · **2.9.151** · ~1,5 gün
**Amaç:** Görünmez altyapıyı kurmak ve bir ekranda kanıtlamak.
**Ekranlar/dosyalar:**
- Yeni: `src/styles/glass/tokens.css`, `material.css`, `auth.css`; `src/lib/fluid/{physics,springs}.js`, `src/hooks/{usePressFeedback,useDragSpring,useMaterialize,useGlassUi}.js`; `ios/App/App/DescallDisplayPlugin.swift` (+ `project.pbxproj` kaydı, `DescallBridgeViewController.swift` `capacitorDidLoad`).
- Değişen: `src/main.jsx` (html sınıfları), `src/styles.css` (son import), `src/lib/edgeSwipeBack.js` (fizik `lib/fluid`'den), `src/lib/publicFeatures.js` + `backend/server.js` (`iosGlass` anahtarı).
- Pilot: **01-login** — `components/AuthView.jsx`, `components/auth/*` (Apple/Google butonları, ForgotPasswordFlow, TermsConsent), `components/brand/DescallBrand.jsx` (**orijinal Descall logosu**, mockup'taki boyut/konum), `styles/auth-splash.css`'in glass karşılığı.
**Teknik:** §2.1–2.5. Login, navigasyona dokunmadan malzemeyi, fontu, güvenli alanı ve diff hattını uçtan uca test etmeye uygun (önerilen küçük sapma: outline'da login ayrı bir aşamada yoktu).
**Apple ilkeleri:** anında basma geri bildirimi; materyalleşme; sistem font ayarı; reduce motion/transparency/contrast.
**Demir TestFlight kontrol listesi:**
- [ ] Giriş ekranı mockup 01 ile yan yana aynı (logo, sekmeler, Apple → Google → "veya" → form sırası, butonlar)
- [ ] Üstte/altta siyah bant yok; hiçbir şey Island'ın altında kalmıyor
- [ ] Butona basınca **parmak değer değmez** küçülüyor (bırakmayı beklemiyor)
- [ ] Ayarlar › Erişilebilirlik › Şeffaflığı Azalt açıkken cam opak oluyor; kapatınca geri dönüyor
- [ ] Hareketi Azalt açıkken geçişler sadece solma
- [ ] Düşük Güç Modu'nda uygulama akıcı, cam hafifliyor
- [ ] Giriş/kayıt/şifremi unuttum/Apple/Google girişleri eskisi gibi çalışıyor
- [ ] (Masaüstü/web: değişiklik yok — bilgisayarda bir kere açıp bakmak yeterli)
**Riskler:** Native eklenti → Xcode projesi değişir (build kırılabilir) → önce CI'da derle, eklenti yoksa JS sessizce varsayılana döner. Inter/SF kararı ertelenirse diff hiç tutmaz → Soru 3 Aşama 1'den önce.

### Aşama 2 — Navigasyon kabuğu · **2.9.152** · ~2 gün
**Amaç:** Yüzen 7 sekmeli cam bar, cam başlıklar, içeriğin camın altından kayması.
**Ekranlar:** Tüm kök sekmelerin iskeleti (02-chats/02b-groups başlık+bar kısmı, 09, 11, 19, 20 başlıkları); 18-status (durum seçici, avatar).
**Dosyalar:** `components/layout/AppLayout.jsx` (`.mobile-tab-bar` → glass bar, `buildMainNavItems` + `filterMainNavItems` ile 7 öğe; LFG kapalıysa Oyna gizlenir — bugünkü davranış), `layout/navConfig.js`, `layout/NavigationRail.jsx` (glass-ui'de mobilde gizli; avatar + `status-picker-portal` üst araç çubuğuna), `layout/ServerSidebar.jsx` (liste başlıkları: büyük başlık, Ara, Duyurular rozeti, Geri Bildirim, Ekle), `styles/native-app.css` + `mobile.css` (glass-ui'de `--mobile-tab-bar-h` yeniden), `hooks/useEdgeSwipeBack.js`, `styles/edge-swipe-back.css`, yeni `styles/glass/shell.css`.
**Teknik:** Bar `position:fixed; bottom: calc(env(safe-area-inset-bottom) + …)`, mockup'taki 24 px yüzme; liste içerikleri alta/üste `padding` ile camın altına uzar; başlık yüksekliği ResizeObserver ile `--glass-top-inset` değişkeninde. Scroll-edge: alt/üstte maske gradyanı (çizgi yok). Seçili sekme "lens"i bir sonrakine `move` yayıyla kayar (dokunmaya hemen başlar). Sekme geçişi iOS'taki gibi anında (kaydırma animasyonu yok); `AppLayout`'taki `VIEW_EASE` 0.38 s geçişi glass-ui'de çapraz geçişe iner. Klavye açıkken bar gizlenir (`html.kb-open`, mevcut). İç ekranlarda (DM/grup/kanal, Ayarlar, Oyna) bar yok — bugünkü `showMobileTabBar` mantığı aynen.
**Apple ilkeleri:** translucent chrome + scroll-under; scroll edge effect; mekânsal tutarlılık (lens kayması); swipe-back 1:1 + hız aktarımı (mevcut, korunur).
**Kontrol listesi:**
- [ ] Bar mockup 02 ile aynı: 7 sekme, sıra Sohbetler · Gruplar · Sunucular · Oyna · Arkadaşlar · Aktivite · Aramalar, rozetler
- [ ] Listeyi kaydırınca satırlar camın altından bulanık geçiyor, çizgi yok
- [ ] Sekmeye basınca anında tepki; lens yumuşakça kayıyor
- [ ] Avatar sol üstte; dokununca durum seçici (4 durum + özel + Kullanıcı Ayarları) — mockup 18
- [ ] Bir sohbete girince bar kayboluyor; kenardan kaydırarak geri dönüş parmağı takip ediyor, yarıda bırakınca hızına göre tamamlıyor/geri dönüyor
- [ ] Klavye açılınca bar klavyenin üstünde asılı kalmıyor
- [ ] Ekle (+), Duyurular, Geri Bildirim, Ara eskisi gibi açılıyor
**Riskler:** Rail kaldırılınca rail'e bağlı akışlar (Ekle, Admin, Ayarlar) erişilemez olabilir → navigasyon envanteri selftest'i (her eski rail aksiyonunun glass-ui'de bir karşılığı var). `ServerSidebar` drawer mantığı (`mobileDrawerOpen`) ile çakışma → drawer glass-ui'de tam sayfa liste olarak kalır, sadece rail sütunu gizlenir.

### Aşama 3 — Sohbetler, DM, Gruplar, mesaj menüsü, ek, composer · **2.9.153** · ~2,5 gün
**Ekranlar:** 02-chats (satırlar + kaydırma eylemleri), 02b-groups, 03-dm, 04-msg-menu, 05-attach, 16-notifications (Duyurular modalı).
**Dosyalar:** `layout/ServerSidebar.jsx` (`DMList`, `DmRowContent`, `SwipeableDmRow`, `GroupList`, `SwipeableGroupRow`, `DmContextMenu`, `GroupContextMenu`), `layout/SwipeRevealRow.jsx`, `layout/ChatPanel.jsx` (kapsül başlık: geri · avatar+isim+durum · Ara · Sabit(rozet) · Ses · Video · Engelle), `chat/MessageList.jsx`, `chat/MessageBubble.jsx`, `chat/MessageReactions.jsx`, `chat/VoiceMessagePlayer.jsx`, `chat/TypingIndicator.jsx`, `chat/MessageComposer.jsx` (ek menüsü ~702: Görsel Yükle, Dosya Yükle, GIF Gönder), `chat/GiphyPicker.jsx`, `social/AnnouncementsModal.jsx`; CSS: `messages.css`, `ui-polish.css` (`.message-hover-bar`, `.msg-quick-react`), `voice-message.css`, `chat-bubbles-atelier.css` (kozmetik balonlar korunur) → `styles/glass/chat.css`.
**Teknik:** Satır kaydırma: `SwipeRevealRow` `useDragSpring`'e geçer (React state yerine DOM; açık/kapalı kararı hız işareti + projeksiyon; Kapat'ta tam kaydırma). Kaydır-yanıtla: aynı sürücü, eşikte haptik. Mesaj menüsü: arka plan karartma + blur, seçili balon yerinde kalır, emoji çubuğu üstte, liste altta; menü balondan doğar (`transform-origin`), aynı yoldan kapanır. Composer yüzen cam kapsül, klavyeyle birlikte (`useMobileKeyboard`). Kozmetik balonlar, isim efektleri, kod blokları birebir korunur.
**Apple ilkeleri:** doğrudan manipülasyon, hız işaretiyle karar, rubber-band, kaynağa bağlı menü, karart-odakla, çok duyulu geri bildirim (snap anında haptik).
**Kontrol listesi:**
- [ ] 02/02b/03/04/05/16 mockuplarla yan yana aynı
- [ ] Satırı sola kaydır: Sabitle/Sessiz/Okundu/Kapat — parmağı takip ediyor, hızlı fırlatınca açılıyor, ters yönde bırakınca kapanıyor
- [ ] Mesaja (sağa/sola) kaydırınca yanıtla, titreşim tam yakalandığı anda
- [ ] Mesaj menüsü: 5 tepki + daha fazla, Yanıtla, Sabitle, Düzenle, Daha fazla tepki, Sil (başkasının mesajında Düzenle/Sil yok) — hepsi çalışıyor
- [ ] Ek menüsü yalnız 3 seçenek; GIF seçici açılıyor
- [ ] Sesli mesaj kaydı/oynatma, düzenlendi etiketi, sabitlenmiş, "Yeni mesajlar" çizgisi, yazıyor…
- [ ] Klavye açıkken composer klavyeye yapışık, mesaj listesi kaymıyor
- [ ] Uzun bir sohbeti hızlı kaydır: takılma yok
**Riskler:** `MessageList.jsx` (1177 satır) en kırılgan yer → değişiklikler `glass-ui` dalında, eski JSX aynı. Kaydırma ile swipe-back çakışması → mevcut `SWIPE_BACK_BLOCKERS` + yatay kilit eşiği (10 px) korunur.

### Aşama 4 — Aramalar · **2.9.154** · ~2 gün
**Ekranlar:** 06-call-11, 07-group-call, 08-incoming, 19-calls.
**Dosyalar:** `components/CallOverlay.jsx` (`ParticipantGrid`, `ParticipantTile`, `LocalVideoTile`, `CallQualityHud`, `AudioDevicePanel`, `MoreMenuItem`, küçültülmüş görünüm), `voice/SpeakingRings.jsx`, `voice/ParticipantStateIcons.jsx`, `voice/ScreenShareQualityPanel.jsx`, `voice/IncomingCallCard.jsx`, `GroupCallIncomingModal.jsx`, `ActiveCallBanner.jsx`, `calls/CallsView.jsx`; CSS: `calls.css`, `incoming-call.css`, `voice-ui.css`, `voice-speaking.css`, `voice-chat.css` → `styles/glass/call.css`.
**Teknik:** Kapsül başlık (isim · süre · kalite), 6'lı kontrol çubuğu (Mikrofon, Kulaklık, Kamera, Ekran paylaş + kalite rozeti, Diğer, Bitir) tek gerçek blur yüzeyi; video kutuları blur'suz. Konuşma halkası mevcut mantıkla, mockup rengi/kalınlığıyla. Kontrol açılır menüleri kontrolden doğar. Arama sırasında `glass-lite` kuralları (§2.6). CallKit / ses yolu / bildirim kapatma koduna **dokunulmaz** (yalnız görünüm).
**Kontrol listesi:**
- [ ] 06/07/08/19 yan yana aynı
- [ ] 1:1 sesli + görüntülü arama, grup araması (2×2 ızgara), gelen arama Kabul/Reddet (uygulama açıkken ve CallKit'ten)
- [ ] Mute/deafen/kamera/ekran paylaşımı/Diğer menüsü/Bitir; ses aygıtı paneli
- [ ] 10 dk görüşmede telefon aşırı ısınmıyor, takılma yok (eski sürümle karşılaştır)
- [ ] Aramalar sekmesi: 5 filtre, geri ara/video, hızlı ara
**Riskler:** Video + blur GPU yükü → yalnız kontrol çubuğu blur; termal "serious"ta otomatik lite. Arama kodu kritik → yalnız sınıf/yapı değişir, hook'lar (`useCall`, `useGroupCall`, `useIosCallKitBridge`) değişmez; mevcut selftest'ler (`useCall.selftest.mjs`, `speakingIndicator.selftest.mjs`) zorunlu.

### Aşama 5 — Arkadaşlar, ekleme, sunucular, kanallar, sunucu menüsü, profil · **2.9.155** · ~2,5 gün
**Ekranlar:** 09-friends, 10-add-friend, 11-servers, 12-server-channel, 13-server-menu, 14-profile, 14b-profile-edit.
**Dosyalar:** `layout/ServerSidebar.jsx` (`FriendsList`, ekle modalı ~444: Hızlı Ekle/Arkadaş/Grup), `friends/InviteCard.jsx`, `servers/ServersSidebar.jsx` (sunucu rayı, yazı/ses kanalları, ses üyeleri, `serverMenu`), `servers/ServerVoicePanel.jsx`, `servers/Server*Modal.jsx` (yalnız açılış kabı), `servers/ServerIcon.jsx`, `layout/ChatPanel.jsx` (kanal başlığı), `social/UserProfileModal.jsx`, `social/UserProfilePopover.jsx`, `ui/Cosmetics.jsx` (banner/çerçeve/unvan korunur), `layout/UserPanel.jsx` (`case "profile"` ~1278: Avatar, Kimlik, Hakkımda, Banner, Özel durum); CSS: `servers.css` (4.801 satır — dokunmadan üstüne glass katmanı), `settings.css`, `avatar.css`, `cosmetics*.css` → `styles/glass/social.css`.
**Teknik:** Profil sheet'i `sheet` yayı (0.8/0.3), aşağı sürükleyerek kapatma mevcutsa korunur (yoksa eklenmez); kozmetikler (premium banner/çerçeve/isim efekti) cam altında doğru katmanda. Sunucu menüsü başlıktan doğar.
**Kontrol listesi:**
- [ ] 7 ekran yan yana aynı
- [ ] Arkadaş isteği kabul/red, mesaj/arama butonları, davet kartı (DesCoin), link kopyala/paylaş
- [ ] Sunucu → kanal → mesaj → geri kaydırma zinciri; ses kanalına girme
- [ ] Sunucu menüsü: Roller, Davet, Ayarlar, Topluluk, İkon, Bildirim seviyeleri, Ayrıl
- [ ] Başkasının profili: banner, çerçeve, unvan, Valorant, bio, Mesaj/Arkadaşlar, Engelle/Şikayet
- [ ] Profil düzenle: avatar kırpma, banner, özel durum kaydediliyor
**Riskler:** `servers.css`'in büyüklüğü ve özgüllük savaşları → glass kuralları ayrı dosya + `html.glass-ui` öneki ile yüksek özgüllük, `!important` yasak (mevcut `native-app.css` kalıbı hariç). Kozmetik kombinasyonları çok → shotkit'te 3 farklı kozmetik profili de çekilir.

### Aşama 6 — Ayarlar, bildirimler, Oyna, Aktivite, Mağaza · **2.9.156** · ~2 gün
**Ekranlar:** 15-settings, 15b-settings-notifications, 17-play, 20-activity, 21-shop, 21b-shop-items (18-status Aşama 2'de, 16 Aşama 3'te yapıldı).
**Dosyalar:** `layout/UserPanel.jsx` (gruplar: Hesap/Uygulama/Medya/Kişiselleştirme + Çıkış; `case "notifications"` ~2036; kendi swipe-back'i ~2331), `settings/ShopPanel.jsx` (cüzdan hapı, günlük ödül, InviteCard compact, kategori chip'leri, ürün kartları), `settings/ShopProfilePreview.jsx`, `shop/*Gift*.jsx`, `valorant/ValorantHub.jsx`, `lfg/LfgWorkspace.jsx`, `activity/ActivityView.jsx`, `activity/ActivitySidebar.jsx`; CSS: `settings.css`, `shop.css`, `valorant.css`, `lfg.css` → `styles/glass/{settings,shop,play}.css`.
**Teknik:** Ayar grupları statik cam (blur yok); anahtarlar (toggle) iOS gibi basışta anında, yayla. Oyna: **iOS'ta Companion/LFG segmenti gösterilmez** (bugünkü kural), yalnız LFG içeriği mockup 17 düzeninde. Mağaza ürün kartları statik cam; gradyan önizlemeleri ana katalogdan (2.9.148 düzeltmesi korunur).
**Kontrol listesi:**
- [ ] 6 ekran yan yana aynı (Oyna'da Companion sekmesi bilinçli olarak yok)
- [ ] Ayarlar: her alt sayfa açılıyor, kenardan kaydırarak geri
- [ ] Bildirim anahtarları ve iPhone izin satırı çalışıyor
- [ ] LFG: filtreler, oluştur, katıl, parti kodu
- [ ] Aktivite: durum, Durum Ayarla, Arkadaşlar/Geçmiş
- [ ] Mağaza: günlük ödül al, satın al/kuşan, bakiye güncelleniyor, hediye pop-up'ları
**Riskler:** `UserPanel.jsx` 2.587 satır, birçok sekme → sadece kap/grup/satır bileşenleri (`SettingRow`, `Toggle`) glass varyantına geçer, iş mantığı yerinde kalır. Uzun mağaza listesi → satır başı blur yok.

### Aşama 7 — Son QA + App Store güncellemesi · **2.9.157** · ~1,5 gün
- Tüm 25 ekranın son diff raporu (Chrome + WebKit + cihaz görüntüleri), hepsi kabul eşiğinde.
- Cihaz matrisi: en eski desteklenen (iOS 15/16 bir cihaz varsa), bir A12–A14, bir güncel Pro; Reduce Transparency / Increase Contrast / Reduce Motion / Low Power / büyük yazı boyutu kombinasyonları.
- Özellik envanteri (`feature-inventory.md`) satır satır tik: hiçbir özellik eksik/fazla değil.
- Masaüstü (Electron, Windows) ve web (masaüstü + mobil tarayıcı) görüntüleri aşama-0 ile piksel-aynı.
- Sentry'de yeni hata tipi yok (TestFlight dönemi).
- App Store ekran görüntüleri (`/workspace/appstore-screenshots`, shotkit) yeni tasarımla yeniden üretilir, "Bu sürümde yenilikler" metni; gönderim yalnızca Demir onaylayınca.
- Ölü kod temizliği önerisi: kullanılmayan `styles/mobile-glass.css` (davranış değişikliği yok) — Demir onaylarsa.

**Toplam:** ~14 gün (aşama başına 1,5–2,5 gün, Demir'in TestFlight turu dahil) ≈ 2 hafta — birebir-diff kuralı nedeniyle anlaşılan 1,5–2 haftanın üst ucu. Bir aşamada diff yeşile dönmezse o aşama uzar, sonrakiler kayar.

---

## 4. Neden bu sıra?
1. **Önce temel:** malzeme, yay ve erişilebilirlik tek yerde doğru olursa sonraki her ekran aynı parçaları kullanır; Login, riski düşük bir kanıt ekranı.
2. **Sonra kabuk:** her ekran bar/başlık/scroll-under davranışına oturduğu için navigasyon, içerik ekranlarından önce gelmeli.
3. **En çok kullanılan yer (sohbet) üçüncü:** en büyük değer ve en çok jest burada; temel ve kabuk oturmuş olur.
4. **Aramalar ayrı:** en riskli kod yolu (CallKit, ses) — tek başına test edilmeli.
5. **Sosyal ve ayarlar sona:** daha az etkileşimli, çoğu statik cam; kalıplar artık hazır.

## 5. Koruma, geri alma ve yayın güvenliği
- **Masaüstü/web:** `html.glass-ui` sadece iOS native'de; glass CSS'in tamamı bu sınıfın altında; JSX'te `useGlassUi()` kapalıyken eski ağaç. Her aşamada masaüstü/web fark = 0 kontrolü. Her tag Windows sürümü de üretir — kullanıcılar görsel değişiklik görmez.
- **Uzaktan kapatma:** `publicFeatures.iosGlass = false` → TestFlight/App Store'daki uygulama yeni build olmadan eski görünüme döner (bir sonraki açılışta).
- **Build düzeyi geri alma:** önceki tag'in commit'inden düzeltme sürümü (yeni numara). Tag silme/force-push yok.
- **Acil App Store düzeltmesi gerekirse (yeniden tasarım yarımken):** `v2.9.150`'den (veya o an App Store'daki sürümden) bir `hotfix/…` dalı açılır, düzeltme orada yapılıp yeni numarayla tag'lenir; yarım tasarım App Store'a gitmez. Alternatif: main'den `VITE_GLASS_UI=0` ile build.
- **2.9.147** incelemede: hiçbir şekilde dokunulmaz; yeni sürümler her zaman daha yüksek numara.

## 6. Aşama 1'den önce Demir'in cevaplaması gereken sorular
1. **Cam sadece iOS mu, masaüstü/web de mi?** Önerim: önce **yalnız iOS uygulaması** (mockuplar zaten yalnız iPhone); masaüstü/web için ayrı mockup + ayrı faz, sonra karar.
2. **Açık mod ve premium temalar:** Mockuplar yalnız varsayılan koyu tema. iOS'ta açık mod veya Mağaza'dan alınmış premium tema (Ocean, Sakura…) seçili kullanıcıda ne olsun? Seçenekler: (a) glass yalnız koyu temada, diğer temalarda eski görünüm; (b) cam tonu temanın vurgu rengini alsın (mockup'ı olmayan, birebir doğrulanamayan bir görünüm olur); (c) açık mod için ayrı mockup seti. Önerim: (a) şimdilik.
3. **Yazı tipi:** Mockuplar **Inter** ile çizildi. Birebir eşleşme için iOS'ta da Inter (uygulamada zaten paketli) mi, yoksa Apple'ın sistem fontu **SF Pro** mu? SF seçilirse harf genişlikleri farklı olur ve "pikseli pikseline" kuralı metinlerde tutmaz. Önerim: Inter (birebir kuralı gereği).
4. **Kök sekmelerde kenardan kaydırma:** Bugün geri gidilecek sayfa yokken ekran lastik gibi esneyip geri dönüyor. Bunu koruyalım mı, yoksa iOS'taki gibi hiç tepki vermesin mi?
5. **Mesaj menüsünü açma şekli:** Bugün mobilde balona **dokununca** açılıyor. Mockup 04'teki odaklı menü yine dokunarak mı açılsın (bugünkü davranış, özellik eşitliği), yoksa iOS standardı **basılı tutma** ile mi? (Basılı tutma bir davranış değişikliği sayılır.)
6. **Login pilotu:** Login ekranını Aşama 1'de pilot olarak yapmamı onaylıyor musun? (Anlaşılan outline'da Login hiçbir aşamada yazmıyordu.)
7. **iOS'ta Oyna ekranı:** Mockup 17'de "Companion / LFG" anahtarı var ama iOS uygulamasında Companion App Review nedeniyle gizli. Önerim: iOS'ta anahtar gösterilmez (bugünkü gibi) — bu tek bilinçli mockup sapması; onay?
