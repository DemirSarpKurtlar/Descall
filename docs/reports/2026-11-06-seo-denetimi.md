# Descall web sitesi SEO denetimi (6 Kasım 2026)

Kapsam: https://descall.com canlı sitesi ve `frontend/` kaynak kodu. Denetim sadece okuma amaçlıydı. Kodda, ayarlarda ve yayında hiçbir şey değiştirilmedi. `npm run build:prod` çalıştırıldı ve geçti (seo-validate 0 uyarı, perf-budget 234,6 / 235 KB, csp-verify tamam). Sonra `dist/` içindeki 207 HTML kabuğu ve canlı sitedeki 208 sitemap adresi tek tek indirilip karşılaştırıldı. Canlı site ile yerel derleme birebir aynı: başlık, açıklama, canonical, hreflang, H1 ve JSON-LD farkı yok.

Ölçüm sınırları: Bu ortamda tarayıcı yoktu. Bu yüzden LCP, CLS ve INP laboratuvarda ölçülemedi. Performans bulguları dosya boyutlarına, istek zincirine ve koda dayanıyor. `http://` yönlendirmesi de proxy yüzünden denenemedi.

---

## 1. Özet

Sitenin teknik iskeleti sağlam. 208 adresin hepsi 200 dönüyor. Her sayfada kendini gösteren bir canonical ve tek bir H1 var. 7 dilin hreflang setleri (x-default dahil) eksiksiz ve karşılıklı. Başlıklar ve açıklamalar benzersiz. Uygulama kabukları `noindex` alıyor, bilinmeyen adresler gerçek 404 dönüyor, dile göre otomatik yönlendirme yok. Asıl sorunlar teknik değil; strateji, içerik ve hız tarafında:

- **Hız:** Önceden üretilen (prerender) metin ziyaretçiden gizleniyor (`html.seo-hold`). İlk görünür içerik, sırayla inen 4 dalga JS/CSS'i bekliyor. Ana sayfada ayrıca uygulamanın açılış ekranı (splash) çıkıyor.
- **İçerik:** Aynı "Discord alternatifi" niyetini hedefleyen yaklaşık 13 İngilizce sayfa var ve bunlar 5 yeni dilde çoğaltılmış (~80 adres). Sayfalar birbiriyle yarışıyor ve çoğu ince.
- **Hukuk:** Rakip markası "Discord" 208 başlığın 116'sında geçiyor. Bazı yerlerde marka cins isim gibi kullanılıyor ("Yerli Discord", "Türk Discord Uygulaması").
- **Tazelik:** "Discord açıldı mı? (Ekim 2026)" başlığı artık eski. Blogda 11–14 Ağustos'tan beri yeni yazı yok.

Düzeltme sırası önerim: önce hukuki risk ve eskimiş içerik (hızlı ve ucuz), sonra sayfa birleştirme, ardından ilk boyamanın hızlandırılması.

---

## 2. Bulgular tablosu

