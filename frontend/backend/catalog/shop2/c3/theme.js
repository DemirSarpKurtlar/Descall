"use strict";

/**
 * theme: 38 dark glass themes. Each gives a palette (the builder derives the
 * design tokens and both Liquid Glass palettes from it, with contrast checks)
 * and a still scene painted behind the glass (no motion: a theme is on screen
 * all day, see the idle CPU rule). The shop swatch shows the same scene with
 * a small glass window, an incoming bubble and an own bubble in the accent.
 *   base    deepest background     tint   hue for surfaces, borders, text
 *   primary accent (buttons)       second second ambient light
 *   scene   background layers (top first), images only
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");

const glow = (x, y, w, h, c, a) => `radial-gradient(${w}% ${h}% at ${x}% ${y}%, ${rgba(c, a)}, transparent 70%)`;
const band = (deg, from, to, c, a) => `linear-gradient(${deg}deg, transparent ${from}%, ${rgba(c, a)} ${(from + to) / 2}%, transparent ${to}%)`;
const vert = (stops) => `linear-gradient(180deg, ${stops})`;
let seed = 1;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
/** Star field: n dots in the top `h` percent. */
function stars(n, c = "#ffffff", h = 60, s = 3) {
  seed = s;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const x = (rnd() * 98 + 1).toFixed(1);
    const y = (rnd() * h + 1).toFixed(1);
    const r = (0.6 + rnd() * 0.8).toFixed(1);
    out.push(`radial-gradient(circle at ${x}% ${y}%, ${rgba(c, 0.55 + rnd() * 0.4)} 0 ${r}px, transparent ${(Number(r) + 0.8).toFixed(1)}px)`);
  }
  return out.join(", ");
}
/** Soft bokeh discs. */
function bokeh(list) {
  return list.map(([x, y, r, c, a]) => `radial-gradient(circle at ${x}% ${y}%, ${rgba(c, a)} 0 ${r}px, ${rgba(c, a * 0.35)} ${r + 1.5}px, transparent ${r + 3}px)`).join(", ");
}
/** Gem facets fanning from a point. */
function facets(x, y, colors, a = 0.22, from = 0) {
  const stops = [];
  let d = 0;
  colors.forEach((c, i) => {
    const w = 5 + ((i * 37) % 9);
    const gap = 3 + ((i * 17) % 7);
    stops.push(`${rgba(c, i % 2 ? a : a * 0.45)} ${d}deg ${d + w}deg`, `transparent ${d + w}deg ${d + w + gap}deg`);
    d += gap;
    d += w;
  });
  stops.push(`transparent ${d}deg`);
  return `conic-gradient(from ${from}deg at ${x}% ${y}%, ${stops.join(", ")})`;
}

