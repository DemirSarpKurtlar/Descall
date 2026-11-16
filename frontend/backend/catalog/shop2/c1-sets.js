"use strict";
// Market 2.0 C1: the frame, banner and badge pieces of the 16 shared set themes
// (lib/shop2/themes.js). Each piece uses its set palette [deep, mid, bright, light] and the
// set's mood, so the 8 pieces of a set (with C2/C3/C4) read as one outfit.
const L = require("./c1-lib");
const { f, rnd, lg, rg, lgU, rgU, blur, metalGrad, pol, arc, annulus, circ, band, around, at, cabDefs, gemDefs, sparkle, star5, poly, leaf, petal, blade, spin, pulse,
  ridge, hills, waveLine, stars, twinkles, pine, pineRow, skyline, cloud, cloudBand, scatter, frameDoc, bannerDoc, badgeDoc } = L;
const { N } = require("./c1-frames");
const { badge: badgeArt } = require("./c1-badges");

const SET_PIECES = [];
/** piece(setKey, category, rarity, price, name, desc, art) */
const piece = (set_key, category, rarity, price, name, desc, art) =>
  SET_PIECES.push({ set_key, category, slug: set_key, rarity, price, anim: category !== "profile_badge", name, desc, art, tags: [] });

const sky = (id, stops) => ({ d: lg(id, stops, 0, 0, 0, 1), b: `<rect width='600' height='200' fill='url(#${id})'/>` });
const glow = (id, color, a = 0.7) => rg(id, [[0, color, a], [1, color, 0]]);
/** Finite "breathing" opacity for set art. */
const breathe = (dur = 3, n = 3, lo = ".45") => pulse("opacity", `1;${lo};1`, dur, n);