| Öncelik | Sorun | Kanıt (dosya / URL) | Çözüm |
|---|---|---|---|
| Yüksek | Prerender metni ziyaretçiden gizleniyor. İlk görünür içerik React'in bitmesini bekliyor (en fazla 5 sn). LCP tamamen JS zincirine bağlı. | `frontend/index.html` satır 996–1002 ve 1345–1358 (`html.seo-hold ... visibility: hidden`); `src/main.jsx` satır 179–182. Zincir: `index-*.js` → `hydrateMarketing` → `MarketingBoot`/`MarketingApp` → sayfa chunk'ı. Toplam ~430 KB ham / ~145 KB gzip JS ve ~181 KB ham / ~34 KB gzip CSS, 4 ardışık istek dalgası. | Prerender kabuğunu gerçek ilk boyama yap ve React'i üstüne gizlemeden bağla (ya da React sayfasını derleme anında üret: SSG/SSR). `seo-hold`'u kaldır veya süresini kısalt. Sonucu PageSpeed Insights ve CrUX ile ölç. |
| Yüksek | Ana sayfa (`/`), uygulamanın açılış ekranını (logo animasyonu, "Starting", `role=progressbar`) her pazarlama ziyaretçisine gösteriyor. | `scripts/prerender-seo.mjs` satır 636 (`keepBootSplash: route.path === "/"`); `dist/index.html` içinde `#boot-splash` ve WebM logo animasyonu. | `/` için pazarlama ziyaretçisinde splash'i atla; splash yalnızca uygulama açılışında (token varken, Electron'da, native'de) çıksın. |
| Yüksek | "Discord alternatifi" kümesinde yamyamlık (cannibalization): aynı niyete ~13 İngilizce sayfa, 6 dilde ~80 adres. Neredeyse aynı başlıklar var. | `/compare/discord` "Discord vs Descall (2026) \| Which Should You Use?" ile `/blog/discord-vs-descall` "Discord vs Descall (2026) \| Which Should Your Group Use?". Ayrıca `/apps-like-discord` ve `/blog/apps-like-discord`; `/discord-alternative-for-voice-chat` ve `/blog/voice-chat-alternative-to-discord`; `/discord-alternative-for-communities` ve `/blog/discord-alternative-for-communities-guide`; `/discord-replacement` ve `/blog/migrate-from-discord-to-descall`; `/alternatives` ile `/blog/best-discord-alternatives-2026` ve `/blog/discord-competitors`. Kaynak: `src/site/seoConfig.js`, `src/site/seo/nicheLandings.js`. | Her niyete tek bir URL seç. Kopyaları ya birleştirip 301 ile yönlendir ya da açıkça farklı bir işe ayır (ör. blog = nasıl yapılır, landing = ürün). Dil kopyalarını da buna göre azalt. |
| Yüksek | Niş sayfalar ince: prerender metni ~280–400 kelime, tek paragraflık bölümler. | Ölçülen kelime sayıları: `/discord-alternative-for-friends` 281, `/discord-replacement` 281, `/discord-alternative-for-voice-chat` 290, `/discord-alternative-for-communities` 343. `/de/...` kopyaları 275–324. | Birleştirmeden sonra kalan sayfalara gerçek, özgün içerik ekle (ekran görüntüsü, adım adım kurulum, karşılaştırma tablosu, gerçek kullanıcı örneği). |
| Yüksek | Marka hukuku riski: "Discord" ürün adı yerine cins isim gibi kullanılıyor. | `src/site/seo/trMeta.js` satır 12–14: başlık "Yerli Discord: Türk Discord Uygulaması Descall (Ücretsiz)", H1 "Türk Discord’u: Türkiye’de geliştirilen Descall", URL `/tr/turk-discord`. | Başlık, H1 ve URL'yi "Türkiye'de geliştirilen sesli sohbet uygulaması" gibi kendi tarifimize çevir (eski URL'den 301). "Discord"u yalnızca karşılaştırma ve tanımlama amacıyla kullan. |
| Yüksek | Rakip markası başlıklarda baskın; "bağlantılı değiliz" uyarısı neredeyse hiç yok. | 208 başlığın 116'sı "Discord", 34'ü doğrudan "Discord" ile başlıyor, 70 başlıkta "Descall" yok (ör. `/discord-alternative`: "Free Discord Alternative \| Voice, Screen Share & Servers"). "Nitro" başlıkta geçiyor (`/blog/leave-nitro-keep-voice-chat`). Uyarı yalnızca `/tr/discord-acildi-mi` sayfasında var (`trLandings.js` satır 938). `og-discord.png` büyük harflerle "Discord alternative" yazıyor. | Site geneli footer'a "Discord, Discord Inc.'in ticari markasıdır; Descall bağlantılı değildir" ekle (7 dilde). Ticari sayfalarda "Descall"ı başlığın başına al. Avukata danış (bkz. Bölüm 4). |
| Yüksek | Eskimiş "güncel durum" sayfası: başlıkta "Ekim 2026", içerikte "17 Ekim 2026 itibarıyla". Bugün 6 Kasım. | `https://descall.com/tr/discord-acildi-mi`; `src/site/seo/trMeta.js` satır 36–38; `src/site/seo/trLandings.js` satır 14 ve 484–536. | Durumu bugün yeniden doğrula ve tarihleri güncelle. Başlıktan ayı çıkar ya da aylık güncellemeyi takvime bağla. Sayfaya `Article` ve `dateModified` ekle. |
| Orta | Türkçe sayfada İngilizce yapısal veri: `/tr/compare/discord` İngilizce FAQPage (8 soru) taşıyor. | `scripts/prerender-seo.mjs` satır 395–397 (`COMPARE_FAQ` iki yola da veriliyor). | TR sayfasına Türkçe FAQ ver ya da FAQ'ı kaldır. |
| Orta | FAQ JSON-LD soruları statik HTML'de görünmüyor (156 soru). Aynı FAQ seti iki sayfada tekrar ediyor. | `/about` ve `/who-owns-descall` aynı FAQ setini taşıyor; bu 7 dilde tekrarlanıyor. EN blog yazılarının FAQ'ı prerender gövdesinde yok (`prerender-seo.mjs` satır 246–273 FAQ basmıyor). Google 2023'ten beri bu tür siteler için FAQ zengin sonucu göstermiyor. | FAQ şemasını yalnızca soruların sayfada görünür olduğu yerlerde tut. Tekrarları kaldır. |
| Orta | 5 yeni dil (de, es, fr, pt-BR, ru) 1 Kasım'da tek seferde açıldı: ~175 yeni adres. Başlık ve açıklamalar uzun. | `git log` (3.7.23 / 3.7.24). 60 başlık 60 karakteri aşıyor (de 12, es 12, pt-br 12, fr 11, ru 8, tr 5); 41 açıklama 160'ı aşıyor (çoğu es/de/fr). `seo-validate.mjs` eşikleri 70/170 olduğu için uyarı çıkmıyor. | Her dilde ana dili konuşan biri en azından ana sayfaları ve başlıkları okusun. Eşikleri 60/155 yap ve dil bazında rapor ver. |
| Orta | TR blog yazıları, hreflang ile eşlendikleri EN yazılara göre çok kısa. | TR: 155–298 kelime (`/tr/blog/voice-chat-alternative-to-discord` 155). EN: 755–842 kelime. | TR yazıları EN kapsamına çıkar ya da Türkiye'ye özgü içerikle zenginleştir. |
| Orta | İç bağlantı zayıf: blog yazıları ve bazı ticari sayfalar statik HTML'de 1–2 iç bağlantı alıyor. | Statik HTML'de gelen bağlantı sayısı: `/best-discord-alternative-for-gamers` 1, `/discord-replacement` 1, EN blog yazıları 2–3, TR blog yazıları 1, `/security` 1, `/status` 0, `/tr/security` 0. Blog yazıları birbirine bağlantı vermiyor. | Her yazının sonuna 3 "ilgili yazı" ekle. Pillar sayfadan tüm alt sayfalara bağlantı ver. Footer'a gamers/security ekle. |
| Orta | İç bağlantı denetim aracı bozuk ve CI'da çalışmıyor. | `node scripts/seo-link-audit.mjs` çıkış kodu 1 ve 75 sahte "orphan" uyarısı (tüm `/de`, `/es`, ... adresleri). `build:prod` içinde yok. | Aracı prerender HTML'ini tarayacak şekilde düzelt (gerçek gelen bağlantı sayısı) ve `build:prod`'a ekle. |
| Orta | 235 KB bütçe yanlış şeyi ölçüyor ve tükenmiş durumda (0,4 KB boşluk). | `scripts/perf-budget.mjs` yalnızca `/features` HTML'inin ilk dalgasını ölçüyor: 234,6 KB. `hydrateMarketing`, `MarketingApp`, sayfa chunk'ları, CSS ve dil katalogları sayılmıyor (ör. `de-*.js` 214 KB ham / 69 KB gzip, `ru-*.js` 288 KB). | Bütçeyi "ilk görünür içeriğe kadar inen her şey" (JS + CSS, gzip) olarak ölç. EN ve bir prefixed dil için ayrı limit koy. |
| Orta | Türkçe ifade paketi (`trGaps`, 66 KB ham / 21 KB gzip) her dildeki ziyaretçiye statik olarak yükleniyor. | `dist/assets/hydrateMarketing-*.js` içinde `import{TR_I18N_GAPS}from"./trGaps-*.js"` var. | Yalnızca `locale === "tr"` iken dinamik import et. |
| Orta | Hash'li varlıklar sadece 4 saat önbellekleniyor. | Canlı `/assets/vendor-react-*.js` için `cache-control: public, max-age=14400, must-revalidate`. `public/_headers` dosyasında `/assets/*` kuralı yok. | `/assets/*` için `public, max-age=31536000, immutable` ver. |
| Orta | Her HTML'de ~42 KB satır içi CSS ve ~5 KB satır içi JS var; HTML ~80 KB (br ile ~20 KB). SeoHead her sayfada kullanılmayan `og-default.webp`'yi önceden yüklüyor. | `dist/discord-alternative-for-friends.html` head bölümü 57 KB. `src/site/SeoHead.jsx` satır 116–127 (`rel=preload as=image`). | Splash/app'e ait CSS'i pazarlama HTML'inden çıkar. OG resmi preload'unu sil (sosyal botlar meta etiketini okur, preload gerekmez). |
| Orta | iOS uygulaması yapısal veride ve indirme sayfasında yok. | `src/site/jsonLdBuilders.js` satır 107: `operatingSystem: "Windows, Web, Android"`. `/download` başlığı "Download Descall for Windows"; prerender'da iPhone geçmiyor. App Store linki `src/site/appStoreLink.js` dosyasında var. Ana sayfa iPhone'dan söz ediyor. | `operatingSystem`'e iOS ekle, App Store'u `sameAs`/`downloadUrl` olarak ver. `/download` başlık ve metnine iPhone ekle. |
| Orta | Blog tazeliği düşük: 8 EN yazının hepsi 11–14 Ağustos 2026 tarihli, sonrasında yeni yazı yok. Konu tek: Discord alternatifi. | `src/site/content/discordSeoContent.js` satır 186–262. | Ayda en az 2 yazı planla ve konuyu genişlet (sesli sohbet ipuçları, ekran paylaşımı, topluluk yönetimi, sürüm notları). "2026" geçen başlıkları Ocak'ta güncelle. |
| Orta | EN blog prerender'ında tarih ve yazar satırı yok; Article şemasında dil ve özgün görsel eksik. | `prerender-seo.mjs` satır 255–261 tarihi yalnızca prefixed dillerde basıyor. `buildArticleLd` EN'de `inLanguage` almıyor; görseli her yazıda `og-default.png`. | EN'de de "Yayın / Güncelleme" ve yazar satırını bas. Her yazıya kendi OG görselini ver. |
| Orta | Ana sayfa H1'i "Talk together": anahtar kelime ve marka yok. | `dist/index.html` → `<h1>Talk together</h1>`. | H1'i "Descall: arkadaşlarınla sesli sohbet, sunucular ve ekran paylaşımı" gibi açıklayıcı yap. |
| Orta | Google Indexing API pazarlama sayfaları için kullanılıyor. Bu API resmi olarak yalnızca iş ilanı ve canlı yayın sayfaları içindir. | `scripts/request-indexing.mjs` satır 156–162 (`URL_UPDATED`), `docs/SEO_INDEXING.md` madde 3. | Google Indexing API kısmını kapat; IndexNow ve sitemap yeterli. (Bkz. Bölüm 4.) |
| Düşük | Sitemap `lastmod` değeri sayfa içeriğinden değil, kod commit tarihinden geliyor. 208 adresin 128'inde bugünün tarihi var. | `scripts/generate-seo-files.mjs` satır 39–139 (`git log -1` ile JSX ve i18n dosyalarından tarih alıyor). Canlı sitemap: 128 adreste `2026-11-06T10:11:31Z`. | `lastmod`'u yalnızca metin değişince güncelle (içerik hash'i veya elle tutulan tarih). |
| Düşük | Durum sayfası ince ve eski. | `/status` (~49 kelime), "Last updated: August 25, 2026"; 6 dilde kopyası var, hiçbirine iç bağlantı yok. | Ya canlı veriyle güncel tut ya da `noindex` yap ve sitemap'ten çıkar. |
| Düşük | Sosyal kartlar: yerelleştirilmiş sayfalar İngilizce yazılı OG görseli kullanıyor; statik HTML'de `og:image:alt` ve `twitter:site` yok. | 153 sayfa `og-default.png`. `og-discord.png` TR sayfalarda da İngilizce yazılı. `og:image:alt` yalnızca JS ile ekleniyor (`SeoHead.jsx` satır 113). | Her dil için en az ana OG görseli üret. Prerender'a `og:image:alt` ve (hesap varsa) `twitter:site` ekle. |
| Düşük | Görsel SEO: ürün ekran görüntüleri yalnızca React tarafında; statik HTML'de sadece logo var. | `src/site/components/ProductFrame.jsx` ve `SeoProductPreview.jsx` (alt, width/height, webp doğru). Prerender'da `<img>` yalnızca `descall-lockup.svg`. | Ana sayfa, features ve download prerender'ına 1–2 ekran görüntüsü (alt metinli, boyutlu) koy. |
| Düşük | Yapısal veride küçük tutarsızlıklar. | `WebSite.inLanguage: ["en","tr"]` (7 dil var). `Person.image` uygulama ikonu. `Organization.legalName: "Descall"` (tüzel kişi yoksa yanıltıcı). Organizasyon açıklaması "Free Discord alternative..." ile başlıyor (`jsonLdBuilders.js` satır 50–51, 92). | Dil listesini 7 yap, kişi için gerçek fotoğraf veya hiç görsel kullan, `legalName`'i kaldır, açıklamayı ürün odaklı yaz. |
| Düşük | Dil algılama: İngilizce URL'de, kayıtlı veya cihaz dili TR/DE ise metin ve başlık o dile dönüyor (URL ve canonical İngilizce kalıyor). | `src/site/resolveMarketingLocale.js`, `MarketingLocaleProvider.jsx`, `seoConfig.js` `routeMetaForLocale`. Otomatik yönlendirme yok; Googlebot en-US gördüğü için tarama zarar görmüyor. | Tarama için acil değil. Kullanıcıya bir dil önerisi bandı göstermek, sayfayı sessizce çevirmekten daha temiz olur. |
| Düşük | Dokümanlar güncel değil. | `docs/SITEMAP.md` "hreflang en / tr / x-default" diyor (şu an 7 dil). `frontend/docs/SEO_INDEXING.md` TR sorgularının `/discord-alternative-turkey`'de toplandığını (artık `/tr/discord-alternatifi`'ne 301) ve LCP'nin `#seo-static h1` olduğunu söylüyor (artık gizli). | Dokümanları güncelle. |
| Düşük | Küçük kalemler. | Footer'daki `/?auth=register` ve `/?auth=login` linkleri taranabilir parametreli URL üretiyor (canonical `/`). TR blog URL'leri İngilizce slug kullanıyor. TR blog tarihleri "2026-08-11" biçiminde. `/copyright` ile `/terms` metni %79 örtüşüyor. `sitemap-pages.xml` (195 KB) diğer sitemap'lerin kopyası. `meta keywords` etkisiz. | Fırsat buldukça temizle. |