const T = [
  {
    slug: "kutup-gecesi", rarity: "legendary", base: "#04121a", tint: "#6effc7", primary: "#0e8a6c", second: "#6a5cff",
    name: "Kutup Gecesi|Polar Night|Polarnacht|Noche polar|Nuit polaire|Noite polar|Полярная ночь",
    desc: "Yıldızlı gökte yeşil ve mor kutup ışıkları.|Green and violet aurora in a starry sky.|Grünes und violettes Polarlicht am Sternenhimmel.|Aurora verde y violeta en un cielo estrellado.|Aurore verte et violette dans un ciel étoilé.|Aurora verde e violeta num céu estrelado.|Зелёное и фиолетовое сияние в звёздном небе.",
    scene: [band(172, 8, 34, "#6effc7", 0.3), band(186, 26, 52, "#8f7bff", 0.26), band(168, 44, 66, "#14a37f", 0.2), stars(26, "#e6fff5", 40, 3), vert("#03101a, #052028 60%, #04121a")],
  },
  {
    slug: "ay-isigi-korfezi", rarity: "epic", base: "#060d1c", tint: "#9fc0ff", primary: "#3d6fe0", second: "#7aa7ff",
    name: "Ay Işığı Körfezi|Moonlit Bay|Mondbucht|Bahía de luna|Baie au clair de lune|Baía ao luar|Лунный залив",
    desc: "Durgun suda gümüş bir ay yolu.|A silver moon path on still water.|Ein silberner Mondpfad auf stillem Wasser.|Un camino de luna plateado sobre agua quieta.|Un chemin de lune argenté sur l'eau calme.|Um caminho de luar prateado na água parada.|Серебряная лунная дорожка на тихой воде.",
    scene: [`radial-gradient(circle at 76% 22%, #f0f5ff 0 2.6%, ${rgba("#c8d8ff", 0.3)} 3.2%, transparent 12%)`, `linear-gradient(90deg, transparent 72%, ${rgba("#c8d8ff", 0.18)} 75%, ${rgba("#c8d8ff", 0.26)} 76%, ${rgba("#c8d8ff", 0.18)} 77%, transparent 80%) 0 100% / 100% 40% no-repeat`, glow(50, 62, 80, 10, "#3d6fe0", 0.18), stars(16, "#dfe8ff", 45, 7), vert("#0a1530, #08122a 60%, #050b1a 60.5%, #060d1c")],
  },
  {
    slug: "col-safagi", rarity: "rare", base: "#170d09", tint: "#ffc49a", primary: "#c2562a", second: "#e8a04a",
    name: "Çöl Şafağı|Desert Dawn|Wüstenmorgen|Amanecer en el desierto|Aube du désert|Aurora no deserto|Рассвет в пустыне",
    desc: "Kum tepelerinin ardından doğan sıcak bir ışık.|Warm light rising behind the dunes.|Warmes Licht hinter den Dünen.|Luz cálida que nace tras las dunas.|Une lumière chaude se lève derrière les dunes.|Luz quente nascendo atrás das dunas.|Тёплый свет встаёт из-за дюн.",
    scene: ["radial-gradient(70% 26% at 24% 104%, #2a160c 0 60%, transparent 61%)", "radial-gradient(80% 30% at 82% 108%, #3a1e10 0 60%, transparent 61%)", glow(50, 72, 80, 26, "#ff9a5a", 0.4), glow(30, 20, 40, 30, "#e8a04a", 0.12), vert("#1a0e12, #3a1a14 50%, #6a2e18 72%, #1a0d08")],
  },
  {
    slug: "lavanta-tarlasi", rarity: "rare", base: "#120c1e", tint: "#c7a8ff", primary: "#7a4fd6", second: "#d67ab8",
    name: "Lavanta Tarlası|Lavender Field|Lavendelfeld|Campo de lavanda|Champ de lavande|Campo de lavanda|Лавандовое поле",
    desc: "Alacakaranlıkta mor sıralar ve pembe bir ufuk.|Violet rows at dusk under a pink horizon.|Violette Reihen in der Dämmerung, rosa Horizont.|Hileras violetas al anochecer y horizonte rosa.|Des rangs violets au crépuscule, horizon rose.|Fileiras violetas ao entardecer e horizonte rosa.|Фиолетовые ряды в сумерках и розовый горизонт.",
    scene: [`repeating-linear-gradient(100deg, ${rgba("#9a6ae0", 0.16)} 0 3px, transparent 3px 26px) 0 100% / 100% 34% no-repeat`, glow(50, 66, 90, 14, "#d67ab8", 0.35), glow(80, 10, 40, 30, "#7a4fd6", 0.2), vert("#1a1030, #2a1640 55%, #4a2050 66%, #160e24 67%, #120c1e")],
  },
  {
    slug: "derin-mercan", rarity: "epic", base: "#071419", tint: "#7fe8e0", primary: "#c42d63", second: "#19a8a0",
    name: "Derin Mercan|Deep Reef|Tiefes Riff|Arrecife profundo|Récif profond|Recife profundo|Глубокий риф",
    desc: "Turkuaz suyun dibinde parlayan mercanlar.|Corals glowing at the bottom of teal water.|Korallen leuchten am Grund des türkisen Wassers.|Corales que brillan en el fondo del agua turquesa.|Des coraux luisent au fond de l'eau sarcelle.|Corais brilhando no fundo da água turquesa.|Кораллы светятся на дне бирюзовой воды.",
    scene: [glow(18, 96, 30, 16, "#ff6f9a", 0.4), glow(64, 100, 34, 14, "#d6336c", 0.35), glow(88, 94, 18, 12, "#ffb36b", 0.26), `repeating-linear-gradient(104deg, ${rgba("#9ff0ff", 0)} 0 50px, ${rgba("#9ff0ff", 0.05)} 50px 80px, ${rgba("#9ff0ff", 0)} 80px 140px)`, glow(50, -10, 90, 40, "#19a8a0", 0.3), vert("#0a2a30, #071a20 60%, #071419")],
  },
  {
    slug: "volkan", rarity: "epic", base: "#0e0606", tint: "#ff9a7a", primary: "#b8301a", second: "#ff8a1f",
    name: "Volkan|Volcano|Vulkan|Volcán|Volcan|Vulcão|Вулкан",
    desc: "Kara kayanın altından kızıl bir lav ışığı.|Red lava light under black rock.|Rotes Lavalicht unter schwarzem Fels.|Luz roja de lava bajo roca negra.|Une lumière de lave rouge sous la roche noire.|Luz vermelha de lava sob rocha negra.|Красный свет лавы под чёрным камнем.",
    scene: [band(176, 82, 86, "#ff6a1f", 0.3), band(186, 88, 92, "#ffb000", 0.22), glow(50, 108, 90, 36, "#ff3d00", 0.45), glow(20, 0, 40, 30, "#5a0e0e", 0.4), vert("#140808, #0e0606 70%, #1a0806")],
  },
  {
    slug: "sis-ormani", rarity: "rare", base: "#08120e", tint: "#a8d8bc", primary: "#2f8a5a", second: "#6aa88a",
    name: "Sis Ormanı|Misty Forest|Nebelwald|Bosque de niebla|Forêt brumeuse|Floresta enevoada|Туманный лес",
    desc: "Çam silüetlerinin arasında katman katman sis.|Layers of mist between pine silhouettes.|Nebelschichten zwischen Kiefernsilhouetten.|Capas de niebla entre siluetas de pinos.|Des couches de brume entre des silhouettes de pins.|Camadas de névoa entre silhuetas de pinheiros.|Слои тумана между силуэтами сосен.",
    scene: ["conic-gradient(from 160deg at 8% 56%, transparent 0deg, #06110c 0deg 40deg, transparent 40deg)", "conic-gradient(from 160deg at 88% 52%, transparent 0deg, #06110c 0deg 40deg, transparent 40deg)", glow(50, 70, 100, 12, "#cfe8dc", 0.12), glow(40, 50, 80, 10, "#cfe8dc", 0.1), vert("#0e1e18, #0b1814 60%, #08120e")],
  },
  {
    slug: "neon-gece", rarity: "legendary", base: "#0a0618", tint: "#ff9ad1", primary: "#c81a6a", second: "#19c8d8",
    name: "Neon Gece|Neon Night|Neonnacht|Noche de neón|Nuit néon|Noite neon|Неоновая ночь",
    desc: "Pembe ve camgöbeği tabelalar, ıslak bir ufuk.|Pink and cyan signs over a wet horizon.|Pinke und cyane Schilder über nassem Horizont.|Letreros rosa y cian sobre un horizonte mojado.|Enseignes rose et cyan sur un horizon mouillé.|Letreiros rosa e ciano sobre um horizonte molhado.|Розовые и голубые вывески над мокрым горизонтом.",
    scene: [glow(18, 30, 24, 14, "#ff2e88", 0.4), glow(82, 24, 20, 12, "#2ef2ff", 0.35), glow(50, 80, 80, 16, "#ff2e88", 0.16), `repeating-linear-gradient(180deg, ${rgba("#ffffff", 0)} 0 6px, ${rgba("#ffffff", 0.03)} 6px 7px) 0 100% / 100% 30% no-repeat`, vert("#120a2a, #0a0618 70%, #14082a 70.5%, #0a0618")],
  },
  {
    slug: "bal-isigi", rarity: "rare", base: "#150f06", tint: "#ffd98a", primary: "#a46e0c", second: "#e0a030",
    name: "Bal Işığı|Honey Light|Honiglicht|Luz de miel|Lumière de miel|Luz de mel|Медовый свет",
    desc: "Ağır, altın bir öğleden sonra ışığı.|A slow, golden afternoon light.|Ein langsames, goldenes Nachmittagslicht.|Una luz dorada y lenta de media tarde.|Une lente lumière dorée d'après-midi.|Uma luz dourada e lenta de fim de tarde.|Медленный золотой послеполуденный свет.",
    scene: [`repeating-linear-gradient(118deg, ${rgba("#ffd98a", 0)} 0 70px, ${rgba("#ffd98a", 0.05)} 70px 110px, ${rgba("#ffd98a", 0)} 110px 190px)`, glow(20, 10, 50, 40, "#e0a030", 0.3), glow(80, 90, 50, 30, "#a46e0c", 0.25), vert("#1e1608, #150f06")],
  },
  {
    slug: "buzul-magarasi", rarity: "legendary", base: "#06141c", tint: "#b8ecff", primary: "#1a78a8", second: "#7ad8ff",
    name: "Buzul Mağarası|Ice Cave|Eishöhle|Cueva de hielo|Grotte de glace|Caverna de gelo|Ледяная пещера",
    desc: "Kesme buz duvarlarından süzülen soğuk ışık.|Cold light through cut ice walls.|Kaltes Licht durch geschliffene Eiswände.|Luz fría a través de muros de hielo tallado.|Une lumière froide à travers des murs de glace.|Luz fria atravessando paredes de gelo.|Холодный свет сквозь гранёные стены льда.",
    scene: [facets(0, 100, ["#b8ecff", "#3a8fb7", "#e8f9ff", "#2a6f92", "#7ad8ff", "#ffffff"], 0.2, 0), facets(100, 0, ["#7ad8ff", "#e8f9ff", "#3a8fb7", "#b8ecff", "#ffffff"], 0.16, 180), glow(50, 40, 60, 40, "#7ad8ff", 0.16), vert("#0a2230, #06141c")],
  },
  {
    slug: "mavi-saat", rarity: "common", base: "#0a0f24", tint: "#a9bbff", primary: "#4a6be8", second: "#8f6bff",
    name: "Mavi Saat|Blue Hour|Blaue Stunde|Hora azul|Heure bleue|Hora azul|Синий час",
    desc: "Şehir ışıkları yanarken derin bir mavi.|Deep blue as the city lights come on.|Tiefes Blau, während die Stadtlichter angehen.|Azul profundo mientras se encienden las luces.|Un bleu profond quand la ville s'allume.|Azul profundo enquanto a cidade acende.|Глубокий синий, когда загораются огни города.",
    scene: [stars(22, "#ffd98a", 10, 11).replace(/at ([\d.]+)% ([\d.]+)%/g, (m, x, y) => `at ${x}% ${(88 + Number(y)).toFixed(1)}%`), glow(50, 92, 100, 18, "#8f6bff", 0.22), glow(20, 0, 50, 40, "#587af5", 0.25), vert("#0e1636, #0a0f24 80%, #0c1028")],
  },
  {
    slug: "bordo-kadife", rarity: "rare", base: "#140609", tint: "#ffa8b8", primary: "#a01e3a", second: "#d4a050",
    name: "Bordo Kadife|Burgundy Velvet|Burgundersamt|Terciopelo burdeos|Velours bordeaux|Veludo bordô|Бордовый бархат",
    desc: "Kadife kıvrımlar ve ince bir altın ışık.|Velvet folds with a thin golden light.|Samtfalten mit feinem Goldlicht.|Pliegues de terciopelo con luz dorada.|Des plis de velours et une fine lumière dorée.|Dobras de veludo com uma luz dourada.|Бархатные складки и тонкий золотой свет.",
    scene: [`repeating-linear-gradient(90deg, ${rgba("#000000", 0.18)} 0 30px, ${rgba("#ff8aa0", 0.04)} 60px, ${rgba("#000000", 0.18)} 90px)`, glow(50, 0, 80, 30, "#d4a050", 0.16), glow(50, 100, 80, 40, "#a01e3a", 0.3), vert("#200a10, #140609")],
  },
  {
    slug: "yesim", rarity: "common", base: "#06120f", tint: "#9fe8c8", primary: "#1c8264", second: "#6fd0a8",
    name: "Yeşim|Jade|Jade|Jade|Jade|Jade|Нефрит",
    desc: "Pürüzsüz yeşim taşında yumuşak ışık.|Soft light on smooth jade stone.|Weiches Licht auf glattem Jadestein.|Luz suave sobre jade pulido.|Une lumière douce sur un jade lisse.|Luz suave sobre jade polido.|Мягкий свет на гладком нефрите.",
    scene: [glow(30, 30, 50, 40, "#6fd0a8", 0.18), glow(76, 70, 50, 40, "#1c8264", 0.25), vert("#0a1c17, #06120f")],
  },
  {
    slug: "grafit-cam", rarity: "common", base: "#0c0d10", tint: "#c8ced8", primary: "#4a6585", second: "#8a98ac",
    name: "Grafit Cam|Graphite Glass|Graphitglas|Cristal grafito|Verre graphite|Vidro grafite|Графитовое стекло",
    desc: "Sade, nötr ve çok okunaklı bir cam.|Plain, neutral and very readable glass.|Schlichtes, neutrales, gut lesbares Glas.|Cristal sobrio, neutro y muy legible.|Un verre sobre, neutre et très lisible.|Vidro sóbrio, neutro e muito legível.|Простое, нейтральное и очень читаемое стекло.",
    scene: [band(120, 30, 60, "#ffffff", 0.05), glow(80, 10, 50, 40, "#8a98ac", 0.1), vert("#15171c, #0c0d10")],
  },
  {
    slug: "gece-gulu", rarity: "rare", base: "#140810", tint: "#ffb3cc", primary: "#b8336a", second: "#8a4fd6",
    name: "Gece Gülü|Night Rose|Nachtrose|Rosa nocturna|Rose de nuit|Rosa da noite|Ночная роза",
    desc: "Karanlıkta açan koyu gül ışıkları.|Deep rose lights blooming in the dark.|Tiefe Rosenlichter, die im Dunkeln blühen.|Luces rosa intenso que florecen en la oscuridad.|Des lueurs rose profond qui éclosent dans le noir.|Luzes rosa profundo florescendo no escuro.|Тёмно-розовые огни расцветают во тьме.",
    scene: [bokeh([[14, 24, 30, "#ff8fb0", 0.12], [80, 70, 44, "#c2386e", 0.14], [64, 18, 20, "#ffb3cc", 0.1]]), glow(20, 90, 50, 30, "#8a4fd6", 0.22), vert("#1e0c18, #140810")],
  },
  {
    slug: "okyanus-dibi", rarity: "epic", base: "#020a14", tint: "#7fd8ff", primary: "#1a66c4", second: "#2ee6d6",
    name: "Okyanus Dibi|Abyss|Abgrund|Abismo|Abysse|Abismo|Бездна",
    desc: "Çok derinde parlayan canlı ışıklar.|Living lights glowing far below.|Lebende Lichter leuchten tief unten.|Luces vivas que brillan en lo profundo.|Des lumières vivantes luisent tout au fond.|Luzes vivas brilhando bem fundo.|Живые огни светятся глубоко внизу.",
    scene: [stars(30, "#5fe8ff", 100, 21), glow(30, 70, 30, 20, "#2ee6d6", 0.12), glow(70, 40, 30, 20, "#1a66c4", 0.16), vert("#04142a, #020a14 70%, #01060c")],
  },
  {
    slug: "bakir-atolye", rarity: "rare", base: "#140c08", tint: "#f0b48a", primary: "#a85a24", second: "#3fa89a",
    name: "Bakır Atölye|Copper Workshop|Kupferwerkstatt|Taller de cobre|Atelier de cuivre|Oficina de cobre|Медная мастерская",
    desc: "Bakır ışığı ve patina yeşili gölgeler.|Copper light and verdigris shadows.|Kupferlicht und Schatten in Grünspan.|Luz de cobre y sombras de verdín.|Lumière cuivrée et ombres vert-de-gris.|Luz de cobre e sombras de azinhavre.|Медный свет и тени патины.",
    scene: [glow(20, 20, 50, 40, "#e08a4a", 0.25), glow(84, 84, 50, 40, "#3fa89a", 0.2), band(135, 40, 60, "#f0b48a", 0.05), vert("#1c120c, #140c08")],
  },
  {
    slug: "seftali-bulutu", rarity: "rare", base: "#160c0e", tint: "#ffc8b0", primary: "#c25834", second: "#e88aa0",
    name: "Şeftali Bulutu|Peach Cloud|Pfirsichwolke|Nube melocotón|Nuage pêche|Nuvem pêssego|Персиковое облако",
    desc: "Koyu zeminde yumuşak şeftali bulutları.|Soft peach clouds on a dark ground.|Weiche Pfirsichwolken auf dunklem Grund.|Nubes melocotón suaves sobre fondo oscuro.|De doux nuages pêche sur un fond sombre.|Nuvens pêssego suaves sobre fundo escuro.|Мягкие персиковые облака на тёмном фоне.",
    scene: [glow(26, 30, 46, 22, "#ffb08a", 0.22), glow(70, 56, 50, 24, "#e88aa0", 0.2), glow(40, 84, 60, 20, "#c25834", 0.2), vert("#20120f, #160c0e")],
  },
  {
    slug: "firtina-mavisi", rarity: "rare", base: "#080c14", tint: "#a8c0e8", primary: "#3560b0", second: "#7aa7ff",
    name: "Fırtına Mavisi|Storm Blue|Sturmblau|Azul tormenta|Bleu orage|Azul tempestade|Грозовой синий",
    desc: "Ağır bulut katmanları ve ince bir yağmur.|Heavy cloud layers and a fine rain.|Schwere Wolkenschichten und feiner Regen.|Capas de nubes densas y una lluvia fina.|De lourdes couches de nuages, une pluie fine.|Camadas pesadas de nuvens e chuva fina.|Тяжёлые слои облаков и мелкий дождь.",
    scene: [`repeating-linear-gradient(76deg, ${rgba("#c8d8ff", 0.04)} 0 1px, transparent 1px 18px)`, glow(24, 16, 50, 16, "#46557c", 0.6), glow(74, 26, 50, 16, "#323e5e", 0.6), glow(50, 0, 80, 20, "#7aa7ff", 0.12), vert("#0e1424, #080c14")],
  },
  {
    slug: "mor-nebula", rarity: "legendary", base: "#0a0618", tint: "#c6b7ff", primary: "#6238d0", second: "#d64fa8",
    name: "Mor Nebula|Violet Nebula|Violetter Nebel|Nebulosa violeta|Nébuleuse violette|Nebulosa violeta|Фиолетовая туманность",
    desc: "Pembe çekirdekli mor bir bulutsu ve yıldızlar.|A violet nebula with a pink core, and stars.|Ein violetter Nebel mit pinkem Kern und Sternen.|Una nebulosa violeta de núcleo rosa y estrellas.|Une nébuleuse violette au cœur rose, et des étoiles.|Uma nebulosa violeta de núcleo rosa e estrelas.|Фиолетовая туманность с розовым ядром и звёзды.",
    scene: [glow(60, 40, 40, 30, "#d64fa8", 0.28), glow(40, 50, 60, 44, "#6238d0", 0.35), glow(70, 70, 30, 26, "#2ec8e0", 0.12), stars(30, "#e6dcff", 98, 31), vert("#0e0820, #0a0618")],
  },
  {
    slug: "tayga", rarity: "rare", base: "#071210", tint: "#cfe8e0", primary: "#257054", second: "#9fd0ff",
    name: "Tayga|Taiga|Taiga|Taiga|Taïga|Taiga|Тайга",
    desc: "Kar serpintisi altında sıra sıra çamlar.|Rows of pines under falling snow.|Reihen von Kiefern unter fallendem Schnee.|Hileras de pinos bajo la nieve.|Des rangées de pins sous la neige.|Fileiras de pinheiros sob a neve.|Ряды сосен под падающим снегом.",
    scene: [stars(28, "#ffffff", 95, 41), "conic-gradient(from 162deg at 14% 62%, transparent 0deg, #05100d 0deg 36deg, transparent 36deg)", "conic-gradient(from 162deg at 30% 68%, transparent 0deg, #071612 0deg 36deg, transparent 36deg)", "conic-gradient(from 162deg at 84% 60%, transparent 0deg, #05100d 0deg 36deg, transparent 36deg)", glow(50, 0, 80, 30, "#9fd0ff", 0.12), vert("#0c1c1a, #071210")],
  },
  {
    slug: "ege-mavisi", rarity: "rare", base: "#04101c", tint: "#a8dcff", primary: "#1868b8", second: "#48b8e0",
    name: "Ege Mavisi|Aegean Blue|Ägäisblau|Azul Egeo|Bleu Égée|Azul Egeu|Эгейская синева",
    desc: "Berrak deniz mavisi ve beyaz bir ışık.|Clear sea blue with a white light.|Klares Meerblau mit weißem Licht.|Azul de mar claro con una luz blanca.|Un bleu de mer limpide et une lumière blanche.|Azul de mar claro com uma luz branca.|Чистая морская синева и белый свет.",
    scene: [glow(70, 10, 50, 30, "#ffffff", 0.12), `repeating-linear-gradient(180deg, ${rgba("#a8dcff", 0)} 0 10px, ${rgba("#a8dcff", 0.04)} 10px 12px) 0 100% / 100% 45% no-repeat`, glow(40, 80, 70, 30, "#48b8e0", 0.22), vert("#08203a, #04101c")],
  },
  {
    slug: "kehribar-gece", rarity: "rare", base: "#120a04", tint: "#ffcf8a", primary: "#a85808", second: "#ff9a3c",
    name: "Kehribar Gece|Amber Night|Bernsteinnacht|Noche ámbar|Nuit d'ambre|Noite âmbar|Янтарная ночь",
    desc: "Karanlıkta asılı sıcak fener ışıkları.|Warm lantern lights hanging in the dark.|Warme Laternenlichter im Dunkeln.|Cálidas luces de farol en la oscuridad.|De chaudes lueurs de lanterne dans le noir.|Luzes quentes de lanterna no escuro.|Тёплые огни фонарей в темноте.",
    scene: [bokeh([[16, 22, 6, "#ffcf8a", 0.5], [34, 14, 4, "#ff9a3c", 0.45], [62, 20, 5, "#ffcf8a", 0.45], [84, 12, 6, "#ff9a3c", 0.5]]), glow(16, 22, 16, 14, "#ff9a3c", 0.25), glow(84, 12, 16, 14, "#ff9a3c", 0.25), vert("#1a0e06, #120a04")],
  },
  {
    slug: "safir", rarity: "epic", base: "#050a1c", tint: "#9fb8ff", primary: "#2a48c8", second: "#6a8aff",
    name: "Safir|Sapphire|Saphir|Zafiro|Saphir|Safira|Сапфир",
    desc: "Kesme safir yüzeylerde derin mavi ışık.|Deep blue light across cut sapphire.|Tiefblaues Licht auf geschliffenem Saphir.|Luz azul profunda en zafiro tallado.|Une lumière bleu profond sur un saphir taillé.|Luz azul profunda em safira lapidada.|Глубокий синий свет на гранях сапфира.",
    scene: [facets(85, 0, ["#9fb8ff", "#2a48c8", "#e0e8ff", "#1a2a80", "#6a8aff"], 0.24, 180), facets(10, 100, ["#6a8aff", "#e0e8ff", "#2a48c8", "#9fb8ff"], 0.18, 0), glow(50, 50, 60, 50, "#2a48c8", 0.2), vert("#0a1230, #050a1c")],
  },
  {
    slug: "yakut", rarity: "epic", base: "#14040a", tint: "#ff9fb0", primary: "#b8123a", second: "#ff5a7a",
    name: "Yakut|Ruby|Rubin|Rubí|Rubis|Rubi|Рубин",
    desc: "Kesme yakutun kızıl parıltısı.|The crimson fire of a cut ruby.|Das karmesinrote Feuer eines Rubins.|El fuego carmesí de un rubí tallado.|Le feu pourpre d'un rubis taillé.|O fogo carmesim de um rubi lapidado.|Багровый огонь гранёного рубина.",
    scene: [facets(90, 10, ["#ff9fb0", "#b8123a", "#ffd6de", "#6a0820", "#ff5a7a"], 0.24, 190), facets(0, 90, ["#ff5a7a", "#ffd6de", "#b8123a"], 0.16, 10), glow(50, 50, 60, 50, "#b8123a", 0.2), vert("#200810, #14040a")],
  },
  {
    slug: "ametist", rarity: "epic", base: "#0e0618", tint: "#d8b8ff", primary: "#8030d0", second: "#c87aff",
    name: "Ametist|Amethyst|Amethyst|Amatista|Améthyste|Ametista|Аметист",
    desc: "Ametist kristallerinden süzülen mor ışık.|Violet light through amethyst crystals.|Violettes Licht durch Amethystkristalle.|Luz violeta a través de cristales de amatista.|Une lumière violette à travers l'améthyste.|Luz violeta através de cristais de ametista.|Фиолетовый свет сквозь кристаллы аметиста.",
    scene: [facets(50, 108, ["#d8b8ff", "#8030d0", "#f0e0ff", "#4a1880", "#c87aff", "#8030d0"], 0.22, 280), glow(50, 20, 60, 40, "#c87aff", 0.16), vert("#160a26, #0e0618")],
  },
  {
    slug: "zumrut", rarity: "epic", base: "#04140c", tint: "#9fffc8", primary: "#127e44", second: "#49d17d",
    name: "Zümrüt|Emerald|Smaragd|Esmeralda|Émeraude|Esmeralda|Изумруд",
    desc: "Kesme zümrüt yüzeylerde yeşil ışık.|Green light across cut emerald.|Grünes Licht auf geschliffenem Smaragd.|Luz verde en esmeralda tallada.|Une lumière verte sur une émeraude taillée.|Luz verde em esmeralda lapidada.|Зелёный свет на гранях изумруда.",
    scene: [facets(0, 0, ["#9fffc8", "#127e44", "#e0fff0", "#0a4a28", "#49d17d"], 0.22, 90), facets(100, 100, ["#49d17d", "#e0fff0", "#127e44"], 0.16, 270), glow(50, 50, 60, 50, "#127e44", 0.2), vert("#082018, #04140c")],
  },
  {
    slug: "topaz", rarity: "epic", base: "#140e04", tint: "#ffe0a0", primary: "#9a660a", second: "#f2c230",
    name: "Topaz|Topaz|Topas|Topacio|Topaze|Topázio|Топаз",
    desc: "Altın topazın sıcak yüzeyleri.|The warm facets of golden topaz.|Die warmen Facetten des goldenen Topas.|Las cálidas facetas del topacio dorado.|Les facettes chaudes de la topaze dorée.|As facetas quentes do topázio dourado.|Тёплые грани золотого топаза.",
    scene: [facets(100, 0, ["#ffe0a0", "#9a660a", "#fff3c4", "#5a3a04", "#f2c230"], 0.22, 180), facets(0, 100, ["#f2c230", "#fff3c4", "#9a660a"], 0.16, 0), glow(50, 50, 60, 50, "#9a660a", 0.18), vert("#1e1608, #140e04")],
  },
  {
    slug: "prizma-sisi", rarity: "legendary", base: "#0c0a14", tint: "#e0d8ff", primary: "#7046d8", second: "#2ec8e0",
    name: "Prizma Sisi|Prism Haze|Prismendunst|Bruma prismática|Brume prismatique|Névoa prismática|Призменная дымка",
    desc: "Yanardöner renklerin yumuşakça karıştığı bir sis.|A haze where iridescent colours softly blend.|Ein Dunst, in dem schillernde Farben verschmelzen.|Una bruma donde se mezclan colores iridiscentes.|Une brume où se mêlent des couleurs irisées.|Uma névoa onde cores iridescentes se misturam.|Дымка, где мягко смешиваются радужные цвета.",
    scene: [glow(16, 20, 50, 40, "#7046d8", 0.35), glow(86, 14, 44, 36, "#2ec8e0", 0.28), glow(80, 86, 50, 40, "#ff7ce5", 0.28), glow(18, 84, 40, 34, "#f6d860", 0.18), vert("#120e1e, #0c0a14")],
  },
  {
    slug: "siber-izgara", rarity: "epic", base: "#050816", tint: "#9ff0ff", primary: "#0d7e9a", second: "#d81b9a",
    name: "Siber Izgara|Cyber Grid|Cyberraster|Rejilla cibernética|Grille cyber|Grade cibernética|Кибер-сетка",
    desc: "Ufka uzanan parlak bir ızgara zemin.|A glowing grid floor that runs to the horizon.|Ein leuchtender Rasterboden bis zum Horizont.|Un suelo de rejilla luminosa hasta el horizonte.|Un sol quadrillé lumineux jusqu'à l'horizon.|Um piso de grade luminosa até o horizonte.|Светящийся пол-сетка до самого горизонта.",
    scene: [`repeating-linear-gradient(0deg, ${rgba("#2ee6ff", 0.16)} 0 1px, transparent 1px 22px) 0 100% / 100% 34% no-repeat`, `repeating-linear-gradient(90deg, ${rgba("#d81b9a", 0.14)} 0 1px, transparent 1px 48px) 0 100% / 100% 34% no-repeat`, band(180, 62, 70, "#d81b9a", 0.35), glow(50, 66, 70, 12, "#2ee6ff", 0.25), vert("#0a0e28, #070a20 66%, #050816")],
  },
  {
    slug: "samanyolu", rarity: "legendary", base: "#05040e", tint: "#d8d0ff", primary: "#5244c8", second: "#e0b860",
    name: "Samanyolu|Milky Way|Milchstraße|Vía Láctea|Voie lactée|Via Láctea|Млечный Путь",
    desc: "Gökyüzünü çapraz kesen parlak bir yıldız kuşağı.|A bright band of stars crossing the sky.|Ein heller Sternengürtel quer über den Himmel.|Una franja brillante de estrellas cruza el cielo.|Une bande d'étoiles brillante traverse le ciel.|Uma faixa brilhante de estrelas cruza o céu.|Яркая полоса звёзд пересекает небо.",
    scene: [band(125, 32, 68, "#d8d0ff", 0.14), band(125, 44, 56, "#e0b860", 0.1), stars(40, "#ffffff", 98, 51), glow(60, 46, 40, 20, "#5244c8", 0.2), vert("#08061a, #05040e")],
  },
  {
    slug: "gun-batimi-okyanusu", rarity: "epic", base: "#120a18", tint: "#ffc0a8", primary: "#c0441e", second: "#8a4ad0",
    name: "Gün Batımı Okyanusu|Sunset Ocean|Abendmeer|Océano al ocaso|Océan au couchant|Oceano ao pôr do sol|Закатный океан",
    desc: "Turuncu güneş mor denize batar.|An orange sun sinks into a violet sea.|Eine orange Sonne sinkt ins violette Meer.|Un sol naranja se hunde en un mar violeta.|Un soleil orange plonge dans une mer violette.|Um sol laranja afunda num mar violeta.|Оранжевое солнце тонет в фиолетовом море.",
    scene: [`radial-gradient(circle at 50% 64%, ${rgba("#ffb36b", 0.85)} 0 6%, ${rgba("#ff6a3d", 0.4)} 9%, transparent 20%)`, `repeating-linear-gradient(180deg, transparent 0 8px, ${rgba("#ffb37a", 0.08)} 8px 9px) 0 100% / 100% 35% no-repeat`, glow(50, 66, 90, 20, "#ff6a3d", 0.28), vert("#1a0c2a, #3a1640 50%, #7a2a4a 64%, #1a0a24 65%, #120a18")],
  },
  {
    slug: "kar-gecesi", rarity: "common", base: "#08101c", tint: "#dcecff", primary: "#3664b0", second: "#9fc8ff",
    name: "Kar Gecesi|Snow Night|Schneenacht|Noche de nieve|Nuit de neige|Noite de neve|Снежная ночь",
    desc: "Sessiz bir gecede yağan yumuşak kar.|Soft snow falling on a quiet night.|Weicher Schnee in einer stillen Nacht.|Nieve suave en una noche tranquila.|Une neige douce par une nuit calme.|Neve suave numa noite tranquila.|Мягкий снег тихой ночью.",
    scene: [stars(34, "#ffffff", 98, 61), glow(50, 100, 100, 30, "#9fc8ff", 0.14), vert("#0c1828, #08101c")],
  },
  {
    slug: "espresso", rarity: "common", base: "#120c08", tint: "#e8cbb0", primary: "#8a5228", second: "#d4a070",
    name: "Espresso|Espresso|Espresso|Espresso|Espresso|Espresso|Эспрессо",
    desc: "Sıcak, koyu ve sakin bir kahve tonu.|A warm, dark and calm coffee tone.|Ein warmer, dunkler, ruhiger Kaffeeton.|Un tono café cálido, oscuro y sereno.|Une teinte café chaude, sombre et calme.|Um tom de café quente, escuro e calmo.|Тёплый, тёмный и спокойный кофейный тон.",
    scene: [`radial-gradient(40% 30% at 70% 30%, transparent 40%, ${rgba("#d4a070", 0.06)} 50%, transparent 60%)`, glow(70, 30, 40, 30, "#d4a070", 0.12), glow(20, 80, 50, 40, "#8a5228", 0.2), vert("#1a120c, #120c08")],
  },
  {
    slug: "gece-bahcesi", rarity: "rare", base: "#08120c", tint: "#b8e8c8", primary: "#257a50", second: "#e870a8",
    name: "Gece Bahçesi|Night Garden|Nachtgarten|Jardín nocturno|Jardin de nuit|Jardim noturno|Ночной сад",
    desc: "Koyu yeşil yaprakların arasında pembe çiçek ışıkları.|Pink flower lights among dark green leaves.|Rosa Blütenlichter zwischen dunkelgrünen Blättern.|Luces de flores rosa entre hojas verde oscuro.|Des lueurs de fleurs roses parmi des feuilles vert sombre.|Luzes de flores rosa entre folhas verde-escuras.|Розовые огни цветов среди тёмной листвы.",
    scene: [bokeh([[12, 80, 10, "#e870a8", 0.3], [26, 70, 6, "#ffb3cc", 0.3], [78, 84, 12, "#e870a8", 0.26], [88, 72, 6, "#ffb3cc", 0.3], [56, 90, 8, "#e870a8", 0.22]]), glow(50, 100, 100, 40, "#257a50", 0.3), vert("#0e1c14, #08120c")],
  },
  {
    slug: "elektrik-mavisi", rarity: "epic", base: "#040a1c", tint: "#9fd0ff", primary: "#0d62d0", second: "#2ee0ff",
    name: "Elektrik Mavisi|Electric Blue|Elektrikblau|Azul eléctrico|Bleu électrique|Azul elétrico|Электрик",
    desc: "Canlı mavi ve ince elektrik arkları.|Vivid blue with thin electric arcs.|Lebhaftes Blau mit feinen Lichtbögen.|Azul vivo con finos arcos eléctricos.|Un bleu vif et de fins arcs électriques.|Azul vivo com arcos elétricos finos.|Яркий синий и тонкие электрические дуги.",
    scene: [band(32, 30, 31.5, "#9fd0ff", 0.4), band(148, 62, 63.2, "#2ee0ff", 0.35), band(60, 76, 77, "#9fd0ff", 0.3), glow(30, 30, 50, 40, "#0d62d0", 0.35), glow(80, 70, 40, 30, "#2ee0ff", 0.18), vert("#06102c, #040a1c")],
  },
  {
    slug: "sedef", rarity: "legendary", base: "#0e1014", tint: "#f0e8f0", primary: "#6e5ea8", second: "#e8a0b8",
    name: "Sedef|Mother of Pearl|Perlmutt|Nácar|Nacre|Madrepérola|Перламутр",
    desc: "Koyu zeminde sedef gibi yanardöner pastel ışık.|Pearly iridescent pastels on a dark ground.|Perlmuttartige Pastelltöne auf dunklem Grund.|Pasteles nacarados e iridiscentes sobre fondo oscuro.|Des pastels nacrés et irisés sur fond sombre.|Pastéis perolados e iridescentes sobre fundo escuro.|Перламутровые пастели на тёмном фоне.",
    scene: [glow(20, 20, 50, 40, "#e8a0b8", 0.32), glow(80, 30, 50, 40, "#a0c8e8", 0.28), glow(60, 86, 60, 40, "#c8b8f0", 0.3), glow(10, 80, 40, 30, "#b8e8d8", 0.22), band(125, 40, 60, "#ffffff", 0.06), vert("#14161c, #0e1014")],
  },
  {
    slug: "karbon", rarity: "common", base: "#0a0a0b", tint: "#d0d0d4", primary: "#c0500c", second: "#8a8a90",
    name: "Karbon|Carbon|Carbon|Carbono|Carbone|Carbono|Карбон",
    desc: "Karbon örgü dokusu ve turuncu bir vurgu.|Carbon weave texture with an orange accent.|Carbongewebe mit orangem Akzent.|Textura de fibra de carbono con acento naranja.|Une texture carbone et un accent orange.|Textura de fibra de carbono com destaque laranja.|Карбоновое плетение и оранжевый акцент.",
    scene: [`repeating-linear-gradient(45deg, ${rgba("#ffffff", 0.025)} 0 3px, transparent 3px 6px)`, `repeating-linear-gradient(-45deg, ${rgba("#000000", 0.25)} 0 3px, transparent 3px 6px)`, glow(90, 0, 40, 30, "#c0500c", 0.16), vert("#121214, #0a0a0b")],
  },
];

module.exports = { THEME: T };
