# Marka varlığı (entity SEO)

Amaç: Google'ın ve yapay zekâ asistanlarının "Descall" adını tek bir ürüne, tek bir kurucuya ve tek bir web sitesine bağlaması. Bunun yolu, her resmi profilde **aynı ad, aynı tanım, aynı adres ve aynı e-posta** kullanmak ve bu profilleri sitenin yapısal verisinde (`sameAs`) listelemek.

Bugünkü durum: sitenin JSON-LD'sinde `sameAs` yalnızca GitHub profilini, GitHub deposunu ve App Store sayfasını gösteriyor (`frontend/src/site/jsonLdBuilders.js`, `frontend/index.html`). Sosyal medya profili listelenmiyor. Instagram için otomatik paylaşım hattı var (`marketing/instagram/`) ama hesap adresi repoda yazmıyor.

## 1. Standart tanım (her yerde aynen kullan)

| Alan | Değer |
|---|---|
| Ad | Descall (tek kelime, D büyük; "DesCall", "Des Call" değil) |
| Kategori | Sohbet ve sesli arama uygulaması / Social networking |
| Kurucu, sahibi | Demir Sarp Kurtlar (tam yazım) |
| Ülke | Türkiye |
| Adres | Yok (fiziksel ofis yok; sokak adresi yazma, uydurma) |
| E-posta | contact@descall.com |
| Web sitesi | https://descall.com (www yok, sonda / yok) |
| Logo | `frontend/public/brand/descall-logo.png`, `frontend/public/brand/descall-lockup.svg`; profil resmi için `frontend/public/brand/descall-icon.png` |
| Platformlar | Windows, iPhone ve iPad, Android, web |

**Tek cümle (TR, 120 karakter civarı, profil "bio" alanları için):**
`Descall: arkadaşların ve toplulukların için ücretsiz sesli sohbet, sunucular ve ekran paylaşımı. Türkiye'de geliştirildi.`

**Tek cümle (EN):**
`Descall is a free voice, video and chat app with servers and screen sharing, built in Türkiye.`

**Kısa paragraf (TR, "Hakkında" alanları için):**
`Descall, arkadaşlar, oyun grupları, ders çalışma grupları ve topluluklar için ücretsiz bir sesli, görüntülü ve yazılı sohbet uygulamasıdır. Rolleri ve sürekli açık ses kanalları olan sunucular, HD aramalar ve ekran paylaşımı sunar; Windows, iPhone, iPad, Android ve tarayıcıda çalışır. Türkiye'de Demir Sarp Kurtlar tarafından geliştirilir ve başka bir şirkete bağlı değildir.`

**Kısa paragraf (EN):**
`Descall is a free voice, video and chat app for friends, gaming groups, study groups and communities. It offers servers with roles and voice channels that stay open, HD calls and screen sharing on Windows, iPhone, iPad, Android and the web. It is built in Türkiye by Demir Sarp Kurtlar and is not part of any other company.`

Bu metinler `frontend/public/llms.txt` ile uyumlu. llms.txt değişirse burayı da güncelle.

## 2. Google İşletme Profili (Google Business Profile)

**Uygulanamaz.** Google İşletme Profili, müşterilerin yüz yüze gittiği bir fiziksel adresi olan ya da müşteriye yerinde hizmet veren işletmeler içindir. Yalnızca çevrim içi çalışan işletmeler bu profile uygun değildir ve sahte adres girmek profilin kapatılmasına yol açar. Descall'ın fiziksel bir ofisi veya müşteri kabul eden bir adresi olmadığı için profil açma. Gelecekte gerçek bir ofis olursa yeniden değerlendir.

Bunun yerine Google'ın "bilgi paneli" (Knowledge Panel) hedeflenir: panel, yukarıdaki tutarlı profiller, Wikidata ve bağımsız haberler birikince kendiliğinden çıkar. Çıktığında panelin altındaki "Bu bilgi panelinin sahibi misiniz?" bağlantısıyla, Search Console'da doğrulanmış Google hesabından sahiplen.

