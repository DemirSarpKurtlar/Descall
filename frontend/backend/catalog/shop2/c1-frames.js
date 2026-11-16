"use strict";
// Market 2.0 C1: single (non-set) avatar frames. See c1-lib.js for the geometry contract.
const L = require("./c1-lib");
const { f, rnd, lg, rg, lgU, rgU, blur, metalGrad, pol, arc, annulus, circ, band, around, at, gemDefs, cabDefs, sparkle, star5, poly, leaf, petal, blade, spin, pulse, frameDoc } = L;

/** name/description helper: N(tr, en, de, es, fr, ptBR, ru). */
const N = (tr, en, de, es, fr, pt, ru) => ({ tr, en, de, es, fr, "pt-BR": pt, ru });

const FRAMES = [];
const add = (slug, rarity, price, anim, name, desc, art, tags = []) => FRAMES.push({ slug, rarity, price, anim, name, desc, art, tags });

// ---------------------------------------------------------------- common
add("cobalt-bevel", "common", 180, false,
  N("Kobalt Kenar", "Cobalt Bevel", "Kobaltkante", "Bisel cobalto", "Biseau cobalt", "Bisel cobalto", "Кобальтовая грань"),
  N("Derin mavi, eğimli metal halka ve sekiz perçin.", "A deep blue bevelled metal ring with eight rivets.", "Ein tiefblauer, abgeschrägter Metallring mit acht Nieten.", "Un aro metálico azul intenso, biselado y con ocho remaches.", "Un anneau de métal bleu profond, biseauté, à huit rivets.", "Um aro de metal azul profundo, chanfrado, com oito rebites.", "Глубокий синий скошенный металлический обод с восемью заклёпками."),
  () => {
    const defs = metalGrad("m", ["#eaf2ff", "#8fb0ff", "#2f55c9", "#14246a", "#070e2a"]) +
      rg("r", [[0, "#fff"], [0.5, "#c5d3f5"], [1, "#3a4a7a"]], 0.35, 0.3, 0.7) +
      `<circle id='v' cx='100' cy='20' r='2.4' fill='url(#r)' stroke='#0a1440' stroke-width='.7'/>`;
    return frameDoc(defs, band(80, 9.5, "url(#m)") + around("v", 8, 22.5) +
      circ(89, "#8fb0ff", 1.4, " stroke-dasharray='.1 4.6' stroke-linecap='round' stroke-opacity='.85'") + circ(91.5, "#2f55c9", 0.8, " stroke-opacity='.6'"));
  });

// ---------------------------------------------------------------- rare
add("laurel-crown", "rare", 420, false,
  N("Defne Tacı", "Laurel Crown", "Lorbeerkranz", "Corona de laurel", "Couronne de laurier", "Coroa de louros", "Лавровый венец"),
  N("İki yandan yükselen altın defne dalları, altta kurdele.", "Golden laurel branches rising on both sides, tied with a ribbon.", "Goldene Lorbeerzweige auf beiden Seiten, unten mit einer Schleife gebunden.", "Ramas de laurel doradas a ambos lados, atadas con una cinta.", "Des branches de laurier dorées de chaque côté, nouées d'un ruban.", "Ramos de louro dourados dos dois lados, presos por uma fita.", "Золотые лавровые ветви с двух сторон, перевязанные лентой."),
  () => {
    const defs = metalGrad("m", "gold") + lg("l", ["#fff4bf", "#f0bf45", "#9a6510"], 0, 0, 1, 1) + lg("k", ["#9b1c2c", "#e2475a", "#7a0f1d"], 0, 0, 1, 0) +
      `<g id='lf'><path d='${leaf(13, 4.4)}' fill='url(#l)' stroke='#6b4207' stroke-width='.6'/><path d='M0 -1V-11' stroke='#8a5a10' stroke-width='.6' stroke-opacity='.8'/></g>`;
    let leaves = `<path d='${arc(86, 188, 336)}' fill='none' stroke='#8a5a10' stroke-width='1.6'/><path d='${arc(86, 24, 172)}' fill='none' stroke='#8a5a10' stroke-width='1.6'/>`;
    for (let i = 0; i < 16; i++) {
      const d = 190 + i * 9.4, sc = 1 - i * 0.025;
      leaves += at(87.5, d, `<use href='#lf' transform='rotate(52) scale(${f(sc * 100) / 100})'/>`) + at(84.5, d + 4, `<use href='#lf' transform='rotate(128) scale(${f(sc * 90) / 100})'/>`);
      leaves += at(87.5, 360 - d, `<use href='#lf' transform='rotate(-52) scale(${f(sc * 100) / 100})'/>`) + at(84.5, 356 - d, `<use href='#lf' transform='rotate(-128) scale(${f(sc * 90) / 100})'/>`);
    }
    for (const d of [215, 250, 290, 145, 110, 70]) leaves += at(91, d, `<circle r='2' fill='#e2475a' stroke='#6e0d1a' stroke-width='.6'/><circle cx='-.6' cy='-.6' r='.6' fill='#fff' fill-opacity='.8'/>`);
    const ribbon = `<path d='M100 185L84 199L88 189L78 186L94 180Z M100 185L116 199L112 189L122 186L106 180Z' fill='url(#k)' stroke='#5a0a14' stroke-width='.8'/><circle cx='100' cy='183' r='5' fill='url(#k)' stroke='#5a0a14' stroke-width='.8'/>`;
    return frameDoc(defs, band(80, 6.5, "url(#m)") + leaves + ribbon);
  });

add("sapphire-setting", "rare", 480, false,
  N("Safir Yuva", "Sapphire Setting", "Saphirfassung", "Engaste de zafiros", "Serti de saphirs", "Cravação de safiras", "Сапфировая оправа"),
  N("Platin halkada dört büyük safir ve aralarında pırlantalar.", "Four large sapphires and small diamonds on a platinum ring.", "Vier große Saphire und kleine Diamanten auf einem Platinring.", "Cuatro grandes zafiros y pequeños diamantes en un aro de platino.", "Quatre grands saphirs et de petits diamants sur un anneau de platine.", "Quatro grandes safiras e pequenos diamantes em um aro de platina.", "Четыре крупных сапфира и мелкие бриллианты на платиновом ободе."),
  () => {
    const defs = metalGrad("m", "platinum") + gemDefs("s", "#9fd0ff", "#1f5bd8", "#0a1f66") + gemDefs("d", "#ffffff", "#cfe6ff", "#6f86a8");
    let g = "";
    for (const d of [45, 135, 225, 315]) g += at(83.5, d, `<path d='M-7 4L0 -9L7 4' fill='none' stroke='#dfe6f2' stroke-width='1.6'/><use href='#s' transform='scale(1.55)'/>`);
    for (let i = 0; i < 12; i++) { const d = i * 30 + 15; if (d % 90 === 45) continue; g += at(84, d, `<use href='#d' transform='scale(.62)'/>`); }
    return frameDoc(defs, band(80, 6, "url(#m)") + band(87.5, 2.2, "url(#m)", { spec: false, shadowOpacity: 0.3 }) + g);
  });

// ---------------------------------------------------------------- epic (animated)
add("solar-corona", "epic", 720, true,
  N("Güneş Tacı", "Solar Corona", "Sonnenkorona", "Corona solar", "Couronne solaire", "Coroa solar", "Солнечная корона"),
  N("Erimiş altın halkanın çevresinde yavaşça dönen güneş ışınları.", "Sun rays slowly turning around a molten gold ring.", "Sonnenstrahlen, die sich langsam um einen Ring aus flüssigem Gold drehen.", "Rayos de sol que giran despacio alrededor de un aro de oro fundido.", "Des rayons de soleil tournant lentement autour d'un anneau d'or en fusion.", "Raios de sol girando devagar em volta de um aro de ouro derretido.", "Солнечные лучи медленно вращаются вокруг кольца из расплавленного золота."),
  () => {
    const defs = rgU("ray", [[0.74, "#fff6c2"], [0.86, "#ffb62e"], [1, "#ff5a1f", 0]], 100, 100, 100) +
      rgU("glow", [[0.7, "#ffcf4a", 0], [0.8, "#ffb02e", 0.55], [1, "#ff6a1f", 0]], 100, 100, 100) +
      lgU("m", [[0, "#fffbe0"], [0.3, "#ffd34a"], [0.55, "#e0731c"], [0.8, "#ffc23a"], [1, "#9a3a0c"]], 20, 20, 180, 180) +
      `<path id='a' d='M100 1L103.6 16H96.4Z' fill='url(#ray)'/><path id='b' d='M100 8L102.2 17H97.8Z' fill='url(#ray)'/>`;
    let rays = "";
    for (let i = 0; i < 16; i++) rays += `<use href='#a' transform='rotate(${i * 22.5} 100 100)'/><use href='#b' transform='rotate(${i * 22.5 + 11.25} 100 100)'/>`;
    const flares = [30, 160, 255].map((d) => at(80, d, `<path d='${sparkle(5.5, 0.18)}' fill='#fffbe0'>${pulse("opacity", "1;.2;1", 2.6, 3, d / 100)}</path>`)).join("");
    return frameDoc(defs, `<circle cx='100' cy='100' r='96' fill='url(#glow)'>${pulse("opacity", "1;.55;1", 4, 3)}</circle><g>${rays}${spin(24, 1)}</g>` + band(80, 9, "url(#m)", { lip: "#fff3b0" }) + circ(80, "#fff6c2", 1.2, " stroke-dasharray='2 6' stroke-opacity='.7'") + flares);
  }, ["animated"]);

// ---------------------------------------------------------------- legendary
add("royal-regalia", "legendary", 1350, true,
  N("Kraliyet Nişanı", "Royal Regalia", "Kroninsignien", "Regalía real", "Régalia royale", "Regalia real", "Королевские регалии"),
  N("Mücevherli altın taç ve yakut, safir, zümrüt dizili halka; taşlar ışıldar.", "A jewelled gold crown over a ring of rubies, sapphires and emeralds that catch the light.", "Eine juwelenbesetzte Goldkrone über einem Ring aus Rubinen, Saphiren und Smaragden, die im Licht funkeln.", "Una corona de oro enjoyada sobre un aro de rubíes, zafiros y esmeraldas que destellan.", "Une couronne d'or sertie au-dessus d'un anneau de rubis, saphirs et émeraudes qui scintillent.", "Uma coroa de ouro cravejada sobre um aro de rubis, safiras e esmeraldas que cintilam.", "Золотая корона с самоцветами над ободом из рубинов, сапфиров и изумрудов, ловящих свет."),
  () => {
    const defs = metalGrad("m", "gold") + lgU("cr", [[0, "#fff6cf"], [0.35, "#ffd24a"], [0.7, "#c07f12"], [1, "#6a3c05"]], 70, 0, 130, 30) +
      cabDefs("ru", "#ff9aa5", "#d0142c", "#4a0410", 3.4) + cabDefs("sa", "#a8cfff", "#1f55d6", "#081a55", 3.4) + cabDefs("em", "#a8ffd0", "#119a55", "#03381c", 3.4) + gemDefs("dg", "#ffffff", "#d8ecff", "#6f86a8");
    let gems = "";
    const ids = ["ru", "sa", "em"];
    for (let i = 0; i < 12; i++) { const d = i * 30 + 15; if (d > 330 || d < 30) continue; gems += at(80, d, `<use href='#${ids[i % 3]}'/>`, 1, true); }
    const crown = `<path d='M68 30L64 9L78 19L88 3L100 15L112 3L122 19L136 9L132 30Q100 22 68 30Z' fill='url(#cr)' stroke='#5a3304' stroke-width='1.1' stroke-linejoin='round'/>` +
      `<path d='M68 30Q100 22 132 30' fill='none' stroke='#fff6cf' stroke-width='1.2' stroke-opacity='.8'/>` +
      [[64, 9], [88, 3], [112, 3], [136, 9]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.6' fill='#fff2c0' stroke='#5a3304' stroke-width='.8'/>`).join("") +
      `<use href='#ru' transform='translate(100 18) scale(1.15)'/><use href='#sa' transform='translate(82 22) scale(.75)'/><use href='#em' transform='translate(118 22) scale(.75)'/>`;
    const glints = [[100, 12], [68, 70], [140, 150], [40, 130]].map(([x, y], i) => `<path d='${sparkle(6, 0.16)}' transform='translate(${x} ${y})' fill='#fff' opacity='0'>${pulse("opacity", "0;1;0", 1.6, 3, i * 0.9)}</path>`).join("");
    return frameDoc(defs, band(80, 8.5, "url(#m)") + circ(85.6, "#7a4a0c", 1.1, " stroke-opacity='.8'") + circ(86.6, "#ffd76a", 0.8) + gems + crown + at(96, 180, `<use href='#dg' transform='rotate(180) scale(1.1)'/>`) + glints);
  }, ["animated"]);

add("archangel", "legendary", 1450, true,
  N("Başmelek", "Archangel", "Erzengel", "Arcángel", "Archange", "Arcanjo", "Архангел"),
  N("Işık halesinin iki yanında hafifçe kanat çırpan beyaz altın kanatlar.", "White-gold wings softly beating on either side of a halo of light.", "Weißgoldene Flügel, die zu beiden Seiten eines Lichtscheins sanft schlagen.", "Alas de oro blanco que aletean suavemente a ambos lados de un halo de luz.", "Des ailes d'or blanc battant doucement de part et d'autre d'un halo de lumière.", "Asas de ouro branco batendo de leve dos dois lados de um halo de luz.", "Бело-золотые крылья мягко взмахивают по обе стороны светящегося нимба."),
  () => {
    const defs = metalGrad("m", "platinum") + lg("fw", ["#ffffff", "#f3ecd8", "#c9b27a"], 0, 0, 0, 1) + lg("fw2", ["#ffffff", "#e8eefc", "#a9b6d6"], 0, 0, 0, 1) +
      rgU("h", [[0.72, "#fff3c4", 0], [0.82, "#fff3c4", 0.6], [0.95, "#ffd36a", 0]], 100, 100, 100) +
      `<path id='fe' d='${petal(17, 3.8)}' fill='url(#fw)' stroke='#8d7a4c' stroke-width='.6'/><path id='fs' d='${petal(12, 3.2)}' fill='url(#fw2)' stroke='#7c88a8' stroke-width='.6'/>`;
    const wing = (dir) => {
      const m = (d) => (dir < 0 ? d : 360 - d);
      let s = "";
      for (let i = 0; i < 10; i++) { const d = 232 + i * 9; s += blade(pol(83, m(d)), pol(95 + i * 0.4, m(d + 17)), 4, "url(#fw)", " stroke='#8d7a4c' stroke-width='.6'"); }
      for (let i = 0; i < 9; i++) { const d = 236 + i * 9; s += blade(pol(81.5, m(d)), pol(89, m(d + 11)), 3.4, "url(#fw2)", " stroke='#7c88a8' stroke-width='.55'"); }
      const [px, py] = pol(84, m(240));
      return `<g>${s}<animateTransform attributeName='transform' type='rotate' values='0 ${px} ${py};${dir * 3} ${px} ${py};0 ${px} ${py}' dur='2.4s' repeatCount='3'/></g>`;
    };
    return frameDoc(defs, `<circle cx='100' cy='100' r='99' fill='url(#h)'/>` + wing(-1) + wing(1) + band(80, 6.5, "url(#m)", { lip: "#fff6dc" }) + circ(86.5, "#fff3c4", 1.6, " stroke-opacity='.9'") + `<ellipse cx='100' cy='12' rx='26' ry='5' fill='none' stroke='#ffe08a' stroke-width='2.6'/><ellipse cx='100' cy='12' rx='26' ry='5' fill='none' stroke='#fff' stroke-width='.8'/>`);
  }, ["animated"]);

// ---------------------------------------------------------------- more commons
/** Ring of small marks between r1 and r2. */
const ticks = (r1, r2, n, stroke, w, every = 0, r1b = r1, wb = w) => {
  let d = "", dd = "";
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    const big = every && i % every === 0;
    const [x1, y1] = pol(big ? r1b : r1, a), [x2, y2] = pol(r2, a);
    if (big) dd += `M${x1} ${y1}L${x2} ${y2}`; else d += `M${x1} ${y1}L${x2} ${y2}`;
  }
  return `<path d='${d}' stroke='${stroke}' stroke-width='${w}'/>` + (dd ? `<path d='${dd}' stroke='${stroke}' stroke-width='${wb}'/>` : "");
};

