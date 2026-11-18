"use strict";

/**
 * profile_aura set pieces: one card atmosphere per Market 2.0 set (16), so a
 * set also dresses the profile card, not only the avatar. Same render spec as
 * ./aura.js (bloom, inner, rim, fx; the corner art is in ./aura-set-art.js),
 * drawn from the set palette [deep, mid, bright, light] and the set's motif.
 *
 * Rarity follows the set: epic in the legendary sets, legendary in the four
 * mythic sets (Kuzey Işığı, Fırtına Çekirdeği, Lav Akışı, Yıldız Tozu).
 * Price (set piece rule, catalogQuality.selftest.cjs): an epic aura costs the
 * set's voice tile + 20, a legendary one the voice tile + 140, so it always
 * sits between the set's chat bubble and its profile effect and inside
 * SET_BANDS (c3-motion.js).
 *
 * Motion stays transform / opacity only (one ::after layer, optional rim
 * opacity), nothing moves down or past the bottom edge, and reduced motion /
 * html.gd-lite get the still frame (build-css.mjs).
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");
const { DEPTH, bloom, inner, rim, fx, spots, stars, bands } = require("./aura");

const SET_AURA = [
  {
    slug: "gece-limani-isiklar", set: "gece-limani", rarity: "epic", price: 660,
    name: "Liman Işıkları|Harbor Lights|Hafenlichter|Luces del puerto|Lumières du port|Luzes do porto|Огни гавани",
    desc: "Köşede bir fener yanar, huzmesi kartın üstünden geçer; altta dalga ışığı kıpırdar.|A lighthouse burns in the corner and its beam sweeps the card while wave light stirs below.|In der Ecke brennt ein Leuchtturm, sein Strahl streift die Karte, unten regt sich Wellenlicht.|Un faro arde en la esquina y su haz barre la tarjeta mientras abajo se agita la luz del mar.|Un phare brille dans le coin, son faisceau balaie la carte et la lumière des vagues frémit en bas.|Um farol brilha no canto e seu facho varre o cartão enquanto a luz das ondas se agita embaixo.|В углу горит маяк, его луч скользит по карточке, внизу дрожит свет волн.",
    bloom: bloom("#35d0e0", "#1e4b8f"), inner: inner.bottom("#35d0e0", 0.3),
    rim: rim.conic("#1e4b8f, #35d0e0 16%, #e8f6ff 25%, #35d0e0 34%, #1e4b8f 52%, #35d0e0 76%, #1e4b8f 92%", 0),
    fx: { kind: "sheen", bg: `linear-gradient(104deg, transparent 0%, ${rgba("#bff6ff", 0)} 30%, ${rgba("#bff6ff", 0.13)} 44%, ${rgba("#e8f6ff", 0.2)} 50%, ${rgba("#bff6ff", 0.13)} 56%, ${rgba("#bff6ff", 0)} 70%, transparent), radial-gradient(60% 18% at 50% 100%, ${rgba("#35d0e0", 0.12)}, transparent 70%)`, anim: "s2au-sheen 7.5s cubic-bezier(.4,0,.2,1) infinite" },
  },
  {
    slug: "bakir-kervan-ufuk", set: "bakir-kervan", rarity: "epic", price: 620,
    name: "Bakır Ufuk|Copper Horizon|Kupferhorizont|Horizonte de cobre|Horizon de cuivre|Horizonte acobreado|Медный горизонт",
    desc: "Kartın altında bakır bir güneş batar, köşedeki kum tepesinde fenerli bir kervan ilerler.|A copper sun sets along the bottom of the card while a lantern-lit caravan crosses the corner dune.|Unten auf der Karte geht eine kupferne Sonne unter, über die Eckdüne zieht eine Karawane mit Laternen.|Un sol cobrizo se pone al pie de la tarjeta y una caravana con faroles cruza la duna de la esquina.|Un soleil de cuivre se couche en bas de la carte, une caravane à lanternes franchit la dune du coin.|Um sol de cobre se põe na base do cartão e uma caravana com lanternas cruza a duna do canto.|Внизу карточки садится медное солнце, по дюне в углу идёт караван с фонарями.",
    bloom: bloom("#f0a443", "#b5622b"), inner: inner.bottom("#f0a443", 0.36),
    rim: rim.conic("#b5622b, #ffe2b0 12%, #f0a443 25%, #7a3a14 45%, #f0a443 62%, #ffe2b0 75%, #b5622b"), rimW: 2,
    fx: fx.corner(`radial-gradient(64% 42% at 62% 106%, ${rgba("#ffcf7a", 0.42)}, ${rgba("#f0a443", 0.16)} 50%, transparent 76%)`, "62% 100%", 6.5),
  },
  {
    slug: "orkide-sisi-polen", set: "orkide-sisi", rarity: "epic", price: 700,
    name: "Polen Işığı|Pollen Glow|Pollenschein|Brillo de polen|Lueur de pollen|Brilho de pólen|Сияние пыльцы",
    desc: "Köşelerde orkideler açar, kartın içinde limon yeşili polen yanıp söner.|Orchids bloom in the corners while lime pollen blinks through the card.|In den Ecken blühen Orchideen, limettengrüner Pollen blinkt durch die Karte.|Orquídeas florecen en las esquinas y polen lima parpadea por la tarjeta.|Des orchidées fleurissent aux coins, un pollen citron vert clignote dans la carte.|Orquídeas florescem nos cantos e pólen verde-limão pisca pelo cartão.|По углам распускаются орхидеи, в карточке мерцает лаймовая пыльца.",
    bloom: bloom("#ff6fb5", "#8b3fd1"), inner: inner.all("#8b3fd1", 0.3),
    rim: rim.conic("#ff6fb5, #c8ff6a 12%, #8b3fd1 30%, #ff6fb5 50%, #c8ff6a 62%, #8b3fd1 80%, #ff6fb5"),
    fx: fx.motes(spots([[22, 8, 1.5, "#c8ff6a"], [40, 4, 1, "#efffc8"], [58, 7, 1.3, "#c8ff6a"], [95, 30, 1.2, "#ff8ad0"], [97, 52, 1.5, "#c8ff6a"], [4, 48, 1.4, "#c8ff6a"], [3, 70, 1, "#ff8ad0"], [30, 94, 1.3, "#c8ff6a"], [48, 97, 1, "#efffc8"], [64, 93, 1.5, "#c8ff6a"], [18, 28, 0.9, "#efffc8"], [82, 72, 0.9, "#efffc8"]]), 2.4),
  },
  {
    slug: "kor-bahcesi-sarmasik", set: "kor-bahcesi", rarity: "epic", price: 680,
    name: "Kor Sarmaşığı|Ember Vine|Glutranke|Enredadera de brasas|Liane de braise|Trepadeira de brasas|Тлеющая лоза",
    desc: "Köşelerden ateş yapraklı bir sarmaşık tırmanır, kartın altı korla nefes alır.|A vine of fire petals climbs in from the corners while the bottom of the card breathes with embers.|Aus den Ecken rankt eine Ranke mit Feuerblättern, unten atmet die Karte Glut.|Una enredadera de pétalos de fuego trepa desde las esquinas y abajo la tarjeta respira brasas.|Une liane aux pétales de feu grimpe depuis les coins, le bas de la carte respire la braise.|Uma trepadeira de pétalas de fogo sobe pelos cantos e a base do cartão respira brasas.|Из углов вьётся лоза с огненными лепестками, низ карточки дышит углями.",
    bloom: bloom("#ff6a2b", "#a3220f"), inner: inner.bottom("#ff6a2b", 0.42),
    rim: rim.conic("#a3220f, #ffd27a 14%, #ff6a2b 26%, #a3220f 44%, #ff6a2b 60%, #ffd27a 74%, #a3220f 90%"),
    fx: fx.corner(`radial-gradient(56% 46% at 0% 100%, ${rgba("#ff6a2b", 0.38)}, transparent 70%), radial-gradient(40% 30% at 100% 0%, ${rgba("#ffd27a", 0.2)}, transparent 70%), radial-gradient(80% 22% at 50% 104%, ${rgba("#ff8a3d", 0.22)}, transparent 70%)`, "0% 100%", 4.2),
  },
  {
    slug: "buzul-cicegi", set: "buzul-sessizligi", rarity: "epic", price: 640,
    name: "Buz Çiçeği|Frost Fern|Eisblume|Flor de escarcha|Fleur de givre|Flor de gelo|Морозный узор",
    desc: "Üst köşelerden buz çiçekleri yayılır, kartın üstünde ince kar pırıltıları yanıp söner.|Frost ferns spread from the top corners while fine snow sparkles wink across the card.|Aus den oberen Ecken wachsen Eisblumen, feine Schneefunken blinken über die Karte.|Flores de escarcha crecen desde las esquinas de arriba y finos destellos de nieve parpadean.|Des fleurs de givre gagnent les coins du haut, de fins éclats de neige scintillent sur la carte.|Flores de gelo crescem dos cantos de cima e finos brilhos de neve piscam pelo cartão.|Из верхних углов растут морозные узоры, по карточке мерцают снежные искры.",
    bloom: bloom("#a6e7ff", "#3a8fb7", 0.95), inner: inner.top("#a6e7ff", 0.26),
    rim: rim.conic("#3a8fb7, #e8f9ff 10%, #a6e7ff 22%, #3a8fb7 40%, #a6e7ff 58%, #ffffff 70%, #3a8fb7 88%"),
    fx: fx.motes(`${stars([[46, 7, 8, "rgba(255,255,255,0.95)"], [60, 16, 5, "rgba(214,244,255,0.9)"], [6, 52, 6, "rgba(214,244,255,0.85)"], [94, 60, 7, "rgba(255,255,255,0.9)"]])}, ${spots([[28, 12, 0.9, "#ffffff"], [72, 9, 0.8, "#e8f9ff"], [16, 36, 0.8, "#ffffff"], [88, 40, 0.9, "#e8f9ff"], [52, 30, 0.7, "#ffffff"]])}`, 3.4),
  },
  {
    slug: "neon-carsi-yansima", set: "neon-carsi", rarity: "epic", price: 720,
    name: "Neon Yansıması|Neon Reflection|Neonspiegelung|Reflejo de neón|Reflet néon|Reflexo neon|Неоновое отражение",
    desc: "Köşede bir neon tabela titrer, kartın altında ıslak yolun pembe ve camgöbeği yansımaları kayar.|A neon sign flickers in the corner while pink and cyan reflections of a wet street slide along the bottom.|In der Ecke flackert ein Neonschild, unten gleiten pinke und cyanfarbene Spiegelungen einer nassen Straße.|Un letrero de neón parpadea en la esquina y abajo se deslizan reflejos rosa y cian de una calle mojada.|Une enseigne néon vacille dans le coin, des reflets rose et cyan d'une rue mouillée glissent en bas.|Um letreiro neon pisca no canto e reflexos rosa e ciano de uma rua molhada deslizam embaixo.|В углу мигает неоновая вывеска, внизу скользят розовые и голубые отражения мокрой улицы.",
    bloom: [`0 0 0 1px ${rgba("#ff2e88", 0.6)}`, `0 0 20px ${rgba("#ff2e88", 0.42)}`, `0 0 46px -8px ${rgba("#2ef2ff", 0.45)}`, `0 26px 70px -24px ${rgba("#fff04a", 0.3)}`, DEPTH], inner: inner.bottom("#2ef2ff", 0.22),
    rim: rim.conic("#ff2e88 0 18%, #2ef2ff 18% 22%, #ff2e88 22% 46%, #fff04a 46% 50%, #2ef2ff 50% 72%, #ff2e88 72% 76%, #2ef2ff 76% 100%"), rimW: 2, rimAnim: "s2fx-flicker 6s linear infinite",
    fx: fx.drift(bands([`radial-gradient(2.4% 26% at 6% 100%, ${rgba("#ff2e88", 0.46)}, transparent 70%)`, `radial-gradient(1.6% 18% at 14% 100%, ${rgba("#2ef2ff", 0.42)}, transparent 70%)`, `radial-gradient(2% 22% at 24% 100%, ${rgba("#fff04a", 0.3)}, transparent 70%)`, `radial-gradient(2.4% 24% at 36% 100%, ${rgba("#2ef2ff", 0.4)}, transparent 70%)`, `radial-gradient(1.6% 16% at 44% 100%, ${rgba("#ff2e88", 0.4)}, transparent 70%)`, `radial-gradient(2.4% 26% at 56% 100%, ${rgba("#ff2e88", 0.46)}, transparent 70%)`, `radial-gradient(1.6% 18% at 64% 100%, ${rgba("#2ef2ff", 0.42)}, transparent 70%)`, `radial-gradient(2% 22% at 74% 100%, ${rgba("#fff04a", 0.3)}, transparent 70%)`, `radial-gradient(2.4% 24% at 86% 100%, ${rgba("#2ef2ff", 0.4)}, transparent 70%)`, `radial-gradient(1.6% 16% at 94% 100%, ${rgba("#ff2e88", 0.4)}, transparent 70%)`]), 14),
  },
  {
    slug: "altin-hasat-ruzgar", set: "altin-hasat", rarity: "epic", price: 630,
    name: "Rüzgârlı Tarla|Windswept Field|Windfeld|Campo al viento|Champ sous le vent|Campo ao vento|Поле на ветру",
    desc: "Alt köşelerde başaklar yükselir, kartın altından geçen rüzgâr altın bir dalga bırakır.|Wheat rises in the lower corners and a passing wind leaves a golden wave along the bottom.|In den unteren Ecken wächst Weizen, ein Windstoß zieht eine goldene Welle über den Rand.|El trigo crece en las esquinas de abajo y el viento deja una ola dorada al pie de la tarjeta.|Le blé pousse dans les coins du bas, le vent laisse une vague dorée au pied de la carte.|O trigo cresce nos cantos de baixo e o vento deixa uma onda dourada na base do cartão.|В нижних углах колосится пшеница, ветер гонит золотую волну по низу карточки.",
    bloom: bloom("#f2c230", "#8a6a12"), inner: inner.bottom("#f2c230", 0.32),
    rim: rim.conic("#8a6a12, #fff3c4 14%, #f2c230 30%, #8a6a12 50%, #f2c230 70%, #fff3c4 84%, #8a6a12"),
    fx: fx.drift(bands([`radial-gradient(22% 13% at 10% 100%, ${rgba("#f2c230", 0.34)}, transparent 70%)`, `radial-gradient(18% 9% at 30% 102%, ${rgba("#fff3c4", 0.26)}, transparent 70%)`, `radial-gradient(22% 13% at 60% 100%, ${rgba("#f2c230", 0.34)}, transparent 70%)`, `radial-gradient(18% 9% at 80% 102%, ${rgba("#fff3c4", 0.26)}, transparent 70%)`]), 20),
  },
  {
    slug: "mor-sis-yildizli", set: "mor-sis", rarity: "epic", price: 660,
    name: "Yıldızlı Sis|Starlit Haze|Sternendunst|Bruma estrellada|Brume étoilée|Névoa estrelada|Звёздная дымка",
    desc: "Mor bir bulutsu kartın içinden süzülür; köşede leylak bir hilal ve küçük yıldızlar parlar.|A violet nebula drifts through the card while a lilac crescent and small stars glow in the corner.|Ein violetter Nebel zieht durch die Karte, in der Ecke leuchten eine Fliedersichel und kleine Sterne.|Una nebulosa violeta cruza la tarjeta y en la esquina brillan una media luna lila y estrellas.|Une nébuleuse violette dérive dans la carte, un croissant lilas et de petites étoiles brillent au coin.|Uma nebulosa violeta atravessa o cartão e no canto brilham um crescente lilás e pequenas estrelas.|По карточке плывёт фиолетовая туманность, в углу светятся сиреневый месяц и звёзды.",
    bloom: bloom("#a77bff", "#4b2a9c"), inner: inner.all("#a77bff", 0.24),
    rim: rim.conic("#4b2a9c, #e6dcff 16%, #a77bff 30%, #4b2a9c 52%, #a77bff 76%, #4b2a9c"),
    fx: fx.drift(bands([`radial-gradient(30% 46% at 14% 34%, ${rgba("#a77bff", 0.24)}, transparent 70%)`, `radial-gradient(22% 34% at 34% 76%, ${rgba("#e6dcff", 0.13)}, transparent 70%)`, `radial-gradient(circle at 26% 22%, ${rgba("#ffffff", 0.9)} 0 1px, transparent 2.6px)`, `radial-gradient(30% 46% at 64% 34%, ${rgba("#a77bff", 0.24)}, transparent 70%)`, `radial-gradient(22% 34% at 84% 76%, ${rgba("#e6dcff", 0.13)}, transparent 70%)`, `radial-gradient(circle at 76% 22%, ${rgba("#ffffff", 0.9)} 0 1px, transparent 2.6px)`]), 30),
  },
  {
    slug: "gece-mercani-denizanasi", set: "gece-mercani", rarity: "epic", price: 680,
    name: "Denizanası Işığı|Jellyfish Glow|Quallenleuchten|Brillo de medusa|Lueur de méduse|Brilho de água-viva|Свечение медузы",
    desc: "Köşede pembe bir denizanası nabız gibi parlar, alttan mercanların ışığı yükselir.|A pink jellyfish pulses with light in the corner while coral glow rises from below.|In der Ecke pulsiert eine pinke Qualle, von unten steigt das Leuchten der Korallen auf.|Una medusa rosa late de luz en la esquina y desde abajo sube el brillo del coral.|Une méduse rose pulse de lumière dans le coin, la lueur du corail monte d'en bas.|Uma água-viva rosa pulsa de luz no canto e o brilho dos corais sobe de baixo.|В углу пульсирует розовая медуза, снизу поднимается свет кораллов.",
    bloom: bloom("#ff8fab", "#7c5cff"), inner: inner.bottom("#d6336c", 0.34),
    rim: rim.conic("#7c5cff, #ff8fab 18%, #d6336c 34%, #7c5cff 52%, #ff8fab 70%, #7c5cff 88%"),
    fx: fx.corner(`radial-gradient(36% 30% at 84% 16%, ${rgba("#ff8fab", 0.34)}, transparent 70%), radial-gradient(70% 28% at 30% 104%, ${rgba("#d6336c", 0.26)}, transparent 70%)`, "84% 16%", 3.6),
  },
  {
    slug: "kuzey-isigi-tac", set: "kuzey-isigi", rarity: "legendary", price: 830,
    name: "Aurora Tacı|Aurora Crown|Polarlichtkrone|Corona de aurora|Couronne d'aurore|Coroa de aurora|Корона сияния",
    desc: "Kartın üstünde yeşilden mora dalgalanan perdelerden bir kutup ışığı tacı; kenarda renkler akar.|A crown of polar curtains ripples green to violet over the top of the card as colour runs along the edge.|Eine Krone aus Polarlichtvorhängen wogt grün bis violett über der Karte, an der Kante fließen Farben.|Una corona de cortinas polares ondula de verde a violeta sobre la tarjeta y el color recorre el borde.|Une couronne de rideaux polaires ondoie du vert au violet en haut de la carte, la couleur file au bord.|Uma coroa de cortinas polares ondula do verde ao violeta no topo do cartão e a cor corre pela borda.|Над карточкой колышется корона полярных занавесов от зелёного к фиолетовому, по кромке бегут цвета.",
    bloom: bloom("#6effc7", "#8f7bff", 1.08), inner: inner.top("#14a37f", 0.36),
    rim: rim.conic("#14a37f, #6effc7 14%, #8f7bff 30%, #6effc7 46%, #14a37f 60%, #8f7bff 78%, #6effc7 90%, #14a37f"), rimW: 2, rimAnim: "s2fx-breathe 5s ease-in-out infinite",
    fx: fx.drift(bands([0, 50].flatMap((o) => [[4, 3.2, 40, "#6effc7", 0.36], [9, 2.4, 30, "#8f7bff", 0.32], [14, 3.6, 46, "#6effc7", 0.3], [21, 2.2, 28, "#8f7bff", 0.34], [27, 3, 38, "#6effc7", 0.32], [34, 2.6, 32, "#8f7bff", 0.3], [41, 3.4, 42, "#6effc7", 0.3], [46, 2, 24, "#8f7bff", 0.28]].map(([x, w, h, c, a]) => `radial-gradient(${w}% ${h}% at ${x + o}% 0%, ${rgba(c, a)}, transparent 72%)`))), 24),
  },
  {
    slug: "zumrut-orman-egrelti", set: "zumrut-orman", rarity: "epic", price: 640,
    name: "Eğrelti Gölgesi|Fern Shade|Farnschatten|Sombra de helecho|Ombre de fougère|Sombra de samambaia|Тень папоротника",
    desc: "Köşelerden eğrelti yaprakları uzanır, aralarında ateş böcekleri yanıp söner.|Fern fronds reach in from the corners and fireflies blink between them.|Aus den Ecken greifen Farnwedel herein, dazwischen blinken Glühwürmchen.|Frondas de helecho asoman por las esquinas y entre ellas parpadean luciérnagas.|Des frondes de fougère s'avancent depuis les coins, des lucioles clignotent entre elles.|Folhas de samambaia avançam dos cantos e vaga-lumes piscam entre elas.|Из углов тянутся листья папоротника, между ними мигают светлячки.",
    bloom: bloom("#49d17d", "#1f7a46"), inner: inner.bottom("#1f7a46", 0.38),
    rim: rim.conic("#1f7a46, #d8ffe6 12%, #49d17d 26%, #1f7a46 46%, #49d17d 66%, #d8ffe6 80%, #1f7a46"),
    fx: fx.motes(spots([[24, 84, 1.6, "#e8ff8a"], [40, 92, 1.1, "#c8ff6a"], [60, 88, 1.4, "#e8ff8a"], [12, 62, 1, "#c8ff6a"], [88, 30, 1.6, "#e8ff8a"], [72, 14, 1.1, "#c8ff6a"], [54, 10, 1, "#e8ff8a"], [92, 52, 0.9, "#c8ff6a"], [30, 40, 0.8, "#e8ff8a"], [78, 66, 0.9, "#e8ff8a"]]), 2.8),
  },
  {
    slug: "kum-saati-zaman-tozu", set: "kum-saati", rarity: "epic", price: 620,
    name: "Zaman Tozu|Time Dust|Zeitstaub|Polvo del tiempo|Poussière du temps|Poeira do tempo|Пыль времени",
    desc: "Köşede pirinç bir kum saati akar, kartın üstünden fildişi bir kum ışığı yavaşça geçer.|A brass hourglass runs in the corner as an ivory sand light slowly passes over the card.|In der Ecke rinnt eine Messing-Sanduhr, ein elfenbeinfarbenes Sandlicht zieht langsam über die Karte.|Un reloj de arena de latón corre en la esquina y una luz de arena marfil cruza despacio la tarjeta.|Un sablier de laiton s'écoule dans le coin, une lumière de sable ivoire traverse lentement la carte.|Uma ampulheta de latão escorre no canto e uma luz de areia marfim passa devagar pelo cartão.|В углу пересыпаются латунные песочные часы, по карточке медленно скользит свет цвета слоновой кости.",
    bloom: bloom("#e8cf9a", "#9c7a4a", 0.9), inner: inner.top("#e8cf9a", 0.24),
    rim: rim.conic("#9c7a4a, #fff8e8 14%, #e8cf9a 28%, #9c7a4a 48%, #e8cf9a 68%, #fff8e8 82%, #9c7a4a"),
    fx: { kind: "sheen", bg: `linear-gradient(100deg, transparent 0%, ${rgba("#e8cf9a", 0)} 26%, ${rgba("#e8cf9a", 0.12)} 42%, ${rgba("#fff8e8", 0.2)} 50%, ${rgba("#e8cf9a", 0.12)} 58%, ${rgba("#e8cf9a", 0)} 74%, transparent), ${spots([[40, 30, 0.8, "#fff8e8"], [52, 58, 0.7, "#e8cf9a"], [60, 80, 0.8, "#fff8e8"]])}`, anim: "s2au-sheen 10s cubic-bezier(.4,0,.2,1) infinite" },
  },
  {
    slug: "firtina-simsek-agi", set: "firtina-cekirdegi", rarity: "legendary", price: 820,
    name: "Şimşek Ağı|Lightning Web|Blitznetz|Red de rayos|Toile d'éclairs|Teia de raios|Сеть молний",
    desc: "Köşelerden çatallanan şimşekler kenar boyunca çakar, kart bir an beyaza kesilir.|Forked lightning cracks along the edge from the corners and the card turns white for an instant.|Aus den Ecken zucken gegabelte Blitze die Kante entlang, die Karte wird kurz weiß.|Rayos bifurcados restallan por el borde desde las esquinas y la tarjeta se vuelve blanca un instante.|Des éclairs fourchus claquent le long du bord depuis les coins, la carte blanchit un instant.|Raios bifurcados estalam pela borda a partir dos cantos e o cartão fica branco por um instante.|Из углов вдоль кромки бьют ветвистые молнии, карточка на миг белеет.",
    bloom: bloom("#7aa7ff", "#3b4a6b", 1.08), inner: inner.top("#3b4a6b", 0.42),
    rim: rim.conic("#3b4a6b, #f5f9ff 6%, #7aa7ff 12%, #3b4a6b 30%, #7aa7ff 50%, #f5f9ff 56%, #3b4a6b 70%, #7aa7ff 88%, #3b4a6b"), rimW: 2, rimAnim: "s2fx-flicker 7s linear infinite",
    fx: fx.flash(`radial-gradient(60% 50% at 0% 0%, rgba(235,244,255,0.5), transparent 70%), radial-gradient(60% 50% at 100% 100%, rgba(200,220,255,0.4), transparent 70%), linear-gradient(180deg, ${rgba("#7aa7ff", 0.14)}, transparent 60%)`, 9),
  },
  {
    slug: "lav-akisi-volkan-nefesi", set: "lav-akisi", rarity: "legendary", price: 840,
    name: "Volkan Nefesi|Volcano Breath|Vulkanatem|Aliento volcánico|Souffle volcanique|Sopro vulcânico|Дыхание вулкана",
    desc: "Kara kaya plakaların çatlakları kenar boyunca kızarır, alt köşelerden sıcak bir lav ışığı nefes alır.|Cracks between black rock plates glow along the edge while hot lava light breathes up from the lower corners.|Risse zwischen schwarzen Felsplatten glühen an der Kante, aus den unteren Ecken atmet heißes Lavalicht.|Las grietas entre placas de roca negra arden en el borde y desde abajo respira una luz de lava.|Les fissures entre plaques de roche noire rougeoient au bord, une lumière de lave respire d'en bas.|As rachaduras entre placas de rocha negra brilham na borda e uma luz de lava respira dos cantos de baixo.|Трещины между чёрными плитами светятся по кромке, из нижних углов дышит жар лавы.",
    bloom: bloom("#ff3d00", "#5a0e0e", 1.1), inner: inner.bottom("#ff3d00", 0.5),
    rim: rim.conic("#2a0606, #ff3d00 8%, #2a0606 14%, #5a0e0e 30%, #ffb000 36%, #2a0606 42%, #5a0e0e 58%, #ff3d00 66%, #2a0606 72%, #5a0e0e 86%, #ffb000 92%, #2a0606"), rimW: 2, rimAnim: "s2fx-breathe 3.2s ease-in-out infinite",
    fx: fx.corner(`radial-gradient(50% 36% at 0% 100%, ${rgba("#ff3d00", 0.45)}, transparent 70%), radial-gradient(44% 30% at 100% 100%, ${rgba("#ffb000", 0.32)}, transparent 70%), radial-gradient(90% 20% at 50% 106%, ${rgba("#ff3d00", 0.3)}, transparent 70%)`, "50% 100%", 3.2),
  },
  {
    slug: "inci-kiyisi-kopuk", set: "inci-kiyisi", rarity: "epic", price: 640,
    name: "Şafak Köpüğü|Dawn Foam|Morgenschaum|Espuma del alba|Écume de l'aube|Espuma da aurora|Утренняя пена",
    desc: "Alt kenarda sedef köpük dalgalanır, köşedeki deniz kabuğunda bir inci parlar.|Nacre foam ripples along the bottom edge and a pearl gleams in a seashell in the corner.|Unten wogt Perlmuttschaum, in einer Muschel in der Ecke schimmert eine Perle.|Espuma de nácar ondula en el borde inferior y una perla brilla en una concha de la esquina.|Une écume de nacre ondule en bas, une perle luit dans un coquillage au coin.|Espuma de nácar ondula na borda de baixo e uma pérola brilha numa concha no canto.|Внизу колышется перламутровая пена, в ракушке в углу блестит жемчужина.",
    bloom: bloom("#ffd8e4", "#6b8a9a", 0.9), inner: inner.bottom("#f1e9e1", 0.22),
    rim: rim.conic("#6b8a9a, #f1e9e1 16%, #ffd8e4 32%, #cfe3ef 48%, #6b8a9a 62%, #ffd8e4 80%, #f1e9e1 90%, #6b8a9a"),
    fx: fx.drift(bands([`radial-gradient(16% 8% at 8% 100%, rgba(255,255,255,0.42), transparent 70%)`, `radial-gradient(13% 7% at 22% 99%, ${rgba("#ffd8e4", 0.4)}, transparent 70%)`, `radial-gradient(15% 8% at 36% 101%, ${rgba("#cfe3ef", 0.4)}, transparent 70%)`, `radial-gradient(16% 8% at 58% 100%, rgba(255,255,255,0.42), transparent 70%)`, `radial-gradient(13% 7% at 72% 99%, ${rgba("#ffd8e4", 0.4)}, transparent 70%)`, `radial-gradient(15% 8% at 86% 101%, ${rgba("#cfe3ef", 0.4)}, transparent 70%)`]), 16),
  },
  {
    slug: "yildiz-tozu-kuyruklu", set: "yildiz-tozu", rarity: "legendary", price: 840,
    name: "Kuyruklu Yıldız|Comet Trail|Kometenschweif|Estela de cometa|Traîne de comète|Rastro de cometa|Хвост кометы",
    desc: "Altın bir kuyruklu yıldız kartın üstünden geçer, ardında galaksi tozu bırakır; köşelerde yıldız kümeleri parlar.|A golden comet crosses the top of the card leaving galaxy dust behind, with star clusters in the corners.|Ein goldener Komet zieht über die Karte und hinterlässt Galaxienstaub, in den Ecken funkeln Sternhaufen.|Un cometa dorado cruza la tarjeta dejando polvo de galaxia, con cúmulos de estrellas en las esquinas.|Une comète dorée traverse la carte en laissant une poussière de galaxie, des amas d'étoiles aux coins.|Um cometa dourado cruza o cartão deixando poeira de galáxia, com aglomerados de estrelas nos cantos.|Золотая комета пересекает карточку, оставляя галактическую пыль, в углах сверкают звёздные скопления.",
    bloom: bloom("#c6b7ff", "#2b1f6e", 1.08), inner: inner.all("#2b1f6e", 0.4),
    rim: rim.conic("#2b1f6e, #c6b7ff 14%, #ffe9a8 20%, #c6b7ff 26%, #2b1f6e 48%, #c6b7ff 70%, #ffe9a8 76%, #2b1f6e 90%"), rimW: 2,
    fx: { kind: "sheen", bg: `radial-gradient(circle at 90% 18%, #ffffff 0 1.6px, ${rgba("#ffe9a8", 0.95)} 2.6px, ${rgba("#ffe9a8", 0.3)} 6px, transparent 12px), radial-gradient(52% 3% at 52% 18%, ${rgba("#ffe9a8", 0.55)}, ${rgba("#c6b7ff", 0.16)} 62%, transparent 100%), radial-gradient(44% 9% at 56% 19%, ${rgba("#c6b7ff", 0.16)}, transparent 70%), ${spots([[30, 22, 0.8, "#ffe9a8"], [46, 15, 0.7, "#e6dcff"], [62, 24, 0.8, "#ffe9a8"]])}`, anim: "s2au-sheen 7s cubic-bezier(.4,0,.2,1) infinite" },
  },
];

module.exports = { SET_AURA };