**İyi durumda olanlar (dokunmayın):** 208/208 adres 200 dönüyor ve sitemap ile birebir aynı. Canonical'lar kendini gösteriyor. hreflang 7 dil + x-default ile tam ve karşılıklı; her alternatifin `lang` değeri doğru. Başlık ve açıklamaların hepsi benzersiz. Her sayfada tek H1 var. Sondaki `/` 301 ile kaldırılıyor, `www` 301 ile apex'e gidiyor, `/index.html` ve `.html` uzantıları 308 alıyor. 404'ler gerçek 404 + `noindex`. `/app`, `/login` ve benzeri kabuklar `x-robots-tag: noindex, follow` alıyor. robots.txt temiz. Prerender'daki tüm görsellerde alt metin var. Viewport mobil uyumlu. Brotli sıkıştırma açık. TTFB ~0,25–0,3 sn.

---

## 3. İlk 10 düzeltme için adım adım plan

**1. Marka riskini azalt (1–2 gün)**
- `/tr/turk-discord` sayfasını yeniden adlandır (ör. `/tr/turk-sohbet-uygulamasi`). Eskisinden 301 ver ve `_worker.js` ile `_redirects`'i güncelle.
- Başlık ve H1'den "Yerli Discord / Türk Discord'u" ifadelerini çıkar. Metinde yalnızca "Discord'a alternatif" diye tanımlayıcı kullan.
- 7 dilde site geneli footer'a "bağlı değiliz / ticari marka" uyarısı ekle.
- Ticari sayfaların başlığında "Descall" öne gelsin.
- Beklenen etki: Marka sahibi şikâyeti ve Google'ın marka kaynaklı kaldırma riski belirgin düşer. Sıralamaya etkisi nötr ya da hafif olumludur, çünkü marka adı tıklama oranını artırır.