add("rose-gold-loop", "common", 220, false,
  N("Gül Altını Halka", "Rose Gold Loop", "Roségold-Reif", "Aro de oro rosa", "Anneau or rose", "Aro de ouro rosé", "Кольцо из розового золота"),
  N("İnce gravür çizgili gül altını halka, altta üç küçük taş.", "A rose gold ring with fine engraved lines and three small stones below.", "Ein Roségoldring mit feiner Gravur und drei kleinen Steinen unten.", "Un aro de oro rosa con finos grabados y tres piedras pequeñas abajo.", "Un anneau d'or rose finement gravé, avec trois petites pierres en bas.", "Um aro de ouro rosé com gravura fina e três pedrinhas embaixo.", "Кольцо из розового золота с тонкой гравировкой и тремя камешками внизу."),
  () => {
    const defs = metalGrad("m", "roseGold") + gemDefs("d", "#ffffff", "#ffe1ea", "#b07a8a");
    return frameDoc(defs, band(81, 9, "url(#m)") + ticks(77.6, 79.8, 72, "#7a3f33", 0.7) + ticks(82.4, 84.6, 72, "#fff0ea", 0.6) +
      at(87.5, 168, `<use href='#d' transform='rotate(180) scale(.6)'/>`) + at(89, 180, `<use href='#d' transform='rotate(180) scale(.85)'/>`) + at(87.5, 192, `<use href='#d' transform='rotate(180) scale(.6)'/>`));
  });

add("jade-ring", "common", 260, false,
  N("Yeşim Halka", "Jade Ring", "Jadering", "Aro de jade", "Anneau de jade", "Aro de jade", "Нефритовое кольцо"),
  N("Damarlı cilalı yeşim, iki ince altın çizgi arasında.", "Polished veined jade set between two thin lines of gold.", "Polierte, geäderte Jade zwischen zwei feinen Goldlinien.", "Jade pulido y veteado entre dos finas líneas de oro.", "Du jade poli et veiné serti entre deux fins filets d'or.", "Jade polido e rajado entre dois finos filetes de ouro.", "Полированный нефрит с прожилками между двумя тонкими золотыми линиями."),
  () => {
    const r = rnd(41);
    let veins = "";
    for (let i = 0; i < 9; i++) { const a = r() * 360, b = a + 18 + r() * 30; veins += `<path d='${arc(76.5 + r() * 9, a, b)}' fill='none' stroke='#eafff3' stroke-opacity='${f(0.15 + r() * 0.3)}' stroke-width='${f(0.5 + r() * 0.9)}'/>`; }
    const defs = metalGrad("m", "jade") + metalGrad("g", "gold", 30);
    return frameDoc(defs, band(81, 11, "url(#m)", { specOpacity: 0.7 }) + veins + circ(75.8, "url(#g)", 1.4) + circ(86.6, "url(#g)", 1.4));
  });

add("obsidian-edge", "common", 240, false,
  N("Obsidyen Kenar", "Obsidian Edge", "Obsidiankante", "Filo de obsidiana", "Arête d'obsidienne", "Fio de obsidiana", "Обсидиановая кромка"),
  N("Keskin yontulmuş siyah cam; kenarında mor bir ışık.", "Sharply cut black glass with a violet light along its edge.", "Scharf geschliffenes schwarzes Glas mit violettem Licht an der Kante.", "Vidrio negro de corte afilado con una luz violeta en el borde.", "Du verre noir taillé net, avec une lueur violette sur le bord.", "Vidro negro de corte afiado com uma luz violeta na borda.", "Остро огранённое чёрное стекло с фиолетовым светом по краю."),
  () => {
    const defs = metalGrad("m", "obsidian") + lgU("e", ["#b9a6ff", "#6b4dff", "#2a1a7a"], 0, 0, 200, 200);
    let cuts = "";
    for (let i = 0; i < 14; i++) { const a = i * 25.7; const [x1, y1] = pol(75.5, a), [x2, y2] = pol(86.5, a + 9); cuts += `M${x1} ${y1}L${x2} ${y2}`; }
    return frameDoc(defs, band(81, 11, "url(#m)", { specOpacity: 0.8 }) + `<path d='${cuts}' stroke='#9fa7c7' stroke-opacity='.35' stroke-width='.8'/>` + circ(87.2, "url(#e)", 1.8) + circ(89.5, "#6b4dff", 0.8, " stroke-opacity='.45'"));
  });

add("copper-wire", "common", 190, false,
  N("Bakır Tel", "Copper Wire", "Kupferdraht", "Alambre de cobre", "Fil de cuivre", "Fio de cobre", "Медная проволока"),
  N("Birbirine sarılmış iki bakır tel, dört noktada sargı.", "Two twisted copper strands, wrapped tight at four points.", "Zwei verdrillte Kupferdrähte, an vier Stellen fest umwickelt.", "Dos hilos de cobre trenzados, atados en cuatro puntos.", "Deux brins de cuivre torsadés, ligaturés en quatre points.", "Dois fios de cobre trançados, amarrados em quatro pontos.", "Две скрученные медные жилы, туго обмотанные в четырёх местах."),
  () => {
    const defs = metalGrad("m", "copper") + metalGrad("n", "bronze", 60) + lg("w", ["#ffe3d0", "#b5562b", "#4a1a08"], 0, 0, 1, 0) + `<ellipse id='e' cx='100' cy='19' rx='2.2' ry='4.6' transform='rotate(35 100 19)' fill='url(#w)' stroke='#3a1406' stroke-width='.4'/>`;
    const tw = around("e", 48);
    let wraps = "";
    for (const a of [45, 135, 225, 315]) { let c = ""; for (let k = -2; k <= 2; k++) c += `<rect x='${k * 1.7 - 0.7}' y='-6.5' width='1.4' height='13' rx='.7' fill='url(#n)' stroke='#3a1406' stroke-width='.3'/>`; wraps += at(81, a, `<g transform='rotate(90)'>${c}</g>`); }
    return frameDoc(defs, circ(81, "#2e1006", 9) + tw + wraps);
  });

add("mint-pop", "common", 160, false,
  N("Nane Şekeri", "Mint Pop", "Minzbonbon", "Caramelo de menta", "Bonbon menthe", "Bala de hortelã", "Мятная карамель"),
  N("Parlak nane yeşili mine, krem rengi benekler.", "Glossy mint enamel with cream polka dots.", "Glänzende Minzemaille mit cremefarbenen Tupfen.", "Esmalte menta brillante con lunares crema.", "Un émail menthe brillant à pois crème.", "Esmalte menta brilhante com bolinhas creme.", "Глянцевая мятная эмаль в кремовый горошек."),
  () => {
    const defs = lgU("m", ["#d9fff0", "#6fe3bd", "#22a985", "#0d6a55"], 40, 20, 160, 180) + `<circle id='p' cx='100' cy='19' r='2.4' fill='#fff7e0'/>`;
    return frameDoc(defs, band(81, 11, "url(#m)", { lip: "#fff7e0", lipOpacity: 0.7, specOpacity: 0.85 }) + around("p", 24, 0) +
      circ(88, "#fff7e0", 2.2) + circ(88, "#22a985", 0.6, " stroke-opacity='.6'"));
  });

add("slate-notch", "common", 170, false,
  N("Arduvaz Çentik", "Slate Notch", "Schieferkerbe", "Muesca de pizarra", "Encoche d'ardoise", "Entalhe de ardósia", "Сланцевая насечка"),
  N("Benekli taş halka, dört yanda derin çentikler ve yosun izleri.", "A speckled stone ring with deep notches on four sides and traces of moss.", "Ein gesprenkelter Steinring mit tiefen Kerben an vier Seiten und Moosspuren.", "Un aro de piedra moteada con muescas profundas en cuatro lados y rastros de musgo.", "Un anneau de pierre mouchetée, quatre encoches profondes et des traces de mousse.", "Um aro de pedra salpicada, com entalhes fundos nos quatro lados e marcas de musgo.", "Пятнистое каменное кольцо с глубокими насечками с четырёх сторон и следами мха."),
  () => {
    const r = rnd(77);
    let sp = "";
    for (let i = 0; i < 70; i++) { const [x, y] = pol(76.5 + r() * 9, r() * 360); sp += `<circle cx='${x}' cy='${y}' r='${f(0.3 + r() * 0.8)}' fill='${r() > 0.5 ? "#c9d1dc" : "#2b3038"}' opacity='.7'/>`; }
    let moss = "";
    for (const a of [200, 215, 330, 120]) for (let k = 0; k < 5; k++) { const [x, y] = pol(85 + r() * 3, a + r() * 10); moss += `<circle cx='${x}' cy='${y}' r='${f(1 + r() * 1.4)}' fill='${r() > 0.5 ? "#6aa84f" : "#3f7a35"}'/>`; }
    const defs = metalGrad("m", ["#e8edf3", "#97a3b3", "#5d6878", "#353d4a", "#1b2029"]);
    const notch = [0, 90, 180, 270].map((a) => at(81, a, `<path d='M-3 -6L3 -6L1.6 6H-1.6Z' fill='#1b2029'/><path d='M-3 -6L-1.6 6' stroke='#c9d1dc' stroke-opacity='.5' stroke-width='.6'/>`)).join("");
    return frameDoc(defs, band(81, 11, "url(#m)") + sp + notch + moss);
  });

add("coral-beads", "common", 210, false,
  N("Mercan Boncuk", "Coral Beads", "Korallenperlen", "Cuentas de coral", "Perles de corail", "Contas de coral", "Коралловые бусы"),
  N("Altın aralıklarla dizilmiş otuz iki mercan boncuk.", "Thirty-two coral beads strung with tiny gold spacers.", "Zweiunddreißig Korallenperlen mit winzigen Goldzwischenstücken.", "Treinta y dos cuentas de coral con pequeños separadores dorados.", "Trente-deux perles de corail séparées par de petits anneaux d'or.", "Trinta e duas contas de coral com pequenos espaçadores dourados.", "Тридцать две коралловые бусины с крошечными золотыми разделителями."),
  () => {
    const defs = cabDefs("b", "#ffd2c4", "#ff6f5e", "#8a1f18", 3.4) + `<circle id='s' cx='100' cy='19' r='1.3' fill='#ffd76a' stroke='#7a4a0c' stroke-width='.4'/>`;
    let b = "";
    for (let i = 0; i < 32; i++) b += at(81, i * 11.25, `<use href='#b'/>`, 1, true);
    return frameDoc(defs, circ(81, "#5a1410", 1.2) + b + around("s", 32, 5.6));
  });

add("lilac-ribbon", "common", 230, false,
  N("Leylak Kurdele", "Lilac Ribbon", "Fliederband", "Cinta lila", "Ruban lilas", "Fita lilás", "Сиреневая лента"),
  N("Saten bir kurdele halkayı sarar, sağ altta fiyonk olur.", "A satin ribbon wraps the ring and ends in a bow at the lower right.", "Ein Satinband umschlingt den Ring und endet unten rechts in einer Schleife.", "Una cinta de satén envuelve el aro y termina en un lazo abajo a la derecha.", "Un ruban de satin enlace l'anneau et finit en nœud en bas à droite.", "Uma fita de cetim envolve o aro e termina em um laço no canto inferior direito.", "Атласная лента обвивает кольцо и завязывается бантом справа внизу."),
  () => {
    const defs = lgU("m", ["#fbefff", "#cba6f7", "#8a5fd6", "#cba6f7", "#5b3a9e"], 0, 0, 200, 200) + lg("k", ["#f1e2ff", "#b58cf0", "#6e44c2"], 0, 0, 1, 1);
    let folds = "";
    for (let i = 0; i < 10; i++) { const a = i * 36 + 10; const [x1, y1] = pol(75.5, a), [x2, y2] = pol(86.5, a + 14); folds += `M${x1} ${y1}L${x2} ${y2}`; }
    const [bx, by] = pol(82, 135);
    const bow = `<g transform='translate(${bx} ${by}) rotate(-45)'><path d='M0 0C-8 -12 -20 -8 -16 2C-13 9 -5 4 0 0Z' fill='url(#k)' stroke='#5b3a9e' stroke-width='.8'/><path d='M0 0C8 -12 20 -8 16 2C13 9 5 4 0 0Z' fill='url(#k)' stroke='#5b3a9e' stroke-width='.8'/><path d='M0 0L-6 16L-2 14L0 18L2 14L6 16Z' fill='url(#k)' stroke='#5b3a9e' stroke-width='.8'/><circle r='3.2' fill='#cba6f7' stroke='#5b3a9e' stroke-width='.8'/></g>`;
    return frameDoc(defs, band(81, 10, "url(#m)", { specOpacity: 0.75 }) + `<path d='${folds}' stroke='#fff' stroke-opacity='.35' stroke-width='1.2'/>` + bow);
  });

add("amber-drop", "common", 250, false,
  N("Kehribar Damla", "Amber Drop", "Bernsteintropfen", "Gota de ámbar", "Goutte d'ambre", "Gota de âmbar", "Янтарная капля"),
  N("İçten parlayan kehribar cam; altından bal damlaları süzülür.", "Amber glass glowing from within, with honey drops sliding off the bottom.", "Von innen leuchtendes Bernsteinglas, unten rinnen Honigtropfen.", "Vidrio ámbar que brilla por dentro, con gotas de miel cayendo abajo.", "Un verre d'ambre qui luit de l'intérieur, avec des gouttes de miel en bas.", "Vidro âmbar que brilha por dentro, com gotas de mel escorrendo embaixo.", "Янтарное стекло, светящееся изнутри, с каплями мёда снизу."),
  () => {
    const defs = rgU("m", [[0.74, "#7a3600"], [0.8, "#f5a524"], [0.84, "#ffd77a"], [0.88, "#d9800f"], [0.92, "#6a2c00"]], 100, 100, 95) + lg("d", ["#ffe29a", "#f0a020", "#a35400"], 0, 0, 0, 1);
    const drop = (a, len, s) => at(84, a, `<g transform='rotate(180) scale(${s})'><path d='M-4 0C-4 ${len * 0.5} -5.4 ${len} 0 ${len + 6}C5.4 ${len} 4 ${len * 0.5} 4 0Z' fill='url(#d)' stroke='#7a3600' stroke-width='.5'/><ellipse cx='-1.6' cy='${len}' rx='1' ry='2' fill='#fff' fill-opacity='.75'/></g>`);
    return frameDoc(defs, `<path d='${annulus(75.5, 87)}' fill='url(#m)' fill-rule='evenodd'/>` + band(81.2, 11.5, "none", { shadowOpacity: 0.5 }) + circ(81.2, "#fff2c0", 1, " stroke-opacity='.5' stroke-dasharray='18 10 4 10'") + drop(170, 7, 1.1) + drop(186, 3, 0.85) + drop(156, 2, 0.7) + drop(200, 1, 0.6));
  });

