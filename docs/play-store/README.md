# Google Play yayın altyapısı (com.descall.app)

Bu klasör ve `.github/workflows/android-build.yml`, Descall Android uygulamasını Google Play'e
çıkarmak için gereken her şeyi hazırlar. Şu an **hiçbir şey yayınlanmıyor**: Google Play
geliştirici hesabı henüz açılmadı. Site (indirme sayfası ve yapılandırılmış veri) bilerek
Google Play bağlantısı göstermiyor; `frontend/scripts/playStoreListing.selftest.mjs` bunu
denetliyor. Uygulama Play'de yayınlanınca o test ve sayfalar birlikte güncellenmeli.

| Dosya | Ne işe yarar |
|---|---|
| `listings/<dil>/title.txt` | Uygulama adı (en fazla 30 karakter) |
| `listings/<dil>/short_description.txt` | Kısa açıklama (en fazla 80 karakter) |
| `listings/<dil>/full_description.txt` | Tam açıklama (en fazla 4000 karakter). App Store metninden türetildi; iPhone'a özgü satırlar (arama ekranı, Apple ile giriş) Android'e uygun hale getirildi |
| `listings/<dil>/release_notes_template.txt` | Sürüm notu şablonu (en fazla 500 karakter, köşeli parantezleri doldur) |
| `content-rating.md` | İçerik derecelendirme (IARC) anketi, hedef kitle, reklam, uygulama erişimi, ön plan hizmeti beyanı |
| `data-safety.md` | Veri güvenliği formu taslağı (gizlilik politikasından türetildi) |
| `screenshots.md` | Simge, öne çıkan grafik ve ekran görüntüsü planı (boyutlar ve ekranlar) |
| `assetlinks.template.json` | Android App Links doğrulama dosyası şablonu (parmak izleri boş) |

Diller: tr-TR (varsayılan), en-US, de-DE, es-ES, fr-FR, pt-BR, ru-RU. Uzunluk sınırları, yasaklı
kelimeler ve emoji olmaması selftest ile kontrol ediliyor.

## Android uygulamasında bu işle değişenler

- `versionName` artık `frontend/package.json` sürümünü izliyor (iOS'taki MARKETING_VERSION gibi).
  `versionCode` iş akışında 2020-01-01'den beri geçen UTC dakika sayısı (iOS'taki zaman damgalı
  build numarasının karşılığı); her derleme bir öncekinden büyük olur. Yerel derlemede
  `major * 1000000 + minor * 1000 + patch` kullanılır, yerel derlemeyi Play'e yükleme.
- `targetSdk` / `compileSdk` 36 (Android 16): Play'in güncel hedef API şartını karşılıyor.
  Capacitor 8.5, Android Gradle Plugin 8.13, Gradle 8.14.3, Java 21, `minSdk` 24.
- Davet bağlantıları (App Links): `https://descall.com/servers/join/*`, `/invite/*`, `/i/*`,
  `/s/*` ve `descall://` uygulamada açılır (`DescallDeepLinkPlugin.java` +
  `src/lib/deepLinks.js`). `www.descall.com` yönlendirdiği için listede yok.
- İzinler: kullanılmayan `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_CAMERA` ve
  `FOREGROUND_SERVICE_MEDIA_PROJECTION` kaldırıldı (Play her biri için beyan ve video ister).
  Android 11 ve altı Bluetooth kulaklık için `BLUETOOTH` (maxSdk 30) eklendi.
- `google-services.json` olmadan derlenen APK artık push kaydında çökmüyor; push sadece kapalı
  kalıyor (`DescallPushConfigPlugin.java`, `src/lib/nativePush.js`).

## Sahibin yapacakları (sırayla)

### 1. Geliştirici hesabı (25 dolar, tek seferlik)

1. https://play.google.com/console/signup adresinden hesap aç. Hesap türü: **Kişisel**
   (şirket kurduysan **Kuruluş**, bunun için D-U-N-S numarası gerekir).