**2. "Discord açıldı mı?" sayfasını tazele (bugün)**
- Erişim durumunu bugün yeniden doğrula.
- Başlıktaki ayı kaldır ya da "Kasım 2026" yap; `TR_LANDING_UPDATED` ve gövdedeki tarihleri güncelle.
- `Article` ve `dateModified` şeması ekle.
- Ayda bir kontrol için takvim hatırlatıcısı kur.
- Beklenen etki: Zamana duyarlı sorguda yanlış bilgi riski ortadan kalkar. "Güncel" sinyali tıklama oranını korur.

**3. İçerik kümesini birleştir (1 hafta)**
- Niyet haritası çıkar: "discord alternative", "apps like discord", "discord vs descall", "voice chat alternative", "communities", "replacement / migrate".
- Her niyet için tek URL seç. Önerim:
  - `/compare/discord` kalsın; `/blog/discord-vs-descall` ona 301 ya da "nasıl karar verilir" yazısına dönüşsün.
  - `/apps-like-discord` ile `/blog/apps-like-discord` birleşsin.
  - `/discord-replacement` ile `/blog/migrate-from-discord-to-descall` birleşsin.
- Aynı yönlendirmeleri 5 prefixed dilde de uygula. Sitemap ve hreflang otomatik güncellenir.
- Beklenen etki: Sinyaller daha az ve daha güçlü sayfada toplanır. Sayfaların birbirinin yerine sıralandığı dalgalanma azalır. Taranacak adres sayısı ~%20–30 düşer.

