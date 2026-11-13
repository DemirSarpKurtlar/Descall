# Descall site dışı SEO kiti (Kasım 2026)

Bu klasör, descall.com'un Google'da ve yapay zekâ asistanlarında görünmesi için **sitenin dışında** yapılacak işleri toplar: bağlantı (backlink), listelere girme, resmi profiller ve basın. Kod değişikliği yok; her adımı sahibi (Demir Sarp Kurtlar) kendi hesabıyla, kendi elinden yapar. Bu kit hiçbir forma başvurmadı, kimseye e-posta atmadı.

| Dosya | İçerik |
|---|---|
| `README.md` | Bu plan: 4 haftalık sıra, her adımın değeri, ne ölçülecek |
| `targets.md` | 50+ somut hedef: URL, neden önemli, nasıl girilir, zorluk |
| `templates.md` | Hazır Türkçe (ve kısa İngilizce) metinler: editör e-postası, indirme sitesi açıklamaları, dizin metinleri, forum duyurusu, basın bülteni |
| `brand-entities.md` | Resmi profiller, Wikidata/Wikipedia durumu, App Store önerileri, her yerde aynı kullanılacak marka metni |

## Neden site dışı

6 Kasım 2026 SEO denetimi (`docs/reports/2026-11-06-seo-denetimi.md`) sitenin teknik iskeletinin sağlam olduğunu söylüyor. Eksik olan, Google'ın "bu site güvenilir mi, başkaları ondan söz ediyor mu" sorusuna verilecek cevap. "Discord alternatifi", "sesli sohbet uygulaması" ve "discord yerine" aramalarında ilk sayfayı DonanımHaber, Webtekno, ShiftDelete, Tamindir gibi büyük siteler ve onların liste yazıları tutuyor. Descall bu listelerin hiçbirinde yok. Ayrıca yapay zekâ asistanları "Türkiye'de geliştirilen sesli sohbet uygulaması" sorusunda başka yerli bir uygulamayı (Void, thevoidhub.com) anmaya başladı: onlar da aynı yoldan (llms.txt + liste yazıları) gidiyor. Bu yüzden hız önemli.

Gerçekçi beklenti: tek bir backlink sıralamayı değiştirmez. Asıl etki, **sıralamada zaten üstte olan sayfaların içinde yer almak** (o sayfaların trafiği doğrudan gelir) ve 2-3 ay içinde 20-40 ilgili, gerçek bağlantı birikmesidir.

## Başlamadan önce (1. günün ilk saati)

