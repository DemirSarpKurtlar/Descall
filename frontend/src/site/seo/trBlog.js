/**
 * Turkish versions of the English blog posts. Same slugs under /tr/blog/*,
 * hreflang-paired with /blog/*. Each body follows its English post section by section
 * (seo/blogBodies.js) in the informal "sen" form; keep them in step. Five posts were merged into stronger pages in
 * Nov 2026 (seo/mergedPages.js); their /tr/blog URLs 301 to the Turkish hubs.
 */

export { TR_BLOG_META as TR_BLOG_POSTS } from "./trMeta.js";

export const TR_BLOG_BODIES = {
  "best-discord-alternatives-2026": {
    sections: [
      {
        h: "Bu kısa listeyi nasıl hazırladık?",
        p: "Descall’ı biz geliştiriyoruz; bu listeyi okurken bunu aklında tut. İşe yarar olsun diye her uygulamayı aynı beş soruyla değerlendirdik. Sohbet ve aramalar temelde ücretsiz mi? Grup sesi sıradan ev ve mobil bağlantılarda dayanıyor mu? İnsanları rollerle düzenlenmiş alanlarda toplayabiliyor musun? Arkadaşlarının gerçekten kullandığı cihazlarda çalışıyor mu? Ve gerçek bir grup bir hafta içinde ona geçebilir mi? Özellik sayısını ölçüt almadık, çünkü uzun bir özellik listesi insanların bir uygulamayı kullanmaya devam edip etmeyeceğini nadiren gösterir.",
      },
      {
        h: "Descall: arkadaş grupları için ücretsiz ses, görüntü ve sunucular",
        p: "Çoğu grubun Discord’u ne için kullandığına bakarsan, aynısını abonelik olmadan isteyenler için en yakın seçenek Descall. DM’ler, grup sohbetleri, rol ve izinli sunucular, yazı, ses ve sahne kanalları, sesli ve görüntülü grup aramaları ve kalite ön ayarlı ekran paylaşımı var. Windows, iPhone ve iPad, Android ve web’de çalışıyor; arayüzü Türkçe ve İngilizce dahil yedi dilde. Türkiye’den de doğrudan erişilebiliyor. Sınırları da gerçek: daha küçük ve daha yeni, bot pazarı yok, büyük bir herkese açık sunucu keşfi de yok. En çok arkadaş gruplarına, oyun ekiplerine ve küçük-orta topluluklara uyuyor.",
      },
      {
        h: "TeamSpeak: önce ses, sunucu da senin",
        p: "TeamSpeak uzun zamandır bir ses aracı ve temel fikri hâlâ aynı: senin ya da bir barındırma hizmetinin çalıştırdığı, insanların kanallara girip çıktığı bir sunucu. Ses sunucusunun nerede durduğunu kontrol etmek isteyen gruplar bu modeli seviyor. Bedeli şu: yazılı sohbet, mobil kullanım ve sosyal özellikler sesin gerisinde kalıyor ve sunucuyu birinin yönetmesi gerekiyor. En çok, her an açık bir ses odası isteyen gruplara uyuyor.",
      },
      {
        h: "Mumble: açık kaynak ve hafif",
        p: "Mumble, kendi sunucunda barındırabileceğin açık kaynaklı bir sesli sohbet uygulaması. Kaynak tüketimi düşük ve düşük gecikmeli sesiyle biliniyor; teknik gruplar arasında hâlâ popüler olmasının sebebi de bu. Bir sosyal uygulama olmaya çalışmıyor, yani Discord’daki profilleri, zengin sohbeti ve medyayı bulamazsın. Grubunda sunucu çalıştırmaktan çekinmeyen biri varsa ve sadece sese ihtiyacınız varsa Mumble sağlam ve ücretsiz bir seçim.",
      },
      {
        h: "Guilded ve Revolt: topluluk tarzı alternatifler",
        p: "Guilded, kendini takımlar, etkinlikler ve düzenli sunucular için araçlar sunan, organize oyun topluluklarına yönelik bir platform olarak konumlandırdı. Revolt ise Discord kullanıcılarına tanıdık gelecek bir düzene sahip açık kaynaklı bir proje. Discord modeline yakın bir şeyi farklı bir sağlayıcıdan istiyorsan ikisine de bakmaya değer. Descall dahil her küçük platformda olduğu gibi, bütün bir topluluğu taşımadan önce arkadaşlarının ihtiyaç duyacağı uygulamaların güncel durumunu kontrol et.",
      },
      {
        h: "Element ve Matrix: merkeziyetsiz ve kendi sunucunda",
        p: "Element, açık ve merkeziyetsiz bir mesajlaşma protokolü olan Matrix’in en bilinen uygulaması. Herkese açık bir sunucu kullanabilir ya da kendi sunucunu kurabilirsin; farklı sunuculardaki odalar birbiriyle konuşabiliyor. Kendi altyapısını çalıştırmayı önemseyen gruplar çoğu zaman burada karar kılıyor. Deneyim, tek bir barındırılan uygulamaya göre daha karmaşık; ses ve görüntü de Discord’daki girip çıkılan odalardan farklı çalışıyor. Bu yüzden önce grubunla birkaç arama dene.",
      },
      {
        h: "Slack, Telegram, WhatsApp ve Signal: başka işlerde çok iyiler",
        p: "Bu uygulamalar birçok Discord alternatifi listesinde geçiyor, ama her biri başka bir iş için yapıldı. Slack iş yerleri için tasarlandı ve şirket çalışma alanları etrafında düzenleniyor. Telegram büyük duyuru kanallarında ve kalabalık gruplarda güçlü. WhatsApp, birçok aile ve arkadaş grubunun zaten yazıştığı yer. Signal özel mesajlaşmaya odaklanıyor. Hepsi bir grup sohbetini taşıyabilir, bazıları grup aramalarını da kaldırır; ama hiçbiri, ses kanallarına girip çıktığın sunucuların hissini yeniden yaratmıyor.",
      },
      {
        h: "Discord: kalmanın doğru cevap olduğu durumlar",
        p: "Discord, büyük herkese açık topluluklar için hâlâ varsayılan seçim. Sunucun botlarla dönüyorsa, herkese açık keşfe dayanıyorsa ya da binlerce aktif üyesi varsa, taşınmak gerçek maliyetleri olan büyük bir proje. Birçok kişi o alanlar için Discord’u tutuyor ve sadece özel arkadaş aramalarını taşıyor. Bu ayrım gayet iyi bir sonuç; çoğu zaman bir alternatifi baskı olmadan denemenin en kolay yolu da bu. Türkiye’deysen bir not: Discord’a Türkiye’den erişim 9 Ekim 2024’te mahkeme kararıyla engellendi. Engelle ilgili son haberleri ve tarihlerini “Discord açıldı mı?” sayfamızda topluyoruz.",
      },
      {
        h: "Önce hangisini denemelisin?",
        p: "Arkadaşların ya da oyun ekibin için ücretsiz sohbet, ses ve sunucu istiyorsan Descall ile başla. Sadece her an açık bir ses odasına ihtiyacın varsa ve onu çalıştıracak biri varsa TeamSpeak ya da Mumble’ı dene. Kendi sunucunu barındırmak ve açık bir protokol senin için en önemlisiyse Element’e bak. Topluluğun botlar ve herkese açık keşif üzerinde yaşıyorsa Discord’da kal ve sadece mantıklı olanı taşı. Hangisini seçersen seç, taşınmayı bitti saymadan önce bir hafta boyunca gerçek grubunla dene.",
      },
    ],
  },
  "discord-competitors": {
    sections: [
      {
        h: "Discord’la rekabet etmek için ne gerekiyor?",
        p: "Discord’la doğrudan rekabet etmek zor. Devasa bir mevcut sunucu ağı, büyük bir bot ekosistemi, herkese açık keşif ve istemcilerine harcanmış yıllar var. Yeni bir uygulama bunların hepsine birden yetişemez. Bu yüzden 2026’daki gerçek Discord rakiplerinin her biri, Discord’un yaptıklarından bir parçayı seçiyor ve o parçayı daha iyi, daha ucuz ya da farklı bir şekilde yapmaya çalışıyor. Pazarı segmentlere ayırarak görmek, grubun için gerçekte kimin rekabet ettiğine karar vermeyi çok kolaylaştırıyor.",
      },
      {
        h: "Birinci segment: arkadaşlar ve oyun ekipleri için daha hafif uygulamalar",
        p: "Bu uygulamalar Discord’un özel tarafını hedefliyor: arkadaş grupları, oyun ekipleri ve esas olarak sohbet ile ses isteyen küçük sunucular. Sadelik, ücretsiz temel özellikler ve daha sakin bir arayüzle rekabet ediyorlar. Bahisleri şu: çoğu insan Discord’u ağırlaştıran parçaları hiç kullanmadı ve bunları, hızlı açılan ve senden hiçbir şey istemeyen bir uygulamayla değiştirmeye razı. Descall burada duruyor. DM’ler, grup sohbetleri, rollü sunucular, sesli ve görüntülü grup aramaları ve ekran paylaşımını abonelik olmadan sunuyor; düzene ihtiyaç duyan gruplar için üstüne tam sunucular ekliyor.",
      },
      {
        h: "İkinci segment: topluluk platformları",
        p: "Guilded ve Revolt gibi uygulamalar topluluk tarafında rekabet ediyor; Discord kullanıcılarına tanıdık gelecek bir modelde sunucular ve kanallar sunuyorlar. Guilded organize oyun topluluklarına odaklandı, Revolt ise açık kaynaklı bir proje. Discord’a birebir en çok benzeyen rakipler bunlar; bu yüzden asıl sorular olgunluk, mobil destek ve yanına almak istediğin insanların gerçekten katılıp katılmayacağı. Tanıdık bir düzen geçişin maliyetini düşürür, ama bir topluluğu tek başına taşımaz.",
      },
      {
        h: "Üçüncü segment: sesi önceleyen klasikler",
        p: "TeamSpeak ve Mumble, Discord’dan çok önce de vardı ve hâlâ tek bir konuda rekabet ediyorlar: ses. İkisi de senin kontrol ettiğin bir sunucuda çalışabilir; Mumble ayrıca açık kaynaklı. Kendi ses sunucusunu barındırmayı önemseyen, çok fazla yazılı sohbete veya sosyal özelliğe ihtiyaç duymayan gruplarda öne çıkıyorlar. Discord’la bütün topluluklar için değil, ses zamanı için rekabet ediyorlar. Zaten başka bir yerde yazışan ve sadece konuşacak bir yere ihtiyaç duyan bir grup için bu dar odak tam da doğru olabilir.",
      },
      {
        h: "Dördüncü segment: açık ve merkeziyetsiz ağlar",
        p: "Açık Matrix protokolü üzerine kurulu Element, sahiplik üzerinden rekabet ediyor. Kendi sunucunu barındırabilir, başka sunuculardaki odalarla bağlantı kurabilir ve tek bir şirkete bağımlı kalmazsın. Bu, teknik topluluklara ve kurumlara cazip geliyor. Bedeli daha karmaşık bir kurulum ve Discord’un girip çıkılan ses odalarından farklı bir his. Sıradan bir arkadaş grubu için bu ek kontrol nadiren zahmete değer; ama verisinin ve geçmişinin sahibi olmak isteyen bir proje için belirleyici olabilir.",
      },
      {
        h: "Örtüşme var, rekabet yok: mesajlaşma ve iş sohbeti uygulamaları",
        p: "Slack, Telegram, WhatsApp ve Signal sık sık Discord rakibi olarak anılıyor, ama yalnızca bazı işlerde örtüşüyorlar. Slack iş yerleri için yapıldı. Telegram duyuru kanallarında ve büyük gruplarda güçlü. WhatsApp ve Signal kişisel mesajlaşma uygulamaları. Grubun yazışmak için bunlardan herhangi birini kullanabilir; ama hiçbiri Discord’u tanımlayan “sunucu artı ses kanalı” yapısını sunmuyor, bu yüzden onun yerini nadiren tamamen alıyorlar.",
      },
      {
        h: "Descall’ın rekabet ettiği yer",
        p: "Descall, arkadaş grupları ve küçük-orta topluluklar için Discord’la doğrudan rekabet ediyor. Ana argümanları şunlar: ücretsiz ses, görüntü ve ekran paylaşımı; rol ve izinli sunucular; sunucu şablonları; tüm mesaj geçmişinde arama ve Türkçe ile İngilizce dahil yedi dilde arayüz. Türkiye’den de doğrudan erişilebiliyor. Discord’a Türkiye’den erişim ise 9 Ekim 2024’te mahkeme kararıyla engellendi; bu, orada üyesi olan her grup için önemli. Hesap güvenliği iki adımlı doğrulama ve veri dışa aktarımıyla sağlanıyor, yani Descall’a kilitlenip kalmıyorsun.",
      },
      {
        h: "Descall’ın rekabet etmediği yerler",
        p: "Descall, Discord’un bot pazarına ya da herkese açık sunucu keşfine yetişmeye çalışmıyor ve çok büyük kitleli sunucular için yapılmadı. Masaüstü uygulaması Windows için; diğer bilgisayarlarda web uygulamasını kullanıyorsun. Topluluğun bunlara bağlıysa Discord hâlâ daha iyi araç. Bunu açıkça söylemek, aksini iddia etmekten daha faydalı.",
      },
      {
        h: "Herhangi bir Discord rakibini nasıl değerlendirirsin?",
        p: "Önce olmazsa olmazlarını yaz: ses kalitesi, sunucular, mobil uygulamalar ya da kendi sunucunu barındırmak gibi. Bu özelliklerin ücretsiz olup olmadığına bak. Uygulamanın aktif olarak geliştirildiğine dair işaretler ara; hesapları iki adımlı doğrulamayla koruyabildiğinden ve verini dışa aktarabildiğinden emin ol. Sonra gerçek bir test yap: yedi akşam boyunca gerçek grubunla kullan. Tutmaya değer rakip, kimse hatırlatmadan açılan uygulamadır.",
      },
    ],
  },
  "leave-nitro-keep-voice-chat": {
    sections: [
      {
        h: "Gruplar neden Nitro’ya para ödemeye başlıyor?",
        p: "Çoğu arkadaş grubu oturup abone olmaya karar vermez. Biri bir ayrıcalık için Nitro alır, bir başkası ona uyar ve bir yıl sonra birkaç kişi, ücretsiz sahip olabilecekleri bir sesli sohbet için her ay ödeme yapıyordur. Ekstralarını kullanıyorsan Nitro makul bir ürün. Asıl sorulması gereken, grubunun bu ekstraları gerçekten kullanıp kullanmadığı; yoksa esas olarak konuşmak, ekran paylaşmak ve bir sohbeti sürdürmek mi istediğiniz.",
      },
      {
        h: "Grubunun gerçekte neyi kullandığına bak",
        p: "Sunucunu aç ve son bir aya dürüstçe bak. Hangi kanallarda mesaj vardı, kimler sese katıldı, ne sıklıkla biri ekran paylaştı ve ücretli ayrıcalıkları fark eden oldu mu? Çoğu grup cevabın kısa olduğunu görür: bir grup sohbeti, bir iki ses odası, ara sıra bir yayın ve bolca caps. Ödeme yapanlara da sor; çoğu zaman geçen hafta kullandıkları tek bir ayrıcalığı bile sayamazlar. Bu kısa liste senin gerçek ihtiyacın ve bir alternatifin karşılaması gereken tek şey de o.",
      },
      {
        h: "Descall’da ücretsiz kalanlar",
        p: "Descall her akşam kullandığın parçaları ücretsiz tutuyor. Özel mesajlar, grup sohbetleri, rol ve kanallı sunucular, bire bir ve grup halinde sesli ve görüntülü aramalar, sunucu ses kanalları ve ekran paylaşımı tamamen ücretsiz. Tüm mesaj geçmişinde arama, yanıtlar, tepkiler, anketler, sabitlenmiş mesajlar ve sesli mesajlar da buna dahil. Arama yapmak, ekran paylaşmak ya da sunucu yönetmek için üyelik gerekmiyor. Grup ekran paylaşımı yaklaşık 720p ve saniyede 20 kare civarında başlıyor; daha hafif ya da daha net bir yayın gerekirse ön ayarlar var ve aramadaki herkes için aynı kurallar geçerli.",
      },
      {
        h: "Kozmetikler nereye oturuyor?",
        p: "Nitro’nun keyfinin bir kısmı daha güzel bir profilse, Descall’da bunun için isteğe bağlı bir mağaza var. Profil afişleri, kart renkleri, isim efektleri, avatar efektleri ve ülke bayrakları seçebilirsin. Bunlar aylık bir abonelikle değil, uygulamayı kullanarak kazandığın DesCoin ile alınıyor. Mağazadaki hiçbir şey aramaların sesini ya da bir sunucuda neler yapabileceğini değiştirmiyor; mağazaya hiç dokunmayan arkadaşların hiçbir şey kaçırmıyor.",
      },
      {
        h: "Descall+ ve Ultra neler ekliyor?",
        p: "Descall’da ayrıca isteğe bağlı iki üyelik var: Descall+ ve Descall Ultra. Çoğu masaüstü uygulaması için olan ek araçlar sunuyorlar: mini mod ve her zaman üstte kalan pencereler, genel sessize alma ve bas-konuş, bildirim geçmişi ve odak modu, gürültü kapısı gibi ses araçları. Ultra bunların üstüne masaüstü widget’ları, bir komut merkezi ve çalışma alanı profilleri ekliyor. Konuşmak, ekran paylaşmak ya da sunucu yönetmek için hiçbirine ihtiyacın yok; grubun bunları tamamen görmezden gelebilir. Üyelikler şimdilik Descall ekibi tarafından ve kodlarla veriliyor; yayımlanmış bir fiyat yok.",
      },
      {
        h: "Birinci hafta: akşam aramasını taşı",
        p: "Her şeyi bir anda taşımaya çalışma. En önemli alışkanlığı seç, genelde bu akşamki sesli aramadır, ve bir hafta boyunca onu Descall’da yap. Hesap açın, birbirinizi arkadaş olarak ekleyin ve insanlar çevrimiçi olunca bir grup araması başlatın. Ekran paylaşımını her zamanki gibi kullan. Yeni alışkanlık oturana kadar kimse kendini dışarıda kalmış hissetmesin diye eski uygulamayı arka planda açık tutabilirsin.",
      },
      {
        h: "İkinci hafta: sunucuyu taşı",
        p: "Arama normal gelmeye başlayınca sunucunu yeniden kur. Bir şablondan başla, kanalları eskisine göre yeniden adlandır, iki üç rol oluştur ve davet kodunu eski grup sohbetinde paylaş. Discord geçmişini içe aktaran bir araç olmadığı için sabitlenmiş bağlantıları ve önemli notları elle taşı. İkinci haftanın sonunda çoğu grup, arama için günlerdir kimsenin Discord’u açmadığını fark ediyor.",
      },
      {
        h: "Dürüst olalım: nelerden vazgeçiyorsun?",
        p: "Descall, Discord’dan daha küçük ve daha yeni. Bot pazarı yok; müzik botuna ya da özel bir moderasyon botuna dayanan bir grup bunları özleyecek. Devasa bir herkese açık sunucu dizini de yok ve eski mesaj geçmişin Discord’da kalıyor. Bunlar grubun için çok önemliyse, onlar için ücretsiz bir Discord hesabı tut ve sadece özel aramaları taşı. Aboneliği bırakmak hiçbir şeyi silmeyi gerektirmiyor.",
      },
      {
        h: "Direnenleri ikna etmek",
        p: "Her grupta bir uygulama daha kurmak istemeyen biri vardır. Ona web bağlantısını, yani descall.com/app adresini gönder; bir dakika içinde tarayıcıdan aramaya katılabilsin. iPhone, iPad veya Android kullanan arkadaşlar mobil uygulamayı sonra kurabilir; uzun oturumlar için de Windows uygulaması var. Grubunda Türkiye’de yaşayan biri varsa: Discord’a Türkiye’den erişim 9 Ekim 2024’te mahkeme kararıyla engellendi ve Descall, o arkadaşının belki de ihtiyaç duyduğu dolambaçlı çözümleri ortadan kaldırıyor.",
      },
      {
        h: "İptali kendi takviminle yap",
        p: "Nitro’yu ilk gün iptal etmene gerek yok. Taşınmayı denerken mevcut dönemin dolmasını bekle. Yenileme tarihi geldiğinde, o ay arama için hâlâ Discord’u açan biri olup olmadığına bak. Yoksa iptal et ve takip ettiğin herkese açık sunucular için ücretsiz hesabını tut. Sesli akşamlarınız aynı kalır ve gruptan kimse artık onlar için para ödemez.",
      },
    ],
  },
};

