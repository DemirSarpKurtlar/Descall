/**
 * Turkish versions of the English blog posts. Same slugs under /tr/blog/*,
 * hreflang-paired with /blog/*. Five posts were merged into stronger pages in
 * Nov 2026 (seo/mergedPages.js); their /tr/blog URLs 301 to the Turkish hubs.
 */

export { TR_BLOG_META as TR_BLOG_POSTS } from "./trMeta.js";

export const TR_BLOG_BODIES = {
  "best-discord-alternatives-2026": {
    sections: [
      {
        h: "Discord alternatiflerini nasıl değerlendirdik?",
        p: "Uygulamaları en uzun özellik listesine göre değil; ücretsiz sohbet ve arama, ses kalitesi, sunucu araçları, masaüstü ve mobil gerçekliği ve bir arkadaş grubunun bir haftada geçiş yapıp yapamayacağına göre değerlendirdik. Türkiye’den erişim ve Türkçe arayüz de ölçütlerimiz arasındaydı.",
      },
      {
        h: "Descall: arkadaşlar ve ekipler için ücretsiz Discord alternatifi",
        p: "DM’ler, gruplar, sunucular, WebRTC ses ve görüntü, ve ekran paylaşımını abonelik olmadan isteyen gruplar için Descall öne çıkıyor. Türkiye’de geliştiriliyor ve Türkçe kullanılabiliyor. Her büyük herkese açık Discord sunucusunun yerini almaya çalışmıyor.",
      },
      {
        h: "Discord: hâlâ toplulukların işletim sistemi",
        p: "Botlara, sahne etkinliklerine ve dev sunuculara ihtiyacın varsa Discord dünyada hâlâ varsayılan seçim. Ancak Türkiye’de erişim engelli olduğu için buradaki kullanıcılar için pratik bir seçenek olmaktan çıktı.",
      },
      {
        h: "TeamSpeak, Mumble, Telegram ve Slack",
        p: "TeamSpeak ve Mumble ses odaklı klasikler; ses kalitesi iyi ama mesajlaşma ve topluluk özellikleri sınırlı, sunucu kurulumu teknik bilgi ister. Telegram mesajlaşmada, Slack iş ekiplerinde çok güçlü; ama kalıcı grup sesi için zayıf Discord yerine geçerler.",
      },
      {
        h: "Önce hangisini denemelisin?",
        p: "Arkadaşlarla ses ve sunucu → Descall. Sadece ses ve kendi sunucun → TeamSpeak veya Mumble. Yoğun mesajlaşma → Telegram. İş ekibi → Slack. Tam bir geçişe zorlamadan önce Türkçe karşılaştırma sayfamıza göz at ve bir hafta boyunca gerçek arkadaşlarınla dene.",
      },
    ],
  },
  "discord-competitors": {
    sections: [
      {
        h: "2026’da Discord’un rakipleri: dürüst harita",
        p: "Rakipler üç gruba ayrılıyor: hafif arkadaş sohbeti uygulamaları, oyun ve topluluk odaklı araçlar ve ses odaklı klasik yazılımlar. Descall, gerçek sunucular sunan ilk gruba giriyor.",
      },
      {
        h: "Descall’ın rekabet ettiği yer",
        p: "Arkadaşlarla DM, grup sesi ve ekran paylaşımı konusunda; özellikle grup sohbetinde “aboneliğe para vermeyelim” cümlesi geçtiğinde ya da Türkiye’deki erişim engeli yüzünden yeni bir ev arandığında.",
      },
      {
        h: "Descall’ın (henüz) rekabet ediyormuş gibi yapmadığı yerler",
        p: "Discord’un bot pazarı, büyük sahne etkinlikleri ve her platformdaki istemci çeşitliliği konusunda iddiamız yok. Dürüstlük, kapı sayfalarından (doorway page) daha iyi sıralanır ve daha çok güven kazanır.",
      },
      {
        h: "Rakipleri nasıl kısa listeye alırsın?",
        p: "Olmazsa olmazlarını yaz: ses, sunucu, mobil, ekran paylaşımı. Gerçek arkadaşlarınla yedi akşam dene. Kimse hatırlatmadan kullanılmaya devam eden uygulamayı seç.",
      },
    ],
  },
  "leave-nitro-keep-voice-chat": {
    sections: [
      {
        h: "Konuşmak için aboneliğe ihtiyacın yok",
        p: "Arkadaş grupları çoğu zaman alışkanlıktan abonelik öder. Oysa temel ses ve ekran paylaşımı bir aboneliğe bağlı olmamalı; Descall gibi ücretsiz bir Discord alternatifinin vaadi de bu. Descall’da sohbet, sunucular, ses, görüntü ve ekran paylaşımı ücretsiz; yalnızca isteğe bağlı kozmetikler DesCoin ile alınır.",
      },
      {
        h: "İki haftalık geçiş planı",
        p: "Birinci hafta: Descall’da bir sunucu ya da grup kur, akşam sesli buluşmaları oraya taşı. İkinci hafta: sunucunu ve ekran paylaşımı oturumlarını da taşı. Hâlâ sevdiğin büyük topluluklar varsa onları ayrı tutabilirsin.",
      },
      {
        h: "Neyi kaybetmezsin?",
        p: "Eski platformdaki sohbet geçmişin olduğu yerde kalır. Bir kültürü silmiyorsun; her gün aradığın insanlar için daha hafif bir günlük uygulama seçiyorsun.",
      },
    ],
  },
};

export const TR_BLOG_FAQ_BY_SLUG = {
  "best-discord-alternatives-2026": [
    { q: "2026’da en iyi Discord alternatifi hangisi?", a: "Arkadaşlarla ses ve sunucu için Descall; sadece ses için TeamSpeak veya Mumble; mesajlaşma için Telegram; iş için Slack." },
    { q: "Türkiye’den erişilebilen bir Discord alternatifi var mı?", a: "Evet. Descall Türkiye’de geliştirilir ve Türkiye’den doğrudan erişilebilir." },
  ],
  "discord-competitors": [
    { q: "Discord’un en büyük rakibi kim?", a: "Tek bir rakip yok; ihtiyaca göre Telegram, Slack, TeamSpeak ve Descall gibi uygulamalar farklı alanlarda rekabet ediyor." },
    { q: "Descall Discord’un tüm özelliklerini sunuyor mu?", a: "Hayır. Bot pazarı ve dev etkinlik araçları yok; arkadaş grupları ve küçük‑orta topluluklar için gereken temel özelliklere odaklanır." },
  ],
  "leave-nitro-keep-voice-chat": [
    { q: "Descall’da ücretli abonelik var mı?", a: "Temel iletişim için yok. Sohbet, ses, görüntü ve ekran paylaşımı ücretsiz; sadece isteğe bağlı kozmetikler DesCoin ile alınır." },
    { q: "Eski sohbet geçmişim ne olacak?", a: "Eski platformda olduğu gibi kalır; Descall’a otomatik aktarılmaz." },
  ],
};
