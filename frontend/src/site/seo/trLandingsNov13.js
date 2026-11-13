/**
 * Turkish landings of 13 Nov 2026 (keyword map: docs/seo/keyword-map-tr.md). They cover
 * the Turkish queries no page answered: a voice chat program for games, a TeamSpeak
 * alternative, a screen share program, free group voice calls and four games with real
 * Turkish search demand. Turkish only (no English twin), like the other /tr landings.
 *
 * Every Descall claim was checked against the code on 2026-11-13 or repeats a claim of
 * the code-checked guides (seo/trGuideBodies.js): Windows build is x64 (package.json
 * build.win, Electron 45 so Windows 10 or later), iOS deployment target 15.0, Android
 * minSdk 24 (Android 7.0) with a microphone foreground service, iOS background audio,
 * groups capped at 15 people (backend/routes/groups.js MAX_GROUP_SIZE), screen share
 * presets and limits in src/lib/webrtcScreenShare.js. Other products are described in
 * general, long-known terms and the reader is sent to their official sites for details.
 *
 * Same shape as seo/trLandings.js, plus an optional `table` per section:
 * { head: string[], rows: string[][] } (Descall is the last column when it is compared).
 * Titles and descriptions live in seo/trMeta.js; content dates in seo/contentDates.js.
 */

import { SYSTEM_REQUIREMENTS } from "./trSystemRequirements.js";

export const TR_NOV13_UPDATED = "2026-11-13";