// ================================================================ 1. Gece Limanı / Night Harbor
{
  const K = "gece-limani", P = ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"];
  piece(K, "avatar_frame", "legendary", 900,
    N("Fener Halkası", "Beacon Ring", "Leuchtfeuerring", "Anillo del faro", "Anneau du phare", "Anel do farol", "Кольцо маяка"),
    N("Tepesinde fener yanan gece mavisi halka; ışık huzmesi halkanın çevresini tarar, altta dalgalar.", "A night blue ring with a lighthouse on top whose beam sweeps around it, waves below.", "Ein nachtblauer Ring mit Leuchtturm, dessen Lichtkegel ihn umkreist, unten Wellen.", "Un aro azul noche con un faro arriba cuyo haz lo recorre, con olas abajo.", "Un anneau bleu nuit coiffé d'un phare dont le faisceau le balaie, des vagues en bas.", "Um aro azul-noite com um farol no topo cujo facho o percorre, com ondas embaixo.", "Ночное синее кольцо с маяком наверху, луч обходит его по кругу, внизу волны."),
    () => {
      const defs = metalGrad("m", ["#e8f6ff", "#5a8ac8", "#1e4b8f", "#0b1b3a", "#050c1e"]) + lgU("bm", [[0, "#e8f6ff", 0.75], [1, "#35d0e0", 0]], 100, 10, 100, 80) + rg("lp", [[0, "#ffffff"], [0.4, "#bff6ff", 0.9], [1, "#35d0e0", 0]]);
      const beam = `<g><path d='M100 8L60 -10L140 -10Z' fill='url(#bm)' opacity='.0'/><path d='${arc(92, -16, 16)}' fill='none' stroke='#bff6ff' stroke-width='8' stroke-opacity='.35' stroke-linecap='round'/>${spin(6, 3)}</g>`;
      let waves = "";
      for (let i = 0; i < 3; i++) { let d = ""; for (let a = 120; a <= 240; a += 4) { const [x, y] = pol(88 + i * 3.6 + 1.4 * Math.sin((a + i * 20) / 6), a); d += (a === 120 ? "M" : "L") + `${x} ${y}`; } waves += `<path d='${d}' fill='none' stroke='${["#35d0e0", "#1e4b8f", "#e8f6ff"][i]}' stroke-width='${[2.2, 1.8, 1][i]}' stroke-opacity='${[0.9, 0.9, 0.5][i]}'/>`; }
      const tower = `<path d='M95 26L96.5 8H103.5L105 26Z' fill='#0b1b3a' stroke='#35d0e0' stroke-width='.8'/><path d='M96 14H104M95.6 20H104.4' stroke='#e8f6ff' stroke-width='1.6'/><rect x='95.6' y='3.2' width='8.8' height='5' rx='1' fill='#0b1b3a' stroke='#35d0e0' stroke-width='.8'/><path d='M95 3.2L100 -1L105 3.2Z' fill='#1e4b8f'/><circle cx='100' cy='5.6' r='6' fill='url(#lp)'>${breathe(2, 3, ".6")}</circle><circle cx='100' cy='5.6' r='1.8' fill='#fff'/>`;
      return frameDoc(defs, beam + band(81, 8.5, "url(#m)", { lip: "#bff6ff" }) + circ(81, "#35d0e0", 1, " stroke-dasharray='1 5' stroke-opacity='.8'") + circ(87.5, "#35d0e0", 0.8, " stroke-opacity='.5'") + waves + tower +
        [[40, 60], [160, 40], [176, 120]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1' fill='#e8f6ff'/>`).join(""));
    });
  piece(K, "banner", "legendary", 720,
    N("Sisli Rıhtım", "Misty Pier", "Nebliger Pier", "Muelle brumoso", "Jetée brumeuse", "Cais enevoado", "Туманный причал"),
    N("Sisli bir gece limanı: sağ kayalıkta dönen fener ışığı, ay ve sakin dalgalar.", "A misty night harbour: a turning lighthouse beam on the right cliff, the moon and calm waves.", "Ein nebliger Nachthafen: ein kreisendes Leuchtfeuer auf der rechten Klippe, Mond und ruhige Wellen.", "Un puerto nocturno brumoso: el haz de un faro girando en el acantilado, la luna y olas tranquilas.", "Un port de nuit brumeux : le faisceau tournant d'un phare sur la falaise, la lune et des vagues calmes.", "Um porto noturno enevoado: o facho de um farol girando no penhasco, a lua e ondas calmas.", "Туманная ночная гавань: вращающийся луч маяка на скале справа, луна и спокойные волны."),
    () => {
      const s = sky("s", [[0, "#050d1e"], [0.65, "#103458"], [1, "#1e4b8f"]]);
      const lx = 500, ly = 70;
      const beam = `<g><path d='M${lx} ${ly}L${lx - 360} ${ly - 60}L${lx - 360} ${ly + 30}Z' fill='url(#bm)'/><animateTransform attributeName='transform' type='rotate' values='-6 ${lx} ${ly};8 ${lx} ${ly};-6 ${lx} ${ly}' dur='7s' repeatCount='3'/></g>`;
      const house = `<path d='M480 150L560 150L600 130V200H460Z' fill='#06101e'/><path d='M${lx - 9} 140L${lx - 6} ${ly + 8}H${lx + 6}L${lx + 9} 140Z' fill='#0b1b3a' stroke='#35d0e0' stroke-opacity='.6'/><path d='M${lx - 7} 92H${lx + 7}M${lx - 8} 116H${lx + 8}' stroke='#e8f6ff' stroke-width='5' stroke-opacity='.85'/><rect x='${lx - 8}' y='${ly - 4}' width='16' height='12' rx='2' fill='#0b1b3a' stroke='#35d0e0'/><path d='M${lx - 9} ${ly - 4}L${lx} ${ly - 14}L${lx + 9} ${ly - 4}Z' fill='#1e4b8f'/><circle cx='${lx}' cy='${ly + 2}' r='18' fill='url(#lp)'/><circle cx='${lx}' cy='${ly + 2}' r='4' fill='#fff'/>`;
      const pier = `<path d='M180 148H360' stroke='#0a1628' stroke-width='5'/>` + [190, 230, 270, 310, 350].map((x) => `<path d='M${x} 146V176' stroke='#0a1628' stroke-width='4'/>`).join("") + `<circle cx='350' cy='138' r='3' fill='#ffd27a'/><circle cx='350' cy='138' r='14' fill='url(#lm)'/><path d='M350 141V148' stroke='#0a1628' stroke-width='2'/>`;
      const sea = `<rect y='150' width='600' height='50' fill='url(#sea)'/>` + [156, 166, 178, 190].map((y, i) => `<path d='${waveLine(y, 2 + i * 0.6, 50 + i * 14, i)}' fill='none' stroke='#35d0e0' stroke-opacity='${f(0.5 - i * 0.08)}' stroke-width='1.3'/>`).join("");
      const fog = `<g opacity='.55'><rect y='120' width='600' height='40' fill='url(#fog)'/><animateTransform attributeName='transform' type='translate' values='0 0;-20 0;0 0' dur='9s' repeatCount='2'/></g>`;
      const body = s.b + stars(7, 60, [0, 0, 600, 100], ["#e6f7ff"], 1) + `<circle cx='300' cy='44' r='50' fill='url(#mg)'/><circle cx='300' cy='44' r='14' fill='#e8f6ff'/><circle cx='305' cy='40' r='12' fill='#0c2442' opacity='.35'/>` + beam + `<path d='${ridge(5, 140, 12, 0.5, 160)}' fill='#0a1a30'/>` + pier + house + sea + `<rect x='${lx - 6}' y='152' width='12' height='46' fill='url(#rf)'/>` + fog;
      return bannerDoc(s.d + lg("bm", [[0, "#e8f6ff", 0], [1, "#e8f6ff", 0.32]], 0, 0, 1, 0) + glow("lp", "#bff6ff", 0.9) + glow("lm", "#ffd27a", 0.5) + glow("mg", "#bff4ff", 0.45) + lg("sea", ["#0b2a48", "#050d1e"]) + lg("fog", [[0, "#cfe8ff", 0], [0.5, "#cfe8ff", 0.35], [1, "#cfe8ff", 0]]) + lg("rf", [[0, "#bff6ff", 0.6], [1, "#bff6ff", 0]]), body, 0.4);
    });
  piece(K, "profile_badge", "rare", 260,
    N("Pusula", "Compass", "Kompass", "Brújula", "Boussole", "Bússola", "Компас"),
    N("Gece mavisi yuvarlakta camgöbeği bir pusula iğnesi.", "A cyan compass needle on a night blue disc.", "Eine cyanfarbene Kompassnadel auf nachtblauer Scheibe.", "Una aguja de brújula cian sobre un disco azul noche.", "Une aiguille de boussole cyan sur un disque bleu nuit.", "Uma agulha de bússola ciano em um disco azul-noite.", "Голубая стрелка компаса на ночном синем круге."),
    () => badgeArt("circle", ["#5a8ac8", "#1e4b8f", "#0b1b3a"], null, "#fff", { ring: "#35d0e0", glyphSvg: `<path d='M12 4L14.2 12H9.8Z' fill='#e8f6ff'/><path d='M12 20L9.8 12H14.2Z' fill='#35d0e0'/><path d='M4.6 12L12 10.4V13.6Z' fill='#7fb2ff' opacity='.8'/><path d='M19.4 12L12 13.6V10.4Z' fill='#7fb2ff' opacity='.8'/><circle cx='12' cy='12' r='1.6' fill='#0b1b3a' stroke='#e8f6ff' stroke-width='.8'/>` }));
}

// ================================================================ 2. Bakır Kervan / Copper Caravan
{
  const K = "bakir-kervan";
  piece(K, "avatar_frame", "legendary", 880,
    N("Güneş Kadranı", "Sun Dial", "Sonnenuhr", "Reloj de sol", "Cadran solaire", "Relógio de sol", "Солнечные часы"),
    N("Bakır bir güneş kadranı, ışınları yavaşça döner; sağ altta yanan bir kervan feneri.", "A copper sundial whose rays slowly turn, with a lit caravan lantern at the lower right.", "Eine kupferne Sonnenuhr mit langsam kreisenden Strahlen und einer brennenden Karawanenlaterne.", "Un reloj de sol de cobre cuyos rayos giran despacio, con un farol de caravana encendido.", "Un cadran solaire de cuivre aux rayons qui tournent, avec une lanterne de caravane allumée.", "Um relógio de sol de cobre com raios girando devagar e uma lanterna de caravana acesa.", "Медные солнечные часы с медленно вращающимися лучами и горящим фонарём каравана."),
    () => {
      const defs = metalGrad("m", "copper") + lgU("ry", ["#ffe2b0", "#f0a443", "#b5622b"], 100, 0, 100, 30) + rg("ln", ["#fff3c0", "#f0a443", "#b5622b"], 0.5, 0.45, 0.6) + glow("lg", "#f0a443", 0.6) +
        `<path id='r1' d='M100 1.5L103.4 14H96.6Z' fill='url(#ry)'/><path id='r2' d='M100 7L101.8 15H98.2Z' fill='#ffe2b0'/>`;
      let rays = "";
      for (let i = 0; i < 12; i++) rays += `<use href='#r1' transform='rotate(${i * 30} 100 100)'/><use href='#r2' transform='rotate(${i * 30 + 15} 100 100)'/>`;
      const [lx, ly] = pol(90, 138);
      const lantern = `<g transform='translate(${lx} ${ly})'><circle r='14' fill='url(#lg)'>${breathe(1.8, 3, ".5")}</circle><path d='M0 -14V-8' stroke='#2a140a' stroke-width='1'/><path d='M-4 -8H4L5.5 -5H-5.5Z' fill='#b5622b' stroke='#2a140a' stroke-width='.6'/><path d='M-5 -5H5L4 6H-4Z' fill='url(#ln)' stroke='#2a140a' stroke-width='.7'/><path d='M-2 -5V6M2 -5V6' stroke='#7a3010' stroke-width='.6'/><path d='M-4.5 6H4.5L3 9H-3Z' fill='#b5622b' stroke='#2a140a' stroke-width='.6'/></g>`;
      return frameDoc(defs, `<g>${rays}${spin(40, 1)}</g>` + band(81, 9, "url(#m)", { lip: "#ffe2b0" }) + circ(77.6, "#2a140a", 0.8, " stroke-opacity='.6'") + (() => { let t = ""; for (let i = 0; i < 24; i++) { const [x1, y1] = pol(78.5, i * 15), [x2, y2] = pol(i % 2 ? 80.5 : 83.5, i * 15); t += `M${x1} ${y1}L${x2} ${y2}`; } return `<path d='${t}' stroke='#2a140a' stroke-width='1' stroke-opacity='.7'/>`; })() + lantern);
    });
  piece(K, "banner", "epic", 680,
    N("Kum Tepeleri", "Dune Road", "Dünenweg", "Camino de dunas", "Route des dunes", "Estrada das dunas", "Дорога дюн"),
    N("Gün batımında kum tepesinin sırtında ilerleyen fenerli bir kervan.", "A lantern-lit caravan crossing a dune ridge at sunset.", "Eine Karawane mit Laternen zieht bei Sonnenuntergang über einen Dünenkamm.", "Una caravana con faroles cruza la cresta de una duna al atardecer.", "Une caravane éclairée de lanternes traverse une crête de dune au couchant.", "Uma caravana com lanternas cruza a crista de uma duna ao pôr do sol.", "Караван с фонарями идёт по гребню дюны на закате."),
    () => {
      const s = sky("s", [[0, "#1e0a05"], [0.45, "#7a2410"], [0.8, "#e2721c"], [1, "#ffc06a"]]);
      const camel = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M-14 0C-14 -6 -10 -10 -6 -10C-4 -16 2 -16 4 -10C6 -12 8 -12 9 -10L12 -18L16 -18L15 -14L12 -8C12 -4 10 0 10 0Z' fill='#2a1206'/><path d='M-12 0V9M-8 0V9M6 0V9M9 0V9' stroke='#2a1206' stroke-width='1.8'/><path d='M-2 -12L-2 -20' stroke='#2a1206' stroke-width='1'/><circle cx='-2' cy='-21' r='2' fill='#ffcf7a'/><circle cx='-2' cy='-21' r='6' fill='url(#lg)'>${breathe(1.6, 3, ".4")}</circle></g>`;
      const body = s.b + `<circle cx='470' cy='120' r='100' fill='url(#g)'/><circle cx='470' cy='120' r='30' fill='#ffe2a0'/>` + `<g stroke='#ffcf7a' stroke-opacity='.3'>${[0, 1, 2, 3].map((i) => `<path d='M${300 + i * 20} ${40 + i * 8}h${80 - i * 10}'/>`).join("")}</g>` +
        `<path d='M0 120C100 110 200 96 300 104S480 92 600 100V200H0Z' fill='#a8461a'/>` + `<path d='M150 130C240 116 330 108 420 118S540 112 600 116V200H150Z' fill='#7a2e12'/>` + `<path d='M150 130C240 116 330 108 420 118S540 112 600 116' fill='none' stroke='#f0a443' stroke-width='1.6' stroke-opacity='.8'/>` +
        camel(300, 108, 1) + camel(340, 106, 0.95) + camel(380, 108, 1.05) + camel(420, 112, 0.9) + `<path d='M0 160C120 146 260 152 380 166S540 156 600 160V200H0Z' fill='#3a1407'/>` + scatter(4, 20, (r) => `<circle cx='${f(r() * 600)}' cy='${f(130 + r() * 60)}' r='${f(0.6 + r())}' fill='#ffe2b0' opacity='${f(0.2 + r() * 0.4)}'/>`);
      return bannerDoc(s.d + glow("g", "#ffd98a", 0.7) + glow("lg", "#ffcf7a", 0.7), body, 0.35);
    });
  piece(K, "profile_badge", "rare", 240,
    N("Kervan Feneri", "Caravan Lantern", "Karawanenlaterne", "Farol de caravana", "Lanterne de caravane", "Lanterna de caravana", "Фонарь каравана"),
    N("Bakır sekizgende yanan küçük bir fener.", "A small lit lantern on a copper octagon.", "Eine kleine brennende Laterne auf kupfernem Achteck.", "Un pequeño farol encendido sobre un octógono de cobre.", "Une petite lanterne allumée sur un octogone de cuivre.", "Uma pequena lanterna acesa em um octógono de cobre.", "Маленький горящий фонарь на медном восьмиугольнике."),
    () => badgeArt("octagon", ["#ffe2b0", "#b5622b", "#2a140a"], null, "#fff", { ring: "#f0a443", glyphSvg: `<path d='M12 3.6V6' stroke='#ffe2b0' stroke-width='1.4'/><path d='M9 6.4H15L16 8.4H8Z' fill='#ffe2b0'/><path d='M8.4 8.4H15.6L14.8 16.6H9.2Z' fill='#ffcf6a' stroke='#2a140a' stroke-width='.8'/><path d='M12 9.6C13.4 11.4 13.4 13.6 12 15.2C10.6 13.6 10.6 11.4 12 9.6Z' fill='#fff6d8'/><path d='M8.6 16.6H15.4L14.4 19H9.6Z' fill='#ffe2b0'/>` }));
}

// ================================================================ 3. Orkide Sisi / Orchid Mist
{
  const K = "orkide-sisi";
  const orchid = (s, id = "op") => `<g transform='scale(${s})'>${[0, 72, 144, 216, 288].map((a) => `<ellipse cy='-7' rx='4.4' ry='7.4' transform='rotate(${a})' fill='url(#${id})' stroke='#5a1a8a' stroke-width='.5'/>`).join("")}<path d='M-3 1C-3 5 3 5 3 1C2 3 -2 3 -3 1Z' fill='#ff6fb5'/><circle r='2' fill='#c8ff6a'/></g>`;
  piece(K, "avatar_frame", "legendary", 960,
    N("Taç Yaprak", "Petal Crown", "Blütenkrone", "Corona de pétalos", "Couronne de pétales", "Coroa de pétalas", "Корона лепестков"),
    N("Mor halkada kendi ışığıyla parlayan orkideler ve nefes alan limon yeşili polen.", "Self-lit orchids on a violet ring, with lime pollen that breathes light.", "Selbstleuchtende Orchideen auf violettem Ring, dazu atmender limettengrüner Pollen.", "Orquídeas luminosas en un aro violeta con polen lima que respira luz.", "Des orchidées lumineuses sur un anneau violet, un pollen citron vert qui respire.", "Orquídeas luminosas em um aro violeta, com pólen verde-limão que respira luz.", "Светящиеся орхидеи на фиолетовом кольце и дышащая светом лаймовая пыльца."),
    () => {
      const defs = lgU("m", ["#ffc2ef", "#ff6fb5", "#8b3fd1", "#ff6fb5", "#4a1470"], 0, 0, 200, 200) + lg("op", ["#ffe0f6", "#ff8ad0", "#8b3fd1"], 0, 0, 0, 1) + glow("pg", "#c8ff6a", 0.75) + blur("b", 2);
      const fl = [[318, 1.25], [345, 0.85], [130, 1.05], [152, 0.7], [220, 0.8]].map(([a, s]) => at(87, a, orchid(s), 1, true)).join("");
      const leaves = [[300, -50], [110, 40], [238, 20]].map(([a, r]) => at(86, a, `<path d='${leaf(16, 4.2)}' transform='rotate(${r})' fill='#4caa3a' stroke='#1e5a14' stroke-width='.6'/>`)).join("");
      const pol_ = scatter(9, 10, (r) => { const [x, y] = pol(84 + r() * 13, r() * 360); return `<circle cx='${x}' cy='${y}' r='${f(3 + r() * 2)}' fill='url(#pg)'>${pulse("opacity", "1;.2;1", f(1.6 + r() * 1.6), 3, f(r() * 2))}</circle><circle cx='${x}' cy='${y}' r='.9' fill='#efffc8'/>`; });
      return frameDoc(defs, `<g filter='url(#b)' opacity='.6'>${circ(81, "#ff6fb5", 6)}</g>` + band(81, 7, "url(#m)", { lip: "#ffd6f2" }) + leaves + fl + pol_);
    });
  piece(K, "banner", "legendary", 760,
    N("Sera Camı", "Glasshouse", "Glashaus", "Invernadero", "Serre de verre", "Estufa de vidro", "Оранжерея"),
    N("Gece serasında buğulu camların ardında parlayan orkideler ve süzülen sporlar.", "Orchids glowing behind misted greenhouse panes at night, with drifting spores.", "Orchideen, die nachts hinter beschlagenen Glasscheiben leuchten, dazu schwebende Sporen.", "Orquídeas que brillan tras los cristales empañados de un invernadero de noche.", "Des orchidées qui luisent derrière les vitres embuées d'une serre, la nuit.", "Orquídeas brilhando atrás dos vidros embaçados de uma estufa à noite.", "Орхидеи светятся ночью за запотевшим стеклом оранжереи, плывут споры."),
    () => {
      const s = sky("s", [[0, "#14061f"], [0.6, "#3b0f52"], [1, "#5e1a6e"]]);
      const panes = `<path d='M0 60H600M0 130H600${[60, 160, 260, 360, 460, 560].map((x) => `M${x} 0V200`).join("")}' stroke='#e6c8ff' stroke-opacity='.12' stroke-width='3'/>` + `<path d='M300 0L600 0L600 60Z' fill='#fff' opacity='.03'/>`;
      const stems = `<path d='M380 200C390 160 420 130 450 110M480 200C470 160 500 120 530 90M330 200C340 170 360 150 380 140' stroke='#5aa83a' stroke-width='3' fill='none'/>`;
      const flowers = [[450, 106, 2.4], [530, 86, 2], [380, 136, 1.6], [560, 140, 1.4], [420, 70, 1.3]].map(([x, y, s]) => `<circle cx='${x}' cy='${y}' r='${f(s * 14)}' fill='url(#fg)'/><g transform='translate(${x} ${y})'>${orchid(s)}</g>`).join("");
      const spores = scatter(8, 18, (r) => { const x = 220 + r() * 380, y = r() * 200; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(1 + r() * 1.6)}' fill='#c8ff6a'><animate attributeName='cy' values='${f(y)};${f(y - 24)};${f(y)}' dur='${f(5 + r() * 3)}s' repeatCount='3'/>${pulse("opacity", "1;.3;1", f(2 + r() * 2), 3)}</circle>`; });
      const body = s.b + `<ellipse cx='470' cy='100' rx='160' ry='80' fill='#c04bf2' opacity='.28' filter='url(#b)'/>` + panes + stems + flowers + spores + `<rect width='600' height='200' fill='url(#mist)'/>`;
      return bannerDoc(s.d + lg("op", ["#ffe0f6", "#ff8ad0", "#8b3fd1"], 0, 0, 0, 1) + glow("fg", "#ff6fb5", 0.45) + blur("b", 14) + lg("mist", [[0, "#ffd6f2", 0], [0.7, "#ffd6f2", 0.06], [1, "#ffd6f2", 0.14]]), body, 0.4);
    });
  piece(K, "profile_badge", "epic", 300,
    N("Tomurcuk", "Bud", "Knospe", "Capullo", "Bouton", "Botão", "Бутон"),
    N("Mor damlada açan parlak bir orkide.", "A glowing orchid blooming on a violet drop.", "Eine leuchtende Orchidee auf violettem Tropfen.", "Una orquídea luminosa que florece sobre una gota violeta.", "Une orchidée lumineuse qui éclot sur une goutte violette.", "Uma orquídea luminosa florescendo em uma gota violeta.", "Светящаяся орхидея распускается на фиолетовой капле."),
    () => badgeArt("drop", ["#ffc2ef", "#8b3fd1", "#1d0f2e"], null, "#fff", { ring: "#c8ff6a", glyphSvg: `<g transform='translate(12 14.2)'>${[0, 72, 144, 216, 288].map((a) => `<ellipse cy='-3.4' rx='2.2' ry='3.6' transform='rotate(${a})' fill='#ff8ad0' stroke='#4a1470' stroke-width='.6'/>`).join("")}<circle r='1.5' fill='#c8ff6a'/></g>` }));
}

// ================================================================ 4. Kor Bahçesi / Ember Garden
{
  const K = "kor-bahcesi";
  const flameP = (L2, W) => `M0 0C${W} ${f(-L2 * 0.3)} ${f(W * 0.5)} ${f(-L2 * 0.7)} 0 ${-L2}C${f(-W * 0.2)} ${f(-L2 * 0.75)} ${f(-W * 1.1)} ${f(-L2 * 0.35)} 0 0Z`;
  piece(K, "avatar_frame", "legendary", 920,
    N("Ateş Yaprakları", "Fire Petals", "Feuerblüten", "Pétalos de fuego", "Pétales de feu", "Pétalas de fogo", "Огненные лепестки"),
    N("Kor kırmızısı halkadan yükselen alevden taç yapraklar ve uçuşan kıvılcımlar.", "Petals of flame rising from an ember red ring, with sparks flying up.", "Flammenblätter, die aus einem glutroten Ring steigen, dazu fliegende Funken.", "Pétalos de llama que surgen de un aro rojo brasa, con chispas al vuelo.", "Des pétales de flamme jaillissant d'un anneau rouge braise, avec des étincelles.", "Pétalas de chama saindo de um aro vermelho-brasa, com faíscas voando.", "Лепестки пламени поднимаются из кольца цвета углей, летят искры."),
    () => {
      const defs = metalGrad("m", ["#ffd27a", "#ff6a2b", "#a3220f", "#4a0a04", "#1a0705"]) + lg("fp", ["#ffd27a", "#ff6a2b", "#a3220f"], 0, 1, 0, 0) + blur("b", 1.8) + `<path id='p' d='${flameP(15, 5.6)}' fill='url(#fp)' transform='translate(100 19)'/>`;
      let petals = "";
      for (let i = 0; i < 20; i++) petals += `<use href='#p' transform='rotate(${i * 18} 100 100) scale(1 ${i % 2 ? 0.75 : 1})' transform-origin='100 100'/>`;
      const sparks = scatter(6, 12, (r) => { const [x, y] = pol(90 + r() * 8, r() * 360); return `<circle cx='${x}' cy='${y}' r='${f(0.8 + r())}' fill='#ffd27a'>${pulse("opacity", "0;1;0", f(1.2 + r()), 3, f(r() * 1.5))}</circle>`; });
      return frameDoc(defs, `<g filter='url(#b)' opacity='.8'>${around("p", 20, 9)}</g><g>${around("p", 20, 0)}<animateTransform attributeName='transform' type='rotate' values='0 100 100;4 100 100;0 100 100' dur='2.6s' repeatCount='3'/></g>` + band(81, 8, "url(#m)", { lip: "#ffd27a" }) + circ(81, "#ffd27a", 1, " stroke-dasharray='3 7' stroke-opacity='.8'") + sparks);
    });
  piece(K, "banner", "epic", 700,
    N("Kor Bahçesi", "Ember Bed", "Glutbeet", "Lecho de brasas", "Parterre de braises", "Canteiro de brasas", "Клумба углей"),
    N("Karanlık bir bahçede yaprakları alevden çiçekler ve yükselen közler.", "Flowers with petals of flame in a dark garden, embers rising.", "Blumen mit Blütenblättern aus Flammen in einem dunklen Garten, Glut steigt auf.", "Flores con pétalos de llama en un jardín oscuro y brasas que suben.", "Des fleurs aux pétales de flamme dans un jardin sombre, des braises qui montent.", "Flores com pétalas de chama em um jardim escuro, brasas subindo.", "Цветы с лепестками из пламени в тёмном саду, поднимаются угли."),
    () => {
      const s = sky("s", [[0, "#0a0302"], [0.7, "#2a0905"], [1, "#5a1206"]]);
      const fflower = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><circle r='22' fill='url(#fg)'/>${[0, 60, 120, 180, 240, 300].map((a) => `<path d='${flameP(16, 6)}' transform='rotate(${a})' fill='url(#fp)'/>`).join("")}<circle r='4' fill='#ffd27a'/></g>`;
      const stems = [[380, 90], [460, 70], [530, 104], [320, 120], [580, 60]].map(([x, y]) => `<path d='M${x} 200Q${x - 10} ${f((y + 200) / 2)} ${x} ${y}' stroke='#3a0c06' stroke-width='3' fill='none'/>`).join("");
      const embers = scatter(4, 22, (r) => { const x = 240 + r() * 360, y = 120 + r() * 80; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(1 + r() * 1.2)}' fill='#ffb000'><animate attributeName='cy' values='${f(y)};${f(y - 70)}' dur='${f(2.4 + r() * 2)}s' repeatCount='3'/><animate attributeName='opacity' values='1;0' dur='${f(2.4 + r() * 2)}s' repeatCount='3'/></circle>`; });
      const body = s.b + `<rect y='150' width='600' height='50' fill='url(#gl)'/>` + stems + fflower(380, 90, 1.5) + fflower(460, 70, 1.9) + fflower(530, 104, 1.3) + fflower(320, 120, 1) + fflower(580, 60, 1.1) + `<path d='${hills(186, [[6, 200, 1], [3, 60, 2]])}' fill='#1a0705'/>` + embers;
      return bannerDoc(s.d + lg("fp", ["#ffd27a", "#ff6a2b", "#a3220f"], 0, 1, 0, 0) + glow("fg", "#ff6a2b", 0.45) + lg("gl", [[0, "#ff6a2b", 0], [1, "#ff6a2b", 0.25]]), body, 0.4);
    });
  piece(K, "profile_badge", "rare", 280,
    N("Alev Gülü", "Flame Rose", "Flammenrose", "Rosa de llama", "Rose de flamme", "Rosa de chama", "Огненная роза"),
    N("Kor kırmızısı armada alevden bir gül.", "A rose of flame on an ember red crest.", "Eine Rose aus Flammen auf glutrotem Wappen.", "Una rosa de llama sobre un blasón rojo brasa.", "Une rose de flamme sur un blason rouge braise.", "Uma rosa de chama em um brasão vermelho-brasa.", "Роза из пламени на гербе цвета углей."),
    () => badgeArt("crest", ["#ffd27a", "#a3220f", "#1a0705"], "flame", "#ffd27a", { ring: "#ff6a2b" }));
}
// ================================================================ 5. Buzul Sessizliği / Glacier Hush
{
  const K = "buzul-sessizligi";
  piece(K, "avatar_frame", "legendary", 900,
    N("Buz Kesiti", "Ice Facet", "Eisfacette", "Faceta de hielo", "Facette de glace", "Faceta de gelo", "Ледяная грань"),
    N("Yontulmuş buz yüzeyli halka, tepede kristal sivri uçlar ve kar ışıltısı.", "A ring of cut ice facets with crystal spires on top and a glint of snow light.", "Ein Ring aus geschliffenen Eisfacetten mit Kristallspitzen oben und Schneeglanz.", "Un aro de facetas de hielo con agujas de cristal arriba y destellos de nieve.", "Un anneau de facettes de glace, des pointes de cristal au sommet et des éclats de neige.", "Um aro de facetas de gelo com pontas de cristal no topo e brilho de neve.", "Кольцо из гранёного льда, хрустальные шпили сверху и снежные блики."),
    () => {
      const defs = lg("ic", ["#ffffff", "#a6e7ff", "#3a8fb7"], 0, 0, 1, 1) + lg("ic2", ["#e8faff", "#6ac0e8", "#1a5a7a"], 1, 0, 0, 1);
      let fac = "";
      const n = 18;
      for (let i = 0; i < n; i++) { const a0 = (360 / n) * i, a1 = a0 + 360 / n, am = a0 + 180 / n; const p = (r, a) => pol(r, a).join(" "); fac += `<path d='M${p(75.5, a0)}L${p(87, am)}L${p(75.5, a1)}Z' fill='url(#ic)'/><path d='M${p(87, am)}L${p(75.5, a1)}L${p(87, a1 + 180 / n)}Z' fill='url(#ic2)'/>`; }
      const spire = (a, h, w) => at(84, a, `<path d='M${-w} 2L0 ${-h}L${w} 2Z' fill='url(#ic)' stroke='#1a5a7a' stroke-width='.6'/><path d='M0 ${-h}L${w} 2H0Z' fill='#071a24' opacity='.18'/>`);
      const glint = [[60, 30], [150, 48], [100, 8]].map(([x, y], i) => `<path d='${sparkle(5)}' transform='translate(${x} ${y})' fill='#fff' opacity='.3'>${pulse("opacity", ".3;1;.3", 2, 3, i * 0.6)}</path>`).join("");
      return frameDoc(defs, spire(-24, 14, 3.4) + spire(-11, 19, 4) + spire(0, 25, 4.8) + spire(11, 19, 4) + spire(24, 14, 3.4) + spire(170, 10, 3) + spire(190, 10, 3) + fac + `<path d='${annulus(75.5, 87)}' fill='none' stroke='#fff' stroke-width='.8' stroke-opacity='.8'/>` + glint);
    });
  piece(K, "banner", "epic", 700,
    N("Sessiz Buzul", "Silent Glacier", "Stiller Gletscher", "Glaciar silencioso", "Glacier silencieux", "Geleira silenciosa", "Безмолвный ледник"),
    N("Yontulmuş buz duvarları, donmuş göl ve usulca yağan kar.", "Faceted ice walls, a frozen lake and softly falling snow.", "Facettierte Eiswände, ein zugefrorener See und leise fallender Schnee.", "Paredes de hielo facetadas, un lago helado y nieve que cae suave.", "Des parois de glace taillées, un lac gelé et une neige qui tombe doucement.", "Paredes de gelo facetadas, um lago congelado e neve caindo de leve.", "Гранёные ледяные стены, замёрзшее озеро и тихий снегопад."),
    () => {
      const s = sky("s", [[0, "#071a24"], [0.6, "#1e5a7a"], [1, "#a6e7ff"]]);
      const wall = (pts, c1, c2) => { let o = ""; for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; o += `<path d='M${x1} ${y1}L${x2} ${y2}L${x2} 150L${x1} 150Z' fill='${i % 2 ? c1 : c2}'/>`; } return o; };
      const walls = wall([[260, 150], [300, 70], [340, 90], [380, 40], [420, 66], [460, 30], [500, 58], [540, 44], [600, 70]], "#bfefff", "#7ac8e8") + `<path d='M300 70L320 150M380 40L392 150M460 30L470 150M540 44L548 150' stroke='#fff' stroke-opacity='.5'/>`;
      const snow = `<g>${scatter(5, 40, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(0.8 + r() * 1.6)}' fill='#fff' opacity='${f(0.5 + r() * 0.5)}'/>`)}<animateTransform attributeName='transform' type='translate' values='0 -10;-6 10' dur='6s' repeatCount='3'/></g>`;
      const body = s.b + stars(3, 30, [0, 0, 600, 60], ["#fff"], 0.8) + `<path d='${ridge(5, 110, 20, 0.5, 150)}' fill='#4a8ab0' opacity='.6'/>` + walls + `<rect y='150' width='600' height='50' fill='url(#lk)'/><g transform='translate(0 300) scale(1 -1)' opacity='.25'>${walls}</g>` + `<path d='M0 150H600' stroke='#fff' stroke-opacity='.7'/>` + scatter(9, 10, (r) => `<path d='M${f(r() * 600)} ${f(156 + r() * 40)}h${f(20 + r() * 60)}' stroke='#fff' stroke-opacity='.25'/>`) + snow;
      return bannerDoc(s.d + lg("lk", ["#5aa8d0", "#0e2a3a"]), body, 0.3);
    });
  piece(K, "profile_badge", "rare", 260,
    N("Kristal", "Crystal", "Kristall", "Cristal", "Cristal", "Cristal", "Кристалл"),
    N("Buz mavisi altıgende bir kar kristali.", "A snow crystal on an ice blue hexagon.", "Ein Schneekristall auf eisblauem Sechseck.", "Un cristal de nieve sobre un hexágono azul hielo.", "Un cristal de neige sur un hexagone bleu glace.", "Um cristal de neve em um hexágono azul-gelo.", "Снежный кристалл на ледяном голубом шестиугольнике."),
    () => badgeArt("hex", ["#ffffff", "#3a8fb7", "#071a24"], "snowflake", "#ffffff", { ring: "#a6e7ff" }));
}

// ================================================================ 6. Neon Çarşı / Neon Bazaar
{
  const K = "neon-carsi";
  piece(K, "avatar_frame", "legendary", 940,
    N("Tabela Halkası", "Sign Ring", "Schilderring", "Anillo de letreros", "Anneau d'enseignes", "Anel de letreiros", "Кольцо вывесок"),
    N("Pembe ve camgöbeği neon tüpler, sarı ok tabelaları ve süzülen yağmur damlaları.", "Pink and cyan neon tubes, yellow arrow signs and sliding raindrops.", "Pinke und cyanfarbene Neonröhren, gelbe Pfeilschilder und rinnende Regentropfen.", "Tubos de neón rosa y cian, flechas amarillas y gotas de lluvia.", "Des tubes néon rose et cyan, des flèches jaunes et des gouttes de pluie.", "Tubos neon rosa e ciano, setas amarelas e gotas de chuva escorrendo.", "Розовые и голубые неоновые трубки, жёлтые стрелки и стекающие капли."),
    () => {
      const defs = blur("b", 2.4);
      const tube = (r, c, a0, a1, fl) => `<g>${`<path d='${arc(r, a0, a1)}' fill='none' stroke='${c}' stroke-width='6' stroke-linecap='round' stroke-opacity='.7' filter='url(#b)'/><path d='${arc(r, a0, a1)}' fill='none' stroke='${c}' stroke-width='2.8' stroke-linecap='round'/><path d='${arc(r, a0, a1)}' fill='none' stroke='#fff' stroke-width='.9' stroke-linecap='round'/>`}${fl ? pulse("opacity", "1;.3;1;1;.7;1", 1.4, 2, fl) : ""}</g>`;
      const arrow = (a, rot) => at(92, a, `<g transform='rotate(${rot})'><path d='M-6 -2.6H2V-6L8 0L2 6V2.6H-6Z' fill='#fff04a' stroke='#fff04a' stroke-width='1.6' stroke-linejoin='round' filter='url(#b)' opacity='.7'/><path d='M-6 -2.6H2V-6L8 0L2 6V2.6H-6Z' fill='#fffbc0'/></g>`);
      const rain = scatter(3, 7, (r) => { const [x, y] = pol(78 + r() * 8, 100 + r() * 160); return `<path d='M${x} ${y}v5' stroke='#cfe8ff' stroke-width='1.2' stroke-linecap='round' opacity='.7'><animateTransform attributeName='transform' type='translate' values='0 -6;0 6' dur='${f(1 + r())}s' repeatCount='3'/></path>`; });
      return frameDoc(defs, circ(82, "#0a0618", 15, " stroke-opacity='.6'") + tube(86, "#ff2e88", 200, 520, 0.3) + tube(78.5, "#2ef2ff", 10, 340, 0) + arrow(40, 90) + arrow(320, -90) + rain + `<rect x='86' y='182' width='28' height='12' rx='3' fill='#0a0618' stroke='#ff2e88' stroke-width='1.4'/><path d='M91 188h18' stroke='#fff04a' stroke-width='2.4' stroke-dasharray='3 2'/>`);
    });
  piece(K, "banner", "legendary", 780,
    N("Neon Çarşı", "Night Market Alley", "Nachtmarktgasse", "Callejón del mercado", "Ruelle du marché", "Beco do mercado", "Переулок ночного рынка"),
    N("Yağmurlu bir çarşı sokağı: tenteli tezgâhlar, titreyen neon tabelalar ve ıslak yansımalar.", "A rainy bazaar alley: awninged stalls, flickering neon signs and wet reflections.", "Eine regnerische Basargasse: Stände mit Markisen, flackernde Neonschilder und nasse Spiegelungen.", "Un callejón de bazar con lluvia: puestos con toldos, neones que parpadean y reflejos mojados.", "Une ruelle de bazar sous la pluie : étals à auvents, néons qui clignotent et reflets mouillés.", "Um beco de bazar na chuva: barracas com toldos, neons piscando e reflexos molhados.", "Дождливый переулок базара: прилавки с навесами, мигающий неон и мокрые отражения."),
    () => {
      const s = sky("s", [[0, "#0a0618"], [1, "#2a0a3a"]]);
      const stall = (x, w, c1, c2) => `<path d='M${x} 120h${w}v60h${-w}Z' fill='#140a24'/><path d='M${x - 6} 112h${w + 12}l-6 14h${-w}Z' fill='${c1}'/>${Array.from({ length: Math.floor(w / 12) }, (_, i) => `<path d='M${x + i * 12} 112h6l-1 14h-6Z' fill='${c2}'/>`).join("")}<rect x='${x + 6}' y='136' width='${w - 12}' height='14' fill='#fff04a' opacity='.25'/>`;
      const sign = (x, y, w, h, c, fl) => `<g><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='none' stroke='${c}' stroke-width='4' filter='url(#b)'/><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='${c}' fill-opacity='.15' stroke='#fff' stroke-width='1.2'/>${fl ? pulse("opacity", "1;.2;1;1", 1.2, 3, fl) : ""}</g>`;
      const rain = scatter(6, 70, (r) => `<path d='M${f(r() * 600)} ${f(r() * 200)}l-3 12' stroke='#cfe8ff' stroke-opacity='${f(0.15 + r() * 0.3)}'/>`);
      const body = s.b + `<path d='${skyline(9, 120, 30, 100, 180, 610, 30, 60).body}' fill='#120820'/>` + sign(300, 30, 20, 70, "#ff2e88", 0.5) + sign(360, 40, 90, 24, "#2ef2ff", 0) + sign(480, 20, 60, 30, "#fff04a", 1.3) + sign(560, 60, 20, 50, "#ff2e88", 0) +
        stall(300, 72, "#ff2e88", "#ffd0e6") + stall(390, 84, "#2ef2ff", "#d0faff") + stall(490, 70, "#fff04a", "#fffbc0") + `<rect y='180' width='600' height='20' fill='#06030c'/><rect x='300' y='180' width='280' height='20' fill='url(#wet)'/>` + rain + `<path d='M0 20H300' stroke='#2a1a3a' stroke-width='1'/>` + [40, 100, 160, 220, 280].map((x) => `<circle cx='${x}' cy='${24 + (x % 3)}' r='3' fill='${x % 120 ? "#fff04a" : "#ff2e88"}'/>`).join("");
      return bannerDoc(s.d + blur("b", 3) + lg("wet", [[0, "#ff2e88", 0.25], [0.5, "#2ef2ff", 0.2], [1, "#fff04a", 0.15]], 0, 0, 1, 0), body, 0.35);
    });
  piece(K, "profile_badge", "epic", 320,
    N("Neon Ok", "Neon Arrow", "Neonpfeil", "Flecha de neón", "Flèche néon", "Seta neon", "Неоновая стрелка"),
    N("Koyu karede pembe kenarlı, sarı yanan bir ok.", "A glowing yellow arrow on a dark tile with a pink edge.", "Ein leuchtend gelber Pfeil auf dunkler Kachel mit pinkem Rand.", "Una flecha amarilla brillante sobre una pieza oscura con borde rosa.", "Une flèche jaune lumineuse sur un carreau sombre bordé de rose.", "Uma seta amarela brilhante em um ladrilho escuro com borda rosa.", "Светящаяся жёлтая стрелка на тёмной плитке с розовой каймой."),
    () => badgeArt("square", ["#4a2a6a", "#1a0a30", "#0a0618"], null, "#fff", { ring: "#ff2e88", glyphSvg: `<path d='M5.6 10H12.4V6.6L18.6 12L12.4 17.4V14H5.6Z' fill='#fff04a' stroke='#fff04a' stroke-width='2.2' stroke-linejoin='round' opacity='.35'/><path d='M5.6 10H12.4V6.6L18.6 12L12.4 17.4V14H5.6Z' fill='#fffbc0' stroke='#0a0618' stroke-width='.6' stroke-linejoin='round'/>` }));
}

// ================================================================ 7. Altın Hasat / Golden Harvest
{
  const K = "altin-hasat";
  const ear = (len, s = 1) => { let g = `<path d='M0 4V${-len}' stroke='#8a6a12' stroke-width='1.2'/>`; for (let i = 0; i < 6; i++) { const y = -len * 0.35 - i * len * 0.11; g += `<ellipse cx='-2' cy='${f(y)}' rx='1.7' ry='3.2' transform='rotate(-28 -2 ${f(y)})' fill='url(#wh)' stroke='#8a5a08' stroke-width='.4'/><ellipse cx='2' cy='${f(y - 1.2)}' rx='1.7' ry='3.2' transform='rotate(28 2 ${f(y - 1.2)})' fill='url(#wh)' stroke='#8a5a08' stroke-width='.4'/>`; } g += `<ellipse cx='0' cy='${f(-len - 1)}' rx='1.5' ry='3' fill='url(#wh)'/><path d='M0 ${-len - 3}V${-len - 9}M-2 ${-len - 2}L-4 ${-len - 8}M2 ${-len - 2}L4 ${-len - 8}' stroke='#f2c230' stroke-width='.5'/>`; return `<g transform='scale(${s})'>${g}</g>`; };
  piece(K, "avatar_frame", "legendary", 860,
    N("Başak Çelengi", "Wheat Wreath", "Ährenkranz", "Corona de espigas", "Couronne d'épis", "Coroa de trigo", "Венок колосьев"),
    N("Akşam güneşinde parlayan altın başaklardan bir çelenk, rüzgârda hafifçe salınır.", "A wreath of golden wheat glowing in the late sun, swaying softly in the wind.", "Ein Kranz goldener Ähren im Abendlicht, der sanft im Wind schwingt.", "Una corona de espigas doradas a la luz de la tarde que se mece con el viento.", "Une couronne d'épis dorés dans le soleil du soir, qui ondule doucement au vent.", "Uma coroa de trigo dourado ao sol da tarde, balançando de leve com o vento.", "Венок золотых колосьев в вечернем солнце, мягко колышется на ветру."),
    () => {
      const defs = metalGrad("m", "gold") + lg("wh", ["#fff3c4", "#f2c230", "#8a6a12"], 0, 0, 1, 1) + rgU("sun", [[0.72, "#fff3c4", 0], [0.84, "#f2c230", 0.35], [1, "#f2c230", 0]], 100, 100, 100) + `<g id='ea'>${ear(13)}</g>`;
      let w = "";
      for (let i = 0; i < 9; i++) { const a = 200 + i * 16, sc = f((1 - i * 0.03) * 100) / 100; w += at(86, a, `<use href='#ea' transform='rotate(58) scale(${sc})'/>`); w += at(86, 360 - a, `<use href='#ea' transform='rotate(-58) scale(${sc})'/>`); }
      return frameDoc(defs, `<circle cx='100' cy='100' r='99' fill='url(#sun)'/>` + `<g>${w}<animateTransform attributeName='transform' type='rotate' values='0 100 100;1.6 100 100;-1.6 100 100;0 100 100' dur='4s' repeatCount='3'/></g>` + band(80.5, 6.5, "url(#m)") + `<path d='M88 192Q100 182 112 192' fill='none' stroke='#8a6a12' stroke-width='3' stroke-linecap='round'/><circle cx='100' cy='188' r='4' fill='url(#m)' stroke='#5e4612' stroke-width='.6'/>`);
    });
  piece(K, "banner", "epic", 660,
    N("Altın Tarla", "Golden Field", "Goldenes Feld", "Campo dorado", "Champ doré", "Campo dourado", "Золотое поле"),
    N("Geç saatte kıvrılan buğday tarlaları, saman balyaları ve alçak güneş.", "Rolling wheat fields late in the day, with hay bales and a low sun.", "Wogende Weizenfelder am späten Tag, Heuballen und tiefe Sonne.", "Campos de trigo ondulados al final del día, con balas de heno y el sol bajo.", "Des champs de blé ondulants en fin de journée, des bottes de foin et un soleil bas.", "Campos de trigo ondulados no fim do dia, com fardos de feno e o sol baixo.", "Волнистые пшеничные поля под вечер, тюки сена и низкое солнце."),
    () => {
      const s = sky("s", [[0, "#3a2a6a"], [0.5, "#e88a4a"], [0.85, "#ffd27a"], [1, "#fff3c4"]]);
      const rows = [118, 136, 158, 182].map((y, i) => { const d = hills(y, [[6 - i, 220 + i * 40, i * 1.2], [3, 90, i]], 210); return `<path d='${d}' fill='url(#f${i})'/>` + scatter(10 + i, 30, (r) => `<path d='M${f(r() * 600)} ${f(y + 4 + r() * 16)}l${f(-2 + r() * 4)} -${f(4 + i * 2)}' stroke='#fff3c4' stroke-opacity='${f(0.25 + r() * 0.3)}' stroke-width='1'/>`); }).join("");
      const bale = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><ellipse cx='0' cy='0' rx='14' ry='10' fill='#d8a83a'/><ellipse cx='-9' cy='0' rx='6' ry='10' fill='#f2c230'/><path d='M-13 -2a5 8 0 0 1 8 0M-13 2a5 8 0 0 1 8 0' stroke='#8a6a12' fill='none'/></g>`;
      const body = s.b + `<circle cx='470' cy='112' r='110' fill='url(#g)'/><circle cx='470' cy='110' r='22' fill='#fff8d8'/>` + `<path d='M520 70l5 3l5 -3M540 60l4 2l4 -2M500 80l4 2l4 -2' stroke='#3a2a1a' stroke-width='1.2' fill='none'/>` + rows + bale(360, 150, 1.1) + bale(420, 146, 0.8) + bale(560, 170, 1.4) + `<g opacity='.5'><rect width='600' height='200' fill='url(#hz)'/>${pulse("opacity", ".5;.2;.5", 4, 2)}</g>`;
      return bannerDoc(s.d + glow("g", "#fff3c4", 0.8) + lg("f0", ["#e8b84a", "#a8781a"]) + lg("f1", ["#d8a83a", "#8a6a12"]) + lg("f2", ["#c8902a", "#6a4a0a"]) + lg("f3", ["#a8701a", "#3a2405"]) + rg("hz", [[0, "#fff3c4", 0.3], [1, "#fff3c4", 0]], 0.78, 0.55, 0.5), body, 0.3);
    });
  piece(K, "profile_badge", "rare", 240,
    N("Başak", "Wheat Ear", "Ähre", "Espiga", "Épi", "Espiga", "Колос"),
    N("Altın yuvarlakta dolgun bir başak.", "A full ear of wheat on a golden disc.", "Eine volle Ähre auf goldener Scheibe.", "Una espiga llena sobre un disco dorado.", "Un épi bien plein sur un disque doré.", "Uma espiga cheia em um disco dourado.", "Полный колос на золотом круге."),
    () => badgeArt("circle", ["#fff3c4", "#c89a1a", "#3a2405"], null, "#fff", { ring: "#fff3c4", defs: lg("wh", ["#fffbe8", "#ffe08a"], 0, 0, 1, 1), glyphSvg: `<path d='M12 20V7' stroke='#fffbe8' stroke-width='1.3'/>${[0, 1, 2, 3].map((i) => `<ellipse cx='10.4' cy='${15.6 - i * 2.6}' rx='1.5' ry='2.6' transform='rotate(-30 10.4 ${15.6 - i * 2.6})' fill='url(#wh)' stroke='#6a4a0a' stroke-width='.5'/><ellipse cx='13.6' cy='${14.8 - i * 2.6}' rx='1.5' ry='2.6' transform='rotate(30 13.6 ${14.8 - i * 2.6})' fill='url(#wh)' stroke='#6a4a0a' stroke-width='.5'/>`).join("")}<ellipse cx='12' cy='4.6' rx='1.4' ry='2.4' fill='url(#wh)' stroke='#6a4a0a' stroke-width='.5'/>` }));
}