## 3. Açılacak veya tamamlanacak resmi profiller

Kullanıcı adı önceliği: `descall`; alınmışsa `descallapp`, sonra `descall_tr`. Hepsinde aynı adı kullanmaya çalış.

| Öncelik | Profil | Durum | Ne yap |
|---|---|---|---|
| 1 | GitHub (DemirSarpKurtlar/Descall) | Var | Deponun "About" kısmına tek cümlelik İngilizce tanım, web sitesi alanına https://descall.com, konu etiketleri (voice-chat, screen-sharing, electron, ios) ekle. Profil README'sinde Descall'a tek satır. Lisansın "All Rights Reserved" olduğunu README'de açıkça yaz; "açık kaynak" deme |
| 2 | App Store | Var | Bkz. 5. bölüm |
| 3 | Instagram | Var (otomatik Reels hattı) | Bio'ya tek cümle (TR), bağlantı alanına https://descall.com/tr/download?utm_source=instagram&utm_medium=social. İşletme hesabı kategorisi "Uygulama sayfası" |
| 4 | X (Twitter) | Yok gibi görünüyor | Hesap aç; bio tek cümle (TR), konum "Türkiye", web sitesi. Sürüm notlarını kısa Türkçe gönderilerle paylaş |
| 5 | YouTube kanalı | Yok gibi görünüyor | `descall-video/` klasöründeki tanıtım videolarını ve Instagram Reels'i yükle. Kanal "Hakkında" kısmına kısa paragraf, bağlantılar. Video açıklamalarında https://descall.com/tr/... adresleri |
| 6 | LinkedIn şirket sayfası | Yok | Kişisel LinkedIn hesabından "Şirket sayfası oluştur". Sektör: Yazılım geliştirme. Şirket büyüklüğü: gerçek olan (1 kişi ise 0-1). Kurucunun kişisel profilinde deneyim satırı: "Descall, Kurucu" |
| 7 | Bluesky ve Threads | Yok | Aynı ad ve bio; düşük öncelik, ad rezervasyonu için yeterli |
| 8 | TikTok | Yok | Reels videolarının aynısı; Türkiye'de genç kitle için. Ad rezervasyonu |
| 9 | Product Hunt, AlternativeTo, SaaSHub | Yok | `targets.md` A bölümü. Kurucu kişisel hesabıyla, "maker" olarak |
| 10 | Microsoft Store, Google Play | Yok | Microsoft Store: `targets.md` D9. Google Play: `docs/play-store/README.md` (hesap açılınca) |
| 11 | Crunchbase | Yok | Ücretsiz organizasyon profili; kurucu, web sitesi, kısa tanım, ülke. Kuruluş tarihi ve çalışan sayısını yalnızca doğru biliyorsan yaz |
| 12 | Reddit kullanıcı hesabı | Yok | Kişisel hesap (u/...), profilde "Descall developer" yaz; topluluklarda bu hesapla şeffaf yaz |

Profiller açıldıktan sonra (ayrı bir kod işi): `frontend/src/site/jsonLdBuilders.js` içindeki `Organization.sameAs` ve `SoftwareApplication.sameAs` dizilerine ve `frontend/index.html` içindeki statik JSON-LD'ye bu adresleri ekle; X hesabı varsa prerender'a `twitter:site` meta etiketini ekle (SEO denetimi de bunu öneriyor). **Henüz açılmamış bir profili `sameAs`'a yazma.**

## 4. Wikidata ve Vikipedi

### Wikidata: şimdilik bekle

Wikidata bir öğenin kabulü için üç ölçütten birini ister: (1) bir Wikimedia sayfasına (ör. Vikipedi maddesi) bağlantı, (2) "ciddi ve herkese açık kaynaklarla" tanımlanabilen, açıkça belirlenebilir bir varlık olmak, (3) başka öğeler için yapısal ihtiyaç. Descall için tek yol (2). "Ciddi kaynak" pratikte konunun kendisi dışında biri tarafından yayımlanmış, editoryal denetimi olan kaynak demek: haber sitesi, kitap, resmi kayıt. Bugün Descall hakkında yalnızca kendi web sitesi, kendi GitHub deposu ve App Store sayfası var. Bunlarla açılan bir öğe silinme riski taşır ve silinen öğe sonraki denemeyi zorlaştırır.

