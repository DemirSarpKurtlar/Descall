"use strict";

/**
 * avatar_effect: 16 set "profile effects" + 24 single effects.
 * Each spec: base (static glow + solid band under everything), before and
 * after (masked band layers, each may rotate / breathe). Layers only animate
 * transform and opacity. Names and descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { W, bandPos, rgba, dot, sparkle, ring, TUBE, GLOSS, GLOSS_SOFT, TUBE_LIGHT, comet } = require("./fx");

const spin = (s, extra = "") => `s2fx-spin ${s}s linear infinite${extra}`;
const spinRev = (s) => `s2fx-spin ${s}s linear infinite reverse`;

/** Hard-stop faceted conic ring (deterministic). */
function facets(colors, n, seed = 7) {
  let a = 0;
  let x = seed;
  const stops = [];
  for (let i = 0; i < n; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    const w = 360 / n * (0.55 + (x / 233280) * 0.9);
    const b = i === n - 1 ? 360 : Math.min(360, a + w);
    const c = colors[i % colors.length];
    stops.push(`${c} ${a.toFixed(1)}deg ${b.toFixed(1)}deg`);
    a = b;
  }
  return `conic-gradient(from 4deg, ${stops.join(", ")})`;
}

const glossSoft = GLOSS_SOFT;