**4. İlk boyamayı JS'e bağımlı olmaktan çıkar (1–2 hafta)**
- `html.seo-hold` gizlemesini kaldır. Prerender kabuğunu React çıktısıyla aynı görünüme getir; bunun en temiz yolu React sayfalarını derleme anında statik HTML'e çevirmek.
- React aynı DOM'u hydrate etsin, yerine yenisini koymasın.
- `/` için pazarlama ziyaretçisinde boot splash'i kapat.
- Önce/sonra PageSpeed Insights mobil skorunu ve CrUX (veya PostHog `web_vital`) LCP verisini kaydet.
- Beklenen etki: Mobil LCP'nin JS zincirine bağlı olmaktan çıkıp HTML + CSS ile gelmesi. Tahminen saniyeler mertebesinde iyileşme (ölçümle doğrulanmalı). Core Web Vitals "iyi" eşiğine yaklaşır.

**5. JS ve CSS yükünü kıs (2–3 gün)**
- `trGaps` ve `trApprovedUi`'yi yalnızca TR için dinamik yükle (~21 KB gzip tasarruf).
- `SeoHead`'deki `og-default.webp` preload'unu sil.
- `/assets/*` için `immutable, max-age=31536000` başlığı ver.
- Pazarlama HTML'inden splash/app CSS'ini ayır (sayfa başına ~42 KB satır içi CSS).
- Beklenen etki: İlk ziyarette daha az bayt, tekrar ziyarette neredeyse sıfır JS indirmesi. INP ve LCP'de iyileşme.