// ================================================================ 8. Mor Sis / Violet Haze
{
  const K = "mor-sis";
  piece(K, "avatar_frame", "legendary", 880,
    N("Sis Halesi", "Haze Halo", "Dunstschein", "Halo de bruma", "Halo de brume", "Halo de névoa", "Ореол дымки"),
    N("Avatarı yumuşak bir bulutsu sisi gibi saran mor hale; içinde yıldızlar süzülür.", "A violet halo wrapping the avatar like soft nebula haze, with stars drifting inside.", "Ein violetter Schein, der den Avatar wie weicher Nebeldunst umhüllt, darin treibende Sterne.", "Un halo violeta que envuelve el avatar como una bruma de nebulosa, con estrellas.", "Un halo violet qui enveloppe l'avatar comme une brume de nébuleuse, avec des étoiles.", "Um halo violeta envolvendo o avatar como névoa de nebulosa, com estrelas flutuando.", "Фиолетовый ореол окутывает аватар, как мягкая туманность, внутри плывут звёзды."),
    () => {
      const defs = blur("b", 4) + lgU("hz", ["#e6dcff", "#a77bff", "#4b2a9c", "#a77bff", "#e6dcff"], 0, 0, 200, 200) + metalGrad("m", ["#ffffff", "#e6dcff", "#a77bff", "#4b2a9c", "#120a24"]);
      const puffs = scatter(4, 14, (r) => { const [x, y] = pol(84 + r() * 8, r() * 360); return `<circle cx='${x}' cy='${y}' r='${f(6 + r() * 7)}' fill='${r() > 0.5 ? "#a77bff" : "#e6dcff"}' opacity='${f(0.25 + r() * 0.3)}'/>`; });
      const st = scatter(7, 16, (r) => { const [x, y] = pol(80 + r() * 16, r() * 360); return `<path d='${sparkle(f(1.4 + r() * 2.2))}' transform='translate(${x} ${y})' fill='#fff'/>`; });
      return frameDoc(defs, `<g filter='url(#b)'>${puffs}<animateTransform attributeName='transform' type='rotate' values='0 100 100;20 100 100;0 100 100' dur='12s' repeatCount='2'/></g>` + band(79, 4, "url(#m)", { spec: false, lipOpacity: 0.6 }) + circ(84, "url(#hz)", 1.4, " stroke-opacity='.8' stroke-dasharray='20 6 2 6'") + `<g>${st}<animateTransform attributeName='transform' type='rotate' values='0 100 100;-30 100 100' dur='16s' repeatCount='1' fill='freeze'/></g>`);
    });
  piece(K, "banner", "epic", 640,
    N("Mor Sis", "Violet Haze", "Violetter Dunst", "Bruma violeta", "Brume violette", "Névoa violeta", "Фиолетовая дымка"),
    N("Katman katman mor tepelerin üstünde yavaşça kayan yumuşak bir bulutsu.", "A soft nebula drifting slowly over layered violet hills.", "Ein weicher Nebel, der langsam über gestaffelte violette Hügel zieht.", "Una nebulosa suave que pasa despacio sobre colinas violetas en capas.", "Une nébuleuse douce qui dérive lentement au-dessus de collines violettes étagées.", "Uma nebulosa suave passando devagar sobre colinas violeta em camadas.", "Мягкая туманность медленно плывёт над слоями фиолетовых холмов."),
    () => {
      const s = sky("s", [[0, "#120a24"], [0.7, "#2e1a5a"], [1, "#4b2a9c"]]);
      const neb = (cx, cy, rx, ry, c, op, rot) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='${c}' opacity='${op}' transform='rotate(${rot} ${cx} ${cy})'/>`;
      const body = s.b + stars(14, 90, [0, 0, 600, 140], ["#fff", "#e6dcff"], 1, 3) + `<g filter='url(#b)'>${neb(430, 70, 170, 46, "#a77bff", 0.45, -10)}${neb(500, 50, 90, 30, "#e6dcff", 0.35, 15)}${neb(330, 90, 110, 30, "#ff8ad8", 0.2, -20)}<animateTransform attributeName='transform' type='translate' values='0 0;-16 4;0 0' dur='10s' repeatCount='2'/></g>` +
        `<circle cx='520' cy='56' r='16' fill='#f2ecff'/><circle cx='526' cy='51' r='14' fill='#2e1a5a' opacity='.5'/>` + [[120, "#3a2478", 26], [140, "#2e1a62", 20], [160, "#22124a", 16], [180, "#150a30", 10]].map(([y, c, a], i) => `<path d='${ridge(i * 5 + 3, y, a, 0.5)}' fill='${c}'/>`).join("") + `<rect y='110' width='600' height='40' fill='url(#mist)'/>`;
      return bannerDoc(s.d + blur("b", 16) + lg("mist", [[0, "#e6dcff", 0], [0.5, "#e6dcff", 0.22], [1, "#e6dcff", 0]]), body, 0.3);
    });
  piece(K, "profile_badge", "rare", 240,
    N("Sis Yıldızı", "Haze Star", "Dunststern", "Estrella de bruma", "Étoile de brume", "Estrela de névoa", "Звезда дымки"),
    N("Mor beşgende parlayan dört köşeli bir yıldız.", "A bright four-point star on a violet pentagon.", "Ein heller vierzackiger Stern auf violettem Fünfeck.", "Una estrella brillante de cuatro puntas sobre un pentágono violeta.", "Une étoile brillante à quatre branches sur un pentagone violet.", "Uma estrela brilhante de quatro pontas em um pentágono violeta.", "Яркая четырёхлучевая звезда на фиолетовом пятиугольнике."),
    () => badgeArt("pentagon", ["#e6dcff", "#4b2a9c", "#120a24"], null, "#fff", { ring: "#a77bff", glyphSvg: `<path d='${sparkle(7.2, 0.2)}' transform='translate(12 12.6)' fill='#fff' stroke='#4b2a9c' stroke-width='.6'/><circle cx='17' cy='7.6' r='1' fill='#e6dcff'/><circle cx='7.4' cy='16.4' r='.8' fill='#e6dcff'/>` }));
}
// ================================================================ 9. Gece Mercanı / Night Coral
{
  const K = "gece-mercani";
  const coral = (seed, len, depth, c) => { const r = rnd(seed); let d = ""; const g = (x, y, l, ang, dp) => { const x1 = x + l * Math.sin(ang), y1 = y - l * Math.cos(ang); d += `M${f(x)} ${f(y)}L${f(x1)} ${f(y1)}`; if (dp > 0) { g(x1, y1, l * 0.72, ang - 0.5 - r() * 0.2, dp - 1); g(x1, y1, l * 0.72, ang + 0.5 + r() * 0.2, dp - 1); } }; g(0, 0, len, 0, depth); return `<path d='${d}' stroke='${c}' stroke-width='2.6' stroke-linecap='round' fill='none'/>`; };
  piece(K, "avatar_frame", "legendary", 900,
    N("Mercan Dalı", "Coral Branch", "Korallenzweig", "Rama de coral", "Branche de corail", "Galho de coral", "Коралловая ветвь"),
    N("Gece resifinden halkaya uzanan parlayan mercan dalları ve yükselen kabarcıklar.", "Glowing coral branches reaching around the ring from a night reef, with rising bubbles.", "Leuchtende Korallenzweige, die vom Nachtriff um den Ring wachsen, dazu aufsteigende Blasen.", "Ramas de coral luminosas que rodean el aro desde un arrecife nocturno, con burbujas.", "Des branches de corail lumineuses qui entourent l'anneau depuis un récif de nuit, avec des bulles.", "Galhos de coral brilhantes envolvendo o aro a partir de um recife noturno, com bolhas.", "Светящиеся коралловые ветви тянутся вокруг кольца от ночного рифа, поднимаются пузыри."),
    () => {
      const defs = metalGrad("m", ["#ffd6e2", "#ff8fab", "#d6336c", "#4a0a24", "#0c0a1f"]) + blur("b", 2.2);
      const cs = [[150, 14, "#ff8fab", 1], [168, 12, "#7c5cff", 2], [205, 13, "#ff8fab", 3], [192, 11, "#d6336c", 4], [130, 10, "#7c5cff", 5], [228, 10, "#ff8fab", 6]].map(([a, l, c, sd]) => at(84, a, coral(sd, l * 0.55, 3, c))).join("");
      const bub = scatter(5, 8, (r) => { const [x, y] = pol(88 + r() * 8, 60 + r() * 60); return `<circle cx='${x}' cy='${y}' r='${f(1.2 + r() * 2)}' fill='none' stroke='#ffd6e2' stroke-width='.7'><animate attributeName='cy' values='${y};${f(y - 14)}' dur='${f(2.4 + r() * 2)}s' repeatCount='3'/></circle>`; });
      return frameDoc(defs, `<g filter='url(#b)' opacity='.75'>${cs}${breathe(2.6, 3, ".35")}</g>` + band(80.5, 7, "url(#m)", { lip: "#ffd6e2" }) + cs + bub);
    });
  piece(K, "banner", "legendary", 740,
    N("Gece Resifi", "Night Reef", "Nachtriff", "Arrecife nocturno", "Récif de nuit", "Recife noturno", "Ночной риф"),
    N("Mor sularda kendi ışığıyla yanan mercanlar ve süzülen pembe denizanaları.", "Corals glowing with their own light in violet water, with pink jellyfish drifting by.", "Korallen, die in violettem Wasser aus eigenem Licht leuchten, dazu treibende rosa Quallen.", "Corales que brillan con luz propia en agua violeta y medusas rosas a la deriva.", "Des coraux qui luisent dans une eau violette, et des méduses roses à la dérive.", "Corais brilhando com luz própria em água violeta e águas-vivas rosa à deriva.", "Кораллы светятся в фиолетовой воде, мимо проплывают розовые медузы."),
    () => {
      const s = sky("s", [[0, "#1a0f3a"], [0.6, "#0c0a1f"], [1, "#05040e"]]);
      const jelly = (x, y, sc, dur) => `<g transform='translate(${x} ${y}) scale(${sc})'><g><circle r='22' fill='url(#jg)'/><path d='M-12 0C-12 -10 -6 -14 0 -14C6 -14 12 -10 12 0Z' fill='#ff8fab' fill-opacity='.6' stroke='#ffd6e2'/>${[-8, -3, 2, 7].map((tx) => `<path d='M${tx} 1q3 10 -1 18' fill='none' stroke='#ff8fab' stroke-opacity='.6'/>`).join("")}<animateTransform attributeName='transform' type='translate' values='0 0;0 -8;0 0' dur='${dur}s' repeatCount='3'/></g></g>`;
      const reef = [[330, "#ff8fab", 3, 1.2], [390, "#7c5cff", 4, 1.5], [460, "#d6336c", 5, 1.3], [520, "#ff8fab", 6, 1.6], [580, "#7c5cff", 7, 1.1]].map(([x, c, sd, s2]) => `<g transform='translate(${x} 196) scale(${s2})'>${coral(sd, 26, 4, c)}</g>`).join("");
      const body = s.b + `<rect width='600' height='90' fill='url(#top)'/>` + scatter(3, 40, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(0.4 + r())}' fill='#ffd6e2' opacity='${f(0.2 + r() * 0.5)}'/>`) + jelly(420, 60, 1.4, 5) + jelly(520, 44, 1, 6) + jelly(330, 80, 0.8, 4.5) + `<g filter='url(#b)' opacity='.8'>${reef}</g>` + reef + `<path d='${hills(192, [[5, 200, 1]])}' fill='#0c0a1f'/>`;
      return bannerDoc(s.d + lg("top", [[0, "#7c5cff", 0.35], [1, "#7c5cff", 0]]) + glow("jg", "#ff8fab", 0.4) + blur("b", 4), body, 0.35);
    });
  piece(K, "profile_badge", "rare", 260,
    N("Mercan", "Coral", "Koralle", "Coral", "Corail", "Coral", "Коралл"),
    N("Gece moru yuvarlakta pembe bir mercan dalı.", "A pink coral branch on a night violet disc.", "Ein rosa Korallenzweig auf nachtvioletter Scheibe.", "Una rama de coral rosa sobre un disco violeta nocturno.", "Une branche de corail rose sur un disque violet nuit.", "Um galho de coral rosa em um disco violeta-noite.", "Розовая коралловая ветвь на ночном фиолетовом круге."),
    () => badgeArt("circle", ["#a88aff", "#3a2a7a", "#0c0a1f"], null, "#fff", { ring: "#ff8fab", glyphSvg: `<path d='M12 19.4V13M12 13L8.6 9.4M12 13L15.6 9M8.6 9.4L7 6.2M8.6 9.4L10.4 6.4M15.6 9L14 5.8M15.6 9L17.4 6.6M12 15.6L9.4 14.4' stroke='#0c0a1f' stroke-width='3.2' stroke-linecap='round' fill='none'/><path d='M12 19.4V13M12 13L8.6 9.4M12 13L15.6 9M8.6 9.4L7 6.2M8.6 9.4L10.4 6.4M15.6 9L14 5.8M15.6 9L17.4 6.6M12 15.6L9.4 14.4' stroke='#ff8fab' stroke-width='1.8' stroke-linecap='round' fill='none'/>` }));
}