add("ivory-dial", "common", 280, false,
  N("Fildişi Kadran", "Ivory Dial", "Elfenbeinzifferblatt", "Esfera de marfil", "Cadran ivoire", "Mostrador marfim", "Циферблат слоновой кости"),
  N("Saat kasası gibi fildişi bezel, siyah dakika çizgileri.", "An ivory bezel like a watch case, with black minute marks.", "Eine Elfenbeinlünette wie bei einer Uhr, mit schwarzen Minutenstrichen.", "Un bisel de marfil como el de un reloj, con marcas de minutos negras.", "Une lunette ivoire comme un boîtier de montre, aux index minutes noirs.", "Uma luneta marfim como a de um relógio, com marcas de minutos pretas.", "Безель цвета слоновой кости, как у часов, с чёрными минутными метками."),
  () => {
    const defs = metalGrad("m", "ivory") + metalGrad("g", "gold", 20);
    return frameDoc(defs, band(81.5, 12, "url(#m)") + ticks(80.5, 86, 60, "#1b1b22", 0.8, 5, 77.4, 2.2) + `<path d='M96.5 11L103.5 11L100 17Z' fill='#c8901f' stroke='#5e4c30' stroke-width='.6'/>` + circ(75.6, "url(#g)", 1.2) + circ(87.8, "url(#g)", 1.2));
  });

add("teal-scallop", "common", 200, false,
  N("Turkuaz Dalga", "Teal Scallop", "Petrolfarbene Bogenkante", "Festón verde azulado", "Feston sarcelle", "Festão verde-azulado", "Бирюзовый фестон"),
  N("Dış kenarı yarım daire dalgalarla kesilmiş turkuaz mine.", "Teal enamel with an outer edge cut into soft scallops.", "Petrolfarbene Emaille mit weich gebogtem Außenrand.", "Esmalte verde azulado con el borde exterior festoneado.", "Un émail sarcelle au bord extérieur festonné.", "Esmalte verde-azulado com a borda externa em festões.", "Бирюзовая эмаль с внешним краем в мягких фестонах."),
  () => {
    let d = "";
    const n = 24;
    for (let i = 0; i < n; i++) { const a = (360 / n) * i; const [x, y] = pol(87.5, a + 180 / n); d += `<circle cx='${x}' cy='${y}' r='5.4'/>`; }
    const defs = lgU("m", ["#d9fffb", "#3dd6c8", "#12867f", "#0a4a4a"], 30, 10, 170, 190);
    return frameDoc(defs, `<g fill='url(#m)' stroke='#063a3a' stroke-width='.8'>${d}</g>` + band(81, 10, "url(#m)", { specOpacity: 0.8 }) + circ(77.5, "#e9fffd", 1, " stroke-opacity='.6' stroke-dasharray='3 3'"));
  });

add("sunny-orbit", "common", 190, false,
  N("Güneşli Yörünge", "Sunny Orbit", "Sonnige Umlaufbahn", "Órbita soleada", "Orbite ensoleillée", "Órbita ensolarada", "Солнечная орбита"),
  N("Sarı halkanın çevresinde noktalı yörünge ve iki minik gezegen.", "A dotted orbit around a yellow ring, with two tiny planets.", "Eine gepunktete Umlaufbahn um einen gelben Ring, mit zwei winzigen Planeten.", "Una órbita punteada alrededor de un aro amarillo, con dos planetas diminutos.", "Une orbite pointillée autour d'un anneau jaune, avec deux minuscules planètes.", "Uma órbita pontilhada em volta de um aro amarelo, com dois planetas minúsculos.", "Пунктирная орбита вокруг жёлтого кольца и две крошечные планеты."),
  () => {
    const defs = metalGrad("m", ["#fffbe0", "#ffe14a", "#e0a400", "#8a5a00", "#3a2400"]) + rg("p1", ["#ffd0f0", "#ff5fae", "#7a1050"], 0.35, 0.3, 0.7) + rg("p2", ["#c9f5ff", "#3fb8ff", "#0a3a7a"], 0.35, 0.3, 0.7);
    return frameDoc(defs, band(80, 8, "url(#m)") + circ(90, "#ffe14a", 1.5, " stroke-dasharray='.1 4' stroke-linecap='round'") +
      at(90, 58, `<circle r='5' fill='url(#p1)'/><ellipse rx='8' ry='2' fill='none' stroke='#ffd0f0' stroke-width='.9' transform='rotate(-20)'/>`, 1, true) + at(90, 222, `<circle r='3.6' fill='url(#p2)'/>`, 1, true));
  });

add("denim-stitch", "common", 170, false,
  N("Kot Dikiş", "Denim Stitch", "Jeansnaht", "Costura vaquera", "Couture denim", "Costura jeans", "Джинсовая строчка"),
  N("Turuncu dikişli kot kumaş halka ve altta deri etiket.", "A denim band with orange stitching and a leather tag below.", "Ein Jeansband mit orangefarbener Naht und Lederetikett unten.", "Una banda vaquera con costuras naranjas y una etiqueta de cuero abajo.", "Une bande de denim surpiquée d'orange, avec une étiquette en cuir en bas.", "Uma faixa de jeans com costura laranja e etiqueta de couro embaixo.", "Джинсовая лента с оранжевой строчкой и кожаной нашивкой снизу."),
  () => {
    const r = rnd(9);
    let tex = "";
    for (let i = 0; i < 90; i++) { const a = i * 4; const [x1, y1] = pol(75.8, a), [x2, y2] = pol(86.2, a + 6); tex += `M${x1} ${y1}L${x2} ${y2}`; }
    const defs = metalGrad("m", ["#c7dcff", "#5d86c9", "#2f4f8a", "#1b3260", "#0c1a36"]) + lg("t", ["#c98a52", "#8a5228", "#5a3014"], 0, 0, 0, 1);
    return frameDoc(defs, band(81, 11, "url(#m)", { specOpacity: 0.35 }) + `<path d='${tex}' stroke='#fff' stroke-opacity='.08' stroke-width='.9'/>` +
      circ(77.6, "#ffa340", 1.1, " stroke-dasharray='2.4 1.8'") + circ(84.4, "#ffa340", 1.1, " stroke-dasharray='2.4 1.8'") +
      `<rect x='88' y='178' width='24' height='13' rx='2.5' fill='url(#t)' stroke='#3a1e08' stroke-width='.8'/><rect x='90.5' y='180.5' width='19' height='8' rx='1.5' fill='none' stroke='#ffd09a' stroke-opacity='.7' stroke-width='.6' stroke-dasharray='1.4 1'/>`);
  });

add("frost-beads", "common", 240, false,
  N("Kırağı Boncuk", "Frost Beads", "Raureifperlen", "Cuentas de escarcha", "Perles de givre", "Contas de geada", "Иней-бусины"),
  N("Büyüklü küçüklü buz boncuklardan iki sıra.", "Two rows of icy beads in alternating sizes.", "Zwei Reihen eisiger Perlen in wechselnder Größe.", "Dos filas de cuentas heladas de tamaños alternos.", "Deux rangs de perles de glace de tailles alternées.", "Duas fileiras de contas geladas em tamanhos alternados.", "Два ряда ледяных бусин чередующегося размера."),
  () => {
    const defs = cabDefs("a", "#ffffff", "#bfe9ff", "#3a7aa8", 3) + cabDefs("b", "#ffffff", "#e6f6ff", "#6f9fc8", 1.8);
    let s = "";
    for (let i = 0; i < 30; i++) { s += at(79, i * 12, `<use href='#${i % 2 ? "b" : "a"}'/>`, 1, true); s += at(86.5, i * 12 + 6, `<use href='#${i % 2 ? "a" : "b"}'/>`, 1, true); }
    return frameDoc(defs, circ(82.8, "#bfe9ff", 9, " stroke-opacity='.12'") + s);
  });

add("ember-line", "common", 220, false,
  N("Kor Çizgisi", "Ember Line", "Glutlinie", "Línea de brasas", "Ligne de braise", "Linha de brasa", "Линия углей"),
  N("Kömür karası halkada içten yanan turuncu bir çizgi.", "A charcoal ring with an orange line burning inside it.", "Ein kohlschwarzer Ring, in dem eine orange Linie glüht.", "Un aro carbón con una línea naranja ardiendo por dentro.", "Un anneau couleur charbon traversé d'une ligne orange incandescente.", "Um aro cor de carvão com uma linha laranja queimando por dentro.", "Угольное кольцо, внутри которого тлеет оранжевая линия."),
  () => {
    const r = rnd(5);
    let ash = "";
    for (let i = 0; i < 40; i++) { const [x, y] = pol(76 + r() * 10, r() * 360); ash += `<circle cx='${x}' cy='${y}' r='${f(0.3 + r() * 0.6)}' fill='#ffb070' opacity='${f(0.2 + r() * 0.6)}'/>`; }
    const defs = metalGrad("m", ["#6b6b73", "#34343c", "#18181d", "#0b0b0e", "#050506"]) + blur("bl", 1.6);
    return frameDoc(defs, band(81, 11, "url(#m)", { specOpacity: 0.3 }) + circ(81, "#ff5a1f", 3.2, " stroke-dasharray='14 4' filter='url(#bl)'") + circ(81, "#ffc070", 1.2, " stroke-dasharray='14 4'") + ash);
  });
// ---------------------------------------------------------------- more rares
add("clockwork", "rare", 460, false,
  N("Saat Mekanizması", "Clockwork", "Uhrwerk", "Mecanismo de reloj", "Mécanisme d'horloge", "Mecanismo de relógio", "Часовой механизм"),
  N("Dişli kenarlı pirinç halka, Roma rakamları ve köşede küçük bir çark.", "A brass ring with geared teeth, Roman numerals and a small cog in the corner.", "Ein Messingring mit Zahnkranz, römischen Ziffern und einem kleinen Zahnrad.", "Un aro de latón dentado, números romanos y un pequeño engranaje en la esquina.", "Un anneau de laiton denté, des chiffres romains et un petit rouage dans le coin.", "Um aro de latão dentado, algarismos romanos e uma pequena engrenagem no canto.", "Латунное кольцо с зубцами, римскими цифрами и маленькой шестерёнкой сбоку."),
  () => {
    const gear = (R, teeth, depth) => { let d = ""; for (let i = 0; i < teeth * 2; i++) { const a0 = (360 / (teeth * 2)) * i, a1 = a0 + 360 / (teeth * 2); const rr = i % 2 ? R : R + depth; const [x0, y0] = pol(rr, a0 + 1.2), [x1, y1] = pol(rr, a1 - 1.2); d += (i ? "L" : "M") + `${x0} ${y0}L${x1} ${y1}`; } return d + "Z"; };
    const defs = metalGrad("m", "brass") + metalGrad("n", "bronze", 40);
    const num = { 0: "XII", 90: "III", 180: "VI", 270: "IX" };
    let nums = "";
    for (const a of [0, 90, 180, 270]) { const [x, y] = pol(81, a); nums += `<text x='${x}' y='${f(y + 2.6)}' font-family='Georgia,serif' font-size='7.5' font-weight='700' text-anchor='middle' fill='#3a2a06'>${num[a]}</text>`; }
    const cog = `<g transform='translate(160 160)'><path d='${(() => { let d = ""; for (let i = 0; i < 20; i++) { const a = (i * 18 * Math.PI) / 180, r = i % 2 ? 10 : 13; d += (i ? "L" : "M") + f(r * Math.sin(a)) + " " + f(-r * Math.cos(a)); } return d + "Z"; })()}' fill='url(#n)' stroke='#2a1e06' stroke-width='.8'/><circle r='4.5' fill='#2a1e06'/><circle r='2' fill='#e8c86a'/></g>`;
    return frameDoc(defs, `<path d='${gear(86, 36, 3.6)}M24 100a76 76 0 1 0 152 0a76 76 0 1 0 -152 0Z' fill='url(#m)' fill-rule='evenodd' stroke='#2a1e06' stroke-width='.8'/>` + band(81, 11, "url(#m)") + ticks(84.5, 86.4, 60, "#3a2a06", 0.6) + nums + cog);
  });

