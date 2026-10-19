/**
 * Turkish adaptations of the 9 English blog posts. Same slugs under /tr/blog/*,
 * hreflang-paired with /blog/*. Adapted for Turkish readers, not word-for-word.
 */

export { TR_BLOG_META as TR_BLOG_POSTS } from "./trMeta.js";

export const TR_BLOG_BODIES = {
  "discord-vs-descall": {
    sections: [
      {
        h: "Kısa cevap",
        p: "Grubun sohbet, ses ve ekran paylaşımı için daha hafif ve ücretsiz bir uygulama istiyorsa Descall’ı seç. Büyük herkese açık topluluklar yönetiyor ve botlara dayanıyorsan Discord’un ekosistemi hâlâ daha geniş. Türkiye’de Discord’a erişimin 9 Ekim 2024’ten beri engelli olduğunu da hesaba katmak gerekiyor.",
      },
      {
        h: "Sohbet ve çevrimiçi durumu",
        p: "İki uygulama da gerçek zamanlı mesajlaşma sunar. Descall DM’lere, grup sohbetlerine ve net bir çevrimiçi durumu göstergesine odaklanır; arkadaş grupları için sunucu yönetimine daha az zaman harcarsın. Sunucu tarafında kategoriler, yazı, ses ve sahne kanalları, roller ve kanal izinleri var.",
      },
      {
        h: "Ses, görüntü ve ekran paylaşımı",
        p: "Descall modern WebRTC kullanır, zor ağlar için TURN desteği ve kalite ön ayarlı ekran paylaşımı sunar; isteğe bağlı gürültü azaltma da var. Discord çok büyük ölçekte yılların deneyimine sahip; Descall ise arkadaş grubu ve klan büyüklüğündeki aramalar için optimize edilmiştir.",
      },
      {
        h: "Fiyatlandırma yaklaşımı",
        p: "Descall iletişimi ücretsiz tutar ve yalnızca isteğe bağlı kozmetikler satar (DesCoin). Discord’da Nitro birçok ek özelliğin kilidini açar. “Discord alternatifi” aramanın sebebi abonelik yorgunluğuysa Descall doğrudan bir cevap.",
      },
      {
        h: "Discord’un hâlâ önde olduğu yerler",
        p: "Dev bot pazarı, on binlerce kişilik herkese açık sunucular ve yıllar içinde birikmiş entegrasyonlar Discord’un güçlü yanları. Descall bunları taklit etmeye çalışmıyor; arkadaş grupları, klanlar ve küçük‑orta topluluklar için gereken temel parçaları sade ve ücretsiz şekilde sunuyor.",
      },
    ],
  },
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
  "apps-like-discord": {
    sections: [
      {
        h: "“Discord benzeri uygulama” derken ne kastediliyor?",
        p: "Genellikle kalıcı sohbet, gruplar ve ses. Bazen ekran paylaşımı. Rastgele bir “En iyi 10” listesinden değil, grubunun gerçekten yapmak istediği işten başla: akşam sesli sohbet mi, düzenli bir topluluk mu, yoksa sadece yazışmak mı?",
      },
      {
        h: "Discord benzeri bir uygulama olarak Descall",
        p: "Descall mesajlaşma, aramalar, ekran paylaşımı, gruplar ve rollü sunucuları daha hafif bir pakette sunar. Arkadaşlar ve oyuncular için pratik bir Discord alternatifi; Türkiye’den doğrudan erişilebilir ve Türkçe kullanılabilir.",
      },
      {
        h: "Discord benzeri web siteleri",
        p: "Descall’ı tamamen tarayıcıdan, hiçbir şey kurmadan kullanabilirsin. Masaüstü hissi isteyen arkadaşların daha sonra Windows uygulamasına, telefondan bağlanmak isteyenler Android uygulamasına geçebilir; hesap aynı kalır.",
      },
      {
        h: "Kopya tiyatrosundan kaçın",
        p: "En iyi Discord benzeri uygulamalar piksel piksel kopya değildir; grubunun hiç kullanmadığı kısımları çıkarıp her gün kullandıklarını iyi yapar. Bir uygulamayı denerken “Discord’un her özelliği var mı?” yerine “Bizim kullandıklarımız iyi çalışıyor mu?” diye sor.",
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
  "discord-alternative-for-communities-guide": {
    sections: [
      {
        h: "Topluluk her zaman dev sunucu demek değil",
        p: "Bir sınıf grubu, beş kişilik bir klan ya da bir içerik üreticisinin yakın çevresi de bir topluluktur ve çoğu zaman daha hafif bir Discord alternatifiyle daha iyi hizmet alır.",
      },
      {
        h: "Descall topluluk yöneticilerine ne sunar?",
        p: "Sunucular, kategoriler, yazı/ses/sahne kanalları, rol hiyerarşisi ve kanal izinleri, davet bağlantıları, çevrimiçi durumu, sesli buluşmalar ve ücretsiz temel sohbet. Topluluk şablonu duyuru, destek, etkinlik ve yetkili kanallarını hazır getirir; 40 kanallı bir ağaçla başlamak zorunda değilsin.",
      },
      {
        h: "Moderasyon beklentileri",
        p: "Atma, yasaklama, zaman aşımı, denetim kayıtları, topluluk kuralları ve davet kontrolleri yerleşik olarak var. Gelişmiş otomasyon botlarına veya çok karmaşık entegrasyonlara ilk günden ihtiyacın varsa Discord’un ekosistemi daha geniş.",
      },
    ],
  },
  "voice-chat-alternative-to-discord": {
    sections: [
      {
        h: "Asıl önemli olan ses alışkanlığı",
        p: "Discord’dan geçiş denemelerinin çoğu ses daha kötü hissettirdiğinde başarısız olur. Descall, akşam sesli sohbetleri kolay kalsın diye WebRTC aramalara, TURN desteğine, gürültü azaltmaya ve ekran paylaşımı kalite ön ayarlarına yatırım yapar.",
      },
      {
        h: "Oyuncular için ücretsiz sesli sohbet",
        p: "Sohbet, ses ve ekran paylaşımı için tek bir uygulama, üç uygulama arasında gidip gelmekten iyidir.",
      },
      {
        h: "Masaüstü ipuçları",
        p: "Windows kullananlar, tarayıcı sekmesi kazalarını önlemek için masaüstü uygulamasını kurmalı. Kulaklık kullanmak yankıyı önler; gürültü azaltma klavye ve fan sesini bastırır. Grubun geri kalanı Android uygulaması veya tarayıcıyla katılabilir.",
      },
    ],
  },
  "migrate-from-discord-to-descall": {
    sections: [
      {
        h: "0. gün: neye gerçekten ihtiyacın olduğuna karar ver",
        p: "Grubunun her hafta kullandığı özellikleri listele: DM’ler, özel bir sunucu, sesli akşamlar. Descall bunları abonelik olmadan karşılar. İlk gün her botu kopyalamaya çalışma.",
      },
      {
        h: "1. gün: hesap aç ve arkadaşlarını davet et",
        p: "Descall’a kaydol (e‑posta veya Google hesabıyla), istersen Windows veya Android uygulamasını kur, sonra arkadaşlarına davet gönder. Türkiye’de Discord’a erişim engelli olduğu için davet bağlantısını WhatsApp veya Telegram grubundan paylaşmak en pratik yol.",
      },
      {
        h: "2. gün: sunucunu bir şablonla yeniden kur",
        p: "Oyun, Arkadaşlar veya Topluluk şablonlarından birini seç; roller ve yetkili odaları hazır gelsin. Davet bağlantıları, Discord’daki davet linklerinin yerini alır.",
      },
      {
        h: "3. gün: ses alışkanlığını taşı",
        p: "Descall’da bir sesli buluşma planla ve bir sunucuyu şablonla taşı; böylece kimse eski botlara geri çekilmez.",
      },
      {
        h: "Eski platformda ne kalır? (dürüstçe)",
        p: "Mesaj geçmişini otomatik taşıyan bir araç yok; eski sohbetler olduğu yerde kalır. Büyük herkese açık sunucular ve bot ekosistemleri Descall’ın hedefi değil. Daha hafif bir alternatif isteyen arkadaş grupları ve klanlar ise geçişi genellikle bir haftadan kısa sürede tamamlar.",
      },
    ],
  },
};

export const TR_BLOG_FAQ_BY_SLUG = {
  "discord-vs-descall": [
    { q: "Grubum Discord’u mu Descall’ı mı seçmeli?", a: "Akşam sesli sohbet ve sunucular için abonelik istemiyorsanız Descall; büyük bot ekosistemine ve dev herkese açık sunuculara bağlıysanız Discord. Türkiye’de Discord’a erişimin engelli olduğunu da unutmayın." },
    { q: "Bu karşılaştırma sponsorlu mu?", a: "Hayır. Descall’ı biz geliştiriyoruz ve yazıda Discord’un hâlâ önde olduğu yerleri de açıkça belirtiyoruz." },
  ],
  "best-discord-alternatives-2026": [
    { q: "2026’da en iyi Discord alternatifi hangisi?", a: "Arkadaşlarla ses ve sunucu için Descall; sadece ses için TeamSpeak veya Mumble; mesajlaşma için Telegram; iş için Slack." },
    { q: "Türkiye’den erişilebilen bir Discord alternatifi var mı?", a: "Evet. Descall Türkiye’de geliştirilir ve Türkiye’den doğrudan erişilebilir." },
  ],
  "apps-like-discord": [
    { q: "Discord’a en çok benzeyen uygulama hangisi?", a: "Sunucular, roller, ses kanalları ve ekran paylaşımıyla Descall, Discord’a yakın bir yapı sunar." },
    { q: "Kurulum yapmadan kullanabilir miyim?", a: "Evet. Descall tarayıcıdan tamamen kullanılabilir; Windows ve Android uygulamaları isteğe bağlıdır." },
  ],
  "discord-competitors": [
    { q: "Discord’un en büyük rakibi kim?", a: "Tek bir rakip yok; ihtiyaca göre Telegram, Slack, TeamSpeak ve Descall gibi uygulamalar farklı alanlarda rekabet ediyor." },
    { q: "Descall Discord’un tüm özelliklerini sunuyor mu?", a: "Hayır. Bot pazarı ve dev etkinlik araçları yok; arkadaş grupları ve küçük‑orta topluluklar için gereken temel özelliklere odaklanır." },
  ],
  "leave-nitro-keep-voice-chat": [
    { q: "Descall’da ücretli abonelik var mı?", a: "Temel iletişim için yok. Sohbet, ses, görüntü ve ekran paylaşımı ücretsiz; sadece isteğe bağlı kozmetikler DesCoin ile alınır." },
    { q: "Eski sohbet geçmişim ne olacak?", a: "Eski platformda olduğu gibi kalır; Descall’a otomatik aktarılmaz." },
  ],
  "discord-alternative-for-communities-guide": [
    { q: "Descall’da topluluk moderasyonu nasıl yapılır?", a: "Roller ve kanal izinleri, atma, yasaklama, zaman aşımı, denetim kayıtları, topluluk kuralları ve davet kontrolleri yerleşik olarak gelir." },
    { q: "Büyük topluluklar için uygun mu?", a: "Descall küçük ve orta ölçekli topluluklar için en iyi sonucu verir; çok büyük, bot ağırlıklı topluluklar için Discord’un ekosistemi daha geniştir." },
  ],
  "voice-chat-alternative-to-discord": [
    { q: "Descall’da sesli sohbet ücretsiz mi?", a: "Evet. Birebir, grup ve sunucu ses kanalları ile ekran paylaşımı ücretsizdir." },
    { q: "Gürültü azaltma var mı?", a: "Evet, ses ayarlarından isteğe bağlı gürültü azaltma açılabilir." },
  ],
  "migrate-from-discord-to-descall": [
    { q: "Discord’dan Descall’a geçiş ne kadar sürer?", a: "Arkadaş grupları ve klanlar genellikle bir hafta içinde geçişi tamamlar; sunucu iskeleti şablonlarla dakikalar içinde kurulur." },
    { q: "Rollerimi ve kanallarımı taşıyabilir miyim?", a: "Otomatik aktarım yok, ama şablonlar rolleri ve kanalları hazır kurar; isimleri ve izinleri eski düzenine göre düzenleyebilirsin." },
  ],
};
