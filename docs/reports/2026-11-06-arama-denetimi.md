# Arama denetimi: çalma sesi ve ses düzeyi (6 Kasım 2026)

## Kısaca

- Not defterinde yalnızca "Bug 1 ringback" ve "Bug 2 ses düzeyi" yazıyordu. Ayrıntı olmadığı için iki konudaki bütün gerçek hataları aradım ve buldum.
- **Bug 1, çalma sesi (arayanın duyduğu "dıt dıt" sesi):** beş ayrı hata vardı. Hepsi düzeldi.
- **Bug 2, ses düzeyi:** dört ayrı hata vardı. Hepsi düzeldi.
- Yol üstünde iki performans sorunu buldum ve düzelttim.
- Toplam 10 commit. Her düzeltmenin kendi testi var. Testler düzeltmeden önce başarısız, sonra başarılı.
- Push yapılmadı. Dal birleştirilmeyi bekliyor.
- **Önemli:** "aynı anda arama" düzeltmesi hem uygulamayı hem sunucuyu değiştiriyor. İkisi birlikte yayına çıkmalı.

## Bug 1: çalma sesi

### 1. Çalma sesi yanlış hoparlörden çalıyordu (ana neden)

- **Ne oluyordu:** Aramalar için kulaklık seçtiysen, karşı taraf çalarken "dıt dıt" sesi bilgisayarın kendi hoparlöründen çalıyordu. Karşı taraf açınca konuşma kulaklıktan geliyordu.
- **Neden:** Konuşma sesi seçilen cihaza yönlendiriliyordu. Ama çalma sesi ve arama efektleri (bağlandı, kapandı, mikrofon kapalı gibi) sayfada görünmeyen ayrı ses öğeleriyle çalıyor. Cihaz seçimi bu öğelere hiç ulaşmıyordu.
- **Düzeltme:** Bu sesler artık aramanın hoparlöründen çalıyor. Çalma sesi, cihaz değişince yeni cihaza geçiyor. Gelen arama zil sesi, mesaj ve bildirim sesleri bilerek varsayılan hoparlörde kaldı; böylece kulaklık takılı değilken de duyulur.
- Descall+ tarafında da bir yanlışlık vardı: "bağlandı" ve "reddedildi" seslerinin adı listede yanlış yazılmıştı. Bu yüzden bu sesler bildirim hoparlörüne gidiyordu. O da düzeldi.

### 2. Grup aramasında çalma sesi hiç durmuyordu

- **Ne oluyordu:** Grup araması başlatınca çalma sesi yalnızca biri açınca duruyordu. Aşağıdaki durumlarda sen kapatana kadar çalmaya devam ediyordu:
  - herkes reddettiğinde (karşı tarafın 30 saniyelik otomatik reddi de dahil);
  - aranan kişi başka bir aramadaydı ("meşgul");
  - kimse açmadığında;
  - iki kişi aynı grupta aynı anda arama başlattığında.
- **Neden:** Ret geldiğinde yalnızca ret sesi çalıyordu, çalma sesi durmuyordu. "Meşgul" mesajını uygulama hiç dinlemiyordu. Arayan tarafta süre sınırı yoktu. Aynı anda başlatmada sunucu "mevcut aramaya katıl" diyordu ama uygulama bunu yok sayıyordu. Kişi sunucunun hiç açmadığı bir aramada tek başına kalıyordu.
- **Düzeltme:** Çalma sesi şu durumlarda duruyor: ilk kabulde, aranan herkes reddedince ya da meşgul olunca, ya da 45 saniye sonra. 45 saniye sonunda "Yanıt yok" uyarısı çıkıyor. Oda açık kalıyor, başkaları yine katılabilir. Aynı anda başlatmada uygulama kendi boş aramasını kapatıp diğer aramaya katılıyor.

### 3. Birebir aramada çalma sesi sonsuza kadar sürebiliyordu

