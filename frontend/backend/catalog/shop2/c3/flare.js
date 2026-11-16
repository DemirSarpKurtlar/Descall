"use strict";

/**
 * presence_flare: 30 status-dot flares. The dot keeps its status colour
 * (online / idle / dnd) as the core; a flare repaints the dot's border as a
 * gradient ring, adds a soft glow and up to two outside layers (::before,
 * ::after) that orbit, ping, twinkle or rotate. Sizes: 10 to 26 px dots.
 *   ring  = background for the border band (border-box)
 *   glow  = glow colour around the dot
 *   b / a = ::before / ::after: { inset (% of the dot), bg, mask, anim, css }
 * Names / descriptions: tr|en|de|es|fr|pt-BR|ru.
 */
const { rgba } = require("./fx");

/** Mask that keeps a layer outside the dot itself. */
const OUT = "radial-gradient(closest-side, transparent 56%, #000 64%)";
const OUT_BAND = "radial-gradient(closest-side, transparent 56%, #000 62%, #000 92%, transparent 100%)";
/** Mask for the dot's own ring band (pseudo at inset -45%). */
const RING = "radial-gradient(closest-side, transparent 62%, #000 70%, #000 94%, transparent 100%)";
const dotAt = (x, y, r, c, halo) => `radial-gradient(circle at ${x}% ${y}%, ${c} 0 ${r}px, ${halo ? rgba(halo, 0.55) : "transparent"} ${r + 0.6}px, transparent ${halo ? r * 3 : r + 1}px)`;
const spin = (s) => `s2fx-spin ${s}s linear infinite`;