**6. Performans bütçesini gerçek yükle ölç (1 gün)**
- `perf-budget.mjs`, ilk görünür içeriğe kadar gereken tüm JS ve CSS'i gzip olarak saysın.
- `/features` ve `/de/features` için ayrı limit koy. Mevcut 0,4 KB boşluk sorununu yeni ölçüye göre yeniden tanımla.
- Beklenen etki: Gerilemeler derlemede yakalanır. Bütçe gerçek kullanıcı deneyimini yansıtır.

**7. Yapısal veriyi düzelt (1 gün)**
- `/tr/compare/discord`'a Türkçe FAQ ver.
- `/about` ile `/who-owns-descall` arasındaki tekrar eden FAQ'ı tek yerde bırak.
- FAQ şemasını yalnızca sorunun sayfada görünür olduğu yerlerde tut.
- `SoftwareApplication`'a iOS ve App Store ekle; `WebSite.inLanguage`'i 7 dil yap; EN `Article`'a `inLanguage` ekle.
- Beklenen etki: Search Console'da yapısal veri uyarı riski azalır. Uygulama bilgisi (iOS) aramada doğru görünür.

**8. İç bağlantıyı güçlendir ve denetim aracını onar (2 gün)**
- Blog yazılarına "ilgili yazılar" bloğu ekle (prerender ve React).
- Footer'a gamers ve security sayfalarını ekle.
- `seo-link-audit.mjs` gerçek prerender HTML'ini tarasın ve her adres için en az 3 iç bağlantı istesin; aracı `build:prod`'a ekle.
- Beklenen etki: Zayıf bağlanan sayfalar daha sık taranır ve daha çok iç otorite alır. Orphan sorunu kalıcı olarak engellenir.