const AVATAR = [
  // ── Set profile effects ──────────────────────────────────────────────
  {
    slug: "gece-limani-fener", set: "gece-limani", rarity: "legendary",
    name: "Fener Taraması|Beacon Sweep|Leuchtfeuer|Barrido del faro|Balayage du phare|Varredura do farol|Луч маяка",
    desc: "Bir fener ışığı lacivert halkada döner, sisli dalgaları yalar.|A lighthouse beam turns around a navy ring and skims the fog.|Ein Leuchtturmstrahl kreist um den marineblauen Ring durch den Nebel.|Un haz de faro gira por el aro marino y roza la niebla.|Un faisceau de phare tourne sur l'anneau marine et frôle la brume.|Um feixe de farol gira no anel marinho e roça a névoa.|Луч маяка обходит тёмно-синее кольцо и скользит по туману.",
    base: { solid: "#0e2550", glow: rgba("#35d0e0", 0.38) },
    before: { bg: `${glossSoft}, ${TUBE}, conic-gradient(from 210deg, #0b1b3a, #1e4b8f 25%, #3a86c8 45%, #1e4b8f 65%, #0b1b3a 85%, #0b1b3a)`, mask: "soft" },
    after: { bg: `${sparkle(0, "#ffffff", 1.2)}, conic-gradient(from -24deg, transparent 0deg, ${rgba("#35d0e0", 0.4)} 8deg, #e8f6ff 18deg, #ffffff 24deg, ${rgba("#35d0e0", 0.75)} 32deg, transparent 46deg, transparent 180deg, ${rgba("#35d0e0", 0.3)} 194deg, transparent 212deg)`, mask: "soft", anim: spin(6) },
  },
  {
    slug: "bakir-kervan-fenerler", set: "bakir-kervan", rarity: "legendary",
    name: "Fener Alayı|Lantern Procession|Laternenzug|Procesión de faroles|Procession de lanternes|Procissão de lanternas|Шествие фонарей",
    desc: "Üç pirinç fener bakır halkada titreyerek ilerler.|Three brass lanterns flicker along a copper ring.|Drei Messinglaternen flackern über einen Kupferring.|Tres faroles de latón titilan por un aro de cobre.|Trois lanternes de laiton vacillent sur un anneau de cuivre.|Três lanternas de latão tremulam num anel de cobre.|Три латунных фонаря мерцают на медном кольце.",
    base: { solid: "#5a2e14", glow: rgba("#f0a443", 0.36) },
    before: { bg: `${GLOSS}, ${TUBE}, conic-gradient(from 0deg, #7a3d17, #b5622b 12%, #f0a443 22%, #b5622b 34%, #7a3d17 48%, #b5622b 62%, #f0a443 74%, #b5622b 86%, #7a3d17)`, mask: "soft" },
    after: { bg: ring(3, 0, (d) => dot(d, "#ffe2b0", 0.5, rgba("#f0a443", 0.95))), mask: "soft", anim: `${spin(14)}, s2fx-twinkle 2.2s ease-in-out infinite` },
  },
  {
    slug: "orkide-sisi-isilti", set: "orkide-sisi", rarity: "legendary",
    name: "Orkide Işıltısı|Orchid Bloom|Orchideenschein|Flor de orquídea|Éclat d'orchidée|Brilho de orquídea|Сияние орхидеи",
    desc: "Biyolüminesan taç yapraklar mor sisin içinde yanıp söner.|Bioluminescent petals glow and fade in violet mist.|Biolumineszente Blüten glimmen im violetten Dunst.|Pétalos bioluminiscentes brillan en la bruma violeta.|Des pétales bioluminescents scintillent dans la brume violette.|Pétalas bioluminescentes brilham na névoa violeta.|Светящиеся лепестки мерцают в фиолетовой дымке.",
    base: { solid: "#2a1446", glow: rgba("#ff6fb5", 0.36) },
    before: { bg: `${TUBE}, conic-gradient(from 0deg, #8b3fd1, #ff6fb5 12%, #8b3fd1 25%, #5b2590 37%, #ff6fb5 50%, #8b3fd1 62%, #5b2590 75%, #ff6fb5 87%, #8b3fd1)`, mask: "soft", anim: spinRev(18) },
    after: { bg: ring(6, 15, (d, i) => dot(d, i % 2 ? "#c8ff6a" : "#ffd0ea", 0.4, rgba(i % 2 ? "#c8ff6a" : "#ff6fb5", 0.75))), mask: "soft", anim: `${spin(9)}, s2fx-twinkle 3s ease-in-out infinite` },
  },
  {
    slug: "kor-bahcesi-yapraklar", set: "kor-bahcesi", rarity: "legendary",
    name: "Kor Yaprakları|Ember Petals|Glutblätter|Pétalos de brasa|Pétales de braise|Pétalas de brasa|Лепестки углей",
    desc: "İç içe dönen alev dilleri bir kor çiçeği gibi açar.|Counter-turning tongues of flame open like an ember flower.|Gegenläufige Flammenzungen öffnen sich wie eine Glutblüte.|Lenguas de fuego en sentido opuesto se abren como una flor de brasa.|Des langues de feu contrarotatives s'ouvrent en fleur de braise.|Línguas de fogo em sentidos opostos abrem como flor de brasa.|Встречные языки пламени раскрываются огненным цветком.",
    base: { solid: "#3a0d06", glow: rgba("#ff6a2b", 0.45) },
    before: { bg: "repeating-conic-gradient(from 0deg, #a3220f 0deg, #ff6a2b 14deg, #ffd27a 20deg, #ff6a2b 26deg, #a3220f 40deg)", mask: "soft", anim: spin(3.2) },
    after: { bg: `repeating-conic-gradient(from 10deg, ${rgba("#ffd27a", 0)} 0deg, ${rgba("#ffe6b0", 0.9)} 9deg, ${rgba("#ff6a2b", 0)} 22deg, transparent 30deg)`, mask: "outer", anim: `s2fx-spin 2.1s linear infinite reverse, s2fx-flicker 1.6s linear infinite` },
  },
  {
    slug: "buzul-kristal", set: "buzul-sessizligi", rarity: "legendary",
    name: "Buz Kristali|Ice Facet|Eisfacette|Faceta de hielo|Facette de glace|Faceta de gelo|Ледяная грань",
    desc: "Kesme buz yüzeylerinde soğuk bir parıltı dolaşır.|A cold glint travels over cut ice facets.|Ein kalter Glanz wandert über geschliffene Eisflächen.|Un destello frío recorre facetas de hielo tallado.|Un éclat froid parcourt des facettes de glace taillée.|Um brilho frio percorre facetas de gelo lapidado.|Холодный блик скользит по граням льда.",
    base: { solid: "#0d3346", glow: rgba("#a6e7ff", 0.42) },
    before: { bg: `${glossSoft}, ${facets(["#a6e7ff", "#3a8fb7", "#e8f9ff", "#2a6f92", "#a6e7ff", "#ffffff", "#3a8fb7", "#7cc6e6"], 16, 11)}`, mask: "soft" },
    after: { bg: `${sparkle(350, "#ffffff", 1.1)}, conic-gradient(from 0deg, transparent 0 318deg, ${rgba("#ffffff", 0.95)} 348deg, transparent 360deg)`, mask: "soft", anim: "s2fx-spin 4.5s cubic-bezier(.6,0,.4,1) infinite" },
  },
  {
    slug: "neon-carsi-tabela", set: "neon-carsi", rarity: "legendary",
    name: "Tabela Işığı|Sign Glow|Leuchtreklame|Brillo de letrero|Lueur d'enseigne|Brilho de letreiro|Свет вывески",
    desc: "Pembe ve camgöbeği neon tüpler yağmurlu gecede vızıldar.|Pink and cyan neon tubes buzz through a rainy night.|Pinke und cyanfarbene Neonröhren summen in der Regennacht.|Tubos de neón rosa y cian zumban en la noche lluviosa.|Des tubes néon rose et cyan grésillent dans la nuit pluvieuse.|Tubos de neon rosa e ciano zumbem na noite chuvosa.|Розовые и голубые неоновые трубки гудят под дождём.",
    base: { solid: "#2a0a26", glow: rgba("#ff2e88", 0.55) },
    before: { bg: "linear-gradient(160deg, #ffb3d6, #ff2e88 40%, #d01a6c)", mask: "outer", anim: "s2fx-flicker 3.6s linear infinite" },
    after: { bg: `${dot(300, "#fff04a", 0.4, rgba("#fff04a", 0.8))}, repeating-conic-gradient(from 0deg, #2ef2ff 0deg 20deg, transparent 20deg 30deg)`, mask: "inner", anim: `${spin(20)}, s2fx-flicker 4.4s linear -1.3s infinite` },
  },
  {
    slug: "altin-hasat-basak", set: "altin-hasat", rarity: "legendary",
    name: "Başak Tacı|Wheat Crown|Ährenkrone|Corona de trigo|Couronne de blé|Coroa de trigo|Венец колосьев",
    desc: "Altın başaklar halka boyunca dizilir, akşam güneşi üstünden geçer.|Golden grains line the ring as late sun passes over them.|Goldene Ähren säumen den Ring, die Abendsonne streift sie.|Espigas doradas bordean el aro y el sol de la tarde las roza.|Des épis dorés bordent l'anneau sous le soleil du soir.|Espigas douradas cercam o anel sob o sol da tarde.|Золотые колосья по кругу, по ним скользит закатное солнце.",
    base: { solid: "#3a2c08", glow: rgba("#f2c230", 0.36) },
    before: { bg: `${glossSoft}, ${TUBE}, repeating-conic-gradient(from 0deg, #f2c230 0deg 6deg, #8a6a12 6deg 9deg, #fff3c4 9deg 11deg, #8a6a12 11deg 15deg)`, mask: "soft", anim: spin(40) },
    after: { bg: comet(0, "#fff3c4", 70, "#ffffff"), mask: "soft", anim: "s2fx-spin 6s ease-in-out infinite" },
  },
  {
    slug: "mor-sis-pece", set: "mor-sis", rarity: "legendary",
    name: "Bulutsu Peçe|Nebula Veil|Nebelschleier|Velo de nebulosa|Voile de nébuleuse|Véu de nebulosa|Вуаль туманности",
    desc: "İki yumuşak mor sis katmanı ters yönde süzülür.|Two soft violet haze layers drift in opposite directions.|Zwei weiche violette Dunstschichten treiben gegeneinander.|Dos capas de bruma violeta flotan en sentidos opuestos.|Deux voiles de brume violette dérivent en sens inverse.|Duas camadas de névoa violeta flutuam em sentidos opostos.|Два слоя фиолетовой дымки плывут навстречу друг другу.",
    base: { solid: "#1f1340", glow: rgba("#a77bff", 0.42) },
    before: { bg: "conic-gradient(from 0deg, #4b2a9c, #a77bff 20%, #e6dcff 28%, #a77bff 36%, #4b2a9c 55%, #2b1860 75%, #4b2a9c)", mask: "soft", anim: spin(16) },
    after: { bg: `${sparkle(40, "#ffffff", 0.9)}, ${sparkle(220, "#e6dcff", 0.7)}, conic-gradient(from 90deg, ${rgba("#e6dcff", 0)} 0%, ${rgba("#e6dcff", 0.6)} 15%, ${rgba("#a77bff", 0)} 35%, ${rgba("#e6dcff", 0)} 50%, ${rgba("#e6dcff", 0.5)} 65%, ${rgba("#a77bff", 0)} 85%)`, mask: "soft", anim: `s2fx-spin 11s linear infinite reverse, s2fx-breathe 5s ease-in-out infinite` },
  },
  {
    slug: "gece-mercani-resif", set: "gece-mercani", rarity: "legendary",
    name: "Mercan Işıltısı|Reef Glow|Riffglühen|Brillo de arrecife|Lueur de récif|Brilho de recife|Сияние рифа",
    desc: "Gece resifinde mercan polipleri sırayla parlar.|Coral polyps light up one by one on a night reef.|Korallenpolypen leuchten nacheinander im Nachtriff auf.|Pólipos de coral se encienden en el arrecife nocturno.|Des polypes de corail s'allument sur le récif de nuit.|Pólipos de coral acendem no recife noturno.|Коралловые полипы загораются на ночном рифе.",
    base: { solid: "#2a0f2c", glow: rgba("#d6336c", 0.42) },
    before: { bg: `${glossSoft}, ${TUBE}, conic-gradient(from 0deg, #7c5cff, #d6336c 30%, #ff8fab 45%, #d6336c 60%, #7c5cff 85%, #7c5cff)`, mask: "soft" },
    after: { bg: ring(9, 0, (d, i) => dot(d, i % 3 === 0 ? "#ffe3ec" : "#ff8fab", i % 3 === 0 ? 0.42 : 0.3, rgba("#ff8fab", 0.6))), mask: "soft", anim: `${spin(30)}, s2fx-twinkle 2.6s ease-in-out infinite` },
  },
  {
    slug: "kuzey-isigi-perde", set: "kuzey-isigi", rarity: "mythic",
    name: "Kutup Perdesi|Aurora Curtain|Polarlichtvorhang|Cortina de aurora|Rideau d'aurore|Cortina de aurora|Занавес сияния",
    desc: "Yeşilden mora akan kutup ışığı ince perdelerle titreşir.|Polar light flows green to violet in fine shimmering curtains.|Polarlicht fließt von Grün zu Violett in feinen Vorhängen.|Luz polar fluye de verde a violeta en cortinas finas.|Une lumière polaire passe du vert au violet en fins rideaux.|Luz polar flui do verde ao violeta em cortinas finas.|Полярный свет переливается от зелёного к фиолетовому.",
    base: { solid: "#06261f", glow: rgba("#6effc7", 0.4) },
    before: { bg: "conic-gradient(from 0deg, #14a37f, #6effc7 18%, #8f7bff 38%, #14a37f 55%, #6effc7 72%, #8f7bff 88%, #14a37f)", mask: "soft", anim: spin(12) },
    after: { bg: `repeating-conic-gradient(from 0deg, ${rgba("#e6fff5", 0)} 0deg, ${rgba("#e6fff5", 0.6)} 2deg, ${rgba("#e6fff5", 0)} 5deg, ${rgba("#e6fff5", 0)} 9deg)`, mask: "soft", anim: `s2fx-spin 26s linear infinite reverse, s2fx-breathe 4s ease-in-out infinite` },
  },
  {
    slug: "zumrut-orman-bocekler", set: "zumrut-orman", rarity: "legendary",
    name: "Ateş Böcekleri|Firefly Ring|Glühwürmchenring|Anillo de luciérnagas|Anneau de lucioles|Anel de vaga-lumes|Кольцо светлячков",
    desc: "Derin orman yeşilinde ateş böcekleri dolaşıp yanıp söner.|Fireflies wander and blink over deep forest green.|Glühwürmchen ziehen blinkend über tiefes Waldgrün.|Luciérnagas vagan y parpadean sobre verde bosque.|Des lucioles errent et clignotent sur un vert forêt.|Vaga-lumes vagam e piscam sobre verde floresta.|Светлячки кружат и мигают над лесной зеленью.",
    base: { solid: "#0b2a18", glow: rgba("#49d17d", 0.32) },
    before: { bg: `${glossSoft}, ${TUBE}, conic-gradient(from 0deg, #0f3d24, #1f7a46 25%, #2f9a5c 50%, #1f7a46 75%, #0f3d24)`, mask: "soft" },
    after: { bg: [20, 88, 150, 236, 300].map((d) => dot(d, "#eaffb0", 0.38, rgba("#c8ff78", 0.85))).join(", "), mask: "soft", anim: `${spin(22)}, s2fx-twinkle 1.7s ease-in-out infinite` },
  },
  {
    slug: "kum-saati-akis", set: "kum-saati", rarity: "legendary",
    name: "Kum Akışı|Sand Flow|Sandfluss|Flujo de arena|Flux de sable|Fluxo de areia|Поток песка",
    desc: "Fildişi halkada ince kum taneleri sessizce akar.|Fine grains of sand flow quietly around an ivory ring.|Feiner Sand rieselt still um einen Elfenbeinring.|Granos finos de arena fluyen por un aro de marfil.|Un sable fin s'écoule autour d'un anneau d'ivoire.|Grãos finos de areia correm num anel de marfim.|Мелкий песок тихо течёт по кольцу слоновой кости.",
    base: { solid: "#3d2c17", glow: rgba("#e8cf9a", 0.3) },
    before: { bg: `conic-gradient(from -3deg, #fff8e8 0 6deg, transparent 6deg 177deg, #fff8e8 177deg 183deg, transparent 183deg), ${glossSoft}, ${TUBE}, conic-gradient(from 0deg, #e8cf9a, #9c7a4a 25%, #e8cf9a 50%, #9c7a4a 75%, #e8cf9a)`, mask: "soft" },
    after: { bg: `repeating-conic-gradient(from 0deg, ${rgba("#fff8e8", 0.95)} 0deg 0.9deg, transparent 0.9deg 4.5deg)`, mask: "inner", anim: spin(9) },
  },
  {
    slug: "firtina-simsek", set: "firtina-cekirdegi", rarity: "mythic",
    name: "Şimşek Halkası|Storm Ring|Gewitterring|Anillo de tormenta|Anneau d'orage|Anel da tempestade|Грозовое кольцо",
    desc: "Çelik bulut halkasında şimşekler aniden çakar.|Lightning cracks suddenly across a steel cloud ring.|Blitze zucken plötzlich über einen stahlgrauen Wolkenring.|Relámpagos estallan en un aro de nubes de acero.|Des éclairs fendent soudain un anneau de nuages d'acier.|Raios estalam de repente num anel de nuvens de aço.|Молнии вспыхивают на стальном облачном кольце.",
    base: { solid: "#1a2236", glow: rgba("#7aa7ff", 0.42) },
    before: { bg: `conic-gradient(from 70deg, transparent 0 8deg, ${rgba("#9cc0ff", 0.7)} 8deg 9deg, transparent 9deg 120deg, ${rgba("#9cc0ff", 0.6)} 120deg 121deg, transparent 121deg 230deg, ${rgba("#9cc0ff", 0.65)} 230deg 231.5deg, transparent 231.5deg), ${glossSoft}, ${TUBE}, conic-gradient(from 0deg, #3b4a6b, #6a7fae 20%, #2a3550 40%, #586ea0 60%, #2a3550 80%, #3b4a6b)`, mask: "soft" },
    after: { bg: "conic-gradient(from 0deg, transparent 0 40deg, #f5f9ff 40deg 42deg, #7aa7ff 42deg 46deg, transparent 46deg 150deg, #f5f9ff 150deg 151.5deg, #7aa7ff 151.5deg 156deg, transparent 156deg 262deg, #f5f9ff 262deg 264deg, #7aa7ff 264deg 267deg, transparent 267deg)", mask: "soft", anim: "s2fx-flash 2.8s linear infinite, s2fx-spin 8.4s steps(3) infinite" },
  },
  {
    slug: "lav-catlagi", set: "lav-akisi", rarity: "mythic",
    name: "Magma Çatlağı|Magma Rift|Magmariss|Grieta de magma|Faille de magma|Fenda de magma|Магмовый разлом",
    desc: "Kara kaya halkanın çatlaklarından erimiş lav nabız gibi atar.|Molten lava pulses through cracks in a black rock ring.|Geschmolzene Lava pulsiert durch Risse im schwarzen Fels.|Lava fundida late por las grietas de un aro de roca negra.|La lave pulse dans les fissures d'un anneau de roche noire.|Lava derretida pulsa pelas fendas de um anel de rocha.|Расплавленная лава пульсирует в трещинах чёрного камня.",
    base: { solid: "#2a0606", glow: rgba("#ff3d00", 0.48) },
    before: { bg: `${TUBE}, conic-gradient(from 0deg, #2a0a08, #3d0d0a 20%, #1e0606 35%, #451010 60%, #250707 80%, #2a0a08)`, mask: "soft" },
    after: { bg: "repeating-conic-gradient(from 0deg, transparent 0deg 17deg, #ffb000 17deg 18.5deg, #ff3d00 18.5deg 21deg, transparent 21deg 33deg, #ff3d00 33deg 34.5deg, transparent 34.5deg 47deg)", mask: "soft", anim: "s2fx-breathe 2.4s ease-in-out infinite, s2fx-spin 60s linear infinite" },
  },
  {
    slug: "inci-sedef", set: "inci-kiyisi", rarity: "legendary",
    name: "Sedef Halka|Nacre Ring|Perlmuttring|Anillo de nácar|Anneau de nacre|Anel de nácar|Перламутровое кольцо",
    desc: "İnci, kabuk ve köpük tonları yavaşça döner.|Pearl, shell and foam tones turn slowly.|Perl-, Muschel- und Schaumtöne drehen sich langsam.|Tonos de perla, concha y espuma giran despacio.|Des tons de perle, de coquillage et d'écume tournent lentement.|Tons de pérola, concha e espuma giram devagar.|Оттенки жемчуга, ракушки и пены медленно кружатся.",
    base: { solid: "#2c3a42", glow: rgba("#ffd8e4", 0.32) },
    before: { bg: `${TUBE_LIGHT}, conic-gradient(from 0deg, #f1e9e1, #ffd8e4 15%, #cfe3ef 30%, #f1e9e1 45%, #e2d4f2 60%, #ffd8e4 75%, #d9efe6 88%, #f1e9e1)`, mask: "soft", anim: spin(14) },
    after: { bg: `${sparkle(315, "#ffffff", 1)}, ${GLOSS}`, mask: "soft", op: 0.9 },
  },
  {
    slug: "yildiz-tozu-hale", set: "yildiz-tozu", rarity: "mythic",
    name: "Yıldız Tozu Halesi|Stardust Halo|Sternenstaub-Halo|Halo de polvo estelar|Halo de poussière d'étoiles|Halo de poeira estelar|Ореол звёздной пыли",
    desc: "Galaksi tozu halkasında altın bir kuyruklu yıldız koşar.|A golden comet races through a ring of galaxy dust.|Ein goldener Komet jagt durch einen Ring aus Sternenstaub.|Un cometa dorado recorre un anillo de polvo galáctico.|Une comète dorée file dans un anneau de poussière galactique.|Um cometa dourado corre num anel de poeira galáctica.|Золотая комета мчится по кольцу галактической пыли.",
    base: { solid: "#160f3a", glow: rgba("#c6b7ff", 0.4) },
    before: { bg: `${ring(14, 7, (d, i) => dot(d, i % 4 === 0 ? "#ffe9a8" : "#c6b7ff", i % 4 === 0 ? 0.26 : 0.16))}, conic-gradient(from 0deg, #2b1f6e, #3c2d8f 30%, #1c1450 55%, #3c2d8f 80%, #2b1f6e)`, mask: "soft", anim: spin(30) },
    after: { bg: `${sparkle(0, "#fffbe9", 0.9)}, ${comet(0, "#ffe9a8", 110, "#fffbe9")}`, mask: "soft", anim: spin(4.8) },
  },

  // ── Single effects ───────────────────────────────────────────────────
  {
    slug: "kuyruklu-yildiz", rarity: "rare",
    name: "Kuyruklu Yıldız|Comet Tail|Kometenschweif|Cola de cometa|Queue de comète|Cauda de cometa|Хвост кометы",
    desc: "Parlak bir kuyruklu yıldız uzun izini avatarının çevresinde sürükler.|A bright comet drags its long tail around your avatar.|Ein heller Komet zieht seinen Schweif um deinen Avatar.|Un cometa brillante arrastra su cola alrededor de tu avatar.|Une comète brillante traîne sa longue queue autour de ton avatar.|Um cometa brilhante arrasta a cauda em volta do avatar.|Яркая комета ведёт длинный хвост вокруг аватара.",
    base: { solid: "#10263a", glow: rgba("#78dcff", 0.32) },
    before: { bg: `linear-gradient(${rgba("#8cd2ff", 0.2)}, ${rgba("#8cd2ff", 0.12)})`, mask: "band" },
    after: { bg: `${sparkle(0, "#e6f9ff", 1)}, ${comet(0, "#6fd6ff", 150)}`, mask: "soft", anim: "s2fx-spin 2.6s cubic-bezier(.45,.05,.55,.95) infinite" },
  },
  {
    slug: "ikiz-yorunge", rarity: "common",
    name: "İkiz Yörünge|Twin Orbit|Doppelorbit|Órbita gemela|Orbite jumelle|Órbita gêmea|Двойная орбита",
    desc: "Pembe ve camgöbeği iki ışık zıt yönlerde döner.|A pink and a cyan light circle in opposite directions.|Ein pinkes und ein cyanes Licht kreisen gegenläufig.|Una luz rosa y otra cian giran en sentidos opuestos.|Une lumière rose et une cyan tournent en sens inverse.|Uma luz rosa e outra ciano giram em sentidos opostos.|Розовый и голубой огни кружат навстречу друг другу.",
    base: { solid: "#2a2148", glow: rgba("#ff5ad1", 0.3) },
    before: { bg: `${dot(0, "#ffd1f3", 0.62, rgba("#ff5ad1", 0.9))}, ${comet(0, "#ff5ad1", 90, "#ffd1f3")}`, mask: "soft", anim: spin(3.2) },
    after: { bg: `${dot(180, "#d6fbff", 0.62, rgba("#3de8ff", 0.9))}, ${comet(180, "#3de8ff", 90, "#d6fbff")}`, mask: "soft", anim: "s2fx-spin 4.8s linear infinite reverse" },
  },
  {
    slug: "saat-mekanizmasi", rarity: "epic",
    name: "Saat Mekanizması|Clockwork|Uhrwerk|Mecanismo de reloj|Mécanisme d'horloge|Mecanismo de relógio|Часовой механизм",
    desc: "Pirinç dişliler tık tık döner, saniye ibresi ilerler.|Brass gear teeth tick round while a second hand sweeps.|Messingzähne ticken, ein Sekundenzeiger läuft mit.|Dientes de latón avanzan a golpes con un segundero.|Des dents de laiton cliquettent, une trotteuse avance.|Dentes de latão avançam em tique-taque com um ponteiro.|Латунные зубцы тикают, бежит секундная стрелка.",
    base: { solid: "#2a2210", glow: rgba("#ffc850", 0.24) },
    before: { bg: `${TUBE}, repeating-conic-gradient(from 0deg, #e9c46a 0deg 7deg, #6f5219 7deg 15deg)`, mask: "outer", anim: "s2fx-spin 24s steps(48) infinite" },
    after: { bg: `conic-gradient(from -2deg, #fff6d6 0 4deg, transparent 4deg), ${GLOSS}, conic-gradient(from 0deg, #b88a2e, #f3d37a 25%, #b88a2e 50%, #f3d37a 75%, #b88a2e)`, mask: "inner", anim: "s2fx-spin 6s steps(12) infinite" },
  },
  {
    slug: "ruh-alevi", rarity: "epic",
    name: "Ruh Alevi|Spirit Flame|Geisterflamme|Llama espiritual|Flamme spectrale|Chama espiritual|Призрачное пламя",
    desc: "Turkuaz ruh alevleri derin camgöbeği halkadan yükselir.|Turquoise spirit flames rise from a deep teal ring.|Türkise Geisterflammen steigen aus einem tiefen Ring.|Llamas turquesa se elevan de un aro verde azulado.|Des flammes turquoise s'élèvent d'un anneau sarcelle.|Chamas turquesa sobem de um anel azul petróleo.|Бирюзовое пламя поднимается из глубокого кольца.",
    base: { solid: "#062a33", glow: rgba("#40f0dc", 0.42) },
    before: { bg: `${TUBE}, conic-gradient(from 0deg, #053a46, #0b6f8a 30%, #0a4f61 60%, #0b6f8a 85%, #053a46)`, mask: "soft" },
    after: { bg: `repeating-conic-gradient(from 0deg, ${rgba("#3ff0d8", 0)} 0deg, ${rgba("#3ff0d8", 0.85)} 30deg, ${rgba("#e6fffb", 1)} 38deg, ${rgba("#3ff0d8", 0)} 60deg)`, mask: "soft", anim: "s2fx-spin 4s linear infinite, s2fx-flicker 2.2s linear infinite" },
  },
  {
    slug: "prizma-kirilmasi", rarity: "epic",
    name: "Prizma Kırılması|Prism Break|Prismenbruch|Refracción prismática|Réfraction prismatique|Refração prismática|Призменный излом",
    desc: "Cam halkada ince bir gökkuşağı tayfı dolaşır.|A thin rainbow spectrum circles a clear glass ring.|Ein schmales Spektrum umrundet einen Glasring.|Un fino espectro arcoíris rodea un aro de cristal.|Un fin spectre arc-en-ciel parcourt un anneau de verre.|Um fino espectro arco-íris circula num anel de vidro.|Тонкий радужный спектр бежит по стеклянному кольцу.",
    base: { solid: "#2a2f3d", glow: rgba("#ffffff", 0.16) },
    before: { bg: `${GLOSS}, linear-gradient(${rgba("#ffffff", 0.16)}, ${rgba("#ffffff", 0.06)})`, mask: "soft" },
    after: { bg: "conic-gradient(from 0deg, transparent 0 258deg, #ff3b6b 272deg, #ffb13b 284deg, #f6ff5a 294deg, #3bff9d 306deg, #3bc8ff 318deg, #8a5bff 330deg, transparent 346deg)", mask: "soft", anim: spin(3.4) },
  },
  {
    slug: "kalp-atisi", rarity: "epic",
    name: "Kalp Atışı|Heartbeat|Herzschlag|Latido|Battement de cœur|Batimento|Сердцебиение",
    desc: "Yakut halka çift vuruşla atar; her vuruşta parlar.|A ruby ring beats in a double pulse and flares each time.|Ein Rubinring schlägt im Doppelpuls und glüht jedes Mal.|Un aro de rubí late en doble pulso y se enciende.|Un anneau rubis bat en double pulsation et s'embrase.|Um anel rubi bate em pulso duplo e acende a cada vez.|Рубиновое кольцо бьётся двойным пульсом и вспыхивает.",
    base: { solid: "#4a0a1a", glow: rgba("#ff3c64", 0.5) },
    before: { bg: `${GLOSS}, ${TUBE}, conic-gradient(from 0deg, #a3132f, #ff3d64 25%, #a3132f 50%, #ff3d64 75%, #a3132f)`, mask: "soft" },
    after: { bg: "linear-gradient(160deg, #ffd6df, #ff4d73 60%, #ff9fb3)", mask: "outer", anim: "s2fx-beat 1.4s ease-out infinite" },
  },
  {
    slug: "gunes-taci", rarity: "legendary",
    name: "Güneş Tacı|Solar Crown|Sonnenkrone|Corona solar|Couronne solaire|Coroa solar|Солнечная корона",
    desc: "Altın ışınlar döner, korona nefes alır gibi parlar.|Golden rays turn while the corona glows like a breath.|Goldene Strahlen kreisen, die Korona atmet Licht.|Rayos dorados giran mientras la corona respira luz.|Des rayons dorés tournent, la couronne respire la lumière.|Raios dourados giram e a coroa respira luz.|Золотые лучи вращаются, корона дышит светом.",
    base: { solid: "#4a2a05", glow: rgba("#ffbe3c", 0.52) },
    before: { bg: "repeating-conic-gradient(from 0deg, #ffd25a 0deg 4deg, #ff8a1c 4deg 9deg, #fff0b8 9deg 10deg, #c2410c 10deg 15deg)", mask: "soft", anim: spin(30) },
    after: { bg: `${GLOSS}, radial-gradient(farthest-side, transparent calc(100% - ${W}), ${rgba("#fff0c8", 0.85)} calc(100% - ${W} * 0.5), transparent 100%)`, mask: "band", anim: "s2fx-breathe 3s ease-in-out infinite" },
  },
  {
    slug: "gelgit", rarity: "rare",
    name: "Gelgit|Tidal Ring|Gezeitenring|Anillo de marea|Anneau de marée|Anel de maré|Кольцо прилива",
    desc: "Derin deniz ve köpük halkada bir ileri bir geri çalkalanır.|Deep sea and foam slosh back and forth around the ring.|Tiefsee und Gischt schwappen im Ring hin und her.|Mar profundo y espuma oscilan de un lado a otro.|Mer profonde et écume oscillent d'avant en arrière.|Mar profundo e espuma balançam de um lado a outro.|Глубина и пена перекатываются по кольцу.",
    base: { solid: "#072a3a", glow: rgba("#50c8ff", 0.3) },
    before: { bg: `${sparkle(172, "#e8fbff", 0.8)}, ${sparkle(194, "#e8fbff", 0.6)}, ${TUBE}, conic-gradient(from 0deg, #053047 0deg, #0b5f86 90deg, #2fb4d9 158deg, #d9f6ff 180deg, #2fb4d9 202deg, #0b5f86 270deg, #053047 360deg)`, mask: "soft", anim: "s2fx-sway 6s ease-in-out infinite alternate" },
    after: { bg: GLOSS, mask: "soft", op: 0.6 },
  },
  {
    slug: "zehir-sarmali", rarity: "rare",
    name: "Zehir Sarmalı|Venom Coil|Giftspirale|Espiral de veneno|Spirale venimeuse|Espiral venenosa|Ядовитая спираль",
    desc: "İki zehir yeşili şerit birbirine örülerek döner.|Two venom green strands braid around each other.|Zwei giftgrüne Stränge flechten sich ineinander.|Dos hebras verde veneno se trenzan entre sí.|Deux brins vert venin se tressent l'un dans l'autre.|Duas fitas verde veneno se trançam girando.|Две ядовито-зелёные нити сплетаются в косу.",
    base: { solid: "#1d3d0a", glow: rgba("#a0ff3c", 0.36) },
    before: { bg: "repeating-conic-gradient(from 0deg, #b6ff3b 0deg 10deg, transparent 10deg 30deg)", mask: "soft", anim: spin(5) },
    after: { bg: `${TUBE}, repeating-conic-gradient(from 15deg, #2e7d0f 0deg 10deg, transparent 10deg 30deg)`, mask: "soft", anim: "s2fx-spin 5s linear infinite reverse" },
  },
  {
    slug: "ametist-tac", rarity: "epic",
    name: "Ametist Taç|Amethyst Crown|Amethystkrone|Corona de amatista|Couronne d'améthyste|Coroa de ametista|Аметистовый венец",
    desc: "Kesme ametist yüzeyler ve sekiz parlak taş halkayı süsler.|Cut amethyst facets set with eight bright stones.|Geschliffene Amethystflächen mit acht hellen Steinen.|Facetas de amatista con ocho piedras brillantes.|Facettes d'améthyste serties de huit pierres vives.|Facetas de ametista com oito pedras brilhantes.|Грани аметиста с восемью яркими камнями.",
    base: { solid: "#2a1048", glow: rgba("#be78ff", 0.4) },
    before: { bg: `${glossSoft}, ${facets(["#6a2bb8", "#b07cff", "#3d1670", "#e2c6ff", "#8a46e0", "#5a2096"], 14, 3)}`, mask: "soft" },
    after: { bg: ring(8, 0, (d) => dot(d, "#f6e8ff", 0.32, rgba("#d6a0ff", 0.85))), mask: "soft", anim: "s2fx-twinkle 2.2s ease-in-out infinite" },
  },
  {
    slug: "devre-izi", rarity: "rare",
    name: "Devre İzi|Circuit Trace|Leiterbahn|Pista de circuito|Piste de circuit|Trilha de circuito|Дорожка схемы",
    desc: "Camgöbeği sinyaller devre yollarından düğüm düğüm akar.|Cyan signals race node to node along circuit traces.|Cyan Signale rasen von Knoten zu Knoten.|Señales cian corren de nodo en nodo por el circuito.|Des signaux cyan filent de nœud en nœud.|Sinais ciano correm de nó em nó pelo circuito.|Голубые сигналы бегут от узла к узлу.",
    base: { solid: "#06232a", glow: rgba("#28e6ff", 0.34) },
    before: { bg: `${ring(12, 0, (d) => dot(d, "#7ff6ff", 0.3))}, repeating-conic-gradient(from 0deg, #0e5a66 0deg 18deg, transparent 18deg 21deg, #0e5a66 21deg 27deg, transparent 27deg 30deg)`, mask: "soft" },
    after: { bg: `${comet(0, "#29e6ff", 60, "#e0fdff")}, ${comet(180, "#29e6ff", 60, "#e0fdff")}`, mask: "soft", anim: spin(2.2) },
  },
  {
    slug: "gul-yapraklari", rarity: "common",
    name: "Gül Yaprakları|Rose Petals|Rosenblätter|Pétalos de rosa|Pétales de rose|Pétalas de rosa|Лепестки роз",
    desc: "Altı gül yaprağı koyu gül halkasında süzülür.|Six rose petals drift around a deep rose ring.|Sechs Rosenblätter schweben um einen tiefroten Ring.|Seis pétalos flotan alrededor de un aro rosa oscuro.|Six pétales dérivent autour d'un anneau rose profond.|Seis pétalas flutuam num anel rosa escuro.|Шесть лепестков кружат по тёмно-розовому кольцу.",
    base: { solid: "#3a0c1c", glow: rgba("#ff6e96", 0.3) },
    before: { bg: `${glossSoft}, ${TUBE}, conic-gradient(from 0deg, #7a1838, #c2335e 30%, #7a1838 60%, #c2335e 85%, #7a1838)`, mask: "soft" },
    after: { bg: ring(6, 0, (d) => `radial-gradient(ellipse calc(${W} * 1.1) calc(${W} * 0.5) at ${bandPos(d)}, #ffd6e2, ${rgba("#ff8fb0", 0.8)} 45%, transparent 75%)`), mask: "soft", anim: spin(10) },
  },
  {
    slug: "yaldiz-bant", rarity: "legendary",
    name: "Yaldız Bant|Gilded Band|Vergoldetes Band|Banda dorada|Bande dorée|Faixa dourada|Позолоченный обод",
    desc: "Cilalı altın halkada keskin bir parıltı tur atar.|A sharp glint laps a polished band of gold.|Ein scharfer Glanz umrundet ein poliertes Goldband.|Un destello nítido recorre una banda de oro pulido.|Un éclat net fait le tour d'une bande d'or poli.|Um brilho nítido percorre uma faixa de ouro polido.|Яркий блик обегает полированный золотой обод.",
    base: { solid: "#3a2a0a", glow: rgba("#ffd26e", 0.3) },
    before: { bg: `${GLOSS}, ${TUBE}, conic-gradient(from 0deg, #8a6416, #f7dc8b 12%, #b8892a 25%, #fff1c2 38%, #a77a1f 50%, #f7dc8b 62%, #8a6416 75%, #f3d27a 88%, #8a6416)`, mask: "soft" },
    after: { bg: `${sparkle(352, "#ffffff", 1.1)}, conic-gradient(from 0deg, transparent 0 336deg, ${rgba("#ffffff", 0.92)} 352deg, transparent 360deg)`, mask: "soft", anim: "s2fx-spin 3.8s cubic-bezier(.7,0,.3,1) infinite" },
  },
  {
    slug: "gumus-hilal", rarity: "rare",
    name: "Gümüş Hilal|Silver Crescent|Silbersichel|Creciente plateada|Croissant d'argent|Crescente prateado|Серебряный полумесяц",
    desc: "Gümüş halkada ay evreleri yavaşça değişir.|Moon phases change slowly over a silver ring.|Mondphasen wechseln langsam auf einem Silberring.|Las fases lunares cambian despacio en un aro de plata.|Les phases de lune changent lentement sur un anneau d'argent.|Fases da lua mudam devagar num anel de prata.|Фазы луны медленно сменяются на серебряном кольце.",
    base: { solid: "#232a36", glow: rgba("#dce6ff", 0.3) },
    before: { bg: `${GLOSS}, ${TUBE}, conic-gradient(from 0deg, #8a94a8, #eef3ff 20%, #6c7689 45%, #dfe6f5 70%, #8a94a8)`, mask: "soft" },
    after: { bg: `conic-gradient(from 0deg, ${rgba("#0a0e18", 0.85)} 0 150deg, ${rgba("#0a0e18", 0)} 210deg, ${rgba("#0a0e18", 0)} 330deg, ${rgba("#0a0e18", 0.85)} 360deg)`, mask: "soft", anim: spin(16) },
  },
  {
    slug: "olay-ufku", rarity: "legendary",
    name: "Olay Ufku|Event Horizon|Ereignishorizont|Horizonte de sucesos|Horizon des événements|Horizonte de eventos|Горизонт событий",
    desc: "Kızgın bir toplanma diski karanlığın kenarında döner.|A blazing accretion disk spins at the edge of darkness.|Eine glühende Akkretionsscheibe kreist am Rand der Dunkelheit.|Un disco de acreción ardiente gira al borde de la oscuridad.|Un disque d'accrétion brûlant tourne au bord des ténèbres.|Um disco de acreção ardente gira à beira da escuridão.|Раскалённый аккреционный диск кружит на краю тьмы.",
    base: { solid: "#050308", glow: rgba("#ff8c28", 0.46) },
    before: { bg: "conic-gradient(from 0deg, #1a0a02, #ff7a18 15%, #ffe2a8 22%, #ff7a18 30%, #3a1004 50%, #ff9a3c 70%, #1a0a02 90%)", mask: "soft", anim: spin(2.4) },
    after: { bg: `radial-gradient(farthest-side, transparent calc(100% - ${W}), #000 calc(100% - ${W} * 0.8), transparent calc(100% - ${W} * 0.55), ${rgba("#fff0dc", 0.9)} calc(100% - ${W} * 0.2), transparent 100%)`, mask: "band" },
  },
  {
    slug: "plazma-arki", rarity: "epic",
    name: "Plazma Arkı|Plasma Arc|Plasmabogen|Arco de plasma|Arc de plasma|Arco de plasma|Плазменная дуга",
    desc: "Magenta ve camgöbeği plazma, kıvılcım arklarıyla çatırdar.|Magenta and cyan plasma crackles with sparking arcs.|Magenta- und Cyanplasma knistert mit Funkenbögen.|Plasma magenta y cian chisporrotea con arcos.|Un plasma magenta et cyan crépite d'arcs électriques.|Plasma magenta e ciano estala com arcos de faísca.|Пурпурная и голубая плазма трещит искровыми дугами.",
    base: { solid: "#1a0820", glow: rgba("#ff3cdc", 0.42) },
    before: { bg: "conic-gradient(from 0deg, #ff2fd6, #5b2cff 25%, #2fe1ff 50%, #5b2cff 75%, #ff2fd6)", mask: "soft", anim: spin(4) },
    after: { bg: "conic-gradient(from 0deg, transparent 0 30deg, #ffffff 30deg 32deg, #ffb3f3 32deg 36deg, transparent 36deg 130deg, #ffffff 130deg 131deg, #b3f6ff 131deg 135deg, transparent 135deg 245deg, #ffffff 245deg 247deg, #ffb3f3 247deg 250deg, transparent 250deg)", mask: "soft", anim: "s2fx-flicker 0.9s linear infinite, s2fx-spin 1.6s steps(5) infinite" },
  },
  {
    slug: "kar-tanesi-yorunge", rarity: "common",
    name: "Kar Tanesi Yörüngesi|Snowflake Orbit|Schneeflockenorbit|Órbita de copos|Orbite de flocons|Órbita de flocos|Орбита снежинок",
    desc: "Altı kar tanesi buzlu bir halkada yavaşça döner.|Six snowflakes turn slowly on a frosted ring.|Sechs Schneeflocken drehen sich langsam auf Reif.|Seis copos giran despacio en un aro escarchado.|Six flocons tournent lentement sur un anneau givré.|Seis flocos giram devagar num anel gelado.|Шесть снежинок медленно кружат по инею.",
    base: { solid: "#1b2a3a", glow: rgba("#dcf0ff", 0.28) },
    before: { bg: `${GLOSS}, linear-gradient(${rgba("#dcf0ff", 0.34)}, ${rgba("#9cc8ec", 0.22)})`, mask: "soft" },
    after: { bg: ring(6, 0, (d) => sparkle(d, "#ffffff", 0.9)), mask: "soft", anim: spin(18) },
  },
  {
    slug: "kod-akisi", rarity: "rare",
    name: "Kod Akışı|Code Stream|Codestrom|Flujo de código|Flux de code|Fluxo de código|Поток кода",
    desc: "Yeşil sembol dizileri halka boyunca adım adım akar.|Green glyph runs step around the ring.|Grüne Zeichenketten laufen schrittweise um den Ring.|Cadenas de glifos verdes avanzan a pasos por el aro.|Des suites de glyphes verts avancent pas à pas.|Sequências de glifos verdes avançam em passos.|Зелёные символы шагают по кольцу.",
    base: { solid: "#04140a", glow: rgba("#3cff8c", 0.3) },
    before: { bg: "repeating-conic-gradient(from 0deg, #0a5c2a 0 3deg, transparent 3deg 5deg, #1fbf5a 5deg 7deg, transparent 7deg 11deg, #0a5c2a 11deg 12deg, transparent 12deg 16deg)", mask: "soft", anim: "s2fx-spin 20s steps(40) infinite" },
    after: { bg: comet(0, "#3dff8a", 80, "#d8ffe6"), mask: "soft", anim: "s2fx-spin 3s steps(24) infinite" },
  },
  {
    slug: "lav-lambasi", rarity: "epic",
    name: "Lav Lambası|Lava Lamp|Lavalampe|Lámpara de lava|Lampe à lave|Lâmpada de lava|Лава-лампа",
    desc: "Turuncu ve pembe kabarcıklar mor halkada ağır ağır süzülür.|Orange and pink blobs drift lazily through a purple ring.|Orange und pinke Blasen treiben träge durch Lila.|Burbujas naranja y rosa flotan lentas en un aro morado.|Des bulles orange et roses flottent dans un anneau violet.|Bolhas laranja e rosa flutuam num anel roxo.|Оранжевые и розовые капли лениво плывут по фиолетовому.",
    base: { solid: "#2a0f2e", glow: rgba("#ff7850", 0.32) },
    before: { bg: `radial-gradient(circle at ${bandPos(30)}, #ff8a3d 0, transparent calc(${W} * 2.2)), radial-gradient(circle at ${bandPos(160)}, #ff4fa3 0, transparent calc(${W} * 2.6)), radial-gradient(circle at ${bandPos(270)}, #ffb347 0, transparent calc(${W} * 2)), linear-gradient(#7a2a8e, #5a1d6e)`, mask: "soft", anim: spin(20) },
    after: { bg: `radial-gradient(circle at ${bandPos(100)}, ${rgba("#c23bff", 0.9)} 0, transparent calc(${W} * 2.4)), radial-gradient(circle at ${bandPos(220)}, ${rgba("#ff6b3d", 0.85)} 0, transparent calc(${W} * 2)), radial-gradient(circle at ${bandPos(330)}, ${rgba("#ff9ad5", 0.8)} 0, transparent calc(${W} * 1.8))`, mask: "soft", anim: "s2fx-spin 13s linear infinite reverse", op: 0.85 },
  },
  {
    slug: "hologram", rarity: "legendary",
    name: "Hologram|Hologram|Hologramm|Holograma|Hologramme|Holograma|Голограмма",
    desc: "Yanardöner bir hologram tarama çizgileriyle titreşir.|An iridescent hologram shimmers behind scan lines.|Ein schillerndes Hologramm flimmert hinter Scanlinien.|Un holograma iridiscente vibra tras líneas de escaneo.|Un hologramme irisé scintille derrière des lignes de balayage.|Um holograma iridescente cintila atrás de linhas.|Переливчатая голограмма мерцает за строками развёртки.",
    base: { solid: "#101826", glow: rgba("#96dcff", 0.34) },
    before: { bg: "conic-gradient(from 0deg, #ff7ce5, #7cf3ff, #b3ff7c, #fff27c, #ff7ce5)", mask: "soft", anim: spin(5), op: 0.92 },
    after: { bg: `repeating-conic-gradient(from 0deg, ${rgba("#ffffff", 0.6)} 0 1deg, transparent 1deg 6deg)`, mask: "soft", anim: "s2fx-spin 40s linear infinite reverse, s2fx-flicker 3s linear infinite" },
  },
  {
    slug: "firtina-ruzgari", rarity: "common",
    name: "Fırtına Rüzgârı|Gale Ring|Sturmböe|Anillo de vendaval|Anneau de bourrasque|Anel de vendaval|Кольцо шквала",
    desc: "Hızlı rüzgâr çizgileri halkayı iki katmanda yalar.|Fast wind streaks whip around the ring in two layers.|Schnelle Windstreifen peitschen in zwei Lagen um den Ring.|Rachas veloces azotan el aro en dos capas.|Des traits de vent rapides fouettent l'anneau sur deux couches.|Rajadas rápidas chicoteiam o anel em duas camadas.|Быстрые порывы хлещут по кольцу в два слоя.",
    base: { solid: "#2a3a4e", glow: rgba("#c8e6ff", 0.26) },
    before: { bg: `conic-gradient(from 0deg, transparent 0 20deg, ${rgba("#e6f5ff", 0.9)} 60deg, transparent 62deg, transparent 140deg, ${rgba("#e6f5ff", 0.7)} 175deg, transparent 177deg, transparent 250deg, ${rgba("#e6f5ff", 0.8)} 300deg, transparent 302deg)`, mask: "outer", anim: spin(1.6) },
    after: { bg: `conic-gradient(from 40deg, transparent 0 30deg, ${rgba("#bfe3ff", 0.8)} 70deg, transparent 72deg, transparent 190deg, ${rgba("#bfe3ff", 0.7)} 230deg, transparent 232deg)`, mask: "inner", anim: spin(2.4) },
  },
  {
    slug: "kehribar-isiltisi", rarity: "rare",
    name: "Kehribar Işıltısı|Amber Glow|Bernsteinschein|Brillo de ámbar|Lueur d'ambre|Brilho de âmbar|Янтарное сияние",
    desc: "Kehribarın içinde hapsolmuş ışık zerreleri parlar.|Specks of light trapped inside amber glimmer.|Im Bernstein gefangene Lichtpunkte glimmen.|Motas de luz atrapadas en ámbar centellean.|Des éclats de lumière pris dans l'ambre scintillent.|Pontos de luz presos no âmbar cintilam.|Пойманные в янтаре искры мерцают.",
    base: { solid: "#3a2205", glow: rgba("#ffaa28", 0.4) },
    before: { bg: `${GLOSS}, ${TUBE}, conic-gradient(from 0deg, #a35a07, #ffb02e 25%, #7a3f04 50%, #ffc25a 75%, #a35a07)`, mask: "soft" },
    after: { bg: [10, 62, 110, 168, 214, 268, 322].map((d) => dot(d, "#fff1c9", 0.22, rgba("#ffc85a", 0.7))).join(", "), mask: "soft", anim: "s2fx-spin 26s linear infinite reverse, s2fx-twinkle 2.4s ease-in-out infinite" },
  },
  {
    slug: "ekolayzer", rarity: "rare",
    name: "Ekolayzer|Equalizer|Equalizer|Ecualizador|Égaliseur|Equalizador|Эквалайзер",
    desc: "Mavi ses çubukları dönüşümlü olarak ritimle yanar.|Blue sound bars light up in alternating rhythm.|Blaue Klangbalken leuchten im Wechseltakt auf.|Barras de sonido azules se encienden por turnos.|Des barres sonores bleues s'allument en alternance.|Barras de som azuis acendem em ritmo alternado.|Синие полосы звука вспыхивают по очереди.",
    base: { solid: "#0f1730", glow: rgba("#587af5", 0.42) },
    before: { bg: "repeating-conic-gradient(from 0deg, #587af5 0 6deg, transparent 6deg 20deg)", mask: "soft", anim: "s2fx-breathe 0.9s ease-in-out infinite" },
    after: { bg: "repeating-conic-gradient(from 10deg, #c3d0ff 0 6deg, transparent 6deg 20deg)", mask: "soft", anim: "s2fx-breathe 0.9s ease-in-out -0.45s infinite" },
  },
  {
    slug: "sarmal-galaksi", rarity: "legendary",
    name: "Sarmal Galaksi|Spiral Galaxy|Spiralgalaxie|Galaxia espiral|Galaxie spirale|Galáxia espiral|Спиральная галактика",
    desc: "Parlak galaksi kolları yıldızlarla birlikte döner.|Bright galactic arms spin together with their stars.|Leuchtende Spiralarme drehen sich mit ihren Sternen.|Brazos galácticos brillantes giran con sus estrellas.|Des bras galactiques tournent avec leurs étoiles.|Braços galácticos brilhantes giram com suas estrelas.|Яркие рукава галактики кружат вместе со звёздами.",
    base: { solid: "#0d0a24", glow: rgba("#9678ff", 0.36) },
    before: { bg: "conic-gradient(from 0deg, #1a1450, #9a7bff 10%, #e9e1ff 13%, #3b2c8f 25%, #1a1450 50%, #9a7bff 60%, #e9e1ff 63%, #3b2c8f 75%, #1a1450)", mask: "soft", anim: spin(9) },
    after: { bg: ring(10, 12, (d, i) => (i % 3 === 0 ? sparkle(d, "#ffffff", 0.7) : dot(d, "#e9e1ff", 0.18))), mask: "soft", anim: "s2fx-spin 30s linear infinite reverse, s2fx-twinkle 3s ease-in-out infinite" },
  },
];

module.exports = { AVATAR };
