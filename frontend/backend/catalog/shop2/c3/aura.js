"use strict";

/**
 * profile_aura: 30 card atmospheres for the profile card / hover card.
 *   bloom  = outer light around the card (box-shadow list)
 *   inner  = inset light inside the card, under the content
 *   rim    = ::before, a thin light edge (masked to the border band)
 *   fx     = ::after, one motion layer (sheen, drift, motes, corner bloom,
 *            flash). Only transform / opacity animate, and nothing moves
 *            down or past the bottom edge (the card can be a scroll box).
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");

const DEPTH = "0 24px 64px rgba(0,0,0,0.5)";

/** Outer bloom: a hairline in c1, a near glow, a long under-glow in c2. */
function bloom(c1, c2, k = 1) {
  return [
    `0 0 0 1px ${rgba(c1, 0.42 * k)}`,
    `0 0 26px -4px ${rgba(c1, 0.5 * k)}`,
    `0 26px 70px -22px ${rgba(c2, 0.62 * k)}`,
    `-18px -14px 48px -24px ${rgba(c1, 0.4 * k)}`,
    DEPTH,
  ];
}
const inner = {
  bottom: (c, a = 0.34) => [`inset 0 1px 0 rgba(255,255,255,0.12)`, `inset 0 -70px 90px -70px ${rgba(c, a)}`],
  top: (c, a = 0.34) => [`inset 0 1px 0 rgba(255,255,255,0.16)`, `inset 0 70px 90px -70px ${rgba(c, a)}`],
  all: (c, a = 0.26) => [`inset 0 1px 0 rgba(255,255,255,0.12)`, `inset 0 0 48px -14px ${rgba(c, a)}`],
};

const rim = {
  duo: (a, b, ang = 135) => ({ bg: `linear-gradient(${ang}deg, ${a}, ${rgba(a.length === 7 ? a : "#ffffff", 0)} 42%, ${rgba(b, 0)} 58%, ${b})` }),
  full: (a, b, ang = 135) => ({ bg: `linear-gradient(${ang}deg, ${a}, ${b})` }),
  conic: (stops, from = 210) => ({ bg: `conic-gradient(from ${from}deg, ${stops})` }),
  top: (c) => ({ bg: `linear-gradient(180deg, ${c}, ${rgba(c, 0.35)} 22%, ${rgba(c, 0)} 55%, ${rgba(c, 0.18)})` }),
  corners: (c, s = 34) => ({ bg: ["0 0", "100% 0", "0 100%", "100% 100%"].map((p) => `radial-gradient(circle at ${p}, ${c} 0 ${s}px, transparent ${s + 1}px)`).join(", ") }),
  double: (a, b) => ({ shadow: `inset 0 0 0 1px ${a}, inset 0 0 0 3px rgba(8,8,16,0.55), inset 0 0 0 4px ${b}` }),
};

const fx = {
  sheen: (c, s = 7, a = 0.16) => ({ kind: "sheen", bg: `linear-gradient(100deg, transparent 0%, ${rgba(c, 0)} 30%, ${rgba(c, a)} 46%, rgba(255,255,255,${(a * 0.9).toFixed(2)}) 50%, ${rgba(c, a)} 54%, ${rgba(c, 0)} 70%, transparent)`, anim: `s2au-sheen ${s}s cubic-bezier(.4,0,.2,1) infinite` }),
  drift: (bands, s = 26) => ({ kind: "drift", bg: bands, anim: `s2au-drift ${s}s linear infinite` }),
  motes: (spots, s = 2.6) => ({ kind: "fill", bg: spots, anim: `s2fx-twinkle ${s}s ease-in-out infinite` }),
  corner: (bg, origin, s = 5) => ({ kind: "fill", bg, origin, anim: `s2au-glow ${s}s ease-in-out infinite` }),
  flash: (bg, s = 7) => ({ kind: "fill", bg, anim: `s2fx-flash ${s}s linear infinite` }),
  still: (bg, op = 1) => ({ kind: "fill", bg, op }),
};

/** Small light spots at % positions [[x, y, r, colour, alpha]]. */
const spots = (list) => list.map(([x, y, r, c, a = 0.9]) => `radial-gradient(circle at ${x}% ${y}%, ${rgba(c, a)} 0 ${r}px, ${rgba(c, a * 0.35)} ${r + 0.5}px, transparent ${r * 3.2}px)`).join(", ");
/** Four point star flares at % positions. */
const stars = (list) => list.map(([x, y, s, c]) => `radial-gradient(ellipse ${s}px 1.2px at ${x}% ${y}%, ${c}, transparent), radial-gradient(ellipse 1.2px ${s}px at ${x}% ${y}%, ${c}, transparent), radial-gradient(circle at ${x}% ${y}%, #fff 0 1.4px, transparent 2.4px)`).join(", ");
/** Horizontally tileable band pattern for drift (two identical halves). */
const bands = (layers) => layers.map((l) => l.replace(/AT/g, "").trim()).join(", ");

