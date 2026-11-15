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

module.exports = { FRAMES, N };