// ================================================================ 10. Kuzey Işığı / Polar Light
{
  const K = "kuzey-isigi";
  piece(K, "avatar_frame", "mythic", 1000,
    N("Kutup Perdesi", "Aurora Veil", "Polarlichtschleier", "Velo de aurora", "Voile d'aurore", "Véu de aurora", "Завеса сияния"),
    N("Halkanın çevresinde dalgalanan yeşil ve mor kutup ışığı perdeleri.", "Green and violet aurora curtains rippling all around the ring.", "Grüne und violette Polarlichtschleier, die rund um den Ring wogen.", "Cortinas de aurora verdes y violetas ondulando alrededor del aro.", "Des voiles d'aurore verts et violets qui ondulent tout autour de l'anneau.", "Cortinas de aurora verdes e violetas ondulando ao redor do aro.", "Зелёные и фиолетовые завесы сияния колышутся вокруг кольца."),
    () => {
      const defs = rgU("cv", [[0.76, "#6effc7", 0], [0.8, "#6effc7", 0.85], [0.9, "#14a37f", 0.5], [1, "#8f7bff", 0]], 100, 100, 100) + blur("b", 1.6) + metalGrad("m", ["#e6fff4", "#6effc7", "#14a37f", "#04342a", "#04121c"]);
      let rays = "";
      const r = rnd(10);
      for (let a = 0; a < 360; a += 5) { const len = 10 + 8 * Math.abs(Math.sin((a * Math.PI) / 50)) + r() * 4; rays += `M${pol(80, a).join(" ")}L${pol(80 + len, a + 2).join(" ")}`; }
      return frameDoc(defs, `<g filter='url(#b)'><path d='${rays}' stroke='url(#cv)' stroke-width='3.6' stroke-linecap='round'/><animateTransform attributeName='transform' type='rotate' values='0 100 100;12 100 100;0 100 100' dur='8s' repeatCount='3'/>${breathe(3, 3, ".55")}</g>` + band(80, 5.5, "url(#m)", { lip: "#e6fff4" }) + circ(80, "#8f7bff", 0.9, " stroke-dasharray='6 10' stroke-opacity='.8'") + [[40, 40], [166, 54], [150, 172]].map(([x, y]) => `<path d='${sparkle(3.5)}' transform='translate(${x} ${y})' fill='#fff'/>`).join(""));
    });
  piece(K, "banner", "legendary", 800,
    N("Kuzey Gecesi", "Polar Night", "Polarnacht", "Noche polar", "Nuit polaire", "Noite polar", "Полярная ночь"),
    N("Karlı tundranın ve donmuş nehrin üstünde dans eden kutup ışığı.", "Aurora dancing over snowy tundra and a frozen river.", "Polarlicht tanzt über verschneiter Tundra und einem gefrorenen Fluss.", "Aurora que baila sobre la tundra nevada y un río helado.", "Une aurore qui danse au-dessus de la toundra enneigée et d'une rivière gelée.", "Aurora dançando sobre a tundra nevada e um rio congelado.", "Сияние танцует над снежной тундрой и замёрзшей рекой."),
    () => {
      const s = sky("s", [[0, "#020a12"], [0.7, "#04202a"], [1, "#0a3a3a"]]);
      const curt = (seed, y0, len, id, x0, x1, dur) => { const r = rnd(seed); let d = ""; for (let x = x0; x < x1; x += 7) d += `M${x} ${f(y0 + 14 * Math.sin(x / 55) + 6 * Math.sin(x / 17))}v${f(len * (0.6 + r() * 0.5))}`; return `<g filter='url(#b)'><path d='${d}' stroke='url(#${id})' stroke-width='9' stroke-opacity='.8'/><animateTransform attributeName='transform' type='translate' values='0 0;-18 3;0 0' dur='${dur}s' repeatCount='3'/></g>`; };
      const body = s.b + stars(21, 90, [0, 0, 600, 120], ["#fff", "#d8fff0"], 1) + curt(2, 8, 80, "a1", 160, 640, 9) + curt(4, 30, 54, "a2", 280, 620, 11) + `<path d='${hills(140, [[8, 260, 1], [4, 90, 2]])}' fill='#dceef0'/><path d='M300 200C330 180 360 168 420 160S520 150 600 152V200Z' fill='url(#rv)'/><path d='${hills(170, [[6, 200, 3]])}' fill='#c8e0e6' opacity='.9'/>` + `<path d='${pineRow(3, 146, 10, 22, 0, 260, 14)}' fill='#04121c'/>`;
      return bannerDoc(s.d + lg("a1", [[0, "#8f7bff", 0], [0.3, "#8f7bff", 0.6], [0.6, "#6effc7"], [1, "#14a37f", 0]]) + lg("a2", [[0, "#ff7bd0", 0], [0.4, "#6effc7", 0.8], [1, "#6effc7", 0]]) + blur("b", 3.5) + lg("rv", ["#7ac8d8", "#2a6a7a"], 0, 0, 1, 1), body, 0.3);
    });
  piece(K, "profile_badge", "epic", 320,
    N("Kuzey Yıldızı", "Aurora Star", "Polarstern", "Estrella polar", "Étoile boréale", "Estrela boreal", "Звезда сияния"),
    N("Kutup ışığı renklerinde parlayan bir yıldız.", "A star glowing in aurora colours.", "Ein Stern in den Farben des Polarlichts.", "Una estrella que brilla con los colores de la aurora.", "Une étoile aux couleurs de l'aurore.", "Uma estrela brilhando nas cores da aurora.", "Звезда в цветах полярного сияния."),
    () => badgeArt("star", ["#e6fff4", "#14a37f", "#04121c"], null, "#fff", { ring: "#8f7bff", glyphSvg: `<circle cx='12' cy='13' r='2.6' fill='#fff'/><circle cx='12' cy='13' r='4.4' fill='#6effc7' opacity='.35'/>` }));
}

