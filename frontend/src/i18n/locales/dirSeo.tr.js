/**
 * Public server directory pages, Turkish (/tr/topluluklar, /tr/topluluklar/<slug>), item 8.
 * Same keys as dirSeo.en.js. These pages list servers whose main language is Turkish.
 * Titles <= 60, descriptions <= 160 characters (scripts/seo-validate.mjs).
 */
export const DIR_SEO_TR = {
  home: {
    crumb: "Topluluklar",
    title: "Descall Toplulukları: Katılabileceğin Sunucular",
    description:
      "Minecraft, FPS, CS2, LoL, ders çalışma, müzik, sanat ve anime sunucularını konuya göre keşfet. Türkçe Descall topluluklarına ücretsiz katıl.",
    h1: "Descall’da topluluk bul",
    lead: "Sahipleri tarafından listelenen, konuya göre ayrılmış Türkçe sunucular. Buradaki her sunucunun en az 3 üyesi var. Bir kategori seç, sunucuyu aç ve ücretsiz hesabınla katıl.",
  },
  ui: {
    home: "Ana sayfa",
    breadcrumb: "Sayfa yolu",
    categoriesTitle: "Konuya göre göz at",
    popularTitle: "Popüler topluluklar",
    listTitle: "Bu kategorideki sunucular",
    categoryCount: "{count, plural, =0 {Henüz sunucu yok} other {# sunucu}}",
    members: "{count, plural, one {# üye} other {# üye}}",
    online: "{count} çevrimiçi",
    join: "Katıl",
    joinWorking: "Davet açılıyor…",
    joinFailed: "Davet açılamadı. Birazdan tekrar dene.",
    sortLabel: "Sırala",
    sortMembers: "En çok üye",
    sortOnline: "Şu an çevrimiçi",
    sortNewest: "En yeni",
    searchLabel: "Bu listede ara",
    searchPlaceholder: "Ad, açıklama veya etiket",
    noMatch: "Aramana uyan sunucu yok.",
    emptyTitle: "Burada henüz listelenen sunucu yok",
    emptyBody:
      "Bu konuda bir sunucun mu var? Sunucu ayarlarında Topluluk ve Keşif bölümünü aç ve sunucunu Descall dizininde listele. 3 üyeye ulaştığında burada görünür.",
    unavailable: "Dizine şu an ulaşılamıyor. Birazdan tekrar dene.",
    showMore: "Daha fazla göster",
    languageLabel: "Dil",
    tagsLabel: "Etiketler",
    allTopics: "Tüm konular",
    otherLanguage: "Communities in every language (English)",
    howTitle: "Dizin nasıl çalışır?",
    how: [
      "Sunucu sahipleri ve yöneticiler sunucularını listelemeyi seçer, bir konu ve ana dil belirler, kısa bir açıklama ve en fazla beş etiket yazar.",
      "Bir sunucu en az 3 üyesi olduğunda görünür. Descall moderasyonunun gizlediği sunucular ile yasaklanmış veya silinmiş hesapların sunucuları hiçbir zaman gösterilmez.",
      "Yalnızca ad, simge, açıklama, etiketler ve üye sayıları herkese açıktır. Kanallar, üye listeleri ve mesajlar gizli kalır; katılırken sunucunun kendi kuralları ve doğrulama seviyesi geçerlidir.",
    ],
    ctaTitle: "Kendi topluluğunu kur",
    ctaBody: "Metin ve ses kanalları, roller ve hazır bir şablonla sunucu oluştur; hazır olduğunda burada listele.",
    ctaStart: "Ücretsiz başla",
    ctaDownload: "Descall’ı indir",
    languageNames: {
      tr: "Türkçe",
      en: "İngilizce",
      de: "Almanca",
      es: "İspanyolca",
      fr: "Fransızca",
      "pt-BR": "Portekizce",
      ru: "Rusça",
      other: "Diğer dil",
    },
  },
  cat: {
    "gaming-minecraft": {
      label: "Minecraft",
      title: "Minecraft TR Sunucuları ve Toplulukları | Descall",
      description:
        "Türkçe Minecraft sunucularını keşfet: survival, SMP, skyblock ve yapı grupları, oyun sırasında sesli sohbet. Minecraft TR topluluklarına ücretsiz katıl.",
      h1: "Minecraft TR sunucuları ve toplulukları",
      intro: "Minecraft grupları Descall’ı SMP sohbeti, yapı planlaması ve oyun sırasında sesli konuşmak için kullanıyor. Aşağıdaki her sunucuyu sahibi listeledi.",
    },
    "gaming-fps": {
      label: "FPS ve nişancı oyunları",
      title: "FPS ve Nişancı Oyunu Toplulukları | Descall",
      description:
        "Türkçe FPS ve nişancı oyunu toplulukları: rekabetçi ve normal maç grupları, taktik nişancılar ve battle royale, her maç için ses kanalı. Ücretsiz katıl.",
      h1: "FPS ve nişancı oyunu toplulukları",
      intro: "Taktik nişancılardan battle royale oyunlarına, rekabetçi ve normal maçlarda birlikte oynamak için ses kanallı sunucular.",
    },
    "gaming-cs2": {
      label: "Counter-Strike 2",
      title: "CS2 TR Toplulukları ve Sunucuları | Descall",
      description:
        "Türkçe Counter-Strike 2 toplulukları: Premier, FACEIT ve normal maçlar için gruplar, ses kanalları ve rollerle birlikte oyna. Ücretsiz katıl.",
      h1: "CS2 TR toplulukları ve sunucuları",
      intro: "Birlikte oynamak, utility çalışmak ve raunt aralarında taktik konuşmak için CS2 sunucuları.",
    },
    "gaming-lol": {
      label: "League of Legends",
      title: "League of Legends TR Toplulukları | Descall",
      description:
        "Türkçe League of Legends toplulukları: dereceli, ARAM ve Clash grupları, oynarken sesli konuş. Listelenen LoL sunucularına göz at ve katıl.",
      h1: "League of Legends TR toplulukları",
      intro: "Dereceli, ARAM ve Clash için seste birlikte oynayan gruplar. Bu League of Legends sunucularını sahipleri listeledi.",
    },
    "gaming-other": {
      label: "Diğer oyunlar",
      title: "Oyun Toplulukları ve Oyuncu Sunucuları | Descall",
      description:
        "Diğer tüm oyunlar için Türkçe oyuncu toplulukları: co-op grupları, bağımsız oyunlar, mobil oyunlar ve oyun geceleri. Sunuculara göz at ve katıl.",
      h1: "Oyun toplulukları ve oyuncu sunucuları",
      intro: "Henüz kendi kategorisi olmayan oyunlar için sunucular: co-op ekiplerinden mobil oyun klanlarına.",
    },
    study: {
      label: "Ders çalışma",
      title: "Ders Çalışma Grupları ve Sunucuları | Descall",
      description:
        "Türkçe ders çalışma grupları: odak odaları, sınava hazırlık ve ödev yardımı, ses kanalı ve ekran paylaşımıyla. Bir çalışma sunucusu bul, katıl.",
      h1: "Ders çalışma grupları ve sunucuları",
      intro: "Zamanlayıcıyla, sessiz bir ses odasında veya ekran paylaşarak birlikte çalış. Bu sunucuları sahipleri listeledi.",
    },
    music: {
      label: "Müzik",
      title: "Müzik Toplulukları ve Sunucuları | Descall",
      description:
        "Türkçe müzik toplulukları: prodüktörler, gruplar, dinleyiciler ve karaoke geceleri, ses kanallarıyla. Müzik sunucularına göz at, ücretsiz katıl.",
      h1: "Müzik toplulukları",
      intro: "Parçanı paylaş, miksine yorum al veya bir dinleme odasında takıl.",
    },
    art: {
      label: "Sanat",
      title: "Sanat ve Çizim Toplulukları | Descall",
      description:
        "Türkçe sanat toplulukları: çizim, dijital resim, tasarım ve fotoğraf grupları; çalışmalarını paylaş, yorum al. Sanat sunucularına göz at ve katıl.",
      h1: "Sanat ve çizim toplulukları",
      intro: "Çalışmanı paylaş, bir çizim etkinliğine katıl veya ekran paylaşımında birlikte çiz.",
    },
    tech: {
      label: "Teknoloji",
      title: "Yazılım ve Teknoloji Toplulukları | Descall",
      description:
        "Türkçe teknoloji toplulukları: yazılım, oyun geliştirme, donanım ve açık kaynak grupları; ses odaları ve ekran paylaşımı. Göz at ve katıl.",
      h1: "Yazılım ve teknoloji toplulukları",
      intro: "Kod sorusu sor, ekran paylaşarak birlikte hata ayıkla veya bir donanım projesini takip et.",
    },
    anime: {
      label: "Anime",
      title: "Anime Toplulukları ve Sunucuları | Descall",
      description:
        "Türkçe anime toplulukları: birlikte izleme geceleri, manga sohbeti, fan art ve sezon yorumları, ses kanallarıyla. Anime sunucularına katıl.",
      h1: "Anime toplulukları",
      intro: "Bu sezonu konuş, birlikte izleme gecesi planla veya aynı serileri seven insanlarla fan art paylaş.",
    },
    sports: {
      label: "Spor",
      title: "Spor Toplulukları ve Taraftar Sunucuları | Descall",
      description:
        "Türkçe spor toplulukları: futbol taraftar grupları, fantezi ligler, fitness ve espor sohbeti; maç geceleri için ses kanalları. Göz at ve katıl.",
      h1: "Spor toplulukları ve taraftar sunucuları",
      intro: "Maçı ses kanalında birlikte izle, fantezi lig kur veya antrenman programında birbirinizi takip edin.",
    },
    "chat-friends": {
      label: "Sohbet ve arkadaşlık",
      title: "Sohbet ve Arkadaşlık Sunucuları | Descall",
      description:
        "Yeni insanlarla tanışabileceğin Türkçe sohbet toplulukları: takılma sunucuları, sesli sohbet odaları ve samimi gruplar. Göz at ve ücretsiz katıl.",
      h1: "Sohbet ve arkadaşlık sunucuları",
      intro: "Sohbet etmek, sesli odalarda takılmak ve aynı şeyleri seven insanlarla tanışmak için sunucular.",
    },
    other: {
      label: "Diğer",
      title: "Diğer Topluluklar ve Sunucular | Descall",
      description:
        "Tek bir konuya sığmayan Türkçe Descall toplulukları: hobiler, yerel gruplar, kulüpler ve projeler. Listelenen sunuculara göz at, ücretsiz katıl.",
      h1: "Diğer topluluklar",
      intro: "Hobi grupları, yerel kulüpler, projeler ve tek bir konuya sığmayan her şey.",
    },
  },
};
