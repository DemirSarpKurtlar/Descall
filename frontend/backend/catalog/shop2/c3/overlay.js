"use strict";

/**
 * call_overlay: 16 call stages. Painted on .call-overlay-root (DM / group
 * call, web, desktop, iPhone) and the shop preview (.shop-call-overlay-preview).
 *   base  = opaque base colour (the call stage must never show the chat)
 *   scene = background-image layers of the still scene
 *   b     = ::before ambient layer behind the call UI (z-index -1); motion
 *           runs a few passes and then rests, so a long call costs nothing
 *   a     = ::after static detail layer (silhouette, vignette, texture)
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");

const starsAt = (pts, c = "#ffffff") => pts.map(([x, y, r = 1]) => `radial-gradient(circle at ${x}% ${y}%, ${c} 0 ${r}px, transparent ${r + 0.9}px)`).join(", ");
const STARS_A = [[6, 8], [14, 22, 0.8], [22, 6, 1.2], [31, 15, 0.7], [40, 4], [47, 19, 0.8], [55, 9, 1.1], [63, 25, 0.7], [69, 5], [77, 30, 0.8], [88, 12, 1.2], [94, 24, 0.7], [12, 38, 0.7], [36, 33, 0.9], [58, 40, 0.6], [84, 42, 0.8]];
const STARS_B = [[9, 14, 0.7], [18, 30, 1], [27, 10, 0.8], [44, 26, 1], [52, 3, 0.7], [66, 16, 0.9], [73, 36, 0.7], [81, 6, 1], [91, 34, 0.8], [97, 8, 0.7], [3, 28, 0.9], [61, 32, 0.7]];
const VIGNETTE = "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)";

const OVERLAY = [
  {
    slug: "fener-kulesi", rarity: "epic",
    name: "Fener Kulesi|Lighthouse Watch|Leuchtturmwache|Guardia del faro|Veille du phare|Vigia do farol|Дозор маяка",
    desc: "Gece limanında bir fener ışığı sisin üstünden ağır ağır geçer.|A lighthouse beam sweeps slowly over the fog of a night harbor.|Ein Leuchtturmstrahl gleitet langsam über den Nebel des Nachthafens.|El haz de un faro barre despacio la niebla de un puerto nocturno.|Le faisceau d'un phare balaie lentement la brume d'un port de nuit.|O feixe de um farol varre devagar a névoa de um porto noturno.|Луч маяка медленно скользит по туману ночной гавани.",
    base: "#050c1a",
    scene: [
      `radial-gradient(circle at 8% 62%, ${rgba("#e8f6ff", 0.9)} 0 0.35%, ${rgba("#35d0e0", 0.35)} 1.2%, transparent 6%)`,
      `radial-gradient(circle at 82% 16%, #e8f6ff 0 2.1%, ${rgba("#e8f6ff", 0.3)} 2.5%, transparent 9%)`,
      starsAt(STARS_A, "rgba(232,246,255,0.85)"),
      `repeating-linear-gradient(180deg, ${rgba("#35d0e0", 0)} 0 6px, ${rgba("#35d0e0", 0.07)} 6px 7px) 0 64% / 100% 36% no-repeat`,
      `radial-gradient(60% 16% at 34% 66%, ${rgba("#35d0e0", 0.16)}, transparent 70%)`,
      `linear-gradient(180deg, transparent 63%, ${rgba("#1e4b8f", 0.45)} 63.4%, ${rgba("#0b1b3a", 0.95)} 100%)`,
      "linear-gradient(180deg, #0b1b3a, #08142b 55%, #050c1a)",
    ],
    b: { bg: `conic-gradient(from 52deg at 8% 62%, transparent 0deg, ${rgba("#c8f0ff", 0.1)} 5deg, ${rgba("#e8f6ff", 0.24)} 9deg, ${rgba("#c8f0ff", 0.1)} 13deg, transparent 20deg)`, origin: "8% 62%", anim: "s2co-sweep 14s ease-in-out 4 alternate both" },
    a: { bg: "linear-gradient(180deg, #0c1830, #060c18)", css: "clip-path: polygon(6.4% 100%, 7.3% 63.5%, 8.7% 63.5%, 9.6% 100%);" },
  },
  {
    slug: "col-gecesi", rarity: "rare",
    name: "Çöl Gecesi|Desert Night|Wüstennacht|Noche del desierto|Nuit du désert|Noite no deserto|Ночь в пустыне",
    desc: "Kehribar bir ayın altında kum tepeleri, üstünde titreyen yıldızlar.|Dunes under an amber moon, with stars trembling above.|Dünen unter einem Bernsteinmond, darüber zitternde Sterne.|Dunas bajo una luna ámbar y estrellas que tiemblan.|Des dunes sous une lune d'ambre, des étoiles qui tremblent.|Dunas sob uma lua âmbar e estrelas tremulando.|Дюны под янтарной луной и дрожащие звёзды.",
    base: "#120a06",
    scene: [
      "radial-gradient(70% 30% at 22% 106%, #2a1408 0 59%, transparent 60.5%)",
      `radial-gradient(70% 30% at 22% 106%, ${rgba("#f0a443", 0.35)} 0 60.5%, transparent 61.5%)`,
      "radial-gradient(85% 34% at 82% 112%, #3a1d0c 0 59%, transparent 60.5%)",
      `radial-gradient(85% 34% at 82% 112%, ${rgba("#ffcf8a", 0.3)} 0 60.5%, transparent 61.5%)`,
      `radial-gradient(circle at 70% 24%, #ffe2b0 0 2.8%, ${rgba("#f0a443", 0.4)} 3.4%, ${rgba("#f0a443", 0.08)} 9%, transparent 16%)`,
      "linear-gradient(180deg, #170c1c 0%, #2a1416 40%, #5a2a12 72%, #3a1a0c 100%)",
    ],
    b: { bg: starsAt(STARS_A, "rgba(255,236,200,0.9)"), anim: "s2co-twinkle 4s ease-in-out 6 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "kutup-gokyuzu", rarity: "legendary",
    name: "Kutup Gökyüzü|Aurora Sky|Polarhimmel|Cielo de aurora|Ciel d'aurore|Céu de aurora|Небо сияния",
    desc: "Yeşil ve mor kutup perdeleri karlı ufkun üstünde dalgalanır.|Green and violet aurora curtains ripple above a snowy horizon.|Grüne und violette Polarlichtvorhänge wogen über verschneitem Horizont.|Cortinas de aurora verdes y violetas ondean sobre el horizonte nevado.|Des rideaux d'aurore verts et violets ondulent sur l'horizon enneigé.|Cortinas de aurora verdes e violetas ondulam sobre o horizonte nevado.|Зелёные и фиолетовые занавесы сияния колышутся над снежным горизонтом.",
    base: "#04121c",
    scene: [
      "linear-gradient(180deg, transparent 80%, #0e2a33 80.4%, #7d9fae 81%, #3f6070 85%, #142a34 100%)",
      starsAt(STARS_B, "rgba(230,255,245,0.8)"),
      `radial-gradient(80% 50% at 50% 80%, ${rgba("#14a37f", 0.18)}, transparent 70%)`,
      "linear-gradient(180deg, #030b14, #04121c 50%, #06222a 78%)",
    ],
    b: { inset: "0 -12%", bg: `linear-gradient(100deg, transparent 8%, ${rgba("#6effc7", 0.42)} 18%, ${rgba("#6effc7", 0.05)} 26%, transparent 32%), linear-gradient(82deg, transparent 36%, ${rgba("#8f7bff", 0.42)} 48%, ${rgba("#8f7bff", 0.05)} 56%, transparent 62%), linear-gradient(96deg, transparent 60%, ${rgba("#14a37f", 0.45)} 72%, ${rgba("#6effc7", 0.08)} 80%, transparent 86%), repeating-linear-gradient(90deg, rgba(230,255,245,0.05) 0 2px, transparent 2px 9px)`, mask: "linear-gradient(180deg, transparent 2%, #000 14%, #000 42%, transparent 76%)", anim: "s2co-drift 18s ease-in-out 4 alternate both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "derin-deniz", rarity: "rare",
    name: "Derin Deniz|Deep Sea|Tiefsee|Mar profundo|Mer profonde|Mar profundo|Глубокое море",
    desc: "Yüzeyden süzülen ışık sütunları derin mavide nefes alır.|Shafts of light from the surface breathe in deep blue.|Lichtsäulen von der Oberfläche atmen im tiefen Blau.|Haces de luz desde la superficie respiran en azul profundo.|Des rais de lumière venus de la surface respirent dans le bleu.|Feixes de luz da superfície respiram no azul profundo.|Лучи света с поверхности дышат в глубокой синеве.",
    base: "#021220",
    scene: [
      starsAt([[12, 70, 1], [24, 82, 0.8], [38, 64, 0.7], [52, 88, 1], [66, 72, 0.8], [78, 84, 0.7], [90, 66, 1], [30, 50, 0.6], [72, 48, 0.6]], "rgba(150,230,255,0.55)"),
      `radial-gradient(90% 40% at 50% -6%, ${rgba("#5fd4ff", 0.35)}, transparent 70%)`,
      "linear-gradient(180deg, #0b4466 0%, #062a44 36%, #031828 70%, #020e18 100%)",
    ],
    b: { bg: `repeating-linear-gradient(104deg, ${rgba("#8fe4ff", 0)} 0 60px, ${rgba("#8fe4ff", 0.08)} 60px 96px, ${rgba("#8fe4ff", 0)} 96px 170px)`, mask: "linear-gradient(180deg, #000, transparent 75%)", anim: "s2co-breathe 7s ease-in-out 6 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "neon-sokak", rarity: "epic",
    name: "Neon Sokak|Neon Alley|Neongasse|Callejón de neón|Ruelle néon|Beco neon|Неоновый переулок",
    desc: "Islak bir sokakta pembe ve camgöbeği tabelalar yansır, arada titrer.|Pink and cyan signs reflect on a wet street and flicker.|Pinke und cyane Schilder spiegeln sich auf nasser Straße und flackern.|Letreros rosa y cian se reflejan en la calle mojada y parpadean.|Des enseignes rose et cyan se reflètent sur la rue mouillée et vacillent.|Letreiros rosa e ciano refletem na rua molhada e piscam.|Розовые и голубые вывески отражаются на мокрой улице и мерцают.",
    base: "#0a0618",
    scene: [
      `linear-gradient(90deg, ${rgba("#ff2e88", 0)} 10%, ${rgba("#ff2e88", 0.16)} 18%, ${rgba("#ff2e88", 0)} 26%, ${rgba("#2ef2ff", 0)} 68%, ${rgba("#2ef2ff", 0.14)} 78%, ${rgba("#2ef2ff", 0)} 86%) 0 76% / 100% 24% no-repeat`,
      `repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 5px, rgba(255,255,255,0.04) 5px 6px) 0 76% / 100% 24% no-repeat`,
      "linear-gradient(90deg, #07040f 0 8%, transparent 8% 30%, #07040f 30% 36%, transparent 36% 62%, #07040f 62% 70%, transparent 70% 92%, #07040f 92%) 0 0 / 100% 76% no-repeat",
      `radial-gradient(18% 10% at 18% 30%, ${rgba("#ff2e88", 0.55)}, transparent 70%)`,
      `radial-gradient(14% 8% at 80% 22%, ${rgba("#2ef2ff", 0.5)}, transparent 70%)`,
      `radial-gradient(10% 6% at 50% 44%, ${rgba("#fff04a", 0.35)}, transparent 70%)`,
      "linear-gradient(180deg, #120a2a, #0a0618 76%, #140a24 76.2%, #07040f)",
    ],
    b: { bg: `radial-gradient(10% 4% at 18% 30%, ${rgba("#ffb3d6", 0.9)}, transparent 70%), radial-gradient(8% 3.5% at 80% 22%, ${rgba("#b8fbff", 0.85)}, transparent 70%), repeating-linear-gradient(76deg, rgba(190,220,255,0.07) 0 1px, transparent 1px 14px)`, anim: "s2fx-flicker 5s linear 6 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "gozlemevi", rarity: "legendary",
    name: "Gözlemevi|Observatory|Sternwarte|Observatorio|Observatoire|Observatório|Обсерватория",
    desc: "Kubbenin üstünde yıldızlar kutup yıldızının çevresinde döner.|Above the dome, the stars wheel around the pole star.|Über der Kuppel kreisen die Sterne um den Polarstern.|Sobre la cúpula, las estrellas giran alrededor de la polar.|Au-dessus du dôme, les étoiles tournent autour de la polaire.|Sobre a cúpula, as estrelas giram em torno da polar.|Над куполом звёзды кружат вокруг Полярной.",
    base: "#05030f",
    scene: [
      `linear-gradient(125deg, transparent 30%, ${rgba("#c6b7ff", 0.08)} 44%, ${rgba("#ffe9a8", 0.06)} 50%, ${rgba("#c6b7ff", 0.08)} 56%, transparent 70%)`,
      `radial-gradient(70% 50% at 50% 100%, ${rgba("#2b1f6e", 0.6)}, transparent 70%)`,
      "linear-gradient(180deg, #05030f, #0d0a24 70%, #160f3a)",
    ],
    b: { inset: "-60%", bg: `${starsAt(STARS_A.map(([x, y, r]) => [25 + x / 2, 25 + y / 2, r || 1]), "rgba(255,255,255,0.9)")}, ${starsAt(STARS_B.map(([x, y, r]) => [25 + x / 2, 50 + y / 2, r || 1]), "rgba(198,183,255,0.85)")}`, origin: "50% 50%", anim: "s2fx-spin 180s linear 1 both" },
    a: { bg: "radial-gradient(34% 22% at 50% 102%, #0b0818 0 97%, transparent 100%), linear-gradient(90deg, transparent 49.2%, rgba(255,233,168,0.5) 49.6%, rgba(255,233,168,0.5) 50.4%, transparent 50.8%) 0 82% / 100% 18% no-repeat" },
  },
  {
    slug: "kor-ocagi", rarity: "rare",
    name: "Kor Ocağı|Hearth Glow|Herdglut|Brasa del hogar|Lueur du foyer|Brasa da lareira|Очаг",
    desc: "Sıcak bir ocak ışığı alttan yükselir, közler havada süzülür.|A warm hearth glow rises from below as embers float.|Warmes Herdlicht steigt von unten auf, Glut schwebt.|Un cálido resplandor sube desde abajo y flotan brasas.|Une chaude lueur de foyer monte d'en bas, des braises flottent.|Uma luz quente de lareira sobe e brasas flutuam.|Тёплый свет очага поднимается снизу, парят угли.",
    base: "#140804",
    scene: [
      starsAt([[14, 72, 1.2], [26, 60, 0.9], [34, 80, 1], [48, 66, 1.3], [58, 76, 0.9], [70, 58, 1.1], [82, 74, 1], [90, 62, 0.8]], "rgba(255,190,110,0.85)"),
      `radial-gradient(90% 46% at 50% 110%, ${rgba("#ff6a1f", 0.5)}, ${rgba("#a3220f", 0.25)} 50%, transparent 75%)`,
      "linear-gradient(180deg, #120705, #1e0c06 60%, #2a1006)",
    ],
    b: { bg: `radial-gradient(70% 34% at 50% 104%, ${rgba("#ffb35a", 0.45)}, transparent 70%)`, origin: "50% 100%", anim: "s2co-glow 3.2s ease-in-out 10 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "bulut-ustu", rarity: "epic",
    name: "Bulutların Üstü|Above the Clouds|Über den Wolken|Sobre las nubes|Au-dessus des nuages|Acima das nuvens|Над облаками",
    desc: "Şafak ufku pembe yanarken bulut denizi yavaşça kayar.|A sea of clouds drifts as the dawn horizon glows pink.|Ein Wolkenmeer zieht, während der Morgenhorizont rosa glüht.|Un mar de nubes se desliza mientras el alba se tiñe de rosa.|Une mer de nuages dérive sous un horizon d'aube rose.|Um mar de nuvens desliza enquanto a aurora fica rosa.|Море облаков плывёт, рассветный горизонт розовеет.",
    base: "#141a3a",
    scene: [
      `radial-gradient(60% 18% at 50% 70%, ${rgba("#ffd2a8", 0.6)}, transparent 70%)`,
      "linear-gradient(180deg, #141a3a 0%, #2c2a6a 34%, #6a4f9a 54%, #d8889a 66%, #ffc79a 71%, #7a6aa8 73%, #3a3a72 100%)",
    ],
    b: { inset: "0 -15%", bg: `radial-gradient(22% 7% at 12% 80%, ${rgba("#f2e6ff", 0.55)}, transparent 70%), radial-gradient(26% 8% at 40% 86%, ${rgba("#e6dcff", 0.5)}, transparent 70%), radial-gradient(24% 7% at 70% 79%, ${rgba("#ffe6f0", 0.5)}, transparent 70%), radial-gradient(30% 9% at 92% 88%, ${rgba("#e6dcff", 0.45)}, transparent 70%), radial-gradient(40% 10% at 30% 96%, ${rgba("#d6ccff", 0.45)}, transparent 70%), radial-gradient(40% 10% at 76% 98%, ${rgba("#d6ccff", 0.42)}, transparent 70%)`, anim: "s2co-drift 30s ease-in-out 2 alternate both" },
    a: { bg: "radial-gradient(130% 90% at 50% 40%, transparent 60%, rgba(10,8,30,0.4) 100%)" },
  },
  {
    slug: "orman-gecesi", rarity: "rare",
    name: "Orman Gecesi|Night Forest|Nachtwald|Bosque nocturno|Forêt de nuit|Floresta noturna|Ночной лес",
    desc: "Sisli çam ağaçlarının arasında ateş böcekleri yanıp söner.|Fireflies blink between misty pines.|Glühwürmchen blinken zwischen nebligen Kiefern.|Luciérnagas parpadean entre pinos con niebla.|Des lucioles clignotent entre des pins brumeux.|Vaga-lumes piscam entre pinheiros na névoa.|Светлячки мигают среди туманных сосен.",
    base: "#04100a",
    scene: [
      "conic-gradient(from 160deg at 10% 52%, transparent 0deg, #03110a 0deg 40deg, transparent 40deg) 0 0 / 100% 100% no-repeat",
      "conic-gradient(from 158deg at 24% 60%, transparent 0deg, #051a0f 0deg 44deg, transparent 44deg)",
      "conic-gradient(from 160deg at 76% 50%, transparent 0deg, #03110a 0deg 40deg, transparent 40deg)",
      "conic-gradient(from 158deg at 92% 58%, transparent 0deg, #051a0f 0deg 44deg, transparent 44deg)",
      `radial-gradient(70% 22% at 50% 74%, ${rgba("#9fd8b0", 0.14)}, transparent 70%)`,
      "linear-gradient(180deg, #071a14, #0a2a1a 60%, #04100a)",
    ],
    b: { bg: starsAt([[16, 62, 1.6], [30, 74, 1.3], [44, 58, 1.5], [57, 70, 1.2], [68, 60, 1.6], [83, 72, 1.3], [38, 82, 1.1], [74, 82, 1.2]], "rgba(220,255,150,0.95)"), anim: "s2co-twinkle 2.2s ease-in-out 14 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "kristal-magara", rarity: "epic",
    name: "Kristal Mağara|Crystal Cave|Kristallhöhle|Cueva de cristal|Grotte de cristal|Caverna de cristal|Хрустальная пещера",
    desc: "Mor ve turkuaz kristaller mağara duvarlarından parlar.|Violet and teal crystals glow from the cave walls.|Violette und türkise Kristalle leuchten aus den Höhlenwänden.|Cristales violeta y turquesa brillan en las paredes.|Des cristaux violets et sarcelle luisent sur les parois.|Cristais violeta e turquesa brilham nas paredes.|Фиолетовые и бирюзовые кристаллы светятся в стенах пещеры.",
    base: "#0c0618",
    scene: [
      `conic-gradient(from 20deg at 0% 100%, transparent 0deg 8deg, ${rgba("#8b3fd1", 0.3)} 9deg 12deg, transparent 14deg 22deg, ${rgba("#2ee6d6", 0.24)} 22deg 24deg, transparent 26deg 34deg, ${rgba("#b07cff", 0.26)} 34deg 38deg, transparent 41deg)`,
      `conic-gradient(from 300deg at 100% 100%, transparent 0deg 6deg, ${rgba("#2ee6d6", 0.26)} 6deg 9deg, transparent 11deg 20deg, ${rgba("#8b3fd1", 0.3)} 20deg 25deg, transparent 28deg 36deg, ${rgba("#e2c6ff", 0.22)} 36deg 38deg, transparent 39deg)`,
      `conic-gradient(from 150deg at 50% 0%, transparent 0deg 20deg, ${rgba("#6a2bb8", 0.24)} 20deg 24deg, transparent 26deg 34deg, ${rgba("#2ee6d6", 0.25)} 34deg 38deg, transparent 38deg)`,
      `radial-gradient(60% 40% at 50% 60%, ${rgba("#3a1670", 0.6)}, transparent 70%)`,
      "linear-gradient(180deg, #0c0618, #140a28 60%, #0a0414)",
    ],
    b: { bg: starsAt([[8, 82, 1.4], [16, 70, 1], [90, 78, 1.4], [84, 66, 1], [48, 12, 1.2], [56, 18, 0.9]], "rgba(240,230,255,0.95)"), anim: "s2co-twinkle 3s ease-in-out 8 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "studyo", rarity: "common",
    name: "Stüdyo|Studio Lights|Studiolicht|Luces de estudio|Lumières de studio|Luzes de estúdio|Студийный свет",
    desc: "Grafit bir stüdyoda iki sıcak spot ışığı sahneyi aydınlatır.|Two warm spotlights light the stage in a graphite studio.|Zwei warme Spots erhellen die Bühne in einem Graphitstudio.|Dos focos cálidos iluminan el escenario en un estudio grafito.|Deux projecteurs chauds éclairent la scène d'un studio graphite.|Dois holofotes quentes iluminam o palco num estúdio grafite.|Два тёплых прожектора освещают сцену графитовой студии.",
    base: "#0e0f13",
    scene: [
      `radial-gradient(60% 16% at 50% 92%, ${rgba("#ffffff", 0.06)}, transparent 70%)`,
      "linear-gradient(180deg, #16181f, #0e0f13 70%, #0a0b0e)",
    ],
    b: { bg: `conic-gradient(from 160deg at 24% -6%, transparent 0deg, ${rgba("#fff2dc", 0.13)} 8deg, ${rgba("#fff2dc", 0.05)} 20deg, transparent 28deg), conic-gradient(from 172deg at 76% -6%, transparent 0deg, ${rgba("#fff2dc", 0.05)} 8deg, ${rgba("#fff2dc", 0.13)} 20deg, transparent 28deg)`, anim: "s2co-breathe 6s ease-in-out 4 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "gun-batimi-iskelesi", rarity: "rare",
    name: "Gün Batımı İskelesi|Sunset Pier|Abendsteg|Muelle al ocaso|Ponton au couchant|Píer ao pôr do sol|Причал на закате",
    desc: "Çizgili büyük bir güneş denize batarken yansıması parıldar.|A great banded sun sinks into the sea as its reflection shimmers.|Eine große gestreifte Sonne sinkt ins Meer, ihr Spiegelbild glitzert.|Un gran sol a franjas se hunde en el mar y su reflejo brilla.|Un grand soleil rayé plonge dans la mer, son reflet scintille.|Um grande sol listrado afunda no mar e o reflexo cintila.|Большое полосатое солнце садится в море, отражение мерцает.",
    base: "#1a0a1e",
    scene: [
      "linear-gradient(180deg, transparent 62%, #1a0a24 62% 63%, transparent 63% 65.5%, #1a0a24 65.5% 66.5%, transparent 66.5% 68.5%, #1a0a24 68.5% 70%) 0 0 / 100% 100% no-repeat",
      `radial-gradient(circle at 50% 70%, #ffd27a 0 8%, #ff8a4c 13%, #ff4f8b 17.5%, transparent 18%)`,
      `radial-gradient(70% 34% at 50% 70%, ${rgba("#ff6a5a", 0.38)}, transparent 70%)`,
      "linear-gradient(180deg, #1a0a2e 0%, #3a1640 40%, #8a2a5a 62%, #2a0c2a 70.2%, #12061a 100%)",
    ],
    b: { bg: `repeating-linear-gradient(180deg, transparent 0 7px, ${rgba("#ffb37a", 0.22)} 7px 8px) 0 71% / 100% 29% no-repeat, linear-gradient(90deg, transparent 38%, ${rgba("#ffd27a", 0.12)} 46%, ${rgba("#ffd27a", 0.12)} 54%, transparent 62%) 0 71% / 100% 29% no-repeat`, anim: "s2co-breathe 4s ease-in-out 8 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "firtina-cephesi", rarity: "epic",
    name: "Fırtına Cephesi|Storm Front|Sturmfront|Frente de tormenta|Front orageux|Frente de tempestade|Грозовой фронт",
    desc: "Ağır bulutların arkasında yumuşak şimşekler arada bir çakar.|Soft lightning flickers now and then behind heavy clouds.|Hinter schweren Wolken flackern ab und zu sanfte Blitze.|Relámpagos suaves destellan a veces tras nubes densas.|De doux éclairs scintillent parfois derrière de lourds nuages.|Raios suaves piscam às vezes atrás de nuvens pesadas.|За тяжёлыми тучами время от времени вспыхивают мягкие молнии.",
    base: "#080b12",
    scene: [
      `repeating-linear-gradient(78deg, rgba(180,200,240,0.05) 0 1px, transparent 1px 16px)`,
      `radial-gradient(40% 16% at 20% 22%, ${rgba("#5a6c94", 0.75)}, transparent 70%)`,
      `radial-gradient(46% 18% at 70% 14%, ${rgba("#46557c", 0.85)}, transparent 70%)`,
      `radial-gradient(50% 20% at 50% 34%, ${rgba("#323e5e", 0.85)}, transparent 70%)`, `radial-gradient(60% 18% at 40% 46%, ${rgba("#1e2840", 0.9)}, transparent 70%)`,
      `radial-gradient(70% 30% at 50% 0%, ${rgba("#7aa7ff", 0.12)}, transparent 70%)`,
      "linear-gradient(180deg, #0e1424, #080b12 70%, #06080e)",
    ],
    b: { bg: `radial-gradient(40% 26% at 66% 18%, ${rgba("#dbe7ff", 0.22)}, transparent 70%), radial-gradient(30% 20% at 26% 26%, ${rgba("#b8ccff", 0.14)}, transparent 70%)`, anim: "s2co-storm 9s linear 5 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "cicek-bahcesi", rarity: "common",
    name: "Çiçek Bahçesi|Blossom Garden|Blütengarten|Jardín en flor|Jardin en fleurs|Jardim florido|Цветущий сад",
    desc: "Pembe çiçek bulanıklıkları yumuşak bir gece bahçesinde süzülür.|Pink blossom bokeh drifts through a soft night garden.|Rosa Blütenbokeh schwebt durch einen sanften Nachtgarten.|Bokeh de flores rosa flota en un suave jardín nocturno.|Un bokeh de fleurs roses flotte dans un doux jardin de nuit.|Bokeh de flores rosa flutua num jardim noturno suave.|Розовые цветочные блики плывут по ночному саду.",
    base: "#1a0c16",
    scene: [
      `radial-gradient(70% 50% at 50% 100%, ${rgba("#5a1a3a", 0.6)}, transparent 70%)`,
      "linear-gradient(180deg, #160a14, #1a0c16 60%, #24101c)",
    ],
    b: { inset: "0 -10%", bg: [[12, 20, 34, "#ff9ac0", 0.22], [28, 58, 22, "#ffc2d6", 0.18], [44, 16, 18, "#ff7aa8", 0.2], [62, 44, 30, "#ffb3cc", 0.16], [78, 18, 24, "#ff8fb0", 0.2], [88, 64, 36, "#ffd6e2", 0.14], [20, 84, 26, "#ff8fb0", 0.16], [56, 86, 20, "#ffb3cc", 0.18]].map(([x, y, r, c, a]) => `radial-gradient(circle at ${x}% ${y}%, ${rgba(c, a)} 0 ${r}px, ${rgba(c, a * 0.4)} ${r + 2}px, transparent ${r + 4}px)`).join(", "), anim: "s2co-drift 26s ease-in-out 2 alternate both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "kozmik-girdap", rarity: "legendary",
    name: "Kozmik Girdap|Cosmic Vortex|Kosmischer Wirbel|Vórtice cósmico|Vortex cosmique|Vórtice cósmico|Космический вихрь",
    desc: "Bir galaksinin parlak kolları sahnenin arkasında ağır ağır döner.|The bright arms of a galaxy turn slowly behind the stage.|Die hellen Arme einer Galaxie drehen sich langsam hinter der Bühne.|Los brazos brillantes de una galaxia giran tras el escenario.|Les bras lumineux d'une galaxie tournent derrière la scène.|Os braços brilhantes de uma galáxia giram atrás do palco.|Яркие рукава галактики медленно вращаются за сценой.",
    base: "#06041a",
    scene: [
      starsAt(STARS_A, "rgba(230,220,255,0.8)"),
      `radial-gradient(circle at 64% 40%, #fff6e0 0 1.2%, ${rgba("#ffe9a8", 0.7)} 3%, ${rgba("#a77bff", 0.35)} 12%, transparent 30%)`,
      "linear-gradient(180deg, #06041a, #0c0828 60%, #06041a)",
    ],
    b: { inset: "-40% -20%", bg: `conic-gradient(from 0deg at 64% 40%, ${rgba("#a77bff", 0)} 0deg, ${rgba("#c6b7ff", 0.42)} 30deg, ${rgba("#a77bff", 0)} 80deg, ${rgba("#a77bff", 0)} 180deg, ${rgba("#ffb3e6", 0.36)} 210deg, ${rgba("#a77bff", 0)} 260deg)`, mask: "radial-gradient(42% 56% at 64% 40%, #000 10%, transparent 100%)", origin: "64% 40%", anim: "s2fx-spin 120s linear 1 both" },
    a: { bg: VIGNETTE },
  },
  {
    slug: "holo-oda", rarity: "legendary",
    name: "Holo Oda|Holo Room|Holoraum|Sala holográfica|Salle holo|Sala holográfica|Голо-зал",
    desc: "Parlayan bir ızgara zemin ufka doğru akar, ufuk pembe ve camgöbeği yanar.|A glowing grid floor flows toward a pink and cyan horizon.|Ein leuchtender Rasterboden fließt zu einem pink-cyanen Horizont.|Un suelo de rejilla luminosa fluye hacia un horizonte rosa y cian.|Un sol quadrillé lumineux file vers un horizon rose et cyan.|Um piso de grade luminosa corre para um horizonte rosa e ciano.|Светящийся пол-сетка уходит к розово-голубому горизонту.",
    base: "#070a18",
    scene: [
      `linear-gradient(180deg, transparent 54%, ${rgba("#ff7ce5", 0.5)} 56%, ${rgba("#7cf3ff", 0.35)} 57.5%, transparent 61%)`,
      `radial-gradient(60% 20% at 50% 57%, ${rgba("#c87cff", 0.35)}, transparent 70%)`,
      starsAt(STARS_B.map(([x, y, r]) => [x, y * 1.2, r || 1]), "rgba(200,240,255,0.7)"),
      "linear-gradient(180deg, #070a18, #0e0a28 56%, #05060f 57%, #04050c)",
    ],
    b: { inset: "57% -60% -30% -60%", bg: `repeating-linear-gradient(0deg, ${rgba("#7cf3ff", 0.4)} 0 1.5px, transparent 1.5px 36px), repeating-linear-gradient(90deg, ${rgba("#ff7ce5", 0.35)} 0 1.5px, transparent 1.5px 60px)`, mask: "linear-gradient(180deg, transparent, #000 30%)", origin: "50% 0%", css: "transform: perspective(420px) rotateX(64deg);", anim: "s2co-grid 1.6s linear 24 both" },
    a: { bg: VIGNETTE },
  },
];

module.exports = { OVERLAY };