// ================================================================ 11. Zümrüt Orman / Emerald Grove
{
  const K = "zumrut-orman";
  piece(K, "avatar_frame", "legendary", 880,
    N("Orman Çelengi", "Grove Wreath", "Hainkranz", "Corona del bosque", "Couronne du bosquet", "Coroa do bosque", "Лесной венок"),
    N("Koyu zümrüt yapraklardan bir çelenk ve aralarında yanıp sönen ateşböcekleri.", "A wreath of deep emerald leaves with fireflies blinking between them.", "Ein Kranz aus tiefgrünen Blättern, dazwischen blinkende Glühwürmchen.", "Una corona de hojas esmeralda con luciérnagas que parpadean entre ellas.", "Une couronne de feuilles émeraude où clignotent des lucioles.", "Uma coroa de folhas esmeralda com vaga-lumes piscando entre elas.", "Венок из тёмно-изумрудных листьев, между ними мигают светлячки."),
    () => {
      const defs = lg("lf", ["#d8ffe6", "#49d17d", "#1f7a46", "#06140c"], 0, 0, 1, 1) + metalGrad("m", ["#d8ffe6", "#49d17d", "#1f7a46", "#0a3a1e", "#06140c"]) + glow("fy", "#e8ff8a", 0.8) + `<g id='lv'><path d='${leaf(15, 5.4)}' fill='url(#lf)' stroke='#06140c' stroke-width='.6'/><path d='M0 -1V-12' stroke='#d8ffe6' stroke-opacity='.4' stroke-width='.6'/></g>`;
      let w = "";
      for (let i = 0; i < 24; i++) { const a = i * 15; w += at(i % 2 ? 87 : 84, a, `<use href='#lv' transform='rotate(${i % 2 ? 55 : 125}) scale(${i % 3 ? 0.85 : 1})'/>`); }
      const flies = scatter(2, 9, (r) => { const [x, y] = pol(88 + r() * 9, r() * 360); return `<circle cx='${x}' cy='${y}' r='4.4' fill='url(#fy)'>${pulse("opacity", "1;.1;1", f(1.2 + r() * 1.4), 3, f(r() * 2))}</circle><circle cx='${x}' cy='${y}' r='.9' fill='#f8ffd0'/>`; });
      return frameDoc(defs, band(80.5, 6, "url(#m)") + w + flies);
    });
  piece(K, "banner", "epic", 680,
    N("Zümrüt Koru", "Emerald Grove", "Smaragdhain", "Arboleda esmeralda", "Bosquet d'émeraude", "Bosque esmeralda", "Изумрудная роща"),
    N("Derin bir ormanda gövdeler arasından süzülen ışık ve ateşböcekleri.", "Light slanting between trunks in a deep forest, with fireflies.", "Licht, das zwischen den Stämmen eines tiefen Waldes fällt, dazu Glühwürmchen.", "Luz que se cuela entre los troncos de un bosque profundo, con luciérnagas.", "Une lumière oblique entre les troncs d'une forêt profonde, et des lucioles.", "Luz entrando entre os troncos de uma floresta profunda, com vaga-lumes.", "Свет пробивается между стволами густого леса, мерцают светлячки."),
    () => {
      const s = sky("s", [[0, "#0e3a22"], [0.6, "#0a2414"], [1, "#06140c"]]);
      const trunk = (x, w, c) => `<path d='M${x} -5C${x + 4} 60 ${x - 4} 140 ${x - w * 0.3} 200H${x + w * 1.3}C${x + w} 140 ${x + w + 4} 60 ${x + w} -5Z' fill='${c}'/>`;
      const back = [60, 140, 230, 300, 380, 440, 520, 580].map((x, i) => trunk(x, 10, "#14402a")).join("");
      const front = [270, 410, 540].map((x) => trunk(x, 22, "#06140c")).join("");
      const rays = [0, 1, 2, 3].map((i) => `<path d='M${380 + i * 50} -5L${300 + i * 60} 205H${330 + i * 60}L${410 + i * 50} -5Z' fill='#d8ffe6' opacity='.09'>${pulse("opacity", ".09;.03;.09", 4 + i, 2)}</path>`).join("");
      const flies = scatter(8, 18, (r) => { const x = 220 + r() * 380, y = 40 + r() * 140; return `<circle cx='${f(x)}' cy='${f(y)}' r='6' fill='url(#fy)'>${pulse("opacity", "1;.1;1", f(1.4 + r() * 1.8), 3, f(r() * 2))}</circle><circle cx='${f(x)}' cy='${f(y)}' r='1.2' fill='#f8ffd0'/>`; });
      const body = s.b + `<g opacity='.7'>${back}</g>` + rays + `<rect y='120' width='600' height='60' fill='url(#mist)'/>` + front + `<path d='${hills(186, [[6, 200, 1], [3, 70, 2]])}' fill='#041008'/>` + scatter(4, 16, (r) => `<path d='${leaf(8 + r() * 6, 3)}' transform='translate(${f(r() * 600)} ${f(176 + r() * 16)}) rotate(${f(r() * 80 - 40)})' fill='#1f7a46'/>`) + flies;
      return bannerDoc(s.d + glow("fy", "#e8ff8a", 0.7) + lg("mist", [[0, "#d8ffe6", 0], [0.5, "#d8ffe6", 0.12], [1, "#d8ffe6", 0]]), body, 0.4);
    });
  piece(K, "profile_badge", "rare", 240,
    N("Yaprak", "Leaf", "Blatt", "Hoja", "Feuille", "Folha", "Лист"),
    N("Zümrüt kalkanda parlak bir yaprak.", "A bright leaf on an emerald shield.", "Ein leuchtendes Blatt auf smaragdgrünem Schild.", "Una hoja brillante sobre un escudo esmeralda.", "Une feuille éclatante sur un écu émeraude.", "Uma folha brilhante em um escudo esmeralda.", "Яркий лист на изумрудном щите."),
    () => badgeArt("shield", ["#d8ffe6", "#1f7a46", "#06140c"], "leaf", "#d8ffe6", { ring: "#49d17d" }));
}