add("thorned-rose", "rare", 520, false,
  N("Dikenli Gül", "Thorned Rose", "Dornenrose", "Rosa espinosa", "Rose épineuse", "Rosa com espinhos", "Роза с шипами"),
  N("Halkaya dolanan dikenli bir sap ve iki kadife kırmızı gül.", "A thorny stem winding around the ring with two velvet-red roses.", "Ein dorniger Stiel windet sich um den Ring, dazu zwei samtrote Rosen.", "Un tallo espinoso rodea el aro con dos rosas de rojo terciopelo.", "Une tige épineuse s'enroule autour de l'anneau, avec deux roses rouge velours.", "Um caule espinhoso envolve o aro com duas rosas de vermelho aveludado.", "Колючий стебель обвивает кольцо, на нём две бархатно-красные розы."),
  () => {
    let vine = "", thorns = "";
    for (let a = 0; a <= 360; a += 4) { const r = 82 + 4 * Math.sin((a * Math.PI) / 30); const [x, y] = pol(r, a); vine += (a ? "L" : "M") + `${x} ${y}`; if (a % 24 === 12) thorns += at(r + 1.5, a, `<path d='M-1.4 0L0 -4.5L1.4 0Z' fill='#2c4a1c'/>`); }
    const rose = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><circle r='9' fill='#5a0712'/>${[0, 72, 144, 216, 288].map((a) => `<path d='${petal(9, 6)}' transform='rotate(${a})' fill='url(#rp)' stroke='#4a0410' stroke-width='.5'/>`).join("")}${[36, 108, 180, 252, 324].map((a) => `<path d='${petal(6, 4.4)}' transform='rotate(${a})' fill='url(#rp)' stroke='#4a0410' stroke-width='.5'/>`).join("")}<path d='M-2.4 0A2.4 2.4 0 1 1 2.4 0Q0 3 -2.4 0Z' fill='#ff6b7d' stroke='#4a0410' stroke-width='.5'/></g>`;
    const defs = rg("rp", ["#ff8696", "#d0142c", "#6a0614"], 0.5, 0.2, 0.9) + lg("lf", ["#9be07a", "#3f8a2a", "#1e4a12"], 0, 0, 1, 1) + metalGrad("m", "obsidian");
    const lv = (a, rot) => at(87, a, `<path d='${leaf(11, 4.6)}' transform='rotate(${rot})' fill='url(#lf)' stroke='#1e4a12' stroke-width='.5'/>`);
    return frameDoc(defs, band(80, 5, "url(#m)", { spec: false }) + `<path d='${vine}' fill='none' stroke='#2c4a1c' stroke-width='2.6' stroke-linejoin='round'/><path d='${vine}' fill='none' stroke='#6aa84f' stroke-width='.8' stroke-opacity='.6'/>` + thorns +
      lv(200, -60) + lv(235, 50) + lv(30, 60) + lv(70, -50) + lv(300, 40) + lv(140, -40) + rose(...pol(85, 222), 1.55) + rose(...pol(86, 48), 1.2) + rose(...pol(88, 300), 0.75));
  });

add("chainlink", "rare", 380, false,
  N("Zincir Halka", "Chainlink", "Kettenglied", "Eslabones", "Maillons", "Elos de corrente", "Цепь"),
  N("Birbirine geçmiş parlak çelik halkalardan sağlam bir zincir.", "A sturdy chain of interlocking polished steel links.", "Eine robuste Kette aus ineinandergreifenden polierten Stahlgliedern.", "Una cadena robusta de eslabones de acero pulido entrelazados.", "Une chaîne solide de maillons d'acier poli entrelacés.", "Uma corrente robusta de elos de aço polido entrelaçados.", "Прочная цепь из переплетённых полированных стальных звеньев."),
  () => {
    const defs = lg("a", ["#ffffff", "#aeb9cc", "#4a556b", "#c9d2e0"], 0, 0, 1, 1) + lg("b", ["#dfe6f2", "#6b778f", "#262c3a"], 0, 0, 1, 1) +
      `<g id='h'><rect x='-8.6' y='-4.4' width='17.2' height='8.8' rx='4.4' fill='none' stroke='#1a1f2b' stroke-width='3.8'/><rect x='-8.6' y='-4.4' width='17.2' height='8.8' rx='4.4' fill='none' stroke='url(#a)' stroke-width='2.6'/></g><g id='v'><rect x='-8.6' y='-2' width='17.2' height='4' rx='2' fill='url(#b)' stroke='#1a1f2b' stroke-width='.7'/><path d='M-6 -.6H6' stroke='#fff' stroke-opacity='.6' stroke-width='.7'/></g>`;
    let s = "";
    for (let i = 0; i < 32; i++) s += at(81, i * 11.25, `<use href='#${i % 2 ? "v" : "h"}'/>`);
    return frameDoc(defs, s);
  });

add("peacock-plume", "rare", 540, false,
  N("Tavus Tüyü", "Peacock Plume", "Pfauenfeder", "Pluma de pavo real", "Plume de paon", "Pena de pavão", "Павлинье перо"),
  N("Alt kısımda açılan, göz desenli tavus kuşu tüyleri.", "Eyed peacock feathers fanning out along the bottom.", "Pfauenfedern mit Augenmuster, die sich unten auffächern.", "Plumas de pavo real con ocelos abiertas en abanico por abajo.", "Des plumes de paon ocellées déployées en éventail par le bas.", "Penas de pavão com ocelos abertas em leque na parte de baixo.", "Павлиньи перья с «глазками», раскрытые веером снизу."),
  () => {
    const defs = metalGrad("m", ["#e9fff7", "#3fd1a8", "#0f6f6a", "#0a3a4a", "#041a22"]) + lg("ps", ["#2fd1a0", "#0d7f74"], 0, 0, 0, 1) +
      `<g id='pf'><path d='${petal(20, 7)}' fill='url(#ps)' stroke='#06403a' stroke-width='.5'/><ellipse cy='-13.5' rx='4.6' ry='5.4' fill='#f2c230'/><ellipse cy='-13.5' rx='3.4' ry='4.1' fill='#1aa8b8'/><ellipse cy='-13' rx='1.9' ry='2.5' fill='#1b1464'/><path d='M0 0V-8' stroke='#e6fff7' stroke-opacity='.6' stroke-width='.6'/></g>`;
    let s = "";
    for (let i = 0; i < 9; i++) { const a = 128 + i * 13; s += at(79.5, a, `<use href='#pf' transform='scale(${f((1 - Math.abs(i - 4) * 0.05) * 100) / 100})'/>`); }
    return frameDoc(defs, band(80.5, 8, "url(#m)") + circ(80.5, "#f2c230", 0.9, " stroke-dasharray='1 3' stroke-opacity='.8'") + s);
  });

add("compass-rose", "rare", 440, false,
  N("Rüzgâr Gülü", "Compass Rose", "Windrose", "Rosa de los vientos", "Rose des vents", "Rosa dos ventos", "Роза ветров"),
  N("Dört ana yönde sivri yıldız uçları; kuzey kırmızı.", "Sharp star points at the four cardinal directions, with north in red.", "Spitze Sternzacken in den vier Himmelsrichtungen, Norden in Rot.", "Puntas de estrella en los cuatro puntos cardinales, con el norte en rojo.", "Des pointes d'étoile aux quatre points cardinaux, le nord en rouge.", "Pontas de estrela nos quatro pontos cardeais, com o norte em vermelho.", "Острые лучи звезды по четырём сторонам света, север красный."),
  () => {
    const defs = metalGrad("m", "silver") + lg("pa", ["#fff6cf", "#d6a23a"], 0, 0, 1, 0) + lg("pb", ["#ffd3d6", "#d0142c"], 0, 0, 1, 0);
    const pt = (a, len, w, fill) => at(81, a, `<path d='M0 ${-len}L${w} 0H${-w}Z' fill='${fill}' stroke='#3a2a10' stroke-width='.6'/><path d='M0 ${-len}L${w} 0H0Z' fill='#000' fill-opacity='.25'/>`);
    return frameDoc(defs, pt(45, 15, 3.4, "url(#pa)") + pt(135, 15, 3.4, "url(#pa)") + pt(225, 15, 3.4, "url(#pa)") + pt(315, 15, 3.4, "url(#pa)") +
      pt(90, 19.5, 5, "url(#pa)") + pt(180, 19.5, 5, "url(#pa)") + pt(270, 19.5, 5, "url(#pa)") + pt(0, 19.5, 5, "url(#pb)") + band(81, 8.5, "url(#m)") + ticks(78, 80, 32, "#262c3a", 0.7) + circ(84, "#262c3a", 0.6, " stroke-opacity='.6'"));
  });

add("bubble-reef", "rare", 360, false,
  N("Kabarcık Resifi", "Bubble Reef", "Blasenriff", "Arrecife de burbujas", "Récif de bulles", "Recife de bolhas", "Пузырьковый риф"),
  N("Su yeşili cam halka, sağdan yükselen kabarcıklar ve altta yosun.", "An aqua glass ring with bubbles rising on the right and seaweed below.", "Ein aquafarbener Glasring, rechts steigen Blasen auf, unten wächst Seegras.", "Un aro de cristal aguamarina con burbujas que suben y algas abajo.", "Un anneau de verre aqua, des bulles qui montent à droite et des algues en bas.", "Um aro de vidro água-marinha com bolhas subindo e algas embaixo.", "Аквамариновое стеклянное кольцо, справа поднимаются пузыри, внизу водоросли."),
  () => {
    const defs = rgU("m", [[0.75, "#04394a"], [0.8, "#1fb5c9"], [0.85, "#9ff3ff"], [0.9, "#1691a8"], [0.93, "#04394a"]], 100, 100, 94) + rg("bb", [[0, "#fff", 0.95], [0.35, "#bff6ff", 0.3], [0.85, "#5fdcf0", 0.15], [1, "#e6fdff", 0.9]], 0.4, 0.35, 0.6) + lg("sw", ["#7be08a", "#1f8a4a"], 0, 0, 0, 1);
    const r = rnd(19);
    let bub = "";
    for (let i = 0; i < 9; i++) { const [x, y] = pol(89 + r() * 7, 30 + i * 13); bub += `<circle cx='${x}' cy='${y}' r='${f(1.6 + r() * 3.4)}' fill='url(#bb)' stroke='#bff6ff' stroke-width='.4'/>`; }
    let weed = "";
    for (let i = 0; i < 6; i++) { const a = 200 + i * 7; const [x, y] = pol(84, a); const h = 12 + (i % 3) * 4; weed += `<path d='M${x} ${y}q${-3 - i} ${-h * 0.4} ${-1} ${-h * 0.6}t${-2} ${-h * 0.5}' fill='none' stroke='url(#sw)' stroke-width='2.4' stroke-linecap='round' transform='rotate(${a - 180} ${x} ${y})'/>`; }
    return frameDoc(defs, weed + `<path d='${annulus(75.5, 87)}' fill='url(#m)' fill-rule='evenodd'/>` + band(81.2, 11.5, "none") + bub);
  });

add("sakura-branch", "rare", 500, false,
  N("Sakura Dalı", "Sakura Branch", "Kirschblütenzweig", "Rama de cerezo", "Branche de cerisier", "Galho de cerejeira", "Ветка сакуры"),
  N("Sol üstte kıvrılan koyu bir dal, pembe çiçekler ve tomurcuklar.", "A dark branch curling over the top left with pink blossoms and buds.", "Ein dunkler Zweig oben links mit rosa Blüten und Knospen.", "Una rama oscura arriba a la izquierda con flores rosas y capullos.", "Une branche sombre en haut à gauche, avec des fleurs roses et des bourgeons.", "Um galho escuro no alto à esquerda, com flores cor-de-rosa e botões.", "Тёмная ветка слева сверху с розовыми цветами и бутонами."),
  () => {
    const defs = rg("p", ["#ffffff", "#ffc4d8", "#f27aa6"], 0.5, 0.9, 0.9) + metalGrad("m", ["#fff0f5", "#f2b8cc", "#b0607e", "#5a2a3e", "#2a1018"]);
    const flower = (x, y, s, rot = 0) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'>${[0, 72, 144, 216, 288].map((a) => `<path d='M0 0C4 -2 5 -8 2 -10L0 -8.6L-2 -10C-5 -8 -4 -2 0 0Z' transform='rotate(${a})' fill='url(#p)' stroke='#d0507e' stroke-width='.4'/>`).join("")}<circle r='1.8' fill='#ffd76a'/>${[0, 72, 144, 216, 288].map((a) => `<circle cy='-3.2' r='.5' fill='#b0305a' transform='rotate(${a + 36})'/>`).join("")}</g>`;
    let br = `M${pol(90, 205).join(" ")}`;
    for (let a = 215; a <= 395; a += 10) br += `L${pol(88 + 3 * Math.sin(a / 9), a).join(" ")}`;
    const tw = (a, a2) => `<path d='M${pol(89, a).join(" ")}Q${pol(96, (a + a2) / 2).join(" ")} ${pol(97, a2).join(" ")}' fill='none' stroke='#3a2218' stroke-width='1.4' stroke-linecap='round'/>`;
    const fl = [[250, 1.3, 10], [282, 1.05, 40], [318, 1.25, 0], [352, 0.95, 20], [22, 1.1, 50], [228, 0.85, 30]].map(([a, s, rot]) => flower(...pol(88.5, a), s, rot)).join("");
    const buds = [[265, 96], [335, 96], [8, 95], [215, 95]].map(([a, r]) => `<ellipse cx='${pol(r, a)[0]}' cy='${pol(r, a)[1]}' rx='1.8' ry='2.6' fill='#f27aa6' stroke='#b0305a' stroke-width='.4' transform='rotate(${a} ${pol(r, a).join(" ")})'/>`).join("");
    return frameDoc(defs, band(80, 5.5, "url(#m)") + `<path d='${br}' fill='none' stroke='#3a2218' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'/><path d='${br}' fill='none' stroke='#7a5040' stroke-width='.8' stroke-opacity='.6'/>` + tw(262, 270) + tw(330, 338) + tw(10, 4) + tw(222, 214) + buds + fl);
  });

add("circuit-trace", "rare", 400, false,
  N("Devre İzi", "Circuit Trace", "Leiterbahn", "Pista de circuito", "Piste de circuit", "Trilha de circuito", "Дорожки платы"),
  N("Koyu devre kartında parlayan camgöbeği yollar ve lehim noktaları.", "Glowing cyan traces and solder pads on a dark circuit board.", "Leuchtend cyanfarbene Leiterbahnen und Lötpunkte auf dunkler Platine.", "Pistas cian brillantes y puntos de soldadura sobre una placa oscura.", "Des pistes cyan lumineuses et des pastilles de soudure sur une carte sombre.", "Trilhas ciano brilhantes e pontos de solda em uma placa escura.", "Светящиеся голубые дорожки и контактные площадки на тёмной плате."),
  () => {
    const r = rnd(23);
    let tr = "", pads = "";
    for (let i = 0; i < 22; i++) {
      const a = i * (360 / 22) + r() * 5, r1 = 76.5 + r() * 3, r2 = 84 + r() * 2.5, a2 = a + 4 + r() * 6;
      const [x1, y1] = pol(r1, a), [xm, ym] = pol(r1, a2), [x2, y2] = pol(r2, a2);
      tr += `M${x1} ${y1}L${xm} ${ym}L${x2} ${y2}`;
      pads += `<circle cx='${x2}' cy='${y2}' r='1.3' fill='#0a1a1f' stroke='#5ff6ff' stroke-width='.7'/>`;
      if (i % 4 === 0) { const [cx, cy] = pol(92, a + 3); pads += `<rect x='${f(cx - 3)}' y='${f(cy - 2)}' width='6' height='4' rx='.6' fill='#121821' stroke='#5ff6ff' stroke-opacity='.6' stroke-width='.5' transform='rotate(${f(a + 3)} ${cx} ${cy})'/>`; }
    }
    const defs = metalGrad("m", ["#2e4a4a", "#173232", "#0b1c1f", "#06120f", "#020806"]) + blur("bl", 1.2);
    return frameDoc(defs, band(81, 12, "url(#m)", { specOpacity: 0.25 }) + `<path d='${tr}' fill='none' stroke='#2ef2ff' stroke-width='2.2' stroke-opacity='.45' filter='url(#bl)'/><path d='${tr}' fill='none' stroke='#9ffaff' stroke-width='.9'/>` + pads + circ(87.5, "#2ef2ff", 0.8, " stroke-opacity='.6'"));
  });

add("honeycomb", "rare", 340, false,
  N("Bal Peteği", "Honeycomb", "Honigwabe", "Panal", "Rayon de miel", "Favo de mel", "Медовые соты"),
  N("İki sıra kehribar petek gözü ve aşağı süzülen bal.", "Two rows of amber honeycomb cells with honey dripping down.", "Zwei Reihen bernsteinfarbener Waben, von denen Honig tropft.", "Dos filas de celdas de panal ámbar con miel que gotea.", "Deux rangs d'alvéoles ambrées d'où coule le miel.", "Duas fileiras de alvéolos âmbar com mel escorrendo.", "Два ряда янтарных сот, с которых стекает мёд."),
  () => {
    const defs = rg("c", ["#fff2b0", "#f2b630", "#a35e00"], 0.4, 0.35, 0.7) + lg("d", ["#ffd060", "#c07000"], 0, 0, 0, 1);
    let s = "";
    for (let i = 0; i < 30; i++) { s += at(78.6, i * 12, `<path d='${poly(6, 3.9, 30)}' fill='url(#c)' stroke='#5a3200' stroke-width='.8'/>`); s += at(85.4, i * 12 + 6, `<path d='${poly(6, 3.9, 30)}' fill='url(#c)' stroke='#5a3200' stroke-width='.8'/>`); }
    const drip = (a, len) => at(88, a, `<path d='M-2.4 0V${len}A2.4 2.4 0 0 0 2.4 ${len}V0Z' fill='url(#d)' transform='rotate(180)'/>`);
    return frameDoc(defs, circ(82, "#5a3200", 14) + s + drip(176, 6) + drip(190, 3) + drip(150, 2));
  });

add("crystal-shards", "rare", 520, false,
  N("Kristal Kıymıklar", "Crystal Shards", "Kristallsplitter", "Esquirlas de cristal", "Éclats de cristal", "Estilhaços de cristal", "Кристальные осколки"),
  N("Buz mavisi halkadan her yöne fırlayan keskin kristaller.", "Sharp crystals bursting out of an ice-blue ring.", "Scharfe Kristalle, die aus einem eisblauen Ring hervorbrechen.", "Cristales afilados que brotan de un aro azul hielo.", "Des cristaux acérés jaillissant d'un anneau bleu glace.", "Cristais afiados brotando de um aro azul-gelo.", "Острые кристаллы, вырастающие из ледяного голубого кольца."),
  () => {
    const defs = metalGrad("m", ["#ffffff", "#c9f0ff", "#5ab0e0", "#1d5a8a", "#0a2a4a"]) + lg("k", ["#ffffff", "#bfeaff", "#4aa6e0", "#16508a"], 0, 0, 1, 0);
    const r = rnd(31);
    let s = "";
    for (let i = 0; i < 14; i++) { const a = i * 25.7 + r() * 8, len = 9 + r() * 9, w = 2.4 + r() * 1.6, tilt = (r() - 0.5) * 40; s += at(84, a, `<g transform='rotate(${f(tilt)})'><path d='M${-w} 2L${-w} ${f(-len + 3)}L0 ${f(-len)}L${w} ${f(-len + 3)}L${w} 2Z' fill='url(#k)' stroke='#0a2a4a' stroke-width='.6'/><path d='M0 ${f(-len)}V2' stroke='#fff' stroke-opacity='.6' stroke-width='.5'/></g>`); }
    return frameDoc(defs, s + band(81, 8, "url(#m)") + twinkle());
    function twinkle() { return [[40, 30], [170, 60], [30, 160]].map(([x, y]) => `<path d='${sparkle(4)}' transform='translate(${x} ${y})' fill='#fff'/>`).join(""); }
  });