- **Ne oluyordu:** Cevapsız aramayı 45 saniyede sunucu bitiriyor. Sunucu yeniden başlarsa (Render'da sık olur) ya da arayanın bağlantısı koparsa bu sinyal gelmiyordu. Çalma sesi sen kapatana kadar sürüyordu.
- **Düzeltme:** Arayan taraf 50 saniyede aramayı kendisi bitiriyor. Bu, sunucunun süresinden biraz sonra, yani normalde yine sunucu bitirir. Karşı taraf kilitli iPhone'da "açtım, kilidi açıyorum" durumundaysa bekleme 125 saniye.

### 4. İki kişi birbirini aynı anda arayınca kimse bağlanmıyordu

- **Ne oluyordu:** İki arkadaş birbirini aynı anda arayınca ikisi de karşının aramasını "aynı çağrı tekrar geldi" sanıyordu. İkisi de 45 saniye çalma sesi duyuyordu, sonra "Yanıt yok" çıkıyordu.
- **Düzeltme:** Artık iki taraftan yalnızca biri karşının aramasını kendiliğinden açıyor. Hangisinin açacağı sabit bir kurala göre belirleniyor. Aynı mikrofon kullanılıyor ve arada zil sesi çalmıyor. Sunucu da açılan aramanın tersini sessizce kapatıyor. Bunu yapmasaydı 45 saniye sonra bağlı aramayı "yanıt yok" diye kapatacak ve cevapsız arama kaydı yazacaktı.
- Uygulama ve sunucu birlikte yayına çıkmalı.

### 5. Arka planda zil sesi yarıya düşüyordu

- **Ne oluyordu:** Masaüstünde pencere küçültülmüş ya da başka pencerenin arkasındayken bütün sesler yarı seviyeye iniyordu. Buna gelen arama zil sesi de dahildi. Yani zil, en çok duyulması gereken anda kısıktı. Arayan başka bir uygulamaya geçince çalma sesi de yarıya iniyordu.
- **Düzeltme:** Gelen arama zili ve çalma sesi her zaman tam seviyede. Mesaj ve bildirim sesleri arka planda yine kısılıyor.

## Bug 2: ses düzeyi

### 1. Bir kişinin ses düzeyi sonraki aramaya taşınıyordu (ana neden)

- **Ne oluyordu:** Birebir aramada A'nın sesini %30'a indirip kapattıktan sonra B'yi arayınca B de %30 çalıyordu. A'yı sessize aldıysan B'yi hiç duymuyordun. Menüde ise B için %100 yazıyordu.
- **Neden:** Ses düzeyi, kişiye göre değil genel bir değişkende tutuluyordu. Yeni kişi için kayıtlı bir değer yoksa eski değer olduğu gibi kalıyordu. Arama bitince de sıfırlanmıyordu.
- **Düzeltme:** Her kişi kendi kayıtlı düzeyiyle başlıyor; kayıt yoksa %100. Ayrıca arama menüsünde "sessize al / sesi aç" artık kayıtlı düzeyi geri getiriyor. Önceden her zaman %100'e dönüyordu.

### 2. %100'ün üstünde ses cızırdıyordu

- **Neden:** %100 ile %200 arası yükseltmede ses yalnızca güçlendiriliyordu. Yüksek heceler sınırı aşıp kırpılıyordu (cızırtı).
- **Düzeltme:** Güçlendirmenin arkasına bir sınırlayıcı eklendi. Sessiz konuşan biri daha yüksek duyuluyor ama yüksek yerler bozulmuyor. DM, grup, sunucu sesi ve ekran paylaşımı için geçerli.

### 3. Ekran paylaşımı sesi sağırlaştırmaya uymuyordu ve kaydırınca kesiliyordu

- **Ne oluyordu:**
  - Kendini sağırlaştırınca (kulaklık düğmesi) karşının ekran paylaşımı sesi duyulmaya devam ediyordu.
  - Paylaşım ses kaydırıcısının her adımında ses kısa bir an kesiliyordu.
- **Neden:** Bu ses öğesi uygulamada iki ayrı kopya halindeydi ve ikisinde de aynı hatalar vardı. Ses düzeyi her değiştiğinde ses akışı baştan bağlanıyordu. Sağırlaştırma bu öğeye hiç iletilmiyordu.
- **Düzeltme:** Kopyalar tek bir parça oldu. Akış yalnızca gerçekten değişince bağlanıyor. Ses düzeyi ve sağırlaştırma ayrı uygulanıyor. DM, grup ve sunucu sesinde aynı.

### 4. Bozuk bağlantıda grup ve sunucu sesi kesik kesik geliyordu

- **Neden:** Sesin tampon süresi milisaniye istenen bir yere saniye yazılıyordu: 120 ms yerine 0,16 ms. Kötü bağlantıda tampon her istatistik turunda yeniden sıfıra iniyordu.
- **Düzeltme:** Doğru birim kullanılıyor. Kötü bağlantıda 80 ile 120 ms tampon korunuyor.

## Yol üstünde düzelen performans sorunu

- **Kapanmayan ses işlemcileri:** %100'ün üstüne çıkarılan her kişi için ayrı bir ses işlemcisi açılıyordu. Bunlar hiç kapanmıyordu. Kişi aramadan çıksa da işlemci çalışmaya devam ediyor ve işlemci gücü harcıyordu. Artık ses öğesi kaldırılınca işlemci de kapanıyor.
- Jitter tampon düzeltmesi (Bug 2, madde 4) de performans sınıfında commit'lendi.

## Commit'ler

| Commit | Konu |
|---|---|
| 73c195b7 | Çalma sesi ve arama efektleri aramanın hoparlöründen çalıyor |
| e7eb0c09 | Grup araması çalma sesi ret, meşgul, cevapsız ve aynı anda başlatmada duruyor |
| 7f762e9c | Birebir aramada arayan, cevap gelmezse kendisi bitiriyor |
| f8987aed | Aynı anda birbirini arayan iki kişi bağlanıyor (uygulama + sunucu) |
| daa0431b | Birebir aramada ses düzeyi sonraki kişiye taşınmıyor |
| 5d84e633 | %100 üstü güçlendirmede cızırtı yok |
| 5545950a | Kullanılmayan ses işlemcileri kapanıyor |
| bb984046 | Ekran paylaşımı sesi sağırlaştırmaya uyuyor, kaydırınca kesilmiyor |
| a5a283aa | Bozuk bağlantıda jitter tamponu korunuyor |
| dfe2ec96 | Arka planda zil ve çalma sesi tam seviyede |

## Eklenen testler

Hepsi `frontend/` klasöründen `node <dosya>` ile çalışır.

- `src/lib/ringbackOutput.selftest.mjs`
- `src/lib/groupRingback.selftest.mjs`
- `src/lib/outgoingRingGuard.selftest.mjs`
- `src/lib/crossedCalls.selftest.mjs` ve `backend/test/callSignalAck.integration.test.cjs` içindeki yeni "crossed calls" senaryosu
- `src/lib/peerVolume.selftest.mjs`
- `src/lib/voiceGain.selftest.mjs`
- `src/lib/screenAudioLevel.selftest.mjs`
- `src/lib/jitterBufferUnits.selftest.mjs`
- `src/lib/ringVolume.selftest.mjs`

## Senin kararını bekleyenler

1. **Grup aramasında kimse açmazsa ne olsun?** Şu an 45 saniye sonra çalma sesi duruyor ve "Yanıt yok" çıkıyor. Ama sen odada tek başına, mikrofonun açık kalıyorsun. Oda açık kalsın mı, yoksa uygulama aramadan otomatik çıksın mı?
2. **Gelen arama zili hangi hoparlörden çalsın?** Şu an varsayılan hoparlörden çalıyor, çalma sesi ise aramanın hoparlöründen. İstersen ayrı bir "zil cihazı" ayarı eklenebilir.
3. **Arama sırasında uygulamanın tamamı her saniye yeniden çiziliyor.** Arama süresi sayacı uygulamanın en üst seviyesinde tutuluyor. Bu yüzden arama boyunca her saniye bütün ekran yeniden hesaplanıyor. Sayacın yalnızca arama ekranına taşınması gerekiyor. Bu, birçok dosyaya dokunan büyük bir değişiklik olduğu için yapmadım.
4. **Gürültü engelleme ses düzeyini değiştirebilir.** Gürültü zincirinin sonunda otomatik kazançlı bir sıkıştırıcı var, tarayıcının kendi otomatik kazancı da açık. İkisi birlikte ses düzeyinin dalgalanmasına yol açabilir. Ayrıca zincir sorun verip ham mikrofona geçince düzey değişiyor. Bunu düzeltmek için gerçek cihazlarda ölçüm gerekiyor. Bu ortamda yapamadım, kodda değişiklik yapmadım.
5. **Eski uygulama sürümleri:** "Aynı anda arama" düzeltmesi eski masaüstü ve iPhone sürümlerinde çalışmaz; onlarda eski davranış (45 saniye "Yanıt yok") sürer. Ayrıca sunucu ve web aynı anda yayına çıkmalı.
6. **Gerçek cihazda denenmesi gerekenler:** Bu ortamda yalnızca Linux ve otomatik testler vardı. Şunları gerçek cihazda dene:
   - Windows ve macOS'ta kulaklıkla çalma sesi;
   - iPhone'da CallKit ile arama;
   - iki cihazdan aynı anda arama.

## Kontroller

- Bütün test takımı çalıştırıldı (`node scripts/run-tests.mjs`): 515 dosya, 508 geçti, 0 başarısız, 7 karantinada. Karantinadakiler bu işten önce de başarısızdı. Bunlardan biri arama ile ilgili: `src/hooks/useCall.selftest.mjs`, eski bir kaynak kontrolü yüzünden karantinada.
- `node scripts/i18n-check.mjs`: geçti. Yeni metin eklenmedi; mevcut "Yanıt yok" metni kullanıldı.
- CSS'e dokunulmadı, bu yüzden `type-scale` kontrolü gerekmedi.
- `npm run build:prod`: geçti. `Total: 234.6 KB` (sınır 234.7 KB).