// ================================================================ 12. Kum Saati / Hourglass
{
  const K = "kum-saati";
  piece(K, "avatar_frame", "legendary", 900,
    N("Zaman Kadranı", "Time Dial", "Zeitzifferblatt", "Esfera del tiempo", "Cadran du temps", "Mostrador do tempo", "Циферблат времени"),
    N("Fildişi bir kadran; tepedeki kum saatinden kum akar, ibre halkada ilerler.", "An ivory dial where sand runs through the hourglass on top as a hand moves around.", "Ein Elfenbeinzifferblatt: Sand rinnt durch die Sanduhr oben, ein Zeiger wandert herum.", "Una esfera de marfil: la arena cae en el reloj de arriba mientras una aguja avanza.", "Un cadran ivoire : le sable coule dans le sablier du haut, une aiguille avance.", "Um mostrador marfim: a areia corre na ampulheta no topo enquanto um ponteiro avança.", "Циферблат цвета слоновой кости: в часах наверху течёт песок, стрелка идёт по кругу."),
    () => {
      const defs = metalGrad("m", ["#fffdf6", "#fff8e8", "#e8cf9a", "#9c7a4a", "#4a3418"]) + metalGrad("g", "brass", 20) + lg("sd", ["#f2dca0", "#c89a5a"]);
      const hg = `<g transform='translate(100 12)'><rect x='-8' y='-11' width='16' height='2.6' rx='1' fill='url(#g)'/><rect x='-8' y='8.4' width='16' height='2.6' rx='1' fill='url(#g)'/><path d='M-6 -8.4H6C6 -3 1.6 -1.4 1 0C1.6 1.4 6 3 6 8.4H-6C-6 3 -1.6 1.4 -1 0C-1.6 -1.4 -6 -3 -6 -8.4Z' fill='#fff8e8' fill-opacity='.5' stroke='#4a3418' stroke-width='.8'/><path d='M-4 -6H4L0 -1Z' fill='url(#sd)'><animate attributeName='d' values='M-4 -6H4L0 -1Z;M-1.6 -3H1.6L0 -1Z;M-4 -6H4L0 -1Z' dur='6s' repeatCount='3'/></path><path d='M0 -1V7' stroke='#c89a5a' stroke-width='.8'/><path d='M-4.6 7.6H4.6L0 4Z' fill='url(#sd)'/></g>`;
      const hand = `<g><path d='M100 100' /><path d='${arc(81, -2, 2)}' stroke='#4a3418' stroke-width='9' fill='none'/><circle cx='100' cy='19' r='2' fill='#9c7a4a'/>${spin(18, 1)}</g>`;
      let t = "";
      for (let i = 0; i < 60; i++) { const big = i % 5 === 0; const [x1, y1] = pol(big ? 77 : 78.6, i * 6), [x2, y2] = pol(80.4, i * 6); t += `M${x1} ${y1}L${x2} ${y2}`; }
      return frameDoc(defs, band(81.5, 11.5, "url(#m)") + `<path d='${t}' stroke='#4a3418' stroke-width='.8'/>` + [30, 60, 120, 150, 210, 240, 300, 330].map((a) => at(84.2, a, `<circle r='1.1' fill='#9c7a4a'/>`)).join("") + hand + circ(75.4, "url(#g)", 1.2) + circ(87.6, "url(#g)", 1.4) + hg);
    });
  piece(K, "banner", "epic", 660,
    N("Kum Zamanı", "Sand Time", "Sandzeit", "Tiempo de arena", "Temps de sable", "Tempo de areia", "Время песка"),
    N("Fildişi göğün altında kum tepelerine akan dev bir kum saati.", "A giant hourglass pouring onto sand dunes under an ivory sky.", "Eine riesige Sanduhr, die unter elfenbeinfarbenem Himmel auf Sanddünen rinnt.", "Un reloj de arena gigante que se vierte sobre dunas bajo un cielo marfil.", "Un sablier géant qui se déverse sur des dunes sous un ciel ivoire.", "Uma ampulheta gigante derramando sobre dunas sob um céu marfim.", "Огромные песочные часы сыплют песок на дюны под небом цвета слоновой кости."),
    () => {
      const s = sky("s", [[0, "#e8cf9a"], [0.6, "#fff3dc"], [1, "#fff8e8"]]);
      const hx = 450;
      const hg = `<g transform='translate(${hx} 92)'><rect x='-46' y='-80' width='92' height='10' rx='4' fill='url(#br)'/><rect x='-46' y='68' width='92' height='10' rx='4' fill='url(#br)'/><path d='M-40 -70V70M40 -70V70' stroke='#9c7a4a' stroke-width='4'/><path d='M-34 -70H34C34 -30 6 -12 4 0C6 12 34 30 34 70H-34C-34 30 -6 12 -4 0C-6 -12 -34 -30 -34 -70Z' fill='#fffdf6' fill-opacity='.45' stroke='#9c7a4a' stroke-width='2'/><path d='M-24 -50H24L0 -4Z' fill='url(#sd)'/><path d='M0 -4V60' stroke='#c89a5a' stroke-width='2' stroke-dasharray='4 3'><animate attributeName='stroke-dashoffset' from='0' to='-14' dur='.8s' repeatCount='8'/></path><path d='M-30 68Q0 34 30 68Z' fill='url(#sd)'/><path d='M-26 -66C-20 -40 -10 -24 -4 -14' stroke='#fff' stroke-opacity='.7' stroke-width='3' fill='none'/></g>`;
      const body = s.b + `<circle cx='${hx}' cy='92' r='120' fill='url(#g)'/>` + `<path d='${hills(150, [[10, 300, 1], [4, 90, 2]])}' fill='#d8b880'/>` + hg + `<path d='${hills(170, [[8, 260, 2.4]])}' fill='#c89a5a'/><path d='${hills(188, [[6, 220, 4]])}' fill='#9c7a4a'/>` + scatter(3, 30, (r) => `<circle cx='${f(r() * 600)}' cy='${f(150 + r() * 50)}' r='${f(0.5 + r())}' fill='#fff8e8' opacity='.6'/>`);
      return bannerDoc(s.d + glow("g", "#fff", 0.6) + lg("br", ["#f2dca0", "#9c7a4a", "#4a3418"], 0, 0, 0, 1) + lg("sd", ["#f2dca0", "#c89a5a"]), body, 0.2);
    });
  piece(K, "profile_badge", "rare", 260,
    N("Kum Saati", "Hourglass", "Sanduhr", "Reloj de arena", "Sablier", "Ampulheta", "Песочные часы"),
    N("Fildişi sekizgende akan kumlu bir saat.", "An hourglass with running sand on an ivory octagon.", "Eine Sanduhr mit rinnendem Sand auf elfenbeinfarbenem Achteck.", "Un reloj de arena con arena que cae sobre un octógono marfil.", "Un sablier au sable qui coule sur un octogone ivoire.", "Uma ampulheta com areia correndo em um octógono marfim.", "Песочные часы с текущим песком на восьмиугольнике цвета слоновой кости."),
    () => badgeArt("octagon", ["#fffdf6", "#e8cf9a", "#4a3418"], null, "#fff", { ring: "#9c7a4a", glyphSvg: `<rect x='7' y='4.6' width='10' height='2' rx='.8' fill='#4a3418'/><rect x='7' y='17.4' width='10' height='2' rx='.8' fill='#4a3418'/><path d='M8 6.6H16C16 10 13 11 12.6 12C13 13 16 14 16 17.4H8C8 14 11 13 11.4 12C11 11 8 10 8 6.6Z' fill='#fff8e8' stroke='#4a3418' stroke-width='1'/><path d='M9.6 8H14.4L12 11Z' fill='#c89a5a'/><path d='M9.4 16.6H14.6L12 14.2Z' fill='#c89a5a'/>` }));
}