Öneri: `targets.md` P1-P5 bölümündeki bağımsız haberlerden **en az biri** yayımlandıktan sonra öğeyi aç. Açarken:

- Etiket: Descall (tr ve en). Açıklama (tr): "ücretsiz sesli ve görüntülü sohbet uygulaması"; (en): "free voice, video and chat app".
- Özellikler (Wikidata arayüzünde adla aranır):
  - örneği (P31): mobil uygulama ve yazılım
  - resmî internet sitesi (P856): https://descall.com
  - App Store uygulama kimliği (P3861): 6820558264
  - işletim sistemi (P306): Microsoft Windows, iOS, iPadOS, Android
  - menşe ülkesi (P495): Türkiye
  - eserin veya adın dili (P407): yalnızca arayüz dilleri
  - kaynak kodu deposu (P1324): https://github.com/DemirSarpKurtlar/Descall (lisansı "özel mülk" olarak işaretle; açık kaynak deme)
  - sosyal medya kimlikleri (X P2002, Instagram P2003, YouTube kanal kimliği P2397): profiller açıldıktan sonra
- Her ifadeye kaynak (referans) olarak bağımsız haberin adresini ekle; yalnızca kendi siteni kaynak gösterme.
- Geliştirici (P178) için kurucu adına ayrı bir kişi öğesi gerekir; kişi öğesinin de kendi kaynağı olmalı. Bağımsız bir kaynak kurucunun adını anmıyorsa bu alanı boş bırak.
- Kendi ürününü eklediğini öğenin tartışma sayfasında belirt (çıkar çatışması şeffaflığı).

### Vikipedi (Türkçe ve İngilizce): şimdilik uygun değil

Vikipedi'nin kayda değerlik ölçütü, konunun **birden fazla, bağımsız, güvenilir kaynakta önemli ölçüde** ele alınmasını ister. Basın bülteninin kopyası, kendi siten, mağaza sayfaları ve dizin kayıtları sayılmaz. Ayrıca bir ürünün sahibinin kendi ürünü hakkında madde yazması çıkar çatışmasıdır; madde silinir ve hesap kısıtlanabilir. Descall bugün bu ölçütü karşılamıyor. Birkaç ana akım haber (ör. Webrazzi, büyük bir teknoloji sitesi, bir gazete) birikirse bağımsız bir editörün madde açması mümkün olur; o zaman bile kendin yazma, istersen ilgili Vikipedi "madde isteği" sayfasına kaynakları bırak.

## 5. App Store sayfası

Mevcut Türkçe kayıt (`appstore/metadata.json`): ad "Descall", alt başlık "Sohbet, sesli arama, sunucular", anahtar kelimeler `mesaj,görüntülü,arkadaş,topluluk,oyun,takım,grup,dm,klan,ekip,parti,kanal,görüşme,oda`, birincil kategori Social Networking.