add("moon-phases", "rare", 460, false,
  N("Ay Evreleri", "Moon Phases", "Mondphasen", "Fases lunares", "Phases de la lune", "Fases da lua", "Фазы луны"),
  N("Gece mavisi halkada sekiz ay evresi ve küçük yıldızlar.", "Eight moon phases and small stars on a midnight blue ring.", "Acht Mondphasen und kleine Sterne auf einem nachtblauen Ring.", "Ocho fases lunares y pequeñas estrellas sobre un aro azul noche.", "Huit phases de lune et de petites étoiles sur un anneau bleu nuit.", "Oito fases da lua e pequenas estrelas em um aro azul-noite.", "Восемь фаз луны и маленькие звёзды на полуночно-синем кольце."),
  () => {
    const defs = metalGrad("m", ["#8fa4ff", "#2a3a8a", "#141c4a", "#0a0e2a", "#04061a"]) + rg("mn", ["#ffffff", "#f3f0d8", "#c9c09a"], 0.4, 0.35, 0.7) + metalGrad("g", "gold", 30);
    const off = [0, 4, 7.4, 9.6, null, -9.6, -7.4, -4];
    let s = "<clipPath id='mc'><circle r='5.4'/></clipPath>";
    for (let i = 0; i < 8; i++) {
      const [x, y] = pol(81, i * 45);
      s += `<g transform='translate(${x} ${y}) scale(1.12)'><circle r='5.4' fill='url(#mn)'/>${off[i] == null ? "" : `<circle cx='${off[i]}' r='5.6' fill='#0d1236' clip-path='url(#mc)'/>`}<circle r='5.4' fill='none' stroke='#c9c09a' stroke-width='.5' stroke-opacity='.7'/></g>`;
    }
    return frameDoc(defs, band(81, 13, "url(#m)") + stars() + s + circ(74.6, "url(#g)", 1) + circ(87.4, "url(#g)", 1));
    function stars() { const r = rnd(3); let o = ""; for (let i = 0; i < 30; i++) { const [x, y] = pol(76.5 + r() * 9, r() * 360); o += `<circle cx='${x}' cy='${y}' r='${f(0.3 + r() * 0.5)}' fill='#fff' opacity='${f(0.4 + r() * 0.6)}'/>`; } return o; }
  });

add("origami", "rare", 320, false,
  N("Origami", "Origami", "Origami", "Origami", "Origami", "Origami", "Оригами"),
  N("Katlanmış kâğıt yüzeyler ve sağ üstte küçük bir kâğıt turna.", "Folded paper facets with a tiny paper crane at the top right.", "Gefaltete Papierflächen mit einem kleinen Papierkranich oben rechts.", "Facetas de papel plegado con una pequeña grulla arriba a la derecha.", "Des facettes de papier plié et une petite grue en papier en haut à droite.", "Facetas de papel dobrado com um pequeno tsuru no canto superior direito.", "Грани сложенной бумаги и маленький бумажный журавлик справа сверху."),
  () => {
    let s = "";
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a0 = (360 / n) * i, a1 = a0 + 360 / n, am = a0 + 180 / n;
      const p = [pol(75.5, a0), pol(87.5, am), pol(75.5, a1)], q = [pol(87.5, am), pol(75.5, a1), pol(87.5, a1 + 180 / n)];
      s += `<path d='M${p.map((x) => x.join(" ")).join("L")}Z' fill='${i % 2 ? "#f6efe4" : "#e3d6c2"}'/><path d='M${q.map((x) => x.join(" ")).join("L")}Z' fill='${i % 2 ? "#c9b79b" : "#b7a284"}'/>`;
    }
    const crane = `<g transform='translate(160 36) scale(1.7)'><path d='M-12 2L0 -2L4 6Z' fill='#ff8a7a'/><path d='M0 -2L14 -14L6 4Z' fill='#e85a4a'/><path d='M-12 2L-16 -8L-10 0Z' fill='#ff8a7a'/><path d='M4 6L10 3L6 4Z' fill='#c0392b'/><path d='M0 -2L-8 -16L2 2Z' fill='#ffa89a'/></g>`;
    return frameDoc("", s + `<path d='${annulus(75.5, 87.5)}' fill='none' stroke='#8a7458' stroke-width='.8'/>` + crane);
  });

add("ivy-wrap", "rare", 330, false,
  N("Sarmaşık", "Ivy Wrap", "Efeuranke", "Hiedra", "Lierre enlacé", "Hera trepadeira", "Плющ"),
  N("Halkayı spiral gibi saran üç loblu sarmaşık yaprakları.", "Three-lobed ivy leaves spiralling around the ring.", "Dreilappige Efeublätter, die sich spiralförmig um den Ring winden.", "Hojas de hiedra de tres lóbulos que envuelven el aro en espiral.", "Des feuilles de lierre à trois lobes enroulées en spirale autour de l'anneau.", "Folhas de hera de três lobos envolvendo o aro em espiral.", "Трёхлопастные листья плюща, спиралью обвивающие кольцо."),
  () => {
    const defs = lg("l", ["#b8f08a", "#4fae3a", "#1f5a1a"], 0, 0, 1, 1) + metalGrad("m", "bronze") +
      `<g id='iv'><path d='M0 0C-5 -2 -9 -6 -7 -9C-5 -10 -3 -9 -2 -8C-3 -12 -1 -15 0 -16C1 -15 3 -12 2 -8C3 -9 5 -10 7 -9C9 -6 5 -2 0 0Z' fill='url(#l)' stroke='#1f4a14' stroke-width='.6'/><path d='M0 0V-12M0 -4L-4 -7M0 -4L4 -7' stroke='#e6ffd0' stroke-opacity='.45' stroke-width='.5' fill='none'/></g>`;
    let vine = "", lv = "";
    for (let a = 0; a <= 360; a += 5) { const r = 81 + 5.5 * Math.sin((a * Math.PI) / 22.5); vine += (a ? "L" : "M") + pol(r, a).join(" "); }
    for (let i = 0; i < 16; i++) { const a = i * 22.5 + 6, out = i % 2 === 0; lv += at(out ? 86 : 77.5, a, `<use href='#iv' transform='rotate(${out ? 30 : 150}) scale(${out ? 0.85 : 0.6})'/>`); }
    return frameDoc(defs, band(81, 6, "url(#m)") + `<path d='${vine}' fill='none' stroke='#2f5a1a' stroke-width='1.6'/>` + lv);
  });

add("emerald-scales", "rare", 480, false,
  N("Zümrüt Pullar", "Emerald Scales", "Smaragdschuppen", "Escamas esmeralda", "Écailles d'émeraude", "Escamas de esmeralda", "Изумрудная чешуя"),
  N("Üst üste binen parlak zümrüt pullar, altın kenarlı.", "Overlapping glossy emerald scales edged in gold.", "Überlappende, glänzende Smaragdschuppen mit Goldrand.", "Escamas esmeralda brillantes y superpuestas con borde dorado.", "Des écailles d'émeraude brillantes qui se chevauchent, bordées d'or.", "Escamas de esmeralda brilhantes e sobrepostas, com borda dourada.", "Перекрывающиеся блестящие изумрудные чешуйки с золотой каймой."),
  () => {
    const defs = rg("sc", ["#c8ffe0", "#2fc47a", "#0a5a34"], 0.5, 0.15, 0.9) + metalGrad("g", "gold", 20) +
      `<path id='s' d='M-4.4 -3.2C-4.4 2 -2 5 0 5.6C2 5 4.4 2 4.4 -3.2Z' fill='url(#sc)' stroke='#04301a' stroke-width='.6'/>`;
    let s = "";
    for (let row = 0; row < 2; row++) for (let i = 0; i < 34; i++) s += at(row ? 78.6 : 84.4, i * (360 / 34) + (row ? 360 / 68 : 0), `<use href='#s' transform='rotate(180)'/>`);
    return frameDoc(defs, circ(81.5, "#04301a", 12) + s + circ(75.4, "url(#g)", 1.4) + circ(88.2, "url(#g)", 1.4));
  });

add("starlit-orbit", "rare", 420, false,
  N("Yıldızlı Yörünge", "Starlit Orbit", "Sternenbahn", "Órbita estrellada", "Orbite étoilée", "Órbita estrelada", "Звёздная орбита"),
  N("Halkayı kesen iki eğik yörünge ve üzerlerinde parlayan yıldızlar.", "Two tilted orbits crossing the ring, with bright stars riding on them.", "Zwei geneigte Umlaufbahnen kreuzen den Ring, darauf leuchtende Sterne.", "Dos órbitas inclinadas cruzan el aro con estrellas brillantes sobre ellas.", "Deux orbites inclinées croisent l'anneau, portant des étoiles brillantes.", "Duas órbitas inclinadas cruzam o aro, com estrelas brilhantes sobre elas.", "Две наклонные орбиты пересекают кольцо, по ним скользят яркие звёзды."),
  () => {
    const defs = metalGrad("m", ["#e6e0ff", "#8f7bff", "#3a2a9e", "#1a1250", "#0a0628"]) + lgU("o", [[0, "#c6b7ff", 0], [0.5, "#ffffff"], [1, "#c6b7ff", 0]], 0, 0, 200, 200);
    const orb = (rot) => `<ellipse cx='100' cy='100' rx='96' ry='30' fill='none' stroke='url(#o)' stroke-width='1.2' transform='rotate(${rot} 100 100)'/>`;
    const st = (x, y, s) => `<path d='${star5(4.4 * s)}' transform='translate(${x} ${y})' fill='#fff7d0' stroke='#ffd76a' stroke-width='.5'/>`;
    return frameDoc(defs, `<g clip-path='url(#cl)'>${orb(-32)}${orb(32)}</g><clipPath id='cl'><path d='${annulus(76, 100)}' clip-rule='evenodd'/></clipPath>` + band(81, 7.5, "url(#m)") + st(23, 52, 1.2) + st(177, 52, 0.9) + st(160, 170, 1) + st(46, 178, 0.75) + `<path d='${sparkle(5)}' transform='translate(100 12)' fill='#fff'/>`);
  });