// ================================================================ 13. Fırtına Çekirdeği / Storm Core
{
  const K = "firtina-cekirdegi";
  piece(K, "avatar_frame", "mythic", 980,
    N("Fırtına Çekirdeği", "Storm Core", "Sturmkern", "Núcleo de tormenta", "Cœur de tempête", "Núcleo da tempestade", "Ядро бури"),
    N("Halkayı saran koyu fırtına bulutları; aralarından şimşek yayları çakar.", "Dark storm clouds coiling around the ring, with arcs of lightning flashing between them.", "Dunkle Sturmwolken umschlingen den Ring, dazwischen zucken Blitzbögen.", "Nubes de tormenta oscuras rodean el aro y entre ellas destellan arcos de rayo.", "De sombres nuages d'orage enserrent l'anneau, traversés d'arcs d'éclairs.", "Nuvens escuras de tempestade envolvem o aro, com arcos de raios entre elas.", "Тёмные грозовые тучи обвивают кольцо, между ними вспыхивают дуги молний."),
    () => {
      const defs = rg("cl", ["#7a8ab0", "#3b4a6b", "#141a2a"], 0.4, 0.3, 0.8) + blur("b", 2) + metalGrad("m", "steel");
      const puffs = scatter(13, 22, (r, i) => { const a = i * (360 / 22) + r() * 6; const [x, y] = pol(87 + r() * 4, a); return `<circle cx='${x}' cy='${y}' r='${f(6 + r() * 5)}' fill='url(#cl)'/>`; });
      const arcPath = (a0, a1, seed) => { const r = rnd(seed); let d = ""; for (let a = a0, k = 0; a <= a1; a += 5, k++) d += (k ? "L" : "M") + pol(84 + (r() - 0.5) * 9, a).join(" "); return d; };
      const bolt = (a0, a1, seed, b) => `<g opacity='0'><path d='${arcPath(a0, a1, seed)}' fill='none' stroke='#7aa7ff' stroke-width='4' filter='url(#b)'/><path d='${arcPath(a0, a1, seed)}' fill='none' stroke='#f5f9ff' stroke-width='1.3'/><animate attributeName='opacity' values='0;1;0;.8;0;0' keyTimes='0;.05;.12;.18;.25;1' dur='3s' repeatCount='3' begin='${b}s'/></g>`;
      return frameDoc(defs, band(80, 6, "url(#m)") + `<g>${puffs}<animateTransform attributeName='transform' type='rotate' values='0 100 100;-10 100 100;0 100 100' dur='9s' repeatCount='2'/></g>` + bolt(300, 360, 3, 0) + bolt(100, 160, 5, 1) + bolt(200, 250, 7, 2) + `<path d='M100 8L95 20H101L97 30L107 16H101L105 8Z' fill='#f5f9ff' stroke='#3b4a6b' stroke-width='.8'/>`);
    });
  piece(K, "banner", "legendary", 760,
    N("Fırtına Gözü", "Eye of the Storm", "Auge des Sturms", "Ojo de la tormenta", "Œil de la tempête", "Olho da tempestade", "Око бури"),
    N("Sarmal bulutların ortasında açılan fırtına gözü ve içinden çakan şimşekler.", "The eye of a storm opening amid spiralling clouds, with lightning flashing inside.", "Das Auge eines Sturms öffnet sich inmitten spiralförmiger Wolken, darin zucken Blitze.", "El ojo de la tormenta se abre entre nubes en espiral con relámpagos dentro.", "L'œil d'une tempête s'ouvre au milieu de nuages en spirale, zébré d'éclairs.", "O olho da tempestade se abre entre nuvens em espiral, com raios lá dentro.", "Око бури раскрывается среди закрученных облаков, внутри сверкают молнии."),
    () => {
      const s = sky("s", [[0, "#0a0d14"], [1, "#1a2236"]]);
      const cx = 450, cy = 90;
      let sp = "";
      for (let k = 0; k < 5; k++) { let d = ""; for (let t = 0; t <= 1.001; t += 0.05) { const a = k * 1.256 + t * 4.2, r = 30 + t * 170; d += (t ? "L" : "M") + f(cx + r * Math.cos(a)) + " " + f(cy + r * Math.sin(a) * 0.55); } sp += `<path d='${d}' fill='none' stroke='url(#cl)' stroke-width='${f(26 - k * 3)}' stroke-linecap='round' opacity='.75'/>`; }
      const bolt = `<path d='M${cx - 4} ${cy - 20}L${cx - 14} ${cy + 4}H${cx - 4}L${cx - 12} ${cy + 30}L${cx + 10} ${cy - 4}H${cx}L${cx + 8} ${cy - 20}Z' fill='#f5f9ff'/>`;
      const flash = `<animate attributeName='opacity' values='0;0;1;0;.7;0;0' keyTimes='0;.45;.48;.54;.58;.64;1' dur='3.2s' repeatCount='3'/>`;
      const body = s.b + `<g filter='url(#b)'>${sp}<animateTransform attributeName='transform' type='rotate' values='0 ${cx} ${cy};8 ${cx} ${cy};0 ${cx} ${cy}' dur='10s' repeatCount='2'/></g>` + `<ellipse cx='${cx}' cy='${cy}' rx='34' ry='20' fill='#7aa7ff' opacity='.25'/><ellipse cx='${cx}' cy='${cy}' rx='34' ry='20' fill='#f5f9ff' opacity='0'>${flash}</ellipse><g opacity='0'>${bolt}${flash}</g>` + scatter(5, 50, (r) => `<path d='M${f(r() * 600)} ${f(100 + r() * 100)}l-5 14' stroke='#c8d8ff' stroke-opacity='${f(0.12 + r() * 0.25)}'/>`) + `<path d='${ridge(4, 182, 10, 0.5)}' fill='#06080e'/>`;
      return bannerDoc(s.d + lg("cl", ["#5a6a8a", "#3b4a6b", "#7aa7ff"], 0, 0, 1, 1) + blur("b", 6), body, 0.4);
    });
  piece(K, "profile_badge", "epic", 300,
    N("Şimşek", "Thunderbolt", "Donnerkeil", "Rayo", "Foudre", "Raio", "Молния"),
    N("Koyu çelik altıgende parlayan bir şimşek.", "A blazing thunderbolt on a dark steel hexagon.", "Ein gleißender Blitz auf dunklem Stahlsechseck.", "Un rayo resplandeciente sobre un hexágono de acero oscuro.", "Un éclair flamboyant sur un hexagone d'acier sombre.", "Um raio reluzente em um hexágono de aço escuro.", "Сверкающая молния на тёмном стальном шестиугольнике."),
    () => badgeArt("hex", ["#7aa7ff", "#3b4a6b", "#0a0d14"], "bolt", "#f5f9ff", { ring: "#7aa7ff", glyphStroke: "#0a0d14" }));
}