const FLARE = [
  {
    slug: "nabiz", rarity: "common",
    name: "Nabız|Pulse|Puls|Pulso|Pouls|Pulso|Пульс",
    desc: "Mavi bir sinyal halkası noktadan dışa yayılır.|A blue signal ring spreads out from the dot.|Ein blauer Signalring breitet sich vom Punkt aus.|Un anillo de señal azul se expande desde el punto.|Un anneau de signal bleu s'étend depuis le point.|Um anel de sinal azul se espalha a partir do ponto.|Синее кольцо сигнала расходится от точки.",
    ring: "linear-gradient(160deg, #b8c8ff, #587af5)", glow: "#587af5",
    a: { inset: -45, css: "box-shadow: 0 0 0 1.5px rgba(88,122,245,0.95);", anim: "s2pf-ping 2s cubic-bezier(.2,.7,.3,1) infinite" },
  },
  {
    slug: "yorunge-kivilcimi", rarity: "common",
    name: "Yörünge Kıvılcımı|Orbit Spark|Orbitfunke|Chispa en órbita|Étincelle en orbite|Faísca em órbita|Искра на орбите",
    desc: "Altın bir kıvılcım durum noktasının çevresinde döner.|A golden spark circles your status dot.|Ein goldener Funke kreist um deinen Statuspunkt.|Una chispa dorada gira alrededor de tu estado.|Une étincelle dorée tourne autour de ton statut.|Uma faísca dourada gira em volta do seu status.|Золотая искра кружит вокруг статуса.",
    ring: "linear-gradient(160deg, #fff0b8, #f2b630 55%, #b8780c)", glow: "#ffbf3a",
    a: { inset: -100, bg: `${dotAt(50, 7, 1.7, "#fff6d0", "#ffbf3a")}, conic-gradient(from -70deg, transparent 0deg, ${rgba("#ffbf3a", 0.55)} 66deg, transparent 70deg)`, mask: OUT_BAND, anim: spin(2.4) },
  },
  {
    slug: "ikiz-uydu", rarity: "rare",
    name: "İkiz Uydu|Twin Moons|Zwillingsmonde|Lunas gemelas|Lunes jumelles|Luas gêmeas|Две луны",
    desc: "Camgöbeği ve pembe iki uydu zıt yönlerde döner.|A cyan and a pink moon orbit in opposite directions.|Ein cyaner und ein pinker Mond kreisen gegenläufig.|Una luna cian y otra rosa orbitan en sentidos opuestos.|Une lune cyan et une rose tournent en sens inverse.|Uma lua ciano e outra rosa orbitam em sentidos opostos.|Голубая и розовая луны кружат навстречу.",
    ring: "conic-gradient(#3de8ff, #ff5ad1, #3de8ff)", glow: "#9a8cff",
    b: { inset: -95, bg: dotAt(50, 7, 1.5, "#d6fbff", "#3de8ff"), anim: spin(3) },
    a: { inset: -125, bg: dotAt(50, 93, 1.3, "#ffd1f3", "#ff5ad1"), anim: "s2fx-spin 4.4s linear infinite reverse" },
  },
  {
    slug: "gunes-patlamasi", rarity: "rare",
    name: "Güneş Patlaması|Sunburst|Sonnenstrahl|Estallido solar|Éclat solaire|Explosão solar|Солнечная вспышка",
    desc: "Altın ışınlar noktanın çevresinde yavaşça döner.|Golden rays turn slowly around the dot.|Goldene Strahlen drehen sich langsam um den Punkt.|Rayos dorados giran despacio alrededor del punto.|Des rayons dorés tournent lentement autour du point.|Raios dourados giram devagar em volta do ponto.|Золотые лучи медленно вращаются вокруг точки.",
    ring: "linear-gradient(160deg, #fff2b0, #ff9a1c)", glow: "#ffb02e",
    b: { inset: -115, bg: `repeating-conic-gradient(from 0deg, ${rgba("#ffd25a", 0.95)} 0 5deg, transparent 5deg 30deg)`, mask: "radial-gradient(closest-side, transparent 52%, #000 60%, #000 74%, transparent 100%)", anim: spin(12) },
  },
  {
    slug: "buz-halesi", rarity: "rare",
    name: "Buz Halesi|Frost Halo|Frosthalo|Halo de escarcha|Halo de givre|Halo de geada|Морозный ореол",
    desc: "Altı buz iğnesi noktanın çevresinde parıldar.|Six needles of ice glitter around the dot.|Sechs Eisnadeln glitzern um den Punkt.|Seis agujas de hielo brillan alrededor del punto.|Six aiguilles de glace scintillent autour du point.|Seis agulhas de gelo cintilam em volta do ponto.|Шесть ледяных игл сверкают вокруг точки.",
    ring: "conic-gradient(#ffffff, #a6e7ff 25%, #3a8fb7 50%, #a6e7ff 75%, #ffffff)", glow: "#a6e7ff",
    b: { inset: -110, bg: `repeating-conic-gradient(from 0deg, ${rgba("#e6f8ff", 0.95)} 0 3deg, transparent 3deg 60deg)`, mask: "radial-gradient(closest-side, transparent 54%, #000 60%, #000 82%, transparent 100%)", anim: "s2fx-twinkle 2.8s ease-in-out infinite" },
  },
  {
    slug: "kor-cekirdek", rarity: "rare",
    name: "Kor Çekirdek|Ember Core|Glutkern|Núcleo de brasa|Cœur de braise|Núcleo de brasa|Угольное ядро",
    desc: "Kor halkası titrer, küçük kıvılcımlar yukarı süzülür.|An ember ring flickers as small sparks float upward.|Ein Glutring flackert, kleine Funken steigen auf.|Un aro de brasa titila y suben pequeñas chispas.|Un anneau de braise vacille, de petites étincelles montent.|Um anel de brasa tremula e faíscas sobem.|Угольное кольцо мерцает, искры летят вверх.",
    ring: "linear-gradient(180deg, #ffd27a, #ff6a2b 50%, #a3220f)", glow: "#ff6a2b",
    b: { inset: -45, css: "box-shadow: 0 0 5px 1px rgba(255,106,43,0.75);", anim: "s2fx-flicker 1.6s linear infinite" },
    a: { inset: -80, bg: `${dotAt(38, 22, 1, "#ffd27a")}, ${dotAt(64, 12, 0.8, "#ffb35a")}`, anim: "s2pf-rise 1.8s ease-out infinite" },
  },
  {
    slug: "neon-tabela", rarity: "epic",
    name: "Neon Tabela|Neon Sign|Neonschild|Letrero de neón|Enseigne néon|Letreiro neon|Неоновая вывеска",
    desc: "Pembe ve camgöbeği neon halkalar arada bir titrer.|Pink and cyan neon rings flicker every now and then.|Pinke und cyane Neonringe flackern ab und zu.|Anillos de neón rosa y cian parpadean de vez en cuando.|Des anneaux néon rose et cyan vacillent par moments.|Anéis neon rosa e ciano piscam de vez em quando.|Розовые и голубые неоновые кольца иногда мерцают.",
    ring: "linear-gradient(#ff2e88, #ff2e88)", glow: "#ff2e88",
    a: { inset: -62, css: "box-shadow: 0 0 0 1.5px #2ef2ff, 0 0 6px rgba(46,242,255,0.9);", anim: "s2fx-flicker 3.2s linear infinite" },
  },
  {
    slug: "aurora-halkasi", rarity: "epic",
    name: "Aurora Halkası|Aurora Loop|Polarlichtschleife|Bucle de aurora|Boucle d'aurore|Laço de aurora|Петля сияния",
    desc: "Yeşil, turkuaz ve mor bir kutup ışığı halkada akar.|Green, teal and violet polar light flows round the ring.|Grünes, türkises und violettes Polarlicht fließt im Ring.|Luz polar verde, turquesa y violeta fluye por el aro.|Une lumière polaire verte, sarcelle et violette circule.|Luz polar verde, turquesa e violeta corre no anel.|Зелёный, бирюзовый и фиолетовый свет течёт по кольцу.",
    ring: "conic-gradient(#14a37f, #6effc7, #8f7bff, #14a37f)", glow: "#6effc7",
    b: { inset: -62, bg: "conic-gradient(from 0deg, #6effc7, #14a37f 25%, #8f7bff 50%, #e6fff5 62%, #6effc7)", mask: "radial-gradient(closest-side, transparent 68%, #000 76%, #000 92%, transparent 100%)", anim: spin(4) },
  },
  {
    slug: "kalp-ritmi", rarity: "rare",
    name: "Kalp Atışı|Heartbeat|Herzschlag|Latido|Battement|Batimento|Сердцебиение",
    desc: "Pembe halka çift vuruşla dışa doğru atar.|A pink ring beats outward in a double pulse.|Ein pinker Ring schlägt im Doppelpuls nach außen.|Un aro rosa late hacia fuera en doble pulso.|Un anneau rose bat vers l'extérieur en double pulsation.|Um anel rosa bate para fora em pulso duplo.|Розовое кольцо бьётся наружу двойным пульсом.",
    ring: "linear-gradient(160deg, #ffc2cf, #ff3d64)", glow: "#ff3d64",
    a: { inset: -45, css: "box-shadow: 0 0 0 1.5px rgba(255,77,115,0.95), 0 0 6px rgba(255,61,100,0.6);", anim: "s2pf-heart 1.4s ease-out infinite" },
  },
  {
    slug: "yildiz-isigi", rarity: "epic",
    name: "Yıldız Işığı|Starlight|Sternenlicht|Luz estelar|Lumière d'étoile|Luz estelar|Звёздный свет",
    desc: "Nokta, dört köşeli parlayan bir yıldıza dönüşür.|The dot becomes a bright four-pointed star.|Der Punkt wird zu einem hellen vierzackigen Stern.|El punto se vuelve una estrella brillante de cuatro puntas.|Le point devient une étoile vive à quatre branches.|O ponto vira uma estrela brilhante de quatro pontas.|Точка превращается в яркую четырёхлучевую звезду.",
    ring: "linear-gradient(160deg, #ffffff, #c6d4ff)", glow: "#e6ecff",
    a: { inset: -170, bg: "radial-gradient(ellipse 50% 6% at 50% 50%, #ffffff, transparent), radial-gradient(ellipse 6% 50% at 50% 50%, #ffffff, transparent), radial-gradient(circle at 50% 50%, rgba(198,212,255,0.55) 0 22%, transparent 34%)", mask: OUT, anim: "s2fx-twinkle 2.6s ease-in-out infinite, s2fx-spin 16s linear infinite" },
  },
  {
    slug: "elmas", rarity: "epic",
    name: "Elmas|Diamond|Diamant|Diamante|Diamant|Diamante|Бриллиант",
    desc: "Noktayı parlayan bir elmas çerçeve sarar.|A gleaming diamond frame wraps the dot.|Ein funkelnder Diamantrahmen umgibt den Punkt.|Un marco de diamante reluciente envuelve el punto.|Un cadre en diamant étincelant entoure le point.|Uma moldura de diamante brilhante envolve o ponto.|Сверкающая алмазная рамка обрамляет точку.",
    ring: "conic-gradient(#e8fbff, #6fe3ff 25%, #ffffff 50%, #6fe3ff 75%, #e8fbff)", glow: "#6fe3ff",
    b: { inset: -58, round: "2px", css: "transform: rotate(45deg); box-shadow: inset 0 0 0 1.4px #c9f6ff, 0 0 6px rgba(111,227,255,0.8);", anim: "s2fx-breathe 2.4s ease-in-out infinite" },
    a: { inset: -95, bg: "radial-gradient(ellipse 22% 3% at 82% 18%, #fff, transparent), radial-gradient(ellipse 3% 22% at 82% 18%, #fff, transparent)", anim: "s2fx-twinkle 1.9s ease-in-out infinite" },
  },
  {
    slug: "sonar", rarity: "rare",
    name: "Sonar|Sonar Sweep|Sonarschwenk|Barrido de sonar|Balayage sonar|Varredura de sonar|Сонар",
    desc: "Yeşil bir radar ışını noktanın çevresini tarar.|A green radar beam sweeps around the dot.|Ein grüner Radarstrahl schwenkt um den Punkt.|Un haz de radar verde barre alrededor del punto.|Un faisceau radar vert balaie autour du point.|Um feixe de radar verde varre em volta do ponto.|Зелёный луч радара обходит точку.",
    ring: "linear-gradient(160deg, #c8ffe0, #2fd17a)", glow: "#3cff8c",
    a: { inset: -110, bg: `conic-gradient(from 0deg, transparent 0 290deg, ${rgba("#3cff8c", 0.7)} 358deg, #eafff2 360deg)`, mask: OUT, anim: spin(2) },
  },
  {
    slug: "plazma-halkasi", rarity: "epic",
    name: "Plazma Halkası|Plasma Loop|Plasmaschleife|Bucle de plasma|Boucle de plasma|Laço de plasma|Плазменная петля",
    desc: "Magenta ve camgöbeği plazma noktanın çevresinde hızla döner.|Magenta and cyan plasma whirls fast around the dot.|Magenta- und Cyanplasma wirbelt schnell um den Punkt.|Plasma magenta y cian gira rápido alrededor del punto.|Un plasma magenta et cyan tourbillonne autour du point.|Plasma magenta e ciano gira rápido em volta do ponto.|Пурпурная и голубая плазма быстро вращается.",
    ring: "conic-gradient(#ff2fd6, #2fe1ff, #5b2cff, #ff2fd6)", glow: "#c83cff",
    b: { inset: -62, bg: "conic-gradient(from 0deg, #ff2fd6, transparent 30%, #2fe1ff 50%, transparent 80%, #ff2fd6)", mask: "radial-gradient(closest-side, transparent 68%, #000 76%, #000 92%, transparent 100%)", anim: spin(1.6) },
  },
  {
    slug: "tutulma", rarity: "legendary",
    name: "Tutulma|Eclipse|Finsternis|Eclipse|Éclipse|Eclipse|Затмение",
    desc: "Karanlık bir halkanın arkasından altın bir korona taşar.|A golden corona spills out from behind a dark ring.|Eine goldene Korona quillt hinter einem dunklen Ring hervor.|Una corona dorada asoma tras un aro oscuro.|Une couronne dorée déborde derrière un anneau sombre.|Uma coroa dourada surge atrás de um anel escuro.|Из-за тёмного кольца выбивается золотая корона.",
    ring: "conic-gradient(#1a1410, #3a2a18 50%, #1a1410)", glow: "#ffcf7a",
    b: { inset: -75, bg: `radial-gradient(closest-side, transparent 58%, ${rgba("#fff0c8", 0.95)} 64%, ${rgba("#ffa83c", 0.55)} 76%, transparent 100%)`, anim: "s2fx-breathe 3s ease-in-out infinite" },
    a: { inset: -75, bg: dotAt(26, 24, 1.3, "#ffffff", "#fff0c8"), anim: "s2fx-twinkle 3s ease-in-out infinite" },
  },
  {
    slug: "kuyruklu", rarity: "rare",
    name: "Kuyruklu Yıldız|Comet|Komet|Cometa|Comète|Cometa|Комета",
    desc: "Uzun kuyruklu bir kuyruklu yıldız noktanın çevresinde koşar.|A long-tailed comet races around the dot.|Ein Komet mit langem Schweif jagt um den Punkt.|Un cometa de cola larga corre alrededor del punto.|Une comète à longue queue file autour du point.|Um cometa de cauda longa corre em volta do ponto.|Комета с длинным хвостом мчится вокруг точки.",
    ring: "linear-gradient(160deg, #e6f9ff, #6fd6ff)", glow: "#6fd6ff",
    a: { inset: -100, bg: `${dotAt(50, 7, 1.6, "#ffffff", "#6fd6ff")}, conic-gradient(from -150deg, transparent 0deg, ${rgba("#6fd6ff", 0.1)} 40deg, ${rgba("#6fd6ff", 0.85)} 146deg, transparent 150deg)`, mask: OUT_BAND, anim: spin(1.8) },
  },
  {
    slug: "cicek", rarity: "rare",
    name: "Çiçek|Bloom|Blüte|Flor|Floraison|Flor|Цветок",
    desc: "Beş pembe yaprak noktanın çevresinde açar ve döner.|Five pink petals open and turn around the dot.|Fünf pinke Blätter öffnen sich und drehen sich um den Punkt.|Cinco pétalos rosa se abren y giran alrededor.|Cinq pétales roses s'ouvrent et tournent autour du point.|Cinco pétalas rosa abrem e giram em volta do ponto.|Пять розовых лепестков раскрываются вокруг точки.",
    ring: "linear-gradient(160deg, #ffe0ea, #ff6f9a)", glow: "#ff8fb0",
    b: { inset: -110, bg: [0, 72, 144, 216, 288].map((d) => { const r = (d * Math.PI) / 180; return `radial-gradient(circle at ${(50 + Math.sin(r) * 33).toFixed(1)}% ${(50 - Math.cos(r) * 33).toFixed(1)}%, #ffd6e2 0 1.6px, ${rgba("#ff8fb0", 0.7)} 2.2px, transparent 3.4px)`; }).join(", "), mask: OUT, anim: spin(10) },
  },
  {
    slug: "dalga", rarity: "common",
    name: "Dalga|Ripple|Welle|Onda|Onde|Onda|Рябь",
    desc: "İki turkuaz dalga noktadan sırayla yayılır.|Two teal ripples spread from the dot one after another.|Zwei türkise Wellen breiten sich nacheinander aus.|Dos ondas turquesa se expanden una tras otra.|Deux ondes sarcelle s'étendent l'une après l'autre.|Duas ondas turquesa se espalham uma após a outra.|Две бирюзовые волны расходятся по очереди.",
    ring: "linear-gradient(160deg, #b8fff2, #19b8a6)", glow: "#2ee6d6",
    b: { inset: -45, css: "box-shadow: 0 0 0 1.2px rgba(46,230,214,0.9);", anim: "s2pf-ping 2.4s cubic-bezier(.2,.7,.3,1) infinite" },
    a: { inset: -45, css: "box-shadow: 0 0 0 1.2px rgba(46,230,214,0.9);", anim: "s2pf-ping 2.4s cubic-bezier(.2,.7,.3,1) -1.2s infinite" },
  },
  {
    slug: "zumrut-goz", rarity: "epic",
    name: "Zümrüt Göz|Emerald Eye|Smaragdauge|Ojo esmeralda|Œil d'émeraude|Olho de esmeralda|Изумрудный глаз",
    desc: "Kesme zümrüt bir halka, üstünde dolaşan bir parıltı.|A cut emerald ring with a glint travelling over it.|Ein geschliffener Smaragdring mit wanderndem Glanz.|Un aro de esmeralda tallada con un destello que lo recorre.|Un anneau d'émeraude taillée parcouru d'un éclat.|Um anel de esmeralda lapidada com um brilho que passa.|Гранёное изумрудное кольцо с бегущим бликом.",
    ring: "conic-gradient(#0f5a34 0 45deg, #49d17d 45deg 90deg, #c8ffe0 90deg 110deg, #1f7a46 110deg 180deg, #49d17d 180deg 230deg, #0f5a34 230deg 290deg, #8af5b8 290deg 320deg, #0f5a34 320deg)", glow: "#49d17d",
    a: { inset: -45, bg: `conic-gradient(from 0deg, transparent 0 320deg, rgba(255,255,255,0.95) 352deg, transparent 360deg)`, mask: RING, anim: spin(3) },
  },
  {
    slug: "altin-halka", rarity: "common",
    name: "Altın Halka|Gold Ring|Goldring|Anillo de oro|Anneau d'or|Anel de ouro|Золотое кольцо",
    desc: "Cilalı altın bir halka ve üstünden geçen bir parıltı.|A polished gold ring with a passing glint.|Ein polierter Goldring mit vorbeiziehendem Glanz.|Un anillo de oro pulido con un destello que pasa.|Un anneau d'or poli et un reflet qui passe.|Um anel de ouro polido com um brilho que passa.|Полированное золотое кольцо и пробегающий блик.",
    ring: "conic-gradient(#8a6416, #fff1c2 20%, #b8892a 40%, #f7dc8b 60%, #8a6416 80%, #fff1c2)", glow: "#ffd26e",
    a: { inset: -45, bg: "conic-gradient(from 0deg, transparent 0 330deg, rgba(255,255,255,0.95) 354deg, transparent 360deg)", mask: RING, anim: "s2fx-spin 2.6s cubic-bezier(.7,0,.3,1) infinite" },
  },
  {
    slug: "mor-girdap", rarity: "epic",
    name: "Mor Girdap|Violet Vortex|Violetter Wirbel|Vórtice violeta|Vortex violet|Vórtice violeta|Фиолетовый вихрь",
    desc: "Mor bir girdap noktayı içine çeker gibi döner.|A violet vortex spins as if pulling the dot in.|Ein violetter Wirbel dreht sich, als zöge er den Punkt hinein.|Un vórtice violeta gira como si atrajera el punto.|Un vortex violet tourne comme s'il aspirait le point.|Um vórtice violeta gira como se puxasse o ponto.|Фиолетовый вихрь вращается, затягивая точку.",
    ring: "linear-gradient(160deg, #e6dcff, #7c4dff)", glow: "#a77bff",
    b: { inset: -95, bg: `repeating-conic-gradient(from 0deg, ${rgba("#c6a8ff", 0.95)} 0deg, ${rgba("#7c4dff", 0.2)} 40deg, transparent 60deg, transparent 90deg)`, mask: "radial-gradient(closest-side, transparent 56%, #000 64%, #000 78%, transparent 100%)", anim: "s2fx-spin 1.3s linear infinite reverse" },
  },
  {
    slug: "ates-bocegi", rarity: "rare",
    name: "Ateş Böceği|Firefly|Glühwürmchen|Luciérnaga|Luciole|Vaga-lume|Светлячок",
    desc: "Bir ateş böceği noktanın çevresinde dolaşıp yanıp söner.|A firefly wanders around the dot, blinking.|Ein Glühwürmchen kreist blinkend um den Punkt.|Una luciérnaga ronda el punto parpadeando.|Une luciole tourne autour du point en clignotant.|Um vaga-lume ronda o ponto piscando.|Светлячок кружит вокруг точки, мигая.",
    ring: "linear-gradient(160deg, #eaffb0, #6fbf2a)", glow: "#c8ff78",
    a: { inset: -140, bg: dotAt(50, 9, 2, "#f4ffd0", "#c8ff78"), anim: "s2fx-spin 7s linear infinite, s2fx-twinkle 1.3s ease-in-out infinite" },
  },
  {
    slug: "kristal-prizma", rarity: "legendary",
    name: "Kristal Prizma|Crystal Prism|Kristallprisma|Prisma de cristal|Prisme de cristal|Prisma de cristal|Хрустальная призма",
    desc: "Gökkuşağı halkası döner, prizma ışığı dışa saçılır.|A rainbow ring turns and scatters prism light.|Ein Regenbogenring dreht sich und streut Prismenlicht.|Un aro arcoíris gira y dispersa luz de prisma.|Un anneau arc-en-ciel tourne et diffuse la lumière.|Um anel arco-íris gira e espalha luz de prisma.|Радужное кольцо вращается и рассыпает свет.",
    ring: "conic-gradient(#ff3b6b, #ffb13b, #f6ff5a, #3bff9d, #3bc8ff, #8a5bff, #ff3b6b)", glow: "#b3a6ff",
    b: { inset: -62, bg: "conic-gradient(#ff3b6b, #ffb13b, #f6ff5a, #3bff9d, #3bc8ff, #8a5bff, #ff3b6b)", mask: "radial-gradient(closest-side, transparent 68%, #000 76%, #000 92%, transparent 100%)", anim: spin(3) },
    a: { inset: -110, bg: "radial-gradient(ellipse 16% 2.5% at 80% 20%, #fff, transparent), radial-gradient(ellipse 2.5% 16% at 80% 20%, #fff, transparent), radial-gradient(ellipse 12% 2% at 18% 76%, #e6f6ff, transparent), radial-gradient(ellipse 2% 12% at 18% 76%, #e6f6ff, transparent)", anim: "s2fx-twinkle 2.2s ease-in-out infinite" },
  },
  {
    slug: "simsek", rarity: "epic",
    name: "Şimşek|Spark Bolt|Funkenblitz|Rayo|Éclair|Raio|Разряд",
    desc: "Mavi beyaz elektrik kıvılcımları noktadan çakar.|Blue-white electric sparks crack out from the dot.|Blauweiße Funken zucken aus dem Punkt.|Chispas eléctricas blanco azuladas saltan del punto.|Des étincelles électriques bleu-blanc jaillissent du point.|Faíscas elétricas branco-azuladas saltam do ponto.|Бело-голубые искры разлетаются от точки.",
    ring: "linear-gradient(160deg, #f5f9ff, #7aa7ff)", glow: "#7aa7ff",
    b: { inset: -62, bg: "conic-gradient(from 30deg, transparent 0 40deg, rgba(190,215,255,0.9) 40deg 70deg, transparent 70deg 200deg, rgba(190,215,255,0.8) 200deg 226deg, transparent 226deg)", mask: "radial-gradient(closest-side, transparent 68%, #000 76%, #000 92%, transparent 100%)", anim: "s2fx-spin 1.1s steps(6) infinite" },
    a: { inset: -120, bg: "conic-gradient(from 0deg, transparent 0 20deg, #f5f9ff 20deg 23deg, transparent 23deg 130deg, #b8d0ff 130deg 133deg, transparent 133deg 250deg, #f5f9ff 250deg 252deg, transparent 252deg)", mask: "radial-gradient(closest-side, transparent 52%, #000 58%, #000 80%, transparent 100%)", anim: "s2fx-flash 2.2s linear infinite, s2fx-spin 6.6s steps(3) infinite" },
  },
  {
    slug: "magma", rarity: "epic",
    name: "Magma|Magma|Magma|Magma|Magma|Magma|Магма",
    desc: "Kara kaya halkada lav çatlakları parlar, sıcak dalga yayılır.|Lava cracks glow in a black rock ring as heat ripples out.|Lavarisse glühen im schwarzen Fels, Hitze wellt sich aus.|Grietas de lava brillan en roca negra y sale el calor.|Des fissures de lave luisent dans la roche, la chaleur rayonne.|Fendas de lava brilham na rocha negra e o calor se espalha.|Трещины лавы светятся в чёрном камне, расходится жар.",
    ring: "repeating-conic-gradient(#2a0a08 0 26deg, #ffb000 26deg 30deg, #ff3d00 30deg 36deg, #2a0a08 36deg 60deg)", glow: "#ff3d00",
    a: { inset: -45, css: "box-shadow: 0 0 0 1.5px rgba(255,61,0,0.85), 0 0 5px rgba(255,176,0,0.6);", anim: "s2pf-ping 2.6s ease-out infinite" },
  },
  {
    slug: "kar-tanesi", rarity: "common",
    name: "Kar Tanesi|Snowflake|Schneeflocke|Copo de nieve|Flocon|Floco de neve|Снежинка",
    desc: "Nokta, yavaşça dönen altı kollu bir kar tanesine dönüşür.|The dot becomes a slowly turning six-armed snowflake.|Der Punkt wird zu einer langsam drehenden Schneeflocke.|El punto se vuelve un copo de seis brazos que gira.|Le point devient un flocon à six branches qui tourne.|O ponto vira um floco de seis braços que gira.|Точка превращается в медленно вращающуюся снежинку.",
    ring: "linear-gradient(160deg, #ffffff, #bfe3ff)", glow: "#dcf0ff",
    b: { inset: -120, bg: `repeating-conic-gradient(from 0deg, ${rgba("#ffffff", 0.95)} 0 2.4deg, transparent 2.4deg 60deg), ${[0, 60, 120, 180, 240, 300].map((d) => { const r = (d * Math.PI) / 180; return `radial-gradient(circle at ${(50 + Math.sin(r) * 44).toFixed(1)}% ${(50 - Math.cos(r) * 44).toFixed(1)}%, #fff 0 1px, transparent 1.6px)`; }).join(", ")}`, mask: OUT, anim: spin(24) },
  },
  {
    slug: "mercan", rarity: "rare",
    name: "Mercan|Coral|Koralle|Coral|Corail|Coral|Коралл",
    desc: "Mercan halkasının çevresinde küçük polipler sırayla parlar.|Tiny polyps light up around a coral ring.|Kleine Polypen leuchten um einen Korallenring auf.|Pequeños pólipos brillan alrededor de un aro de coral.|De petits polypes s'allument autour d'un anneau de corail.|Pequenos pólipos brilham em volta de um anel de coral.|Крошечные полипы светятся вокруг кораллового кольца.",
    ring: "linear-gradient(160deg, #ffc2d1, #d6336c)", glow: "#ff8fab",
    b: { inset: -95, bg: [0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const r = (d * Math.PI) / 180; return `radial-gradient(circle at ${(50 + Math.sin(r) * 40).toFixed(1)}% ${(50 - Math.cos(r) * 40).toFixed(1)}%, #ffe3ec 0 0.9px, ${rgba("#ff8fab", 0.6)} 1.4px, transparent 2.2px)`; }).join(", "), anim: "s2fx-twinkle 2s ease-in-out infinite, s2fx-spin 20s linear infinite" },
  },
  {
    slug: "inci", rarity: "rare",
    name: "İnci|Pearl|Perle|Perla|Perle|Pérola|Жемчужина",
    desc: "Sedef tonlu bir halka ve yumuşak bir inci parıltısı.|A nacre-toned ring with a soft pearl shine.|Ein perlmuttfarbener Ring mit sanftem Perlglanz.|Un aro de nácar con un suave brillo de perla.|Un anneau nacré et un doux éclat de perle.|Um anel de nácar com um brilho suave de pérola.|Перламутровое кольцо с мягким жемчужным блеском.",
    ring: "conic-gradient(#f1e9e1, #ffd8e4, #cfe3ef, #e2d4f2, #f1e9e1)", glow: "#ffe6ee",
    a: { inset: -45, bg: "conic-gradient(from 0deg, transparent 0 300deg, rgba(255,255,255,0.9) 340deg, transparent 360deg)", mask: RING, anim: spin(4) },
  },
  {
    slug: "galaksi", rarity: "legendary",
    name: "Galaksi|Galaxy|Galaxie|Galaxia|Galaxie|Galáxia|Галактика",
    desc: "Mor galaksi kolları döner, iki yıldız ters yönde dolaşır.|Violet galaxy arms turn while two stars orbit the other way.|Violette Spiralarme drehen sich, zwei Sterne kreisen gegenläufig.|Brazos violetas giran y dos estrellas orbitan al revés.|Des bras violets tournent, deux étoiles orbitent en sens inverse.|Braços violetas giram e duas estrelas orbitam ao contrário.|Фиолетовые рукава вращаются, две звезды кружат навстречу.",
    ring: "linear-gradient(160deg, #e9e1ff, #6a4dff)", glow: "#9a7bff",
    b: { inset: -130, bg: `conic-gradient(from 0deg, ${rgba("#9a7bff", 0)} 0deg, ${rgba("#c6b7ff", 0.85)} 40deg, ${rgba("#9a7bff", 0)} 90deg, ${rgba("#9a7bff", 0)} 180deg, ${rgba("#c6b7ff", 0.85)} 220deg, ${rgba("#9a7bff", 0)} 270deg)`, mask: "radial-gradient(closest-side, transparent 50%, #000 56%, #000 66%, transparent 100%)", anim: spin(8) },
    a: { inset: -130, bg: `${dotAt(50, 10, 1.1, "#ffffff", "#c6b7ff")}, ${dotAt(50, 90, 0.9, "#ffe9a8", "#ffe9a8")}`, anim: "s2fx-spin 5s linear infinite reverse" },
  },
  {
    slug: "halkali-gezegen", rarity: "legendary",
    name: "Halkalı Gezegen|Ringed Planet|Ringplanet|Planeta anillado|Planète à anneaux|Planeta com anéis|Планета с кольцами",
    desc: "Eğik altın bir halka noktayı bir gezegen gibi sarar.|A tilted golden ring wraps the dot like a planet.|Ein schräger Goldring umgibt den Punkt wie einen Planeten.|Un anillo dorado inclinado envuelve el punto como un planeta.|Un anneau doré incliné entoure le point comme une planète.|Um anel dourado inclinado envolve o ponto como um planeta.|Наклонное золотое кольцо обвивает точку, как планету.",
    ring: "linear-gradient(160deg, #fff0c8, #d99a3a)", glow: "#ffd08a",
    b: { inset: -95, css: "transform: rotate(-24deg) scaleY(0.34); box-shadow: inset 0 0 0 1.6px rgba(255,224,160,0.95), 0 0 4px rgba(255,200,120,0.7);" },
    a: { inset: -150, bg: dotAt(50, 8, 1, "#ffffff", "#ffe0a0"), anim: spin(6) },
  },
  {
    slug: "kuzey-yildizi", rarity: "legendary",
    name: "Kuzey Yıldızı|North Star|Polarstern|Estrella polar|Étoile polaire|Estrela polar|Полярная звезда",
    desc: "Noktanın üstünde parlak bir kuzey yıldızı ışıldar.|A bright north star shines just above the dot.|Ein heller Polarstern leuchtet über dem Punkt.|Una estrella polar brillante luce sobre el punto.|Une étoile polaire brillante luit au-dessus du point.|Uma estrela polar brilhante reluz acima do ponto.|Над точкой сияет яркая Полярная звезда.",
    ring: "conic-gradient(#ffffff, #9fc0ff, #ffffff, #9fc0ff, #ffffff)", glow: "#cfe0ff",
    a: { inset: -160, bg: "radial-gradient(circle at 76% 22%, #fff 0 1.2px, transparent 2.2px), radial-gradient(ellipse 16% 2% at 76% 22%, #ffffff, transparent), radial-gradient(ellipse 2% 16% at 76% 22%, #ffffff, transparent), radial-gradient(ellipse 9% 1.5% at 76% 22%, rgba(159,192,255,0.9), transparent)", anim: "s2fx-twinkle 3.4s ease-in-out infinite" },
  },
];

module.exports = { FLARE };