2. 25 dolarlık kayıt ücretini öde, kimlik doğrulamasını ve telefon doğrulamasını tamamla.
   Kimlik onayı birkaç gün sürebilir.
3. Önemli: 13 Kasım 2023'ten sonra açılan **kişisel** hesaplarda üretime (herkese açık
   yayına) çıkmadan önce **kapalı test** zorunlu: en az **12 test kullanıcısı** testi kabul
   etmiş olmalı ve **14 gün kesintisiz** testte kalmalı. Sonra Console'dan üretim erişimi
   başvurusu yapılır (aşağıda 9. adım).

### 2. Uygulamayı oluştur

Play Console > Uygulama oluştur:
- Uygulama adı: `Descall`
- Varsayılan dil: Türkçe (tr-TR)
- Uygulama veya oyun: Uygulama; Ücretsiz
- Geliştirici Programı Politikaları ve ABD ihracat yasaları beyanlarını onayla.

Paket adı ilk AAB yüklenince `com.descall.app` olarak kilitlenir ve bir daha değişmez.

### 3. Yükleme anahtarını (upload keystore) oluştur

Bu anahtar sadece Play'e yükleme için kullanılır; asıl imzalama anahtarını Google tutar
(Play App Signing, 6. adım). Yine de kaybetme: kaybolursa Console'dan sıfırlama istemek gerekir.

Bilgisayarda (JDK kurulu olmalı; Android Studio ile gelen `keytool` da olur), deponun **dışında**
bir klasörde:

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore descall-upload.jks \
  -alias descall-upload \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Demir Sarp Kurtlar, O=Descall, C=TR"