Öneriler (metadata `appstore-listing/_build/metadata.py` ile üretiliyor; değişiklik orada yapılmalı ve App Store'a gönderim sahibin onayına bağlı):

1. **Ad alanı (30 karakter).** Apple aramada ad + alt başlık + anahtar kelimeleri birlikte indeksler. Ad şu an yalnızca "Descall". "Descall: Sesli Sohbet" (21 karakter) gibi bir ad, "sesli sohbet" aramasında belirgin fark yaratır. Alt başlıkta "sesli" zaten geçtiği için bu durumda alt başlığı "Sunucular, ekran paylaşımı" gibi yeni kelimelere kaydır. Apple inceleme ekibi ad alanındaki tanımlayıcı ifadelere bazen itiraz eder; reddedilirse adı "Descall" olarak bırak.
2. **Anahtar kelimeler (100 karakter).** Ad ve alt başlıktaki kelimeleri tekrar etme (Apple tekrarı saymaz). "ekran" ve "paylaşım" şu an hiçbir alanda yok; "dm" Türkçe aramada zayıf. Rakip marka adlarını (Discord vb.) anahtar kelimeye yazma: Apple yönergeleri buna izin vermez ve uygulama reddedilebilir. Ayrıca "takım" yerine "ekip" zaten var; "takım"ı çıkarıp yerine "ekran,paylaşım" koymak boşluğu daha iyi kullanır.
3. **Ülke ve dil indekslemesi.** Apple bazı ülke mağazalarında ikinci bir yerelleştirmeyi de indeksler. Türkiye mağazası için hangi ek dilin indekslendiğini Apple'ın "App Store localizations" tablosundan kontrol et (doğrulanmadı); o dilin anahtar kelime alanını Türkçe ve İngilizce ek kelimelerle doldurmak bedava ek alan sağlar.
4. **Ekran görüntüleri.** İlk üç görsel arama sonucunda görünür. Sıra önerisi: (1) sunucu + ses kanalı, kimin konuştuğu görünür; (2) grup görüntülü arama; (3) Türkçe arayüzle davet kartı veya topluluk keşfi. Her görselin üstünde 3-5 kelimelik Türkçe başlık.
5. **Uygulama önizleme videosu.** `descall-video/` (Remotion) altyapısı var; 15-30 saniyelik bir App Preview ekle. Dikkat: Apple önizlemede yalnızca uygulamanın kendi ekran görüntülerini kabul eder.
6. **Tanıtım metni (Promotional Text).** İncelemeye gerek olmadan her zaman değiştirilebilir. Güncel duyurular için kullan (ör. yeni sürüm özelliği).
7. **Değerlendirmeler.** 3.7.43 ile Apple'ın kendi değerlendirme penceresi eklendi. Gelen yorumlara App Store Connect'ten Türkçe cevap ver; cevaplar sayfada görünür ve güven sinyalidir.
8. **Uygulama İçi Etkinlikler (In-App Events).** App Store aramasında ve sayfada ayrı kart olarak görünür. Örnek: "Topluluk gecesi" veya yeni özellik tanıtımı. Ücretsiz.
9. **Özel Ürün Sayfaları (Custom Product Pages).** Farklı kitleler (oyuncular, ders grupları) için farklı ekran görüntüleriyle ayrı sayfalar (sayı sınırı için Apple'ın güncel belgesine bak); her biri ayrı bağlantı alır. Dış kaynaklara (ör. üniversite kulüplerine) bu bağlantıyı vermek, App Store Analytics'te hangi kaynağın indirme getirdiğini ayırmayı sağlar.
10. **Öne çıkarma başvurusu (Featuring Nominations).** App Store Connect'te uygulamayı editoryal öne çıkarma için aday gösterme bölümü var; büyük bir sürüm veya yerel etkinlik öncesi doldur. Garantisi yok, ücretsiz.
11. **Smart App Banner.** Sitede zaten var (`frontend/index.html`: `apple-itunes-app`, davet sayfalarında `app-argument` ile). Dokunma.

## 6. Tutarlılık kontrolü (ayda bir)

- [ ] Google'da `"Descall"` ara: ilk sayfadaki her profil aynı tanımı ve aynı web sitesini gösteriyor mu?
- [ ] Yapay zekâ asistanlarına "Descall nedir, kimin?" sor: cevap llms.txt ile aynı mı? Değilse hangi kaynağı gösterdiğine bak ve o kaynağı düzelt.
- [ ] Yeni açılan her profil `sameAs`'a eklendi mi (kod işi)?
- [ ] App Store, Microsoft Store, Tamindir, Uptodown ve AlternativeTo'daki sürüm ve açıklamalar güncel mi?