const AURA = [
  {
    slug: "ay-isigi-pervazi", rarity: "rare",
    name: "Ay Işığı Pervazı|Moonlit Edge|Mondlichtkante|Borde de luna|Bord de lune|Borda de luar|Лунная кромка",
    desc: "Kartın üst kenarına gümüş ay ışığı düşer, bir parıltı süzülür.|Silver moonlight falls on the top edge and a glint glides by.|Silbernes Mondlicht fällt auf die Oberkante, ein Glanz gleitet vorbei.|Luz de luna plateada en el borde superior y un destello que pasa.|Un clair de lune argenté sur le bord haut, un reflet glisse.|Luar prateado na borda de cima e um brilho que passa.|Серебряный лунный свет на верхней кромке и скользящий блик.",
    bloom: bloom("#c9d8ff", "#5d78c8", 0.9), inner: inner.top("#9fb6ff", 0.3),
    rim: rim.top("#e9f0ff"), fx: fx.sheen("#dfe8ff", 8, 0.14),
  },
  {
    slug: "gun-batimi-kiyisi", rarity: "rare",
    name: "Gün Batımı Kıyısı|Sunset Shore|Abendufer|Orilla del ocaso|Rivage au couchant|Costa do pôr do sol|Закатный берег",
    desc: "Alt kenarda turuncudan pembeye bir ufuk ışığı yanar.|A horizon glow burns orange to pink along the bottom edge.|Ein Horizontleuchten glüht orange bis pink an der Unterkante.|Un brillo de horizonte arde de naranja a rosa abajo.|Une lueur d'horizon brûle de l'orange au rose en bas.|Um brilho de horizonte arde do laranja ao rosa embaixo.|Внизу горит закатный горизонт от оранжевого к розовому.",
    bloom: bloom("#ff8a4c", "#ff4f8b"), inner: inner.bottom("#ff7a45", 0.42),
    rim: rim.full("#ffb36b", "#ff4f8b", 90), fx: fx.corner(`radial-gradient(90% 55% at 50% 108%, ${rgba("#ff9a55", 0.38)}, ${rgba("#ff4f8b", 0.12)} 55%, transparent 75%)`, "50% 100%", 6),
  },
  {
    slug: "kutup-isiltisi", rarity: "epic",
    name: "Kutup Işıltısı|Polar Shimmer|Polarschimmer|Brillo polar|Miroitement polaire|Brilho polar|Полярное мерцание",
    desc: "Yeşil ve mor kutup ışığı kartın içinden yavaşça süzülür.|Green and violet polar light drifts slowly through the card.|Grünes und violettes Polarlicht zieht langsam durch die Karte.|Luz polar verde y violeta cruza la tarjeta despacio.|Une lumière polaire verte et violette traverse la carte.|Luz polar verde e violeta atravessa o cartão devagar.|Зелёное и фиолетовое сияние медленно плывёт по карточке.",
    bloom: bloom("#5dffc0", "#8f7bff"), inner: inner.top("#3ee6a8", 0.28),
    rim: rim.conic("#5dffc0, #8f7bff 35%, #5dffc0 60%, #8f7bff 85%, #5dffc0"),
    fx: fx.drift(bands([`radial-gradient(30% 60% at 12% 0%, ${rgba("#5dffc0", 0.3)}, transparent 70%)`, `radial-gradient(26% 50% at 30% 0%, ${rgba("#8f7bff", 0.28)}, transparent 70%)`, `radial-gradient(30% 60% at 62% 0%, ${rgba("#5dffc0", 0.3)}, transparent 70%)`, `radial-gradient(26% 50% at 80% 0%, ${rgba("#8f7bff", 0.28)}, transparent 70%)`]), 30),
  },
  {
    slug: "kivilcim-yagmuru", rarity: "epic",
    name: "Kıvılcım Yağmuru|Spark Shower|Funkenregen|Lluvia de chispas|Pluie d'étincelles|Chuva de faíscas|Дождь искр",
    desc: "Altın kıvılcımlar kartın köşelerinde yanıp söner.|Golden sparks flicker in the corners of the card.|Goldene Funken flackern in den Ecken der Karte.|Chispas doradas titilan en las esquinas de la tarjeta.|Des étincelles dorées scintillent aux coins de la carte.|Faíscas douradas piscam nos cantos do cartão.|Золотые искры мерцают по углам карточки.",
    bloom: bloom("#ffcf5a", "#ff8a1f"), inner: inner.all("#ffb340", 0.24),
    rim: rim.duo("#ffe08a", "#ff9a2e"),
    fx: fx.motes(spots([[6, 8, 1.6, "#fff2b8"], [14, 4, 1, "#ffd36b"], [92, 10, 1.4, "#fff2b8"], [86, 5, 1, "#ffc04a"], [96, 22, 1, "#ffd36b"], [5, 90, 1.4, "#ffd36b"], [12, 96, 1, "#fff2b8"], [94, 92, 1.6, "#fff2b8"], [84, 97, 1, "#ffc04a"], [50, 3, 1, "#ffe08a"]]), 2.2),
  },
  {
    slug: "derin-okyanus", rarity: "rare",
    name: "Derin Okyanus|Abyssal Blue|Tiefseeblau|Azul abisal|Bleu abyssal|Azul abissal|Глубинная синева",
    desc: "Kartın kenarlarından içeri derin bir mavi nefes alır.|A deep blue breathes in from the edges of the card.|Ein tiefes Blau atmet von den Rändern her ein.|Un azul profundo respira desde los bordes.|Un bleu profond respire depuis les bords de la carte.|Um azul profundo respira a partir das bordas.|Глубокий синий дышит от краёв карточки.",
    bloom: bloom("#2f8cff", "#0b3c8c"), inner: inner.all("#2f7dff", 0.34),
    rim: rim.full("#59a8ff", "#123b8a", 180),
    fx: fx.corner(`radial-gradient(120% 90% at 50% 120%, ${rgba("#1e6bff", 0.3)}, transparent 60%), radial-gradient(60% 50% at 0% 0%, ${rgba("#59a8ff", 0.2)}, transparent 70%)`, "50% 100%", 6.5),
  },
  {
    slug: "neon-cerceve", rarity: "epic",
    name: "Neon Çerçeve|Neon Frame|Neonrahmen|Marco de neón|Cadre néon|Moldura neon|Неоновая рамка",
    desc: "Pembe ve camgöbeği iki neon hat kartı çevreler, arada titrer.|Two neon lines, pink and cyan, frame the card and flicker.|Zwei Neonlinien in Pink und Cyan rahmen die Karte und flackern.|Dos líneas de neón rosa y cian enmarcan y parpadean.|Deux lignes néon rose et cyan encadrent la carte et vacillent.|Duas linhas neon rosa e ciano emolduram e piscam.|Две неоновые линии, розовая и голубая, мерцают по краю.",
    bloom: [`0 0 0 1px ${rgba("#ff2e88", 0.7)}`, `0 0 18px ${rgba("#ff2e88", 0.55)}`, `0 0 42px -6px ${rgba("#2ef2ff", 0.45)}`, DEPTH], inner: inner.all("#ff2e88", 0.2),
    rim: rim.double("#2ef2ff", "#ff2e88"), rimAnim: "s2fx-flicker 5s linear infinite",
    fx: fx.still(`linear-gradient(180deg, ${rgba("#2ef2ff", 0.08)}, transparent 30%, transparent 70%, ${rgba("#ff2e88", 0.1)})`),
  },
  {
    slug: "kadife-gece", rarity: "common",
    name: "Kadife Gece|Velvet Night|Samtnacht|Noche de terciopelo|Nuit de velours|Noite de veludo|Бархатная ночь",
    desc: "Erik moru yumuşak bir ışık kartın çevresine yayılır.|A soft plum light spreads around the card.|Ein weiches Pflaumenlicht legt sich um die Karte.|Una luz ciruela suave rodea la tarjeta.|Une douce lumière prune entoure la carte.|Uma luz ameixa suave envolve o cartão.|Мягкий сливовый свет окутывает карточку.",
    bloom: bloom("#b46bd6", "#5a2a7a", 0.85), inner: inner.bottom("#9a4fc0", 0.26),
    rim: rim.duo("#d8a6f0", "#7a3fa0"), fx: fx.sheen("#e4c6ff", 9, 0.1),
  },
  {
    slug: "altin-varak", rarity: "legendary",
    name: "Altın Varak|Gold Leaf|Blattgold|Pan de oro|Feuille d'or|Folha de ouro|Сусальное золото",
    desc: "Altın varak kenar ve kartın üstünden geçen parlak bir yaldız.|A gold leaf edge and a bright gilt sheen across the card.|Eine Blattgoldkante und ein heller Goldglanz über der Karte.|Un borde de pan de oro y un brillo dorado que cruza.|Un liseré d'or et un éclat doré qui traverse la carte.|Uma borda de folha de ouro e um brilho dourado que cruza.|Золотая кромка и яркий отблеск позолоты по карточке.",
    bloom: bloom("#ffd36b", "#b8860b", 1.05), inner: inner.top("#ffcf5a", 0.3),
    rim: rim.conic("#8a6416, #fff1c2 10%, #c99a2e 22%, #fff7d6 36%, #a77a1f 50%, #f7dc8b 64%, #8a6416 78%, #fff1c2 90%, #8a6416"), rimW: 2,
    fx: fx.sheen("#ffe08a", 5.5, 0.26),
  },
  {
    slug: "zumrut-bahce", rarity: "rare",
    name: "Zümrüt Bahçe|Emerald Garden|Smaragdgarten|Jardín esmeralda|Jardin d'émeraude|Jardim esmeralda|Изумрудный сад",
    desc: "Köşeden yeşil bir bahçe ışığı nefes alır.|A green garden light breathes in from one corner.|Ein grünes Gartenlicht atmet aus einer Ecke.|Una luz verde de jardín respira desde una esquina.|Une lumière verte de jardin respire depuis un coin.|Uma luz verde de jardim respira de um canto.|Из угла дышит зелёный садовый свет.",
    bloom: bloom("#3ddc84", "#0f6b3c"), inner: inner.bottom("#2fbf6e", 0.3),
    rim: rim.duo("#8af5b8", "#1f7a46"),
    fx: fx.corner(`radial-gradient(70% 60% at 0% 100%, ${rgba("#3ddc84", 0.32)}, transparent 70%), radial-gradient(40% 35% at 100% 0%, ${rgba("#c8ff9a", 0.14)}, transparent 70%)`, "0% 100%", 5.5),
  },
  {
    slug: "kristal-kenar", rarity: "epic",
    name: "Kristal Kenar|Crystal Edge|Kristallkante|Borde de cristal|Arête de cristal|Borda de cristal|Хрустальная грань",
    desc: "Buzlu kesme kenarlarda soğuk ışık kırılır.|Cold light breaks across frosted, faceted edges.|Kaltes Licht bricht sich an bereiften Facettenkanten.|La luz fría se quiebra en bordes facetados y helados.|Une lumière froide se brise sur des arêtes givrées.|Luz fria se parte em bordas facetadas e geladas.|Холодный свет преломляется на гранёной кромке.",
    bloom: bloom("#a6e7ff", "#3a8fb7"), inner: inner.all("#a6e7ff", 0.22),
    rim: rim.conic("#a6e7ff 0 8%, #3a8fb7 8% 16%, #ffffff 16% 20%, #2a6f92 20% 33%, #a6e7ff 33% 41%, #ffffff 41% 44%, #3a8fb7 44% 58%, #e8f9ff 58% 66%, #2a6f92 66% 80%, #ffffff 80% 83%, #a6e7ff 83% 100%"), rimW: 2,
    fx: fx.sheen("#e8f9ff", 6, 0.2),
  },
  {
    slug: "kor-isigi", rarity: "rare",
    name: "Kor Işığı|Ember Light|Glutlicht|Luz de brasa|Lueur de braise|Luz de brasa|Свет углей",
    desc: "Alt kenarda közler yanıp söner, sıcak bir ışık yükselir.|Embers flicker along the bottom while warm light rises.|Glut flackert unten, warmes Licht steigt auf.|Brasas titilan abajo y sube una luz cálida.|Des braises vacillent en bas, une lumière chaude monte.|Brasas piscam embaixo e uma luz quente sobe.|Внизу мерцают угли, поднимается тёплый свет.",
    bloom: bloom("#ff6a2b", "#a3220f"), inner: inner.bottom("#ff5a1f", 0.45),
    rim: rim.full("#ffd27a", "#a3220f", 0),
    fx: fx.motes(spots([[8, 94, 1.6, "#ffd27a"], [18, 90, 1.1, "#ff8a3d"], [30, 96, 1.4, "#ffb35a"], [46, 92, 1, "#ff6a2b"], [58, 97, 1.6, "#ffd27a"], [70, 91, 1.1, "#ff8a3d"], [82, 95, 1.4, "#ffb35a"], [93, 90, 1, "#ff6a2b"], [38, 86, 0.9, "#ffd27a"], [76, 84, 0.9, "#ffd27a"]]), 1.8),
  },
  {
    slug: "lavanta-sisi", rarity: "common",
    name: "Lavanta Sisi|Lavender Haze|Lavendeldunst|Bruma lavanda|Brume lavande|Névoa lavanda|Лавандовая дымка",
    desc: "Lavanta renginde ince bir sis kartın içinden geçer.|A thin lavender haze passes through the card.|Ein dünner Lavendeldunst zieht durch die Karte.|Una fina bruma lavanda cruza la tarjeta.|Une fine brume lavande traverse la carte.|Uma névoa lavanda fina atravessa o cartão.|Тонкая лавандовая дымка проходит по карточке.",
    bloom: bloom("#c7a8ff", "#7a5cc8", 0.8), inner: inner.all("#b79bff", 0.2),
    rim: rim.duo("#e6dcff", "#9a7be0", 160),
    fx: fx.drift(bands([`radial-gradient(28% 70% at 10% 50%, ${rgba("#d9c8ff", 0.16)}, transparent 70%)`, `radial-gradient(30% 60% at 34% 80%, ${rgba("#b79bff", 0.14)}, transparent 70%)`, `radial-gradient(28% 70% at 60% 50%, ${rgba("#d9c8ff", 0.16)}, transparent 70%)`, `radial-gradient(30% 60% at 84% 80%, ${rgba("#b79bff", 0.14)}, transparent 70%)`]), 34),
  },
  {
    slug: "bakir-patina", rarity: "rare",
    name: "Bakır Patina|Copper Patina|Kupferpatina|Pátina de cobre|Patine de cuivre|Pátina de cobre|Медная патина",
    desc: "Bakır ve patina yeşili iki tonlu bir kenar, yavaş bir parıltı.|A two-tone edge of copper and verdigris with a slow glint.|Eine Kante aus Kupfer und Grünspan mit langsamem Glanz.|Un borde de cobre y verdín con un destello lento.|Un bord cuivre et vert-de-gris avec un lent reflet.|Uma borda de cobre e azinhavre com brilho lento.|Кромка из меди и патины с медленным бликом.",
    bloom: bloom("#e08a4a", "#2f8f7f", 0.9), inner: inner.bottom("#2f8f7f", 0.28),
    rim: rim.full("#f0a46a", "#3fb3a0", 120), fx: fx.sheen("#ffc59a", 9, 0.14),
  },
  {
    slug: "gok-gurultusu", rarity: "epic",
    name: "Gök Gürültüsü|Thunderhead|Gewitterwolke|Nubarrón|Cumulonimbus|Trovoada|Грозовая туча",
    desc: "Fırtına mavisi bir kenar; arada bir şimşek kartı aydınlatır.|A storm blue edge; now and then lightning lights the card.|Eine sturmblaue Kante; ab und zu erhellt ein Blitz die Karte.|Un borde azul tormenta; de vez en cuando un rayo la ilumina.|Un bord bleu orage ; parfois un éclair illumine la carte.|Uma borda azul tempestade; às vezes um raio ilumina.|Грозовая кромка; время от времени карточку озаряет молния.",
    bloom: bloom("#7aa7ff", "#3b4a6b"), inner: inner.top("#5b7bd0", 0.3),
    rim: rim.duo("#cfe0ff", "#5b6d94", 200),
    fx: fx.flash(`radial-gradient(80% 60% at 70% 0%, rgba(235,244,255,0.42), transparent 70%), linear-gradient(180deg, rgba(200,220,255,0.12), transparent 50%)`, 8),
  },
  {
    slug: "inci-parlakligi", rarity: "epic",
    name: "İnci Parlaklığı|Pearl Luster|Perlglanz|Lustre de perla|Lustre de perle|Lustro de pérola|Жемчужный блеск",
    desc: "Sedef renkleri kenarda kayar, yumuşak bir inci ışığı geçer.|Nacre colours slide along the edge under a soft pearl light.|Perlmuttfarben gleiten an der Kante, weiches Perllicht zieht vorbei.|Colores de nácar recorren el borde bajo luz de perla.|Des teintes de nacre glissent sur le bord sous une lumière de perle.|Cores de nácar deslizam na borda sob luz de pérola.|Перламутр скользит по кромке в мягком жемчужном свете.",
    bloom: bloom("#ffd8e4", "#9ab8d0", 0.85), inner: inner.all("#ffe6ee", 0.18),
    rim: rim.conic("#f1e9e1, #ffd8e4 15%, #cfe3ef 30%, #f1e9e1 45%, #e2d4f2 60%, #ffd8e4 75%, #d9efe6 88%, #f1e9e1"), rimW: 2,
    fx: fx.sheen("#fff4f8", 7.5, 0.18),
  },
  {
    slug: "galaksi-tozu", rarity: "legendary",
    name: "Galaksi Tozu|Galaxy Dust|Galaxiestaub|Polvo de galaxia|Poussière de galaxie|Poeira de galáxia|Галактическая пыль",
    desc: "Mor bir galaksi ışığı ve kartın her köşesinde parlayan yıldızlar.|Violet galaxy light with stars flaring in every corner.|Violettes Galaxielicht und Sterne, die in jeder Ecke aufblitzen.|Luz violeta de galaxia con estrellas en cada esquina.|Une lumière de galaxie violette et des étoiles à chaque coin.|Luz violeta de galáxia com estrelas em cada canto.|Фиолетовый свет галактики и звёзды в каждом углу.",
    bloom: bloom("#a77bff", "#3c2d8f", 1.05), inner: inner.all("#7c5cff", 0.28),
    rim: rim.conic("#3c2d8f, #c6b7ff 20%, #ffe9a8 26%, #c6b7ff 32%, #3c2d8f 55%, #a77bff 80%, #3c2d8f"),
    fx: fx.motes(`${stars([[7, 9, 9, "rgba(230,220,255,0.95)"], [93, 12, 7, "rgba(255,233,168,0.9)"], [90, 90, 9, "rgba(230,220,255,0.95)"], [9, 88, 6, "rgba(255,233,168,0.85)"]])}, ${spots([[20, 6, 0.9, "#e6dcff"], [76, 4, 0.8, "#ffe9a8"], [97, 50, 0.9, "#e6dcff"], [3, 60, 0.8, "#e6dcff"], [60, 96, 0.9, "#ffe9a8"]])}`, 3),
  },
  {
    slug: "gul-kurusu", rarity: "common",
    name: "Gül Kurusu|Dusty Rose|Altrosa|Rosa empolvado|Vieux rose|Rosa antigo|Пыльная роза",
    desc: "Sade ve zarif: gül kurusu ince bir kenar ve sıcak bir gölge.|Quiet and refined: a thin dusty rose edge and a warm shadow.|Ruhig und edel: eine feine Altrosakante und warmer Schatten.|Sobrio y elegante: borde rosa empolvado y sombra cálida.|Sobre et raffiné : un fin liseré vieux rose, une ombre chaude.|Sóbrio e elegante: borda rosa antigo e sombra quente.|Сдержанно: тонкая пыльно-розовая кромка и тёплая тень.",
    bloom: bloom("#e3a1b0", "#8a4a5c", 0.7), inner: inner.top("#e3a1b0", 0.18),
    rim: rim.full("#f2c4cf", "#a8667a", 160), fx: null,
  },
  {
    slug: "grafit", rarity: "common",
    name: "Grafit|Graphite|Graphit|Grafito|Graphite|Grafite|Графит",
    desc: "Tek renkli çelik bir kenar ve sakin bir cam parıltısı.|A monochrome steel edge with a calm glass glint.|Eine einfarbige Stahlkante mit ruhigem Glasglanz.|Un borde de acero monocromo con un brillo sereno.|Un bord d'acier monochrome et un reflet de verre calme.|Uma borda de aço monocromática com brilho calmo.|Монохромная стальная кромка и спокойный стеклянный блик.",
    bloom: bloom("#c8ced8", "#3a404c", 0.6), inner: inner.top("#ffffff", 0.08),
    rim: rim.duo("#f2f5fa", "#6a7282"), fx: fx.sheen("#ffffff", 10, 0.08),
  },
  {
    slug: "descall-mavisi", rarity: "common",
    name: "Gece Mavisi|Midnight Signal|Mitternachtssignal|Señal de medianoche|Signal de minuit|Sinal da meia-noite|Полночный сигнал",
    desc: "Uygulamanın kendi mavisiyle temiz bir ışık hattı.|A clean line of light in the app's own blue.|Eine klare Lichtlinie im eigenen Blau der App.|Una línea de luz limpia en el azul propio de la app.|Une ligne de lumière nette dans le bleu de l'appli.|Uma linha de luz limpa no azul do próprio app.|Чистая линия света в фирменном синем.",
    bloom: bloom("#587af5", "#2a3fa8", 0.9), inner: inner.top("#587af5", 0.24),
    rim: rim.duo("#a9bbff", "#587af5"), fx: fx.sheen("#b8c8ff", 9, 0.12),
  },
  {
    slug: "nane-ferahligi", rarity: "common",
    name: "Nane Ferahlığı|Mint Breeze|Minzbrise|Brisa de menta|Brise menthe|Brisa de hortelã|Мятный бриз",
    desc: "Ferah nane yeşili bir kenar ve köşede serin bir ışık.|A fresh mint edge and a cool light in one corner.|Eine frische Minzkante und kühles Licht in einer Ecke.|Un borde menta fresco y una luz fresca en la esquina.|Un bord menthe frais et une lumière fraîche dans un coin.|Uma borda de hortelã e uma luz fresca no canto.|Свежая мятная кромка и прохладный свет в углу.",
    bloom: bloom("#6ff0c8", "#1f8a6e", 0.8), inner: inner.top("#6ff0c8", 0.18),
    rim: rim.duo("#c8fff0", "#2fbf96"),
    fx: fx.corner(`radial-gradient(60% 55% at 100% 0%, ${rgba("#9effdf", 0.2)}, transparent 70%)`, "100% 0%", 6),
  },
  {
    slug: "lav-damari", rarity: "epic",
    name: "Lav Damarı|Lava Vein|Lavaader|Veta de lava|Veine de lave|Veio de lava|Лавовая жила",
    desc: "Kartın altında erimiş lav damarları nabız gibi atar.|Molten lava veins pulse beneath the card.|Unter der Karte pulsieren geschmolzene Lavaadern.|Vetas de lava fundida laten bajo la tarjeta.|Des veines de lave en fusion pulsent sous la carte.|Veios de lava derretida pulsam sob o cartão.|Под карточкой пульсируют жилы расплавленной лавы.",
    bloom: bloom("#ff3d00", "#5a0e0e", 1.05), inner: inner.bottom("#ff3d00", 0.46),
    rim: rim.full("#ffb000", "#5a0e0e", 0), rimW: 2,
    fx: fx.corner(`radial-gradient(20% 4% at 18% 97%, ${rgba("#ffb000", 0.6)}, transparent 70%), radial-gradient(12% 3% at 40% 99%, ${rgba("#ffd27a", 0.55)}, transparent 70%), radial-gradient(24% 5% at 70% 96%, ${rgba("#ff6a1f", 0.6)}, transparent 70%), radial-gradient(10% 3% at 90% 98.5%, ${rgba("#ffb000", 0.5)}, transparent 70%), radial-gradient(90% 34% at 50% 106%, ${rgba("#ff3d00", 0.4)}, transparent 70%)`, "50% 100%", 2.6),
  },
  {
    slug: "holo-folyo", rarity: "legendary",
    name: "Holo Folyo|Holo Foil|Holofolie|Lámina holográfica|Feuille holographique|Folha holográfica|Голофольга",
    desc: "Koleksiyon kartı gibi: gökkuşağı folyo kenar ve geçen bir parıltı.|Like a collector's card: a rainbow foil edge and a passing gleam.|Wie eine Sammelkarte: Regenbogenfolie und ein vorbeiziehender Glanz.|Como una carta de colección: borde arcoíris y un destello.|Comme une carte de collection : liseré arc-en-ciel et un reflet.|Como um card de coleção: borda arco-íris e um brilho.|Как коллекционная карта: радужная фольга и пробегающий блик.",
    bloom: [`0 0 0 1px rgba(255,255,255,0.4)`, `0 0 24px -4px ${rgba("#ff7ce5", 0.45)}`, `0 26px 70px -22px ${rgba("#7cf3ff", 0.55)}`, `-18px -14px 48px -24px ${rgba("#fff27c", 0.4)}`, DEPTH], inner: inner.all("#b3c8ff", 0.2),
    rim: rim.conic("#ff7ce5, #7cf3ff 17%, #b3ff7c 33%, #fff27c 50%, #ff9a7c 67%, #c87cff 83%, #ff7ce5"), rimW: 2,
    fx: { kind: "sheen", bg: "linear-gradient(100deg, transparent 0%, rgba(255,124,229,0) 28%, rgba(255,124,229,0.18) 40%, rgba(124,243,255,0.22) 48%, rgba(255,255,255,0.24) 50%, rgba(179,255,124,0.2) 54%, rgba(255,242,124,0.16) 60%, rgba(255,242,124,0) 72%, transparent)", anim: "s2au-sheen 5s cubic-bezier(.4,0,.2,1) infinite" },
  },
  {
    slug: "siber-kose", rarity: "rare",
    name: "Siber Köşe|Cyber Corners|Cyberecken|Esquinas cibernéticas|Coins cyber|Cantos cibernéticos|Кибер-углы",
    desc: "Köşelerde ince bir camgöbeği ızgara ve keskin bir kenar.|A fine cyan grid in the corners and a crisp edge.|Ein feines Cyanraster in den Ecken und eine klare Kante.|Una fina rejilla cian en las esquinas y un borde nítido.|Une fine grille cyan aux coins et un bord net.|Uma grade ciano fina nos cantos e borda nítida.|Тонкая голубая сетка по углам и чёткая кромка.",
    bloom: bloom("#22e3ff", "#1a5aa8", 0.9), inner: inner.all("#22e3ff", 0.16),
    rim: rim.corners("#7ff6ff", 40),
    fx: { kind: "fill", bg: `repeating-linear-gradient(0deg, ${rgba("#22e3ff", 0.12)} 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, ${rgba("#22e3ff", 0.12)} 0 1px, transparent 1px 14px)`, mask: "radial-gradient(40% 50% at 0% 0%, #000, transparent 70%), radial-gradient(40% 50% at 100% 100%, #000, transparent 70%)", anim: "s2fx-breathe 4s ease-in-out infinite" },
  },
  {
    slug: "safak", rarity: "rare",
    name: "Şafak|Daybreak|Morgendämmerung|Alba|Aube|Alvorada|Рассвет",
    desc: "Kartın üstünde altın bir şafak ışığı doğar.|A golden dawn light rises over the top of the card.|Über der Karte geht ein goldenes Morgenlicht auf.|Una luz dorada de alba nace sobre la tarjeta.|Une lumière d'aube dorée se lève sur la carte.|Uma luz dourada de alvorada nasce sobre o cartão.|Над карточкой встаёт золотой рассвет.",
    bloom: bloom("#ffcf7a", "#ff8a6b", 0.9), inner: inner.top("#ffc46b", 0.36),
    rim: rim.top("#fff0c8"),
    fx: fx.corner(`radial-gradient(70% 45% at 50% -8%, ${rgba("#ffe3a0", 0.36)}, ${rgba("#ff9a7a", 0.12)} 50%, transparent 72%)`, "50% 0%", 7),
  },
  {
    slug: "ruya-kapisi", rarity: "epic",
    name: "Rüya Kapısı|Dream Gate|Traumtor|Puerta del sueño|Porte du rêve|Portal do sonho|Врата сна",
    desc: "Mor ve pembe köşe ışıkları kartı bir kapı gibi çerçeveler.|Violet and pink corner lights frame the card like a gate.|Violette und pinke Eckenlichter rahmen die Karte wie ein Tor.|Luces de esquina violeta y rosa enmarcan como una puerta.|Des lueurs d'angle violettes et roses encadrent comme une porte.|Luzes de canto violeta e rosa emolduram como um portal.|Фиолетовые и розовые угловые огни обрамляют, как врата.",
    bloom: bloom("#ff6fd8", "#6a3cff"), inner: inner.all("#b46bff", 0.24),
    rim: rim.corners("#ffb3ee", 46), rimW: 2, rimAnim: "s2fx-breathe 3.6s ease-in-out infinite",
    fx: fx.corner(`radial-gradient(40% 40% at 0% 0%, ${rgba("#ff6fd8", 0.3)}, transparent 70%), radial-gradient(40% 40% at 100% 100%, ${rgba("#6a3cff", 0.34)}, transparent 70%)`, "50% 50%", 4.5),
  },
  {
    slug: "kraliyet-moru", rarity: "epic",
    name: "Kraliyet Moru|Royal Violet|Königsviolett|Violeta real|Violet royal|Violeta real|Королевский фиолет",
    desc: "Mor ve altın çift hat, kartın üstünden ağır bir parıltı.|A double line of violet and gold under a slow regal gleam.|Eine Doppellinie aus Violett und Gold unter langsamem Glanz.|Doble línea violeta y oro bajo un brillo lento y regio.|Une double ligne violet et or sous un lent reflet royal.|Linha dupla violeta e ouro sob um brilho lento.|Двойная линия фиолета и золота под медленным бликом.",
    bloom: bloom("#9a5cff", "#4a1d8a"), inner: inner.bottom("#7a3cd8", 0.3),
    rim: rim.double("#f3d27a", "#9a5cff"), fx: fx.sheen("#f3d27a", 8, 0.14),
  },
  {
    slug: "tropik-lagun", rarity: "rare",
    name: "Tropik Lagün|Tropic Lagoon|Tropenlagune|Laguna tropical|Lagon tropical|Lagoa tropical|Тропическая лагуна",
    desc: "Turkuaz su ışığı kartın içinde dalgalanır.|Turquoise water light ripples through the card.|Türkisfarbenes Wasserlicht wogt durch die Karte.|Luz de agua turquesa ondula en la tarjeta.|Une lumière d'eau turquoise ondoie dans la carte.|Luz de água turquesa ondula no cartão.|Бирюзовые блики воды колышутся по карточке.",
    bloom: bloom("#2ee6d6", "#0a7a8a"), inner: inner.bottom("#22c8d8", 0.32),
    rim: rim.full("#a8fff4", "#1a9ab0", 180),
    fx: fx.drift(bands([`radial-gradient(22% 30% at 8% 88%, ${rgba("#7ffff0", 0.22)}, transparent 70%)`, `radial-gradient(18% 24% at 28% 96%, ${rgba("#2ee6d6", 0.24)}, transparent 70%)`, `radial-gradient(22% 30% at 58% 88%, ${rgba("#7ffff0", 0.22)}, transparent 70%)`, `radial-gradient(18% 24% at 78% 96%, ${rgba("#2ee6d6", 0.24)}, transparent 70%)`]), 18),
  },
  {
    slug: "gumus-yildiz", rarity: "rare",
    name: "Gümüş Yıldız|Silver Star|Silberstern|Estrella de plata|Étoile d'argent|Estrela de prata|Серебряная звезда",
    desc: "İki köşede gümüş yıldız parlamaları sırayla yanar.|Silver star flares wink in two corners.|Silberne Sternblitze funkeln in zwei Ecken.|Destellos de estrella plateada en dos esquinas.|Des éclats d'étoile argentés scintillent dans deux coins.|Brilhos de estrela prateada em dois cantos.|Серебряные звёзды вспыхивают в двух углах.",
    bloom: bloom("#e4ecff", "#6a7aa8", 0.75), inner: inner.top("#e4ecff", 0.14),
    rim: rim.duo("#ffffff", "#8a96b8"),
    fx: fx.motes(stars([[6, 7, 14, "rgba(255,255,255,0.95)"], [94, 93, 12, "rgba(230,236,255,0.9)"], [88, 6, 6, "rgba(230,236,255,0.8)"]]), 3.2),
  },
  {
    slug: "kizil-ay", rarity: "epic",
    name: "Kızıl Ay|Blood Moon|Blutmond|Luna de sangre|Lune de sang|Lua de sangue|Кровавая луна",
    desc: "Köşede kızıl bir ay doğar, kartı koyu kırmızıya boyar.|A crimson moon rises in the corner and tints the card.|Ein karmesinroter Mond geht in der Ecke auf und färbt die Karte.|Una luna carmesí sale en la esquina y tiñe la tarjeta.|Une lune pourpre se lève dans le coin et teinte la carte.|Uma lua carmesim nasce no canto e tinge o cartão.|В углу встаёт багровая луна и окрашивает карточку.",
    bloom: bloom("#ff4a4a", "#6a0a14"), inner: inner.top("#c81e2e", 0.3),
    rim: rim.duo("#ff9a8a", "#7a0f1c", 220),
    fx: fx.corner(`radial-gradient(circle at 92% 8%, ${rgba("#ffb0a0", 0.6)} 0 12px, ${rgba("#ff3a3a", 0.35)} 13px, ${rgba("#c81e2e", 0.14)} 40px, transparent 90px)`, "100% 0%", 6),
  },
  {
    slug: "sonsuz-prizma", rarity: "legendary",
    name: "Sonsuz Prizma|Endless Prism|Endloses Prisma|Prisma infinito|Prisme infini|Prisma infinito|Бесконечная призма",
    desc: "Tayf renkleri kenarda akar, kartın içinden prizma ışıkları süzülür.|Spectral colours run the edge as prism light drifts inside.|Spektralfarben laufen an der Kante, Prismenlicht zieht hindurch.|Colores espectrales en el borde y luz de prisma dentro.|Des couleurs spectrales filent au bord, la lumière de prisme dérive.|Cores espectrais na borda e luz de prisma dentro.|Спектр бежит по кромке, внутри плывут призменные лучи.",
    bloom: [`0 0 0 1px rgba(255,255,255,0.35)`, `0 0 28px -4px ${rgba("#8a5bff", 0.5)}`, `0 26px 70px -22px ${rgba("#3bc8ff", 0.55)}`, `-18px -14px 48px -24px ${rgba("#ff3b6b", 0.45)}`, DEPTH], inner: inner.all("#8a5bff", 0.24),
    rim: rim.conic("#ff3b6b, #ffb13b 16%, #f6ff5a 32%, #3bff9d 48%, #3bc8ff 64%, #8a5bff 80%, #ff3b6b"), rimW: 2,
    fx: fx.drift(bands([`linear-gradient(115deg, transparent 4%, ${rgba("#ff3b6b", 0.12)} 8%, ${rgba("#f6ff5a", 0.12)} 11%, ${rgba("#3bc8ff", 0.12)} 14%, transparent 18%)`, `linear-gradient(115deg, transparent 54%, ${rgba("#ff3b6b", 0.12)} 58%, ${rgba("#f6ff5a", 0.12)} 61%, ${rgba("#3bc8ff", 0.12)} 64%, transparent 68%)`]), 16),
  },
];

module.exports = { AURA, DEPTH, bloom, inner, rim, fx, spots, stars, bands };