```

- Şifre sorulduğunda uzun, benzersiz bir şifre ver. PKCS12'de anahtar şifresi depo
  şifresiyle **aynı** olur; iki secret'a da aynı şifreyi gir. Şifrede ters bölü (`\`) kullanma.
- `descall-upload.jks` dosyasını ve şifreyi parola yöneticisine ve ikinci bir yedeğe koy.
- Bu dosyayı **asla** depoya ekleme (`.gitignore` zaten `*.jks`, `*.keystore`,
  `keystore.properties` ve `google-services.json` dosyalarını dışlıyor).

Yükleme anahtarının SHA-256 parmak izi (assetlinks için lazım olacak):

```bash
keytool -list -v -keystore descall-upload.jks -alias descall-upload | grep SHA256
```

Secret için base64'e çevir:

```bash
# Linux
base64 -w0 descall-upload.jks > descall-upload.jks.b64
# macOS
base64 -i descall-upload.jks -o descall-upload.jks.b64
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("descall-upload.jks")) | Set-Content -NoNewline descall-upload.jks.b64
```

### 4. GitHub secret ve değişkenlerini ekle

GitHub > Settings > Secrets and variables > Actions.

Secrets:

| Ad | İçerik | Gerekli mi |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `descall-upload.jks.b64` dosyasının içeriği | İmzalı derleme için (dördü birlikte) |
| `ANDROID_KEYSTORE_PASSWORD` | Depo şifresi | İmzalı derleme için |
| `ANDROID_KEY_ALIAS` | `descall-upload` | İmzalı derleme için |
| `ANDROID_KEY_PASSWORD` | Anahtar şifresi (PKCS12'de depo şifresiyle aynı) | İmzalı derleme için |
| `ANDROID_GOOGLE_SERVICES_JSON` | Firebase `google-services.json` dosyasının metni (7. adım) | Push bildirimleri için |
| `PLAY_SERVICE_ACCOUNT_JSON` | Play yükleme servis hesabının JSON anahtarı (8. adım) | Otomatik yükleme için |

Variables:

| Ad | Değer | Ne zaman |
|---|---|---|
| `PLAY_UPLOAD_ENABLED` | `true` | Sadece 8. adım bittikten sonra. Yoksa veya başka bir değerse yükleme işi hiç çalışmaz |

Dört imzalama secret'ı yoksa iş akışı yine geçer: debug imzalı bir APK (test için kurulabilir)
ve **imzasız** bir release AAB üretir. Bunlar dağıtım için değildir. Dördünden sadece bir kısmı
varsa iş akışı bilerek hata verir.

### 5. İş akışını çalıştır ve ilk AAB'yi elle yükle

1. GitHub > Actions > **Android build** > Run workflow (ya da `v*` etiketi push'la).
2. İş bitince Artifacts altından `descall-android-<sürüm>-<versionCode>` dosyasını indir.
   İçinde `...-release.aab` (Play için), `...-universal.apk` (doğrudan kurulum için) ve
   `SHA256SUMS.txt` var. Günlükte yükleme anahtarının SHA-256 parmak izi de yazar.
3. Yeni bir uygulamanın **ilk** AAB'si API ile yüklenemez: Play Console > Test ve yayınla >
   Test > **Dahili test** > Yeni sürüm oluştur > AAB'yi sürükle bırak > kaydet ve yayınla.

### 6. Play App Signing

İlk sürümü oluştururken Console "Play App Signing" ister: **Google tarafından oluşturulan
anahtarı** kullan (varsayılan). Böylece:
- Uygulamayı Google'ın **uygulama imzalama anahtarı** imzalar,
- Sen sadece **yükleme anahtarıyla** (3. adım) imzalayıp yüklersin.

İki parmak izi de Console > Test ve yayınla > Kurulum > **Uygulama bütünlüğü** > Uygulama
imzalama sayfasında görünür: "Uygulama imzalama anahtarı sertifikası" ve "Yükleme anahtarı
sertifikası" altındaki **SHA-256** değerleri.

### 7. Firebase (push bildirimleri)

1. https://console.firebase.google.com > proje oluştur (veya var olanı kullan) > Android
   uygulaması ekle, paket adı `com.descall.app`.
2. `google-services.json` dosyasını indir, içeriğini `ANDROID_GOOGLE_SERVICES_JSON` secret'ına
   yapıştır. Dosyayı depoya koyma.
3. Backend için: Firebase > Proje ayarları > Hizmet hesapları > yeni özel anahtar oluştur;
   JSON içeriğini Render'da `FIREBASE_SERVICE_ACCOUNT_JSON` ortam değişkenine koy
   (`frontend/backend/lib/fcm.js` bunu okur; yoksa Android push kapalıdır).

### 8. Otomatik Play yüklemesi (isteğe bağlı)

1. Google Cloud Console'da bir proje seç, **Google Play Android Developer API**'yi etkinleştir.
2. IAM > Hizmet hesapları > hesap oluştur > Anahtarlar > JSON anahtar ekle. JSON içeriğini
   `PLAY_SERVICE_ACCOUNT_JSON` secret'ına koy, indirilen dosyayı sil.
3. Play Console > Kullanıcılar ve izinler > Yeni kullanıcı davet et > servis hesabının e-postası;
   Descall uygulaması için "Sürümleri test kanallarına yayınla" ve "Uygulama bilgilerini
   görüntüle" izinlerini ver.
4. `PLAY_UPLOAD_ENABLED` değişkenini `true` yap.
5. Run workflow ekranında `play_track` (`internal` = dahili test, `alpha` = kapalı test) ve
   `play_status` seç. Uygulama henüz yayınlanmadığı sürece `draft` kalmalı; taslak sürümü
   Console'dan incelemeye gönderirsin. Etiket push'unda varsayılan: `internal` + `draft`.

### 9. Mağaza kaydı, formlar ve kapalı test

1. Ana mağaza kaydı: her dil için `listings/<dil>/` dosyalarını kopyala. Grafikler için
   `screenshots.md`. Gizlilik politikası: https://descall.com/privacy
2. Uygulama içeriği: `content-rating.md` (IARC, hedef kitle 13+, reklam yok, uygulama
   erişimi için demo hesap, ön plan hizmeti beyanı ve videosu) ve `data-safety.md`.
3. Kapalı test (alpha) kanalı oluştur, en az 12 kişiyi e-posta listesi veya Google Grubu ile
   ekle, katılım bağlantısını gönder. 12+ kişi testi kabul etmiş halde **14 gün** bekle.
4. Console > Kontrol paneli > **Üretim erişimi için başvur**. Onaydan sonra üretime sürüm çık.

### 10. App Links doğrulaması (assetlinks.json)

Davet bağlantılarının tarayıcı yerine doğrudan uygulamada açılması için:

1. `assetlinks.template.json` dosyasını `frontend/public/.well-known/assetlinks.json` olarak
   kopyala.
2. `REPLACE_WITH_PLAY_APP_SIGNING_KEY_SHA256` yerine 6. adımdaki **uygulama imzalama
   anahtarı** SHA-256 değerini, `REPLACE_WITH_UPLOAD_KEY_SHA256` yerine **yükleme anahtarı**
   SHA-256 değerini yaz (büyük harf, iki nokta üst üsteli biçimde, ör. `AB:CD:...`, 32 bayt).
   Yükleme anahtarı, Play dışından kurulan `universal.apk` için gerekli.
3. Yer tutucu içeren dosyayı **asla** yayınlama: `src/site/pagesWorkerRoutes.selftest.mjs`
   dosya varsa her parmak izinin gerçek bir SHA-256 olduğunu kontrol eder. Worker,
   `_headers` ve `vercel.json` bu yolu zaten `application/json` olarak, yönlendirmesiz sunuyor;
   dosya yokken yol 404 döner.
4. Siteyi yayınladıktan sonra kontrol et:
   - https://descall.com/.well-known/assetlinks.json 200 ve JSON dönmeli.
   - `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://descall.com&relation=delegate_permission/common.handle_all_urls`
   - Telefonda: `adb shell pm verify-app-links --re-verify com.descall.app` ve
     `adb shell pm get-app-links com.descall.app` (descall.com için `verified` görmelisin).

