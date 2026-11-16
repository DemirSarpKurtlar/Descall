"use strict";

/**
 * reaction_burst: 16 one-shot bursts. The chat puts burst-chip-<key> on the
 * reacted chip for 520 ms (BURST_LIFETIME_MS) and burst-<key> on the
 * reactions row, so everything here finishes inside 0.5 s:
 *   chip  = chip colours while the burst plays + its own pop keyframes
 *   b / a = ::before / ::after centred on the chip, behind its content
 *   glow  = colour of the glow on the flying emoji particles
 * The resting declarations are the peak frame (used as the still frame for
 * reduced motion); keyframes run from nothing to that peak and fade.
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");

const ringG = (c, at = 84, w = 6) => `radial-gradient(closest-side, transparent ${at - w}%, ${c} ${at}%, transparent ${Math.min(100, at + w)}%)`;
const around = (n, r, fn) => Array.from({ length: n }, (_, i) => {
  const d = (360 / n) * i;
  const rad = (d * Math.PI) / 180;
  return fn((50 + Math.sin(rad) * r).toFixed(1), (50 - Math.cos(rad) * r).toFixed(1), i, d);
}).join(", ");

const BURST = [
  {
    slug: "sok-dalgasi", rarity: "common",
    name: "Şok Dalgası|Shockwave|Druckwelle|Onda expansiva|Onde de choc|Onda de choque|Ударная волна",
    desc: "Tepkin iki parlak halkayla dışa doğru patlar.|Your reaction bursts outward in two bright rings.|Deine Reaktion platzt in zwei hellen Ringen nach außen.|Tu reacción estalla hacia fuera en dos anillos brillantes.|Ta réaction éclate en deux anneaux lumineux.|Sua reação explode em dois anéis brilhantes.|Реакция разлетается двумя яркими кольцами.",
    chip: { bg: "linear-gradient(180deg, rgba(120,170,255,0.32), rgba(88,122,245,0.22))", border: "#9fbaff", glow: "#587af5", anim: "s2rb-chip-pop" },
    b: { size: 64, bg: ringG("#cfe0ff"), anim: "s2rb-ring 0.48s cubic-bezier(.2,.8,.3,1) both" },
    a: { size: 64, bg: ringG(rgba("#7aa2ff", 0.85), 82, 4), anim: "s2rb-ring 0.42s cubic-bezier(.2,.8,.3,1) 0.08s both" },
    glow: "#8fb0ff",
  },
  {
    slug: "konfeti", rarity: "rare",
    name: "Konfeti Yağmuru|Confetti Pop|Konfettiregen|Lluvia de confeti|Pluie de confettis|Chuva de confete|Конфетти",
    desc: "Rengârenk konfeti parçaları dönerek etrafa saçılır.|Bright confetti spins out in every direction.|Bunte Konfetti wirbeln in alle Richtungen.|Confeti de colores sale girando en todas direcciones.|Des confettis colorés jaillissent en tournoyant.|Confetes coloridos voam girando para todos os lados.|Яркое конфетти разлетается во все стороны.",
    chip: { bg: "linear-gradient(120deg, rgba(255,90,170,0.3), rgba(255,210,70,0.26), rgba(80,220,255,0.28))", border: "#ffd2ea", glow: "#ff5aaa", anim: "s2rb-chip-wiggle" },
    a: { size: 76, bg: around(12, 40, (x, y, i) => `radial-gradient(ellipse ${i % 2 ? "3.2px 1.4px" : "1.4px 3.4px"} at ${x}% ${y}%, ${["#ff5aaa", "#ffd246", "#50dcff", "#8cff6a", "#b38cff", "#ff8a3d"][i % 6]} 0 100%, transparent)`), anim: "s2rb-spin-out 0.5s cubic-bezier(.15,.8,.3,1) both" },
    b: { size: 54, bg: ringG(rgba("#ffd2ea", 0.7), 80, 8), anim: "s2rb-ring 0.4s ease-out both" },
    glow: "#ff8acb",
  },
  {
    slug: "yildiz-patlamasi", rarity: "rare",
    name: "Yıldız Patlaması|Star Pop|Sternenknall|Estallido estelar|Éclat d'étoile|Estouro estelar|Звёздная вспышка",
    desc: "Sekiz altın ışın tepkinin arkasından parlar.|Eight golden rays flare behind your reaction.|Acht goldene Strahlen blitzen hinter deiner Reaktion.|Ocho rayos dorados destellan tras tu reacción.|Huit rayons dorés jaillissent derrière ta réaction.|Oito raios dourados brilham atrás da sua reação.|Восемь золотых лучей вспыхивают за реакцией.",
    chip: { bg: "linear-gradient(180deg, rgba(255,214,90,0.36), rgba(255,150,30,0.24))", border: "#ffe08a", glow: "#ffb02e", anim: "s2rb-chip-pop" },
    a: { size: 80, bg: "repeating-conic-gradient(from 0deg, rgba(255,232,150,0.95) 0 5deg, transparent 5deg 45deg)", mask: "radial-gradient(closest-side, transparent 34%, #000 42%, #000 70%, transparent 100%)", anim: "s2rb-rays 0.5s cubic-bezier(.2,.8,.3,1) both" },
    b: { size: 48, bg: "radial-gradient(closest-side, rgba(255,240,180,0.9), rgba(255,190,60,0.45) 50%, transparent)", anim: "s2rb-flash 0.36s ease-out both" },
    glow: "#ffcf5a",
  },
  {
    slug: "kalp-dalgasi", rarity: "common",
    name: "Kalp Dalgası|Heart Wave|Herzwelle|Ola de corazón|Vague de cœur|Onda de coração|Волна сердца",
    desc: "Yumuşak pembe halkalar tepkinden kalp atışı gibi yayılır.|Soft pink rings spread from your reaction like a heartbeat.|Weiche pinke Ringe breiten sich wie ein Herzschlag aus.|Anillos rosa suaves se expanden como un latido.|De doux anneaux roses s'étendent comme un battement.|Anéis rosa suaves se espalham como um batimento.|Мягкие розовые кольца расходятся, как стук сердца.",
    chip: { bg: "linear-gradient(180deg, rgba(255,120,160,0.34), rgba(255,77,115,0.22))", border: "#ffb3c8", glow: "#ff4d73", anim: "s2rb-chip-beat" },
    b: { size: 58, bg: `radial-gradient(closest-side, ${rgba("#ff8fb0", 0.35)}, transparent 70%), ${ringG("#ffb3c8", 86, 5)}`, anim: "s2rb-ring 0.46s ease-out both" },
    a: { size: 58, bg: ringG(rgba("#ff6f9a", 0.85), 86, 4), anim: "s2rb-ring 0.4s ease-out 0.12s both" },
    glow: "#ff8fb0",
  },
  {
    slug: "neon-damga", rarity: "rare",
    name: "Neon Damga|Neon Stamp|Neonstempel|Sello de neón|Tampon néon|Carimbo neon|Неоновый штамп",
    desc: "Tepkin camgöbeği neon bir damgayla yere vurulur.|Your reaction lands with a cyan neon stamp.|Deine Reaktion landet mit einem cyanfarbenen Neonstempel.|Tu reacción cae con un sello de neón cian.|Ta réaction tombe avec un tampon néon cyan.|Sua reação cai com um carimbo neon ciano.|Реакция ложится голубым неоновым штампом.",
    chip: { bg: "rgba(46,242,255,0.16)", border: "#2ef2ff", glow: "#2ef2ff", anim: "s2rb-chip-stamp" },
    b: { w: 74, h: 40, round: "14px", css: "box-shadow: 0 0 0 1.5px #2ef2ff, 0 0 12px rgba(46,242,255,0.8), inset 0 0 10px rgba(46,242,255,0.4);", anim: "s2rb-stamp 0.42s cubic-bezier(.3,1.4,.5,1) both" },
    a: { w: 90, h: 50, round: "18px", css: "box-shadow: 0 0 0 1px rgba(255,46,136,0.85), 0 0 10px rgba(255,46,136,0.6);", anim: "s2rb-stamp 0.46s cubic-bezier(.3,1.4,.5,1) 0.06s both" },
    glow: "#2ef2ff",
  },
  {
    slug: "buz-kirigi", rarity: "epic",
    name: "Buz Kırığı|Ice Shatter|Eissplitter|Esquirla de hielo|Éclat de glace|Estilhaço de gelo|Ледяные осколки",
    desc: "Buz kıymıkları tepkinin çevresinden dışa fırlar.|Shards of ice shoot outward around your reaction.|Eissplitter schießen rund um deine Reaktion hinaus.|Esquirlas de hielo salen disparadas alrededor.|Des éclats de glace jaillissent autour de ta réaction.|Estilhaços de gelo disparam em volta da reação.|Ледяные осколки разлетаются вокруг реакции.",
    chip: { bg: "linear-gradient(180deg, rgba(200,240,255,0.32), rgba(80,170,230,0.2))", border: "#d6f4ff", glow: "#7cd0ff", anim: "s2rb-chip-pop" },
    a: { size: 84, bg: "conic-gradient(from 0deg, transparent 0 8deg, rgba(230,248,255,0.95) 8deg 11deg, transparent 11deg 52deg, rgba(166,231,255,0.9) 52deg 54deg, transparent 54deg 96deg, rgba(230,248,255,0.95) 96deg 99deg, transparent 99deg 140deg, rgba(166,231,255,0.85) 140deg 142deg, transparent 142deg 188deg, rgba(230,248,255,0.95) 188deg 191deg, transparent 191deg 232deg, rgba(166,231,255,0.9) 232deg 234deg, transparent 234deg 276deg, rgba(230,248,255,0.95) 276deg 279deg, transparent 279deg 318deg, rgba(166,231,255,0.9) 318deg 320deg, transparent 320deg)", mask: "radial-gradient(closest-side, transparent 36%, #000 46%, #000 76%, transparent 100%)", anim: "s2rb-spin-out 0.44s cubic-bezier(.1,.9,.3,1) both" },
    b: { size: 52, bg: `radial-gradient(closest-side, ${rgba("#e6f8ff", 0.5)}, ${rgba("#7cd0ff", 0.2)} 60%, transparent), ${ringG("#e6f8ff", 90, 4)}`, anim: "s2rb-ring 0.4s ease-out both" },
    glow: "#a6e7ff",
  },
  {
    slug: "alev-dili", rarity: "epic",
    name: "Alev Dili|Flame Lick|Flammenzunge|Lengua de fuego|Langue de feu|Língua de fogo|Язык пламени",
    desc: "Tepkinin arkasından bir alev yükselir, közler savrulur.|A flame leaps up behind your reaction and throws embers.|Hinter deiner Reaktion schlägt eine Flamme hoch und sprüht Glut.|Una llama sube tras tu reacción y lanza brasas.|Une flamme jaillit derrière ta réaction et projette des braises.|Uma chama sobe atrás da reação e lança brasas.|За реакцией взвивается пламя и рассыпает угли.",
    chip: { bg: "linear-gradient(0deg, rgba(255,90,20,0.4), rgba(255,200,80,0.22))", border: "#ffc26b", glow: "#ff6a1f", anim: "s2rb-chip-pop" },
    b: { w: 46, h: 70, round: "50% 50% 46% 46% / 62% 62% 38% 38%", bg: "radial-gradient(ellipse 46% 56% at 50% 64%, #fff3b0 0%, #ffb02e 30%, rgba(255,90,20,0.75) 55%, transparent 78%)", origin: "50% 85%", anim: "s2rb-flame 0.5s cubic-bezier(.2,.8,.3,1) both" },
    a: { size: 70, bg: `${["30% 30%", "64% 22%", "48% 12%", "74% 40%", "24% 46%"].map((p, i) => `radial-gradient(circle at ${p}, ${["#ffd27a", "#ff8a3d", "#fff3b0", "#ff6a2b", "#ffb35a"][i]} 0 1.6px, transparent 2.6px)`).join(", ")}`, anim: "s2rb-rise 0.5s ease-out both" },
    glow: "#ff8a3d",
  },
  {
    slug: "mor-burgac", rarity: "epic",
    name: "Mor Burgaç|Void Swirl|Leerenstrudel|Remolino del vacío|Tourbillon du néant|Redemoinho do vazio|Вихрь пустоты",
    desc: "Mor bir girdap dönerek tepkinin içine çöker.|A violet swirl spins and collapses into your reaction.|Ein violetter Strudel dreht sich und stürzt in deine Reaktion.|Un remolino violeta gira y colapsa en tu reacción.|Un tourbillon violet tourne et s'effondre dans ta réaction.|Um redemoinho violeta gira e colapsa na reação.|Фиолетовый вихрь закручивается и схлопывается в реакцию.",
    chip: { bg: "linear-gradient(180deg, rgba(150,90,255,0.36), rgba(70,30,160,0.3))", border: "#c6a8ff", glow: "#8a4dff", anim: "s2rb-chip-pop" },
    a: { size: 66, bg: "repeating-conic-gradient(from 0deg, rgba(220,200,255,0.95) 0deg, rgba(140,90,255,0.55) 16deg, transparent 24deg, transparent 45deg)", mask: "radial-gradient(closest-side, transparent 20%, #000 34%, #000 70%, transparent 100%)", anim: "s2rb-implode 0.5s cubic-bezier(.5,0,.3,1) both" },
    b: { size: 44, bg: "radial-gradient(closest-side, rgba(20,8,40,0.7), rgba(124,77,255,0.45) 60%, transparent)", anim: "s2rb-flash 0.5s ease-in-out both" },
    glow: "#a77bff",
  },
  {
    slug: "altin-yagmur", rarity: "rare",
    name: "Altın Yağmur|Gold Shower|Goldregen|Lluvia de oro|Pluie d'or|Chuva de ouro|Золотой дождь",
    desc: "Altın pullar parlayıp tepkinin üstünden aşağı süzülür.|Gold flakes sparkle and drift down over your reaction.|Goldflocken funkeln und rieseln über deine Reaktion.|Copos de oro brillan y caen sobre tu reacción.|Des paillettes d'or scintillent et retombent sur ta réaction.|Flocos de ouro brilham e caem sobre a reação.|Золотые хлопья сверкают и осыпаются на реакцию.",
    chip: { bg: "linear-gradient(180deg, rgba(255,220,110,0.34), rgba(200,140,20,0.24))", border: "#ffe08a", glow: "#f2c230", anim: "s2rb-chip-pop" },
    a: { size: 80, bg: [[22, 20], [38, 8], [56, 16], [72, 6], [84, 22], [30, 34], [64, 30], [48, 26], [14, 36], [88, 36]].map(([x, y], i) => `radial-gradient(circle at ${x}% ${y}%, ${i % 3 ? "#ffd65a" : "#fff6cf"} 0 ${i % 3 ? 1.3 : 1.7}px, transparent ${i % 3 ? 2.2 : 2.8}px)`).join(", "), anim: "s2rb-fall 0.5s ease-in both" },
    b: { size: 50, bg: "radial-gradient(closest-side, rgba(255,230,140,0.6), rgba(242,194,48,0.25) 55%, transparent)", anim: "s2rb-flash 0.4s ease-out both" },
    glow: "#ffd65a",
  },
  {
    slug: "elektrik", rarity: "rare",
    name: "Elektrik|Zap|Zap|Descarga|Décharge|Choque|Разряд",
    desc: "Mavi beyaz bir elektrik çakması tepkiyi sarsar.|A blue-white electric snap jolts your reaction.|Ein blauweißer Stromschlag rüttelt an deiner Reaktion.|Una descarga eléctrica blanco azulada sacude tu reacción.|Une décharge bleu-blanc secoue ta réaction.|Um choque elétrico branco-azulado sacode a reação.|Бело-голубой разряд встряхивает реакцию.",
    chip: { bg: "linear-gradient(180deg, rgba(150,190,255,0.34), rgba(60,100,220,0.24))", border: "#e6efff", glow: "#7aa7ff", anim: "s2rb-chip-shake" },
    a: { size: 78, bg: "conic-gradient(from 10deg, transparent 0 30deg, #f5f9ff 30deg 33deg, transparent 33deg 100deg, #b8d0ff 100deg 102deg, transparent 102deg 170deg, #f5f9ff 170deg 173deg, transparent 173deg 250deg, #b8d0ff 250deg 252deg, transparent 252deg 320deg, #f5f9ff 320deg 322deg, transparent 322deg)", mask: "radial-gradient(closest-side, transparent 38%, #000 46%, #000 78%, transparent 100%)", anim: "s2rb-zap 0.46s steps(1) both" },
    b: { size: 52, bg: "radial-gradient(closest-side, rgba(230,240,255,0.75), rgba(122,167,255,0.3) 55%, transparent)", anim: "s2rb-zap 0.46s steps(1) 0.06s both" },
    glow: "#b8d0ff",
  },
  {
    slug: "cicek-acimi", rarity: "epic",
    name: "Çiçek Açımı|Bloom Burst|Blütenstoß|Estallido floral|Éclosion|Desabrochar|Цветение",
    desc: "Altı yaprak tepkinin çevresinde dönerek açılır.|Six petals unfold and turn around your reaction.|Sechs Blätter entfalten sich drehend um deine Reaktion.|Seis pétalos se abren girando alrededor de tu reacción.|Six pétales s'ouvrent en tournant autour de ta réaction.|Seis pétalas se abrem girando em volta da reação.|Шесть лепестков раскрываются вокруг реакции.",
    chip: { bg: "linear-gradient(180deg, rgba(255,170,200,0.34), rgba(220,90,150,0.22))", border: "#ffd6e2", glow: "#ff8fb0", anim: "s2rb-chip-pop" },
    a: { size: 74, bg: around(6, 30, (x, y) => `radial-gradient(circle at ${x}% ${y}%, #ffe3ec 0 3px, ${rgba("#ff8fb0", 0.85)} 5px, transparent 8px)`), anim: "s2rb-petal 0.5s cubic-bezier(.2,.8,.3,1) both" },
    b: { size: 40, bg: "radial-gradient(closest-side, rgba(255,240,200,0.8), rgba(255,180,120,0.35) 55%, transparent)", anim: "s2rb-flash 0.4s ease-out both" },
    glow: "#ffb3c8",
  },
  {
    slug: "prizma-ayrimi", rarity: "epic",
    name: "Prizma Ayrımı|Prism Split|Prismenspaltung|División prismática|Division prismatique|Divisão prismática|Призменный сдвиг",
    desc: "Kırmızı ve camgöbeği halkalar kayarak ikiye ayrılır.|Red and cyan rings slide apart like split light.|Rote und cyane Ringe gleiten wie gespaltenes Licht auseinander.|Anillos rojo y cian se separan como luz dividida.|Des anneaux rouge et cyan glissent comme une lumière scindée.|Anéis vermelho e ciano se afastam como luz dividida.|Красное и голубое кольца расходятся, как расщеплённый свет.",
    chip: { bg: "linear-gradient(115deg, rgba(255,60,110,0.26), rgba(255,255,255,0.12), rgba(60,200,255,0.26))", border: "#ffffff", glow: "#a68cff", anim: "s2rb-chip-pop" },
    b: { size: 60, bg: ringG(rgba("#ff3b6b", 0.95), 84, 6), anim: "s2rb-split-l 0.48s cubic-bezier(.2,.8,.3,1) both" },
    a: { size: 60, bg: ringG(rgba("#3bc8ff", 0.95), 84, 6), anim: "s2rb-split-r 0.48s cubic-bezier(.2,.8,.3,1) both" },
    glow: "#c8b8ff",
  },
  {
    slug: "murekkep", rarity: "rare",
    name: "Mürekkep Lekesi|Ink Splash|Tintenklecks|Salpicadura de tinta|Éclaboussure d'encre|Respingo de tinta|Клякса",
    desc: "Koyu mor mürekkep tepkinin arkasına sıçrar.|Dark violet ink splashes out behind your reaction.|Dunkelviolette Tinte spritzt hinter deiner Reaktion.|Tinta violeta oscura salpica tras tu reacción.|De l'encre violet sombre éclabousse derrière ta réaction.|Tinta violeta escura respinga atrás da reação.|Тёмно-фиолетовые чернила брызгают за реакцией.",
    chip: { bg: "linear-gradient(180deg, rgba(110,60,200,0.36), rgba(50,20,110,0.3))", border: "#b49cff", glow: "#6a3cd8", anim: "s2rb-chip-stamp" },
    b: { size: 66, bg: "radial-gradient(circle at 50% 50%, rgba(80,40,170,0.85) 0 34%, transparent 35%), radial-gradient(circle at 22% 30%, rgba(90,50,190,0.85) 0 12%, transparent 13%), radial-gradient(circle at 80% 26%, rgba(90,50,190,0.8) 0 9%, transparent 10%), radial-gradient(circle at 76% 76%, rgba(80,40,170,0.85) 0 13%, transparent 14%), radial-gradient(circle at 18% 74%, rgba(90,50,190,0.8) 0 8%, transparent 9%), radial-gradient(circle at 50% 8%, rgba(120,80,220,0.8) 0 5%, transparent 6%)", anim: "s2rb-splat 0.5s cubic-bezier(.2,.9,.3,1) both" },
    a: { size: 72, bg: "radial-gradient(circle at 92% 50%, rgba(160,120,255,0.9) 0 3px, transparent 4px), radial-gradient(circle at 8% 52%, rgba(160,120,255,0.9) 0 2.5px, transparent 3.5px), radial-gradient(circle at 50% 94%, rgba(160,120,255,0.8) 0 2px, transparent 3px)", anim: "s2rb-pop 0.5s ease-out both" },
    glow: "#8a5cff",
  },
  {
    slug: "halka-zinciri", rarity: "legendary",
    name: "Halka Zinciri|Ring Cascade|Ringkaskade|Cascada de anillos|Cascade d'anneaux|Cascata de anéis|Каскад колец",
    desc: "Üç altın halka art arda yayılır, kıvılcımlar dolaşır.|Three golden rings spread one after another as sparks circle.|Drei goldene Ringe breiten sich nacheinander aus, Funken kreisen.|Tres anillos dorados se expanden uno tras otro entre chispas.|Trois anneaux dorés s'étendent l'un après l'autre, des étincelles tournent.|Três anéis dourados se espalham um após o outro entre faíscas.|Три золотых кольца расходятся одно за другим в искрах.",
    chip: { bg: "linear-gradient(180deg, rgba(255,214,120,0.36), rgba(255,170,60,0.24))", border: "#fff1c2", glow: "#ffbf3a", anim: "s2rb-chip-pop" },
    b: { size: 76, bg: `${ringG("#fff1c2", 92, 3)}, ${ringG(rgba("#ffd26e", 0.85), 70, 3)}, ${ringG(rgba("#ff9a2e", 0.75), 48, 3)}`, anim: "s2rb-ring 0.5s cubic-bezier(.2,.8,.3,1) both" },
    a: { size: 84, bg: around(6, 42, (x, y) => `radial-gradient(circle at ${x}% ${y}%, #fff 0 1.3px, ${rgba("#ffd26e", 0.7)} 2px, transparent 3.4px)`), anim: "s2rb-spin-out 0.5s cubic-bezier(.2,.8,.3,1) both" },
    glow: "#ffe08a",
  },
  {
    slug: "supernova", rarity: "legendary",
    name: "Süpernova|Supernova|Supernova|Supernova|Supernova|Supernova|Сверхновая",
    desc: "Beyaz bir parlama ve mor bulutsu halkası tepkini kutlar.|A white flash and a violet nebula ring celebrate your reaction.|Ein weißer Blitz und ein violetter Nebelring feiern deine Reaktion.|Un destello blanco y un anillo de nebulosa celebran tu reacción.|Un éclair blanc et un anneau de nébuleuse fêtent ta réaction.|Um clarão branco e um anel de nebulosa celebram a reação.|Белая вспышка и кольцо туманности празднуют реакцию.",
    chip: { bg: "linear-gradient(180deg, rgba(220,200,255,0.4), rgba(110,70,230,0.3))", border: "#ffffff", glow: "#a77bff", anim: "s2rb-chip-stamp" },
    b: { size: 70, bg: `radial-gradient(closest-side, #ffffff 0%, ${rgba("#e6dcff", 0.85)} 22%, ${rgba("#a77bff", 0.45)} 44%, transparent 60%), ${ringG(rgba("#c6b7ff", 0.85), 86, 8)}`, anim: "s2rb-nova 0.5s cubic-bezier(.2,.8,.3,1) both" },
    a: { size: 92, bg: "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.85) 0 2deg, transparent 2deg 22.5deg)", mask: "radial-gradient(closest-side, transparent 30%, #000 40%, #000 64%, transparent 100%)", anim: "s2rb-rays 0.5s cubic-bezier(.2,.8,.3,1) both" },
    glow: "#e6dcff",
  },
  {
    slug: "ruzgar-gulu", rarity: "legendary",
    name: "Rüzgâr Gülü|Pinwheel|Windrad|Molinete|Moulin à vent|Cata-vento|Вертушка",
    desc: "Renkli kanatlar tepkinin çevresinde fırıl fırıl açılır.|Coloured blades whirl open around your reaction.|Bunte Flügel wirbeln rund um deine Reaktion auf.|Aspas de colores se abren girando alrededor.|Des pales colorées s'ouvrent en tourbillonnant autour.|Pás coloridas se abrem girando em volta da reação.|Цветные лопасти раскручиваются вокруг реакции.",
    chip: { bg: "linear-gradient(120deg, rgba(255,124,229,0.3), rgba(124,243,255,0.26), rgba(255,242,124,0.26))", border: "#ffffff", glow: "#7cf3ff", anim: "s2rb-chip-wiggle" },
    a: { size: 82, bg: "conic-gradient(from 0deg, rgba(255,124,229,0.9) 0 30deg, transparent 30deg 60deg, rgba(124,243,255,0.9) 60deg 90deg, transparent 90deg 120deg, rgba(255,242,124,0.9) 120deg 150deg, transparent 150deg 180deg, rgba(179,255,124,0.9) 180deg 210deg, transparent 210deg 240deg, rgba(200,124,255,0.9) 240deg 270deg, transparent 270deg 300deg, rgba(255,154,124,0.9) 300deg 330deg, transparent 330deg)", mask: "radial-gradient(closest-side, transparent 34%, #000 44%, #000 66%, transparent 92%)", anim: "s2rb-whirl 0.5s cubic-bezier(.2,.8,.3,1) both" },
    b: { size: 50, bg: ringG(rgba("#ffffff", 0.8), 86, 5), anim: "s2rb-ring 0.42s ease-out 0.05s both" },
    glow: "#ffffff",
  },
];

module.exports = { BURST };
