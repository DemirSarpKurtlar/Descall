/**
 * Turkish landing pages under /tr/*. Written in Turkish (not machine-swapped
 * EN copy). Only claim what Descall ships today: DMs, groups, servers with
 * roles/channels/templates, voice/video calls, screen share with quality
 * presets, noise suppression, LFG (Play tab), Windows/Android/web, Turkish UI,
 * free core features with optional DesCoin cosmetics. No E2E claim.
 *
 * Shape: { path, title, description, kicker, h1, lead, updated?, sections:
 * [{ h, p: string[], list?: string[] }], faq: [{q,a}], related: [{to,label}] }
 */

import { TR_LANDING_META } from "./trMeta.js";

export const TR_LANDING_UPDATED = "2026-10-17";

const RELATED_CORE = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri karşılaştırması" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı?" },
  { to: "/tr/turk-discord", label: "Türk Discord’u" },
  { to: "/tr/discord-yerine-ne-kullanilir", label: "Discord yerine ne kullanılır?" },
  { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
  { to: "/tr/oyuncu-sohbet-uygulamasi", label: "Oyuncu sohbet uygulaması" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog", label: "Türkçe rehberler" },
  { to: "/tr/download", label: "Descall’ı indir" },
];

function related(self) {
  return RELATED_CORE.filter((l) => l.to !== self);
}

export const TR_LANDINGS = {
  "/tr/discord-alternatifi": {
    path: "/tr/discord-alternatifi",
    kicker: "Türkiye · Discord alternatifi",
    h1: "Discord alternatifi: Türkiye’de ücretsiz sunucu, ses ve ekran paylaşımı",
    lead:
      "Descall, arkadaş grupları, klanlar, sınıflar ve küçük topluluklar için Türkiye’de geliştirilen ücretsiz bir Discord alternatifidir. Sunucularını roller ve kanallarla kurarsın, sesli ve görüntülü konuşursun, ekranını paylaşırsın ve Play sekmesinden oyun arkadaşı bulursun. Temel iletişim için abonelik yoktur; arayüz tamamen Türkçedir.",
    sections: [
      {
        h: "Neden bu kadar çok kişi Discord alternatifi arıyor?",
        p: [
          "Türkiye’de Discord’a erişim, 9 Ekim 2024’te verilen mahkeme kararıyla engellendi ve 2026 Ekim itibarıyla engel sürüyor. Yıllarca her akşam aynı ses kanalında buluşan arkadaş grupları, okul toplulukları ve oyun klanları bir gecede ortak buluşma yerini kaybetti. Bir kısmı geçici çözümlerle idare etmeye çalıştı, bir kısmı WhatsApp gruplarına dağıldı, birçoğu da düzenli bir alternatif aramaya başladı.",
          "Engelden bağımsız olarak da Discord’dan uzaklaşmak isteyenler var. Bazıları için en temel özelliklerin etrafındaki abonelik baskısı yorucu; bazıları için yüzlerce botla dolu dev sunucular küçük bir arkadaş grubu için fazla karmaşık. Aranan şey çoğu zaman aynı: herkesin kolayca katılabildiği, sesin net olduğu, düzenli ama sade bir yer.",
          "Descall tam bu ihtiyaç için yapıldı. Discord’u birebir kopyalamaya çalışmıyor; arkadaş gruplarının ve küçük toplulukların gerçekten her gün kullandığı parçaları ücretsiz ve tek bir hesapta topluyor.",
        ],
      },
      {
        h: "Descall’da neler var?",
        p: [
          "Aşağıdaki özelliklerin hepsi bugün uygulamada var ve ücretsiz. Liste bir vaatler listesi değil; giriş yapıp ilk sunucunu kurduğunda göreceğin şeyler:",
        ],
        list: [
          "Sunucular: kategoriler, yazı kanalları, ses kanalları ve sahne (stage) kanalları",
          "Roller ve kanal bazlı izinler: Admin, Moderatör, VIP gibi rolleri kur, kimin hangi kanalı göreceğini belirle",
          "Hazır şablonlar: Oyun, Topluluk, Ders, Arkadaşlar ve Yayın şablonları rolleri ve kanalları önceden kurar",
          "Moderasyon: atma, yasaklama, zaman aşımı, denetim kayıtları, topluluk kuralları ve davet bağlantıları",
          "Özel mesajlar (DM), grup sohbetleri, arkadaş listesi ve çevrimiçi durumu",
          "Sesli ve görüntülü arama: birebir, grupta ve sunucu ses kanallarında",
          "Ekran paylaşımı: kalite ön ayarlarıyla oyun, sunum veya ders paylaşımı",
          "Gürültü azaltma: klavye ve fan sesini bastıran isteğe bağlı mikrofon filtresi",
          "LFG: Play sekmesinde lobi aç, oyun arkadaşı bul, aynı hesapla sesliye geç",
          "Windows masaüstü uygulaması, Android uygulaması ve kurulum gerektirmeyen tarayıcı sürümü",
        ],
      },
      {
        h: "Discord’dan geçince neler tanıdık gelir, neler farklıdır?",
        p: [
          "Discord kullandıysan Descall’da yolunu kaybetmezsin. Sol tarafta sunucuların, sunucu içinde kategoriler ve kanallar, sağda üyeler; ses kanalına tıklayınca bağlanırsın, ekran paylaşımı butonuyla yayına geçersin. Rol hiyerarşisi ve kanal izinleri de aynı mantıkla çalışır: bir kanalı yalnızca moderatörlere açabilir, duyuru kanalında yazmayı yetkililerle sınırlayabilirsin.",
          "Farklı olan taraf sadelik ve fiyatlandırma. Descall’da sohbet, sunucu, ses, görüntü ve ekran paylaşımı abonelik arkasında değil. Uygulamada satılan tek şey isteğe bağlı kozmetiklerdir (DesCoin ile); bunlar iletişimi hiçbir şekilde kısıtlamaz. LFG ise ayrı bir bot sunucusu yerine doğrudan uygulamanın içinde, Play sekmesindedir.",
          "Bir de dürüst olalım: Discord’un devasa bot pazarı, on binlerce kişilik herkese açık sunucuları ve yıllar içinde biriken entegrasyonları Descall’da yok. Eğer topluluğun tamamen botlara dayanıyorsa geçiş daha fazla emek ister. Ama çoğu arkadaş grubu ve klan için asıl ihtiyaç ses, sohbet, roller ve düzenli kanallardır; bunlar Descall’da hazır.",
        ],
      },
      {
        h: "Kimler için uygun?",
        p: [
          "Her akşam aynı ses kanalında buluşan 3–15 kişilik arkadaş grupları için Descall rahat bir ev sağlar: bir sunucu kur, birkaç ses kanalı aç, davet bağlantısını gönder, bitti. Oyun klanları ve takımlar için Oyun şablonu rolleri ve kanalları hazırlar, Play sekmesi de eksik oyuncuyu bulmayı kolaylaştırır.",
          "Okul ve ders grupları için Ders şablonu duyuru, ödev ve çalışma odası kanallarıyla gelir; ekran paylaşımı ile birlikte çalışmak, sunum provası yapmak veya bir konuyu anlatmak kolaylaşır. Yayıncılar ve küçük topluluk kurucuları için Topluluk ve Yayın şablonları duyuru, etkinlik ve sahne kanallarıyla düzenli bir başlangıç sunar.",
        ],
      },
      {
        h: "Beş dakikada geçiş: adım adım",
        p: [
          "1. Hesap aç: Descall’a e‑posta ile ya da Google hesabınla ücretsiz kaydol. İstersen hemen tarayıcıdan kullanmaya başla; kurulum şart değil.",
          "2. Sunucunu kur: boş bir sunucuyla başla ya da Oyun, Arkadaşlar, Topluluk, Ders veya Yayın şablonlarından birini seç. Roller ve kanallar otomatik gelir; isimleri dilediğin gibi değiştir.",
          "3. Arkadaşlarını davet et: davet bağlantısı oluştur ve grup sohbetine at. Bağlantıyı açan kişi sunucuyu önizler ve giriş yaptıktan sonra katılır.",
          "4. İlk sesli akşamı Descall’da yap: alışkanlık sesle taşınır. Bir akşam herkes aynı ses kanalına girdiğinde geçişin en zor kısmı biter.",
          "5. Masaüstü ve mobil: Windows kullananlar masaüstü uygulamasını, telefondan bağlanacaklar Android uygulamasını kurabilir. Aynı hesap her yerde çalışır.",
        ],
      },
      {
        h: "Gizlilik ve güvenlik: neyi söylüyoruz, neyi söylemiyoruz?",
        p: [
          "Web ve API trafiği HTTPS/TLS ile, gerçek zamanlı ses ve görüntü ise WebRTC’nin DTLS/SRTP şifrelemesiyle taşınır. Mesajlar aktarım sırasında şifrelidir ve cihazlarının sohbet geçmişini yükleyebilmesi için sunucuda saklanır; Descall tüm mesaj geçmişi için varsayılan uçtan uca şifreleme iddiasında bulunmaz. Ayrıntılar Güvenlik ve Gizlilik sayfalarında açıkça yazıyor.",
          "Descall, Türkiye’de Demir Sarp Kurtlar tarafından geliştirilen bağımsız bir uygulamadır ve şu an beta aşamasındadır. Bu, hızlı geliştiğimiz ve geri bildirimleri doğrudan dinlediğimiz anlamına geliyor; bir hata görürsen uygulama içinden ya da contact@descall.com adresinden yazabilirsin.",
        ],
      },
      {
        h: "Hangi URL’yi kullanmalıyım?",
        p: [
          "Bu sayfa Descall’ın Türkçe Discord alternatifi sayfasıdır. Eski /discord-alternative-turkey adresi kalıcı olarak buraya yönlendirilir. İngilizce sürüm için Discord alternative sayfasına, alternatiflerin dürüst bir karşılaştırması için Discord alternatifleri sayfasına bakabilirsin.",
        ],
      },
    ],
    faq: [
      {
        q: "Descall ücretsiz mi?",
        a: "Evet. Sohbet, sunucular, sesli ve görüntülü arama ve ekran paylaşımı ücretsizdir. Uygulamadaki tek ücretli şey isteğe bağlı kozmetiklerdir (DesCoin); iletişimi kısıtlamaz.",
      },
      {
        q: "Descall Türkiye’de çalışıyor mu?",
        a: "Evet. Descall Türkiye’de geliştirilir ve descall.com, Windows uygulaması, Android uygulaması ve tarayıcı sürümü Türkiye’den normal şekilde kullanılabilir.",
      },
      {
        q: "Discord sunucumu Descall’a taşıyabilir miyim?",
        a: "Mesaj geçmişini otomatik aktaran bir araç yok. Ama şablonlarla rolleri ve kanalları dakikalar içinde yeniden kurabilir, davet bağlantısıyla üyeleri çağırabilirsin.",
      },
      {
        q: "Discord’daki botlar Descall’da var mı?",
        a: "Discord’un bot pazarı Descall’da yok. Moderasyon, roller, davetler ve LFG gibi en çok bot gerektiren işler uygulamanın içinde yerleşik olarak bulunur.",
      },
      {
        q: "Telefonda kullanabilir miyim?",
        a: "Android uygulaması var; ayrıca tarayıcı sürümü telefon tarayıcısında da açılır. Masaüstünde Windows uygulaması bulunur.",
      },
    ],
    related: related("/tr/discord-alternatifi"),
  },

  "/tr/turk-discord": {
    path: "/tr/turk-discord",
    kicker: "Yerli · Türkçe · Ücretsiz",
    h1: "Türk Discord’u: Türkiye’de geliştirilen Descall",
    lead:
      "“Türk Discord’u var mı?” sorusunun bir cevabı Descall. Türkiye’de, bağımsız bir geliştirici olan Demir Sarp Kurtlar tarafından geliştirilen Descall; sunucular, roller, sesli ve görüntülü sohbet, ekran paylaşımı ve oyun arkadaşı bulma özelliklerini Türkçe bir arayüzde ve ücretsiz olarak sunar.",
    sections: [
      {
        h: "“Türk Discord’u” ne demek?",
        p: [
          "Discord’a erişim Ekim 2024’te Türkiye’de engellendikten sonra arama motorlarında “Türk Discord’u”, “yerli Discord” ve “Discord’un Türk versiyonu” aramaları hızla arttı. Bu aramaların arkasında genelde üç beklenti var: Türkiye’den sorunsuz çalışması, Türkçe olması ve Discord’a alışkın birinin hemen anlayabileceği bir yapıda olması.",
          "Descall bu üç beklentiye de doğrudan cevap verir. Uygulama Türkiye’de geliştirilir, arayüz baştan sona Türkçe kullanılabilir ve sunucu, kanal, rol, ses odası gibi kavramlar Discord kullanıcılarına tanıdık gelecek şekilde tasarlanmıştır. Ama Descall bir kopya değil; kendi tasarım dili, yerleşik LFG’si ve abonelik gerektirmeyen yaklaşımıyla ayrı bir üründür.",
        ],
      },
      {
        h: "Yerli olmak pratikte ne sağlar?",
        p: [
          "Türkçe destek: Bir sorun yaşadığında Türkçe yazabilirsin; geri bildirimler doğrudan geliştiriciye ulaşır. Uygulama içi metinler, yardım sayfaları ve bu web sitesinin Türkçe bölümü Türkçe konuşan kullanıcılar düşünülerek yazıldı, çeviri kokan metinler yerine doğal bir dil hedeflendi.",
          "Yerel ihtiyaçlara odak: Türkiye’deki oyuncu grupları, okul toplulukları ve arkadaş çevreleri nasıl iletişim kuruyorsa ürün ona göre şekilleniyor. Örneğin hazır Ders şablonu, sınav dönemlerinde çalışma odası açmak isteyen öğrenciler için; Oyun şablonu ise akşam takım kuran klanlar için hazırlandı.",
          "Şeffaflık: Descall’ın sahibi ve geliştiricisi açıkça belli: Demir Sarp Kurtlar. Şirket bilgisi, iletişim adresi ve sahiplik bilgisi “Descall’ın sahibi kim?” sayfasında yazıyor. Bir uygulamaya sohbetlerini emanet ederken kimin arkasında durduğunu bilmek önemli.",
        ],
      },
      {
        h: "Descall’ın özellikleri",
        p: ["Türk Discord’u olarak düşünebileceğin Descall’da bugün kullanabileceğin özellikler:"],
        list: [
          "Sunucular, kategoriler, yazı, ses ve sahne kanalları",
          "Rol hiyerarşisi ve kanal bazlı izin ayarları",
          "Oyun, Topluluk, Ders, Arkadaşlar ve Yayın şablonları",
          "Davet bağlantıları, atma, yasaklama, zaman aşımı ve denetim kayıtları",
          "Özel mesajlar, grup sohbetleri, arkadaş listesi ve çevrimiçi durumu",
          "Birebir ve grup halinde sesli/görüntülü arama",
          "Kalite ön ayarlı ekran paylaşımı",
          "İsteğe bağlı gürültü azaltma",
          "Play sekmesinde LFG lobileri",
          "Windows, Android ve tarayıcı; tek hesap",
        ],
      },
      {
        h: "Discord ile karşılaştırınca",
        p: [
          "Discord dünya çapında yüz milyonlarca kullanıcıya hizmet veren, yıllar içinde dev bir bot ve entegrasyon ekosistemi kurmuş bir platform. Descall bununla ekosistem büyüklüğünde yarışmıyor; arkadaş grupları, klanlar ve küçük‑orta ölçekli topluluklar için gerekenleri sade ve ücretsiz biçimde sunmaya odaklanıyor.",
          "Temel fark fiyatlandırma ve sadelikte. Descall’da ses kalitesi, ekran paylaşımı veya sunucu özellikleri bir aboneliğin arkasında değil. Ayrıca LFG için ayrı bir bot sunucusuna gerek yok; Play sekmesi uygulamanın içinde. Ayrıntılı bir tablo için Discord mu Descall mı karşılaştırma sayfasına göz atabilirsin.",
        ],
      },
      {
        h: "Topluluğunu Descall’a nasıl taşırsın?",
        p: [
          "Önce küçük başla: en aktif 5–10 kişiyle bir sunucu kur ve bir akşam sesli buluşmayı Descall’da yap. İnsanlar bir kez aynı ses kanalında buluştuğunda geri kalanı kendiliğinden gelir.",
          "Şablon seç: Oyun ya da Topluluk şablonu rolleri ve kanalları önceden kurar. Kanal isimlerini eski sunucundakilere benzetmek, üyelerin yolunu bulmasını kolaylaştırır.",
          "Davet bağlantısını sabitle: WhatsApp veya Telegram grubunda davet bağlantısını paylaş. Bağlantıyı açan kişi sunucuyu önizler, giriş yaptıktan sonra katılır.",
          "Yetkilileri belirle: moderatör rolünü güvendiğin birkaç kişiye ver, kuralları bir kanala yaz. Descall’da topluluk kuralları ve denetim kayıtları yerleşik olarak var.",
        ],
      },
      {
        h: "Beta aşaması hakkında",
        p: [
          "Descall şu an beta aşamasında. Bu, uygulamanın düzenli olarak güncellendiği, yeni özelliklerin sık geldiği ve zaman zaman hatalarla karşılaşabileceğin anlamına geliyor. Bir sorun gördüğünde uygulama içi geri bildirimle ya da contact@descall.com adresinden bildirebilirsin; yerli bir ekip olmanın avantajı, geri bildirimin hızlıca ürüne yansıyabilmesi.",
        ],
      },
    ],
    faq: [
      {
        q: "Türk Discord’u hangisi?",
        a: "Tek bir resmi “Türk Discord’u” yok; ama Descall, Türkiye’de geliştirilen, Türkçe arayüzlü ve Discord’a benzer yapıda (sunucular, roller, ses kanalları) ücretsiz bir alternatiftir.",
      },
      {
        q: "Descall’ı kim geliştiriyor?",
        a: "Descall’ı Türkiye’de Demir Sarp Kurtlar geliştiriyor. Kendisi Descall’ın kurucusu, sahibi ve CEO’sudur.",
      },
      {
        q: "Descall Discord’un kopyası mı?",
        a: "Hayır. Kavramlar Discord kullanıcılarına tanıdık gelir (sunucu, kanal, rol), ama Descall kendi tasarımı, yerleşik LFG’si ve abonelik gerektirmeyen yapısıyla ayrı bir üründür.",
      },
      {
        q: "Türkçe destek alabilir miyim?",
        a: "Evet. Uygulama içi geri bildirimden veya contact@descall.com adresinden Türkçe yazabilirsin.",
      },
    ],
    related: related("/tr/turk-discord"),
  },

  "/tr/discord-yerine-ne-kullanilir": {
    path: "/tr/discord-yerine-ne-kullanilir",
    kicker: "Rehber · 2026",
    h1: "Discord yerine ne kullanılır? İhtiyacına göre doğru uygulama",
    lead:
      "Discord yerine kullanılacak “en iyi” tek bir uygulama yok; doğru cevap grubunun Discord’u ne için kullandığına bağlı. Bu rehberde önce ihtiyacını netleştiriyoruz, sonra her senaryo için hangi tür uygulamanın işe yaradığını dürüstçe anlatıyoruz. Descall’ın nerede iyi olduğunu da, nerede olmadığını da söylüyoruz.",
    sections: [
      {
        h: "Önce şunu sor: Discord’u ne için kullanıyordunuz?",
        p: [
          "Discord aslında birkaç farklı uygulamanın bir araya gelmiş hali: sesli sohbet odası, grup mesajlaşma, topluluk forumu, ekran paylaşımı aracı ve bot platformu. Çoğu grup bunların sadece ikisini üçünü düzenli kullanır. Yeni bir uygulama seçmeden önce son bir ayda gerçekten ne yaptığınızı düşün:",
        ],
        list: [
          "Her akşam ses kanalında oyun oynarken konuşmak mı?",
          "Arkadaşlarla gün boyu mesajlaşmak, fotoğraf ve link paylaşmak mı?",
          "Kurallı, rollü, onlarca kişilik bir topluluğu yönetmek mi?",
          "Ders çalışırken veya birlikte iş yaparken ekran paylaşmak mı?",
          "Oyun arkadaşı (LFG) bulmak mı?",
          "Botlarla otomasyon, müzik, seviye sistemi gibi ekstralar mı?",
        ],
      },
      {
        h: "Senaryo 1: Arkadaş grubuyla akşam sesli sohbet",
        p: [
          "En yaygın kullanım bu. Burada önemli olan sesin net olması, herkesin tek tıkla aynı odaya girebilmesi ve gerektiğinde ekran paylaşabilmek. WhatsApp veya Telegram grup aramaları kısa konuşmalar için iş görür ama saatlerce açık kalan, girilip çıkılan kalıcı bir “oda” hissi vermez.",
          "Descall bu senaryo için tasarlandı: bir sunucu kur, birkaç ses kanalı aç, arkadaşların istedikleri zaman girip çıksın. Sesli ve görüntülü arama, kalite ön ayarlı ekran paylaşımı ve isteğe bağlı gürültü azaltma ücretsiz. Windows’ta masaüstü uygulaması, telefonda Android uygulaması, kurulum istemeyenler için tarayıcı sürümü var.",
        ],
      },
      {
        h: "Senaryo 2: Oyun klanı veya takım",
        p: [
          "Klanlar için ses kanallarının yanında düzen önemlidir: duyuru kanalı, yetkili odası, roller, maç ya da etkinlik planlama. Ayrıca eksik oyuncuyu bulmak (LFG) çoğu zaman ayrı bir sunucu veya bot gerektirir.",
          "Descall’da Oyun şablonu rolleri ve kanalları hazır kurar; Play sekmesindeki LFG lobileri ile ayrı bir bot sunucusuna gerek kalmadan oyun arkadaşı bulabilirsin. Lobiden sesli kanala geçiş aynı hesapla, aynı uygulamada olur. Sadece ses odası isteyen ve kendi sunucusunu barındırmak isteyen teknik gruplar için TeamSpeak veya Mumble gibi klasik sesli sohbet yazılımları da hâlâ seçenek; ancak mesajlaşma, roller ve ekran paylaşımı tarafında daha sınırlıdırlar.",
        ],
      },
      {
        h: "Senaryo 3: Okul, ders ve çalışma grupları",
        p: [
          "Öğrenci grupları için duyuru, ödev paylaşımı, soru‑cevap ve birlikte çalışma odası gerekir. Ekran paylaşımı burada çok değerlidir: bir soruyu birlikte çözmek, sunum provası yapmak veya bir konuyu anlatmak için.",
          "Descall’ın Ders şablonu bu ihtiyaca göre kanallarla gelir. Resmi bir kurum ortamı (not verme, ödev teslimi, sınav) gerekiyorsa okulun kullandığı eğitim platformları daha uygundur; ama öğrencilerin kendi aralarında buluştuğu yer için Descall gibi bir sohbet uygulaması daha rahattır.",
        ],
      },
      {
        h: "Senaryo 4: Sadece mesajlaşma",
        p: [
          "Eğer grubunuz Discord’u neredeyse sadece yazışmak için kullanıyorduysa, zaten telefonunuzda olan WhatsApp veya Telegram yeterli olabilir. Bu uygulamalar mesajlaşmada çok güçlüdür; zayıf oldukları yer kalıcı ses odaları, rol ve kanal yapısı ve ekran paylaşımıdır.",
          "Yazışmanın yanında ara sıra sesli buluşma da yapıyorsanız, mesajlaşma ve ses odasını tek uygulamada toplamak dağınıklığı azaltır. Descall’da DM’ler, grup sohbetleri ve sunucu kanalları aynı yerde.",
        ],
      },
      {
        h: "Senaryo 5: İş ve profesyonel ekipler",
        p: [
          "İş ekipleri için Slack, Microsoft Teams veya Google Meet gibi araçlar; takvim, dosya yönetimi ve kurumsal hesap entegrasyonları sayesinde daha uygundur. Descall bir iş aracı değil; arkadaşlar, oyuncular ve topluluklar için bir sohbet uygulaması. Bunu açıkça söylemek, yanlış araçla vakit kaybetmeni önler.",
        ],
      },
      {
        h: "Karar tablosu",
        p: ["Kısaca hangi ihtiyaç için ne düşünmelisin:"],
        list: [
          "Akşam sesli sohbet + ekran paylaşımı → Descall",
          "Klan, roller, LFG → Descall",
          "Öğrenci çalışma grubu → Descall (resmi ders için okulun platformu)",
          "Sadece mesajlaşma → WhatsApp veya Telegram",
          "Kendi sunucunda sadece ses → TeamSpeak veya Mumble",
          "İş ekibi → Slack, Teams veya Meet",
          "Dev bot ekosistemi ve on binlerce kişilik herkese açık topluluk → Descall’ın şu an hedeflemediği bir alan",
        ],
      },
      {
        h: "Geçişi kolaylaştıracak üç ipucu",
        p: [
          "Herkesi aynı gün taşımaya çalışma. Önce en aktif birkaç kişiyle başla, bir akşam sesli buluşmayı yeni uygulamada yap. Alışkanlık sesle taşınır.",
          "Kanal yapısını basit tut. Eski sunucudaki 40 kanalı birebir kopyalamak yerine gerçekten kullanılan 5–6 kanalla başla; şablonlar bu konuda iyi bir başlangıç noktası.",
          "Davet bağlantısını görünür bir yere koy: grup sohbetinin açıklamasına veya sabitlenmiş mesaja. Yeni gelenler bağlantıdan sunucuyu önizleyip katılabilir.",
        ],
      },
    ],
    faq: [
      {
        q: "Discord yerine en çok ne kullanılıyor?",
        a: "İhtiyaca göre değişir: sadece yazışanlar WhatsApp veya Telegram’a, ses odası ve sunucu isteyenler Descall gibi Discord tarzı uygulamalara, iş ekipleri Slack veya Teams’e yöneliyor.",
      },
      {
        q: "Discord yerine ücretsiz bir uygulama var mı?",
        a: "Evet. Descall’da sohbet, sunucular, sesli/görüntülü arama ve ekran paylaşımı ücretsizdir; isteğe bağlı kozmetikler dışında ödeme yoktur.",
      },
      {
        q: "WhatsApp Discord’un yerini tutar mı?",
        a: "Mesajlaşma için evet, ama kalıcı ses odaları, roller, kanallar ve kalite ön ayarlı ekran paylaşımı gibi Discord’a özgü yapıları sunmaz.",
      },
      {
        q: "Discord’dan mesaj geçmişimi taşıyabilir miyim?",
        a: "Discord’dan başka bir uygulamaya mesaj geçmişini otomatik aktaran resmi bir yol yok. Sunucu yapısını şablonlarla yeniden kurmak en pratik yöntem.",
      },
    ],
    related: related("/tr/discord-yerine-ne-kullanilir"),
  },

  "/tr/sesli-sohbet-uygulamasi": {
    path: "/tr/sesli-sohbet-uygulamasi",
    kicker: "Sesli sohbet · Ücretsiz",
    h1: "Ücretsiz sesli sohbet uygulaması: arkadaşlarınla her akşam aynı odada",
    lead:
      "Descall, arkadaş grupları ve topluluklar için ücretsiz bir sesli sohbet uygulamasıdır. Telefon araması gibi tek seferlik değil, istediğin zaman girip çıkabildiğin kalıcı ses odaları sunar. Sesli ve görüntülü arama, ekran paylaşımı ve gürültü azaltma ücretsizdir; Windows, Android ve tarayıcıdan aynı hesapla bağlanırsın.",
    sections: [
      {
        h: "Sesli sohbet uygulamasından ne beklemeli?",
        p: [
          "İyi bir sesli sohbet uygulaması birkaç basit şeyi iyi yapmalı: ses net ve gecikmesiz olmalı, odaya girmek tek tık sürmeli, kimin konuştuğu belli olmalı ve gerektiğinde ekran paylaşılabilmeli. Bunun yanında arka plan gürültüsünü azaltmak, mikrofon ve hoparlör seçimini kolayca yapabilmek ve farklı cihazlardan bağlanabilmek de önemli.",
          "Grup aramaları sunan mesajlaşma uygulamaları kısa konuşmalar için iş görür; ama saatlerce açık kalan, arkadaşların gelip gittiği bir “oda” hissini vermez. Descall’daki ses kanalları bu boşluğu doldurur: sunucunda bir ses kanalı açarsın, o kanal hep oradadır, kim müsaitse girer.",
        ],
      },
      {
        h: "Descall’da sesli sohbet nasıl çalışır?",
        p: [
          "Üç farklı şekilde sesli konuşabilirsin. Birebir aramada bir arkadaşının DM’inden doğrudan sesli veya görüntülü arama başlatırsın. Grup aramasında bir grup sohbetindeki herkesle aynı anda konuşursun. Sunucu ses kanallarında ise kalıcı odalar açarsın; “Oyun”, “Sohbet”, “Ders” gibi kanallara üyeler istedikleri zaman bağlanır.",
          "Ses ve görüntü WebRTC teknolojisiyle taşınır ve DTLS/SRTP ile şifrelenir. Bağlantı zor ağlarda bile kurulabilsin diye TURN sunucuları kullanılır. Ses kanalında kimin konuştuğu görsel olarak gösterilir; kendini susturabilir, sağırlaştırabilir veya kamerayı açıp kapatabilirsin.",
        ],
      },
      {
        h: "Özellikler",
        p: ["Descall sesli sohbet tarafında bugün şunları sunar:"],
        list: [
          "Kalıcı sunucu ses kanalları ve sahne (stage) kanalları",
          "Birebir ve grup sesli/görüntülü arama",
          "Kalite ön ayarlı ekran paylaşımı",
          "İsteğe bağlı gürültü azaltma (klavye, fan, arka plan sesi)",
          "Konuşan kişi göstergesi, susturma ve sağırlaştırma",
          "Rol bazlı kanal izinleri: belirli ses odalarını sadece belirli rollere aç",
          "Windows masaüstü uygulaması, Android uygulaması ve tarayıcı sürümü",
          "Hepsi ücretsiz; abonelik gerekmez",
        ],
      },
      {
        h: "Ses kalitesini artırmak için pratik ipuçları",
        p: [
          "Masaüstü uygulamasını kullan: Windows’ta masaüstü uygulaması, tarayıcı sekmesi kapanması veya tarayıcının arka planda sesi kısması gibi sorunları ortadan kaldırır.",
          "Kulaklık kullan: hoparlörden gelen sesin mikrofona geri girmesi (yankı) sesli sohbetteki en yaygın sorundur. Kulaklık bunu tamamen çözer.",
          "Gürültü azaltmayı aç: mekanik klavye, bilgisayar fanı veya sokak sesi varsa gürültü azaltma filtresi bunları büyük ölçüde bastırır.",
          "Doğru mikrofonu seç: birden fazla ses cihazın varsa ayarlardan hangi mikrofonun ve çıkışın kullanıldığını kontrol et.",
          "Ağ bağlantısı: Wi‑Fi zayıfsa kablolu bağlantı veya modeme yakın olmak gecikmeyi ve kopmaları azaltır.",
        ],
      },
      {
        h: "Kimler kullanıyor?",
        p: [
          "Oyun oynarken konuşmak isteyen arkadaş grupları, ders çalışırken aynı odada olmak isteyen öğrenciler, her akşam sohbet eden uzak mesafedeki arkadaşlar ve küçük topluluklar Descall’ın ses kanallarını kullanıyor. Ortak nokta, “birini aramak” yerine “odaya girmek” rahatlığı.",
          "Ekran paylaşımı ise sesli sohbeti bir adım öteye taşır: birlikte bir video izlemek, oyunda bir taktiği göstermek, bir soruyu birlikte çözmek veya bir sunumu prova etmek için ses kanalındayken ekranını paylaşabilirsin.",
        ],
      },
      {
        h: "Gizlilik",
        p: [
          "Sesli ve görüntülü aramalar aktarım sırasında şifrelenir. Descall varsayılan uçtan uca şifreleme iddiasında bulunmaz; ne yaptığımızı ve ne yapmadığımızı Güvenlik sayfasında açıkça yazıyoruz. Kanal izinleriyle bir ses odasını yalnızca seçtiğin rollere açabilir, davet bağlantılarıyla sunucuna kimin katılacağını kontrol edebilirsin.",
        ],
      },
      {
        h: "Hemen başla",
        p: [
          "Ücretsiz hesap aç, bir sunucu oluştur ve davet bağlantısını arkadaşlarına gönder. Kurulum istemeyenler tarayıcıdan, Windows kullananlar masaüstü uygulamasından, telefondan bağlanmak isteyenler Android uygulamasından katılabilir. İlk ses kanalına girmen bir dakikadan kısa sürer.",
        ],
      },
    ],
    faq: [
      {
        q: "Descall’da sesli sohbet ücretsiz mi?",
        a: "Evet. Birebir ve grup aramaları, sunucu ses kanalları, görüntülü arama ve ekran paylaşımı ücretsizdir.",
      },
      {
        q: "Bir ses kanalına kaç kişi girebilir?",
        a: "Descall arkadaş grupları ve küçük‑orta topluluklar için optimize edilmiştir. Bu ölçekteki gruplar ses kanallarını rahatça kullanabilir.",
      },
      {
        q: "Gürültü azaltma var mı?",
        a: "Evet. Ses ayarlarından isteğe bağlı gürültü azaltma filtresini açarak klavye, fan ve arka plan seslerini bastırabilirsin.",
      },
      {
        q: "Telefondan sesli sohbete katılabilir miyim?",
        a: "Evet. Android uygulamasıyla veya telefon tarayıcısından tarayıcı sürümüyle ses kanallarına katılabilirsin.",
      },
    ],
    related: related("/tr/sesli-sohbet-uygulamasi"),
  },

  "/tr/oyuncu-sohbet-uygulamasi": {
    path: "/tr/oyuncu-sohbet-uygulamasi",
    kicker: "Oyuncular · Klanlar · LFG",
    h1: "Oyuncular için sohbet uygulaması: klan sunucusu, ses ve LFG tek yerde",
    lead:
      "Descall oyuncular için tasarlanmış ücretsiz bir sohbet uygulamasıdır. Klanın için rolleri ve kanalları hazır bir sunucu kurarsın, oyun oynarken ses kanalında konuşursun, ekranını paylaşırsın ve eksik oyuncuyu Play sekmesindeki LFG lobilerinden bulursun. Bot kurmana ya da abonelik almana gerek yok.",
    sections: [
      {
        h: "Oyuncuların bir sohbet uygulamasından beklentisi",
        p: [
          "Oyun oynarken iletişim, oyunun kendisi kadar önemli. Net ve düşük gecikmeli ses, oyunu yormayan hafif bir uygulama, tek tıkla girilen ses kanalları ve gerektiğinde ekran paylaşımı temel beklentiler. Klan ve takımlar için buna roller, duyuru ve yetkili kanalları eklenir. Bir de herkesin ortak derdi var: eksik oyuncu bulmak.",
          "Çoğu oyuncu bu ihtiyaçları birkaç uygulama ve bot arasında bölüştürür: ses için bir uygulama, LFG için ayrı bir sunucu, düzen için botlar. Descall bunları tek bir uygulamada toplamayı hedefler.",
        ],
      },
      {
        h: "Klan sunucusunu dakikalar içinde kur",
        p: [
          "Descall’ın Oyun şablonu, bir klan sunucusunun ihtiyaç duyduğu yapıyı hazır getirir: duyuru kanalı, genel sohbet, ses odaları, yetkili odası ve Admin, Moderatör, Üye gibi roller. Kanal bazlı izinlerle yetkili odasını sadece yöneticilere, duyuru kanalında yazmayı sadece liderlere açabilirsin.",
          "Davet bağlantısı oluşturup klan üyelerine gönderdiğinde, bağlantıyı açan kişi sunucuyu önizler ve giriş yaptıktan sonra katılır. Moderasyon tarafında atma, yasaklama, zaman aşımı ve denetim kayıtları yerleşik olarak bulunur; bunlar için bot kurman gerekmez.",
        ],
      },
      {
        h: "Oyun içi sesli sohbet",
        p: [
          "Ses kanalları kalıcıdır: “Rekabetçi”, “Rahat oyun”, “AFK” gibi odalar aç, üyeler istedikleri zaman girsin. Konuşan kişi göstergesi kimin konuştuğunu gösterir, susturma ve sağırlaştırma tek tıktır. İsteğe bağlı gürültü azaltma, mekanik klavye ve fan sesini bastırarak takım arkadaşlarının seni net duymasını sağlar.",
          "Windows’ta masaüstü uygulaması, tarayıcı sekmelerinin arka planda yavaşlatılması gibi sorunları ortadan kaldırır ve oyun oynarken arka planda sessizce çalışır. Ses ve görüntü WebRTC ile taşınır, zor ağlarda bağlantı için TURN sunucuları kullanılır.",
        ],
      },
      {
        h: "Ekran paylaşımı: taktik, tekrar izleme, birlikte izleme",
        p: [
          "Kalite ön ayarlı ekran paylaşımıyla oyun ekranını takım arkadaşlarına gösterebilirsin. Bir maçın tekrarını birlikte izleyip hataları konuşmak, yeni bir oyunu arkadaşına göstermek veya strateji anlatmak için idealdir. Akıcılık ya da netlik önceliğine göre ön ayar seçebilirsin.",
        ],
      },
      {
        h: "LFG: Play sekmesinde takım arkadaşı bul",
        p: [
          "Descall’ın Play sekmesi yerleşik bir LFG (looking for group, takım arkadaşı arama) alanıdır. Bir lobi oluşturursun ya da açık lobilere katılırsın; aradığın oyuncuyu bulduğunda aynı uygulamada, aynı hesapla sesli kanala geçersiniz.",
          "Bu yaklaşım, LFG için ayrı bir sunucuya katılmak, bot komutlarını öğrenmek ve oyunculara ayrı bir uygulamadan ulaşmak zorunda kalmamak demek. Lobiden sese giden yol kısaldıkça daha çok oyun, daha az bekleme olur.",
        ],
      },
      {
        h: "Özellik listesi",
        p: ["Oyuncular için Descall’da bugün bulunan özellikler:"],
        list: [
          "Oyun şablonuyla hazır klan sunucusu",
          "Roller, kanal izinleri, yetkili odaları",
          "Kalıcı ses kanalları ve sahne kanalları",
          "Sesli/görüntülü arama ve kalite ön ayarlı ekran paylaşımı",
          "İsteğe bağlı gürültü azaltma",
          "Play sekmesinde LFG lobileri",
          "Atma, yasaklama, zaman aşımı ve denetim kayıtları",
          "Windows, Android ve tarayıcı",
          "Ücretsiz; kozmetikler isteğe bağlı (DesCoin)",
        ],
      },
      {
        h: "Dürüst not: Descall neyi yapmıyor?",
        p: [
          "Discord’un devasa bot pazarı (müzik botları, seviye sistemleri, karmaşık otomasyonlar) Descall’da yok. On binlerce kişilik herkese açık oyun toplulukları için Discord’un ekosistemi hâlâ daha geniş. Descall arkadaş grupları, klanlar ve küçük‑orta topluluklar için en iyi sonucu verir. Ayrıca Descall bir oyun içi overlay veya oyun mağazası değil; oyun dışındaki iletişimi kolaylaştıran bir sohbet uygulamasıdır.",
        ],
      },
    ],
    faq: [
      {
        q: "Oyun oynarken Descall performansı etkiler mi?",
        a: "Descall hafif olacak şekilde tasarlanmıştır. Windows masaüstü uygulaması arka planda çalışırken oyuna minimum yük bindirmeyi hedefler.",
      },
      {
        q: "LFG için bot gerekiyor mu?",
        a: "Hayır. LFG lobileri Play sekmesinde yerleşik olarak bulunur; bot kurmana gerek yoktur.",
      },
      {
        q: "Klan sunucusu kurmak ücretli mi?",
        a: "Hayır. Sunucu kurmak, rol ve kanal oluşturmak, ses kanallarını kullanmak ücretsizdir.",
      },
      {
        q: "Takım arkadaşlarım telefondan katılabilir mi?",
        a: "Evet. Android uygulaması ya da telefon tarayıcısındaki tarayıcı sürümüyle katılabilirler.",
      },
    ],
    related: related("/tr/oyuncu-sohbet-uygulamasi"),
  },

  "/tr/discord-acildi-mi": {
    path: "/tr/discord-acildi-mi",
    kicker: "Güncel durum",
    h1: "Discord açıldı mı? Türkiye’de Discord erişim durumu",
    updated: "2026-10-17",
    updatedLabel: "Son güncelleme: 17 Ekim 2026",
    lead:
      "Kısa cevap: Hayır. Discord, 9 Ekim 2024’ten bu yana Türkiye’de mahkeme kararıyla erişime kapalı ve 17 Ekim 2026 itibarıyla engel hâlâ sürüyor. Bu sayfada engelin ne zaman ve nasıl başladığını, bugün neyin geçerli olduğunu ve bu süreçte arkadaşlarınla iletişimde kalmak için hangi seçeneklerin olduğunu özetliyoruz.",
    sections: [
      {
        h: "Güncel durum (17 Ekim 2026)",
        p: [
          "Discord Türkiye’de erişime kapalı. 9 Ekim 2024’te verilen mahkeme kararıyla başlayan erişim engeli kaldırılmadı; Discord’un web sitesi ve uygulamaları Türkiye’deki internet servis sağlayıcıları üzerinden normal şekilde açılmıyor.",
          "Engelin kaldırıldığına dair resmi bir karar duyurulduğunda bu sayfayı güncelleyeceğiz. Sosyal medyada zaman zaman “Discord açıldı” iddiaları dolaşıyor; bunlar genelde kısa süreli bağlantı dalgalanmalarından veya farklı ağlardan yapılan denemelerden kaynaklanıyor. Kesin bilgi için resmi açıklamaları takip etmek en doğrusu.",
        ],
      },
      {
        h: "Engel ne zaman ve nasıl başladı?",
        p: [
          "Discord’a erişim 9 Ekim 2024’te, bir sulh ceza hâkimliğinin verdiği karar doğrultusunda Bilgi Teknolojileri ve İletişim Kurumu (BTK) tarafından uygulanan erişim engeliyle kapatıldı. Engelden önceki günlerde platformdaki bazı içerikler kamuoyunda tartışılmış, Adalet Bakanlığı ve yetkililer de platformla ilgili açıklamalar yapmıştı.",
          "Karar sonrasında Discord’un web sitesi, masaüstü ve mobil uygulamaları Türkiye’den erişilemez hale geldi. Uygulama mağazalarındaki erişim de etkilendi. O tarihten bu yana engel yürürlükte.",
        ],
      },
      {
        h: "Bu süreçte ne değişti?",
        p: [
          "Engel, Türkiye’deki milyonlarca Discord kullanıcısını etkiledi: oyun klanları, okul toplulukları, yazılım ve tasarım toplulukları, yayıncılar ve en çok da her akşam sesli sohbette buluşan arkadaş grupları. Bir kısmı geçici çözümlerle Discord’u kullanmaya devam etmeye çalıştı, bir kısmı mesajlaşma uygulamalarına dağıldı, birçok topluluk da yeni bir ortak alan aradı.",
          "Bu dönemde Türkiye’den erişilebilen, Discord’a benzer yapıda (sunucular, ses kanalları, roller) uygulamalara ilgi belirgin şekilde arttı. Descall da bu ihtiyaca Türkçe ve ücretsiz bir seçenek olarak cevap veriyor.",
        ],
      },
      {
        h: "VPN veya DNS değiştirmek hakkında",
        p: [
          "Bazı kullanıcılar engelli sitelere VPN veya DNS ayarlarıyla erişmeye çalışıyor. Bu yöntemlerin bağlantı kalitesi, güvenilirlik ve hukuki açıdan kendi riskleri var; ücretsiz VPN hizmetleri ayrıca kişisel veri açısından sorunlu olabiliyor. Bu konuda bir yönlendirme yapmıyoruz; herkesin kendi durumunu ve geçerli mevzuatı değerlendirmesi gerekiyor.",
          "Ayrıca dolaylı yollarla bağlanmak sesli sohbette gecikmeyi artırabilir; arkadaş grubundaki herkesin aynı yöntemi kurabilmesi de çoğu zaman zor. Bu yüzden birçok grup, doğrudan erişilebilen bir alternatife geçmeyi daha pratik buluyor.",
        ],
      },
      {
        h: "Arkadaşlarınla iletişimde kalmak için seçenekler",
        p: [
          "Sadece mesajlaşma yeterliyse WhatsApp veya Telegram grupları iş görür. Kalıcı ses odaları, roller ve kanallarla düzenli bir sunucu, ekran paylaşımı ve oyun arkadaşı bulma gibi Discord’a özgü özellikler istiyorsan Descall gibi Discord tarzı bir uygulama daha uygun olur.",
          "Descall Türkiye’de geliştirilir, Türkiye’den doğrudan erişilebilir ve şunları ücretsiz sunar: sunucular, roller ve kanal izinleri, hazır şablonlar, sesli ve görüntülü arama, kalite ön ayarlı ekran paylaşımı, gürültü azaltma, Play sekmesinde LFG. Windows, Android ve tarayıcıdan kullanılabilir.",
        ],
      },
      {
        h: "Discord tekrar açılırsa ne olacak?",
        p: [
          "Erişim engeli kaldırılırsa Discord hesapların ve sunucuların büyük ihtimalle olduğu gibi duruyor olacak. Descall’a geçmek, Discord hesabını silmek anlamına gelmez; birçok grup ikisini birlikte kullanabilir. Descall’da kurduğun sunucu, roller ve arkadaş listen de her durumda seninle kalır.",
          "Bu sayfayı düzenli olarak güncelliyoruz. Sayfanın başındaki “Son güncelleme” tarihi, bilgilerin en son ne zaman kontrol edildiğini gösterir.",
        ],
      },
    ],
    faq: [
      {
        q: "Discord açıldı mı?",
        a: "Hayır. Discord 9 Ekim 2024’ten beri Türkiye’de mahkeme kararıyla erişime kapalı ve 17 Ekim 2026 itibarıyla engel sürüyor.",
      },
      {
        q: "Discord neden kapatıldı?",
        a: "Erişim engeli 9 Ekim 2024’te bir sulh ceza hâkimliği kararı doğrultusunda BTK tarafından uygulandı. Engelden önce platformdaki bazı içerikler kamuoyunda tartışılmıştı.",
      },
      {
        q: "Discord ne zaman açılacak?",
        a: "Açıklanmış bir tarih yok. Engelin kaldırıldığına dair resmi bir karar duyurulduğunda bu sayfa güncellenecek.",
      },
      {
        q: "Discord yerine ne kullanabilirim?",
        a: "Mesajlaşma için WhatsApp veya Telegram; sunucu, ses kanalı, ekran paylaşımı ve LFG için Türkiye’de geliştirilen ücretsiz Descall kullanılabilir.",
      },
    ],
    related: related("/tr/discord-acildi-mi"),
  },

  "/tr/discord-alternatifleri": {
    path: "/tr/discord-alternatifleri",
    kicker: "Karşılaştırma · 2026",
    h1: "Discord alternatifleri: 2026 için dürüst karşılaştırma",
    lead:
      "Discord alternatifleri listelerinin çoğu aynı uygulamaları sıralayıp hepsine “harika” der. Bu sayfada farklı bir şey yapıyoruz: her uygulamanın gerçekten neyde iyi olduğunu ve neyde zayıf kaldığını yazıyoruz. Descall’ı biz geliştiriyoruz; bu yüzden onun sınırlarını da açıkça söylüyoruz.",
    sections: [
      {
        h: "Nasıl değerlendirdik?",
        p: [
          "Her uygulamayı Discord’un en çok kullanılan beş işine göre değerlendirdik: kalıcı ses odaları, grup mesajlaşma, sunucu/kanal/rol yapısı, ekran paylaşımı ve oyun arkadaşı bulma (LFG). Bunlara fiyat, Türkçe arayüz, Türkiye’den erişim ve platform desteğini (Windows, Android, tarayıcı) ekledik. Özellik bilgileri, uygulamaların genel ve uzun süredir bilinen yeteneklerine dayanıyor; fiyat ve özellik ayrıntıları zamanla değişebilir, karar vermeden önce resmi sitelerini kontrol etmeni öneririz.",
        ],
      },
      {
        h: "Descall",
        p: [
          "Güçlü yanları: Discord’a en yakın yapı. Sunucular, kategoriler, yazı/ses/sahne kanalları, rol hiyerarşisi ve kanal izinleri, hazır şablonlar, davet bağlantıları ve yerleşik moderasyon var. Sesli/görüntülü arama, kalite ön ayarlı ekran paylaşımı, gürültü azaltma ve Play sekmesinde LFG ücretsiz. Türkiye’de geliştiriliyor, Türkçe arayüzü var, Türkiye’den doğrudan erişiliyor. Windows, Android ve tarayıcıda çalışıyor.",
          "Zayıf yanları: Discord’un bot pazarı ve entegrasyon ekosistemi yok. Beta aşamasında olduğu için zaman zaman hatalarla karşılaşılabilir. Çok büyük, herkese açık topluluklar için tasarlanmadı; arkadaş grupları, klanlar ve küçük‑orta topluluklar için en iyi sonucu verir. Tüm mesaj geçmişi için varsayılan uçtan uca şifreleme iddiası yok.",
          "Kimin için: Discord’daki sunucu + ses + ekran paylaşımı alışkanlığını korumak isteyen arkadaş grupları, oyun klanları ve öğrenci toplulukları.",
        ],
      },
      {
        h: "TeamSpeak",
        p: [
          "Güçlü yanları: Oyuncular arasında uzun yıllardır bilinen, ses odaklı bir uygulama. Ses kalitesi ve düşük gecikme konusunda iyi bir üne sahip; kendi sunucunu barındırma seçeneği teknik gruplara kontrol sağlıyor.",
          "Zayıf yanları: Discord tarzı zengin mesajlaşma, kolay davet ve modern topluluk özellikleri açısından daha sınırlı. Sunucu kurulumu ve yönetimi yeni başlayanlar için karmaşık olabilir; arayüzü Discord’a alışkın kullanıcılara eski gelebilir.",
          "Kimin için: Ağırlıklı olarak sesle iletişim kuran, teknik bilgisi olan ve sunucusunu kendisi yönetmek isteyen oyun grupları.",
        ],
      },
      {
        h: "Mumble",
        p: [
          "Güçlü yanları: Açık kaynaklı, ücretsiz ve düşük gecikmeli bir sesli sohbet yazılımı. Kendi sunucunu kurabilirsin; hafif ve verimli.",
          "Zayıf yanları: Arayüz sade ama eski; mesajlaşma, ekran paylaşımı ve topluluk yönetimi Discord’a kıyasla çok sınırlı. Kurulum teknik bilgi gerektirir.",
          "Kimin için: Sadece ses isteyen, açık kaynak tercih eden ve sunucu yönetmekten çekinmeyen kullanıcılar.",
        ],
      },
      {
        h: "Telegram",
        p: [
          "Güçlü yanları: Mesajlaşmada çok güçlü; büyük gruplar, kanallar, botlar ve dosya paylaşımı. Türkiye’de yaygın kullanılıyor; telefon ve masaüstünde iyi çalışıyor. Grup sesli sohbetleri de var.",
          "Zayıf yanları: Discord’daki gibi tek bir topluluk içinde çok sayıda kalıcı ses kanalı, rol bazlı kanal izinleri ve sunucu yapısı yok. Oyun odaklı LFG gibi özellikler sunmuyor.",
          "Kimin için: Ağırlıklı olarak yazışan, duyuru kanalı veya büyük sohbet grubu isteyen topluluklar.",
        ],
      },
      {
        h: "WhatsApp",
        p: [
          "Güçlü yanları: Neredeyse herkesin telefonunda zaten var; kurulum ve davet derdi yok. Mesajlaşma ve kısa grup aramaları için pratik.",
          "Zayıf yanları: Kalıcı ses odaları, kanallar, roller ve topluluk yönetimi açısından Discord’un yerini tutmaz. Masaüstünde oyun oynarken uzun süreli sesli sohbet için tasarlanmamıştır.",
          "Kimin için: Küçük arkadaş grupları için günlük mesajlaşma; sesli oyun akşamları için ise genelde yetersiz.",
        ],
      },
      {
        h: "Slack",
        p: [
          "Güçlü yanları: Kanallar, konu başlıkları (thread), entegrasyonlar ve aramada çok güçlü. İş ekipleri için endüstri standardı araçlardan biri.",
          "Zayıf yanları: İş odaklı; ücretsiz planı mesaj geçmişi ve bazı özellikler açısından sınırlı. Oyun, arkadaş grubu ve kalıcı ses odası kültürüne uygun değil.",
          "Kimin için: Profesyonel ekipler ve iş toplulukları.",
        ],
      },
      {
        h: "Element (Matrix)",
        p: [
          "Güçlü yanları: Açık ve merkeziyetsiz Matrix protokolünü kullanır; kendi sunucunu barındırabilirsin ve uçtan uca şifrelemeye önem verir. Gizlilik odaklı topluluklar için iyi bir seçenek.",
          "Zayıf yanları: Kurulum ve kavramlar (sunucular arası federasyon gibi) yeni kullanıcılar için karmaşık olabilir. Sesli sohbet ve oyuncu odaklı özellikler Discord kadar akıcı değil.",
          "Kimin için: Gizliliği ve kendi altyapısını yönetmeyi ön planda tutan teknik topluluklar.",
        ],
      },
      {
        h: "Özet karşılaştırma",
        p: ["Hangi ihtiyaç için hangisi daha uygun:"],
        list: [
          "Discord’a en yakın deneyim (sunucu + ses + roller + ekran paylaşımı) → Descall",
          "Oyun klanı ve LFG → Descall",
          "Sadece ses, kendi sunucun → TeamSpeak veya Mumble",
          "Yoğun mesajlaşma, duyuru kanalı → Telegram",
          "Herkesin zaten kullandığı basit grup sohbeti → WhatsApp",
          "İş ekibi → Slack",
          "Gizlilik ve kendi altyapın → Element (Matrix)",
        ],
      },
      {
        h: "Seçmeden önce bir hafta dene",
        p: [
          "En iyi Discord alternatifi, grubunun hatırlatma yapmadan kendiliğinden kullandığı uygulamadır. Bir veya iki adayı seç, gerçek arkadaşlarınla bir hafta boyunca akşam buluşmalarını orada yap. Hangisinde herkes kendiliğinden toplanıyorsa cevap odur.",
          "Descall’ı denemek için hesap açmak ücretsiz ve bir dakika sürer; tarayıcıdan kurulum olmadan başlayabilirsin.",
        ],
      },
    ],
    faq: [
      {
        q: "En iyi Discord alternatifi hangisi?",
        a: "İhtiyaca bağlı. Sunucu, ses kanalı, roller ve ekran paylaşımı istiyorsan Descall Discord’a en yakın deneyimi sunar; sadece ses için TeamSpeak/Mumble, mesajlaşma için Telegram/WhatsApp, iş için Slack daha uygundur.",
      },
      {
        q: "Türkçe Discord alternatifi var mı?",
        a: "Evet. Descall Türkiye’de geliştirilir ve Türkçe arayüzle kullanılabilir.",
      },
      {
        q: "Ücretsiz Discord alternatifleri hangileri?",
        a: "Descall’da sohbet, sunucular, ses ve ekran paylaşımı ücretsizdir. Mumble açık kaynak ve ücretsizdir; Telegram ve WhatsApp da ücretsiz kullanılabilir.",
      },
      {
        q: "Bu karşılaştırma tarafsız mı?",
        a: "Descall’ı biz geliştiriyoruz; bu yüzden tamamen tarafsız olduğumuzu iddia etmiyoruz. Bunun yerine her uygulamanın, Descall dahil, zayıf yanlarını da açıkça yazdık.",
      },
    ],
    related: related("/tr/discord-alternatifleri"),
  },
};

/* Extra depth per page (merged below). Kept separate for readability. */
const EXTRA = {
  "/tr/discord-alternatifi": {
    sections: [
      {
        h: "Bir Discord alternatifinde nelere dikkat etmelisin?",
        p: [
          "Erişim: Uygulamanın Türkiye’den ek bir ayar yapmadan, doğrudan açılması gerekir. Grubundaki herkesin aynı karmaşık kurulumu yapmasını beklemek, geçişin başarısız olmasının en büyük sebeplerinden biri.",
          "Ses kalitesi ve kararlılık: Discord alışkanlığının merkezinde ses kanalları var. Ses kopuyorsa ya da yankı yapıyorsa diğer özelliklerin pek önemi kalmaz. Descall sesi WebRTC ile taşır, zor ağlarda bağlantı için TURN sunucuları kullanır ve isteğe bağlı gürültü azaltma sunar.",
          "Düzen: Roller, kanal izinleri ve kategoriler, büyüyen bir grubun dağılmasını önler. Sadece tek bir grup sohbeti sunan uygulamalar beş kişilik bir ekip için yeterli olabilir, ama yirmi kişilik bir klan için kısa sürede kaosa dönüşür.",
          "Fiyat: Temel iletişimin ücretli bir aboneliğe bağlanmaması, herkesin eşit şartlarda katılabilmesi demek. Descall’da sohbet, ses, görüntü ve ekran paylaşımı ücretsizdir.",
          "Platformlar: Grubunda Windows, Android ve sadece tarayıcı kullanan kişiler olabilir. Tek hesapla her yerden bağlanabilmek, kimsenin dışarıda kalmamasını sağlar.",
        ],
      },
      {
        h: "Sık yapılan geçiş hataları",
        p: [
          "Her şeyi bir günde taşımaya çalışmak: Elli kanallı bir sunucuyu ve tüm bot ayarlarını birebir kopyalamaya çalışmak yorucu ve gereksiz. Önce gerçekten kullanılan kanalları kur, gerisi ihtiyaç oldukça gelsin.",
          "Davet bağlantısını kaybetmek: Davet bağlantısını tek bir mesajla paylaşıp unutmak, yeni gelenlerin yolu bulamamasına neden olur. Bağlantıyı grup sohbetinin açıklamasına veya sabitlenmiş mesaja koy.",
          "Yetkili belirlememek: Sunucuyu kuran kişi her şeyi tek başına yönetmeye çalışırsa kısa sürede yorulur. Moderatör rolünü güvendiğin birkaç kişiye ver; Descall’da roller ve izinler bunun için var.",
        ],
      },
    ],
    faq: [
      {
        q: "Descall’da Türkçe arayüz var mı?",
        a: "Evet. Descall’ın arayüzü Türkçe kullanılabilir; bu web sitesinin Türkçe bölümü de Türkçe konuşan kullanıcılar için hazırlandı.",
      },
      {
        q: "Hesap açmak için telefon numarası gerekiyor mu?",
        a: "Hayır. E‑posta adresinle ya da Google hesabınla ücretsiz hesap açabilirsin.",
      },
    ],
  },
  "/tr/turk-discord": {
    sections: [
      {
        h: "Gündelik kullanımda Descall",
        p: [
          "Akşam saatlerinde arkadaşlarınla sunucundaki “Sohbet” ses kanalına girersin; kimin konuştuğunu görürsün, biri oyundaki bir anı göstermek istediğinde ekranını paylaşır. Gün içinde DM’lerden yazışır, grup sohbetinde link ve görsel paylaşırsın. Hafta sonu klan maçı varsa duyuru kanalından herkese haber verir, eksik oyuncuyu Play sekmesindeki LFG lobisinden bulursun.",
          "Okul döneminde aynı sunucuda bir “Ders” kategorisi açıp çalışma odası kurabilir, sınav öncesi birlikte soru çözerken ekran paylaşabilirsin. Bunların hepsi tek uygulamada ve tek hesapla olur; Windows’ta masaüstü uygulaması, telefonda Android uygulaması ya da herhangi bir bilgisayarda tarayıcı sürümüyle.",
        ],
      },
      {
        h: "Neden yerli bir alternatif önemli?",
        p: [
          "Bir iletişim uygulamasını seçerken sadece özellik listesine değil, uygulamanın kimin tarafından, hangi önceliklerle geliştirildiğine de bakmak gerekir. Descall’ın geliştiricisi Türkiye’de yaşıyor; Türkiye’deki kullanıcıların alışkanlıklarını, saat dilimini, dilini ve gündemini biliyor.",
          "Bu, örneğin Türkçe metinlerin çeviri kokmadan yazılması, geri bildirimlerin Türkçe değerlendirilmesi ve Türkiye’deki oyuncu ve öğrenci topluluklarının ihtiyaçlarının ürün yol haritasında öncelik bulması anlamına geliyor. Descall’ın gizlilik politikası ve hizmet şartları da Türkçe olarak yayımlanır.",
        ],
      },
      {
        h: "Gizlilik ve güvenlik",
        p: [
          "Web ve API trafiği HTTPS/TLS ile, sesli ve görüntülü aramalar WebRTC’nin DTLS/SRTP şifrelemesiyle taşınır. Mesajlar cihazlarının sohbet geçmişini yükleyebilmesi için sunucuda saklanır; Descall tüm mesajlar için varsayılan uçtan uca şifreleme iddiasında bulunmaz. Hangi verilerin neden tutulduğu, ne kadar saklandığı ve nasıl silinebileceği Gizlilik sayfasında Türkçe olarak açıklanır.",
        ],
      },
    ],
    faq: [
      {
        q: "Descall ücretsiz mi?",
        a: "Evet. Sohbet, sunucular, sesli ve görüntülü arama ve ekran paylaşımı ücretsizdir; yalnızca isteğe bağlı kozmetikler DesCoin ile alınır.",
      },
      {
        q: "Descall hangi cihazlarda çalışıyor?",
        a: "Windows masaüstü uygulaması, Android uygulaması ve kurulum gerektirmeyen tarayıcı sürümü var. Aynı hesapla hepsinden bağlanabilirsin.",
      },
    ],
  },
  "/tr/discord-yerine-ne-kullanilir": {
    sections: [
      {
        h: "Senaryo 6: Yayıncılar ve içerik üreticileri",
        p: [
          "Yayıncılar topluluklarıyla yayın dışında da iletişimde kalmak ister: duyurular, etkinlik planlama, izleyicilerle sesli sohbet ve sadece belirli izleyicilerin görebildiği özel kanallar. Discord bu konuda yaygın bir tercih olsa da Türkiye’deki erişim engeli birçok yayıncıyı yeni bir alan aramaya itti.",
          "Descall’ın Yayın şablonu duyuru, sohbet, etkinlik ve sahne kanallarıyla gelir. Sahne kanalları, bir kişinin konuşup diğerlerinin dinlediği soru‑cevap veya sohbet etkinlikleri için uygundur. Roller ile destekçilere veya moderatörlere özel kanallar açabilirsin. Ancak Discord’daki gibi yayın platformlarıyla otomatik abonelik entegrasyonları veya özel botlar Descall’da yok; bunu bilerek karar vermek önemli.",
        ],
      },
      {
        h: "Bir uygulamayı denerken nelere bakmalı?",
        p: [
          "İlk gün: Hesap açmak ve ilk odaya girmek ne kadar sürdü? Arkadaşların davet bağlantısıyla kolayca katılabildi mi? Kurulum isteyen bir uygulama mı, tarayıcıdan da açılıyor mu?",
          "İlk hafta: Ses kalitesi her akşam tutarlı mıydı? Kopma, yankı veya gecikme oldu mu? Ekran paylaşımı akıcı mıydı? Telefondan bağlananlar sorun yaşadı mı?",
          "İlk ay: Grup hatırlatma yapmadan kendiliğinden yeni uygulamada mı toplanıyor? Eski uygulamaya geri dönme isteği var mı? Bu son soru, hangi uygulamanın gerçekten işe yaradığını en net gösteren ölçüttür.",
        ],
      },
    ],
    faq: [
      {
        q: "Discord yerine oyuncular ne kullanıyor?",
        a: "Sadece ses isteyenler TeamSpeak veya Mumble’ı, sunucu, roller, ekran paylaşımı ve LFG’yi bir arada isteyenler Descall gibi Discord tarzı uygulamaları tercih ediyor.",
      },
      {
        q: "Discord yerine ne kullanılır, okul grupları için?",
        a: "Öğrencilerin kendi aralarında buluşması için Descall’ın Ders şablonu kullanışlıdır; resmi ödev ve not süreçleri için okulun eğitim platformu daha uygundur.",
      },
    ],
  },
  "/tr/sesli-sohbet-uygulamasi": {
    sections: [
      {
        h: "Sesli sohbet uygulamalarını karşılaştırırken",
        p: [
          "Mesajlaşma uygulamalarındaki grup aramaları: Kolay ve herkesin telefonunda var; ancak arama bittiğinde oda da kaybolur. Her seferinde birinin araması, diğerlerinin cevap vermesi gerekir. Uzun oyun akşamları için yorucu olabilir.",
          "Toplantı uygulamaları: Ekran paylaşımı ve görüntü konusunda güçlüdür; ama toplantı bağlantısı, takvim ve süre sınırı gibi iş odaklı yapılar arkadaş sohbeti için fazla resmi kalır.",
          "Klasik ses yazılımları: Ses kalitesi iyi olabilir, ancak çoğu zaman sunucu kurulumu gerektirir ve mesajlaşma, roller, ekran paylaşımı gibi özellikler sınırlıdır.",
          "Discord tarzı uygulamalar: Kalıcı ses odaları, mesajlaşma, roller ve ekran paylaşımını bir araya getirir. Descall bu gruptadır ve temel özelliklerin tamamı ücretsizdir.",
        ],
      },
      {
        h: "Ses kanallarını düzenlemek için öneriler",
        p: [
          "Amaca göre kanal aç: “Genel sohbet”, “Oyun”, “Ders/Çalışma” ve “AFK” gibi kanallar, kimin ne yaptığını herkesin görmesini sağlar. Ders çalışan biriyle oyun oynayan bir grup aynı odada birbirini rahatsız etmez.",
          "İzinleri kullan: Yetkili toplantıları için bir ses kanalını sadece moderatör rolüne açabilirsin. Etkinlik günlerinde sahne kanalıyla bir kişinin konuşup diğerlerinin dinlediği düzen kurabilirsin.",
          "Kategorilerle grupla: Ses ve yazı kanallarını kategoriler altında toplamak, sunucu büyüdükçe karmaşayı önler. Hazır şablonlar bu düzeni senin yerine kurar.",
        ],
      },
    ],
    faq: [
      {
        q: "Sesli sohbet için hangi uygulama daha iyi?",
        a: "Kısa aramalar için mesajlaşma uygulamaları yeterli; kalıcı ses odaları, ekran paylaşımı ve topluluk düzeni istiyorsan Descall gibi Discord tarzı bir uygulama daha uygundur.",
      },
      {
        q: "Sesli sohbet sırasında ekran paylaşabilir miyim?",
        a: "Evet. Birebir aramada, grup aramasında veya sunucu ses kanalında ekranını kalite ön ayarlarıyla paylaşabilirsin.",
      },
    ],
  },
  "/tr/oyuncu-sohbet-uygulamasi": {
    sections: [
      {
        h: "Klan sunucusu için örnek yapı",
        p: ["Oyun şablonundan başlayıp kendi klanına göre şöyle bir düzen kurabilirsin:"],
        list: [
          "Bilgi kategorisi: duyurular (sadece liderler yazar), kurallar, yeni üyeler",
          "Sohbet kategorisi: genel sohbet, ekran görüntüleri ve klipler, oyun dışı muhabbet",
          "Ses kategorisi: rekabetçi takım 1, rekabetçi takım 2, rahat oyun, AFK",
          "Yönetim kategorisi: yetkili sohbeti ve yetkili ses odası (sadece moderatörler)",
          "Etkinlik: turnuva veya klan gecesi için sahne kanalı",
        ],
      },
      {
        h: "Yeni oyuncuları klana katmak",
        p: [
          "Play sekmesindeki LFG lobileri sadece tek maçlık takım arkadaşı bulmak için değil, klanına yeni üye kazanmak için de iyi bir yol. Birlikte birkaç oyun oynadığın ve anlaştığın oyunculara davet bağlantısı gönderip klan sunucuna çağırabilirsin.",
          "Yeni gelenler için “yeni üyeler” kanalında kısa bir karşılama mesajı ve kurallar, uyum sürecini kolaylaştırır. Deneme süresi uygulamak istiyorsan yeni üyelere ayrı bir rol verip bazı kanalları sadece kalıcı üyelere açabilirsin.",
        ],
      },
      {
        h: "Turnuva ve etkinlik geceleri",
        p: [
          "Klan içi turnuva veya topluluk gecesi düzenlerken duyuru kanalından tarih ve kuralları paylaş, takımları ayrı ses kanallarına dağıt, sonuçları sohbet kanalında topla. Sahne kanalı, açılış konuşması veya ödül anonsu gibi bir kişinin konuşup diğerlerinin dinlediği anlar için uygun. Ekran paylaşımıyla final maçını herkesin izleyebileceği bir kanalda yayınlayabilirsin.",
        ],
      },
    ],
    faq: [
      {
        q: "Descall’da hangi oyunlar için LFG var?",
        a: "LFG lobileri belirli bir oyuna kilitli değildir; oynadığın oyun için lobi açıp oyuncu arayabilirsin.",
      },
      {
        q: "Ekran paylaşımında oyun akıcı görünür mü?",
        a: "Ekran paylaşımında kalite ön ayarları var; akıcılığı veya netliği öncelikleyen ayarı seçebilirsin. Sonuç bağlantı hızına da bağlıdır.",
      },
    ],
  },
  "/tr/discord-acildi-mi": {
    sections: [
      {
        h: "Zaman çizelgesi",
        p: ["Discord’un Türkiye’deki erişim durumunun kısa özeti:"],
        list: [
          "9 Ekim 2024: Mahkeme kararı doğrultusunda Discord’a Türkiye’den erişim engellendi.",
          "Ekim 2024 sonrası: Web sitesi, masaüstü ve mobil uygulamalar Türkiye’deki internet servis sağlayıcıları üzerinden erişilemez hale geldi.",
          "2025: Engel boyunca kullanıcılar ve topluluklar alternatif uygulamalara yöneldi; erişim engeli kaldırılmadı.",
          "17 Ekim 2026: Erişim engeli hâlâ sürüyor (bu sayfanın son kontrol tarihi).",
        ],
      },
      {
        h: "Discord’a erişip erişemediğini nasıl anlarsın?",
        p: [
          "Discord uygulaması açılışta sürekli bağlanmaya çalışıyorsa, web sitesi yüklenmiyorsa veya zaman aşımı hatası veriyorsa bunun sebebi büyük olasılıkla erişim engelidir; cihazında bir sorun olduğu anlamına gelmez. Uygulamayı silip yeniden kurmak bu durumu değiştirmez.",
          "Bazı kullanıcılar mobil veri ile Wi‑Fi arasında farklı sonuçlar gördüğünü söyleyebilir; bu genelde kısa süreli farklılıklardır ve engelin kaldırıldığı anlamına gelmez. Erişimin resmi olarak açılıp açılmadığını anlamanın en güvenilir yolu resmi açıklamalar ve güvenilir haber kaynaklarıdır.",
        ],
      },
      {
        h: "Topluluğunu kaybetmemek için",
        p: [
          "Engelden en çok etkilenenler, yıllar içinde kurulmuş toplulukları yöneten kişiler oldu. Topluluğunu ayakta tutmak için üyelerine ulaşabileceğin bir yedek kanal (örneğin bir mesajlaşma grubu) oluşturmak ve yeni ortak alanın davet bağlantısını oradan paylaşmak en pratik yöntem.",
          "Descall’da şablonlarla sunucunun iskeletini dakikalar içinde yeniden kurabilir, rolleri ve kanal izinlerini eski düzenine benzer şekilde ayarlayabilirsin. Mesaj geçmişini taşıyan bir araç yok; ama aktif bir topluluk için en önemli şey, insanların bir sonraki akşam aynı yerde buluşabilmesi.",
        ],
      },
    ],
    faq: [
      {
        q: "Discord’u telefondan kullanabilir miyim?",
        a: "Erişim engeli mobil uygulamaları da kapsıyor; Türkiye’deki internet bağlantıları üzerinden Discord mobil uygulaması da normal şekilde çalışmıyor.",
      },
      {
        q: "Discord hesabım silindi mi?",
        a: "Erişim engeli hesapları silmez; sadece Türkiye’den erişimi engeller. Hesabın ve sunucuların Discord tarafında durmaya devam eder.",
      },
    ],
  },
  "/tr/discord-alternatifleri": {
    sections: [
      {
        h: "Özellik bazında kısa karşılaştırma",
        p: ["Discord’un en çok kullanılan özelliklerine göre genel bir tablo (✓ var, ~ sınırlı, – yok/uygun değil):"],
        list: [
          "Kalıcı ses odaları: Descall ✓ · TeamSpeak ✓ · Mumble ✓ · Telegram ~ · WhatsApp – · Slack ~ · Element ~",
          "Sunucu, kanal ve rol yapısı: Descall ✓ · TeamSpeak ~ · Mumble ~ · Telegram ~ · WhatsApp – · Slack ✓ · Element ✓",
          "Ekran paylaşımı: Descall ✓ · TeamSpeak ~ · Mumble – · Telegram ~ · WhatsApp ~ · Slack ~ · Element ~",
          "Oyun odaklı LFG: Descall ✓ · diğerleri –",
          "Kurulumsuz tarayıcı kullanımı: Descall ✓ · Telegram ✓ · WhatsApp ✓ · Slack ✓ · Element ✓ · TeamSpeak – · Mumble –",
          "Türkçe ve Türkiye’de geliştirilen: Descall ✓",
        ],
      },
      {
        h: "Birden fazla uygulamayı birlikte kullanmak",
        p: [
          "Pek çok grup tek bir uygulamaya bağlı kalmak zorunda değil. Örneğin günlük kısa yazışmalar için WhatsApp grubu, akşam oyun ve ses buluşmaları için Descall sunucusu kullanmak yaygın ve mantıklı bir düzen. Önemli olan, her uygulamanın hangi iş için kullanılacağının grupta net olması.",
          "Bu yaklaşım geçişi de kolaylaştırır: kimseyi alışkanlıklarından tamamen koparmadan, sadece ses ve sunucu ihtiyacını yeni uygulamaya taşırsın. Zamanla grubun hangi uygulamada daha çok vakit geçirdiği kendiliğinden ortaya çıkar.",
        ],
      },
    ],
    faq: [
      {
        q: "Discord’a en çok benzeyen uygulama hangisi?",
        a: "Sunucu, kanal, rol, ses kanalı ve ekran paylaşımı yapısıyla Descall, bu listedeki uygulamalar arasında Discord’a en yakın deneyimi sunar.",
      },
      {
        q: "Discord alternatifleri arasında oyunculara en uygun hangisi?",
        a: "Yerleşik LFG, ses kanalları ve ekran paylaşımı nedeniyle Descall oyuncu grupları için güçlü bir seçenek; sadece ses isteyenler TeamSpeak veya Mumble’ı da değerlendirebilir.",
      },
    ],
  },
};

for (const [p, extra] of Object.entries(EXTRA)) {
  const page = TR_LANDINGS[p];
  const at = Math.max(1, page.sections.length - 1);
  page.sections.splice(at, 0, ...extra.sections);
  page.faq.push(...extra.faq);
}

const EXTRA2 = {
  "/tr/turk-discord": {
    h: "Discord kullanıcılarının en çok sorduğu üç şey",
    p: [
      "“Arkadaşlarım da gelecek mi?” Geçişin en zor kısmı bu. Descall’da kayıt ücretsiz ve tarayıcıdan bir dakikada yapılabildiği için arkadaşlarından bir şey kurmalarını istemek zorunda değilsin; davet bağlantısını göndermen yeterli. Masaüstü veya Android uygulamasını sonradan, isteyen kurar.",
      "“Sunucumu sıfırdan mı kuracağım?” Boş bir sunucuyla da başlayabilirsin, ama şablonlar işin büyük kısmını yapar. Oyun, Topluluk, Ders, Arkadaşlar ve Yayın şablonları rolleri, kategorileri ve kanalları hazır getirir; sen sadece isimleri ve izinleri kendine göre düzenlersin.",
      "“Ses kalitesi nasıl?” Descall sesi ve görüntüyü WebRTC ile taşır; zor ağlarda bağlantı kurulabilmesi için TURN sunucuları kullanılır. Kulaklık ve isteğe bağlı gürültü azaltma ile çoğu grup ilk akşamdan farkı hissetmez. Bir sorun yaşarsan geri bildirim göndermen, sorunun hızlı çözülmesine yardımcı olur.",
    ],
  },
  "/tr/sesli-sohbet-uygulamasi": {
    h: "Sık karşılaşılan ses sorunları ve çözümleri",
    p: [
      "Beni duymuyorlar: Ayarlardan doğru mikrofonun seçili olduğunu ve tarayıcı kullanıyorsan mikrofon izninin verildiğini kontrol et. Susturma simgesinin kapalı olduğundan emin ol.",
      "Yankı var: Genellikle birinin hoparlörden dinlemesinden kaynaklanır. Kulaklık kullanmak yankıyı ortadan kaldırır; gürültü azaltma da yardımcı olur.",
      "Ses kesik kesik geliyor: Bağlantı zayıf olabilir. Wi‑Fi yerine kablolu bağlantı denemek, arka planda büyük indirmeleri durdurmak veya ekran paylaşımında daha düşük bir kalite ön ayarı seçmek çoğu zaman sorunu çözer.",
      "Tarayıcıda ses arka planda kesiliyor: Bazı tarayıcılar arka plandaki sekmeleri kısıtlayabilir. Windows kullanıyorsan masaüstü uygulaması bu sorunu yaşamaz.",
    ],
  },
  "/tr/oyuncu-sohbet-uygulamasi": {
    h: "Discord’dan gelen klanlar için geçiş planı",
    p: [
      "Birinci gün: Klan liderleri Descall’da hesap açar, Oyun şablonuyla sunucuyu kurar ve rolleri eski düzene benzer şekilde adlandırır. Duyuru kanalına kuralları ve kısa bir hoş geldin mesajı yazılır.",
      "İkinci gün: Davet bağlantısı klanın mevcut mesajlaşma grubunda paylaşılır. Aktif üyeler katılır, ses kanallarında ilk buluşma yapılır. Mikrofon ve gürültü azaltma ayarları birlikte kontrol edilir.",
      "Birinci hafta: Tüm klan akşamları ve maçlar Descall ses kanallarında yapılır. Eksik oyuncu gerektiğinde Play sekmesindeki LFG lobileri denenir. Moderatörler denetim kayıtlarını ve izinleri gözden geçirir.",
      "Sonrası: Kullanılmayan kanallar silinir, ihtiyaç duyulan yenileri eklenir. Klanın kendi alışkanlıkları oturdukça sunucu da kendiliğinden şekillenir.",
    ],
  },
  "/tr/discord-acildi-mi": {
    h: "Bu sayfadaki bilgiler hakkında",
    p: [
      "Bu sayfa, Türkiye’deki kullanıcıların “Discord açıldı mı?” sorusuna net bir cevap bulabilmesi için hazırlandı. Bilgiler kamuya açık resmi açıklamalara ve yaygın şekilde haberleştirilmiş gelişmelere dayanıyor; hukuki tavsiye niteliği taşımıyor. Engelle ilgili resmi bir değişiklik olduğunda sayfayı güncelliyor ve başlığın altındaki “Son güncelleme” tarihini değiştiriyoruz.",
      "Descall, Discord ile bağlantılı değildir ve Discord’un bir parçası değildir. Descall, Türkiye’de Demir Sarp Kurtlar tarafından geliştirilen bağımsız bir sohbet uygulamasıdır. Bu sayfada Descall’dan söz etmemizin nedeni, engel sürecinde arkadaşlarıyla iletişimde kalmak isteyenlere Türkiye’den doğrudan erişilebilen bir seçenek sunmak.",
      "Bir bilginin eksik ya da yanlış olduğunu düşünüyorsan contact@descall.com adresine yazabilirsin; kontrol edip gerekirse sayfayı düzeltiriz.",
    ],
  },
};

for (const [p, section] of Object.entries(EXTRA2)) {
  const page = TR_LANDINGS[p];
  page.sections.splice(page.sections.length - 1, 0, section);
}

for (const meta of TR_LANDING_META) Object.assign(TR_LANDINGS[meta.path], meta);

export const TR_LANDING_PATHS = Object.keys(TR_LANDINGS);