### 11. Yayından sonra

- İndirme sayfası, `src/site/jsonLdBuilders.js` (SoftwareApplication `downloadUrl` /
  `installUrl` / `sameAs`) ve `playStoreListing.selftest.mjs` içindeki "Google Play bağlantısı
  yok" kontrolü birlikte güncellenir.
- Her yeni sürümde: `frontend/package.json` sürümünü yükselt, iş akışını çalıştır, sürüm
  notunu `release_notes_template.txt` şablonuyla Console'a yaz.

## Bilinen eksikler (sonraki işler)

- Bildirim kanalları: backend `incoming_calls` ve `descall_default` kanal kimlikleriyle push
  gönderiyor ama uygulama bu kanalları oluşturmuyor; Android bildirimleri "Diğer" varsayılan
  kanalına düşürür (çalışır ama arama bildirimi öne çıkmaz). Kanalları yerelleştirilmiş adlarla
  `MainActivity` içinde oluşturmak gerekir.
- Android 12+ Bluetooth kulaklık mikrofonu için çalışma zamanında `BLUETOOTH_CONNECT` izni
  istenmiyor.
- Google ile giriş Android WebView içinde Google tarafından engellenebilir; gerçek cihazda
  denenmeli. Çalışmıyorsa Android'de düğme gizlenmeli.
- Data safety formu bir "hesap silme" web adresi istiyor; şimdilik
  https://descall.com/privacy veriliyor. Adım adım anlatan ayrı bir sayfa daha sağlam olur.
- iOS `apple-app-site-association` dosyası grup davetlerini (`/invite/<kod>`, `/i/<kod>`) ve
  `/s/<slug>` bağlantılarını içermiyor; Android ile eşitlemek ayrı bir iş.
- `release.yml` GitHub sürümlerine APK eklemiyor; indirme sayfasındaki Android bağlantısı
  GitHub Releases sayfasına gidiyor.
- Bu altyapı yerelde Android SDK ve Gradle indirilmeden yazıldı: Gradle derlemesi ve Java
  kodu ilk kez GitHub Actions'ta derlenecek. İlk çalıştırmanın günlüğünü kontrol et.