// ================================================================ 14. Lav Akışı / Lava Flow
{
  const K = "lav-akisi";
  piece(K, "avatar_frame", "mythic", 1000,
    N("Magma Halkası", "Magma Ring", "Magmaring", "Anillo de magma", "Anneau de magma", "Anel de magma", "Магмовое кольцо"),
    N("Kararmış kayadan halka; çatlaklarından erimiş lav nabız gibi atar.", "A ring of blackened rock with molten lava pulsing through its cracks.", "Ein Ring aus geschwärztem Gestein, durch dessen Risse glühende Lava pulsiert.", "Un aro de roca ennegrecida con lava fundida latiendo por sus grietas.", "Un anneau de roche noircie où la lave palpite dans les fissures.", "Um aro de rocha enegrecida com lava derretida pulsando pelas rachaduras.", "Кольцо из почерневшего камня, по трещинам пульсирует лава."),
    () => {
      const defs = metalGrad("m", ["#5a3a34", "#2a1210", "#120404", "#0a0202", "#050101"]) + blur("b", 1.8);
      const r = rnd(29);
      let cr = "";
      for (let i = 0; i < 16; i++) { const a = i * 22.5 + r() * 8; let d = `M${pol(75.5, a).join(" ")}`; let rr = 75.5, aa = a; for (let k = 0; k < 3; k++) { rr += 3.6; aa += (r() - 0.5) * 12; d += `L${pol(rr, aa).join(" ")}`; } cr += d; }
      cr += arc(81, 0, 359.5);
      const drips = [150, 172, 205].map((a, i) => at(87, a, `<path d='M-2 0V${5 + i * 2}A2 2 0 0 0 2 ${5 + i * 2}V0Z' fill='#ff3d00' transform='rotate(180)'/>`)).join("");
      return frameDoc(defs, band(81, 12, "url(#m)", { specOpacity: 0.25 }) + `<g filter='url(#b)'><path d='${cr}' fill='none' stroke='#ff3d00' stroke-width='3.4' stroke-linecap='round'/>${breathe(2.2, 3, ".4")}</g><path d='${cr}' fill='none' stroke='#ffb000' stroke-width='1.1' stroke-linecap='round'/>` + drips + scatter(8, 8, (rr2) => { const [x, y] = pol(90 + rr2() * 8, rr2() * 360); return `<circle cx='${x}' cy='${y}' r='1.2' fill='#ffb000'>${pulse("opacity", "0;1;0", f(1.4 + rr2()), 3, f(rr2() * 2))}</circle>`; }));
    });
  piece(K, "banner", "legendary", 780,
    N("Lav Nehri", "Lava River", "Lavastrom", "Río de lava", "Rivière de lave", "Rio de lava", "Лавовая река"),
    N("Duman tüten bir yanardağ ve kararmış kayalar arasından kıvrılan lav nehri.", "A smoking volcano and a lava river winding between blackened rocks.", "Ein rauchender Vulkan und ein Lavastrom, der sich zwischen schwarzem Gestein windet.", "Un volcán humeante y un río de lava que serpentea entre rocas ennegrecidas.", "Un volcan fumant et une rivière de lave qui serpente entre des roches noircies.", "Um vulcão fumegante e um rio de lava serpenteando entre rochas enegrecidas.", "Дымящийся вулкан и лавовая река, петляющая между чёрных скал."),
    () => {
      const s = sky("s", [[0, "#120404"], [0.6, "#3a0a06"], [1, "#7a1a06"]]);
      const river = `M600 200C540 180 520 160 470 150C430 142 400 120 380 104L360 104C380 128 410 150 440 162C490 180 520 196 540 205Z`;
      const smoke = scatter(3, 6, (r, i) => `<circle cx='${f(370 + r() * 20)}' cy='${f(50 - i * 10)}' r='${f(14 + i * 4)}' fill='#3a2a2a' opacity='.5'><animate attributeName='cy' values='${f(50 - i * 10)};${f(30 - i * 10)}' dur='6s' repeatCount='2'/></circle>`);
      const body = s.b + `<circle cx='370' cy='90' r='120' fill='url(#g)'/>` + `<g filter='url(#b)'>${smoke}</g>` + `<path d='M240 200L330 96Q370 86 410 96L520 200Z' fill='#1a0806'/><path d='M346 98Q370 92 394 98L382 112Q370 108 358 112Z' fill='#ff3d00'/>` + `<g filter='url(#b2)'><path d='${river}' fill='#ff3d00'/>${breathe(2.4, 3, ".55")}</g><path d='${river}' fill='url(#lv)'/>` + `<path d='M0 200V176C80 166 180 180 260 172L300 200Z' fill='#0a0202'/><path d='M560 140L600 120V200H540Z' fill='#0a0202'/>` + scatter(5, 18, (r) => { const x = 360 + r() * 220, y = 120 + r() * 80; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(0.8 + r() * 1.2)}' fill='#ffb000'><animate attributeName='cy' values='${f(y)};${f(y - 40)}' dur='${f(2 + r() * 2)}s' repeatCount='3'/><animate attributeName='opacity' values='1;0' dur='${f(2 + r() * 2)}s' repeatCount='3'/></circle>`; });
      return bannerDoc(s.d + glow("g", "#ff3d00", 0.35) + blur("b", 8) + blur("b2", 5) + lg("lv", ["#ffb000", "#ff3d00", "#a8100a"], 0, 0, 1, 0), body, 0.4);
    });
  piece(K, "profile_badge", "epic", 320,
    N("Magma", "Magma", "Magma", "Magma", "Magma", "Magma", "Магма"),
    N("Kızıl damlada akkor bir alev.", "A white-hot flame on a crimson drop.", "Eine weißglühende Flamme auf karmesinrotem Tropfen.", "Una llama al rojo blanco sobre una gota carmesí.", "Une flamme chauffée à blanc sur une goutte cramoisie.", "Uma chama incandescente em uma gota carmesim.", "Раскалённое добела пламя на багровой капле."),
    () => badgeArt("drop", ["#ffb000", "#ff3d00", "#120404"], "flame", "#fff6c0", { ring: "#ffb000", glyphStroke: "#5a0e0e" }));
}

// ================================================================ 15. İnci Kıyısı / Pearl Shore
{
  const K = "inci-kiyisi";
  piece(K, "avatar_frame", "legendary", 860,
    N("İnci Dizisi", "Pearl Strand", "Perlenschnur", "Hilo de perlas", "Rang de perles", "Fio de pérolas", "Нить жемчуга"),
    N("İnci dizili bir halka, altta açık bir istiridye ve köpük; inciler ışıldar.", "A ring strung with pearls, an open shell and sea foam below; the pearls shimmer.", "Ein Ring aus aufgereihten Perlen, unten eine offene Muschel und Gischt; die Perlen schimmern.", "Un aro ensartado de perlas, una concha abierta y espuma abajo; las perlas brillan.", "Un anneau de perles enfilées, un coquillage ouvert et de l'écume en bas ; les perles chatoient.", "Um aro de pérolas enfileiradas, uma concha aberta e espuma embaixo; as pérolas cintilam.", "Кольцо из нанизанного жемчуга, внизу раскрытая раковина и пена; жемчуг переливается."),
    () => {
      const defs = rg("pl", [[0, "#ffffff"], [0.4, "#f1e9e1"], [0.8, "#d8c8d0"], [1, "#8a9aa8"]], 0.35, 0.3, 0.75) + rg("pk", [[0, "#ffffff"], [0.5, "#ffd8e4"], [1, "#a88a9a"]], 0.35, 0.3, 0.75) + lg("sh", ["#fff4f8", "#ffd8e4", "#b8a0aa"], 0, 0, 0, 1);
      let p = "";
      for (let i = 0; i < 30; i++) { const a = i * 12; if (a > 150 && a < 210) continue; const [x, y] = pol(81, a); p += `<circle cx='${x}' cy='${y}' r='${i % 5 === 0 ? 4.6 : 3.6}' fill='url(#${i % 5 === 0 ? "pk" : "pl"})' stroke='#6b8a9a' stroke-width='.4'/>`; }
      const shell = `<g transform='translate(100 182)'><path d='M-20 0C-18 -14 18 -14 20 0Z' fill='url(#sh)' stroke='#6b8a9a' stroke-width='.8'/>${[-14, -7, 0, 7, 14].map((x) => `<path d='M0 0L${x} -10' stroke='#b8a0aa' stroke-width='.7'/>`).join("")}<path d='M-20 0C-14 10 14 10 20 0Z' fill='url(#sh)' stroke='#6b8a9a' stroke-width='.8'/><circle cy='-2' r='5.4' fill='url(#pk)'/></g>`;
      const foam = `<g fill='#fff' opacity='.85'>${scatter(5, 14, (r) => { const [x, y] = pol(90 + r() * 6, 140 + r() * 80); return `<circle cx='${x}' cy='${y}' r='${f(1.4 + r() * 2.4)}'/>`; })}</g>`;
      const sh = [[35, 40], [165, 40], [180, 110]].map(([x, y], i) => `<path d='${sparkle(4)}' transform='translate(${x} ${y})' fill='#fff' opacity='.2'>${pulse("opacity", ".2;1;.2", 2.2, 3, i * 0.7)}</path>`).join("");
      return frameDoc(defs, circ(81, "#6b8a9a", 1, " stroke-opacity='.6'") + p + foam + shell + sh);
    });
  piece(K, "banner", "epic", 680,
    N("İnci Kıyısı", "Pearl Shore", "Perlenküste", "Costa de perlas", "Rivage nacré", "Costa das pérolas", "Жемчужный берег"),
    N("Şafakta sedef renkli kıyı: köpüklü dalgalar, deniz kabukları ve inci ışığı.", "A nacre shore at dawn: foamy waves, seashells and pearly light.", "Eine perlmuttfarbene Küste im Morgengrauen: schäumende Wellen, Muscheln und Perlenlicht.", "Una costa nacarada al alba: olas espumosas, conchas y luz de perla.", "Un rivage nacré à l'aube : vagues écumeuses, coquillages et lumière de perle.", "Uma costa perolada ao amanhecer: ondas espumantes, conchas e luz de pérola.", "Перламутровый берег на рассвете: пенные волны, ракушки и жемчужный свет."),
    () => {
      const s = sky("s", [[0, "#b8c8d8"], [0.55, "#f1e9e1"], [1, "#ffd8e4"]]);
      const wave = (y, c, op, dur, ph) => `<g><path d='${hills(y, [[4, 120, ph], [2, 50, ph * 2]], 210, 10)}' fill='${c}' opacity='${op}'/><animateTransform attributeName='transform' type='translate' values='0 0;-12 3;0 0' dur='${dur}s' repeatCount='3'/></g>`;
      const shell = (x, y, s, rot) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'><path d='M0 8L-10 -2C-8 -10 8 -10 10 -2Z' fill='url(#sl)' stroke='#9a8a9a' stroke-width='.8'/>${[-6, -3, 0, 3, 6].map((xx) => `<path d='M0 8L${xx} -8' stroke='#b8a0aa' stroke-width='.6'/>`).join("")}</g>`;
      const body = s.b + `<circle cx='460' cy='70' r='100' fill='url(#g)'/><circle cx='460' cy='72' r='18' fill='#fff8f8'/>` + `<rect y='110' width='600' height='40' fill='#9ab4c4'/>` + wave(118, "#c8dce6", 0.9, 6, 1) + wave(132, "#e6f0f4", 0.9, 7, 2) + `<path d='M0 200V150C100 142 220 150 320 146S500 140 600 146V200Z' fill='url(#sd)'/>` + `<g fill='#fff'>${cloudBand(4, 148, 4, 8, -20, 620, 3, false)}</g>` + shell(380, 170, 1.4, -10) + shell(470, 182, 1.1, 20) + shell(540, 166, 0.9, -30) + `<circle cx='420' cy='180' r='4' fill='url(#pk)'/>` + scatter(4, 10, (r) => `<path d='${sparkle(f(2 + r() * 3))}' transform='translate(${f(300 + r() * 300)} ${f(100 + r() * 60)})' fill='#fff' opacity='${f(0.5 + r() * 0.5)}'/>`);
      return bannerDoc(s.d + glow("g", "#fff", 0.7) + lg("sd", ["#f1e9e1", "#e0ccd0"]) + lg("sl", ["#fff4f8", "#ffd8e4", "#b8a0aa"], 0, 0, 0, 1) + rg("pk", [[0, "#ffffff"], [0.5, "#ffd8e4"], [1, "#a88a9a"]], 0.35, 0.3, 0.75), body, 0.15);
    });
  piece(K, "profile_badge", "rare", 260,
    N("İstiridye", "Oyster", "Auster", "Ostra", "Huître", "Ostra", "Устрица"),
    N("Sedef yuvarlakta incisini gösteren bir istiridye.", "An oyster showing its pearl on a nacre disc.", "Eine Auster, die ihre Perle zeigt, auf Perlmuttscheibe.", "Una ostra que muestra su perla sobre un disco de nácar.", "Une huître qui dévoile sa perle sur un disque de nacre.", "Uma ostra mostrando sua pérola em um disco de madrepérola.", "Устрица с жемчужиной на перламутровом круге."),
    () => badgeArt("circle", ["#ffffff", "#c8d4dc", "#3a4a58"], null, "#fff", { ring: "#ffd8e4", glyphSvg: `<path d='M4.6 13C5.4 7.6 18.6 7.6 19.4 13Z' fill='#fff4f8' stroke='#3a4a58' stroke-width='.9'/><path d='M12 13L8 9M12 13L10.6 8.4M12 13L13.4 8.4M12 13L16 9' stroke='#b8a0aa' stroke-width='.7'/><path d='M4.6 13C6 18 18 18 19.4 13Z' fill='#e6dce0' stroke='#3a4a58' stroke-width='.9'/><circle cx='12' cy='13.6' r='2.6' fill='#fff' stroke='#a88a9a' stroke-width='.6'/><circle cx='11.2' cy='12.8' r='.8' fill='#fff' />` }));
}

// ================================================================ 16. Yıldız Tozu / Stardust
{
  const K = "yildiz-tozu";
  piece(K, "avatar_frame", "mythic", 1000,
    N("Yıldız Tozu", "Stardust Ring", "Sternenstaubring", "Anillo de polvo estelar", "Anneau de poussière d'étoiles", "Anel de poeira estelar", "Кольцо звёздной пыли"),
    N("Galaksi tozundan bir halka; altın kıvılcımlar dolanır, yıldızlar parıldar.", "A ring of galaxy dust where golden sparks circle and stars glitter.", "Ein Ring aus Galaxienstaub, um den goldene Funken kreisen und Sterne glitzern.", "Un aro de polvo de galaxia donde giran chispas doradas y brillan estrellas.", "Un anneau de poussière de galaxie où tournent des étincelles d'or et scintillent des étoiles.", "Um aro de poeira de galáxia onde faíscas douradas giram e estrelas cintilam.", "Кольцо из галактической пыли, по нему кружат золотые искры и мерцают звёзды."),
    () => {
      const defs = rgU("dust", [[0.74, "#05030f", 0], [0.77, "#2b1f6e", 0.9], [0.84, "#6a4ad0", 0.8], [0.9, "#2b1f6e", 0.6], [0.96, "#05030f", 0]], 100, 100, 100) + blur("b", 1.4);
      const r = rnd(41);
      let dots = "";
      for (let i = 0; i < 70; i++) { const [x, y] = pol(76 + r() * 16, r() * 360); dots += `<circle cx='${x}' cy='${y}' r='${f(0.3 + r() * 0.9)}' fill='${r() > 0.7 ? "#ffe9a8" : "#c6b7ff"}' opacity='${f(0.5 + r() * 0.5)}'/>`; }
      const sparks = `<g>${[0, 120, 240].map((a) => at(83, a, `<path d='${sparkle(4.4)}' fill='#ffe9a8'/><circle r='4' fill='#ffe9a8' opacity='.35' filter='url(#b)'/>`, 1, true)).join("")}${spin(14, 2)}</g>`;
      const tw = [[30, 70], [170, 60], [100, 196], [60, 170], [150, 20]].map(([x, y], i) => `<path d='${sparkle(3.2)}' transform='translate(${x} ${y})' fill='#fff'>${pulse("opacity", "1;.15;1", 1.8 + i * 0.3, 3, i * 0.4)}</path>`).join("");
      return frameDoc(defs, `<circle cx='100' cy='100' r='96' fill='url(#dust)'/>` + `<g>${dots}<animateTransform attributeName='transform' type='rotate' values='0 100 100;30 100 100' dur='24s' repeatCount='1' fill='freeze'/></g>` + circ(76, "#c6b7ff", 1, " stroke-opacity='.8'") + circ(90.5, "#ffe9a8", 0.7, " stroke-opacity='.5' stroke-dasharray='1 4'") + sparks + tw);
    });
  piece(K, "banner", "legendary", 800,
    N("Yıldız Tozu", "Stardust Sky", "Sternenstaubhimmel", "Cielo de polvo estelar", "Ciel de poussière d'étoiles", "Céu de poeira estelar", "Небо звёздной пыли"),
    N("Gökyüzünü çapraz kesen ışıltılı bir galaksi kuşağı ve altın yıldız kümeleri.", "A glittering galaxy band slicing across the sky, with clusters of golden stars.", "Ein glitzerndes Galaxienband quer über den Himmel, dazu goldene Sternhaufen.", "Una banda de galaxia brillante que cruza el cielo, con cúmulos de estrellas doradas.", "Une bande de galaxie scintillante qui traverse le ciel, avec des amas d'étoiles dorées.", "Uma faixa de galáxia cintilante cruzando o céu, com aglomerados de estrelas douradas.", "Сверкающая полоса галактики пересекает небо, рядом золотые звёздные скопления."),
    () => {
      const s = sky("s", [[0, "#05030f"], [1, "#140c38"]]);
      const band_ = `<g filter='url(#b)'><path d='M120 210Q330 80 600 0' stroke='url(#gb)' stroke-width='90' fill='none' opacity='.55'/><path d='M200 200Q380 90 600 20' stroke='#c6b7ff' stroke-width='26' fill='none' opacity='.35'/></g>`;
      const dense = scatter(17, 120, (r) => { const t = r(), x = 120 + t * 480, y = 200 - t * 190 + (r() - 0.5) * 60; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(0.4 + r() * 1.1)}' fill='${r() > 0.75 ? "#ffe9a8" : "#fff"}' opacity='${f(0.4 + r() * 0.6)}'/>`; });
      const body = s.b + stars(3, 60, [0, 0, 600, 200], ["#c6b7ff", "#fff"], 0.9) + band_ + dense + twinkles(5, 10, [260, 10, 330, 170], "#ffe9a8", 2.2, 3) + `<path d='${sparkle(9)}' transform='translate(470 56)' fill='#fff'/><circle cx='470' cy='56' r='14' fill='#ffe9a8' opacity='.3' filter='url(#b2)'/>`;
      return bannerDoc(s.d + lg("gb", [[0, "#2b1f6e", 0], [0.4, "#6a4ad0"], [0.6, "#c6b7ff"], [0.8, "#ffe9a8", 0.6], [1, "#2b1f6e", 0]], 0, 1, 1, 0) + blur("b", 16) + blur("b2", 4), body, 0.35);
    });
  piece(K, "profile_badge", "epic", 320,
    N("Yıldız Kümesi", "Star Cluster", "Sternhaufen", "Cúmulo estelar", "Amas d'étoiles", "Aglomerado estelar", "Звёздное скопление"),
    N("Gece moru yıldız biçiminde altın bir yıldız kümesi.", "A golden star cluster on a night violet star.", "Ein goldener Sternhaufen auf nachtviolettem Stern.", "Un cúmulo de estrellas doradas sobre una estrella violeta noche.", "Un amas d'étoiles dorées sur une étoile violet nuit.", "Um aglomerado de estrelas douradas em uma estrela violeta-noite.", "Золотое звёздное скопление на ночной фиолетовой звезде."),
    () => badgeArt("star", ["#c6b7ff", "#2b1f6e", "#05030f"], null, "#fff", { ring: "#ffe9a8", glyphSvg: `<path d='${sparkle(3.4)}' transform='translate(12 13)' fill='#ffe9a8'/><path d='${sparkle(1.8)}' transform='translate(9.4 10.4)' fill='#fff'/><path d='${sparkle(1.6)}' transform='translate(14.8 15.4)' fill='#fff'/>` }));
}

module.exports = { SET_PIECES, piece, sky, glow, breathe };