export const TR_BLOG_FAQ_BY_SLUG = {
  "best-discord-alternatives-2026": [
    { q: "2026’da Discord alternatiflerini nasıl kısa listeye alırım?", a: "İşe göre eşleştir: arkadaşlarla ses, topluluk sunucuları ya da sadece ses odaları. Sonra aramaların ve ekran paylaşımının ücretsiz olup olmadığına bak." },
    { q: "Descall bu 2026 kısa listesinde var mı?", a: "Evet; ücretsiz aramalar ve gerçek sunucular isteyen arkadaş grupları ve oyuncular için. Botlara dayanan dev topluluklar için Discord hâlâ doğru seçim." },
    { q: "Türkiye’den erişilebilen bir Discord alternatifi var mı?", a: "Evet. Descall Türkiye’de geliştirilir ve Türkiye’den doğrudan erişilebilir." },
  ],
  "discord-competitors": [
    { q: "2026’da Discord’la gerçekte kim rekabet ediyor?", a: "Hafif arkadaş uygulamaları, topluluk platformları ve klasik ses araçları. Descall, Discord’un bot kataloğunda değil; ücretsiz aramalar ve sunucularda rekabet ediyor." },
    { q: "Her sohbet uygulaması bir Discord rakibi mi?", a: "Hayır. Slack, Telegram ve TeamSpeak yalnızca bazı işlerde örtüşüyor. Ses, sunucular ve temel özelliklerin ücretsiz olup olmadığına göre karşılaştır." },
    { q: "Descall Discord’un tüm özelliklerini sunuyor mu?", a: "Hayır. Bot pazarı ve dev etkinlik araçları yok; arkadaş grupları ve küçük-orta topluluklar için gereken temel özelliklere odaklanır." },
  ],
  "leave-nitro-keep-voice-chat": [
    { q: "Nitro’yu bırakıp grup sesini koruyabilir miyim?", a: "Evet. Descall’da ses, görüntü ve ekran paylaşımı ücretsiz. Kozmetikler ve Descall+ / Ultra üyelikleri isteğe bağlı; hiçbiri aramaları kilitlemiyor." },
    { q: "Descall’da ücretli abonelik var mı?", a: "Descall+ ve Descall Ultra adında isteğe bağlı iki üyelik var; ek masaüstü ve verimlilik araçları sunuyorlar. Şimdilik Descall ekibi tarafından ve kodlarla veriliyorlar, yayımlanmış bir fiyat yok. Sohbet, ses, görüntü ve ekran paylaşımı için üyelik gerekmez." },
    { q: "Bir arkadaş grubunun taşınması ne kadar sürer?", a: "Çekirdek ekibi davet et, şablondan küçük bir sunucu kur ve abonelik alışkanlığını bırakmadan önce iki hafta boyunca sesli akşamları Descall’da yap." },
    { q: "Eski sohbet geçmişim ne olacak?", a: "Eski platformda olduğu gibi kalır; Descall’a otomatik aktarılmaz." },
  ],
};