**9. Yeni dillerin kalitesini doğrula (1–2 hafta, dış destekle)**
- Her dilde ana sayfa, features, download, discord-alternative ve compare sayfalarını ana dili konuşan biri okusun.
- Başlıkları ≤60, açıklamaları ≤155 karaktere indir.
- `seo-validate.mjs` eşiklerini sıkılaştır.
- TR blog yazılarını EN kapsamına çıkar.
- Beklenen etki: Yeni dillerde "düşük kaliteli çeviri" algısı ve SERP'te kesilen başlıklar azalır. İndekslenme oranı ve tıklama oranı artar.

**10. Blogu canlandır ve tazelik sinyallerini düzelt (sürekli)**
- Ayda 2 yazılık takvim oluştur; konuları genişlet (ses kalitesi, ekran paylaşımı, topluluk kurma, sürüm notları).
- EN prerender'a tarih ve yazar satırı ekle; her yazıya özgün OG görseli ver.
- `lastmod`'u yalnızca içerik değişince güncelle.
- Beklenen etki: Daha geniş anahtar kelime yelpazesi ve Discord'a bağımlılığın azalması. Google'ın `lastmod`'a güvenmesi sayesinde yeni içerik daha hızlı taranır.

---

## 4. Sahibin karar vermesi gerekenler

1. **Marka stratejisi ve hukuki görüş.** Discord ve "Nitro" adlarını başlıkta, URL'de ve OG görselinde ne kadar kullanacağız? "Türk Discord'u" konumlandırması korunacak mı? Bir marka avukatından kısa bir görüş alınmasını öneririm. Karşılaştırma sayfalarındaki rakip iddiaları (Guilded, TeamSpeak, Telegram vb.) için de doğruluk kontrolü gerekir.
2. **Hangi sayfalar kalacak?** Birleştirme listesi (Bölüm 3, madde 3) ürün tarafının onayını ister: hangi URL tutulacak, hangisi 301 olacak?
3. **5 yeni dil.** Ana dili konuşanlar inceleyene kadar ne olacak? Seçenekler: (a) olduğu gibi indekste kalsın, (b) yalnızca çekirdek sayfalar indekslensin, niş ve blog kopyaları geçici `noindex` alsın, (c) inceleme bitene kadar hiç dokunulmasın. Ayrıca çeviri bütçesi ayrılacak mı?
4. **Google Indexing API.** Google'ın kurallarına göre bu API pazarlama sayfaları için kullanılmamalı. Kapatılmasını öneririm; karar sahibin.
5. **"Discord açıldı mı?" sayfasının bakımı.** Bu sayfa haber niteliğinde ve hukuki bir durumu anlatıyor. Aylık doğrulama sorumluluğunu kim üstlenecek? Üstlenilemeyecekse sayfa genel bir rehbere çevrilebilir.
6. **İlk boyama yaklaşımı.** Prerender'ı görünür yapmak, eski "düz sayfa yanıp sönmesi" sorununu geri getirebilir. Kalıcı çözüm React sayfalarını derleme anında üretmek (SSG). Bu orta büyüklükte bir mühendislik işi; zamanlaması sahibin kararı.
7. **Sahiplik vurgusu.** Kurucu adı her sayfada `author` meta etiketi, Person şeması, FAQ ve llms.txt ile tekrar ediliyor; `/faq` ile `/who-owns-descall` metni %41 örtüşüyor. Bu bilinçli bir tercih gibi görünüyor. Aynı seviyede devam edilecek mi, yoksa sadeleştirilecek mi?
8. **Durum sayfası.** `/status` canlı veriyle mi beslenecek, yoksa `noindex` mi olacak?
9. **İçerik bütçesi.** Ayda 2 blog yazısı ve her dil için OG görselleri üretimi için kaynak ayrılacak mı?