1. **Tek marka metni.** `brand-entities.md` içindeki "Standart tanım" bölümünü kopyala. Her profilde, her başvuruda aynı ad, aynı tek cümle, aynı e-posta (contact@descall.com), aynı adres (https://descall.com) kullanılmalı.
2. **Marka hukuku.** Denetimdeki uyarı geçerli: "Discord"u yalnızca tanımlayıcı olarak kullan ("Discord'a alternatif"), asla "Türk Discord'u / Yerli Discord" deme. Uzun metinlerin sonuna "Discord, Discord Inc.'in ticari markasıdır; Descall bağlantılı değildir." cümlesini ekle. Şablonlar buna göre yazıldı.
3. **Kurulum dosyası kontrolü.** İndirme siteleri dosyayı tarar. `https://github.com/DemirSarpKurtlar/Descall/releases/latest/download/Descall-Setup.exe` dosyasını VirusTotal'a yükleyip sonucu not al. Kurulum dosyası imzalı değilse (sürüm iş akışı imza sertifikası yoksa imzasız derliyor) bazı siteler "bilinmeyen yayıncı" uyarısı yüzünden geri çevirebilir. Başvuruda bunu açıkça yaz; saklama.
4. **Ekran görüntüleri.** 5 adet 1920x1080 Windows ekranı (sunucu + ses kanalı, ekran paylaşımı kalite seçimi, özel mesaj, ses ayarları, sunucu şablonları), 3 adet iPhone ekranı. Basın klasörü olarak descall.com/press gibi tek bir yerde dursun (yoksa bir Google Drive klasörü de olur).
5. **Ölçüm.** Aşağıdaki "Ne ölçülecek" bölümündeki tabloyu bir tabloya (Google Sheets) kopyala.

## 4 haftalık plan

Değer sütunu kabaca: **Yüksek** = ilgili aramada üst sıralardaki bir sayfada yer veya güçlü, ilgili bir bağlantı; **Orta** = gerçek ama küçük trafik ya da marka sinyali; **Düşük** = tek başına küçük, toplamda işe yarar.

### 1. Hafta: kendi elinle hemen yapabileceklerin (toplam 6-8 saat)

| # | İş | Değer | Süre | Neden |
|---|---|---|---|---|
| 1 | AlternativeTo'ya Descall'ı ekle, sonra Discord, TeamSpeak, Mumble, Guilded sayfalarında "alternatif olarak öner" | Yüksek | 45 dk | "Discord alternatives" aramalarında üstte. Bağlantı nofollow olsa da doğrudan trafik ve yapay zekâ kaynaklarında görünürlük getirir |
| 2 | Tamindir'e uygulama başvurusu ("Uygulama/Oyun Ekle ve Tanıt") | Yüksek | 30 dk | Türkçe, "X indir" aramalarında güçlü; Discord sayfasının yanında alternatif kutuları var |
| 3 | Resmi profiller: X, Instagram (varsa düzelt), YouTube, LinkedIn şirket sayfası, GitHub org açıklaması (`brand-entities.md`) | Orta | 2 sa | Varlık (entity) sinyali; `sameAs` listesi şu an sadece GitHub |
| 4 | winget (Windows Paket Yöneticisi) bildirimi: `microsoft/winget-pkgs` deposuna manifest PR'ı | Orta | 1 sa | Ücretsiz; winget.run, winstall.app gibi siteler otomatik sayfa açar |
| 5 | Microsoft Store: bireysel geliştirici hesabını aç, ad rezervasyonu yap ("Descall") | Orta | 1 sa (+ inceleme) | Resmi mağaza sayfası ve ayrı bir varlık sayfası. Yayın için ya imzalı kurulum dosyası ya da MSIX paketi gerekir (bkz. `targets.md` D9); bugün sadece hesabı ve adı ayır |
| 6 | Webrazzi girişim formu | Yüksek (çıkarsa) | 30 dk | Türkiye'nin girişim medyası; bir haber birçok siteye kopyalanır ve Wikidata için "ciddi kaynak" olur |

### 2. Hafta: editör ve liste yazıları (toplam 5-6 saat)

| # | İş | Değer | Süre | Neden |
|---|---|---|---|---|
| 7 | DonanımHaber, Webtekno, ShiftDelete, Tamindir blog liste yazılarının yazar/editörüne kısa e-posta (`templates.md` "Editör e-postası") | Yüksek | 2 sa | Bu dört sayfa hedef aramaların ilk sayfasında. Liste güncellendiğinde Descall girerse trafik doğrudan gelir |
| 8 | "Discord açıldı mı / ne zaman açılacak" haberlerini düzenli güncelleyen siteler (İşçi Haber, Habertürk, NTV, Fanatik, TGRT Haber) | Orta | 1 sa | Bu sayfalar her ay yenileniyor; "bu arada kullanılabilecek alternatifler" paragrafına girmek gerçekçi |
| 9 | FileHorse, Softpedia, Uptodown (özellikle Android APK), Softonic | Orta | 2 sa | Her biri bir indirme sayfası ve bağlantı; Uptodown, Play Store yokken Android için en büyük vitrin |

### 3. Hafta: topluluklar (toplam 4-5 saat, sonra her gün 15 dk takip)

| # | İş | Değer | Süre | Neden |
|---|---|---|---|---|
| 10 | Techolay, DonanımHaber Forum, Technopat Sosyal, Donanım Arşivi'nde **geri bildirim isteyen** geliştirici konusu (her biri kendi kuralına göre, tek konu) | Orta | 2 sa | Aynı yolu açan geliştiriciler var (Techolay'da "Kanki", DH'de "Tawny"); konu açıkça "geliştiriciyim" diye başlarsa kabul görüyor |
| 11 | "Discord alternatifi öner" diye soran açık konulara yardımcı cevap (geliştirici olduğunu yazarak) | Orta | 1 sa | Bu konular Google'da "discord alternatifi" aramalarında çıkıyor |
| 12 | Reddit: r/Turkey, r/KGBTR, r/Yazilim kurallarını oku; izin veriyorsa tek gönderi. İngilizce için r/SideProject | Düşük-Orta | 1 sa | Kurallar doğrulanamadı; izin yoksa gönderme |

### 4. Hafta: ortaklıklar ve basın (toplam 5-6 saat)

| # | İş | Değer | Süre | Neden |
|---|---|---|---|---|
| 13 | 5 Minecraft ve 5 CS2 Türk sunucu sahibine teklif: Descall'da ücretsiz ses sunucusu kur, sunucu listesindeki "ses / topluluk" bağlantısını Descall davetine çevir | Orta | 2 sa | Sunucu sayfaları bağlantı ve gerçek kullanıcı getirir |
| 14 | 10 üniversite e-spor / oyun kulübüne "Study & campus" şablonuyla ücretsiz sunucu teklifi | Orta | 2 sa | .edu.tr kulüp sayfalarından ve Instagram'dan bağlantı; sürekli kullanıcı |
| 15 | Product Hunt lansmanı (hazırlık 1. haftadan başlar) | Orta | 3 sa | İngilizce marka sinyali; Türkiye trafiği az |
| 16 | Basın bülteni: Egirişim, Teknoblog, Techolay, Gaming in Turkey, Mobidictum | Orta | 1 sa | Haber çıkarsa Wikidata kaydı için gereken bağımsız kaynak oluşur |

### Her ay

- AlternativeTo, Tamindir, Uptodown sayfalarında sürüm numarasını güncelle (eski görünen sayfa sıralamada düşer).
- Yeni çıkan "Discord alternatifleri" yazılarını Google'da `discord alternatifi` + "son 1 ay" filtresiyle tara, yazara aynı şablonla yaz.
- Kendi sitende tarihli sayfaları (ör. `/tr/discord-acildi-mi`) güncelle; editörlere gönderilecek en iyi bağlantı bu tür güncel sayfalardır.

## Yapma

- Bağlantı satın alma, PBN, "100 dizine otomatik kayıt" paketleri, sahte yorum veya sahte hesapla öneri. Google cezası riski; Ekşi Sözlük ve forumlarda da kalıcı yasak sebebi.
- Aynı metni birçok foruma aynı gün yapıştırma. Her konuyu o forumun bölüm kuralına göre ayrıca yaz.
- Ekşi Sözlük'te kendi ürününe entry girme (bkz. `targets.md`, Ekşi bölümü).
- Uydurma sayı, kullanıcı sayısı, ödül, "en iyi" iddiası. Rakip fiyatı veya kullanıcı sayısı söyleme.
- Kaldırılan oyun özelliğinden veya onun yayıncısından söz etme (repo kuralı); oyuncu eşleştirme veya "oyuncu arıyorum" tarzı ifadeler kullanma.

## Ne ölçülecek

| Ölçü | Nereden | Ne zaman | Hedef (4 hafta sonra, tahmini) |
|---|---|---|---|
| Yeni bağlantı veren alan adı sayısı | Google Search Console > Bağlantılar > En çok bağlantı veren siteler | Haftalık | +15 alan adı |
| Hedef sorgularda gösterim / ortalama sıra: `discord alternatifi`, `discord alternatifleri`, `sesli sohbet uygulaması`, `discord yerine`, `descall` | Search Console > Performans > Sorgular (Türkiye filtresi) | Haftalık | Gösterimde artış; `descall` markalı aramada artış |
| Yönlendiren siteden gelen kayıt | Yönetim panelindeki kayıt kaynağı raporu (`backend/lib/signupSourceTaxonomy.js`: referrer, UTM, "Bizi nereden duydun?" cevabı) | Haftalık | Her kaynağı ayrı satırda gör |
| Liste yazısına giriş | `targets.md` içindeki durum sütunu (sen doldur) | Her başvurudan sonra | 4 büyük listeden en az 1'i |
| App Store sayfa görüntülenmesi / indirme | App Store Connect > Analytics > Kaynaklar (Web Referrer) | Haftalık | Web referrer satırında yeni alan adları |
| Yapay zekâ cevabı | ChatGPT, Gemini, Perplexity'ye ayda bir "Türkiye'de arkadaşlarla sesli sohbet için hangi uygulama?" ve "Discord alternatifleri" sor, cevabı kaydet | Aylık | Descall'ın anılması |

UTM kuralı: editörlere ve basına **temiz** adres ver (ör. `https://descall.com/tr/discord-alternatifi`); site `canonical` kullandığı için bağlantı değeri yine doğru sayfaya gider ama editörler UTM'li adresi sevmez. Kendin doldurduğun profil ve dizinlerde istersen `?utm_source=<site>&utm_medium=referral&utm_campaign=offpage-2026` ekle; kayıt kaynağı raporu bunu okur. Referrer'ı silen uygulamalar (ör. Instagram içi tarayıcı) için UTM şart.

## Belirsiz kalanlar

Bu kit hazırlanırken çalışma ortamı donanimhaber.com, webtekno.com, shiftdelete.net gibi siteleri doğrudan açamadı; bilgiler arama sonuçlarından toplandı. Bu yüzden:

- Liste yazılarının **yazar adları** doğrulanmadı. Gönderimden önce sayfayı açıp yazar imzasına bak; yazar sayfası veya X hesabı varsa oradan ulaş.
- Bazı başvuru yolları (Softmedal, MajorGeeks, Softpedia formu, startups.watch, Egirişim, Uptodown geliştirici portalı) arama sonuçlarında doğrulanamadı. `targets.md` bunları "Doğrulanmadı" diye işaretliyor.
- Reddit topluluklarının ve Technopat Sosyal'in güncel tanıtım kuralları okunamadı. Göndermeden önce kenar çubuğunu (sidebar) ve kurallar sayfasını oku, şüphedeysen moderatöre sor.
- Ücretli/ücretsiz durumları (BetaList artık ücretli; Uneed ve Microlaunch ücretsiz sırası belirsiz) sık değişiyor.