const L = {
  program: { to: "/tr/sesli-sohbet-programi", label: "Oyun için sesli sohbet programı" },
  teamspeak: { to: "/tr/teamspeak-alternatifi", label: "TeamSpeak alternatifi" },
  screen: { to: "/tr/ekran-paylasimi-programi", label: "Ekran paylaşımı programı" },
  group: { to: "/tr/ucretsiz-grup-sesli-arama", label: "Ücretsiz grup sesli arama" },
  minecraft: { to: "/tr/minecraft-sesli-sohbet", label: "Minecraft sesli sohbet" },
  cs2: { to: "/tr/cs2-sesli-sohbet", label: "CS2 sesli sohbet" },
  lol: { to: "/tr/lol-sesli-sohbet", label: "League of Legends sesli sohbet" },
  pubg: { to: "/tr/pubg-mobile-sesli-sohbet", label: "PUBG Mobile sesli sohbet" },
  voiceApp: { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
  gamers: { to: "/tr/oyuncu-sohbet-uygulamasi", label: "Oyuncu sohbet uygulaması" },
  alt: { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  alts: { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri karşılaştırması" },
  instead: { to: "/tr/discord-yerine-ne-kullanilir", label: "Discord yerine ne kullanılır?" },
  download: { to: "/tr/download", label: "Descall’ı indir" },
  guideTeam: { to: "/tr/blog/game-team-voice-setup", label: "Oyun takımı için sesli sohbet kurulumu" },
  guideVoice: { to: "/tr/blog/descall-voice-settings-guide", label: "Descall ses ayarları rehberi" },
  guideScreen: { to: "/tr/blog/screen-share-with-friends", label: "Arkadaşlarınla ekran paylaşımı rehberi" },
  guideClasses: { to: "/tr/blog/screen-share-online-classes", label: "Online derste ekran paylaşımı" },
  guideMic: { to: "/tr/blog/better-mic-sound-voice-chat", label: "Mikrofon sesini iyileştirmek" },
  guideServer: { to: "/tr/blog/set-up-a-community-server", label: "Topluluk sunucusu kurmak" },
  guideMigrate: { to: "/tr/blog/move-discord-community-to-descall", label: "Topluluğunu Descall’a taşımak" },
  guideDevices: { to: "/tr/blog/descall-on-every-device", label: "Hangi Descall uygulamasını kullanmalı?" },
  directory: { to: "/tr/topluluklar", label: "Herkese açık Descall toplulukları" },
};


export const TR_LANDINGS_NOV13 = {
  "/tr/sesli-sohbet-programi": {
    path: "/tr/sesli-sohbet-programi",
    kicker: "Windows · Oyun · Ücretsiz",
    short: "Oyun için sesli sohbet programı",
    lead:
      "Oyun oynarken arkadaşlarınla konuşmak için ayrı bir sesli sohbet programı mı arıyorsun? Descall, Windows’ta arka planda sessizce çalışan ücretsiz bir programdır: maç bittiğinde kapanmayan ses kanalları, yapay zekâ gürültü bastırma, bas-konuş, kişi bazlı ses düzeyi ve oyun sesiyle birlikte ekran paylaşımı tek yerde. Aynı hesapla iPhone, Android ve tarayıcıdan da bağlanırsın.",
    sections: [
      {
        h: "Oyun içi ses varken neden ayrı bir program?",
        p: [
          "Birçok oyunun kendi sesli sohbeti var ve maç sırasında işini görüyor. Sorun, bu sesin oyuna bağlı olması: maç bitince oda dağılır, başka bir oyuna geçtiğinizde baştan kurarsınız, oyunu açmayan arkadaşınla da konuşamazsın. Lobide beklerken, karakter seçerken ya da sadece sohbet ederken herkesin aynı yerde kalması için oyundan bağımsız bir ses odası gerekiyor.",
          "Ayrı bir sesli sohbet programı bu boşluğu doldurur. Arkadaş grubunun her akşam girdiği sabit bir oda olur; bir gün Minecraft, ertesi gün CS2 oynasanız da oda aynı kalır. Kim çevrimiçi, kim hangi odada, bir bakışta görürsün. Ekranını paylaşmak, bir klibi göstermek ya da maçtan sonra birlikte tekrar izlemek de aynı yerde olur.",
        ],
      },
      {
        h: "İyi bir oyun sesli sohbet programında olması gerekenler",
        p: ["Program seçerken özellik listesinden önce şu sorulara bak:"],
        list: [
          "Oyunu yavaşlatmadan arka planda çalışıyor mu?",
          "Klavye ve fan sesini mikrofondan temizleyebiliyor mu?",
          "Bas-konuş ve kişi bazlı ses düzeyi gibi oyuncu ayarları var mı?",
          "Sunucu kiralamadan ya da kurmadan kalıcı ses odası açılabiliyor mu?",
          "Arkadaşların telefondan ya da kurulum yapmadan tarayıcıdan katılabiliyor mu?",
          "Konuşmak için abonelik gerekiyor mu?",
        ],
      },
      {
        h: "Sesli sohbet seçenekleri yan yana",
        p: [
          "Oyuncuların en sık kullandığı üç yolu genel hatlarıyla karşılaştırdık. Oyun içi ses ve klasik ses programları oyuna ve sürüme göre değişir; ayrıntılar için ilgili ürünün kendi sitesine bakmanı öneririz.",
        ],
        table: {
          head: ["Özellik", "Oyun içi ses", "Klasik ses programları (TeamSpeak, Mumble)", "Descall"],
          rows: [
            ["Maç bitince oda kalır mı?", "Genelde maçla biter", "Evet", "Evet, ses kanalları kalıcı"],
            ["Sunucu kurulumu", "Gerekmez", "Kendin kurarsın ya da kiralarsın", "Gerekmez, şablonla tek tık"],
            ["Yazılı sohbet ve kanallar", "Sınırlı", "Temel düzeyde", "Yazı, ses ve sahne kanalları"],
            ["Ekran paylaşımı", "Genelde yok", "Programa ve sürüme göre değişir", "Var; Windows’ta oyun sesiyle"],
            ["Gürültü bastırma", "Oyuna göre değişir", "Programa göre değişir", "Yapay zekâ, üç seviye"],
            ["Telefondan katılma", "Oyuna bağlı", "Ayrı mobil uygulamalarla", "iPhone, iPad, Android ve tarayıcı"],
            ["Fiyat", "Oyunla gelir", "Program ücretsiz; sunucu koşulları değişir", "Ücretsiz"],
          ],
        },
      },
      {
        h: "Descall Windows’ta nasıl çalışır?",
        p: [
          "Windows uygulamasını kurup giriş yaptıktan sonra bir sunucu açarsın ya da arkadaşının davet bağlantısıyla onun sunucusuna katılırsın. Ses kanalına tıklamak bağlanmak için yeterli; arama yapıp birinin açmasını beklemezsin. Uygulama tarayıcı sekmelerine uygulanan arka plan yavaşlatması olmadan çalışır, bu yüzden oyun öndeyken de ses kararlı kalır.",
          "Oyun merkezi şablonu bir oyun grubunun ihtiyaç duyduğu odaları hazır kurar: Lobby, Duo Queue, Five Stack ve AFK / Chill ses odaları, turnuva akşamları için Tournament Stage sahne kanalı, squad-up ve clips-and-highlights yazı kanalları ile Admin, Moderator, Helper, VIP ve Member rolleri. Kanal adları şablonda İngilizce; hepsini Türkçe yeniden adlandırabilirsin.",
          "Windows uygulamasında istersen arkadaşlarına hangi oyunu oynadığını da gösterebilirsin; böylece ne zaman katılacaklarını bilirler. Bu ayar Gizlilik bölümünde, Aktivite durumu altında ve istediğin zaman kapatılabiliyor.",
        ],
      },
      {
        h: "Oyuncular için mikrofon ayarları",
        p: [
          "Ayarlar, Ses ve Görüntü sayfasında mikrofonunu ve kulaklığını adıyla seç. Yapay zekâ gürültü bastırmanın Kapalı, Açık ve Güçlü olmak üzere üç seviyesi var; mekanik klavye ya da gürültülü bir fan için Açık çoğu zaman yeter, kalabalık bir odada Güçlü’yü dene. Yankı engelleme ve otomatik ses dengeleme varsayılan olarak açık.",
          "Windows uygulamasında bas-konuş ücretsiz ve Descall etkin pencereyken çalışır. Oyun öndeyken de çalışan bas-konuş ile her yerde çalışan sessize alma tuşu isteğe bağlı Descall+ üyeliğinin parçası; bu yüzden oyun oynarken çoğu kişi ses etkinliğini kullanır ve giriş hassasiyetini tıklamalar halkayı yakmayacak şekilde ayarlar. Sunucu ses kanalında herkesin sesini ayrı ayrı, sessizden iki kat yükseğe kadar ayarlayabilirsin; değişikliği yalnızca sen duyarsın.",
        ],
      },
      {
        h: "Oyun sırasında sesi akıcı tutmak",
        p: [
          "Ses ve oyun aynı bağlantıyı paylaşır. Kablolu bağlantı Wi-Fi’dan daha kararlıdır; maçtan önce büyük indirmeleri ve güncellemeleri durdurmak ikisine de yardım eder. Bağlantı kötüleştiğinde Descall ses hızını düşürür, çok zayıf bağlantılarda kaybolan paketlere karşı yedeklilik ekler. Ses odasında her kişinin yanındaki gösterge bağlantısının nasıl gittiğini söyler.",
          "Bir ağ doğrudan bağlantıyı engellediğinde aramalar aktarma sunucularına geçer; katı yurt ya da okul ağlarında da çoğu zaman bağlanabilirsin. Ses ve görüntü WebRTC ile taşınır ve aktarım sırasında DTLS/SRTP ile şifrelenir.",
        ],
      },
      {
        h: "Hangi oyunlar için?",
        p: [
          "Descall belirli bir oyuna bağlı değil; oyunun yanında açık duran bir ses odası. Yine de oyuna göre ihtiyaç değişiyor: uzun Minecraft oturumlarında rahat ve çok odalı bir düzen, CS2 gibi rekabetçi FPS oyunlarında kısa ve net bildirimler, League of Legends’ta hazır grubun dışındaki arkadaşlarınla buluşma, PUBG Mobile’da ise maç dışında da açık kalan bir klan odası işe yarar. Her biri için ayrı sayfalarda önerilen kanal düzenini ve ayarları anlattık.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Descall bugün şu cihazlarda çalışıyor; hepsi aynı ücretsiz hesabı kullanır:"],
        list: SYSTEM_REQUIREMENTS,
      },
      {
        h: "Dürüst not: Descall neyi yapmıyor?",
        p: [
          "Descall’da oyunun üstünde görünen bir katman (overlay) yok; kimin konuştuğunu Descall penceresinde ya da ikinci ekranda görürsün. Bot pazarı yok; moderasyon, anket ve davet gibi işler uygulamanın içinde hazır geliyor. macOS ve Linux için masaüstü uygulaması yok, o bilgisayarlarda tarayıcı sürümü kullanılıyor. Descall şu an beta aşamasında; bir sorun görürsen uygulama içinden ya da contact@descall.com adresinden yazabilirsin.",
        ],
      },
    ],
    faq: [
      {
        q: "Oyun için en iyi sesli sohbet programı hangisi?",
        a: "Grubuna bağlı. Sadece ses isteyen ve sunucusunu kendisi yöneten gruplar TeamSpeak ya da Mumble’ı seçebilir. Kalıcı ses odalarını, yazılı kanalları, rolleri ve ekran paylaşımını tek programda, sunucu kiralamadan ve ücretsiz istiyorsan Descall iyi bir seçenek.",
      },
      {
        q: "Descall oyun oynarken bilgisayarı yavaşlatır mı?",
        a: "Windows uygulaması arka planda hafif çalışacak şekilde tasarlandı. Ekran paylaşımı açıkken görüntüyü kodlamak ek iş demek; takılma olursa paylaşım kalitesini düşür.",
      },
      {
        q: "Bas-konuş var mı?",
        a: "Evet. Windows uygulamasında bas-konuş ücretsiz ve Descall etkin pencereyken çalışır. Oyun öndeyken de çalışan bas-konuş isteğe bağlı Descall+ üyeliğinin parçası.",
      },
      {
        q: "Arkadaşlarım telefondan katılabilir mi?",
        a: "Evet. iPhone ve iPad uygulaması, Android uygulaması ve tarayıcı sürümüyle aynı ses kanalına katılabilirler.",
      },
      {
        q: "Descall ücretsiz mi?",
        a: "Evet. Ses kanalları, sesli ve görüntülü arama, ekran paylaşımı ve sunucular ücretsiz. Descall+ ve Ultra isteğe bağlı ek araçlar sunar; konuşmak için gerekmez.",
      },
    ],
    related: [L.cs2, L.minecraft, L.lol, L.pubg, L.teamspeak, L.screen, L.gamers, L.guideTeam, L.guideVoice, L.download],
  },

  "/tr/teamspeak-alternatifi": {
    path: "/tr/teamspeak-alternatifi",
    kicker: "Karşılaştırma · Ses kanalları",
    short: "TeamSpeak alternatifi",
    lead:
      "TeamSpeak alternatifi arayanların çoğu aynı şeyi istiyor: sesi bırakmadan sunucu kurma, kiralama ve yönetme işinden kurtulmak, yanına da yazılı sohbet ve ekran paylaşımı eklemek. Descall’da ses kanallarını tek tıkla açarsın; sunucu bizim tarafımızda çalışır, sen sadece kanalları, rolleri ve izinleri düzenlersin. Sesli ve görüntülü arama, ekran paylaşımı ve sunucular ücretsiz.",
    sections: [
      {
        h: "TeamSpeak neden hâlâ seviliyor?",
        p: [
          "TeamSpeak, oyuncular arasında uzun yıllardır kullanılan, ses odaklı bir programdır. Düşük gecikme ve net ses konusunda iyi bir üne sahiptir; kanal ağacı, sunucu ve kanal grupları, konuşma yetkisi gibi ayrıntılı izinlerle büyük klanları düzenli tutmaya yarar. Sunucuyu kendin barındırabilmen de teknik gruplara kontrol hissi verir.",
          "Bu yüzden “TeamSpeak kötü” demek doğru olmaz. Alternatif arayanlar genelde başka bir şeyden yoruluyor: sunucu kiralamak ya da kurmak, sürümler arasında lisans ve slot koşullarını takip etmek, yeni gelen arkadaşa adres, şifre ve eklenti anlatmak, ses dışındaki her şey için ikinci bir uygulama açmak.",
        ],
      },
      {
        h: "TeamSpeak, Mumble ve Descall yan yana",
        p: [
          "Genel ve uzun süredir bilinen özelliklere göre bir özet. TeamSpeak ve Mumble’ın sürüm, lisans ve barındırma koşulları zamanla değişebilir; karar vermeden önce resmi sitelerine bak.",
        ],
        table: {
          head: ["Özellik", "TeamSpeak", "Mumble", "Descall"],
          rows: [
            ["Sunucu", "Kendin kurarsın ya da kiralarsın", "Kendin kurarsın ya da kiralarsın", "Gerekmez; uygulamadan açılır"],
            ["Ses kanalları", "Var, kanal ağacıyla", "Var, kanal ağacıyla", "Var, kategorilerle"],
            ["Yazılı sohbet", "Temel düzeyde", "Temel düzeyde", "Kanallar, DM’ler, grup sohbetleri"],
            ["Roller ve izinler", "Ayrıntılı gruplar", "Ayrıntılı ACL", "Roller ve kanal bazlı izinler"],
            ["Ekran paylaşımı", "Sürüme göre değişir", "Yok", "Var, kalite ön ayarlarıyla"],
            ["Tarayıcıdan katılma", "Yok", "Yok", "Var, kurulum yok"],
            ["Türkçe arayüz", "Sürüme göre değişir", "Sürüme göre değişir", "Var, Türkiye’de geliştiriliyor"],
            ["Açık kaynak", "Hayır", "Evet", "Hayır"],
          ],
        },
      },
      {
        h: "TeamSpeak alışkanlıklarının Descall’daki karşılığı",
        p: ["TeamSpeak’ten geliyorsan kavramların çoğu tanıdık gelir; sadece adları farklı:"],
        list: [
          "Kanal ağacı → kategoriler altında yazı, ses ve sahne kanalları",
          "Sunucu grupları ve kanal grupları → renkli roller ve kanal bazlı izin ayarları",
          "Şifreli kanal → yalnızca belirli rollerin görebildiği kanal",
          "Konuşma yetkisi (talk power) → birkaç kişinin konuşup herkesin dinlediği sahne kanalı",
          "Sunucu adresi ve şifre → süresi ve kullanım sayısı seçilebilen davet bağlantısı",
          "Bas-konuş → Windows uygulamasında bas-konuş tuşu",
          "Sunucu yöneticisi araçları → atma, yasaklama, zaman aşımı ve denetim kaydı",
        ],
      },
      {
        h: "Descall’da sunucuyla uğraşmadan ses kanalı",
        p: [
          "Descall’da bir sunucu oluşturmak barındırma anlamına gelmez; uygulamada “sunucu” dediğimiz şey senin topluluk alanın. Oyun merkezi şablonunu seçtiğinde ses odaları, sahne kanalı, yetkili alanı ve roller hazır gelir. Moderator ve Helper rolleri seste üyeleri susturabilir ve odalar arasında taşıyabilir; aynı izinleri bir kaptan rolüne de verebilirsin.",
          "Yeni gelen biri için adım sayısı az: davet bağlantısını açar, sunucuyu önizler, e‑posta adresi ya da Google hesabıyla ücretsiz hesap açar ve katılır. Kurulum yapmak istemeyen bir arkadaşın tarayıcıdan, telefondaki biri iPhone ya da Android uygulamasından aynı odaya gelir.",
        ],
      },
      {
        h: "Ses kalitesi ve ayarlar",
        p: [
          "Ses ve görüntü WebRTC ile taşınır, aktarım sırasında DTLS/SRTP ile şifrelenir; doğrudan bağlantı kurulamayan ağlarda aktarma sunucuları devreye girer. Yapay zekâ gürültü bastırma üç seviyelidir, yankı engelleme ve otomatik ses dengeleme varsayılan olarak açıktır, giriş hassasiyetini 0 ile 100 arasında ayarlarsın. Bağlantı kötüleştiğinde Descall ses hızını düşürür ve konuşma kopmasın diye yedeklilik ekler.",
          "Bir fark daha: ses kanalında herkesin sesini kendi tarafında ayrı ayrı ayarlarsın. Yüksek konuşan arkadaşını kısmak ya da kısık geleni açmak için onun menüsündeki kaydırıcı yeterli.",
        ],
      },
      {
        h: "Bir klanı TeamSpeak’ten taşımak",
        p: [
          "1. Kanal ağacını kâğıda dök: gerçekten kullanılan ses ve yetkili kanallarını yaz. 2. Descall’da Oyun merkezi şablonuyla sunucuyu aç ve kanalları eski adlarıyla yeniden adlandır. 3. Sunucu gruplarını rollere çevir, yetkili kanalını yalnızca moderatörlere aç. 4. Süresi ve kullanım sayısı sınırlı bir davet bağlantısı oluştur ve klanın mesajlaşma grubuna sabitle. 5. İlk klan akşamını Descall’da yap; herkes mikrofon testini bir kez çalıştırsın. Eski sunucuyu bir süre açık bırakabilirsin.",
        ],
      },
      {
        h: "Ne zaman TeamSpeak’te kalmalısın?",
        p: [
          "Sunucunu kendi donanımında çalıştırmak senin için şartsa, açık kaynak yazılım istiyorsan ya da topluluğun TeamSpeak’e özgü eklentilere bağlıysa geçmek için acele etme. Descall kendi barındırdığın bir sunucu sunmuyor ve eklenti sistemi yok. Ama asıl ihtiyacın arkadaşlarınla her akşam net ses, düzenli kanallar ve ara sıra ekran paylaşımıysa, sunucu yönetimini bırakmak çoğu grup için rahatlatıcı oluyor.",
        ],
      },
      {
        h: "Descall’da neler ücretsiz, neler isteğe bağlı?",
        p: [
          "Ses kanalları, sahne kanalları, birebir ve grup halinde sesli ve görüntülü arama, ekran paylaşımı, sunucular, roller, kanal izinleri, davet bağlantıları ve moderasyon araçları ücretsizdir; kullandığın slot ya da kişi sayısına göre bir ücret yoktur. Gürültü bastırmanın üç seviyesi, yankı engelleme, mikrofon testi ve kişi bazlı ses düzeyi de ücretsiz ayarlar arasında.",
          "Descall+ ve Descall Ultra isteğe bağlı üyeliklerdir. Ek araçlarının çoğu masaüstü uygulaması içindir: oyun öndeyken de çalışan bas-konuş ve sessize alma, mini mod, her zaman üstte kalan pencereler ve ek ses araçları gibi. Üyelikler şimdilik Descall ekibi tarafından ve kodlarla veriliyor, yayımlanmış bir fiyat yok. Mağazadaki kozmetikler de isteğe bağlı ve uygulamada kazandığın DesCoin ile alınıyor.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Descall’ı şu cihazlarda kullanabilirsin:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "Ücretsiz bir TeamSpeak alternatifi var mı?",
        a: "Evet. Descall’da ses kanalları, sesli ve görüntülü arama, ekran paylaşımı ve sunucular ücretsiz; sunucu kiralaman gerekmez. Mumble da açık kaynak ve ücretsizdir, ama sunucuyu kendin kurman gerekir.",
      },
      {
        q: "Descall için sunucu kiralamam gerekir mi?",
        a: "Hayır. Descall’da sunucu uygulamanın içinden açılan bir topluluk alanıdır; barındırma ve bakım bizim tarafımızda.",
      },
      {
        q: "TeamSpeak’teki gibi bas-konuş var mı?",
        a: "Evet. Windows uygulamasında bas-konuş ücretsiz ve Descall etkin pencereyken çalışır; oyun öndeyken de çalışan bas-konuş isteğe bağlı Descall+ üyeliğinde.",
      },
      {
        q: "Kendi sunucumda barındırabilir miyim?",
        a: "Hayır. Descall kendi barındırdığın bir sunucu sürümü sunmuyor. Bu senin için şartsa TeamSpeak ya da Mumble daha uygun.",
      },
      {
        q: "TeamSpeak kanallarımı otomatik aktarabilir miyim?",
        a: "Otomatik aktarma aracı yok. Şablonla başlayıp kanalları eski adlarıyla yeniden adlandırmak çoğu klan için bir akşamlık iş.",
      },
      {
        q: "Descall’da slot ya da kişi başı ücret var mı?",
        a: "Hayır. Sunucu açmak, ses kanalı kullanmak ve üye eklemek için slot ya da kişi başı ücret yok; temel iletişim ücretsiz.",
      },
    ],
    related: [L.program, L.alts, L.gamers, L.cs2, L.screen, L.guideMigrate, L.guideTeam, L.instead, L.download],
  },

  "/tr/ekran-paylasimi-programi": {
    path: "/tr/ekran-paylasimi-programi",
    kicker: "Ekran paylaşımı · Sesli · Ücretsiz",
    short: "Ekran paylaşımı programı",
    lead:
      "Arkadaşlarınla konuşurken ekranını göstermek için ücretsiz bir program mı arıyorsun? Descall’da ekranını birebir aramada, grup aramasında ya da sunucu ses kanalında paylaşırsın. “Oyun, video”, “Uygulama” ve “Yazı, kod” ayarları, 1440p ve saniyede 60 kareye kadar seçenekler var; Windows uygulamasında paylaştığın pencerenin sesi de görüntüyle birlikte gider.",
    sections: [
      {
        h: "Önce hangi tür ekran paylaşımına ihtiyacın olduğunu bil",
        p: [
          "“Ekran paylaşımı programı” diye aranan şey aslında üç farklı iş olabilir. Uzaktan masaüstü araçları başka bir bilgisayarı kontrol etmek içindir; birine teknik destek verirken kullanılır. Toplantı uygulamaları iş görüşmeleri ve resmi dersler için tasarlanmıştır; takvim, bağlantı ve katılımcı yönetimi sunar, ücretsiz planlarında süre ya da katılımcı sınırları olabilir. Sesli sohbet uygulamalarındaki ekran paylaşımı ise arkadaşlarınla konuşurken bir şey göstermek içindir.",
          "Descall üçüncü gruptadır. Bilgisayarını kimseye kontrol ettirmez; sadece seçtiğin ekranı, pencereyi ya da sekmeyi gösterir. Uzaktan destek için uzaktan masaüstü aracı, okulun resmi dersi için okulun platformu daha doğru seçimdir.",
        ],
        table: {
          head: ["Özellik", "Uzaktan masaüstü", "Toplantı uygulaması", "Descall"],
          rows: [
            ["Amaç", "Başka bir bilgisayarı kontrol etmek", "Planlı toplantı ve resmi ders", "Konuşurken ekran göstermek"],
            ["Karşı taraf bilgisayarını kontrol eder mi?", "Evet, izin verirsen", "Genelde hayır", "Hayır"],
            ["Ses", "Ayrı arama gerekebilir", "Var", "Var; aynı odada konuşursunuz"],
            ["Kalıcı oda", "Yok", "Bağlantı ya da toplantı odası", "Her an açık ses kanalları"],
            ["Ücret", "Ürüne göre değişir", "Ücretsiz planlarda sınırlar olabilir", "Ücretsiz"],
          ],
        },
      },
      {
        h: "Descall’da ekranını nerede paylaşırsın?",
        p: [
          "Üç yerde: bir DM’den başlattığın birebir aramada, bir grup sohbetindeki grup aramasında ve bir sunucunun ses kanalında. Aramaya ya da kanala katıl, arama kontrollerindeki ekran paylaşımı düğmesine bas ve neyi göstereceğini seç: bütün bir ekran, tek bir pencere ya da tarayıcıdaysan tek bir sekme. Paylaş’a bastığında odadaki herkes izleyebilir; bitirmek için aynı düğmeye tekrar basarsın.",
          "Ekranını Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan paylaşırsın. iPhone ve iPad uygulaması başkalarının paylaşımlarını izleyebilir ama kendi ekranını paylaşamaz.",
        ],
      },
      {
        h: "Kalite ayarları: sayıyla değil, ne paylaştığınla seç",
        p: [
          "Paylaşım başlamadan önce açılan panel tek bir soru sorar: Ne paylaşıyorsun? “Oyun, video” akıcı hareketi, “Yazı, kod” keskin harfleri öne alır, “Uygulama” ikisinin arasındadır. İnce ayar için çözünürlüğü 480p, 720p, 1080p ya da 1440p, kare hızını saniyede 15, 20, 30 ya da 60 olarak seçersin. Panel yaklaşık bir bit hızı tahmini de gösterir; yükleme hızının yetip yetmeyeceğini buradan anlarsın.",
          "Grup aramasında her izleyici yayını ayrı aldığı için Descall paylaşımı 720p ve saniyede 20 kareyle başlatır, kalabalık bir aramada daha yükseğe çıkarsan uyarır. Birebir aramada paylaşım daha yüksek kalitede başlar; saniyede 60 kare bunun için düşünüldü. Yayındayken kaliteyi değiştirirsen paylaşım yeni ayarlarla bir anlığına yeniden başlar.",
        ],
      },
      {
        h: "Sesli ekran paylaşımı",
        p: [
          "Windows uygulamasında paylaştığın şeyin sesi görüntüyle birlikte gider: gösterdiğin oyunu, klibi ya da videoyu arkadaşların da duyar. Descall bu sese kendi çaldığı arama sesini katmaz, yani kimse konuşmaları yankı olarak geri duymaz. Tarayıcıda sesin gidip gitmediği tarayıcıya ve paylaşım penceresinde ne seçtiğine bağlıdır.",
          "İzleyenler de kontrolü elinde tutar: sunucu ses kanalında paylaşan kişinin menüsünden ekran paylaşımının sesini onun konuşmasından ayrı olarak, tamamen kısıktan iki kat yükseğe kadar ayarlayabilirler.",
        ],
      },
      {
        h: "Ne için kullanılıyor?",
        p: ["Arkadaş grupları ve küçük topluluklar ekran paylaşımını en çok şunlar için kullanıyor:"],
        list: [
          "Oyunda bir yeri, bir yapıyı ya da bir taktiği göstermek",
          "Maçtan sonra bir tekrarı ya da klibi birlikte izleyip konuşmak",
          "Ders çalışırken bir soruyu birlikte çözmek, notları göstermek",
          "Sunum provası yapmak, bir tasarıma birlikte bakmak",
          "Birine bir uygulamanın ayarlarında yol göstermek",
          "Kod paylaşıp birlikte hata ayıklamak",
        ],
      },
      {
        h: "Film ve dizi paylaşımı hakkında bir not",
        p: [
          "Bazı yayın platformları kopya koruması (DRM) kullanır. Bu platformlardaki içerikleri ekran paylaşımıyla göstermeye çalıştığında, hangi uygulamayı kullanırsan kullan karşı taraf çoğu zaman siyah ekran görür. Bu Descall’a özgü değil; korumalı içerikler için platformların kendi birlikte izleme özelliklerine bakmak gerekir.",
        ],
      },
      {
        h: "Gizlilik: bütün ekranı değil, pencereyi paylaş",
        p: [
          "Bütün ekran paylaşımı her şeyi gösterir: açılan bildirimleri, başka sohbetleri, şifre yöneticini. Tek bir şey göstereceksen sadece o pencereyi ya da sekmeyi seç. İşin bitince paylaşımı açık bırakma. Ekran görüntüsü de ses gibi aktarım sırasında WebRTC’nin DTLS/SRTP şifrelemesiyle taşınır.",
        ],
      },
      {
        h: "Ders, sunum ve kod için ipuçları",
        p: [
          "Slayt, belge ya da kod gösterirken akıcılıktan çok harflerin net olması önemli. “Yazı, kod” ayarını seç; bir sunum için saniyede 15 kare fazlasıyla yeter ve yükleme hızın da rahatlar. Paylaşmadan önce yazı boyutunu biraz büyütmek izleyenlerin işini kolaylaştırır, özellikle telefondan izleyen biri varsa.",
          "Bir sunucuda ders ya da sunum yapıyorsan kimin paylaşabileceğini izinlerle belirleyebilirsin. Bunun arkasındaki izin Yayın ve kamera: ders kanalında @everyone için kapatıp anlatan kişinin rolüne açarsan diğerleri dinler, izler ve yazar ama aynı anda ekran paylaşmaya çalışmaz. Sahne kanalında bu düzen kısmen hazır gelir; yalnızca sahnedekiler paylaşabilir. Sorular için kanalın yazılı sohbetini kullanmak konuşmayı kesmeden not almayı sağlar.",
        ],
      },
      {
        h: "Takılma olursa",
        p: [
          "İzleyenler görüntünün takıldığını söylüyorsa önce çözünürlüğü, sonra kare hızını düşür. Wi-Fi yerine kablo kullanmak ve arka plandaki büyük indirmeleri durdurmak yükleme hızını rahatlatır. Uzun paylaşımlarda Windows uygulaması bir tarayıcı sekmesinden daha kararlıdır. Paylaşan kişinin sesi kesik geliyorsa sorun çoğu zaman yükleme hızındadır; bir kademe düşük kalite hem görüntüyü hem sesi rahatlatır.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Ekranını Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan paylaşırsın; izlemek için her cihaz uygun:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "Ücretsiz ekran paylaşımı programı var mı?",
        a: "Evet. Descall’da birebir aramada, grup aramasında ve sunucu ses kanalında ekran paylaşımı ücretsiz; paylaşmak ya da izlemek için üyelik gerekmez.",
      },
      {
        q: "Ekran paylaşırken ses de gider mi?",
        a: "Windows uygulamasında paylaştığın pencerenin ya da ekranın sesi görüntüyle birlikte gider. Tarayıcıda bu, tarayıcıya ve paylaşım penceresindeki seçime bağlıdır.",
      },
      {
        q: "Telefondan ekran paylaşabilir miyim?",
        a: "iPhone ve iPad uygulaması başkalarının paylaşımlarını izleyebilir ama kendi ekranını paylaşamaz. Ekranını Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan paylaşırsın.",
      },
      {
        q: "Karşı taraf bilgisayarımı kontrol edebilir mi?",
        a: "Hayır. Descall’daki ekran paylaşımı yalnızca görüntü ve isteğe bağlı ses gönderir; uzaktan kontrol özelliği yok.",
      },
      {
        q: "En yüksek kalite nedir?",
        a: "1440p çözünürlük ve saniyede 60 kareye kadar seçebilirsin. Grup aramalarında paylaşım 720p ve saniyede 20 kareyle başlar; 60 kare birebir aramalar için düşünüldü.",
      },
    ],
    related: [L.guideScreen, L.guideClasses, L.group, L.program, L.voiceApp, L.alt, L.guideDevices, L.download],
  },

  "/tr/ucretsiz-grup-sesli-arama": {
    path: "/tr/ucretsiz-grup-sesli-arama",
    kicker: "Grup araması · Sesli ve görüntülü",
    short: "Ücretsiz grup sesli arama",
    lead:
      "Arkadaşlarınla ücretsiz grup sesli arama yapmanın iki yolu var: 15 kişiye kadar bir grup sohbetinden herkesi aramak ya da bir sunucuda istediğin zaman girip çıkılan bir ses kanalı açmak. Descall’da ikisi de ücretsiz; görüntülü arama ve ekran paylaşımı da dahil. iPhone, Android, Windows ve tarayıcıdan aynı hesapla katılırsın.",
    sections: [
      {
        h: "Grup araması mı, ses kanalı mı?",
        p: [
          "Telefondaki grup aramasına alışkın olanlar için ilk fark şu: Descall’da iki ayrı yol var ve ikisi farklı işler için. Grup araması, belirli kişilerle bir konuşmayı başlatmak içindir; ses kanalı ise herkesin istediği zaman uğradığı sabit bir odadır.",
        ],
        table: {
          head: ["Özellik", "Grup araması", "Sunucu ses kanalı"],
          rows: [
            ["Kimler", "Grup sohbetinin üyeleri, en fazla 15 kişi", "Sunucunun kanalı görebilen üyeleri"],
            ["Nasıl başlar", "Biri arar, diğerleri katılır", "Kanala tıklayan bağlanır, arama yok"],
            ["Ne zaman biter", "Herkes çıkınca", "Kanal hep orada kalır"],
            ["Görüntü ve ekran paylaşımı", "Var", "Var"],
            ["Kime uygun", "Küçük, kapalı arkadaş grubu", "Her akşam buluşan grup, klan, topluluk"],
            ["Ücret", "Ücretsiz", "Ücretsiz"],
          ],
        },
      },
      {
        h: "Grup sohbetinden grup araması",
        p: [
          "Bir grup sohbeti oluştur, arkadaşlarını ekle ve sohbetteki arama düğmesiyle sesli ya da görüntülü aramayı başlat. Gruptaki herkes aramanın başladığını görür ve katılabilir; geç gelen biri de arama sürerken içeri girebilir. Bir grup sohbetinde seninle birlikte en fazla 15 kişi olabilir. Daha kalabalık bir topluluk için sunucu ve ses kanalı daha uygun.",
          "Aramada kamerasını açmak isteyen açar, istemeyen sadece sesle katılır. Ekranını paylaşmak isteyen biri Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan paylaşabilir; grup aramalarında paylaşım herkesin bağlantısını yormamak için 720p ve saniyede 20 kareyle başlar.",
        ],
      },
      {
        h: "Her an açık ses kanalı",
        p: [
          "Her akşam aynı kişilerle konuşuyorsanız her seferinde birinin araması gerekmez. Bir sunucu açıp “Sohbet”, “Oyun” ya da “Ders” gibi ses kanalları oluşturursun; kanal hep orada kalır, müsait olan girer, işi biten çıkar. Hazır şablonlar bu düzeni senin yerine kurar: Arkadaş takılması küçük bir arkadaş grubuna, Oyun merkezi oyun gruplarına, Ders & kampüs çalışma gruplarına uyar.",
          "Ses kanalında herkesin sesini kendi tarafında ayrı ayrı ayarlayabilirsin. Kanal izinleriyle bir odayı yalnızca belirli rollere açabilir, davet bağlantılarının ne zaman sona ereceğini ve kaç kez kullanılabileceğini seçebilirsin.",
        ],
      },
      {
        h: "Telefondan katılmak",
        p: [
          "iPhone ve iPad uygulaması mesajlaşmayı, birebir ve grup halinde sesli ve görüntülü aramaları ve sunucu ses kanallarını kapsar; birebir aramalar iPhone’un arama ekranında çalar. Android uygulamasıyla da aramalara ve ses kanallarına katılır, bildirim alırsın. Telefon uygulamaları arka plana alındığında ses bağlantısını sürdürür; başka bir uygulamaya geçtiğinde konuşma kesilmez.",
          "Bilgisayar başındaki arkadaşın Windows uygulamasından, kurulum yapmak istemeyen biri tarayıcıdan aynı aramaya gelir. Herkes aynı ücretsiz hesabı kullanır; bilgisayardan kalkman gerekirse aynı kanala telefonundan devam edersin.",
        ],
      },
      {
        h: "Mesajlaşma uygulamalarındaki grup aramalarından farkı",
        p: [
          "WhatsApp ve Telegram gibi mesajlaşma uygulamalarının grup aramaları, herkesin telefonunda zaten olduğu için kısa aramalarda çok pratiktir. Uzun oyun ya da ders akşamlarında ise bazı ihtiyaçlar öne çıkar: bilgisayarda oyun oynarken arka planda kararlı çalışan bir uygulama, kalite ayarlı ekran paylaşımı, klavye ve fan sesini temizleyen gürültü bastırma ve arama bittiğinde kaybolmayan bir oda.",
          "Birçok grup ikisini birlikte kullanıyor: günlük yazışmalar mesajlaşma uygulamasında, uzun sesli akşamlar Descall’da. Davet bağlantısını mesajlaşma grubuna sabitlemek geçişi kolaylaştırır.",
        ],
      },
      {
        h: "Grup aramasını alışkanlığa çevirmek",
        p: [
          "Grup aramaları çoğu zaman “biri arasın” beklentisiyle başlamadan biter. Düzenli konuşan bir grup için birkaç küçük alışkanlık işe yarıyor. Sabit bir saat belirleyin ve grup sohbetine sabitleyin; arama başladığında gruptaki herkes görür ve sohbetteki canlı arama kartından tek dokunuşla katılır, geç kalan da içeri girebilir.",
          "Bildirimleri kendinize göre ayarlayın: her sohbetin Tüm mesajlar, Yalnızca @bahsetmeler ya da Hiçbiri seçeneği var, bir sohbeti bir saatliğine, bir günlüğüne ya da bir haftaya kadar sessize alabilirsiniz. Grup büyüdükçe ya da yeni arkadaşlar katılmak istedikçe aynı insanlarla bir sunucu açıp ses kanalına geçmek doğal bir sonraki adım; grup sohbeti de yanında kalır.",
        ],
      },
      {
        h: "Net ses için üç ayar",
        p: [
          "Kulaklık kullan: hoparlörden çıkan ses mikrofona geri girdiğinde herkes kendi yankısını duyar. Yapay zekâ gürültü bastırmayı Açık bırak, kalabalık bir odadaysan Güçlü yap. Aramadan önce Ses ve Görüntü sayfasındaki mikrofon testini bir kez çalıştır. Bağlantı zayıfladığında Descall ses hızını düşürür ve kopmaları azaltmak için yedeklilik ekler; doğrudan bağlantıyı engelleyen ağlarda aramalar aktarma sunucularına geçer.",
        ],
      },
      {
        h: "Güvenli mi?",
        p: [
          "Sesli ve görüntülü aramalar WebRTC ile taşınır ve aktarım sırasında DTLS/SRTP ile şifrelenir. Mesajlar da aktarım sırasında şifrelidir ve cihazların sohbet geçmişini yükleyebilmesi için sunucuda saklanır; Descall tüm mesajlar için varsayılan uçtan uca şifreleme iddiasında bulunmaz. Hesabını iki adımlı doğrulamayla koruyabilirsin. Descall hesapları 13 yaş ve üzeri içindir.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Grup aramalarına şu cihazlardan katılabilirsin:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "Grup aramasına kaç kişi katılabilir?",
        a: "Bir grup sohbetinde seninle birlikte en fazla 15 kişi olabilir ve grup araması bu kişilerle yapılır. Daha büyük gruplar için bir sunucu açıp ses kanalı kullanmak daha uygun.",
      },
      {
        q: "Grup sesli arama ücretsiz mi?",
        a: "Evet. Grup sesli ve görüntülü aramaları, sunucu ses kanalları ve ekran paylaşımı ücretsiz; üyelik gerekmez.",
      },
      {
        q: "Bilgisayardan ve telefondan aynı aramaya katılabilir miyiz?",
        a: "Evet. Windows uygulaması, iPhone ve iPad uygulaması, Android uygulaması ve tarayıcı sürümü aynı aramaya ve aynı ses kanalına bağlanır.",
      },
      {
        q: "Görüntülü grup araması da var mı?",
        a: "Evet. Grup aramasında ve sunucu ses kanalında kamerasını açmak isteyen açabilir; isteyen yalnızca sesle katılır.",
      },
      {
        q: "Telefon numarası gerekiyor mu?",
        a: "Hayır. E‑posta adresinle ya da Google hesabınla ücretsiz hesap açarsın.",
      },
      {
        q: "Arama başladıktan sonra katılabilir miyim?",
        a: "Evet. Grup araması sürerken sohbette canlı bir arama kartı görünür; ona dokunarak istediğin zaman katılırsın.",
      },
    ],
    related: [L.voiceApp, L.screen, L.program, L.alt, L.guideMic, L.guideDevices, L.instead, L.download],
  },

  "/tr/minecraft-sesli-sohbet": {
    path: "/tr/minecraft-sesli-sohbet",
    kicker: "Minecraft · Sesli sohbet",
    short: "Minecraft sesli sohbet",
    lead:
      "Minecraft’ta arkadaşlarınla sesli konuşmak için oyunun içinde hazır bir düğme yok; ya bir ses modu kurarsın ya da oyunun yanında ayrı bir sesli sohbet uygulaması açarsın. Bu sayfada iki yolu dürüstçe karşılaştırıyor, Descall’da ücretsiz bir Minecraft ses odasının nasıl kurulacağını anlatıyoruz: inşaat ve keşif odaları, koordinat kanalı ve yapılarını göstermek için ekran paylaşımı.",
    sections: [
      {
        h: "Minecraft’ta yerleşik sesli sohbet var mı?",
        p: [
          "Kısa cevap: genel bir yerleşik sesli sohbet yok. Java Edition’da oyuncular sesli konuşmak için çoğunlukla bir “sesli konuşma modu” ya da eklenti kurar, ya da oyunun yanında ayrı bir sesli sohbet uygulaması kullanır. Bedrock Edition’da da arkadaşlarla konuşmak için genelde oyunun dışındaki uygulamalara başvurulur. Sürümler ve sunucu ayarları değiştikçe bu durum değişebilir; oynadığın sunucunun kurallarına ve oyunun güncel notlarına bakmak en doğrusu.",
        ],
      },
      {
        h: "Minecraft’ta sesli konuşmanın yolları",
        p: [
          "Ses modları (örneğin yakındaki oyuncuları duyduğun “yakınlık sesi” modları) oyunun atmosferine güzel bir şey katar: yanındaki oyuncuyu duyarsın, uzaklaştıkça ses kısılır. Bunun için mod genelde hem sunucuda hem her oyuncunun bilgisayarında kurulu olmalı ve sunucunun ek bir ağ ayarı gerekebilir. Ayrı bir sesli sohbet uygulaması ise oyundan bağımsızdır; arkadaşın oyunda nerede olursa olsun onu duyarsın, oyun kapalıyken de konuşmaya devam edersiniz.",
        ],
        table: {
          head: ["Özellik", "Yakınlık sesi modu", "Ayrı sesli sohbet uygulaması (Descall)"],
          rows: [
            ["Kurulum", "Sunucuya ve her oyuncuya mod", "Uygulama ya da tarayıcı, davet bağlantısı"],
            ["Uzaktaki arkadaşı duymak", "Hayır, yakınlık esaslı", "Evet, odadaki herkesi"],
            ["Oyun kapalıyken", "Ses de kapanır", "Oda açık kalır"],
            ["Java ve Bedrock birlikte", "Moda ve sunucuya bağlı", "Fark etmez, herkes aynı odada"],
            ["Telefondan katılma", "Moda bağlı", "iPhone, iPad ve Android uygulaması"],
            ["Ekran paylaşımı", "Yok", "Var, kalite ayarlarıyla"],
          ],
        },
      },
      {
        h: "Minecraft sesli konuşma modu kurmadan önce bil",
        p: [
          "Sesli konuşma modları genelde Java Edition için yazılır ve mod yükleyiciyle birlikte çalışır. Modun sürümü hem Minecraft sürümüne hem yükleyiciye uymalı; sunucu tarafında da aynı mod ya da eklenti kurulu olmalı ve çoğu zaman sunucunun ses için ayrı bir ağ portu açması gerekir. Herkesin modu ayrı ayrı kurması, sürümler değiştiğinde de güncellemesi gerekir.",
          "Bedrock Edition’da, özellikle telefonda ve konsolda, mod kurmak çoğu oyuncu için pratik değildir. Bu yüzden Bedrock oyuncuları genelde oyunun yanında ayrı bir sesli sohbet uygulaması kullanır. Modu yalnızca resmi indirme sayfalarından al; bilinmeyen sitelerden indirilen dosyalar risklidir.",
        ],
      },
      {
        h: "İkisini birlikte kullanmak",
        p: [
          "Büyük, herkese açık sunucularda yakınlık sesi rol yapma ve keşif için eğlencelidir. Kendi arkadaş grubunla oynadığın bir dünyada ise çoğu grup ayrı bir ses odası ister: biri madende, biri köyde olsa da aynı konuşmada kalırsınız. İkisini birlikte kullanacaksan aynı anda iki sesin açık kalmaması için birinin mikrofonunu kapat; yoksa arkadaşların seni iki kez duyar.",
        ],
      },
      {
        h: "Descall’da Minecraft ses odası kurmak",
        p: [
          "Bir sunucu oluştur ve Oyun merkezi şablonunu seç ya da Arkadaş takılması ile daha sade başla. Uzun soluklu bir Minecraft dünyasında tek büyük lobi yerine yapılan işe göre adlandırılmış birkaç ses odası daha iyi çalışır:",
        ],
        list: [
          "İnşaat odası: büyük bir proje üzerinde birlikte çalışanlar için",
          "Keşif odası: mağaraya ya da yeni biyomlara gidenler için",
          "Sohbet odası: çiftlik kurarken ya da sadece takılırken",
          "AFK odası: konuşmadan dinlemek isteyenler için",
          "Koordinatlar yazı kanalı: önemli konumları ve sunucu adresini sabitle",
          "Yapılar kanalı: bitirilen yapıların ekran görüntüleri",
        ],
      },
      {
        h: "Yapılarını ekran paylaşımıyla göster",
        p: [
          "Biri bir yapıyı bitirdiğinde ses odasında ekranını paylaşıp herkesi gezdirebilir. Kalite panelinde hareketli görüntü için “Oyun, video”yu seç. Grup halinde paylaşım herkesin bağlantısını yormamak için 720p ve saniyede 20 kareyle başlar; birebir aramada daha yüksek kalite seçebilirsin. Windows uygulamasında oyunun sesi de görüntüyle birlikte gider. Ekranını Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan paylaşırsın; telefondakiler paylaşımı izleyebilir.",
        ],
      },
      {
        h: "Saatlerce süren oturumlar için ses ayarları",
        p: [
          "Minecraft akşamları uzun sürer, bu yüzden rahat bir ses düzeni önemli. Ses ve Görüntü sayfasında kulaklığını adıyla seç, yapay zekâ gürültü bastırmayı Açık bırak. Sürekli konuşulan rahat bir odada ses etkinliği bas-konuştan daha doğal gelir; giriş hassasiyetini klavye tıklamaları halkayı yakmayacak şekilde ayarla. Çok yüksek ya da çok kısık gelen bir arkadaşını kendi tarafında, onun menüsündeki kaydırıcıyla ayarlarsın.",
        ],
      },
      {
        h: "Bilgisayar, telefon ve tablet bir arada",
        p: [
          "Minecraft oyuncuları farklı cihazlarda oynar; ses odası buna takılmamalı. Bilgisayardaki arkadaşın Windows uygulamasından ya da tarayıcıdan, telefonda veya tablette oynayan biri iPhone, iPad ya da Android uygulamasından aynı odaya gelir. Telefon uygulamaları arka plana alındığında ses bağlantısını sürdürür, yani oyuna geçince konuşma kesilmez. Aynı cihazda hem oyunun hem Descall’ın sesini rahat duymak için kulaklık kullan.",
        ],
      },
      {
        h: "Bir Minecraft sunucusu topluluğu yönetiyorsan",
        p: [
          "Kendi Minecraft sunucusunu çalıştıranlar için ses odası işin yalnızca bir parçası. Oyuncuların duyuruları göreceği, yardım isteyeceği ve kuralları okuyacağı bir yer de gerekiyor. Topluluk & içerik üreticileri şablonu duyurular, etkinlikler ve destek kanalları olan açık bir topluluk için iyi bir başlangıç. Kuralları bir kurallar kanalına yazıp yeni üyelerin katılmadan önce kabul etmesini isteyebilirsin.",
          "Sunucu adresini, sürüm bilgisini ve bakım saatlerini duyurular kanalında sabitle; aynı soruyu her gün cevaplamazsın. Bakım öncesi hatırlatmayı önceden zamanlanmış bir mesajla gönderebilir, yeni bir etkinlik için /anket komutuyla oylama açabilirsin. Topluluğun büyüdüğünde sunucu sahibi olarak Descall’ın herkese açık topluluk dizininde bir kategori ve etiketlerle listelenmeyi açabilirsin; bunun için belirli bir üye sayısına ulaşmak gerekiyor.",
        ],
      },
      {
        h: "Yaş ve güvenlik",
        p: [
          "Minecraft her yaştan oyuncuya hitap ediyor, ama Descall hesapları 13 yaş ve üzeri içindir; 13 ile 18 yaş arasındaki kullanıcılar ebeveyn ya da vasi izniyle kullanabilir. Sunucunu davet bağlantısıyla kapalı tutabilir, bağlantının ne zaman sona ereceğini ve kaç kez kullanılacağını seçebilirsin. Moderatörler mesaj silebilir, zaman aşımı uygulayabilir, atabilir ya da yasaklayabilir; her işlem denetim kaydına yazılır.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Minecraft’ı hangi cihazda oynarsan oyna, ses odasına şunlardan biriyle katılırsın:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "Minecraft’ta sesli sohbet nasıl yapılır?",
        a: "Minecraft’ta genel bir yerleşik sesli sohbet yok. Ya sunucuya ve oyunculara bir ses modu kurulur ya da oyunun yanında Descall gibi ayrı bir sesli sohbet uygulaması açılır.",
      },
      {
        q: "Minecraft sesli konuşma modu nedir?",
        a: "Oyunculara oyun içinde, çoğu zaman yakınlığa göre sesli konuşma ekleyen modlardır. Genelde Java Edition içindir; hem sunucuda hem her oyuncunun bilgisayarında aynı sürümle kurulu olması gerekir.",
      },
      {
        q: "Minecraft Bedrock’ta arkadaşlarla nasıl konuşurum?",
        a: "Bedrock oyuncuları genelde oyunun dışındaki bir sesli sohbet uygulaması kullanır. Descall’ın iPhone, iPad ve Android uygulamalarıyla telefonda ya da tablette oynarken de aynı ses odasında kalırsın.",
      },
      {
        q: "Java ve Bedrock oyuncuları aynı ses odasında olabilir mi?",
        a: "Evet. Descall oyundan bağımsız olduğu için hangi sürümde oynandığı fark etmez; herkes aynı ses kanalına katılır.",
      },
      {
        q: "Ses modu mu, ayrı uygulama mı daha iyi?",
        a: "Yakınlık sesi modu büyük sunucularda atmosfer için güzeldir. Kendi arkadaş grubunla oynarken uzaktaki arkadaşını da duymak ve oyun kapalıyken konuşmaya devam etmek için ayrı bir uygulama daha pratiktir.",
      },
      {
        q: "Descall ücretsiz mi?",
        a: "Evet. Sunucu, ses kanalları, görüntülü arama ve ekran paylaşımı ücretsiz.",
      },
    ],
    related: [L.guideTeam, L.program, L.screen, L.gamers, L.cs2, L.pubg, L.guideServer, L.download],
  },

  "/tr/cs2-sesli-sohbet": {
    path: "/tr/cs2-sesli-sohbet",
    kicker: "CS2 · Takım iletişimi",
    short: "CS2 sesli sohbet",
    lead:
      "CS2’de maç içindeki takım sesi işini görür, ama beş kişilik bir ekip maçtan önce, maç aralarında ve sonrasında da konuşmak ister. Descall’da takımın için ücretsiz bir ses sunucusu kurarsın: aktif kadro için ayrı bir oda, ısınma ve bekleme odaları, kaptana susturma ve taşıma yetkisi, maçtan sonra tekrar izlemek için ekran paylaşımı.",
    sections: [
      {
        h: "Oyun içi ses yetmez mi?",
        p: [
          "CS2’nin kendi takım sesi maç sırasında sadece o maçtaki takım arkadaşlarınla konuşmanı sağlar ve maç bitince biter. Sabit bir beşli için bu yeterli olmayabilir: maç aramadan önce strateji konuşmak, eksik oyuncuyu beklemek, maç arasında gergin bir raundu soğukkanlılıkla tartışmak ve sonra tekrarı birlikte izlemek için oyundan bağımsız bir oda gerekir.",
          "Birçok takım bu yüzden maç içi bildirimleri oyun sesinden, geri kalan her şeyi ayrı bir sesli sohbet uygulamasından yapar ya da takım içi her şeyi tek bir ses odasında toplar. Hangisini seçerseniz seçin, kuralı baştan belirleyin; iki ses kanalı aynı anda açık kalırsa bildirimler karışır.",
        ],
        table: {
          head: ["Özellik", "Oyun içi takım sesi", "Ayrı ses odası (Descall)"],
          rows: [
            ["Kimlerle", "O maçtaki takım", "Seçtiğin ekip ve yedekler"],
            ["Maçtan önce ve sonra", "Yok", "Oda hep açık"],
            ["Kaptan yetkileri", "Yok", "Susturma ve odalar arasında taşıma"],
            ["Tekrar ve klip izleme", "Yok", "Ekran paylaşımı, oyun sesiyle"],
            ["Kişi bazlı ses düzeyi", "Oyun ayarlarına bağlı", "Herkes için ayrı kaydırıcı"],
          ],
        },
      },
      {
        h: "CS2 sesli sohbet açılmıyor ya da ses gelmiyorsa",
        p: [
          "Oyun içi takım sesinde sorun yaşıyorsan önce temel adımları dene. Windows’ta Ayarlar, Gizlilik ve güvenlik, Mikrofon bölümünde masaüstü uygulamalarının mikrofona erişebildiğini kontrol et. Ses ayarlarında doğru mikrofonun varsayılan kayıt cihazı olduğundan emin ol. Oyunun kendi ses ayarlarında sesli sohbetin açık olduğunu ve sesli konuşma tuşunun bir tuşa atandığını kontrol et; tuş atanmamışsa konuşsan da kimse duymaz.",
          "Sesli sohbet devre dışı görünüyorsa hesabına bir iletişim kısıtlaması uygulanmış olabilir; bunu oyunun destek sayfalarından kontrol etmek gerekir. Kulaklığı çıkarıp takmak ya da oyunu yeniden başlatmak da cihaz değişikliğini algılamasına yardım eder. Bu adımlar oyunun kendi sesi içindir; sorun sürerken takımınla konuşmaya devam etmek istersen ayrı bir ses odası bir yedek yol olur.",
        ],
      },
      {
        h: "Beş kişilik takım için sunucu düzeni",
        p: [
          "Oyun merkezi şablonu bir FPS takımının ihtiyaç duyduğu odaları hazır getirir. Maç sırasında aktif beşli için Five Stack, ısınan iki kişi için Duo Queue, geri kalan herkes için Lobby ve konuşmadan bekleyenler için AFK / Chill. Antrenman maçı ya da turnuva akşamı için Tournament Stage sahne kanalında birkaç kişi konuşur, herkes dinler; dinleyiciler söz isteyebilir.",
          "Moderator ve Helper rolleri seste üyeleri susturabilir ve odalar arasında taşıyabilir. Aynı iki izni bir kaptan rolüne verirsen, maç odasına yanlış anda biri girdiğinde oda temiz kalır. Yetkili alanını yalnızca kaptan ve koçlara açmak için kanal izinlerini kullan.",
        ],
      },
      {
        h: "Bildirim disiplini",
        p: [
          "İyi bir takım iletişimi az ve net konuşmaktan geçer. Maç odasının yalnızca bildirimler için olduğunda anlaşın: raund sürerken kısa, sakin, tekrar etmeyen cümleler; ölen oyuncu bilgi verip susar; tartışmalar raund arasına ya da maç sonrasına kalır. Bu kuralları sunucunun kurallar kanalına yazmak, yeni gelen yedek oyunculara da aynı düzeni öğretir.",
        ],
      },
      {
        h: "FPS için mikrofon ayarları",
        p: [
          "Ses ve Görüntü sayfasında kulaklığını adıyla seç. Klavye ve fare tıklamaları aramaya girmesin diye yapay zekâ gürültü bastırmayı Açık tut; mekanik klavyen gürültülüyse Güçlü’yü dene. Ücretsiz Windows uygulamasında bas-konuş Descall etkin pencereyken çalışır; CS2 oynarken öndeki pencere oyundur, bu yüzden çoğu oyuncu ses etkinliğini kullanır. Giriş hassasiyetini, konuşunca profil halkası yanacak ve tıklamalarda sönük kalacak şekilde ayarla. Oyun öndeyken de çalışan bas-konuş ve sessize alma isteğe bağlı Descall+ üyeliğinde.",
          "Herkesi doğru seviyede duymak için ses kanalında arkadaşının menüsünü aç ve sesini sessizden iki kat yükseğe kadar ayarla; bu değişikliği yalnızca sen duyarsın ve oyunun sesine dokunmaz.",
        ],
      },
      {
        h: "Maçtan sonra tekrar izlemek",
        p: [
          "Takımlar en çok kaybettikleri raundları izleyerek gelişir. Maçtan sonra biri ses odasında tekrarı ya da klibi paylaşır, diğerleri hataları gösterir. Kalite panelinde “Oyun, video”yu seç. Grup halinde paylaşım 720p ve saniyede 20 kareyle başlar; birebir koçlukta DM aramasında daha yüksek kalite ve saniyede 60 kare seçebilirsin. Windows uygulamasında oyunun sesi de paylaşıma gider, adım sesleri ve silah sesleri tekrarla birlikte duyulur.",
        ],
      },
      {
        h: "Yedekler, deneme oyuncuları ve koç",
        p: [
          "Bir takım yalnızca beş kişiden oluşmaz. Yedekler, denemeye gelen oyuncular ve bir koç da aynı sunucuda olabilir; önemli olan herkesin nerede ne kadar söz hakkı olduğunu bilmesi. Deneme oyuncularına ayrı bir rol ver ve yetkili kanallarını yalnızca kadroya aç. Koç rolüne seste susturma ve taşıma izni verirsen maç arasında doğru kişileri doğru odaya çekebilir.",
          "Maç sırasında koçun ya da izleyenlerin bildirim odasına girmemesi için Five Stack odasını yalnızca aktif kadroya açabilir, izlemek isteyenler için ayrı bir oda bırakabilirsin. Tekrar incelemesi ve strateji konuşmaları ise herkesin katıldığı Lobby’de ya da sahne kanalında yapılır. Davet bağlantılarını süreli ve sınırlı kullanımlı oluşturursan deneme sürecindeki oyunculara verdiğin bağlantı sonsuza kadar açık kalmaz.",
        ],
      },
      {
        h: "Ping ve ses aynı bağlantıyı paylaşır",
        p: [
          "Rekabetçi oyunda her milisaniye önemli olduğu için bağlantını korumak lazım. Kablo Wi-Fi’dan iyidir; maçtan önce büyük indirmeleri ve güncellemeleri durdur. Bağlantı kötüleştiğinde Descall ses hızını düşürür, çok zayıf bağlantıda kaybolan paketlere karşı yedeklilik ekler. Ses odasında her kişinin yanındaki bağlantı göstergesi, robot gibi gelen bir arkadaşın sorununun kendi bağlantısında olup olmadığını gösterir.",
        ],
      },
      {
        h: "Ne zaman oyunda, ne zaman odada olduğunu göster",
        p: [
          "Windows uygulamasında Descall arkadaşlarına hangi oyunu oynadığını gösterebilir; böylece kimin maçta olduğunu bilir, rahatsız etmezler. Ayar Gizlilik altında, Aktivite durumu bölümünde ve istediğin zaman kapatılabilir. Maç sırasında bildirim almak istemiyorsan durumunu Rahatsız Etme yap ya da kalabalık kanalları Yalnızca @bahsetmeler’e al. Bir sonraki antrenmanın saatini squad-up kanalındaki bir anketle belirleyebilirsin.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Oyun bilgisayarında Windows uygulaması en kararlı seçenek; diğer cihazlar da aynı odaya bağlanır:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "CS2 için hangi sesli sohbet programı kullanılır?",
        a: "Maç içi bildirimler için oyunun kendi takım sesi kullanılır. Maçtan önce ve sonra konuşmak, tekrar izlemek ve sabit bir ekip odası için Descall gibi ayrı bir sesli sohbet uygulaması işe yarar.",
      },
      {
        q: "CS2’de sesli sohbet neden çalışmıyor?",
        a: "En sık sebepler Windows mikrofon izninin kapalı olması, yanlış varsayılan mikrofon ya da oyunda sesli konuşma tuşunun atanmamış olması. Sesli sohbet devre dışı görünüyorsa hesabındaki iletişim kısıtlamalarını oyunun destek sayfalarından kontrol et.",
      },
      {
        q: "Descall oyun içinde bas-konuş destekliyor mu?",
        a: "Ücretsiz Windows uygulamasında bas-konuş Descall etkin pencereyken çalışır. Oyun öndeyken de çalışan bas-konuş isteğe bağlı Descall+ üyeliğinin parçası; ücretsiz kullananlar genelde ses etkinliği ve giriş hassasiyeti ayarını kullanır.",
      },
      {
        q: "Klavye sesi arkadaşlarıma gider mi?",
        a: "Yapay zekâ gürültü bastırma klavye ve fare tıklamalarını büyük ölçüde temizler. Açık çoğu düzene yeter, gürültülü mekanik klavyeler için Güçlü seviyesi var.",
      },
      {
        q: "Takım arkadaşımı odadan çıkarmadan susturabilir miyim?",
        a: "Kendi tarafında herkesin sesini ayrı ayrı kısabilirsin. Moderator, Helper ya da bu izinleri verdiğin kaptan rolü ise seste üyeleri herkes için susturabilir ve odalar arasında taşıyabilir.",
      },
      {
        q: "Ücretli mi?",
        a: "Hayır. Ses kanalları, ekran paylaşımı, roller ve Oyun merkezi şablonu ücretsiz.",
      },
    ],
    related: [L.guideTeam, L.program, L.lol, L.minecraft, L.teamspeak, L.gamers, L.guideVoice, L.download],
  },

  "/tr/lol-sesli-sohbet": {
    path: "/tr/lol-sesli-sohbet",
    kicker: "League of Legends · Arkadaş grubu",
    short: "League of Legends sesli sohbet",
    lead:
      "League of Legends istemcisindeki sesli sohbet, hazır grubunla maç sırasında konuşman için yeterli. Ama arkadaş grubun beşten kalabalıksa, sıra beklerken ya da ARAM akşamlarında herkes aynı yerde kalmak istiyorsa, maçtan bağımsız bir ses odası işe yarar. Descall’da LoL grubun için ücretsiz bir sunucu kurarsın: lobi, Flex ve ARAM odaları, turnuva akşamları için sahne kanalı ve klipler için ekran paylaşımı.",
    sections: [
      {
        h: "İstemcideki sesli sohbet neyi kapsar?",
        p: [
          "League of Legends’ın kendi sesli sohbeti hazır grup için tasarlandı: birlikte sıraya girdiğin arkadaşlarınla maç sırasında konuşursun. Maç dışındaki arkadaşın, yedek oyuncu ya da sadece izleyen biri bu konuşmanın parçası olamaz; grup dağılınca oda da dağılır. Oyunun yapımcısı sesli sohbet özelliklerini zaman zaman genişletiyor; güncel durum için oyunun yama notlarına bakmak en doğrusu.",
          "Ayrı bir ses odası bu yüzden çoğu arkadaş grubunda maç içi sesin yerini almaz, onu tamamlar. Maç sırasında hazır grup sesi, maç arası ve akşam boyunca sabit bir oda.",
        ],
        table: {
          head: ["Özellik", "İstemcideki hazır grup sesi", "Ayrı ses odası (Descall)"],
          rows: [
            ["Kimlerle", "O an sıradaki hazır grup", "Seçtiğin arkadaş grubu, beşten fazlası da"],
            ["Sıra beklerken", "Grup kurulduysa", "Oda hep açık"],
            ["Maçta olmayan arkadaş", "Katılamaz", "Katılır"],
            ["Klip ve tekrar izleme", "Yok", "Ekran paylaşımı, oyun sesiyle"],
            ["Yazılı kanallar ve roller", "Sınırlı", "Kanallar, roller, izinler"],
          ],
        },
      },
      {
        h: "Ayrı bir oda nerede işe yarıyor? Üç örnek akşam",
        p: [
          "Altı kişilik bir arkadaş grubu düşün. Beşi Flex’e giriyor, biri dışarıda kalıyor. Hazır grup sesinde altıncı kişi konuşmanın dışında kalır; ayrı bir ses odasında ise maçı izler, yorum yapar, bir sonraki maçta yerini alır. Kimse kendini dışlanmış hissetmez.",
          "İkinci örnek: biri dereceli maçta, diğerleri ARAM oynuyor. Herkes kendi odasında ama aynı sunucuda; maçı biten diğer odaya geçer, kimin müsait olduğunu sunucudaki kanal listesinden görürsün. Üçüncü örnek: akşamın sonunda herkes Lobi’de toplanır, biri günün en iyi klibini ekran paylaşımıyla gösterir. Bu üç durumun ortak noktası, konuşmanın maçtan önce başlayıp maçtan sonra da sürmesi.",
        ],
      },
      {
        h: "LoL sesli sohbet çalışmıyorsa",
        p: [
          "İstemcideki sesli sohbette sesin gitmiyor ya da kimseyi duymuyorsan önce istemcinin ayarlarındaki sesli sohbet bölümünde doğru giriş ve çıkış cihazının seçili olduğunu, sesli sohbetin açık olduğunu ve bas-konuş kullanıyorsan tuşun atandığını kontrol et. Windows’ta Ayarlar, Gizlilik ve güvenlik, Mikrofon bölümünde masaüstü uygulamalarının mikrofona erişebildiğinden emin ol.",
          "Sesli sohbet yalnızca hazır grupta çalıştığı için tek başına sıraya girdiğinde ses kanalı görünmez. Bağlanma sorunları sürüyorsa istemciyi yeniden başlatmak ve oyunun destek sayfalarındaki güncel adımlara bakmak gerekir. Takım geneli sesli sohbetin ne zaman geleceğini merak ediyorsan resmi yama notları en güvenilir kaynak.",
        ],
      },
      {
        h: "LoL grubun için sunucu düzeni",
        p: [
          "Oyun merkezi şablonuyla başla ve odaları kendi oyun alışkanlığınıza göre yeniden adlandır. Örnek bir düzen:",
        ],
        list: [
          "Lobi: sıra bekleyenler ve maçı biten herkes",
          "Dereceli ikili: ikili sıradaki arkadaşlar",
          "Flex 5’li: beş kişi birlikte girdiğinizde",
          "ARAM ve eğlence modları: rahat akşamlar",
          "AFK: konuşmadan dinlemek isteyenler",
          "Klipler kanalı: pentakill’ler ve unutulmaz anlar",
          "Plan kanalı: turnuva saatleri ve kadro",
        ],
      },
      {
        h: "Turnuva akşamları ve izleyiciler",
        p: [
          "Topluluk içi bir turnuva ya da arkadaşlar arası bir maç düzenlediğinde Tournament Stage sahne kanalı işe yarar: birkaç kişi konuşur, geri kalan herkes dinler, dinleyiciler söz isteyebilir. Takımları ayrı ses odalarına dağıtabilir, Moderator ya da bu izni verdiğin bir organizatör rolüyle üyeleri odalar arasında taşıyabilirsin. Kuralları duyurular kanalına yaz ve yeni üyelerin katılmadan önce kabul etmesini iste; Descall bunu zorunlu tutabiliyor.",
        ],
      },
      {
        h: "Maçı birlikte izlemek",
        p: [
          "Bir oyuncu tekrarı ya da kaydettiği klibi ses odasında paylaşırken diğerleri yorum yapabilir. Kalite panelinde “Oyun, video”yu seç; grup halinde paylaşım 720p ve saniyede 20 kareyle başlar. Birebir koçlukta DM aramasında daha yüksek kalite ve saniyede 60 kare seçebilirsin. Windows uygulamasında oyunun sesi de görüntüyle birlikte gider. İzleyenler paylaşımın sesini, paylaşan kişinin konuşmasından ayrı olarak kendi taraflarında ayarlayabilir.",
        ],
      },
      {
        h: "Ses ayarları",
        p: [
          "Ses ve Görüntü sayfasında kulaklığını adıyla seç ve yapay zekâ gürültü bastırmayı Açık bırak. Ücretsiz Windows uygulamasında bas-konuş Descall etkin pencereyken çalışır; oyun öndeyken ses etkinliğini kullan ve giriş hassasiyetini tıklamalar halkayı yakmayacak şekilde ayarla. Oyun öndeyken çalışan bas-konuş isteğe bağlı Descall+ üyeliğinde. Hem istemcideki sesli sohbet hem Descall açıksa ikisinde birden konuşmamak için birinin mikrofonunu kapat.",
        ],
      },
      {
        h: "Wild Rift ve telefondan katılanlar",
        p: [
          "Grubunda telefonda oynayan arkadaşlar da olabilir. iPhone, iPad ve Android uygulamalarıyla aynı ses odasına katılırlar; telefon uygulamaları arka plana alındığında ses bağlantısını sürdürür. Aynı telefonda hem oyunun hem Descall’ın sesini rahat duymak için kulaklık kullanmak iyi olur. Bilgisayardan uzaktaki biri de tarayıcıdan, kurulum yapmadan girebilir.",
        ],
      },
      {
        h: "Kimin oyunda olduğunu bil",
        p: [
          "Windows uygulamasında Descall arkadaşlarına hangi oyunu oynadığını gösterebilir; kim maçta, kim müsait, bir bakışta görürsün. Ayar Gizlilik altında, Aktivite durumu bölümünde. Maç sırasında bildirimlerle uğraşmamak için durumunu Rahatsız Etme yap. Yeni bir akşam planlamak için plan kanalında bir anket açabilirsin.",
        ],
      },
      {
        h: "Gruba yeni oyuncu katmak",
        p: [
          "Arkadaş grubu zamanla büyür: dereceli maçta tanıştığın biri, bir arkadaşın arkadaşı. Yeni gelenler için süreli ve sınırlı kullanımlı bir davet bağlantısı oluştur; bağlantıyı açan kişi sunucuyu önizler ve e‑posta adresi ya da Google hesabıyla ücretsiz hesap açıp katılır. İlk günler için ayrı bir rol verip bazı kanalları yalnızca eski üyelere açabilirsin. Kurallar kanalında kısa bir karşılama ve ses odalarının ne için olduğunu anlatan birkaç cümle, yeni gelenin nereye gireceğini bilmesini sağlar.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Oyun bilgisayarında Windows uygulaması, telefondakiler için mobil uygulamalar:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "League of Legends’ta sesli sohbet var mı?",
        a: "Evet, istemcide hazır grup için sesli sohbet var; birlikte sıraya girdiğin arkadaşlarınla maç sırasında konuşursun. Ayrıntılar ve son değişiklikler için oyunun yama notlarına bak.",
      },
      {
        q: "Hazır grupta olmayan arkadaşım konuşmamızı duyabilir mi?",
        a: "İstemcideki hazır grup sesinde hayır. Descall’daki bir ses odasında ise maçta olan da olmayan da aynı konuşmadadır.",
      },
      {
        q: "Beşten fazla arkadaşla nasıl konuşuruz?",
        a: "Maçtan bağımsız bir ses odası kullanarak. Descall’da bir sunucu açıp ses kanalı oluşturursun; maçta olan da olmayan da aynı odada kalır.",
      },
      {
        q: "Maç içi ses ile Descall’ı birlikte kullanabilir miyim?",
        a: "Evet, ama aynı anda iki yerde konuşmamak için birinin mikrofonunu kapat. Birçok grup maç sırasında hazır grup sesini, maç arasında Descall’ı kullanıyor.",
      },
      {
        q: "Telefondaki arkadaşlarım katılabilir mi?",
        a: "Evet. iPhone, iPad ve Android uygulamaları ya da tarayıcı sürümüyle aynı ses kanalına katılabilirler.",
      },
      {
        q: "Descall ücretsiz mi?",
        a: "Evet. Sunucu, ses kanalları, sahne kanalı ve ekran paylaşımı ücretsiz.",
      },
    ],
    related: [L.guideTeam, L.program, L.cs2, L.pubg, L.screen, L.gamers, L.guideServer, L.download],
  },

  "/tr/pubg-mobile-sesli-sohbet": {
    path: "/tr/pubg-mobile-sesli-sohbet",
    kicker: "PUBG Mobile · Ekip ve klan",
    short: "PUBG Mobile sesli sohbet",
    lead:
      "PUBG Mobile’ın kendi takım sesi maç sırasında dört kişilik ekibin için yeterli. Ama klanın maç dışında da konuşmak, bir sonraki maçı planlamak ya da eksik oyuncuyu beklerken bir arada kalmak istiyorsa ayrı bir ses odası işe yarar. Descall’ın iPhone ve Android uygulamalarıyla ücretsiz bir klan sunucusu kurarsın; uygulama arka plandayken de ses sürer.",
    sections: [
      {
        h: "Oyunun kendi sesi neyi kapsar?",
        p: [
          "PUBG Mobile’da ekip arkadaşlarınla maç sırasında oyunun içinden konuşabilirsin; mikrofonu ve hoparlörü oyunun kendi düğmeleriyle açıp kapatırsın. Bu ses, o maçtaki ekiple sınırlıdır ve maç bitince kapanır. Klanın geri kalanı, yedek oyuncular ya da maçta olmayan arkadaşlar bu konuşmaya katılamaz. Oyunun ses ayarları güncellemelerle değişebilir; ayrıntılar için oyunun kendi ayar menüsüne bak.",
        ],
        table: {
          head: ["Özellik", "Oyun içi ekip sesi", "Ayrı ses odası (Descall)"],
          rows: [
            ["Kimlerle", "O maçtaki ekip", "Tüm klan ya da arkadaş grubu"],
            ["Maç dışında", "Yok", "Oda hep açık"],
            ["Klan düzeni", "Oyunun klan özellikleri", "Roller, kanallar, duyurular"],
            ["Bilgisayardan katılma", "Yok", "Windows uygulaması ve tarayıcı"],
            ["Yazılı plan ve anket", "Sınırlı", "Kanallar ve /anket komutu"],
          ],
        },
      },
      {
        h: "PUBG Mobile sesli sohbet sorunu yaşıyorsan",
        p: [
          "Oyunun sesinde kimse seni duymuyorsa önce telefonun ayarlarında oyuna mikrofon izni verildiğini kontrol et: iPhone’da Ayarlar, Gizlilik ve Güvenlik, Mikrofon; Android’de uygulama izinleri. Oyunun içinde mikrofonun ve hoparlörün açık olduğuna, ses ayarlarında takım sesinin seçili olduğuna bak. Bluetooth kulaklık kullanıyorsan bağlantının oyun açılmadan önce kurulmuş olması çoğu zaman sorunu çözer.",
          "Oyun arka plana alındığında oyunun kendi sesinin sürmesi oyuna ve telefona bağlıdır. Maç dışında da konuşmaya devam etmek istiyorsan ayrı bir ses odası daha güvenilir bir yol: Descall’ın telefon uygulamaları arka plana alındığında ses bağlantısını sürdürür.",
        ],
      },
      {
        h: "Aynı telefonda iki ses uygulaması: dikkat edilmesi gerekenler",
        p: [
          "Telefon aynı anda iki uygulamanın mikrofonu kullanmasında zorlanabilir ve iki ayrı ses kanalında birden konuşmak ekibini karıştırır. En temiz düzen, maç sırasında tek bir ses kullanmak: ya oyunun kendi sesini ya Descall’ı. Descall’da konuşacaksan oyunun içindeki mikrofonu kapat; oyunun sesini dinlemek istiyorsan hoparlörünü açık bırakabilirsin.",
          "Descall’ın telefon uygulamaları arka plana alındığında ses bağlantısını sürdürür, yani Descall’da ses odasına girip oyuna geçtiğinde konuşma kesilmez. Oyunun ve arkadaşlarının sesini rahat ayırt etmek ve yankıyı önlemek için kulaklık kullan.",
        ],
      },
      {
        h: "İki cihazlı düzen",
        p: [
          "Bazı oyuncular sesi tamamen telefondan ayırmayı tercih ediyor: oyun telefonda, Descall bilgisayarda ya da tablette. Bilgisayardaki Windows uygulaması ya da tarayıcı sürümü uzun oturumlarda kararlı çalışır, telefonun da tek işi oyun olur. Aynı hesapla iki cihazda açık kalabilirsin; ses odasına hangisinden katıldıysan ses oradan gelir.",
        ],
      },
      {
        h: "Klan sunucusu kurmak",
        p: [
          "Oyun merkezi şablonuyla bir sunucu aç; roller (Admin, Moderator, Helper, VIP, Member), yetkili alanı ve ses odaları hazır gelir. Odaları ve kanalları klanınıza göre yeniden adlandır:",
        ],
        list: [
          "Duyurular: maç saatleri ve klan haberleri, yalnızca liderler yazar",
          "Kurallar: yeni üyeler katılmadan önce kabul eder",
          "Ekip odaları: maça birlikte giren dörtlüler için birkaç ses odası",
          "Lobi: maç bekleyenler ve maçı bitenler",
          "Klipler: en iyi anların ekran görüntüleri ve videoları",
          "Yetkili odası: yalnızca liderler ve moderatörler",
        ],
      },
      {
        h: "Klan akşamları ve antrenman maçları",
        p: [
          "Klan içi bir antrenman ya da başka bir klanla dostluk maçı düzenlediğinde ses odalarını ekip başına ayır: her dörtlü kendi odasında konuşur, liderler yetkili odasında kadroyu ve sırayı belirler. Moderator ve Helper rolleri seste üyeleri susturabilir ve odalar arasında taşıyabilir; aynı izinleri klan liderlerine verirsen maç arasında ekipleri hızlıca yeniden kurabilirsin.",
          "Duyurular, maç öncesi bilgilendirme ve sonuçlar için bir etkinlik akşamında sahne kanalı işe yarar: birkaç kişi konuşur, herkes dinler, dinleyiciler söz isteyebilir. Sonuçları ve ekran görüntülerini klipler kanalında toplamak, klanın geçmişini de bir yerde tutar.",
        ],
      },
      {
        h: "Telefonda uzun oturumlar için ipuçları",
        p: [
          "Oyun ve sesli sohbet aynı telefonda birlikte çalıştığında telefonun daha çok çalışması doğaldır. Uzun bir akşam öncesi telefonu şarja yakın tut, kulaklık kullan ve kamerayı kapalı bırak; ses tek başına görüntüden çok daha az veri ve güç kullanır. Mobil veri yerine güçlü bir Wi‑Fi ağı hem oyunun hem sesin akıcılığına yardım eder. Bağlantı zayıfladığında Descall ses hızını düşürür ve konuşma kopmasın diye yedeklilik ekler; doğrudan bağlantıyı engelleyen ağlarda aramalar aktarma sunucularına geçer.",
        ],
      },
      {
        h: "Bildirimler ve rahatsız edilmemek",
        p: [
          "Maç sırasında telefonun bildirimlerle dolması kimsenin istemediği bir şey. Descall’da her sohbetin kendi bildirim ayarı var: Tüm mesajlar, Yalnızca @bahsetmeler ya da Hiçbiri. Kalabalık kanalları sessize alabilir, maç saatlerinde durumunu Rahatsız Etme yapabilirsin. Toplu etiketler de sınırlı: @everyone ve @here yalnızca yetkili roller tarafından ve kanal başına dakikada bir kez kullanılabiliyor.",
        ],
      },
      {
        h: "Maç planlamak ve klibi paylaşmak",
        p: [
          "Bir sonraki maçın saatinde anlaşmak için /anket komutuyla hızlı bir oylama açabilirsin. Önemli bir klan maçından önceki akşam için hatırlatma mesajı zamanlayabilirsin. Maç sonrası bir klibi bilgisayardan ses odasında paylaşmak istersen Windows uygulamasından ya da bilgisayardaki bir tarayıcıdan ekran paylaşırsın; telefondaki arkadaşlar paylaşımı izleyebilir. Telefondan kendi ekranını paylaşma özelliği yok.",
        ],
      },
      {
        h: "Yaş ve güvenlik",
        p: [
          "Descall hesapları 13 yaş ve üzeri içindir; 13 ile 18 yaş arasındaki kullanıcılar ebeveyn ya da vasi izniyle kullanabilir. Klan sunucunu davet bağlantısıyla kapalı tutabilir, bağlantının ne zaman sona ereceğini ve kaç kez kullanılabileceğini seçebilirsin. Moderatörler zaman aşımı uygulayabilir, atabilir ya da yasaklayabilir; her işlem denetim kaydına yazılır. Sesli aramalar aktarım sırasında DTLS/SRTP ile şifrelenir.",
        ],
      },
      {
        h: "Sistem gereksinimleri",
        p: ["Telefonda iPhone ya da Android uygulaması, istersen bilgisayarda Windows uygulaması:"],
        list: SYSTEM_REQUIREMENTS,
      },
    ],
    faq: [
      {
        q: "PUBG Mobile’da arkadaşlarla nasıl sesli konuşulur?",
        a: "Maç sırasında oyunun kendi ekip sesiyle konuşursun. Maç dışında da açık kalan bir klan odası için Descall gibi ayrı bir sesli sohbet uygulaması kullanılabilir.",
      },
      {
        q: "Descall oyun oynarken arka planda çalışır mı?",
        a: "Evet. iPhone ve Android uygulamaları arka plana alındığında ses bağlantısını sürdürür; ses odasına girip oyuna geçtiğinde konuşma devam eder.",
      },
      {
        q: "Oyun içi ses ile Descall aynı anda açık olabilir mi?",
        a: "Olabilir, ama iki yerde birden konuşmamak için oyunun içindeki mikrofonu kapatmanı öneririz. Telefon aynı anda iki uygulamaya mikrofon vermekte zorlanabilir.",
      },
      {
        q: "Bilgisayardaki arkadaşlarımla aynı odada olabilir miyim?",
        a: "Evet. Windows uygulaması ve tarayıcı sürümü, telefon uygulamalarıyla aynı ses kanalına bağlanır.",
      },
      {
        q: "Hangi telefonlarda çalışır?",
        a: "iPhone ve iPad’de iOS ve iPadOS 15 ya da üzeri, Android’de 7.0 ya da üzeri. Android uygulaması Descall’ın GitHub sürümler sayfasında APK olarak yayımlanır.",
      },
      {
        q: "Klan sunucusu kurmak ücretli mi?",
        a: "Hayır. Sunucu, roller, ses kanalları ve duyuru kanalları ücretsiz.",
      },
    ],
    related: [L.group, L.program, L.lol, L.minecraft, L.gamers, L.guideDevices, L.guideServer, L.download],
  },
};