add("lotus-cradle", "rare", 380, false,
  N("Lotus Beşiği", "Lotus Cradle", "Lotoswiege", "Cuna de loto", "Berceau de lotus", "Berço de lótus", "Лотосовая колыбель"),
  N("Avatarı alttan saran katmanlı lotus yaprakları.", "Layered lotus petals cradling the avatar from below.", "Geschichtete Lotosblätter, die den Avatar von unten umfangen.", "Pétalos de loto en capas que acunan el avatar desde abajo.", "Des pétales de lotus superposés qui bercent l'avatar par en dessous.", "Pétalas de lótus em camadas embalando o avatar por baixo.", "Слоистые лепестки лотоса, обнимающие аватар снизу."),
  () => {
    const defs = lg("p1", ["#fff4fa", "#ffb3d6", "#e05a9a"], 0, 0, 0, 1) + lg("p2", ["#ffe0ef", "#f58cbc", "#b8337a"], 0, 0, 0, 1) + metalGrad("m", ["#fffbe8", "#ffe6a8", "#d4a54a", "#7a5a1a", "#3a2a08"]);
    let back = "", front = "";
    for (let i = 0; i < 9; i++) { const a = 116 + i * 16; back += at(83, a, `<path d='${petal(16, 6.4)}' fill='url(#p2)' stroke='#9a2a64' stroke-width='.6'/><path d='M0 -2V-13' stroke='#fff' stroke-opacity='.4' stroke-width='.6'/>`); }
    for (let i = 0; i < 8; i++) { const a = 124 + i * 16; front += at(84, a, `<path d='${petal(11.5, 5.2)}' fill='url(#p1)' stroke='#b8337a' stroke-width='.6'/>`); }
    return frameDoc(defs, back + band(80.5, 6.5, "url(#m)") + front + [[60, 30], [140, 30], [100, 10]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.6' fill='#ffe6a8'/>`).join(""));
  });
// ---------------------------------------------------------------- more epics (animated, finite)
/** Gear path around (0,0). */
const gearPath = (R, teeth, depth, hole = 0) => {
  let d = "";
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (Math.PI * 2 * i) / (teeth * 2), a1 = (Math.PI * 2 * (i + 1)) / (teeth * 2), rr = i % 2 ? R : R + depth, k = 0.18;
    d += (i ? "L" : "M") + f(rr * Math.sin(a0 + k / teeth)) + " " + f(-rr * Math.cos(a0 + k / teeth)) + "L" + f(rr * Math.sin(a1 - k / teeth)) + " " + f(-rr * Math.cos(a1 - k / teeth));
  }
  d += "Z";
  if (hole) d += `M${-hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0a${hole} ${hole} 0 1 0 ${-2 * hole} 0Z`;
  return d;
};

add("aurora-halo", "epic", 640, true,
  N("Kutup Halesi", "Aurora Halo", "Polarlichtschein", "Halo de aurora", "Halo d'aurore", "Halo de aurora", "Ореол сияния"),
  N("Halkanın üstünde akıp giden yeşil ve mor kutup ışığı perdeleri.", "Green and violet aurora curtains flowing over the ring.", "Grüne und violette Polarlichtschleier, die über den Ring fließen.", "Cortinas de aurora verdes y violetas que fluyen sobre el aro.", "Des voiles d'aurore verts et violets qui ondulent sur l'anneau.", "Cortinas de aurora verdes e violetas fluindo sobre o aro.", "Зелёные и фиолетовые завесы сияния, струящиеся по кольцу."),
  () => {
    const defs = metalGrad("m", ["#9fb4ff", "#2a3a6a", "#101830", "#070b1c", "#02040c"]) + lgU("a", ["#6effc7", "#2fe0a0", "#8f7bff", "#ff6fd0"], 0, 0, 200, 200) + blur("b", 2.2);
    const rib = (r, w, dash, dur, op) => `<circle cx='100' cy='100' r='${r}' fill='none' stroke='url(#a)' stroke-width='${w}' stroke-dasharray='${dash}' stroke-linecap='round' stroke-opacity='${op}' filter='url(#b)'><animate attributeName='stroke-dashoffset' from='0' to='-${dash.split(" ").reduce((a, b) => a + +b, 0)}' dur='${dur}s' repeatCount='3'/></circle>`;
    return frameDoc(defs, band(81, 11, "url(#m)") + rib(84, 7, "40 18 24 30", 6, 0.75) + rib(80, 5, "28 22 50 14", 7, 0.6) + rib(89, 3, "16 30 10 40", 5, 0.8) + circ(81, "#d8fff0", 0.7, " stroke-opacity='.5'") + stars());
    function stars() { const r = rnd(8); let o = ""; for (let i = 0; i < 24; i++) { const [x, y] = pol(77 + r() * 18, r() * 360); o += `<circle cx='${x}' cy='${y}' r='${f(0.4 + r() * 0.7)}' fill='#fff' opacity='${f(0.4 + r() * 0.6)}'/>`; } return o; }
  }, ["animated"]);

add("neon-pulse", "epic", 600, true,
  N("Neon Nabız", "Neon Pulse", "Neonpuls", "Pulso de neón", "Pouls néon", "Pulso neon", "Неоновый пульс"),
  N("İç içe pembe ve camgöbeği neon tüpler, birkaç kez titreyip yanar.", "Nested pink and cyan neon tubes that flicker a few times, then glow steady.", "Ineinanderliegende pinke und cyanfarbene Neonröhren, die kurz flackern und dann ruhig leuchten.", "Tubos de neón rosa y cian que parpadean unas veces y luego brillan fijos.", "Des tubes néon rose et cyan qui grésillent un instant puis brillent sans faiblir.", "Tubos neon rosa e ciano que piscam algumas vezes e depois brilham firmes.", "Вложенные розовая и голубая неоновые трубки мигают и загораются ровным светом."),
  () => {
    const defs = blur("b", 2.6);
    const tube = (r, c, a0, a1, flick) => `<g>${`<path d='${arc(r, a0, a1)}' fill='none' stroke='${c}' stroke-width='6' stroke-linecap='round' stroke-opacity='.7' filter='url(#b)'/><path d='${arc(r, a0, a1)}' fill='none' stroke='${c}' stroke-width='3' stroke-linecap='round'/><path d='${arc(r, a0, a1)}' fill='none' stroke='#fff' stroke-width='1' stroke-linecap='round' stroke-opacity='.9'/>`}${flick ? pulse("opacity", "1;.25;1;.6;1;1;1", 1.6, 2, 0.4) : ""}</g>`;
    const cap = (r, a) => at(r, a, `<rect x='-2.2' y='-3.4' width='4.4' height='6.8' rx='1' fill='#2a2f45' stroke='#6c7392' stroke-width='.6'/>`);
    return frameDoc(defs, circ(82, "#0a0b14", 15, " stroke-opacity='.55'") + tube(86, "#ff3fa4", 18, 332, true) + tube(78.5, "#2ef2ff", 196, 508, false) + cap(86, 14) + cap(86, 336) + cap(78.5, 192) + cap(78.5, 152));
  }, ["animated"]);

add("phoenix-plume", "epic", 860, true,
  N("Anka Tüyü", "Phoenix Plume", "Phönixfeder", "Pluma de fénix", "Plume de phénix", "Pluma de fênix", "Перо феникса"),
  N("Alttan iki yana yükselen alev tüyleri ve havaya savrulan kıvılcımlar.", "Flame feathers rising up both sides from below, with sparks drifting up.", "Flammenfedern, die von unten zu beiden Seiten aufsteigen, dazu tanzende Funken.", "Plumas de fuego que suben por ambos lados con chispas que se elevan.", "Des plumes de flamme montant des deux côtés, avec des étincelles qui s'envolent.", "Penas de fogo subindo dos dois lados, com faíscas flutuando.", "Огненные перья поднимаются с двух сторон снизу, вверх летят искры."),
  () => {
    const defs = lg("fl", ["#fff3b0", "#ffb52e", "#ff4a1a", "#9a0f05"], 0, 1, 0, 0) + lg("fl2", ["#ffe680", "#ff7a1f", "#c4200a"], 0, 1, 0, 0) + metalGrad("m", ["#fff0c0", "#ffb14a", "#c2410c", "#6a1404", "#2a0602"]) + blur("b", 1.5);
    const wing = (dir) => {
      let s = "";
      for (let i = 0; i < 9; i++) { const d = dir < 0 ? 186 + i * 11 : 174 - i * 11; s += blade(pol(82, d), pol(96 - i * 0.4, d + dir * 14), 4.6 - i * 0.15, "url(#fl)", " stroke='#7a1404' stroke-width='.5'"); }
      for (let i = 0; i < 8; i++) { const d = dir < 0 ? 190 + i * 11 : 170 - i * 11; s += blade(pol(81, d), pol(89, d + dir * 9), 3.2, "url(#fl2)"); }
      return `<g>${s}<animateTransform attributeName='transform' type='scale' values='1;1.012;1' additive='sum' dur='1.2s' repeatCount='3'/></g>`;
    };
    const r = rnd(12);
    let sp = "";
    for (let i = 0; i < 9; i++) { const [x, y] = pol(88 + r() * 8, 200 + r() * 320); sp += `<circle cx='${x}' cy='${y}' r='${f(0.8 + r() * 1.2)}' fill='#ffd27a'>${pulse("opacity", "0;1;0", f(1.4 + r()), 3, f(r() * 1.5))}<animateTransform attributeName='transform' type='translate' values='0 0;0 -8' dur='${f(1.4 + r())}s' repeatCount='3'/></circle>`; }
    return frameDoc(defs, `<g filter='url(#b)' opacity='.6'>${circ(84, "#ff6a1f", 6)}</g>` + wing(-1) + wing(1) + band(80.5, 7.5, "url(#m)", { lip: "#ffe0a0" }) + sp);
  }, ["animated"]);

add("tidal-vortex", "epic", 700, true,
  N("Gelgit Girdabı", "Tidal Vortex", "Gezeitenstrudel", "Vórtice de marea", "Vortex des marées", "Vórtice da maré", "Приливный вихрь"),
  N("Halkanın çevresinde dönen dalga çizgileri ve köpük.", "Swirling wave lines and foam turning around the ring.", "Wirbelnde Wellenlinien und Gischt, die um den Ring kreisen.", "Líneas de olas y espuma que giran alrededor del aro.", "Des lignes de vagues et d'écume qui tourbillonnent autour de l'anneau.", "Linhas de ondas e espuma girando em volta do aro.", "Волны и пена, закручивающиеся вокруг кольца."),
  () => {
    const defs = metalGrad("m", ["#d0f6ff", "#3aa8d8", "#145a8a", "#0a2a4a", "#04121f"]) + lgU("w", ["#e6fbff", "#5fd0f0", "#1a6aa0"], 0, 0, 200, 200);
    let sw = "";
    for (let i = 0; i < 12; i++) { const a = i * 30; let d = ""; for (let k = 0; k <= 10; k++) { const [x, y] = pol(76 + k * 1.9, a + k * 5.5); d += (k ? "L" : "M") + `${x} ${y}`; } sw += `<path d='${d}' fill='none' stroke='url(#w)' stroke-width='${i % 2 ? 1.6 : 2.6}' stroke-linecap='round'/>`; }
    const r = rnd(4);
    let foam = "";
    for (let i = 0; i < 26; i++) { const [x, y] = pol(88 + r() * 7, r() * 360); foam += `<circle cx='${x}' cy='${y}' r='${f(0.6 + r() * 1.4)}' fill='#e6fbff' opacity='${f(0.5 + r() * 0.5)}'/>`; }
    return frameDoc(defs, band(81, 11, "url(#m)") + `<g>${sw}${foam}${spin(9, 2)}</g>` + circ(75.6, "#e6fbff", 1, " stroke-opacity='.6'"));
  }, ["animated"]);

add("galaxy-spiral", "epic", 780, true,
  N("Sarmal Galaksi", "Galaxy Spiral", "Spiralgalaxie", "Galaxia espiral", "Galaxie spirale", "Galáxia espiral", "Спиральная галактика"),
  N("Mor ve pembe yıldız tozundan sarmal kollar, ağır ağır döner.", "Spiral arms of violet and pink star dust, slowly turning.", "Spiralarme aus violettem und rosa Sternenstaub, die sich langsam drehen.", "Brazos espirales de polvo estelar violeta y rosa que giran despacio.", "Des bras spiraux de poussière d'étoiles violette et rose qui tournent lentement.", "Braços espirais de poeira estelar violeta e rosa girando devagar.", "Спиральные рукава из фиолетовой и розовой звёздной пыли медленно вращаются."),
  () => {
    const defs = rgU("m", [[0.75, "#05030f", 0], [0.76, "#05030f"], [0.79, "#2b1f6e"], [0.84, "#7a3fd0"], [0.88, "#2b1f6e"], [0.94, "#05030f", 0]], 100, 100, 100) + blur("b", 1.4);
    const r = rnd(66);
    let arms = "";
    for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 30; k++) { const t = k / 30, a = arm * 120 + t * 160, rr = 77 + t * 18 + (r() - 0.5) * 3; const [x, y] = pol(rr, a); arms += `<circle cx='${x}' cy='${y}' r='${f(0.4 + (1 - t) * 1.6 * r())}' fill='${r() > 0.6 ? "#ffb3e6" : r() > 0.5 ? "#c6b7ff" : "#fff"}' opacity='${f(0.5 + r() * 0.5)}'/>`; }
    let haze = "";
    for (let arm = 0; arm < 3; arm++) { let d = ""; for (let k = 0; k <= 12; k++) { const t = k / 12, [x, y] = pol(78 + t * 15, arm * 120 + t * 150); d += (k ? "L" : "M") + `${x} ${y}`; } haze += `<path d='${d}' fill='none' stroke='#a77bff' stroke-width='5' stroke-linecap='round' stroke-opacity='.45' filter='url(#b)'/>`; }
    return frameDoc(defs, `<circle cx='100' cy='100' r='94' fill='url(#m)'/><g>${haze}${arms}${spin(30, 1)}</g>` + band(77, 3, "#c6b7ff", { spec: false, lipOpacity: 0.6 }) + `<path d='${sparkle(6)}' transform='translate(160 30)' fill='#fff'/>`);
  }, ["animated"]);

add("thunder-crown", "epic", 760, true,
  N("Gök Gürültüsü Tacı", "Thunder Crown", "Donnerkrone", "Corona del trueno", "Couronne de tonnerre", "Coroa do trovão", "Громовой венец"),
  N("Üstte şimşeklerden bir taç; çakan ışıklar halkada dolaşır.", "A crown of lightning bolts on top, with flashes racing around the ring.", "Eine Krone aus Blitzen oben, Lichtblitze jagen um den Ring.", "Una corona de rayos arriba, con destellos que recorren el aro.", "Une couronne d'éclairs au sommet, des flashs qui filent autour de l'anneau.", "Uma coroa de raios no topo, com clarões correndo pelo aro.", "Корона из молний сверху и вспышки, бегущие по кольцу."),
  () => {
    const defs = metalGrad("m", "steel") + lg("bo", ["#ffffff", "#bcd6ff", "#5a8cff"], 0, 0, 0, 1) + blur("b", 1.8);
    const bolt = `<path d='M1 -18L-5 -4H0L-3 8L6 -7H1L4 -18Z' fill='url(#bo)' stroke='#1a2a6a' stroke-width='.7'/>`;
    const bolts = [[-38, 0.68], [-19, 0.8], [0, 0.92], [19, 0.8], [38, 0.68]].map(([a, s]) => at(81, a, bolt, s)).join("");
    let zig = "";
    for (let k = 0; k <= 24; k++) { const [x, y] = pol(81 + (k % 2 ? 3.5 : -3.5), 60 + k * 10); zig += (k ? "L" : "M") + `${x} ${y}`; }
    return frameDoc(defs, band(81, 10, "url(#m)") + `<path d='${zig}' fill='none' stroke='#9fc4ff' stroke-width='3' stroke-opacity='.7' filter='url(#b)' opacity='0'>${pulse("opacity", "0;1;0;0;.8;0", 2.2, 3)}</path><path d='${zig}' fill='none' stroke='#fff' stroke-width='.9' opacity='0'>${pulse("opacity", "0;1;0;0;.8;0", 2.2, 3)}</path>` +
      `<g filter='url(#b)' opacity='.8'>${bolts}${pulse("opacity", ".8;.2;.8", 1.1, 3)}</g>` + bolts);
  }, ["animated"]);

add("prism-facet", "epic", 680, true,
  N("Prizma Yüzeyi", "Prism Facet", "Prismenschliff", "Faceta prismática", "Facette prismatique", "Faceta prismática", "Призменная грань"),
  N("Yontulmuş kristal halka; gökkuşağı ışığı yüzeyinde gezinir.", "A cut crystal ring with rainbow light gliding across its facets.", "Ein geschliffener Kristallring, über dessen Facetten Regenbogenlicht gleitet.", "Un aro de cristal tallado con luz de arcoíris deslizándose por sus facetas.", "Un anneau de cristal taillé où glisse une lumière arc-en-ciel.", "Um aro de cristal lapidado com luz de arco-íris deslizando pelas facetas.", "Гранёное хрустальное кольцо, по граням скользит радужный свет."),
  () => {
    const defs = lgU("rb", ["#ff6fb5", "#ffd36a", "#6effc7", "#5fb8ff", "#b18cff", "#ff6fb5"], 0, 0, 200, 0) + `<linearGradient id='rbm' href='#rb'><animateTransform attributeName='gradientTransform' type='rotate' from='0 100 100' to='360 100 100' dur='8s' repeatCount='2'/></linearGradient>`;
    let fac = "";
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a0 = (360 / n) * i, a1 = a0 + 360 / n, am = a0 + 180 / n;
      const P = [pol(75.5, a0), pol(81, am), pol(75.5, a1)], Q = [pol(81, am), pol(87.5, a0), pol(87.5, a1)], R1 = [pol(75.5, a0), pol(81, am), pol(87.5, a0)], R2 = [pol(75.5, a1), pol(81, am), pol(87.5, a1)];
      const p = (pts, op, c = "#fff") => `<path d='M${pts.map((x) => x.join(" ")).join("L")}Z' fill='${c}' fill-opacity='${op}'/>`;
      fac += p(P, 0.08 + (i % 3) * 0.05) + p(Q, 0.28 - (i % 2) * 0.12) + p(R1, 0.04, "#000") + p(R2, 0.16 + (i % 2) * 0.1, "#1a1040");
    }
    return frameDoc(defs, `<path d='${annulus(75.5, 87.5)}' fill='url(#rbm)' fill-rule='evenodd'/>` + fac + `<path d='${annulus(75.5, 87.5)}' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='.8'/>` + `<path d='${sparkle(6)}' transform='translate(38 40)' fill='#fff'>${pulse("opacity", "1;.1;1", 2, 3)}</path>`);
  }, ["animated"]);

