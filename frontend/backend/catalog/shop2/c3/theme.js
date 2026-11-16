"use strict";

/**
 * theme: 38 dark glass themes. Each gives a palette (the builder derives the
 * design tokens and both Liquid Glass palettes from it, with contrast checks)
 * and a still scene painted behind the glass (no motion: a theme is on screen
 * all day, see the idle CPU rule). The scene art is in theme-art.js; the shop
 * swatch shows it with a small glass window and an own bubble in the accent.
 *   base    deepest background     tint   hue for surfaces, borders, text
 *   primary accent (buttons)       second second accent (bubble, edge light)
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const T = [
  {
    slug: "kutup-gecesi", rarity: "legendary", base: "#04121a", tint: "#6effc7", primary: "#0e8a6c", second: "#6a5cff",
    name: "Kutup Gecesi|Polar Night|Polarnacht|Noche polar|Nuit polaire|Noite polar|Полярная ночь",
    desc: "Yıldızlı gökte yeşil ve mor kutup ışıkları.|Green and violet aurora in a starry sky.|Grünes und violettes Polarlicht am Sternenhimmel.|Aurora verde y violeta en un cielo estrellado.|Aurore verte et violette dans un ciel étoilé.|Aurora verde e violeta num céu estrelado.|Зелёное и фиолетовое сияние в звёздном небе.",
  },
  {
    slug: "ay-isigi-korfezi", rarity: "epic", base: "#060d1c", tint: "#9fc0ff", primary: "#3d6fe0", second: "#7aa7ff",
    name: "Ay Işığı Körfezi|Moonlit Bay|Mondbucht|Bahía de luna|Baie au clair de lune|Baía ao luar|Лунный залив",
    desc: "Durgun suda gümüş bir ay yolu.|A silver moon path on still water.|Ein silberner Mondpfad auf stillem Wasser.|Un camino de luna plateado sobre agua quieta.|Un chemin de lune argenté sur l'eau calme.|Um caminho de luar prateado na água parada.|Серебряная лунная дорожка на тихой воде.",
  },
  {
    slug: "col-safagi", rarity: "rare", base: "#170d09", tint: "#ffc49a", primary: "#c2562a", second: "#e8a04a",
    name: "Çöl Şafağı|Desert Dawn|Wüstenmorgen|Amanecer en el desierto|Aube du désert|Aurora no deserto|Рассвет в пустыне",
    desc: "Kum tepelerinin ardından doğan sıcak bir ışık.|Warm light rising behind the dunes.|Warmes Licht hinter den Dünen.|Luz cálida que nace tras las dunas.|Une lumière chaude se lève derrière les dunes.|Luz quente nascendo atrás das dunas.|Тёплый свет встаёт из-за дюн.",
  },
  {
    slug: "lavanta-tarlasi", rarity: "rare", base: "#120c1e", tint: "#c7a8ff", primary: "#7a4fd6", second: "#d67ab8",
    name: "Lavanta Tarlası|Lavender Field|Lavendelfeld|Campo de lavanda|Champ de lavande|Campo de lavanda|Лавандовое поле",
    desc: "Alacakaranlıkta mor sıralar ve pembe bir ufuk.|Violet rows at dusk under a pink horizon.|Violette Reihen in der Dämmerung, rosa Horizont.|Hileras violetas al anochecer y horizonte rosa.|Des rangs violets au crépuscule, horizon rose.|Fileiras violetas ao entardecer e horizonte rosa.|Фиолетовые ряды в сумерках и розовый горизонт.",
  },
  {
    slug: "derin-mercan", rarity: "epic", base: "#071419", tint: "#7fe8e0", primary: "#c42d63", second: "#19a8a0",
    name: "Derin Mercan|Deep Reef|Tiefes Riff|Arrecife profundo|Récif profond|Recife profundo|Глубокий риф",
    desc: "Turkuaz suyun dibinde parlayan mercanlar.|Corals glowing at the bottom of teal water.|Korallen leuchten am Grund des türkisen Wassers.|Corales que brillan en el fondo del agua turquesa.|Des coraux luisent au fond de l'eau sarcelle.|Corais brilhando no fundo da água turquesa.|Кораллы светятся на дне бирюзовой воды.",
  },
  {
    slug: "volkan", rarity: "epic", base: "#0e0606", tint: "#ff9a7a", primary: "#b8301a", second: "#ff8a1f",
    name: "Volkan|Volcano|Vulkan|Volcán|Volcan|Vulcão|Вулкан",
    desc: "Kara kayanın altından kızıl bir lav ışığı.|Red lava light under black rock.|Rotes Lavalicht unter schwarzem Fels.|Luz roja de lava bajo roca negra.|Une lumière de lave rouge sous la roche noire.|Luz vermelha de lava sob rocha negra.|Красный свет лавы под чёрным камнем.",
  },
  {
    slug: "sis-ormani", rarity: "rare", base: "#08120e", tint: "#a8d8bc", primary: "#2f8a5a", second: "#6aa88a",
    name: "Sis Ormanı|Misty Forest|Nebelwald|Bosque de niebla|Forêt brumeuse|Floresta enevoada|Туманный лес",
    desc: "Çam silüetlerinin arasında katman katman sis.|Layers of mist between pine silhouettes.|Nebelschichten zwischen Kiefernsilhouetten.|Capas de niebla entre siluetas de pinos.|Des couches de brume entre des silhouettes de pins.|Camadas de névoa entre silhuetas de pinheiros.|Слои тумана между силуэтами сосен.",
  },
  {
    slug: "neon-gece", rarity: "legendary", base: "#0a0618", tint: "#ff9ad1", primary: "#c81a6a", second: "#19c8d8",
    name: "Neon Gece|Neon Night|Neonnacht|Noche de neón|Nuit néon|Noite neon|Неоновая ночь",
    desc: "Pembe ve camgöbeği tabelalar, ıslak bir ufuk.|Pink and cyan signs over a wet horizon.|Pinke und cyane Schilder über nassem Horizont.|Letreros rosa y cian sobre un horizonte mojado.|Enseignes rose et cyan sur un horizon mouillé.|Letreiros rosa e ciano sobre um horizonte molhado.|Розовые и голубые вывески над мокрым горизонтом.",
  },
  {
    slug: "bal-isigi", rarity: "rare", base: "#150f06", tint: "#ffd98a", primary: "#a46e0c", second: "#e0a030",
    name: "Bal Işığı|Honey Light|Honiglicht|Luz de miel|Lumière de miel|Luz de mel|Медовый свет",
    desc: "Ağır, altın bir öğleden sonra ışığı.|A slow, golden afternoon light.|Ein langsames, goldenes Nachmittagslicht.|Una luz dorada y lenta de media tarde.|Une lente lumière dorée d'après-midi.|Uma luz dourada e lenta de fim de tarde.|Медленный золотой послеполуденный свет.",
  },
  {
    slug: "buzul-magarasi", rarity: "legendary", base: "#06141c", tint: "#b8ecff", primary: "#1a78a8", second: "#7ad8ff",
    name: "Buzul Mağarası|Ice Cave|Eishöhle|Cueva de hielo|Grotte de glace|Caverna de gelo|Ледяная пещера",
    desc: "Kesme buz duvarlarından süzülen soğuk ışık.|Cold light through cut ice walls.|Kaltes Licht durch geschliffene Eiswände.|Luz fría a través de muros de hielo tallado.|Une lumière froide à travers des murs de glace.|Luz fria atravessando paredes de gelo.|Холодный свет сквозь гранёные стены льда.",
  },
  {
    slug: "mavi-saat", rarity: "common", base: "#0a0f24", tint: "#a9bbff", primary: "#4a6be8", second: "#8f6bff",
    name: "Mavi Saat|Blue Hour|Blaue Stunde|Hora azul|Heure bleue|Hora azul|Синий час",
    desc: "Şehir ışıkları yanarken derin bir mavi.|Deep blue as the city lights come on.|Tiefes Blau, während die Stadtlichter angehen.|Azul profundo mientras se encienden las luces.|Un bleu profond quand la ville s'allume.|Azul profundo enquanto a cidade acende.|Глубокий синий, когда загораются огни города.",
  },
  {
    slug: "bordo-kadife", rarity: "rare", base: "#140609", tint: "#ffa8b8", primary: "#a01e3a", second: "#d4a050",
    name: "Bordo Kadife|Burgundy Velvet|Burgundersamt|Terciopelo burdeos|Velours bordeaux|Veludo bordô|Бордовый бархат",
    desc: "Kadife kıvrımlar ve ince bir altın ışık.|Velvet folds with a thin golden light.|Samtfalten mit feinem Goldlicht.|Pliegues de terciopelo con luz dorada.|Des plis de velours et une fine lumière dorée.|Dobras de veludo com uma luz dourada.|Бархатные складки и тонкий золотой свет.",
  },
  {
    slug: "yesim", rarity: "common", base: "#06120f", tint: "#9fe8c8", primary: "#1c8264", second: "#6fd0a8",
    name: "Yeşim|Jade|Jade|Jade|Jade|Jade|Нефрит",
    desc: "Pürüzsüz yeşim taşında yumuşak ışık.|Soft light on smooth jade stone.|Weiches Licht auf glattem Jadestein.|Luz suave sobre jade pulido.|Une lumière douce sur un jade lisse.|Luz suave sobre jade polido.|Мягкий свет на гладком нефрите.",
  },
  {
    slug: "grafit-cam", rarity: "common", base: "#0c0d10", tint: "#c8ced8", primary: "#4a6585", second: "#8a98ac",
    name: "Grafit Cam|Graphite Glass|Graphitglas|Cristal grafito|Verre graphite|Vidro grafite|Графитовое стекло",
    desc: "Sade, nötr ve çok okunaklı bir cam.|Plain, neutral and very readable glass.|Schlichtes, neutrales, gut lesbares Glas.|Cristal sobrio, neutro y muy legible.|Un verre sobre, neutre et très lisible.|Vidro sóbrio, neutro e muito legível.|Простое, нейтральное и очень читаемое стекло.",
  },
  {
    slug: "gece-gulu", rarity: "rare", base: "#140810", tint: "#ffb3cc", primary: "#b8336a", second: "#8a4fd6",
    name: "Gece Gülü|Night Rose|Nachtrose|Rosa nocturna|Rose de nuit|Rosa da noite|Ночная роза",
    desc: "Karanlıkta açan koyu gül ışıkları.|Deep rose lights blooming in the dark.|Tiefe Rosenlichter, die im Dunkeln blühen.|Luces rosa intenso que florecen en la oscuridad.|Des lueurs rose profond qui éclosent dans le noir.|Luzes rosa profundo florescendo no escuro.|Тёмно-розовые огни расцветают во тьме.",
  },
  {
    slug: "okyanus-dibi", rarity: "epic", base: "#020a14", tint: "#7fd8ff", primary: "#1a66c4", second: "#2ee6d6",
    name: "Okyanus Dibi|Abyss|Abgrund|Abismo|Abysse|Abismo|Бездна",
    desc: "Çok derinde parlayan canlı ışıklar.|Living lights glowing far below.|Lebende Lichter leuchten tief unten.|Luces vivas que brillan en lo profundo.|Des lumières vivantes luisent tout au fond.|Luzes vivas brilhando bem fundo.|Живые огни светятся глубоко внизу.",
  },
  {
    slug: "bakir-atolye", rarity: "rare", base: "#140c08", tint: "#f0b48a", primary: "#a85a24", second: "#3fa89a",
    name: "Bakır Atölye|Copper Workshop|Kupferwerkstatt|Taller de cobre|Atelier de cuivre|Oficina de cobre|Медная мастерская",
    desc: "Bakır ışığı ve patina yeşili gölgeler.|Copper light and verdigris shadows.|Kupferlicht und Schatten in Grünspan.|Luz de cobre y sombras de verdín.|Lumière cuivrée et ombres vert-de-gris.|Luz de cobre e sombras de azinhavre.|Медный свет и тени патины.",
  },
  {
    slug: "seftali-bulutu", rarity: "rare", base: "#160c0e", tint: "#ffc8b0", primary: "#c25834", second: "#e88aa0",
    name: "Şeftali Bulutu|Peach Cloud|Pfirsichwolke|Nube melocotón|Nuage pêche|Nuvem pêssego|Персиковое облако",
    desc: "Koyu zeminde yumuşak şeftali bulutları.|Soft peach clouds on a dark ground.|Weiche Pfirsichwolken auf dunklem Grund.|Nubes melocotón suaves sobre fondo oscuro.|De doux nuages pêche sur un fond sombre.|Nuvens pêssego suaves sobre fundo escuro.|Мягкие персиковые облака на тёмном фоне.",
  },
  {
    slug: "firtina-mavisi", rarity: "rare", base: "#080c14", tint: "#a8c0e8", primary: "#3560b0", second: "#7aa7ff",
    name: "Fırtına Mavisi|Storm Blue|Sturmblau|Azul tormenta|Bleu orage|Azul tempestade|Грозовой синий",
    desc: "Ağır bulut katmanları ve ince bir yağmur.|Heavy cloud layers and a fine rain.|Schwere Wolkenschichten und feiner Regen.|Capas de nubes densas y una lluvia fina.|De lourdes couches de nuages, une pluie fine.|Camadas pesadas de nuvens e chuva fina.|Тяжёлые слои облаков и мелкий дождь.",
  },
  {
    slug: "mor-nebula", rarity: "legendary", base: "#0a0618", tint: "#c6b7ff", primary: "#6238d0", second: "#d64fa8",
    name: "Mor Nebula|Violet Nebula|Violetter Nebel|Nebulosa violeta|Nébuleuse violette|Nebulosa violeta|Фиолетовая туманность",
    desc: "Pembe çekirdekli mor bir bulutsu ve yıldızlar.|A violet nebula with a pink core, and stars.|Ein violetter Nebel mit pinkem Kern und Sternen.|Una nebulosa violeta de núcleo rosa y estrellas.|Une nébuleuse violette au cœur rose, et des étoiles.|Uma nebulosa violeta de núcleo rosa e estrelas.|Фиолетовая туманность с розовым ядром и звёзды.",
  },
  {
    slug: "tayga", rarity: "rare", base: "#071210", tint: "#cfe8e0", primary: "#257054", second: "#9fd0ff",
    name: "Tayga|Taiga|Taiga|Taiga|Taïga|Taiga|Тайга",
    desc: "Kar serpintisi altında sıra sıra çamlar.|Rows of pines under falling snow.|Reihen von Kiefern unter fallendem Schnee.|Hileras de pinos bajo la nieve.|Des rangées de pins sous la neige.|Fileiras de pinheiros sob a neve.|Ряды сосен под падающим снегом.",
  },
  {
    slug: "ege-mavisi", rarity: "rare", base: "#04101c", tint: "#a8dcff", primary: "#1868b8", second: "#48b8e0",
    name: "Ege Mavisi|Aegean Blue|Ägäisblau|Azul Egeo|Bleu Égée|Azul Egeu|Эгейская синева",
    desc: "Berrak deniz mavisi ve beyaz bir ışık.|Clear sea blue with a white light.|Klares Meerblau mit weißem Licht.|Azul de mar claro con una luz blanca.|Un bleu de mer limpide et une lumière blanche.|Azul de mar claro com uma luz branca.|Чистая морская синева и белый свет.",
  },
  {
    slug: "kehribar-gece", rarity: "rare", base: "#120a04", tint: "#ffcf8a", primary: "#a85808", second: "#ff9a3c",
    name: "Kehribar Gece|Amber Night|Bernsteinnacht|Noche ámbar|Nuit d'ambre|Noite âmbar|Янтарная ночь",
    desc: "Karanlıkta asılı sıcak fener ışıkları.|Warm lantern lights hanging in the dark.|Warme Laternenlichter im Dunkeln.|Cálidas luces de farol en la oscuridad.|De chaudes lueurs de lanterne dans le noir.|Luzes quentes de lanterna no escuro.|Тёплые огни фонарей в темноте.",
  },
  {
    slug: "safir", rarity: "epic", base: "#050a1c", tint: "#9fb8ff", primary: "#2a48c8", second: "#6a8aff",
    name: "Safir|Sapphire|Saphir|Zafiro|Saphir|Safira|Сапфир",
    desc: "Kesme safir yüzeylerde derin mavi ışık.|Deep blue light across cut sapphire.|Tiefblaues Licht auf geschliffenem Saphir.|Luz azul profunda en zafiro tallado.|Une lumière bleu profond sur un saphir taillé.|Luz azul profunda em safira lapidada.|Глубокий синий свет на гранях сапфира.",
  },
  {
    slug: "yakut", rarity: "epic", base: "#14040a", tint: "#ff9fb0", primary: "#b8123a", second: "#ff5a7a",
    name: "Yakut|Ruby|Rubin|Rubí|Rubis|Rubi|Рубин",
    desc: "Kesme yakutun kızıl parıltısı.|The crimson fire of a cut ruby.|Das karmesinrote Feuer eines Rubins.|El fuego carmesí de un rubí tallado.|Le feu pourpre d'un rubis taillé.|O fogo carmesim de um rubi lapidado.|Багровый огонь гранёного рубина.",
  },
  {
    slug: "ametist", rarity: "epic", base: "#0e0618", tint: "#d8b8ff", primary: "#8030d0", second: "#c87aff",
    name: "Ametist|Amethyst|Amethyst|Amatista|Améthyste|Ametista|Аметист",
    desc: "Ametist kristallerinden süzülen mor ışık.|Violet light through amethyst crystals.|Violettes Licht durch Amethystkristalle.|Luz violeta a través de cristales de amatista.|Une lumière violette à travers l'améthyste.|Luz violeta através de cristais de ametista.|Фиолетовый свет сквозь кристаллы аметиста.",
  },
  {
    slug: "zumrut", rarity: "epic", base: "#04140c", tint: "#9fffc8", primary: "#127e44", second: "#49d17d",
    name: "Zümrüt|Emerald|Smaragd|Esmeralda|Émeraude|Esmeralda|Изумруд",
    desc: "Kesme zümrüt yüzeylerde yeşil ışık.|Green light across cut emerald.|Grünes Licht auf geschliffenem Smaragd.|Luz verde en esmeralda tallada.|Une lumière verte sur une émeraude taillée.|Luz verde em esmeralda lapidada.|Зелёный свет на гранях изумруда.",
  },
  {
    slug: "topaz", rarity: "epic", base: "#140e04", tint: "#ffe0a0", primary: "#9a660a", second: "#f2c230",
    name: "Topaz|Topaz|Topas|Topacio|Topaze|Topázio|Топаз",
    desc: "Altın topazın sıcak yüzeyleri.|The warm facets of golden topaz.|Die warmen Facetten des goldenen Topas.|Las cálidas facetas del topacio dorado.|Les facettes chaudes de la topaze dorée.|As facetas quentes do topázio dourado.|Тёплые грани золотого топаза.",
  },
  {
    slug: "prizma-sisi", rarity: "legendary", base: "#0c0a14", tint: "#e0d8ff", primary: "#7046d8", second: "#2ec8e0",
    name: "Prizma Sisi|Prism Haze|Prismendunst|Bruma prismática|Brume prismatique|Névoa prismática|Призменная дымка",
    desc: "Yanardöner renklerin yumuşakça karıştığı bir sis.|A haze where iridescent colours softly blend.|Ein Dunst, in dem schillernde Farben verschmelzen.|Una bruma donde se mezclan colores iridiscentes.|Une brume où se mêlent des couleurs irisées.|Uma névoa onde cores iridescentes se misturam.|Дымка, где мягко смешиваются радужные цвета.",
  },
  {
    slug: "siber-izgara", rarity: "epic", base: "#050816", tint: "#9ff0ff", primary: "#0d7e9a", second: "#d81b9a",
    name: "Siber Izgara|Cyber Grid|Cyberraster|Rejilla cibernética|Grille cyber|Grade cibernética|Кибер-сетка",
    desc: "Ufka uzanan parlak bir ızgara zemin.|A glowing grid floor that runs to the horizon.|Ein leuchtender Rasterboden bis zum Horizont.|Un suelo de rejilla luminosa hasta el horizonte.|Un sol quadrillé lumineux jusqu'à l'horizon.|Um piso de grade luminosa até o horizonte.|Светящийся пол-сетка до самого горизонта.",
  },
  {
    slug: "samanyolu", rarity: "legendary", base: "#05040e", tint: "#d8d0ff", primary: "#5244c8", second: "#e0b860",
    name: "Samanyolu|Milky Way|Milchstraße|Vía Láctea|Voie lactée|Via Láctea|Млечный Путь",
    desc: "Gökyüzünü çapraz kesen parlak bir yıldız kuşağı.|A bright band of stars crossing the sky.|Ein heller Sternengürtel quer über den Himmel.|Una franja brillante de estrellas cruza el cielo.|Une bande d'étoiles brillante traverse le ciel.|Uma faixa brilhante de estrelas cruza o céu.|Яркая полоса звёзд пересекает небо.",
  },
  {
    slug: "gun-batimi-okyanusu", rarity: "epic", base: "#120a18", tint: "#ffc0a8", primary: "#c0441e", second: "#8a4ad0",
    name: "Gün Batımı Okyanusu|Sunset Ocean|Abendmeer|Océano al ocaso|Océan au couchant|Oceano ao pôr do sol|Закатный океан",
    desc: "Turuncu güneş mor denize batar.|An orange sun sinks into a violet sea.|Eine orange Sonne sinkt ins violette Meer.|Un sol naranja se hunde en un mar violeta.|Un soleil orange plonge dans une mer violette.|Um sol laranja afunda num mar violeta.|Оранжевое солнце тонет в фиолетовом море.",
  },
  {
    slug: "kar-gecesi", rarity: "common", base: "#08101c", tint: "#dcecff", primary: "#3664b0", second: "#9fc8ff",
    name: "Kar Gecesi|Snow Night|Schneenacht|Noche de nieve|Nuit de neige|Noite de neve|Снежная ночь",
    desc: "Sessiz bir gecede yağan yumuşak kar.|Soft snow falling on a quiet night.|Weicher Schnee in einer stillen Nacht.|Nieve suave en una noche tranquila.|Une neige douce par une nuit calme.|Neve suave numa noite tranquila.|Мягкий снег тихой ночью.",
  },
  {
    slug: "espresso", rarity: "common", base: "#120c08", tint: "#e8cbb0", primary: "#8a5228", second: "#d4a070",
    name: "Espresso|Espresso|Espresso|Espresso|Espresso|Espresso|Эспрессо",
    desc: "Sıcak, koyu ve sakin bir kahve tonu.|A warm, dark and calm coffee tone.|Ein warmer, dunkler, ruhiger Kaffeeton.|Un tono café cálido, oscuro y sereno.|Une teinte café chaude, sombre et calme.|Um tom de café quente, escuro e calmo.|Тёплый, тёмный и спокойный кофейный тон.",
  },
  {
    slug: "gece-bahcesi", rarity: "rare", base: "#08120c", tint: "#b8e8c8", primary: "#257a50", second: "#e870a8",
    name: "Gece Bahçesi|Night Garden|Nachtgarten|Jardín nocturno|Jardin de nuit|Jardim noturno|Ночной сад",
    desc: "Koyu yeşil yaprakların arasında pembe çiçek ışıkları.|Pink flower lights among dark green leaves.|Rosa Blütenlichter zwischen dunkelgrünen Blättern.|Luces de flores rosa entre hojas verde oscuro.|Des lueurs de fleurs roses parmi des feuilles vert sombre.|Luzes de flores rosa entre folhas verde-escuras.|Розовые огни цветов среди тёмной листвы.",
  },
  {
    slug: "elektrik-mavisi", rarity: "epic", base: "#040a1c", tint: "#9fd0ff", primary: "#0d62d0", second: "#2ee0ff",
    name: "Elektrik Mavisi|Electric Blue|Elektrikblau|Azul eléctrico|Bleu électrique|Azul elétrico|Электрик",
    desc: "Canlı mavi ve ince elektrik arkları.|Vivid blue with thin electric arcs.|Lebhaftes Blau mit feinen Lichtbögen.|Azul vivo con finos arcos eléctricos.|Un bleu vif et de fins arcs électriques.|Azul vivo com arcos elétricos finos.|Яркий синий и тонкие электрические дуги.",
  },
  {
    slug: "sedef", rarity: "legendary", base: "#0e1014", tint: "#f0e8f0", primary: "#6e5ea8", second: "#e8a0b8",
    name: "Sedef|Mother of Pearl|Perlmutt|Nácar|Nacre|Madrepérola|Перламутр",
    desc: "Koyu zeminde sedef gibi yanardöner pastel ışık.|Pearly iridescent pastels on a dark ground.|Perlmuttartige Pastelltöne auf dunklem Grund.|Pasteles nacarados e iridiscentes sobre fondo oscuro.|Des pastels nacrés et irisés sur fond sombre.|Pastéis perolados e iridescentes sobre fundo escuro.|Перламутровые пастели на тёмном фоне.",
  },
  {
    slug: "karbon", rarity: "common", base: "#0a0a0b", tint: "#d0d0d4", primary: "#c0500c", second: "#8a8a90",
    name: "Karbon|Carbon|Carbon|Carbono|Carbone|Carbono|Карбон",
    desc: "Karbon örgü dokusu ve turuncu bir vurgu.|Carbon weave texture with an orange accent.|Carbongewebe mit orangem Akzent.|Textura de fibra de carbono con acento naranja.|Une texture carbone et un accent orange.|Textura de fibra de carbono com destaque laranja.|Карбоновое плетение и оранжевый акцент.",
  },
];

module.exports = { THEME: T };