add("butterfly-garden", "epic", 740, true,
  N("Kelebek Bahçesi", "Butterfly Garden", "Schmetterlingsgarten", "Jardín de mariposas", "Jardin de papillons", "Jardim de borboletas", "Сад бабочек"),
  N("Çiçekli bir halkaya konmuş, kanat çırpan dört kelebek.", "Four butterflies fluttering on a ring of tiny flowers.", "Vier flatternde Schmetterlinge auf einem Ring aus kleinen Blüten.", "Cuatro mariposas que aletean sobre un aro de florecillas.", "Quatre papillons qui battent des ailes sur un anneau de petites fleurs.", "Quatro borboletas batendo asas sobre um aro de florzinhas.", "Четыре бабочки порхают на кольце из крошечных цветов."),
  () => {
    const defs = metalGrad("m", ["#f0fff4", "#9be0b0", "#3f9a6a", "#1a5a3a", "#0a2a1a"]) + lg("w1", ["#ffe36a", "#ff8a3a", "#b8300a"], 0, 0, 1, 1) + lg("w2", ["#bfe6ff", "#5f8cff", "#3a1aa8"], 0, 0, 1, 1) + lg("w3", ["#ffd0f0", "#ff5fae", "#8a1050"], 0, 0, 1, 1);
    const bf = (x, y, rot, s, g, dur) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'><g><path d='M0 0C-4 -9 -12 -10 -12 -4C-12 1 -6 2 0 0ZM0 0C-3 4 -9 8 -10 5C-11 2 -5 0 0 0Z' fill='url(#${g})' stroke='#1a1020' stroke-width='.6'/><circle cx='-7' cy='-4' r='1.4' fill='#fff' fill-opacity='.8'/><animateTransform attributeName='transform' type='scale' values='1 1;.35 1;1 1' dur='${dur}s' repeatCount='3'/></g><g><path d='M0 0C4 -9 12 -10 12 -4C12 1 6 2 0 0ZM0 0C3 4 9 8 10 5C11 2 5 0 0 0Z' fill='url(#${g})' stroke='#1a1020' stroke-width='.6'/><circle cx='7' cy='-4' r='1.4' fill='#fff' fill-opacity='.8'/><animateTransform attributeName='transform' type='scale' values='1 1;.35 1;1 1' dur='${dur}s' repeatCount='3'/></g><path d='M0 -5V5' stroke='#1a1020' stroke-width='1.6' stroke-linecap='round'/><path d='M0 -5L-2 -8M0 -5L2 -8' stroke='#1a1020' stroke-width='.5'/></g>`;
    let fl = "";
    for (let i = 0; i < 18; i++) { const [x, y] = pol(81, i * 20 + 10); fl += `<g transform='translate(${x} ${y})'>${[0, 72, 144, 216, 288].map((a) => `<circle cy='-1.7' r='1.5' fill='${["#fff", "#ffd0f0", "#fff3b0"][i % 3]}' transform='rotate(${a})'/>`).join("")}<circle r='1' fill='#ffb52e'/></g>`; }
    return frameDoc(defs, band(81, 8, "url(#m)") + fl + bf(...pol(88, 318), -30, 1.6, "w1", 0.5) + bf(...pol(89, 58), 25, 1.35, "w2", 0.6) + bf(...pol(88, 148), 140, 1.25, "w3", 0.45) + bf(...pol(90, 232), -120, 1.1, "w1", 0.55));
  }, ["animated"]);

add("cyber-visor", "epic", 620, true,
  N("Siber Vizör", "Cyber Visor", "Cybervisier", "Visor cibernético", "Visière cyber", "Visor cibernético", "Кибервизор"),
  N("Ters yönlere dönen ekran halkaları, ölçek çizgileri ve hedef işaretleri.", "Display rings turning in opposite directions, with scale marks and target ticks.", "Gegenläufig drehende Anzeigeringe mit Skalenstrichen und Zielmarken.", "Anillos de pantalla que giran en sentidos opuestos, con escalas y marcas de mira.", "Des anneaux d'affichage tournant en sens inverse, avec graduations et repères de visée.", "Anéis de tela girando em sentidos opostos, com escalas e marcas de mira.", "Кольца дисплея, вращающиеся в разные стороны, со шкалой и метками прицела."),
  () => {
    const defs = blur("b", 1.3);
    const seg = (r, w, parts, c, op = 1) => parts.map(([a, b]) => `<path d='${arc(r, a, b)}' fill='none' stroke='${c}' stroke-width='${w}' stroke-opacity='${op}'/>`).join("");
    const g1 = seg(80, 4, [[10, 80], [100, 150], [170, 250], [270, 340]], "#2ef2ff") + seg(80, 8, [[10, 80], [170, 250]], "#2ef2ff", 0.25);
    const g2 = seg(87, 1.6, [[0, 40], [60, 160], [200, 230], [250, 330]], "#ffb000") + ticks(89, 92, 36, "#ffb000", 0.8);
    const g3 = seg(75.8, 1.2, [[0, 360]], "#2ef2ff", 0.6);
    const reticle = [0, 90, 180, 270].map((a) => at(95, a, `<path d='M-3 -3L0 2L3 -3' fill='none' stroke='#ff3f6a' stroke-width='1.4'/>`)).join("");
    return frameDoc(defs, circ(82, "#05101a", 15, " stroke-opacity='.6'") + `<g filter='url(#b)' opacity='.8'>${g1}</g><g>${g1}${spin(10, 2)}</g><g>${g2}${spin(14, 1, -1)}</g>` + g3 + reticle);
  }, ["animated"]);

add("frost-crown", "epic", 720, true,
  N("Ayaz Tacı", "Frost Crown", "Frostkrone", "Corona de escarcha", "Couronne de givre", "Coroa de geada", "Морозный венец"),
  N("Tepede büyük bir kar tanesi, buz halkada parıldayan kırağı.", "A large snowflake on top and sparkling rime along an ice ring.", "Eine große Schneeflocke oben und glitzernder Raureif auf einem Eisring.", "Un gran copo de nieve arriba y escarcha que brilla sobre un aro de hielo.", "Un grand flocon au sommet et du givre scintillant sur un anneau de glace.", "Um grande floco de neve no topo e geada cintilando em um aro de gelo.", "Большая снежинка сверху и сверкающий иней на ледяном кольце."),
  () => {
    const arm = "M0 0V-12M0 -5L-3 -8M0 -5L3 -8M0 -9L-2 -11M0 -9L2 -11";
    let fp = "";
    for (let i = 0; i < 6; i++) fp += `<path d='${arm}' transform='rotate(${i * 60})'/>`;
    const fdefs = `<g id='fk' fill='none' stroke-linecap='round'><g stroke='#2a6a9a' stroke-width='3'>${fp}</g><g stroke='#fff' stroke-width='1.5'>${fp}</g><circle r='2' fill='#fff'/></g>`;
    const flake = (s) => `<use href='#fk' transform='scale(${s})'/>`;
    const defs = metalGrad("m", ["#ffffff", "#d8f3ff", "#7ac6ef", "#2a6a9a", "#0c2a44"]) + fdefs;
    let rime = "";
    for (let i = 0; i < 30; i++) rime += at(86.5, i * 12 + 6, `<path d='M-1.6 0L0 -${3 + (i % 3) * 1.6}L1.6 0Z' fill='#e8f8ff' stroke='#7ac6ef' stroke-width='.4'/>`);
    const tw = [[60, 28], [146, 34], [176, 120], [30, 150], [120, 186]].map(([x, y], i) => `<path d='${sparkle(4.5)}' transform='translate(${x} ${y})' fill='#fff' opacity='.2'>${pulse("opacity", ".2;1;.2", 1.8, 3, i * 0.5)}</path>`).join("");
    return frameDoc(defs, rime + band(81, 9, "url(#m)") + `<g transform='translate(100 14)'>${flake(0.95)}</g><g transform='translate(76 20)'>${flake(0.5)}</g><g transform='translate(124 20)'>${flake(0.5)}</g>` + tw);
  }, ["animated"]);

add("lantern-festival", "epic", 660, true,
  N("Fener Şenliği", "Lantern Festival", "Laternenfest", "Festival de faroles", "Fête des lanternes", "Festival das lanternas", "Праздник фонарей"),
  N("Halkanın altında asılı, hafifçe sallanan sıcak kâğıt fenerler.", "Warm paper lanterns hanging under the ring, gently swaying.", "Warme Papierlaternen, die unter dem Ring hängen und sanft schaukeln.", "Faroles de papel cálidos colgados bajo el aro que se mecen suavemente.", "Des lanternes de papier chaleureuses suspendues sous l'anneau, qui se balancent doucement.", "Lanternas de papel quentes penduradas sob o aro, balançando de leve.", "Тёплые бумажные фонарики висят под кольцом и тихо покачиваются."),
  () => {
    const defs = metalGrad("m", ["#ffe6c0", "#c48a4a", "#7a4a1a", "#3a2008", "#1a0c02"]) + rg("ln", ["#fff3c0", "#ffb03a", "#d0401a"], 0.5, 0.45, 0.6) + rg("gl", [[0, "#ffcf6a", 0.7], [1, "#ffcf6a", 0]]);
    const lantern = (a, s, i) => { const [x, y] = pol(83, a); return `<g transform='translate(${x} ${y})'><g><path d='M0 0V${f(5 * s)}' stroke='#3a2008' stroke-width='.7'/><g transform='translate(0 ${f(5 * s)}) scale(${s})'><circle cy='7' r='11' fill='url(#gl)'/><rect x='-3' y='-1' width='6' height='2' rx='.6' fill='#5a2a0a'/><ellipse cy='7' rx='6.4' ry='8' fill='url(#ln)' stroke='#8a2a0a' stroke-width='.6'/><path d='M-3.4 1.5Q-5 7 -3.4 12.5M3.4 1.5Q5 7 3.4 12.5M0 -1V15' stroke='#8a2a0a' stroke-width='.5' fill='none' stroke-opacity='.7'/><rect x='-3' y='14' width='6' height='2' rx='.6' fill='#5a2a0a'/><path d='M0 16V20' stroke='#d0401a' stroke-width='1'/></g><animateTransform attributeName='transform' type='rotate' values='-6;6;-6' dur='${f(2.4 + i * 0.3)}s' repeatCount='3'/></g></g>`; };
    const string = `<path d='${arc(83, 100, 260)}' fill='none' stroke='#3a2008' stroke-width='.8'/>`;
    return frameDoc(defs, band(80, 6.5, "url(#m)") + string + [[110, 0.7], [135, 0.85], [160, 1], [200, 1], [225, 0.85], [250, 0.7]].map(([a, s], i) => lantern(a, s, i)).join(""));
  }, ["animated"]);

add("koi-circle", "epic", 840, true,
  N("Koi Halkası", "Koi Circle", "Koikreis", "Círculo koi", "Cercle de koï", "Círculo de carpas", "Круг кои"),
  N("Su halkasında birbirini kovalayan iki koi balığı ve dalgacıklar.", "Two koi chasing each other around a ring of water, leaving ripples.", "Zwei Koi, die sich in einem Wasserring jagen und Kreise ziehen.", "Dos carpas koi que se persiguen en un aro de agua dejando ondas.", "Deux koïs qui se poursuivent dans un anneau d'eau en laissant des rides.", "Duas carpas koi se perseguindo em um aro de água, deixando ondulações.", "Два кои гоняются друг за другом в водяном кольце, оставляя круги."),
  () => {
    const defs = rgU("m", [[0.74, "#062a3a"], [0.8, "#0f5a6e"], [0.86, "#2aa0b0"], [0.9, "#0f5a6e"], [0.93, "#062a3a"]], 100, 100, 94) + lg("k1", ["#ffffff", "#ffe8d8"], 0, 0, 0, 1) + lg("k2", ["#2a2a33", "#0a0a10"], 0, 0, 0, 1);
    const koi = (body, spot, sc) => `<g transform='scale(${sc})'><path d='M0 -11C4 -9 4.5 -2 3 4C2 8 1 10 0 12C-1 10 -2 8 -3 4C-4.5 -2 -4 -9 0 -11Z' fill='url(#${body})' stroke='#1a1a22' stroke-width='.5'/><path d='M0 11L-4 17L0 14.5L4 17Z' fill='url(#${body})' stroke='#1a1a22' stroke-width='.5'/><path d='M-3 -2L-7 1L-3 2ZM3 -2L7 1L3 2Z' fill='url(#${body})' stroke='#1a1a22' stroke-width='.4'/><path d='M-2 -6C0 -8 2.5 -6 2 -3C1 -1 -2 -2 -2 -6ZM-1.5 3C1 1.5 2.6 4 1.4 6C0 7 -2 5.5 -1.5 3Z' fill='${spot}'/><circle cx='-1.6' cy='-8.2' r='.6' fill='#000'/><circle cx='1.6' cy='-8.2' r='.6' fill='#000'/></g>`;
    let rip = "";
    for (let i = 0; i < 8; i++) rip += `<path d='${arc(81 + (i % 2 ? 2.5 : -2.5), i * 45 + 10, i * 45 + 30)}' fill='none' stroke='#bff6ff' stroke-opacity='.45' stroke-width='.8'/>`;
    const k1 = at(81.5, 0, `<g transform='rotate(90)'>${koi("k1", "#ff5a1f", 1.45)}</g>`);
    const k2 = at(81.5, 180, `<g transform='rotate(90)'>${koi("k2", "#f2b630", 1.3)}</g>`);
    return frameDoc(defs, `<path d='${annulus(75.5, 87)}' fill='url(#m)' fill-rule='evenodd'/>` + band(81.2, 11.5, "none") + rip + `<g>${k1}${k2}${spin(16, 1)}</g>` + `<circle cx='158' cy='160' r='6' fill='#2f8a4a' stroke='#0a3a1a' stroke-width='.6'/><path d='M158 160L164 157' stroke='#0a3a1a' stroke-width='.8'/>`);
  }, ["animated"]);

add("celestial-clock", "epic", 880, true,
  N("Gök Saati", "Celestial Clock", "Himmelsuhr", "Reloj celeste", "Horloge céleste", "Relógio celeste", "Небесные часы"),
  N("Pirinç bir usturlap; iç halkası yıldız işaretleriyle yavaşça döner.", "A brass astrolabe whose inner ring of star marks slowly turns.", "Ein Messing-Astrolabium, dessen innerer Sternenring sich langsam dreht.", "Un astrolabio de latón cuyo anillo interior de estrellas gira despacio.", "Un astrolabe de laiton dont l'anneau d'étoiles intérieur tourne lentement.", "Um astrolábio de latão cujo anel interno de estrelas gira devagar.", "Латунная астролябия, внутреннее кольцо со звёздами медленно вращается."),
  () => {
    const defs = metalGrad("m", "brass") + metalGrad("n", ["#d8e2ff", "#5a6aa8", "#1e2a5a", "#0c1430", "#050a1a"], 30);
    let st = "";
    for (let i = 0; i < 12; i++) st += at(79.6, i * 30 + 15, `<path d='${star5(2.2)}' fill='#ffe9a8'/>`, 1, true);
    const outer = band(87.5, 5, "url(#m)") + ticks(85.4, 87.5, 72, "#3a2a06", 0.6, 6, 84.6, 1.2);
    const inner = `<g>${band(79.6, 7.2, "url(#n)", { spec: false })}${st}${spin(40, 1, -1)}</g>`;
    const pointer = `<path d='M100 6L104 16H96Z' fill='url(#m)' stroke='#3a2a06' stroke-width='.6'/><circle cx='100' cy='5' r='2.6' fill='url(#m)' stroke='#3a2a06' stroke-width='.6'/>`;
    const arms = [45, 135, 225, 315].map((a) => at(91, a, `<circle r='2.6' fill='url(#m)' stroke='#3a2a06' stroke-width='.5'/><circle r='1' fill='#3a2a06'/>`)).join("");
    return frameDoc(defs, inner + outer + pointer + arms + `<path d='${arc(83.3, 300, 340)}' stroke='#fff' stroke-opacity='.5' stroke-width='1' fill='none'/>`);
  }, ["animated"]);

// ---------------------------------------------------------------- more legendaries
add("abyssal-leviathan", "legendary", 1400, true,
  N("Derinlik Canavarı", "Abyssal Leviathan", "Abgrundleviathan", "Leviatán abisal", "Léviathan des abysses", "Leviatã abissal", "Левиафан бездны"),
  N("Halkaya dolanan pullu bir deniz yılanı; gözleri karanlıkta yanar.", "A scaled sea serpent coiled around the ring, its eyes burning in the dark.", "Eine geschuppte Seeschlange um den Ring, deren Augen im Dunkeln glühen.", "Una serpiente marina escamosa enroscada al aro, con ojos que arden en la oscuridad.", "Un serpent de mer écailleux enroulé autour de l'anneau, aux yeux brûlants.", "Uma serpente marinha escamosa enrolada no aro, com olhos que ardem no escuro.", "Чешуйчатый морской змей обвил кольцо, его глаза горят в темноте."),
  () => {
    const defs = lgU("bd", ["#6ff0d8", "#13806e", "#063a3a", "#0e6a5e", "#9ffff0"], 0, 0, 200, 200) + rg("ey", ["#ffffff", "#ffe36a", "#ff6a00"], 0.5, 0.5, 0.5) + blur("b", 2) + metalGrad("m", ["#bffff0", "#2aa08a", "#0a4a40", "#042220", "#010a0a"]);
    let body = "", scales = "";
    const pts = [];
    for (let a = 40; a <= 395; a += 5) { const r = 83 + 4.5 * Math.sin(((a - 40) * Math.PI) / 50); pts.push(pol(r, a)); }
    body = "M" + pts.map((p) => p.join(" ")).join("L");
    for (let i = 2; i < pts.length - 2; i += 2) scales += `<circle cx='${pts[i][0]}' cy='${pts[i][1]}' r='1.6' fill='none' stroke='#bffff0' stroke-opacity='.45' stroke-width='.6'/>`;
    const finsAt = [100, 170, 240, 310].map((a) => at(88, a, `<path d='M-6 0Q-2 -9 6 -4Q2 -2 4 2Z' fill='#13806e' stroke='#042220' stroke-width='.6'/>`)).join("");
    const [hx, hy] = pol(85, 36);
    const head = `<g transform='translate(${hx} ${hy}) rotate(-40) scale(1.45)'><path d='M-7 4C-8 -6 -2 -14 6 -15C12 -14 14 -8 10 -3C6 1 2 3 -7 4Z' fill='url(#bd)' stroke='#042220' stroke-width='.8'/><path d='M2 -14L-1 -21L5 -15M7 -14L8 -21L10 -13' fill='#6ff0d8' stroke='#042220' stroke-width='.6'/><path d='M10 -3L14 0L9 0' fill='#fff'/><circle cx='5' cy='-9' r='2.4' fill='url(#ey)'>${pulse("r", "2.4;3;2.4", 1.6, 3)}</circle><circle cx='5' cy='-9' r='5' fill='#ffb000' fill-opacity='.35' filter='url(#b)'/></g>`;
    return frameDoc(defs, band(80, 6, "url(#m)") + finsAt + `<path d='${body}' fill='none' stroke='#042220' stroke-width='9.5' stroke-linecap='round'/><path d='${body}' fill='none' stroke='url(#bd)' stroke-width='7.5' stroke-linecap='round'/><path d='${body}' fill='none' stroke='#dffff8' stroke-opacity='.4' stroke-width='1.2' transform='translate(-.8 -.8)'/>` + scales + head + `<g>${[[30, 150], [170, 130], [140, 182]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.8' fill='none' stroke='#bffff0' stroke-width='.6'/>`).join("")}<animateTransform attributeName='transform' type='translate' values='0 0;0 -6;0 0' dur='3s' repeatCount='3'/></g>`);
  }, ["animated"]);

add("starforged", "legendary", 1200, true,
  N("Yıldız Dövmesi", "Starforged", "Sternengeschmiedet", "Forjado en estrellas", "Forgé dans les étoiles", "Forjado nas estrelas", "Звёздная ковка"),
  N("Kozmik kakmalı koyu metal halka ve çevresinde dolanan bir kuyruklu yıldız.", "A dark metal ring inlaid with a nebula, with a comet orbiting around it.", "Ein dunkler Metallring mit Nebel-Intarsie, um den ein Komet kreist.", "Un aro de metal oscuro con incrustación de nebulosa y un cometa en órbita.", "Un anneau de métal sombre incrusté de nébuleuse, autour duquel orbite une comète.", "Um aro de metal escuro com incrustação de nebulosa e um cometa em órbita.", "Тёмное металлическое кольцо с туманностью-инкрустацией и кометой на орбите."),
  () => {
    const defs = metalGrad("m", ["#e6ecff", "#7b86a8", "#2a3048", "#121626", "#06080f"]) + lgU("nb", ["#ff6fd0", "#7c5cff", "#2ef2ff", "#7c5cff", "#ff6fd0"], 0, 0, 200, 200) + lg("ct", [[0, "#ffffff", 0], [1, "#bfe6ff"]], 0, 0, 1, 0) + blur("b", 1.2);
    const r = rnd(5);
    let st = "";
    for (let i = 0; i < 30; i++) { const [x, y] = pol(79 + r() * 6, r() * 360); st += `<circle cx='${x}' cy='${y}' r='${f(0.3 + r() * 0.6)}' fill='#fff' opacity='${f(0.5 + r() * 0.5)}'/>`; }
    const rivets = [0, 60, 120, 180, 240, 300].map((a) => at(81.5, a, `<path d='${star5(3.2)}' fill='#ffe9a8' stroke='#5a4a10' stroke-width='.5'/>`, 1, true)).join("");
    const comet = `<g><g transform='translate(${pol(93, 0).join(" ")})'><path d='M0 -1.6L-30 0L0 1.6Z' fill='url(#ct)' transform='rotate(0)'/><circle r='2.6' fill='#fff'/><circle r='5' fill='#bfe6ff' fill-opacity='.4' filter='url(#b)'/></g>${spin(12, 2)}</g>`;
    return frameDoc(defs, band(81.5, 13, "url(#m)") + `<path d='${annulus(78.5, 84.5)}' fill='url(#nb)' fill-rule='evenodd' opacity='.85'/>` + st + circ(78.5, "#c6cbe0", 0.8) + circ(84.5, "#c6cbe0", 0.8) + rivets + `<path d='${arc(93, 300, 359)}' fill='none' stroke='#bfe6ff' stroke-opacity='.25' stroke-width='.8'/>` + comet);
  }, ["animated"]);

add("eclipse-throne", "legendary", 1300, true,
  N("Tutulma Tahtı", "Eclipse Throne", "Finsternisthron", "Trono del eclipse", "Trône de l'éclipse", "Trono do eclipse", "Трон затмения"),
  N("Siyah güneş halkasından taşan korona ışınları ve sağ üstte elmas parıltısı.", "Corona streamers spilling from a black sun ring, with a diamond flare at the top right.", "Koronastrahlen, die aus einem schwarzen Sonnenring strömen, oben rechts ein Diamantblitz.", "Rayos de corona que brotan de un aro de sol negro, con un destello de diamante arriba a la derecha.", "Des jets de couronne jaillissant d'un anneau de soleil noir, avec un éclat de diamant en haut à droite.", "Raios de coroa saindo de um aro de sol negro, com um brilho de diamante no alto à direita.", "Лучи короны, льющиеся из кольца чёрного солнца, и бриллиантовая вспышка справа сверху."),
  () => {
    const defs = rgU("co", [[0.75, "#fff8e0", 0], [0.76, "#fff8e0", 0.95], [0.8, "#ffe9a8", 0.6], [0.9, "#c6b7ff", 0.25], [1, "#c6b7ff", 0]], 100, 100, 100) + metalGrad("m", "obsidian") + blur("b", 2.4) + rg("fl", [[0, "#ffffff"], [0.3, "#fff6d8", 0.8], [1, "#fff6d8", 0]]);
    const r = rnd(14);
    let str = "";
    for (let i = 0; i < 26; i++) { const a = i * (360 / 26) + r() * 6, len = 8 + r() * 14, w = 1.5 + r() * 2.5; str += blade(pol(80, a), pol(80 + len, a + (r() - 0.5) * 8), w, "#fff6d8", ` fill-opacity='${f(0.35 + r() * 0.4)}'`); }
    const flare = `<g transform='translate(${pol(82, 42).join(" ")})'><circle r='14' fill='url(#fl)'>${pulse("r", "14;18;14", 2.2, 3)}</circle><path d='${sparkle(16, 0.08)}' fill='#fff'/><circle r='3.2' fill='#fff'/></g>`;
    return frameDoc(defs, `<circle cx='100' cy='100' r='99' fill='url(#co)'/><g filter='url(#b)'>${str}</g>${str}` + band(80, 8, "url(#m)", { lip: "#fff8e0", lipOpacity: 0.9 }) + circ(84, "#fff8e0", 1.4, " stroke-opacity='.9'") + flare);
  }, ["animated"]);

add("emerald-sanctum", "legendary", 1100, true,
  N("Zümrüt Mabet", "Emerald Sanctum", "Smaragdheiligtum", "Santuario esmeralda", "Sanctuaire d'émeraude", "Santuário de esmeralda", "Изумрудное святилище"),
  N("Altın telkari kıvrımlar, zümrütler ve tepede kemerli bir arma.", "Gold filigree scrolls set with emeralds, under an arched crest.", "Goldene Filigranranken mit Smaragden, gekrönt von einem Bogenwappen.", "Volutas de filigrana dorada con esmeraldas bajo un blasón en arco.", "Des volutes de filigrane d'or serties d'émeraudes, sous un écusson en arche.", "Volutas de filigrana dourada com esmeraldas sob um brasão em arco.", "Золотая филигрань с изумрудами под арочным гербом."),
  () => {
    const defs = metalGrad("m", "gold") + gemDefs("e", "#c8ffe0", "#12a058", "#03381c") + cabDefs("c", "#c8ffe0", "#12a058", "#03381c", 3);
    const scroll = `<path d='M0 0C-6 -2 -9 -8 -6 -11C-3 -13 0 -10 -2 -8C-3 -7 -4.5 -8 -4 -9.4' fill='none' stroke='url(#m)' stroke-width='1.8' stroke-linecap='round'/><path d='M0 0C6 -2 9 -8 6 -11C3 -13 0 -10 2 -8C3 -7 4.5 -8 4 -9.4' fill='none' stroke='url(#m)' stroke-width='1.8' stroke-linecap='round'/>`;
    let s = "";
    for (let i = 0; i < 12; i++) { const a = i * 30 + 15; if (a > 330 || a < 30) continue; s += at(85, a, scroll); s += at(81, a, `<use href='#c'/>`, 1, true); }
    const crest = `<path d='M78 28C78 12 88 4 100 2C112 4 122 12 122 28' fill='none' stroke='url(#m)' stroke-width='3.2'/><path d='M84 27C84 16 91 10 100 8.5C109 10 116 16 116 27' fill='none' stroke='url(#m)' stroke-width='1.4'/><use href='#e' transform='translate(100 17) scale(1.4)'/><path d='${sparkle(6)}' transform='translate(100 17)' fill='#fff' opacity='0'>${pulse("opacity", "0;1;0", 1.8, 3, 0.4)}</path>`;
    return frameDoc(defs, band(80.5, 8, "url(#m)") + circ(80.5, "#7a4a0c", 0.8, " stroke-dasharray='1 2.4'") + s + crest + at(92, 180, `<use href='#e' transform='rotate(180) scale(1.1)'/>`));
  }, ["animated"]);

add("infinity-engine", "legendary", 1250, true,
  N("Sonsuzluk Motoru", "Infinity Engine", "Unendlichkeitsmaschine", "Motor infinito", "Moteur infini", "Motor do infinito", "Двигатель вечности"),
  N("Halkanın çevresinde birbirine geçip farklı hızlarda dönen dişliler ve buhar.", "Interlocking gears turning at different speeds around the ring, venting steam.", "Ineinandergreifende Zahnräder, die sich unterschiedlich schnell drehen und Dampf ablassen.", "Engranajes entrelazados que giran a distintas velocidades y sueltan vapor.", "Des engrenages imbriqués tournant à des vitesses différentes, crachant de la vapeur.", "Engrenagens encaixadas girando em velocidades diferentes, soltando vapor.", "Сцепленные шестерни вращаются с разной скоростью и выпускают пар."),
  () => {
    const defs = metalGrad("m", "bronze") + metalGrad("n", "brass", 30) + metalGrad("s", "steel", 60) + blur("b", 2.5);
    const g = (deg, rr, R, teeth, fill, dur, dir) => { const [x, y] = pol(rr, deg); return `<g transform='translate(${x} ${y})'><g><path d='${gearPath(R, teeth, R * 0.22, R * 0.35)}' fill='${fill}' fill-rule='evenodd' stroke='#1a1004' stroke-width='.7'/><circle r='${f(R * 0.55)}' fill='none' stroke='#1a1004' stroke-opacity='.5' stroke-width='.6'/><animateTransform attributeName='transform' type='rotate' from='0' to='${dir * 360}' dur='${dur}s' repeatCount='2'/></g></g>`; };
    const steam = [[150, 20], [40, 44]].map(([x, y], i) => `<g filter='url(#b)'><circle cx='${x}' cy='${y}' r='5' fill='#e8eef8' opacity='0'>${pulse("opacity", "0;.7;0", 2.4, 3, i)}<animate attributeName='cy' values='${y};${y - 12}' dur='2.4s' repeatCount='3' begin='${i}s'/></circle></g>`).join("");
    return frameDoc(defs, band(81, 8, "url(#s)") + g(28, 87, 12.5, 12, "url(#n)", 8, 1) + g(64, 89, 8.5, 9, "url(#m)", 5.6, -1) + g(148, 87, 11, 11, "url(#m)", 7, -1) + g(208, 87, 13, 13, "url(#n)", 9, 1) + g(250, 89, 8.5, 9, "url(#m)", 5.6, -1) + g(318, 87, 11, 11, "url(#n)", 7, 1) + ticks(77, 79, 48, "#1a1004", 0.8) + steam);
  }, ["animated"]);

add("seraph-bloom", "legendary", 1500, true,
  N("Melek Çiçeği", "Seraph Bloom", "Seraphenblüte", "Flor seráfica", "Floraison séraphique", "Flor seráfica", "Цветок серафима"),
  N("Avatarı saran iki kat ışıl ışıl taç yaprak ve havada süzülen polen.", "Two layers of luminous petals around the avatar, with pollen floating in the air.", "Zwei Lagen leuchtender Blütenblätter um den Avatar, dazu schwebender Pollen.", "Dos capas de pétalos luminosos alrededor del avatar y polen flotando.", "Deux couronnes de pétales lumineux autour de l'avatar, et du pollen qui flotte.", "Duas camadas de pétalas luminosas em volta do avatar, com pólen flutuando.", "Два слоя сияющих лепестков вокруг аватара и парящая пыльца."),
  () => {
    const defs = lg("p1", ["#ffffff", "#ffd6ea", "#f28ab8"], 0, 0, 0, 1) + lg("p2", ["#fff7d8", "#ffd27a", "#d48a1a"], 0, 0, 0, 1) + rgU("h", [[0.75, "#fff0f7", 0], [0.76, "#fff0f7", 0.8], [0.86, "#ffd6ea", 0.3], [1, "#ffd6ea", 0]], 100, 100, 100) +
      `<path id='a' d='${leaf(22, 9)}' fill='url(#p1)' stroke='#c4527e' stroke-width='.5' transform='translate(100 23)'/><path id='b' d='${leaf(14, 6.5)}' fill='url(#p2)' stroke='#b8701a' stroke-width='.5' transform='translate(100 24)'/>`;
    let pl = "";
    const r = rnd(70);
    for (let i = 0; i < 14; i++) { const [x, y] = pol(86 + r() * 12, r() * 360); pl += `<circle cx='${x}' cy='${y}' r='${f(0.8 + r() * 1.1)}' fill='#fff3b0'>${pulse("opacity", "1;.2;1", f(1.6 + r() * 1.4), 3, f(r() * 2))}</circle>`; }
    return frameDoc(defs, `<circle cx='100' cy='100' r='99' fill='url(#h)'/><g>${around("a", 20, 9)}<animateTransform attributeName='transform' type='rotate' values='0 100 100;6 100 100;0 100 100' dur='5s' repeatCount='2'/></g>` + around("b", 20, 0) + circ(77, "#fff", 1.6, " stroke-opacity='.85'") + circ(77, "#f28ab8", 0.6) + pl);
  }, ["animated"]);

module.exports = { FRAMES, N };
