"use strict";
// Market 2.0 C1: single (non-set) profile banners, 600 x 200 (3:1), cover-scaled.
// Focal art sits right of centre; the bottom-left stays calm because the avatar overlaps it.
const L = require("./c1-lib");
const { f, fi, rnd, lg, rg, lgU, rgU, blur, sparkle, star5, poly, leaf, petal, pulse, ridge, hills, waveLine, stars, twinkles, pine, pineRow, skyline, cloud, cloudBand, scatter, bannerDoc } = L;
const { N } = require("./c1-frames");

const BANNERS = [];
const add = (slug, rarity, price, anim, name, desc, art, tags = []) => BANNERS.push({ slug, rarity, price, anim, name, desc, art, tags });

/** Sky rect with vertical gradient stops. */
const sky = (id, stops) => ({ d: lg(id, stops, 0, 0, 0, 1), b: `<rect width='600' height='200' fill='url(#${id})'/>` });
/** Soft radial glow circle. */
const glow = (id, color, a = 0.7) => rg(id, [[0, color, a], [1, color, 0]]);
/** Mirror a group vertically around y (reflection). */
const mirror = (y, inner, op = 0.35) => `<g transform='translate(0 ${2 * y}) scale(1 -1)' opacity='${op}'>${inner}</g>`;

// ================================================================= common
add("dawn-ridge", "common", 220, false,
  N("Şafak Sırtları", "Dawn Ridge", "Morgengrat", "Crestas al alba", "Crêtes de l'aube", "Cristas ao amanhecer", "Рассветный хребет"),
  N("Pastel şafakta kat kat dağ sırtları ve sise karışan güneş.", "Layered mountain ridges at a pastel dawn, the sun melting into the mist.", "Gestaffelte Bergkämme im Pastellmorgen, die Sonne zerfließt im Dunst.", "Crestas montañosas en capas al alba pastel, con el sol fundiéndose en la bruma.", "Des crêtes en couches à l'aube pastel, le soleil fondu dans la brume.", "Cristas de montanha em camadas no amanhecer pastel, com o sol se dissolvendo na névoa.", "Слои горных хребтов на пастельном рассвете, солнце тает в тумане."),
  () => {
    const s = sky("s", [[0, "#1c2452"], [0.45, "#7a5a9e"], [0.75, "#f2a08a"], [1, "#ffd9a8"]]);
    const cols = ["#b993c0", "#8f6aa8", "#68508e", "#433872", "#241e4a"];
    let body = s.b + `<circle cx='430' cy='112' r='90' fill='url(#g)'/><circle cx='430' cy='112' r='20' fill='#fff1d0'/>`;
    cols.forEach((c, i) => { body += `<path d='${ridge(11 + i * 7, 92 + i * 22, 40 - i * 4, 0.55, 200, 64, i === 1 ? [[440, 30, 120]] : i === 0 ? [[300, 20, 90]] : null)}' fill='${c}'/>`; if (i < 4) body += `<rect y='${100 + i * 22}' width='600' height='26' fill='url(#mi)'/>`; });
    body += `<path d='M470 70l6 4l6 -4M490 80l4 3l4 -3M456 84l4 3l4 -3' fill='none' stroke='#2a2050' stroke-width='1.4' stroke-linecap='round'/>`;
    return bannerDoc(s.d + glow("g", "#ffd9a8", 0.8) + lg("mi", [[0, "#ffe0c8", 0], [0.5, "#ffe0c8", 0.25], [1, "#ffe0c8", 0]]), body, 0.35);
  });

add("midnight-dunes", "common", 200, false,
  N("Gece Kumulları", "Midnight Dunes", "Mitternachtsdünen", "Dunas de medianoche", "Dunes de minuit", "Dunas da meia-noite", "Полуночные дюны"),
  N("Dolunayın gümüş ışığında yumuşak kum tepeleri ve yıldızlar.", "Soft sand dunes under the silver light of a full moon and its stars.", "Sanfte Sanddünen im silbernen Licht des Vollmonds unter Sternen.", "Suaves dunas de arena bajo la luz plateada de la luna llena y sus estrellas.", "De douces dunes de sable sous la lumière argentée de la pleine lune.", "Dunas de areia suaves sob a luz prateada da lua cheia e das estrelas.", "Мягкие песчаные дюны в серебряном свете полной луны и звёзд."),
  () => {
    const s = sky("s", [[0, "#050a1e"], [0.6, "#13254a"], [1, "#2c3f6e"]]);
    const dune = (y, waves, c1, c2, id) => `<path d='${hills(y, waves)}' fill='url(#${id})'/><path d='${hills(y, waves).replace(/L600 200L0 200Z|M0 200/g, "").replace(/^L/, "M")}' fill='none' stroke='${c1}' stroke-width='1.6' stroke-opacity='.7'/>`;
    const body = s.b + stars(3, 90, [0, 0, 600, 120], ["#fff", "#cfe0ff"], 1.1, 4) + `<circle cx='460' cy='58' r='80' fill='url(#g)'/><circle cx='460' cy='58' r='24' fill='url(#mn)'/><circle cx='452' cy='52' r='4' fill='#b8c4dc' opacity='.5'/><circle cx='468' cy='66' r='2.6' fill='#b8c4dc' opacity='.5'/>` +
      dune(128, [[10, 230, 0.5], [6, 110, 2]], "#d8c6a8", "#5a4a6e", "d1") + dune(150, [[14, 300, 2.2], [5, 90, 1]], "#e8d6b6", "#3a2e4e", "d2") + dune(176, [[9, 260, 4], [4, 70, 0]], "#c8b090", "#211a30", "d3");
    return bannerDoc(s.d + glow("g", "#cfe0ff", 0.45) + rg("mn", ["#ffffff", "#eef2ff", "#b8c4dc"], 0.4, 0.35, 0.7) + lg("d1", ["#8a7a9a", "#4a3e60"]) + lg("d2", ["#6a5a7e", "#2e2440"]) + lg("d3", ["#4a3e5e", "#160f22"]), body, 0.4);
  });

add("pine-lake", "common", 240, false,
  N("Çam Gölü", "Pine Lake", "Kiefernsee", "Lago de pinos", "Lac des pins", "Lago dos pinheiros", "Сосновое озеро"),
  N("Alacakaranlıkta çam ormanı ve onu ayna gibi yansıtan sakin göl.", "A pine forest at dusk and the still lake that mirrors it.", "Ein Kiefernwald in der Dämmerung und der stille See, der ihn spiegelt.", "Un pinar al anochecer y el lago en calma que lo refleja.", "Une forêt de pins au crépuscule et le lac immobile qui la reflète.", "Um pinheiral ao entardecer e o lago calmo que o espelha.", "Сосновый лес в сумерках и тихое озеро, отражающее его."),
  () => {
    const s = sky("s", [[0, "#13183a"], [0.55, "#3e3e78"], [1, "#e88a6a"]]);
    const mtn = `<path d='${ridge(5, 92, 36, 0.5, 120, 48, [[420, 34, 110]])}' fill='#4a4a86'/>`;
    const tdef = `<g id='tr'>${mtn}<path d='${pineRow(8, 120, 22, 48, -10, 610, 11)}' fill='#141634'/></g>`;
    const lake = `<rect y='120' width='600' height='80' fill='url(#lk)'/>`;
    const rip = scatter(4, 26, (r) => `<path d='M${f(r() * 600)} ${f(126 + r() * 70)}h${f(10 + r() * 40)}' stroke='#ffd0b0' stroke-opacity='${f(0.1 + r() * 0.25)}' stroke-width='1'/>`);
    const body = s.b + stars(9, 40, [0, 0, 600, 60], ["#fff"], 0.9) + `<circle cx='420' cy='70' r='12' fill='#ffe6c8'/><circle cx='420' cy='70' r='40' fill='url(#g)'/>` + lake + `<use href='#tr' transform='translate(0 240) scale(1 -1)' opacity='.3'/><use href='#tr'/>` + `<rect x='414' y='124' width='12' height='60' fill='url(#st)'/>` + rip;
    return bannerDoc(s.d + tdef + glow("g", "#ffd0b0", 0.5) + lg("lk", ["#4a3a6a", "#141634"]) + lg("st", [[0, "#ffe6c8", 0.6], [1, "#ffe6c8", 0]]), body, 0.4);
  });

add("rose-silk", "common", 180, false,
  N("Gül İpeği", "Rose Silk", "Rosenseide", "Seda rosa", "Soie rose", "Seda rosé", "Розовый шёлк"),
  N("Işığı yakalayan kıvrımlarıyla pembe ve şeftali ipek dalgaları.", "Pink and peach silk waves, their folds catching the light.", "Rosa und pfirsichfarbene Seidenwellen, deren Falten das Licht fangen.", "Ondas de seda rosa y melocotón cuyos pliegues atrapan la luz.", "Des vagues de soie rose et pêche dont les plis captent la lumière.", "Ondas de seda rosa e pêssego cujas dobras captam a luz.", "Волны розового и персикового шёлка, складки которых ловят свет."),
  () => {
    const s = sky("s", [[0, "#2a0f2e"], [1, "#6a2050"]]);
    let body = s.b;
    const layers = [[60, "a", [[22, 380, 0.4], [10, 170, 1.2]]], [92, "b", [[26, 420, 2], [9, 150, 0.2]]], [124, "c", [[20, 350, 3.6], [12, 190, 1]]], [158, "d", [[18, 300, 1.4], [8, 130, 2.4]]]];
    for (const [y, id, w] of layers) { const d = hills(y, w, 220, 8); body += `<path d='${d}' fill='url(#${id})'/><path d='${d.replace(/^M0 220/, "").replace(/L600 220L0 220Z$/, "").replace(/^L/, "M")}' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='1.4' transform='translate(0 2)'/>`; }
    body += `<ellipse cx='450' cy='70' rx='120' ry='40' fill='url(#sh)'/>`;
    return bannerDoc(s.d + lg("a", ["#ffb3c8", "#c0457a"], 0, 0, 1, 1) + lg("b", ["#ffd0b0", "#e0607a"], 1, 0, 0, 1) + lg("c", ["#f590b8", "#8a2a6a"], 0, 0, 1, 1) + lg("d", ["#ffc8a8", "#a03a6a"], 1, 0, 0, 1) + glow("sh", "#fff", 0.25), body, 0.35);
  });

add("paper-hills", "common", 190, false,
  N("Kâğıt Tepeler", "Paper Hills", "Papierhügel", "Colinas de papel", "Collines de papier", "Colinas de papel", "Бумажные холмы"),
  N("Gölgeli katmanlarıyla kesme kâğıttan yeşil tepeler ve kâğıt güneş.", "Cut-paper green hills with layered shadows and a paper sun.", "Grüne Hügel aus Scherenschnitt mit Schattenlagen und einer Papiersonne.", "Colinas verdes de papel recortado con sombras en capas y un sol de papel.", "Des collines vertes en papier découpé, ombres superposées et soleil de papier.", "Colinas verdes de papel recortado com sombras em camadas e um sol de papel.", "Зелёные холмы из вырезанной бумаги со слоями теней и бумажное солнце."),
  () => {
    const s = sky("s", [[0, "#ffe9c8"], [1, "#ffcf9e"]]);
    const cols = ["#9fd9c0", "#6cc2a6", "#3fa48a", "#1f7a6a", "#0f4f48"];
    let body = s.b + `<circle cx='452' cy='64' r='30' fill='#5a3a1a' opacity='.18' transform='translate(4 5)'/><circle cx='452' cy='64' r='30' fill='url(#sun)'/>`;
    cols.forEach((c, i) => { const d = hills(88 + i * 22, [[14 - i, 260 + i * 40, i * 1.3], [6, 120, i]], 220); body += `<path d='${d}' fill='#2a1a0a' opacity='.22' transform='translate(0 -5)' filter='url(#sh)'/><path d='${d}' fill='${c}'/>`; });
    body += scatter(2, 5, (r, i) => `<path d='${pine(330 + i * 34 + r() * 10, 128 + r() * 6, 20 + r() * 10, 9)}' fill='#0f4f48'/>`);
    return bannerDoc(s.d + rg("sun", ["#fff3d0", "#ffb44a", "#f08a24"], 0.4, 0.35, 0.7) + blur("sh", 2.2), body, 0.2);
  });

add("contour-map", "common", 160, false,
  N("Eş Yükselti", "Contour Map", "Höhenlinien", "Curvas de nivel", "Courbes de niveau", "Curvas de nível", "Топографическая карта"),
  N("Koyu zeminde parlayan topografik eş yükselti çizgileri.", "Glowing topographic contour lines on a dark ground.", "Leuchtende topografische Höhenlinien auf dunklem Grund.", "Curvas de nivel topográficas que brillan sobre un fondo oscuro.", "Des courbes de niveau lumineuses sur un fond sombre.", "Curvas de nível topográficas brilhando sobre um fundo escuro.", "Светящиеся топографические изолинии на тёмном фоне."),
  () => {
    const s = sky("s", [[0, "#06141a"], [1, "#0b2a2a"]]);
    const iso = (cx, cy, n, seed, sx = 1) => { const r = rnd(seed); const ph = [r() * 6, r() * 6, r() * 6]; let o = ""; for (let k = 1; k <= n; k++) { const R = k * 11; let d = ""; for (let a = 0; a <= 360; a += 10) { const t = (a * Math.PI) / 180; const rr = R * (1 + 0.16 * Math.sin(3 * t + ph[0]) + 0.1 * Math.sin(5 * t + ph[1] + k * 0.2)); d += (a ? "L" : "M") + f(cx + rr * Math.cos(t) * sx) + " " + f(cy + rr * Math.sin(t) * 0.75); } o += `<path d='${d}Z' fill='none' stroke='url(#ln)' stroke-width='${k % 5 === 0 ? 1.6 : 0.8}' stroke-opacity='${f(0.35 + (k % 5 === 0) * 0.45)}'/>`; } return o; };
    const body = s.b + `<circle cx='440' cy='80' r='120' fill='url(#g)'/>` + iso(440, 80, 16, 4, 1.25) + iso(120, 160, 9, 9, 1.4) + `<circle cx='440' cy='80' r='3' fill='#7affd8'/><circle cx='440' cy='80' r='7' fill='none' stroke='#7affd8' stroke-width='1'/>`;
    return bannerDoc(s.d + lgU("ln", ["#3affc0", "#2ad0ff", "#a6ff7a"], 0, 0, 600, 200) + glow("g", "#2affc0", 0.18), body, 0.5);
  });

add("city-bokeh", "common", 210, false,
  N("Şehir Işıkları", "City Bokeh", "Stadtbokeh", "Bokeh urbano", "Bokeh urbain", "Bokeh da cidade", "Огни города"),
  N("Odak dışı gece şehri: yumuşak renkli ışık daireleri.", "An out-of-focus city at night: soft circles of coloured light.", "Eine unscharfe Stadt bei Nacht: weiche Kreise aus farbigem Licht.", "Una ciudad desenfocada de noche: suaves círculos de luz de colores.", "Une ville floue la nuit : de doux cercles de lumière colorée.", "Uma cidade desfocada à noite: círculos suaves de luz colorida.", "Ночной город не в фокусе: мягкие круги цветного света."),
  () => {
    const s = sky("s", [[0, "#0a0a1e"], [1, "#1e1030"]]);
    const cols = ["#ff8a4a", "#ffd27a", "#ff4a8a", "#7a8aff", "#4af0ff"];
    const bok = scatter(14, 46, (r) => { const x = r() * 600, y = 30 + r() * 150, R = 6 + r() * 26, c = cols[Math.floor(r() * cols.length)]; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(R)}' fill='${c}' fill-opacity='${f(0.12 + r() * 0.3)}' stroke='${c}' stroke-opacity='${f(0.3 + r() * 0.3)}' stroke-width='1.2'/>`; });
    const sk = skyline(5, 200, 30, 90, -10, 610, 18, 40, "#ffd27a", 0.2);
    const body = s.b + `<g filter='url(#b)'>${bok}</g>` + `<path d='${sk.body}' fill='#05050c' opacity='.55'/>` + `<path d='${sk.windows}' fill='#ffd27a' opacity='.5'/>` + scatter(31, 30, (r) => { const c = cols[Math.floor(r() * cols.length)]; return `<circle cx='${f(r() * 600)}' cy='${f(40 + r() * 140)}' r='${f(3 + r() * 9)}' fill='${c}' fill-opacity='${f(0.25 + r() * 0.3)}' stroke='${c}' stroke-width='1.4' stroke-opacity='.8'/>`; });
    return bannerDoc(s.d + blur("b", 3), body, 0.5);
  });

add("retro-stripes", "common", 170, false,
  N("Retro Şeritler", "Retro Stripes", "Retrostreifen", "Rayas retro", "Rayures rétro", "Listras retrô", "Ретро-полосы"),
  N("Yetmişlerden kalma, kıvrılan sıcak gün batımı şeritleri.", "Curving warm sunset stripes straight out of the seventies.", "Geschwungene warme Sonnenuntergangsstreifen wie aus den Siebzigern.", "Rayas curvas de atardecer cálido, salidas de los setenta.", "Des rayures courbes aux tons de coucher de soleil, tout droit des années 70.", "Listras curvas de pôr do sol quente, saídas dos anos 70.", "Изогнутые тёплые полосы заката прямо из семидесятых."),
  () => {
    const cols = ["#ffe7b8", "#ffc24a", "#ff8a2a", "#e0502a", "#a8301e", "#5a1e14"];
    let body = `<rect width='600' height='200' fill='#2a120c'/>`;
    cols.forEach((c, i) => { const r = 300 - i * 30; body += `<path d='M${-60} 230C120 ${f(230 - r * 0.5)} 260 ${f(150 - r * 0.6)} 640 ${f(60 - i * 2 - r * 0.25)}V230Z' fill='${c}' transform='translate(0 ${i * 20})'/>`; });
    body += `<circle cx='470' cy='62' r='34' fill='url(#sun)'/>` + [0, 1, 2, 3].map((i) => `<rect x='430' y='${70 + i * 8}' width='80' height='${2 + i}' fill='#2a120c'/>`).join("") + `<rect width='600' height='200' fill='url(#gr)' opacity='.25'/>`;
    return bannerDoc(rg("sun", ["#fff3c8", "#ffc24a", "#ff8a2a"], 0.5, 0.35, 0.7) + lg("gr", [[0, "#fff", 0.6], [0.5, "#fff", 0], [1, "#000", 0.5]], 0, 0, 1, 1), body, 0.3);
  });

add("ocean-swell", "common", 230, false,
  N("Okyanus Kabarması", "Ocean Swell", "Ozeandünung", "Mar de fondo", "Houle océane", "Ondulação do oceano", "Океанская зыбь"),
  N("Sağda kıvrılan büyük bir dalga, köpük ve serpinti.", "A great wave curling on the right, with foam and spray.", "Eine große Welle bricht rechts, mit Gischt und Schaum.", "Una gran ola que rompe a la derecha, con espuma y rocío.", "Une grande vague qui s'enroule à droite, avec écume et embruns.", "Uma grande onda se curvando à direita, com espuma e borrifos.", "Справа закручивается огромная волна, пена и брызги."),
  () => {
    const s = sky("s", [[0, "#bfe6f2"], [0.5, "#7ac0d8"], [1, "#2a7a9a"]]);
    const wave = `<path d='M600 10C520 0 440 20 396 70C366 106 380 146 418 140C446 136 448 106 426 104C450 60 520 40 600 52Z' fill='url(#cr)'/><path d='M600 52C520 40 450 60 426 104C448 106 446 136 418 140C460 146 520 132 600 134Z' fill='url(#fc)'/><path d='M600 10C520 0 440 20 396 70C372 98 374 126 392 138' fill='none' stroke='#fff' stroke-width='6' stroke-linecap='round' opacity='.95'/><path d='M560 60C520 64 480 84 460 112' fill='none' stroke='#bff2ff' stroke-width='2' stroke-opacity='.5'/><path d='M590 90C550 92 510 108 494 128' fill='none' stroke='#bff2ff' stroke-width='2' stroke-opacity='.4'/>`;
    const sea = `<path d='M0 120C120 110 260 130 380 118C440 112 480 120 520 132C560 140 590 136 600 132V200H0Z' fill='url(#sea)'/>`;
    const foam = `<g fill='#f2fbff'>${scatter(3, 40, (r) => `<circle cx='${f(380 + r() * 220)}' cy='${f(116 + r() * 22)}' r='${f(1 + r() * 4)}'/>`)}</g>` + scatter(6, 30, (r) => `<circle cx='${f(420 + r() * 120)}' cy='${f(30 + r() * 60)}' r='${f(0.6 + r() * 1.6)}' fill='#fff' opacity='${f(0.4 + r() * 0.6)}'/>`);
    const lines = scatter(8, 14, (r) => `<path d='${waveLine(140 + r() * 55, 2, 60 + r() * 40, r() * 6, f(r() * 300), f(320 + r() * 280))}' fill='none' stroke='#cff1ff' stroke-opacity='${f(0.2 + r() * 0.3)}' stroke-width='1.2'/>`);
    const body = s.b + `<circle cx='130' cy='40' r='60' fill='url(#g)'/>` + sea + lines + wave + foam;
    return bannerDoc(s.d + lg("sea", ["#1f8aa8", "#0a3a5a"]) + lg("cr", ["#e6fbff", "#5ad0e8", "#0a5a7a"], 0, 0, 1, 1) + lg("fc", ["#2aa8c8", "#0a4a6a"], 1, 0, 0, 1) + glow("g", "#fff", 0.6), body, 0.3);
  });

add("lavender-rows", "common", 250, false,
  N("Lavanta Sıraları", "Lavender Rows", "Lavendelreihen", "Hileras de lavanda", "Rangs de lavande", "Fileiras de lavanda", "Лавандовые ряды"),
  N("Ufka uzanan lavanta sıraları, altın ışık ve yalnız bir ağaç.", "Lavender rows running to the horizon, golden light and a lone tree.", "Lavendelreihen bis zum Horizont, goldenes Licht und ein einzelner Baum.", "Hileras de lavanda hasta el horizonte, luz dorada y un árbol solitario.", "Des rangs de lavande jusqu'à l'horizon, une lumière dorée et un arbre seul.", "Fileiras de lavanda até o horizonte, luz dourada e uma árvore solitária.", "Ряды лаванды до горизонта, золотой свет и одинокое дерево."),
  () => {
    const s = sky("s", [[0, "#6a7ac8"], [0.6, "#f2b8a0"], [1, "#ffe0a0"]]);
    const vx = 430, vy = 108;
    let rows = `<rect y='${vy}' width='600' height='${200 - vy}' fill='#3a2a6a'/>`;
    for (let i = -14; i <= 14; i++) { const xb = vx + i * 70; rows += `<path d='M${vx + i * 2} ${vy}L${f(xb - 24)} 210L${f(xb + 24)} 210Z' fill='url(#lv)'/>`; }
    const tree = `<path d='M350 108V90' stroke='#2a1a3a' stroke-width='2'/><circle cx='350' cy='84' r='10' fill='#2a1a3a'/><circle cx='343' cy='88' r='7' fill='#2a1a3a'/><circle cx='358' cy='88' r='7' fill='#2a1a3a'/>`;
    const body = s.b + `<circle cx='${vx}' cy='${vy - 6}' r='70' fill='url(#g)'/><circle cx='${vx}' cy='${vy - 4}' r='14' fill='#fff2c8'/><path d='${ridge(3, vy - 6, 10, 0.5, vy + 2)}' fill='#8a6aa8'/>` + rows + `<rect y='${vy}' width='600' height='40' fill='url(#hz)'/>` + tree;
    return bannerDoc(s.d + lg("lv", ["#8a6ad8", "#5a3aa8", "#2a1a5a"]) + glow("g", "#ffe6b0", 0.8) + lg("hz", [[0, "#ffd6a0", 0.5], [1, "#ffd6a0", 0]]), body, 0.35);
  });

add("mint-cubes", "common", 160, false,
  N("Nane Küpler", "Mint Cubes", "Minzwürfel", "Cubos menta", "Cubes menthe", "Cubos menta", "Мятные кубы"),
  N("Işığa göre gölgelenen izometrik nane ve turkuaz küpler.", "Isometric mint and teal cubes shaded by a single light.", "Isometrische Minz- und Petrolwürfel, von einer Lichtquelle schattiert.", "Cubos isométricos menta y verde azulado sombreados por una sola luz.", "Des cubes isométriques menthe et sarcelle ombrés par une seule lumière.", "Cubos isométricos menta e verde-azulado sombreados por uma luz.", "Изометрические мятные и бирюзовые кубы, освещённые одним светом."),
  () => {
    const r = rnd(21);
    const sz = 22, h = 12.8;
    const cube = (id, top) => `<g id='${id}'><path d='M-22 0L0 13V33L-22 20Z' fill='#1f8a7a'/><path d='M22 0L0 13V33L22 20Z' fill='#0f5a54'/><path d='M0 -13L22 0L0 13L-22 0Z' fill='${top}'/></g>`;
    let cubes = "";
    for (let row = -1; row < 12; row++) for (let col = -1; col < 15; col++) {
      const x = col * sz * 2 + (row % 2) * sz, y = Math.round(row * h * 1.5);
      if (r() < 0.45 && x > 260) continue;
      const lift = r() < 0.3 ? 8 : 0, k = Math.min(1, Math.max(0, (x - 120) / 480));
      cubes += `<use href='#${lift ? "b" : "a"}' x='${x}' y='${y - lift}'${k > 0.05 ? ` opacity='${f(1 - k * 0.55)}'` : ""}/>`;
    }
    return bannerDoc(lg("s", ["#0a2a2e", "#0f3a3a"]) + rg("g", [[0, "#c8fff0", 0.35], [1, "#c8fff0", 0]]) + cube("a", "#7ae8c8") + cube("b", "#c8fff0"), `<rect width='600' height='200' fill='url(#s)'/>` + cubes + `<circle cx='120' cy='40' r='160' fill='url(#g)'/>`, 0.5);
  });

add("autumn-canopy", "common", 220, false,
  N("Sonbahar Örtüsü", "Autumn Canopy", "Herbstdach", "Dosel otoñal", "Canopée d'automne", "Copa de outono", "Осенняя листва"),
  N("Sıcak ışık huzmeleri arasında süzülen kızıl ve altın yapraklar.", "Red and golden leaves drifting through warm shafts of light.", "Rote und goldene Blätter, die durch warme Lichtstrahlen schweben.", "Hojas rojas y doradas que caen entre cálidos haces de luz.", "Des feuilles rouges et dorées qui tombent dans des rais de lumière chaude.", "Folhas vermelhas e douradas caindo entre feixes de luz quente.", "Красные и золотые листья кружатся в тёплых лучах света."),
  () => {
    const s = sky("s", [[0, "#3a1206"], [0.6, "#a8401a"], [1, "#f29a3a"]]);
    const maple = "M0 -9L2 -4L6 -6L4.5 -1.5L9 -1L5 2L6 6L1.5 4L0 9L-1.5 4L-6 6L-5 2L-9 -1L-4.5 -1.5L-6 -6L-2 -4Z";
    const cols = ["#ffcf4a", "#ff8a2a", "#e04a1a", "#a8201a", "#ffb04a"];
    const rays = [0, 1, 2, 3].map((i) => `<path d='M${380 + i * 50} -10L${300 + i * 70} 210H${330 + i * 70}L${400 + i * 50} -10Z' fill='#ffe0a0' opacity='.08'/>`).join("");
    const lv = scatter(12, 34, (r) => `<path d='${maple}' transform='translate(${f(200 + r() * 420)} ${f(r() * 200)}) rotate(${f(r() * 360)}) scale(${f(0.6 + r() * 1.3)})' fill='${cols[Math.floor(r() * cols.length)]}' stroke='#5a1a06' stroke-width='.4' opacity='${f(0.6 + r() * 0.4)}'/>`);
    const branch = `<path d='M600 0C540 20 500 18 460 8M520 14C500 30 470 36 440 34' fill='none' stroke='#2a0e04' stroke-width='5' stroke-linecap='round'/>` + scatter(5, 14, (r) => `<path d='${maple}' transform='translate(${f(440 + r() * 160)} ${f(4 + r() * 36)}) rotate(${f(r() * 360)}) scale(${f(1 + r() * 0.8)})' fill='${cols[Math.floor(r() * 3)]}' stroke='#5a1a06' stroke-width='.4'/>`);
    const ground = `<path d='${hills(176, [[6, 300, 1]])}' fill='#3a1406'/>` + scatter(3, 40, (r) => `<circle cx='${f(r() * 600)}' cy='${f(178 + r() * 20)}' r='${f(2 + r() * 3)}' fill='${cols[Math.floor(r() * cols.length)]}' opacity='.8'/>`);
    return bannerDoc(s.d, s.b + rays + ground + lv + branch, 0.4);
  });

add("rain-glass", "common", 200, false,
  N("Yağmurlu Cam", "Rain on Glass", "Regenscheibe", "Lluvia en el cristal", "Pluie sur la vitre", "Chuva no vidro", "Дождь на стекле"),
  N("Bulanık şehir ışıklarının önünde camdan süzülen yağmur damlaları.", "Raindrops sliding down glass in front of blurred city lights.", "Regentropfen rinnen über Glas vor verschwommenen Stadtlichtern.", "Gotas de lluvia que bajan por el cristal ante luces urbanas borrosas.", "Des gouttes de pluie glissant sur la vitre devant les lumières floues de la ville.", "Gotas de chuva escorrendo pelo vidro diante das luzes borradas da cidade.", "Капли дождя стекают по стеклу на фоне размытых огней города."),
  () => {
    const s = sky("s", [[0, "#0e1426"], [1, "#22243e"]]);
    const cols = ["#ff9a5a", "#ffd27a", "#5ac8ff", "#ff5a8a", "#9a8aff"];
    const lights = `<g filter='url(#b)'>${scatter(7, 28, (r) => `<circle cx='${f(r() * 600)}' cy='${f(60 + r() * 130)}' r='${f(8 + r() * 22)}' fill='${cols[Math.floor(r() * 5)]}' opacity='${f(0.25 + r() * 0.4)}'/>`)}</g>`;
    const drops = scatter(5, 60, (r) => { const x = r() * 600, y = r() * 200, R = 1 + r() * 4.4; return `<g transform='translate(${f(x)} ${f(y)})'><circle r='${f(R)}' fill='url(#dr)'/><circle cx='${f(-R * 0.3)}' cy='${f(-R * 0.35)}' r='${f(R * 0.3)}' fill='#fff' opacity='.8'/></g>`; });
    const streaks = scatter(9, 12, (r) => { const x = 250 + r() * 350, y = r() * 120; return `<path d='M${f(x)} ${f(y)}q${f((r() - 0.5) * 6)} ${f(20 + r() * 40)} ${f((r() - 0.5) * 4)} ${f(40 + r() * 50)}' stroke='#cfe6ff' stroke-opacity='.35' stroke-width='${f(1 + r() * 1.5)}' fill='none' stroke-linecap='round'/>`; });
    return bannerDoc(s.d + blur("b", 6) + rg("dr", [[0, "#ffffff", 0.1], [0.7, "#bcd6ff", 0.25], [1, "#e6f2ff", 0.85]], 0.5, 0.6, 0.55), s.b + lights + streaks + drops, 0.45);
  });

add("terrazzo", "common", 150, false,
  N("Mozaik Taş", "Terrazzo", "Terrazzo", "Terrazo", "Terrazzo", "Granilite", "Терраццо"),
  N("Krem zeminde gölgeli renkli taş kırıkları; köşeden düşen yumuşak ışık.", "Shadowed coloured stone chips on cream, with soft light falling from a corner.", "Farbige Steinsplitter mit Schatten auf Creme, weiches Licht aus einer Ecke.", "Esquirlas de piedra de colores con sombra sobre crema y luz suave desde una esquina.", "Des éclats de pierre colorés et ombrés sur fond crème, lumière douce venue d'un coin.", "Lascas de pedra coloridas e sombreadas sobre creme, com luz suave vinda de um canto.", "Цветная каменная крошка с тенями на кремовом фоне и мягкий свет из угла."),
  () => {
    const cols = ["#e0603a", "#2a6a8a", "#f2b630", "#3a8a6a", "#c84a7a", "#1e2a4a"];
    const chips = scatter(17, 80, (r) => { const n = 3 + Math.floor(r() * 3), R = 3 + r() * 10; let d = ""; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + r(), rr = R * (0.6 + r() * 0.6); d += (k ? "L" : "M") + f(rr * Math.cos(a)) + " " + f(rr * Math.sin(a)); } const x = f(r() * 600), y = f(r() * 200), c = cols[Math.floor(r() * cols.length)]; return `<path d='${d}Z' transform='translate(${x} ${y})' fill='${c}'/>`; });
    return bannerDoc(lg("s", ["#f6ecdc", "#e8d8c0"], 0, 0, 1, 1) + rg("li", [[0, "#fff", 0.55], [1, "#fff", 0]]) + `<filter id='sh'><feDropShadow dx='1.4' dy='2' stdDeviation='1.2' flood-color='#5a3a1a' flood-opacity='.35'/></filter>`,
      `<rect width='600' height='200' fill='url(#s)'/><g filter='url(#sh)'>${chips}</g><circle cx='480' cy='20' r='220' fill='url(#li)'/>`, 0.25);
  });

add("desert-mesa", "common", 260, false,
  N("Kızıl Mesa", "Desert Mesa", "Wüstenmesa", "Mesa del desierto", "Mesa du désert", "Mesa do deserto", "Пустынная меса"),
  N("Sıcak gökyüzü altında katmanlı kızıl kanyon tepeleri.", "Layered red canyon mesas under a hot sky.", "Geschichtete rote Canyon-Tafelberge unter heißem Himmel.", "Mesas rojas de cañón en capas bajo un cielo ardiente.", "Des mesas rouges de canyon en strates sous un ciel brûlant.", "Mesas vermelhas de cânion em camadas sob um céu quente.", "Слоистые красные столовые горы каньона под знойным небом."),
  () => {
    const s = sky("s", [[0, "#2a6ab8"], [0.6, "#f2a86a"], [1, "#ffd6a0"]]);
    const mesa = (x, w, top, base, c1, c2) => `<path d='M${x} ${base}L${x + 8} ${top + 6}L${x + 12} ${top}H${x + w - 10}L${x + w - 4} ${top + 8}L${x + w} ${base}Z' fill='${c1}'/><path d='M${x + w * 0.6} ${top}H${x + w - 10}L${x + w - 4} ${top + 8}L${x + w} ${base}H${x + w * 0.55}Z' fill='${c2}' opacity='.55'/>` + [0.3, 0.55, 0.75].map((k) => `<path d='M${x + 6} ${f(top + (base - top) * k)}H${x + w - 2}' stroke='#5a1a0a' stroke-opacity='.25' stroke-width='2'/>`).join("");
    const body = s.b + cloud(150, 40, 1.4, "#fff", 0.5) + cloud(300, 26, 1, "#fff", 0.35) + `<circle cx='520' cy='60' r='60' fill='url(#g)'/>` + `<path d='${ridge(4, 132, 10, 0.5)}' fill='#d08a6a' opacity='.6'/>` +
      mesa(330, 120, 70, 160, "#c2502a", "#7a2a12") + mesa(470, 90, 92, 160, "#d8683a", "#8a3214") + mesa(200, 70, 110, 160, "#b84a2a", "#6a2210") + `<path d='${hills(158, [[4, 200, 1], [2, 60, 0]])}' fill='#8a3a1a'/><path d='${hills(176, [[5, 260, 2]])}' fill='#5a2410'/>` +
      scatter(2, 6, (r) => `<path d='M${f(80 + r() * 480)} 190v-12m0 4h-4v-4m4 6h4v-5' stroke='#2a1206' stroke-width='2.4' fill='none' stroke-linecap='round'/>`);
    return bannerDoc(s.d + glow("g", "#fff6d0", 0.75), body, 0.3);
  });

add("snow-village", "common", 280, false,
  N("Karlı Köy", "Snow Village", "Schneedorf", "Pueblo nevado", "Village enneigé", "Vila nevada", "Снежная деревня"),
  N("Karlı tepelerde pencereleri yanan küçük evler ve yağan kar.", "Little houses with lit windows on snowy hills, with snow falling.", "Kleine Häuser mit erleuchteten Fenstern auf verschneiten Hügeln, es schneit.", "Casitas con ventanas encendidas en colinas nevadas mientras nieva.", "De petites maisons aux fenêtres allumées sur des collines enneigées, sous la neige.", "Casinhas com janelas acesas em colinas nevadas, com neve caindo.", "Домики с горящими окнами на снежных холмах под снегопадом."),
  () => {
    const s = sky("s", [[0, "#0b1430"], [1, "#2a3a6a"]]);
    const house = (x, y, w, h, c) => `<g transform='translate(${x} ${y})'><rect x='0' y='${-h}' width='${w}' height='${h}' fill='${c}'/><path d='M-4 ${-h}L${w / 2} ${-h - w * 0.55}L${w + 4} ${-h}Z' fill='#e8f2ff'/><path d='M-4 ${-h}L${w / 2} ${-h - w * 0.55}' stroke='#fff' stroke-width='1.4'/><rect x='${w * 0.2}' y='${-h * 0.7}' width='${w * 0.22}' height='${h * 0.3}' fill='#ffcf6a'/><rect x='${w * 0.58}' y='${-h * 0.7}' width='${w * 0.22}' height='${h * 0.3}' fill='#ffcf6a'/><rect x='${w * 0.7}' y='${-h - w * 0.5}' width='5' height='10' fill='${c}'/><circle cx='${w * 0.7 + 2.5}' cy='${-h - w * 0.5 - 6}' r='4' fill='#c8d6f0' opacity='.35'/><circle cx='${w * 0.7 + 6}' cy='${-h - w * 0.5 - 14}' r='5' fill='#c8d6f0' opacity='.2'/></g>`;
    const glowW = (x, y) => `<circle cx='${x}' cy='${y}' r='22' fill='url(#wg)'/>`;
    const body = s.b + stars(21, 60, [0, 0, 600, 90], ["#fff"], 1) + `<path d='${hills(110, [[10, 300, 1]])}' fill='#4a5a8a'/><path d='${pineRow(4, 116, 14, 26, 0, 600, 16)}' fill='#22305a'/>` +
      `<path d='${hills(140, [[12, 340, 2.4], [4, 90, 1]])}' fill='url(#sn)'/>` + glowW(392, 128) + glowW(462, 138) + glowW(520, 126) + house(370, 136, 30, 20, "#5a3a2a") + house(442, 146, 36, 24, "#6a4a32") + house(505, 134, 26, 18, "#4a3024") +
      `<path d='${hills(172, [[8, 260, 1]])}' fill='#e8f2ff'/>` + scatter(30, 70, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(0.6 + r() * 1.6)}' fill='#fff' opacity='${f(0.4 + r() * 0.6)}'/>`);
    return bannerDoc(s.d + lg("sn", ["#dce8ff", "#9fb0d8"]) + glow("wg", "#ffcf6a", 0.45), body, 0.35);
  });

add("seigaiha", "common", 180, false,
  N("Dalga Deseni", "Wave Scales", "Wellenschuppen", "Escamas de ola", "Écailles de vagues", "Escamas de onda", "Волновой узор"),
  N("Çivit zeminde altın parıltılı, iç içe yarım daire dalga deseni.", "An indigo pattern of nested wave arcs with a golden sheen.", "Ein Indigomuster aus verschachtelten Wellenbögen mit goldenem Schimmer.", "Un patrón índigo de arcos de olas anidados con brillo dorado.", "Un motif indigo d'arcs de vagues imbriqués au reflet doré.", "Um padrão índigo de arcos de onda aninhados com brilho dourado.", "Индиговый узор из вложенных волн с золотым отливом."),
  () => {
    const R = 26;
    const unit = `<g id='u'><circle r='${R}' fill='#14205a'/><circle r='${R - 4}' fill='none' stroke='url(#gd)' stroke-width='1.8'/><circle r='${R - 10}' fill='none' stroke='url(#gd)' stroke-width='1.6'/><circle r='${R - 16}' fill='none' stroke='url(#gd)' stroke-width='1.4'/><circle r='${R - 21}' fill='url(#gd)'/></g>`;
    let s = "";
    for (let row = 0; row < 19; row++) for (let col = -1; col < 13; col++) s += `<use href='#u' x='${col * R * 2 + (row % 2) * R}' y='${row * R * 0.5 - 10}'/>`;
    return bannerDoc(`<linearGradient id='gd' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='600' y2='200'><stop offset='0' stop-color='#3a5ab8'/><stop offset='.5' stop-color='#5a7ad8'/><stop offset='.72' stop-color='#ffd76a'/><stop offset='.85' stop-color='#5a7ad8'/></linearGradient>` + unit, `<rect width='600' height='200' fill='#14205a'/>${s}`, 0.5);
  });

add("cloud-sea", "common", 270, false,
  N("Bulut Denizi", "Cloud Sea", "Wolkenmeer", "Mar de nubes", "Mer de nuages", "Mar de nuvens", "Море облаков"),
  N("Bulutların üstünde doğan güneş ve sisten yükselen zirveler.", "The sun rising above the clouds, with peaks breaking through the mist.", "Die Sonne geht über den Wolken auf, Gipfel ragen aus dem Nebel.", "El sol saliendo sobre las nubes, con picos que asoman entre la niebla.", "Le soleil se lève au-dessus des nuages, des sommets percent la brume.", "O sol nascendo acima das nuvens, com picos rompendo a névoa.", "Солнце встаёт над облаками, из тумана поднимаются вершины."),
  () => {
    const s = sky("s", [[0, "#2a3a7a"], [0.5, "#c88ab8"], [0.85, "#ffcfa0"], [1, "#fff0c8"]]);
    const rays = Array.from({ length: 12 }, (_, i) => `<path d='M440 96L${f(440 + 700 * Math.cos((i * 15 + 190) * Math.PI / 180))} ${f(96 + 700 * Math.sin((i * 15 + 190) * Math.PI / 180))}L${f(440 + 700 * Math.cos((i * 15 + 196) * Math.PI / 180))} ${f(96 + 700 * Math.sin((i * 15 + 196) * Math.PI / 180))}Z' fill='#fff6d8' opacity='.08'/>`).join("");
    const body = s.b + rays + `<circle cx='440' cy='96' r='100' fill='url(#g)'/><circle cx='440' cy='96' r='18' fill='#fffbe8'/>` +
      `<path d='M300 120L350 60L372 76L400 40L440 100Z' fill='#5a4a8a'/><path d='M400 40L410 54L398 58L388 56Z' fill='#fff' opacity='.8'/><path d='M500 120L530 82L560 110Z' fill='#6a5a9a'/>` +
      `<g fill='url(#c1)'>${cloudBand(4, 118, 14, 28)}</g><g fill='url(#c2)'>${cloudBand(7, 146, 16, 32)}</g><g fill='url(#c3)'>${cloudBand(9, 176, 18, 34)}</g>`;
    return bannerDoc(s.d + glow("g", "#fff0c8", 0.85) + lg("c1", ["#ffe6d0", "#d8a8c8"]) + lg("c2", ["#fff3e6", "#e0b8d0"]) + lg("c3", ["#ffffff", "#f0d0e0"]), body, 0.25);
  });
// ================================================================= rare
add("fairy-chimneys", "rare", 480, false,
  N("Peri Bacaları", "Fairy Chimneys", "Feenkamine", "Chimeneas de hadas", "Cheminées de fées", "Chaminés de fada", "Сказочные дымоходы"),
  N("Gün doğarken peri bacalarının üstünde süzülen sıcak hava balonları.", "Hot air balloons drifting over fairy chimney rocks at sunrise.", "Heißluftballons über Feenkaminen im Sonnenaufgang.", "Globos aerostáticos sobre chimeneas de hadas al amanecer.", "Des montgolfières qui flottent au-dessus des cheminées de fées au lever du soleil.", "Balões de ar quente sobre chaminés de fada ao nascer do sol.", "Воздушные шары над сказочными скалами-дымоходами на рассвете."),
  () => {
    const s = sky("s", [[0, "#3a5aa8"], [0.5, "#f2a8a0"], [0.85, "#ffd6a0"], [1, "#ffe8c0"]]);
    const chim = (x, base, h, w, c) => `<path d='M${x - w} ${base}C${x - w} ${base - h * 0.5} ${x - w * 0.55} ${base - h * 0.8} ${x - w * 0.3} ${base - h}H${x + w * 0.3}C${x + w * 0.55} ${base - h * 0.8} ${x + w} ${base - h * 0.5} ${x + w} ${base}Z' fill='${c}'/><path d='M${x - w * 0.45} ${base - h}Q${x} ${base - h - w * 0.9} ${x + w * 0.45} ${base - h}Z' fill='#6a3a2a'/><path d='M${x + w * 0.1} ${base - h + 4}C${x + w * 0.5} ${base - h * 0.6} ${x + w * 0.7} ${base - h * 0.3} ${x + w * 0.8} ${base}' stroke='#7a4a32' stroke-opacity='.4' stroke-width='3' fill='none'/>`;
    const balloon = (x, y, s, c1, c2) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M0 -22C14 -22 20 -10 18 0C16 8 8 14 4 18H-4C-8 14 -16 8 -18 0C-20 -10 -14 -22 0 -22Z' fill='url(#${c1})'/><path d='M0 -22C5 -22 7 -10 6 0C5 8 3 14 2 18H-2C-3 14 -5 8 -6 0C-7 -10 -5 -22 0 -22Z' fill='${c2}' opacity='.85'/><path d='M-4 18L-3 24M4 18L3 24' stroke='#3a2a1a' stroke-width='.8'/><rect x='-3.5' y='24' width='7' height='5' rx='1' fill='#6a4a2a'/></g>`;
    const body = s.b + `<circle cx='470' cy='120' r='110' fill='url(#g)'/><path d='${ridge(2, 128, 14, 0.5)}' fill='#c89a8a' opacity='.6'/>` +
      chim(330, 170, 70, 22, "#e0b090") + chim(380, 175, 54, 18, "#d0a080") + chim(520, 170, 80, 24, "#e8b898") + chim(570, 176, 50, 16, "#c89070") + chim(450, 180, 40, 15, "#d8a888") + `<path d='${hills(172, [[6, 200, 1], [3, 70, 2]])}' fill='#a8705a'/>` +
      balloon(420, 50, 1.2, "b1", "#ffd36a") + balloon(510, 34, 0.85, "b2", "#fff") + balloon(300, 70, 0.7, "b3", "#ffd36a") + balloon(560, 92, 0.55, "b1", "#fff") + balloon(230, 40, 0.5, "b2", "#ffd36a");
    return bannerDoc(s.d + glow("g", "#fff0c8", 0.7) + lg("b1", ["#ff6a5a", "#c02a3a"], 0, 0, 1, 0) + lg("b2", ["#5ac8ff", "#2a5ad8"], 0, 0, 1, 0) + lg("b3", ["#7ae0a0", "#1f8a5a"], 0, 0, 1, 0), body, 0.3);
  });

add("bosphorus-night", "rare", 520, false,
  N("Boğaz Gecesi", "Bosphorus Night", "Bosporusnacht", "Noche en el Bósforo", "Nuit sur le Bosphore", "Noite no Bósforo", "Ночь на Босфоре"),
  N("Işıklı köprü, minareli siluet ve suya düşen yansımalar.", "A lit bridge, a skyline of domes and minarets, and reflections on the water.", "Eine beleuchtete Brücke, eine Silhouette aus Kuppeln und Minaretten, Spiegelungen im Wasser.", "Un puente iluminado, una silueta de cúpulas y minaretes y reflejos en el agua.", "Un pont illuminé, une silhouette de coupoles et de minarets, des reflets sur l'eau.", "Uma ponte iluminada, uma silhueta de cúpulas e minaretes e reflexos na água.", "Подсвеченный мост, силуэт куполов и минаретов и отражения в воде."),
  () => {
    const s = sky("s", [[0, "#070b24"], [0.6, "#1e2a5e"], [1, "#4a3a7a"]]);
    const dome = (x, w, h) => `M${x - w} 130Q${x - w} ${130 - h} ${x} ${130 - h * 1.15}Q${x + w} ${130 - h} ${x + w} 130Z`;
    const min = (x, h) => `M${x - 2} 130V${130 - h}L${x} ${130 - h - 8}L${x + 2} ${130 - h}V130ZM${x - 3} ${130 - h * 0.7}h6v2h-6Z`;
    const city = `<path d='${skyline(8, 130, 6, 22, 0, 600, 10, 22).body}' fill='#141a44'/><g transform='translate(330 0)'><path d='${dome(110, 30, 26)}${dome(150, 16, 16)}${dome(76, 14, 14)}${min(60, 50)}${min(160, 56)}${min(38, 40)}${min(184, 44)}' fill='#0a0d28'/></g><g fill='#ffd27a' opacity='.7'>${scatter(17, 40, (r) => `<rect x='${f(r() * 600)}' y='${f(112 + r() * 16)}' width='2' height='2'/>`)}</g>`;
    const bridge = `<path d='M240 108L600 92' stroke='#2a2e5e' stroke-width='3'/><path d='M300 106V50M500 97V44' stroke='#3a3e7e' stroke-width='5'/><path d='M240 108Q300 60 300 50Q330 92 400 101Q470 90 500 44Q500 70 600 92' fill='none' stroke='#ffd27a' stroke-width='1.6'/>` + Array.from({ length: 30 }, (_, i) => { const x = 245 + i * 12; return `<circle cx='${x}' cy='${f(108 - (x - 240) * 0.044)}' r='1.6' fill='${i % 3 ? "#ffd27a" : "#7ae0ff"}'/>`; }).join("");
    const water = `<rect y='130' width='600' height='70' fill='url(#w)'/>` + scatter(5, 40, (r) => { const x = r() * 600; return `<path d='M${f(x)} ${f(134 + r() * 60)}h${f(6 + r() * 26)}' stroke='${r() > 0.5 ? "#ffd27a" : "#9fb6ff"}' stroke-opacity='${f(0.25 + r() * 0.5)}' stroke-width='1.4'/>`; });
    const body = s.b + stars(5, 70, [0, 0, 600, 90], ["#fff", "#cfd8ff"], 1, 3) + `<circle cx='540' cy='34' r='12' fill='#fff2d0'/><circle cx='540' cy='34' r='40' fill='url(#g)'/>` + city + bridge + water + `<path d='M380 150h40l-6 6h-30z' fill='#141838'/><rect x='392' y='144' width='14' height='6' fill='#141838'/><circle cx='396' cy='147' r='1' fill='#ffd27a'/><circle cx='401' cy='147' r='1' fill='#ffd27a'/>`;
    return bannerDoc(s.d + glow("g", "#fff2d0", 0.5) + lg("w", ["#1a2050", "#06081c"]), body, 0.45);
  });

add("iznik-tiles", "rare", 460, false,
  N("İznik Çinisi", "Iznik Tiles", "Iznik-Fliesen", "Azulejos de Iznik", "Carreaux d'Iznik", "Azulejos de Iznik", "Изникские изразцы"),
  N("Kobalt ve turkuaz lale, karanfil desenli sırlı çini.", "Glazed tiles patterned with cobalt and turquoise tulips and carnations.", "Glasierte Fliesen mit Tulpen und Nelken in Kobalt und Türkis.", "Azulejos vidriados con tulipanes y claveles en cobalto y turquesa.", "Des carreaux émaillés ornés de tulipes et d'œillets cobalt et turquoise.", "Azulejos vitrificados com tulipas e cravos em cobalto e turquesa.", "Глазурованные изразцы с кобальтовыми и бирюзовыми тюльпанами и гвоздиками."),
  () => {
    const T = 100;
    const tulip = `<path d='M0 18C-8 10 -9 -2 -4 -10L-2 -2L0 -14L2 -2L4 -10C9 -2 8 10 0 18Z' fill='#1f4fb8' stroke='#0a1f5a' stroke-width='1'/><path d='M0 18C-3 10 -3 0 0 -8C3 0 3 10 0 18Z' fill='#d03a3a'/>`;
    const tile = `<g id='t'><rect width='${T}' height='${T}' fill='url(#gl)'/><rect x='2' y='2' width='${T - 4}' height='${T - 4}' fill='none' stroke='#1f4fb8' stroke-width='2'/>` +
      `<g transform='translate(50 50)'><circle r='14' fill='#2ab0b8' stroke='#0a1f5a' stroke-width='1'/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d='M0 -14C6 -18 6 -26 0 -30C-6 -26 -6 -18 0 -14Z' transform='rotate(${a})' fill='${a % 90 ? "#2ab0b8" : "#1f4fb8"}' stroke='#0a1f5a' stroke-width='.8'/>`).join("")}<circle r='6' fill='#d03a3a' stroke='#0a1f5a' stroke-width='.8'/></g>` +
      [[0, 0, 45], [100, 0, 135], [100, 100, 225], [0, 100, 315]].map(([x, y, a]) => `<g transform='translate(${x} ${y}) rotate(${a}) translate(0 -20)'>${tulip}</g>`).join("") + `<path d='M50 0Q40 20 50 36M50 100Q60 80 50 64M0 50Q20 60 36 50M100 50Q80 40 64 50' fill='none' stroke='#3a8a4a' stroke-width='2'/></g>`;
    let s = "";
    for (let y = -40; y < 200; y += T) for (let x = -30; x < 600; x += T) s += `<use href='#t' x='${x}' y='${y}'/>`;
    return bannerDoc(lg("gl", ["#fbf6ec", "#efe4d0"], 0, 0, 1, 1) + tile + lg("sh", [[0, "#fff", 0.35], [0.4, "#fff", 0], [1, "#000", 0.15]], 0, 0, 1, 1), s + `<rect width='600' height='200' fill='url(#sh)'/>`, 0.35);
  });

add("kilim-weave", "rare", 380, false,
  N("Kilim Dokuma", "Kilim Weave", "Kelimgewebe", "Tejido kilim", "Tissage kilim", "Tecido kilim", "Килим"),
  N("Sıcak kırmızı ve hardal tonlarında el dokuması geometrik kilim deseni.", "A hand-woven geometric kilim pattern in warm red and mustard.", "Ein handgewebtes geometrisches Kelimmuster in warmem Rot und Senf.", "Un patrón geométrico de kilim tejido a mano en rojo cálido y mostaza.", "Un motif géométrique de kilim tissé main, en rouge chaud et moutarde.", "Um padrão geométrico de kilim tecido à mão em vermelho quente e mostarda.", "Геометрический узор ручного килима в тёплых красных и горчичных тонах."),
  () => {
    const U = 80;
    const motif = `<g id='k'><rect width='${U}' height='${U * 1.25}' fill='#a8241e'/><path d='M40 6L72 50L40 94L8 50Z' fill='#f2b630'/><path d='M40 18L62 50L40 82L18 50Z' fill='#1e2a5a'/><path d='M40 30L52 50L40 70L28 50Z' fill='#f6ecdc'/><path d='M40 42L46 50L40 58L34 50Z' fill='#a8241e'/>` +
      [6, 94].map((y) => `<path d='M0 ${y}L8 ${y - 6}L16 ${y}L24 ${y - 6}L32 ${y}L40 ${y - 6}L48 ${y}L56 ${y - 6}L64 ${y}L72 ${y - 6}L80 ${y}' fill='none' stroke='#f6ecdc' stroke-width='2'/>`).join("") + `<path d='M0 0V100M80 0V100' stroke='#5a1410' stroke-width='3'/></g>`;
    let s = "";
    for (let x = -20; x < 600; x += U) s += `<use href='#k' x='${x}' y='-2'/><use href='#k' x='${x + U / 2}' y='98'/>`;
    const weave = scatter(4, 1, () => `<path d='${Array.from({ length: 100 }, (_, i) => `M0 ${i * 2}H600`).join("")}' stroke='#000' stroke-opacity='.06' stroke-width='1'/>`);
    return bannerDoc(motif, `<rect width='600' height='200' fill='#a8241e'/>` + s + weave, 0.45);
  });

add("koi-pond", "rare", 500, false,
  N("Koi Havuzu", "Koi Pond", "Koiteich", "Estanque koi", "Bassin à koïs", "Lago de carpas", "Пруд с кои"),
  N("Yukarıdan bakış: nilüferler arasında süzülen koi balıkları.", "Seen from above: koi gliding between water lilies.", "Von oben gesehen: Koi gleiten zwischen Seerosen.", "Vista desde arriba: carpas koi deslizándose entre nenúfares.", "Vu d'en haut : des koïs glissant entre les nénuphars.", "Visto de cima: carpas koi deslizando entre vitórias-régias.", "Вид сверху: кои скользят между кувшинками."),
  () => {
    const koi = (x, y, rot, s, c, spot) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'><ellipse rx='6' ry='16' fill='#000' opacity='.18' transform='translate(4 6)'/><path d='M0 -16C6 -14 6 -2 4 6C3 10 1 13 0 15C-1 13 -3 10 -4 6C-6 -2 -6 -14 0 -16Z' fill='${c}'/><path d='M0 14L-6 24L0 20L6 24Z' fill='${c}' opacity='.85'/><path d='M-4 -2L-10 2L-4 3ZM4 -2L10 2L4 3Z' fill='${c}' opacity='.85'/><path d='M-3 -10C0 -13 4 -10 3 -6C1 -3 -3 -5 -3 -10Z' fill='${spot}'/><path d='M-2 2C1 0 4 3 2 6C0 8 -3 6 -2 2Z' fill='${spot}'/></g>`;
    const pad = (x, y, r, rot) => `<g transform='translate(${x} ${y}) rotate(${rot})'><path d='M0 0L${r} -4A${r} ${r} 0 1 1 ${r} 4Z' fill='url(#pd)' stroke='#1a5a2a' stroke-width='1'/><path d='M0 0L${-r * 0.7} ${-r * 0.4}M0 0L${-r * 0.6} ${r * 0.5}M0 0L0 ${-r * 0.8}' stroke='#4aa85a' stroke-opacity='.5'/></g>`;
    const flower = (x, y) => `<g transform='translate(${x} ${y})'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d='${petal(9, 3.4)}' transform='rotate(${a})' fill='#ffd6ea' stroke='#d0608a' stroke-width='.5'/>`).join("")}<circle r='3' fill='#ffd36a'/></g>`;
    const caust = scatter(9, 30, (r) => `<path d='M${f(r() * 600)} ${f(r() * 200)}q8 -6 16 0t16 0' fill='none' stroke='#bff6ff' stroke-opacity='${f(0.1 + r() * 0.15)}' stroke-width='1.4'/>`);
    const body = `<rect width='600' height='200' fill='url(#wt)'/>` + caust + koi(380, 90, 60, 1.6, "#fff4ea", "#ff5a1f") + koi(470, 130, -110, 1.4, "#ff7a2a", "#fff") + koi(300, 150, 20, 1.2, "#1a1a22", "#f2b630") + koi(540, 60, 160, 1.1, "#ffd6a0", "#e03a1a") +
      pad(250, 40, 22, 30) + pad(540, 160, 26, 200) + pad(200, 120, 16, 100) + pad(430, 30, 18, -40) + flower(256, 36) + flower(530, 158) + `<circle cx='360' cy='40' r='12' fill='none' stroke='#bff6ff' stroke-opacity='.4'/><circle cx='360' cy='40' r='22' fill='none' stroke='#bff6ff' stroke-opacity='.2'/>`;
    return bannerDoc(rg("wt", ["#1f8a8a", "#0f5a6a", "#062a3a"], 0.6, 0.4, 0.8) + rg("pd", ["#7ad06a", "#2f8a3a"], 0.3, 0.3, 0.9), body, 0.4);
  });

add("bamboo-grove", "rare", 340, false,
  N("Bambu Korusu", "Bamboo Grove", "Bambushain", "Bosque de bambú", "Bambouseraie", "Bosque de bambu", "Бамбуковая роща"),
  N("Sisli bir bambu korusunda gövdeler arasından süzülen yeşil ışık.", "Green light filtering between the stalks of a misty bamboo grove.", "Grünes Licht, das zwischen den Halmen eines nebligen Bambushains fällt.", "Luz verde que se filtra entre las cañas de un bambusal brumoso.", "Une lumière verte qui filtre entre les tiges d'une bambouseraie brumeuse.", "Luz verde filtrando entre os colmos de um bambuzal enevoado.", "Зелёный свет, пробивающийся между стеблями туманной бамбуковой рощи."),
  () => {
    const stalk = (x, w, c, hi, seed) => { const r = rnd(seed); let s = `<rect x='${x}' y='-10' width='${w}' height='220' fill='${c}'/><rect x='${x + w * 0.2}' y='-10' width='${f(w * 0.18)}' height='220' fill='${hi}' opacity='.5'/>`; for (let y = 10 + r() * 30; y < 200; y += 40 + r() * 20) s += `<rect x='${x - 1}' y='${f(y)}' width='${w + 2}' height='3' rx='1.5' fill='${hi}' opacity='.8'/><rect x='${x}' y='${f(y + 3)}' width='${w}' height='2' fill='#000' opacity='.25'/>`; return s; };
    const lvs = (x, y, flip, seed) => scatter(seed, 4, (r, i) => `<path d='${leaf(26 + r() * 10, 5)}' transform='translate(${x} ${y + i * 6}) rotate(${flip * (50 + i * 14)})' fill='#3aa85a' stroke='#1a5a2a' stroke-width='.6'/>`);
    let back = "", front = "";
    [40, 90, 150, 230, 300, 360, 420, 480, 550].forEach((x, i) => (back += stalk(x, 10, "#3a7a5a", "#7ac89a", i + 3)));
    [200, 330, 470, 560].forEach((x, i) => (front += stalk(x, 18, "#2a6a3a", "#9fe0a0", i + 20)));
    const body = `<rect width='600' height='200' fill='url(#bg)'/><g opacity='.55'>${back}</g><rect width='600' height='200' fill='url(#mist)'/><rect x='300' y='0' width='160' height='200' fill='url(#beam)'/>` + front + lvs(208, 50, 1, 4) + lvs(338, 90, -1, 5) + lvs(478, 30, 1, 6) + lvs(568, 120, -1, 7);
    return bannerDoc(lg("bg", ["#cfeccf", "#6aa87a", "#1e4a32"]) + lg("mist", [[0, "#e8f8e8", 0], [0.6, "#e8f8e8", 0.3], [1, "#e8f8e8", 0]]) + lg("beam", [[0, "#fff8d0", 0], [0.5, "#fff8d0", 0.28], [1, "#fff8d0", 0]], 0, 0, 1, 0), body, 0.35);
  });

add("coral-reef", "rare", 420, false,
  N("Mercan Kayalığı", "Coral Reef", "Korallenriff", "Arrecife de coral", "Récif corallien", "Recife de coral", "Коралловый риф"),
  N("Işık huzmeleri altında renkli mercanlar ve küçük balık sürüsü.", "Colourful corals and a small school of fish under shafts of light.", "Bunte Korallen und ein kleiner Fischschwarm unter Lichtstrahlen.", "Corales de colores y un pequeño banco de peces bajo haces de luz.", "Des coraux colorés et un petit banc de poissons sous des rais de lumière.", "Corais coloridos e um pequeno cardume sob feixes de luz.", "Разноцветные кораллы и стайка рыбок в лучах света."),
  () => {
    const s = sky("s", [[0, "#2ab0d8"], [0.5, "#0f6a9a"], [1, "#062a4a"]]);
    const rays = [0, 1, 2, 3, 4].map((i) => `<path d='M${300 + i * 60} -5L${260 + i * 80} 210H${290 + i * 80}L${330 + i * 60} -5Z' fill='#e6fbff' opacity='.07'/>`).join("");
    const branch = (x, y, h, c, seed) => { const r = rnd(seed); let d = ""; const grow = (x0, y0, len, ang, depth) => { const x1 = x0 + len * Math.sin(ang), y1 = y0 - len * Math.cos(ang); d += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`; if (depth > 0) { grow(x1, y1, len * 0.7, ang - 0.45 - r() * 0.2, depth - 1); grow(x1, y1, len * 0.7, ang + 0.45 + r() * 0.2, depth - 1); } }; grow(x, y, h, 0, 3); return `<path d='${d}' stroke='${c}' stroke-width='5' stroke-linecap='round' fill='none'/>`; };
    const fan = (x, y, r, c) => `<path d='M${x} ${y}L${x - r} ${y - r * 0.6}A${r} ${r} 0 0 1 ${x + r} ${y - r * 0.6}Z' fill='${c}' opacity='.85'/>` + Array.from({ length: 7 }, (_, i) => `<path d='M${x} ${y}L${f(x + r * Math.cos(Math.PI + 0.55 + i * 0.34))} ${f(y + r * Math.sin(Math.PI + 0.55 + i * 0.34))}' stroke='#5a1a3a' stroke-opacity='.4'/>`).join("");
    const brain = (x, y, r, c) => `<ellipse cx='${x}' cy='${y}' rx='${r}' ry='${r * 0.7}' fill='${c}'/>` + [0.3, 0.55, 0.8].map((k) => `<path d='M${x - r * k} ${y}q${r * k * 0.5} ${-r * 0.5 * k} ${r * k} 0t${r * k} 0' fill='none' stroke='#5a2a0a' stroke-opacity='.35' stroke-width='1.4'/>`).join("");
    const fish = scatter(3, 9, (r) => { const x = 340 + r() * 160, y = 40 + r() * 60, s = 0.6 + r() * 0.5; return `<g transform='translate(${f(x)} ${f(y)}) scale(${f(s)})'><path d='M-8 0C-4 -5 4 -5 8 0C4 5 -4 5 -8 0ZM8 0L13 -4V4Z' fill='#ffcf3a' stroke='#5a3a0a' stroke-width='.5'/><path d='M-2 -3.6V3.6' stroke='#1a2a5a' stroke-width='2'/><circle cx='-5' cy='-1' r='.8' fill='#000'/></g>`; });
    const body = s.b + rays + `<path d='${hills(170, [[8, 260, 1], [4, 80, 2]])}' fill='#c8a878'/>` + fan(470, 168, 40, "#ff6a9a") + branch(390, 175, 34, "#ff8a5a", 4) + branch(540, 178, 30, "#c86aff", 6) + brain(330, 172, 20, "#f2b630") + brain(590, 170, 18, "#7ad0a0") + branch(260, 180, 22, "#ff5a7a", 7) + fish +
      scatter(6, 18, (r) => `<circle cx='${f(300 + r() * 300)}' cy='${f(r() * 160)}' r='${f(1 + r() * 2)}' fill='none' stroke='#e6fbff' stroke-opacity='.5'/>`);
    return bannerDoc(s.d, body, 0.4);
  });

add("jellyfish-drift", "rare", 460, false,
  N("Denizanası Akıntısı", "Jellyfish Drift", "Quallendrift", "Deriva de medusas", "Dérive de méduses", "Deriva de águas-vivas", "Дрейф медуз"),
  N("Derin mavide kendi ışığıyla parlayan denizanaları.", "Jellyfish glowing with their own light in the deep blue.", "Quallen, die im tiefen Blau aus eigenem Licht leuchten.", "Medusas que brillan con luz propia en el azul profundo.", "Des méduses qui luisent de leur propre lumière dans le bleu profond.", "Águas-vivas brilhando com luz própria no azul profundo.", "Медузы, светящиеся собственным светом в глубокой синеве."),
  () => {
    const s = sky("s", [[0, "#0a2a5a"], [1, "#020818"]]);
    const jelly = (x, y, s, c, id) => `<g transform='translate(${x} ${y}) scale(${s})'><circle r='26' fill='url(#${id})' opacity='.55'/><path d='M-14 0C-14 -12 -7 -17 0 -17C7 -17 14 -12 14 0C10 2 6 0 3 2C0 0 -3 2 -6 0C-9 2 -12 0 -14 0Z' fill='${c}' fill-opacity='.55' stroke='${c}' stroke-width='1'/><path d='M-8 -8C-6 -12 -2 -13 2 -12' stroke='#fff' stroke-opacity='.7' stroke-width='1.4' fill='none'/>` + [-10, -5, 0, 5, 10].map((tx, i) => `<path d='M${tx} 1q${3 - i} 10 ${-1} 18t${1} 16' fill='none' stroke='${c}' stroke-opacity='.6' stroke-width='${i % 2 ? 0.8 : 1.4}'/>`).join("") + `</g>`;
    const motes = scatter(8, 50, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(0.5 + r() * 1.4)}' fill='#9fe8ff' opacity='${f(0.2 + r() * 0.6)}'/>`);
    const body = s.b + `<rect width='600' height='120' fill='url(#top)'/>` + motes + jelly(410, 62, 2.3, "#ff8ad8", "gp") + jelly(520, 110, 1.6, "#7ae0ff", "gc") + jelly(310, 120, 1.3, "#b08aff", "gv") + jelly(575, 36, 1, "#ff8ad8", "gp") + jelly(230, 44, 0.9, "#7ae0ff", "gc");
    return bannerDoc(s.d + lg("top", [[0, "#5ac8ff", 0.25], [1, "#5ac8ff", 0]]) + glow("gp", "#ff8ad8", 0.6) + glow("gc", "#7ae0ff", 0.6) + glow("gv", "#b08aff", 0.6), body, 0.4);
  });

add("synth-horizon", "rare", 400, false,
  N("Sentez Ufku", "Synth Horizon", "Synthhorizont", "Horizonte synth", "Horizon synth", "Horizonte synth", "Синт-горизонт"),
  N("Çizgili güneş, mor dağlar ve ufka akan parlak ızgara.", "A striped sun, violet mountains and a glowing grid running to the horizon.", "Eine gestreifte Sonne, violette Berge und ein leuchtendes Gitter bis zum Horizont.", "Un sol a rayas, montañas violetas y una cuadrícula brillante hacia el horizonte.", "Un soleil rayé, des montagnes violettes et une grille lumineuse jusqu'à l'horizon.", "Um sol listrado, montanhas violetas e uma grade brilhante rumo ao horizonte.", "Полосатое солнце, фиолетовые горы и светящаяся сетка до горизонта."),
  () => {
    const s = sky("s", [[0, "#0a0420"], [0.6, "#3a0a5a"], [1, "#ff3a8a"]]);
    const hz = 120, vx = 420;
    let grid = "";
    for (let i = -16; i <= 16; i++) grid += `M${vx + i * 6} ${hz}L${vx + i * 70} 200`;
    for (let k = 0; k < 9; k++) { const y = hz + Math.pow(k / 8, 1.8) * 80; grid += `M0 ${f(y)}H600`; }
    const sun = `<circle cx='${vx}' cy='76' r='46' fill='url(#sun)' clip-path='url(#cut)'/><clipPath id='cut'>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x='300' y='${30 + i * 15 - (i > 2 ? (i - 2) * 2 : 0)}' width='240' height='${15 - (i > 2 ? (i - 1) * 2 : 0)}'/>`).join("")}</clipPath>`;
    const body = s.b + stars(2, 50, [0, 0, 600, 80], ["#fff", "#ffc0f0"], 0.9) + sun + `<path d='${ridge(9, hz - 4, 26, 0.5, hz, 48, [[300, 22, 80], [540, 18, 70]])}' fill='#2a0a4a'/><path d='${ridge(9, hz - 4, 26, 0.5, hz, 48, [[300, 22, 80], [540, 18, 70]]).replace(/L600 \d+Z$/, "").replace(/^M0 \d+/, "M0 999")}' fill='none' stroke='#ff4ad0' stroke-width='1.2'/>` +
      `<rect y='${hz}' width='600' height='80' fill='#120424'/><path d='${grid}' stroke='#ff3ad0' stroke-width='1.2' fill='none' filter='url(#b)'/><path d='${grid}' stroke='#ffb0f0' stroke-width='.6' fill='none'/><rect y='${hz}' width='600' height='30' fill='url(#fade)'/>`;
    return bannerDoc(s.d + lg("sun", ["#fff36a", "#ff8a3a", "#ff2a8a"]) + blur("b", 2) + lg("fade", [[0, "#ff3a8a", 0.45], [1, "#ff3a8a", 0]]), body, 0.4);
  });

add("circuit-board", "rare", 360, false,
  N("Devre Kartı", "Circuit Board", "Platine", "Placa de circuito", "Circuit imprimé", "Placa de circuito", "Печатная плата"),
  N("Koyu yeşil kartta çipler, parlayan yollar ve akan sinyaller.", "Chips, glowing traces and flowing signals on a dark green board.", "Chips, leuchtende Leiterbahnen und fließende Signale auf dunkelgrüner Platine.", "Chips, pistas brillantes y señales que fluyen sobre una placa verde oscuro.", "Des puces, des pistes lumineuses et des signaux qui circulent sur une carte vert sombre.", "Chips, trilhas brilhantes e sinais fluindo em uma placa verde-escura.", "Чипы, светящиеся дорожки и бегущие сигналы на тёмно-зелёной плате."),
  () => {
    const r = rnd(33);
    let tr = "", pads = "";
    for (let i = 0; i < 34; i++) {
      let x = Math.round(r() * 30) * 20, y = Math.round(r() * 10) * 20; let d = `M${x} ${y}`;
      for (let k = 0; k < 4; k++) { const dir = Math.floor(r() * 4), len = (1 + Math.floor(r() * 4)) * 20; if (dir === 0) x += len; else if (dir === 1) y += len; else if (dir === 2) { x += len * 0.5; y += len * 0.5; } else { x += len * 0.5; y -= len * 0.5; } d += `L${x} ${y}`; }
      tr += d; pads += `<circle cx='${x}' cy='${y}' r='3' fill='#0a1a14' stroke='#5affb0' stroke-width='1.4'/>`;
    }
    const chip = (x, y, w, h) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='#121c1a' stroke='#3a5a50'/>` + Array.from({ length: Math.floor(w / 8) }, (_, i) => `<path d='M${x + 6 + i * 8} ${y}v-5M${x + 6 + i * 8} ${y + h}v5' stroke='#b8c8c0' stroke-width='2'/>`).join("") + `<circle cx='${x + 8}' cy='${y + 8}' r='2' fill='#3a5a50'/>`;
    const body = `<rect width='600' height='200' fill='url(#pc)'/><path d='${tr}' fill='none' stroke='#1fe090' stroke-width='3' stroke-opacity='.25' filter='url(#b)'/><path d='${tr}' fill='none' stroke='#2a8a5a' stroke-width='2'/><path d='${tr}' fill='none' stroke='#9fffd0' stroke-width='2' stroke-dasharray='6 60'/>` + pads + chip(380, 60, 90, 56) + chip(500, 120, 50, 36) + chip(260, 20, 40, 30) + `<rect x='390' y='70' width='70' height='36' rx='2' fill='url(#die)'/>`;
    return bannerDoc(rg("pc", ["#0f3a2a", "#062018"], 0.7, 0.4, 0.9) + blur("b", 2.4) + lg("die", ["#2a3a36", "#121c1a"], 0, 0, 1, 1), body, 0.45);
  });

add("black-marble", "rare", 440, false,
  N("Altın Damarlı Mermer", "Black Marble", "Schwarzer Marmor", "Mármol negro", "Marbre noir", "Mármore negro", "Чёрный мрамор"),
  N("Cilalı siyah mermerde akan altın damarlar.", "Gold veins running through polished black marble.", "Goldene Adern, die sich durch polierten schwarzen Marmor ziehen.", "Vetas doradas que recorren un mármol negro pulido.", "Des veines d'or qui serpentent dans un marbre noir poli.", "Veios dourados correndo por um mármore negro polido.", "Золотые прожилки в полированном чёрном мраморе."),
  () => {
    const r = rnd(44);
    const vein = (x0, y0, len, w) => { let d = `M${x0} ${y0}`, x = x0, y = y0; for (let i = 0; i < len; i++) { x += 10 + r() * 20; y += (r() - 0.45) * 22; d += `L${f(x)} ${f(y)}`; } return `<path d='${d}' fill='none' stroke='url(#gv)' stroke-width='${w}' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#fff6d0' stroke-width='${f(w * 0.3)}' stroke-opacity='.7'/>`; };
    const faint = scatter(5, 18, (r2) => { let x = r2() * 600, y = r2() * 200, d = `M${f(x)} ${f(y)}`; for (let i = 0; i < 6; i++) { x += 14 + r2() * 20; y += (r2() - 0.5) * 18; d += `L${f(x)} ${f(y)}`; } return `<path d='${d}' fill='none' stroke='#9aa0b8' stroke-opacity='${f(0.08 + r2() * 0.12)}' stroke-width='${f(0.6 + r2() * 1.2)}'/>`; });
    const body = `<rect width='600' height='200' fill='url(#mb)'/>` + faint + vein(160, 200, 26, 3) + vein(300, 0, 18, 1.6) + vein(380, 120, 14, 2.4) + vein(220, 60, 10, 1) + vein(420, 20, 12, 1.4) + vein(330, 170, 14, 1.8) + `<rect width='600' height='200' fill='url(#sh)'/>`;
    return bannerDoc(lg("mb", ["#1a1a22", "#0a0a10", "#22222c"], 0, 0, 1, 1) + lg("gv", ["#8a5a10", "#ffd76a", "#c8901f", "#fff3c0"], 0, 0, 1, 0) + lg("sh", [[0, "#fff", 0], [0.45, "#fff", 0.07], [0.55, "#fff", 0], [1, "#fff", 0]], 0, 0, 1, 0.6), body, 0.4);
  });

add("stained-glass", "rare", 500, false,
  N("Vitray", "Stained Glass", "Bleiglas", "Vitral", "Vitrail", "Vitral", "Витраж"),
  N("Kurşun çizgilerle ayrılmış, arkadan ışık alan renkli cam parçaları.", "Pieces of coloured glass lit from behind, divided by lead lines.", "Von hinten beleuchtete Farbglasstücke, durch Bleiruten getrennt.", "Piezas de vidrio de colores iluminadas desde atrás y unidas por plomo.", "Des morceaux de verre coloré éclairés par l'arrière, cernés de plomb.", "Pedaços de vidro colorido iluminados por trás, unidos por chumbo.", "Кусочки цветного стекла, подсвеченные сзади и разделённые свинцовыми линиями."),
  () => {
    const r = rnd(55);
    const cols = ["#d0304a", "#2a5ad0", "#f2b630", "#2aa070", "#8a3ad0", "#ff7a3a", "#3ac0d0"];
    const G = 40, P = [];
    for (let j = 0; j <= 6; j++) { P.push([]); for (let i = 0; i <= 16; i++) P[j].push([i * G - 20 + (i && i < 16 ? (r() - 0.5) * 22 : 0), j * G - 20 + (j && j < 6 ? (r() - 0.5) * 22 : 0)]); }
    let cells = "";
    for (let j = 0; j < 6; j++) for (let i = 0; i < 16; i++) {
      const q = [P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]];
      const split = r() > 0.5;
      const tris = split ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]];
      for (const t of tris) cells += `<path d='M${t.map((p) => `${f(p[0])} ${f(p[1])}`).join("L")}Z' fill='${cols[Math.floor(r() * cols.length)]}' fill-opacity='${f(0.75 + r() * 0.25)}'/>`;
    }
    const rose = `<g transform='translate(450 90)'><circle r='60' fill='none' stroke='#1a1420' stroke-width='5'/>${Array.from({ length: 12 }, (_, i) => `<path d='M0 0L${f(60 * Math.cos(i * Math.PI / 6))} ${f(60 * Math.sin(i * Math.PI / 6))}' stroke='#1a1420' stroke-width='4'/><circle cx='${f(42 * Math.cos(i * Math.PI / 6 + 0.26))}' cy='${f(42 * Math.sin(i * Math.PI / 6 + 0.26))}' r='9' fill='${cols[i % 7]}' stroke='#1a1420' stroke-width='3'/>`).join("")}<circle r='18' fill='#f2b630' stroke='#1a1420' stroke-width='4'/></g>`;
    const body = `<rect width='600' height='200' fill='#1a1420'/><g stroke='#1a1420' stroke-width='3.4' stroke-linejoin='round'>${cells}</g>` + rose + `<rect width='600' height='200' fill='url(#li)'/>` + `<rect width='600' height='200' fill='none' stroke='#1a1420' stroke-width='10'/>`;
    return bannerDoc(rg("li", [[0, "#fff8e0", 0.45], [0.6, "#fff8e0", 0.08], [1, "#000", 0.3]], 0.75, 0.4, 0.8), body, 0.3);
  });

add("low-poly-peaks", "rare", 380, false,
  N("Poligon Zirveler", "Low Poly Peaks", "Low-Poly-Gipfel", "Picos low poly", "Sommets low poly", "Picos low poly", "Низкополигональные вершины"),
  N("Üçgen yüzeylerle kurulmuş, gün batımı ışığı alan dağlar.", "Mountains built from triangular facets, catching the sunset light.", "Aus Dreiecksflächen gebaute Berge im Licht des Sonnenuntergangs.", "Montañas hechas de facetas triangulares que atrapan la luz del ocaso.", "Des montagnes taillées en facettes triangulaires, dans la lumière du couchant.", "Montanhas feitas de facetas triangulares sob a luz do pôr do sol.", "Горы из треугольных граней в свете заката."),
  () => {
    const s = sky("s", [[0, "#1a1a4a"], [0.6, "#a84a7a"], [1, "#ffb06a"]]);
    const peaks = [[250, 70], [330, 40], [420, 22], [500, 52], [580, 36]];
    let tris = "";
    const base = 170;
    peaks.forEach(([px, py], i) => { const l = px - 90, rr = px + 90, mid = (py + base) / 2; const tri = (a, b, c, col) => `<path d='M${a}L${b}L${c}Z' fill='${col}' stroke='${col}' stroke-width='.6'/>`; tris += tri(`${l} ${base}`, `${px} ${py}`, `${px - 30} ${f(mid)}`, "#3a2a5a") + tri(`${px - 30} ${f(mid)}`, `${px} ${py}`, `${px + 10} ${f(mid + 20)}`, "#6a3a6a") + tri(`${px} ${py}`, `${rr} ${base}`, `${px + 10} ${f(mid + 20)}`, "#c86a6a") + tri(`${px + 10} ${f(mid + 20)}`, `${rr} ${base}`, `${px - 30} ${f(mid)}`, "#8a4a6a") + tri(`${l} ${base}`, `${px - 30} ${f(mid)}`, `${px + 10} ${f(mid + 20)}`, "#4a2a5a") + tri(`${px} ${py}`, `${px - 8} ${py + 16}`, `${px + 8} ${py + 18}`, "#ffe0d0"); });
    const fg = (y, c, n, seed) => { const r = rnd(seed); let p = `M0 ${y}`; for (let i = 0; i <= n; i++) p += `L${f((i / n) * 600)} ${f(y - r() * 14)}`; return `<path d='${p}L600 200L0 200Z' fill='${c}'/>`; };
    return bannerDoc(s.d, s.b + `<circle cx='180' cy='90' r='22' fill='#ffe0b0' opacity='.9'/>` + tris + fg(178, "#2a1a3a", 14, 3) + fg(192, "#140c22", 10, 5), 0.3);
  });

add("ink-mountains", "rare", 420, false,
  N("Mürekkep Dağlar", "Ink Mountains", "Tuschberge", "Montañas de tinta", "Montagnes à l'encre", "Montanhas de nanquim", "Тушевые горы"),
  N("Pirinç kâğıdında mürekkep lekesi dağlar ve kırmızı bir güneş.", "Ink-wash mountains on rice paper under a red sun.", "Tuschberge auf Reispapier unter einer roten Sonne.", "Montañas a la aguada sobre papel de arroz bajo un sol rojo.", "Des montagnes au lavis sur papier de riz, sous un soleil rouge.", "Montanhas em aguada sobre papel de arroz sob um sol vermelho.", "Горы, написанные тушью на рисовой бумаге, под красным солнцем."),
  () => {
    const body = `<rect width='600' height='200' fill='url(#pp)'/>` + `<circle cx='470' cy='56' r='26' fill='#d0302a' opacity='.9'/>` +
      [[100, 30, "#8a8a90", 0.35], [118, 26, "#5a5a62", 0.55], [140, 30, "#2a2a32", 0.8]].map(([y, a, c, o], i) => `<path d='${ridge(i * 13 + 2, y, a, 0.6, 210, 64, i === 1 ? [[380, 60, 70], [520, 40, 60]] : i === 0 ? [[300, 30, 80]] : [[450, 30, 90]])}' fill='${c}' opacity='${o}' filter='url(#ink)'/>`).join("") +
      `<rect y='120' width='600' height='40' fill='url(#mist)'/><path d='M330 150c10 -2 20 -1 30 2' stroke='#2a2a32' stroke-width='1.2' fill='none'/><path d='M346 151l-4 -6h10z' fill='#2a2a32'/>` + `<path d='M150 70l4 3l4 -3M164 64l3 2l3 -2' stroke='#2a2a32' stroke-width='1' fill='none'/>` + `<rect x='540' y='140' width='20' height='28' rx='2' fill='#c0302a' opacity='.85'/><path d='M545 146h10M545 152h10M550 146v18M545 160h10' stroke='#f2e6d0' stroke-width='1.6'/>`;
    return bannerDoc(lg("pp", ["#f6efe0", "#e8dcc4"], 0, 0, 1, 1) + lg("mist", [[0, "#f6efe0", 0], [0.5, "#f6efe0", 0.8], [1, "#f6efe0", 0]]) + `<filter id='ink'><feTurbulence type='fractalNoise' baseFrequency='.04' numOctaves='2' seed='3'/><feDisplacementMap in='SourceGraphic' scale='6'/></filter>`, body, 0.15);
  });

add("sunflower-field", "rare", 360, false,
  N("Ayçiçeği Tarlası", "Sunflower Field", "Sonnenblumenfeld", "Campo de girasoles", "Champ de tournesols", "Campo de girassóis", "Подсолнуховое поле"),
  N("Mavi gökyüzü altında güneşe dönmüş ayçiçekleri.", "Sunflowers turned toward the sun under a blue sky.", "Sonnenblumen, die sich unter blauem Himmel der Sonne zuwenden.", "Girasoles vueltos hacia el sol bajo un cielo azul.", "Des tournesols tournés vers le soleil sous un ciel bleu.", "Girassóis voltados para o sol sob um céu azul.", "Подсолнухи, повернувшиеся к солнцу под синим небом."),
  () => {
    const s = sky("s", [[0, "#2a7ad8"], [0.7, "#8ac8f2"], [1, "#e0f2ff"]]);
    const sf = `<g id='sf'>${Array.from({ length: 14 }, (_, i) => `<path d='${leaf(13, 4)}' transform='rotate(${i * 25.7})' fill='url(#pt)' stroke='#b8700a' stroke-width='.5'/>`).join("")}<circle r='7.5' fill='url(#ct)'/><circle r='7.5' fill='none' stroke='#2a1404' stroke-width='1' stroke-dasharray='1 1.5'/></g>`;
    const r = rnd(12);
    let field = "";
    for (let row = 0; row < 4; row++) { const y = 120 + row * 22, sc = 0.45 + row * 0.3; for (let x = (row % 2) * 20 + 120; x < 620; x += 34 + row * 18) { const xx = f(x + r() * 10); field += `<path d='M${xx} ${y}V${y + 50}' stroke='#3a7a2a' stroke-width='${f(1 + row)}'/><path d='${leaf(10 * sc + 4, 4 * sc + 1)}' transform='translate(${xx} ${y + 16}) rotate(60)' fill='#4a9a3a'/><use href='#sf' transform='translate(${xx} ${y}) scale(${f(sc)})'/>`; } }
    return bannerDoc(s.d + sf + rg("pt", ["#fff3a0", "#ffc21a", "#e08a0a"], 0.5, 0.9, 1) + rg("ct", ["#6a3a14", "#3a1e08"]) + glow("g", "#fff", 0.8),
      s.b + cloud(150, 40, 1.2, "#fff", 0.85) + cloud(260, 60, 0.7, "#fff", 0.7) + `<circle cx='520' cy='36' r='60' fill='url(#g)'/><circle cx='520' cy='36' r='16' fill='#fffbe0'/><path d='${hills(118, [[5, 260, 1]])}' fill='#5aa83a'/>` + field, 0.25);
  });

add("waterfall-cliff", "rare", 480, false,
  N("Şelale Yarı", "Waterfall Cliff", "Wasserfallklippe", "Acantilado de la cascada", "Falaise de la cascade", "Penhasco da cachoeira", "Утёс с водопадом"),
  N("Yosunlu kayalardan dökülen şelale, sis ve gökkuşağı.", "A waterfall pouring from mossy cliffs into mist, with a rainbow.", "Ein Wasserfall stürzt von moosigen Klippen in den Nebel, dazu ein Regenbogen.", "Una cascada que cae de acantilados con musgo entre bruma y un arcoíris.", "Une cascade tombant de falaises moussues dans la brume, avec un arc-en-ciel.", "Uma cachoeira despencando de penhascos cobertos de musgo, névoa e arco-íris.", "Водопад падает с замшелых скал в туман, над ним радуга."),
  () => {
    const s = sky("s", [[0, "#6ab0e0"], [1, "#d8f0ff"]]);
    const fall = `<path d='M410 40C412 90 408 140 414 200H470C474 140 468 90 470 40Z' fill='url(#fw)'/>` + scatter(3, 16, (r) => { const x = f(414 + r() * 54); return `<path d='M${x} ${f(40 + r() * 30)}V${f(120 + r() * 80)}' stroke='#fff' stroke-opacity='${f(0.3 + r() * 0.5)}' stroke-width='${f(1 + r() * 2)}'/>`; });
    const cliffL = `<path d='M300 200V60L330 36L380 30L412 40V200Z' fill='url(#rk)'/><path d='M300 60L330 36L380 30L412 40' fill='none' stroke='#3a8a3a' stroke-width='8' stroke-linejoin='round'/>`;
    const cliffR = `<path d='M468 40L500 28L560 36L600 30V200H470Z' fill='url(#rk)'/><path d='M468 40L500 28L560 36L600 30' fill='none' stroke='#3a8a3a' stroke-width='8' stroke-linejoin='round'/>`;
    const rainbow = ["#ff5a5a", "#ffb03a", "#ffe04a", "#5ad07a", "#4a9aff", "#9a6aff"].map((c, i) => `<path d='M340 200A110 110 0 0 1 560 200' fill='none' stroke='${c}' stroke-width='3' stroke-opacity='.35' transform='translate(0 ${i * 3}) scale(1 .9)'/>`).join("");
    const mist = `<g fill='#fff' opacity='.8'>${cloudBand(9, 176, 12, 22, 360, 540)}</g>`;
    const trees = `<path d='${pineRow(4, 34, 14, 24, 300, 410, 10)}${pineRow(5, 30, 14, 26, 470, 600, 11)}' fill='#1f5a2a'/>`;
    return bannerDoc(s.d + lg("fw", ["#e6faff", "#9fe0ff", "#5ab0e0"], 0, 0, 1, 0) + lg("rk", ["#6a6a72", "#3a3a44", "#1e1e26"], 0, 0, 1, 1), s.b + `<path d='${ridge(3, 110, 20)}' fill='#9ac0d8'/>` + rainbow + cliffL + cliffR + fall + trees + mist, 0.3);
  });

add("rooftop-rain", "rare", 400, false,
  N("Yağmurlu Çatılar", "Rooftop Rain", "Regen über den Dächern", "Lluvia en los tejados", "Pluie sur les toits", "Chuva nos telhados", "Дождь над крышами"),
  N("Su depolu çatılar, sisli neon ve çapraz yağan yağmur.", "Rooftops with water towers, misty neon and slanting rain.", "Dächer mit Wassertürmen, neblige Neonlichter und schräger Regen.", "Tejados con depósitos de agua, neón brumoso y lluvia oblicua.", "Des toits à châteaux d'eau, des néons dans la brume et une pluie oblique.", "Telhados com caixas-d'água, neon enevoado e chuva inclinada.", "Крыши с водонапорными баками, неон в тумане и косой дождь."),
  () => {
    const s = sky("s", [[0, "#141a2e"], [1, "#3a2a4a"]]);
    const far = skyline(13, 150, 40, 110, -10, 610, 20, 46, "#ffb04a", 0.22);
    const tower = (x, y) => `<g transform='translate(${x} ${y})'><path d='M-14 0L-10 -26H10L14 0Z' fill='#2a1e1a'/><path d='M-12 -26Q0 -36 12 -26Z' fill='#3a2a24'/><path d='M-12 0L-14 18M12 0L14 18M-12 0L12 18M12 0L-12 18' stroke='#2a1e1a' stroke-width='1.6'/><path d='M-14 -8H14M-13 -16H13' stroke='#4a3a32' stroke-width='1'/></g>`;
    const neon = `<rect x='360' y='60' width='70' height='22' rx='4' fill='none' stroke='#ff4a9a' stroke-width='2.4' filter='url(#b)'/><rect x='360' y='60' width='70' height='22' rx='4' fill='none' stroke='#ffc0e0' stroke-width='1'/><rect x='470' y='90' width='14' height='50' rx='3' fill='none' stroke='#4af0ff' stroke-width='2.4' filter='url(#b)'/><rect x='470' y='90' width='14' height='50' rx='3' fill='none' stroke='#c0faff' stroke-width='1'/>`;
    const rain = scatter(7, 90, (r) => { const x = r() * 640, y = r() * 200; return `<path d='M${f(x)} ${f(y)}l-6 16' stroke='#c8d8ff' stroke-opacity='${f(0.15 + r() * 0.35)}' stroke-width='1'/>`; });
    const body = s.b + `<circle cx='420' cy='70' r='160' fill='url(#cg)'/><path d='${far.body}' fill='#2e2644'/><path d='${far.windows}' fill='#ffb04a' opacity='.75'/><rect y='90' width='600' height='70' fill='url(#fog)'/>` + neon + `<path d='M0 200V160H140V150H260V170H600V200Z' fill='#0e0a14'/>` + tower(90, 150) + tower(320, 170) + `<rect y='150' width='600' height='50' fill='url(#fog)'/>` + rain;
    return bannerDoc(s.d + blur("b", 3) + lg("fog", [[0, "#ff8ac0", 0], [0.6, "#ff8ac0", 0.18], [1, "#ff8ac0", 0.05]]) + glow("cg", "#ff6aa8", 0.3), body, 0.4);
  });

add("night-train", "rare", 540, false,
  N("Gece Treni", "Night Train", "Nachtzug", "Tren nocturno", "Train de nuit", "Trem noturno", "Ночной поезд"),
  N("Yıldızlı bir vadide köprüden geçen, pencereleri yanan tren.", "A train with glowing windows crossing a bridge over a starry valley.", "Ein Zug mit leuchtenden Fenstern überquert eine Brücke über einem Sternental.", "Un tren con ventanas encendidas cruza un puente sobre un valle estrellado.", "Un train aux fenêtres allumées traverse un pont au-dessus d'une vallée étoilée.", "Um trem de janelas acesas cruzando uma ponte sobre um vale estrelado.", "Поезд с горящими окнами пересекает мост над звёздной долиной."),
  () => {
    const s = sky("s", [[0, "#06081e"], [0.7, "#1a2458"], [1, "#3a3a7a"]]);
    const arches = Array.from({ length: 8 }, (_, i) => `M${200 + i * 50} 200V140A25 22 0 0 1 ${250 + i * 50} 140V200`).join("");
    const cars = Array.from({ length: 5 }, (_, i) => { const x = 260 + i * 62; return `<rect x='${x}' y='104' width='58' height='18' rx='3' fill='#1a1430'/>` + [0, 1, 2, 3, 4].map((k) => `<rect x='${x + 5 + k * 10.6}' y='108' width='7' height='6' rx='1' fill='#ffd27a'/>`).join(""); }).join("");
    const loco = `<path d='M570 104H600V122H564Z' fill='#1a1430'/><circle cx='600' cy='112' r='22' fill='url(#hl)'/>`;
    const body = s.b + stars(41, 110, [0, 0, 600, 110], ["#fff", "#cfd8ff", "#ffe9c8"], 1.1, 6) + `<path d='M60 60C200 30 400 20 600 40' fill='none' stroke='#c6b7ff' stroke-opacity='.1' stroke-width='30'/>` + `<path d='${ridge(7, 140, 30, 0.55, 200, 48, [[120, 30, 90]])}' fill='#141a40'/>` +
      `<rect x='180' y='122' width='420' height='8' fill='#0e1030'/><path d='${arches}H200Z' fill='#0e1030'/>` + `<g fill='url(#wg)'>${cars.replace(/fill='#1a1430'/g, "fill='#1a1430'")}</g>` + `<rect x='256' y='120' width='310' height='60' fill='url(#refl)'/>` + loco + `<path d='${ridge(9, 176, 10, 0.5)}' fill='#080a20'/>`;
    return bannerDoc(s.d + rg("hl", [[0, "#fff6d0", 0.8], [1, "#fff6d0", 0]]) + lg("refl", [[0, "#ffd27a", 0.15], [1, "#ffd27a", 0]]), body, 0.4);
  });

add("art-deco", "rare", 450, false,
  N("Art Deco Yelpaze", "Art Deco Fans", "Art-déco-Fächer", "Abanicos art déco", "Éventails Art déco", "Leques art déco", "Веера ар-деко"),
  N("Siyah zeminde ince altın çizgili, iç içe yelpaze deseni.", "Nested fan motifs drawn in fine gold lines on black.", "Verschachtelte Fächermotive in feinen Goldlinien auf Schwarz.", "Motivos de abanicos anidados en finas líneas doradas sobre negro.", "Des motifs d'éventails imbriqués en fins traits d'or sur fond noir.", "Motivos de leques aninhados em finas linhas douradas sobre preto.", "Вложенные веера тонкими золотыми линиями на чёрном."),
  () => {
    const R = 40;
    const fan = `<g id='fn'><path d='M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z' fill='#0e0e14' stroke='url(#gd)' stroke-width='1.6'/>${[0.78, 0.56, 0.34].map((k) => `<path d='M${-R * k} 0A${R * k} ${R * k} 0 0 1 ${R * k} 0' fill='none' stroke='url(#gd)' stroke-width='1.2'/>`).join("")}${Array.from({ length: 9 }, (_, i) => `<path d='M0 0L${f(R * Math.cos(Math.PI + (i + 0.5) * Math.PI / 9))} ${f(R * Math.sin(Math.PI + (i + 0.5) * Math.PI / 9))}' stroke='url(#gd)' stroke-width='.8'/>`).join("")}<circle r='4' fill='url(#gd)'/></g>`;
    let s = "";
    for (let row = 0; row < 7; row++) for (let col = -1; col < 9; col++) s += `<use href='#fn' x='${col * R * 2 + (row % 2) * R}' y='${row * R * 0.75 - 10}'/>`;
    return bannerDoc(`<linearGradient id='gd' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='600' y2='200'><stop offset='0' stop-color='#8a6a2a'/><stop offset='.45' stop-color='#ffe6a0'/><stop offset='.6' stop-color='#c8901f'/><stop offset='1' stop-color='#6a4a14'/></linearGradient>` + fan + rg("sp", [[0, "#ffe6a0", 0.25], [1, "#ffe6a0", 0]]), `<rect width='600' height='200' fill='#0e0e14'/>` + s + `<circle cx='440' cy='60' r='180' fill='url(#sp)'/>`, 0.45);
  });

add("glacier-bay", "rare", 420, false,
  N("Buzul Koyu", "Glacier Bay", "Gletscherbucht", "Bahía glaciar", "Baie des glaciers", "Baía glacial", "Ледниковый залив"),
  N("Sakin suda yüzen buz kütleleri ve yansıyan turkuaz buzul.", "Icebergs floating on still water beneath a turquoise glacier.", "Eisberge auf stillem Wasser vor einem türkisfarbenen Gletscher.", "Icebergs flotando en aguas quietas bajo un glaciar turquesa.", "Des icebergs sur une eau immobile, sous un glacier turquoise.", "Icebergs boiando em águas calmas sob uma geleira turquesa.", "Айсберги на спокойной воде под бирюзовым ледником."),
  () => {
    const s = sky("s", [[0, "#8ab8e0"], [1, "#f0f8ff"]]);
    const glacier = `<path d='M200 120L240 70L290 82L330 50L380 66L430 40L480 60L540 46L600 64V120Z' fill='url(#gl)'/><path d='M240 70L250 120M330 50L320 120M430 40L440 120M540 46L530 120' stroke='#fff' stroke-opacity='.6' stroke-width='2'/>`;
    const berg = (x, w, h) => `<path d='M${x - w} 140L${x - w * 0.5} ${140 - h}L${x + w * 0.2} ${140 - h * 0.8}L${x + w} 140Z' fill='url(#ib)'/><path d='M${x - w * 0.5} ${140 - h}L${x - w * 0.1} 140' stroke='#5ac8e0' stroke-opacity='.5' stroke-width='2'/><path d='M${x - w} 140L${x - w * 0.6} ${140 + h * 0.6}L${x + w * 0.7} ${140 + h * 0.5}L${x + w} 140Z' fill='#5ac8e0' opacity='.35'/>`;
    const body = s.b + `<path d='${ridge(5, 90, 30, 0.55, 130, 48, [[120, 30, 90]])}' fill='#b0c8e0'/>` + glacier + `<rect y='120' width='600' height='80' fill='url(#wt)'/>` + `<use href='#gk' transform='translate(0 240) scale(1 -1)' opacity='.25'/>` + berg(330, 30, 22) + berg(460, 46, 30) + berg(560, 20, 12) + scatter(4, 20, (r) => `<path d='M${f(r() * 600)} ${f(126 + r() * 70)}h${f(10 + r() * 40)}' stroke='#fff' stroke-opacity='${f(0.2 + r() * 0.3)}'/>`);
    return bannerDoc(s.d + `<g id='gk'>${glacier}</g>` + lg("gl", ["#ffffff", "#bff0ff", "#5ac0e0"]) + lg("ib", ["#ffffff", "#d0f4ff"], 0, 0, 1, 1) + lg("wt", ["#4a9ac0", "#1a4a6a"]), body, 0.3);
  });
// ================================================================= epic (animated, finite)
add("aurora-pines", "epic", 720, true,
  N("Kutup Işığı Ormanı", "Aurora Pines", "Polarlichtkiefern", "Pinos de aurora", "Pins sous l'aurore", "Pinheiros sob a aurora", "Сосны под сиянием"),
  N("Karlı çamların üstünde dalgalanan yeşil ve mor kutup ışığı.", "Green and violet aurora rippling over snowy pines.", "Grünes und violettes Polarlicht wogt über verschneiten Kiefern.", "Aurora verde y violeta ondulando sobre pinos nevados.", "Une aurore verte et violette qui ondule au-dessus de pins enneigés.", "Aurora verde e violeta ondulando sobre pinheiros nevados.", "Зелёное и фиолетовое сияние колышется над заснеженными соснами."),
  () => {
    const s = sky("s", [[0, "#020a1a"], [0.7, "#0a2a3a"], [1, "#143a4a"]]);
    const curtain = (seed, y0, amp, len, id, x0, x1, dur) => { const r = rnd(seed); let d = ""; for (let x = x0; x < x1; x += 7) { const y = y0 + amp * Math.sin(x / 70) + amp * 0.5 * Math.sin(x / 23); const h = len * (0.6 + r() * 0.5); d += `M${x} ${f(y)}v${f(h)}`; } return `<g filter='url(#b)'><path d='${d}' stroke='url(#${id})' stroke-width='9' stroke-opacity='.75'/><animateTransform attributeName='transform' type='translate' values='0 0;-14 4;0 0' dur='${dur}s' repeatCount='3'/></g>`; };
    const body = s.b + stars(15, 80, [0, 0, 600, 110], ["#fff", "#d8fff0"], 1) + curtain(3, 14, 14, 80, "a1", 140, 640, 8) + curtain(5, 34, 10, 60, "a2", 260, 620, 10) + `<path d='${ridge(3, 140, 16, 0.5)}' fill='#1a3a4a'/><path d='${pineRow(6, 168, 30, 66, -10, 610, 20)}' fill='#04121a'/>` +
      `<path d='${hills(184, [[4, 200, 1]])}' fill='#d8eef8'/>`;
    return bannerDoc(s.d + lg("a1", [[0, "#c07bff", 0], [0.25, "#8f7bff", 0.6], [0.55, "#6effc7"], [1, "#2fe0a0", 0]]) + lg("a2", [[0, "#ff7bd0", 0], [0.3, "#c07bff", 0.7], [0.7, "#6effc7", 0.8], [1, "#6effc7", 0]]) + blur("b", 3.5), body, 0.35);
  }, ["animated"]);

add("nebula-bloom", "epic", 760, true,
  N("Bulutsu Çiçeği", "Nebula Bloom", "Nebelblüte", "Flor de nebulosa", "Floraison nébuleuse", "Flor de nebulosa", "Цветение туманности"),
  N("Pembe ve mavi bulutsu katmanları; yıldızlar birkaç kez göz kırpar.", "Pink and blue nebula clouds while the stars twinkle a few times.", "Rosa und blaue Nebelwolken, die Sterne funkeln ein paar Mal.", "Nubes de nebulosa rosas y azules mientras las estrellas titilan.", "Des nuages de nébuleuse rose et bleu, et des étoiles qui scintillent.", "Nuvens de nebulosa rosa e azul enquanto as estrelas cintilam.", "Розовые и синие облака туманности, звёзды несколько раз мерцают."),
  () => {
    const s = sky("s", [[0, "#05030f"], [1, "#0f0a2a"]]);
    const neb = (cx, cy, rx, ry, c, op, rot) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='${c}' opacity='${op}' transform='rotate(${rot} ${cx} ${cy})' filter='url(#b)'/>`;
    const body = s.b + `<g>${neb(420, 90, 160, 50, "#ff4ab0", 0.5, -15)}${neb(470, 70, 110, 40, "#7a5aff", 0.6, 20)}${neb(380, 120, 90, 30, "#2ae0ff", 0.4, -30)}${neb(500, 110, 60, 26, "#ffb06a", 0.5, 10)}${neb(200, 60, 120, 40, "#5a3aff", 0.3, 5)}<animateTransform attributeName='transform' type='translate' values='0 0;-12 3;0 0' dur='10s' repeatCount='2'/></g>` +
      `<g filter='url(#b2)' opacity='.8'>${neb(440, 90, 30, 10, "#fff", 0.8, -15)}</g>` + stars(9, 140, [0, 0, 600, 200], ["#fff", "#ffd6f0", "#cfe0ff"], 1.1) + twinkles(4, 8, [260, 10, 330, 180], "#fff", 2.4, 3);
    return bannerDoc(s.d + blur("b", 18) + blur("b2", 6), body, 0.35);
  }, ["animated"]);

add("fireworks", "epic", 820, true,
  N("Havai Fişek", "Fireworks", "Feuerwerk", "Fuegos artificiales", "Feux d'artifice", "Fogos de artifício", "Фейерверк"),
  N("Gece göğünde art arda açılan renkli havai fişekler.", "Colourful fireworks bursting one after another in the night sky.", "Bunte Feuerwerke, die nacheinander am Nachthimmel aufblühen.", "Fuegos artificiales de colores que estallan uno tras otro en la noche.", "Des feux d'artifice colorés qui éclatent l'un après l'autre dans la nuit.", "Fogos coloridos explodindo um após o outro no céu noturno.", "Разноцветные фейерверки один за другим вспыхивают в ночном небе."),
  () => {
    const s = sky("s", [[0, "#05051a"], [1, "#1e1438"]]);
    const burst = (x, y, R, c, n, begin) => { let rays = ""; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; rays += `M${f(R * 0.25 * Math.cos(a))} ${f(R * 0.25 * Math.sin(a))}L${f(R * Math.cos(a))} ${f(R * Math.sin(a))}`; } const dots = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx='${f(R * 1.08 * Math.cos(a))}' cy='${f(R * 1.08 * Math.sin(a))}' r='1.6' fill='#fff'/>`; }).join(""); return `<g transform='translate(${x} ${y})'><g><circle r='${R}' fill='url(#fg)' opacity='.35'/><path d='${rays}' stroke='${c}' stroke-width='1.8' stroke-linecap='round'/>${dots}<animateTransform attributeName='transform' type='scale' values='.2;1;1' keyTimes='0;.35;1' dur='2.6s' repeatCount='3' begin='${begin}s'/><animate attributeName='opacity' values='1;1;.85' keyTimes='0;.6;1' dur='2.6s' repeatCount='3' begin='${begin}s'/></g></g>`; };
    const body = s.b + stars(8, 40, [0, 0, 600, 120], ["#fff"], 0.8) + burst(420, 70, 46, "#ff5a8a", 24, 0) + burst(520, 50, 32, "#ffd36a", 18, 0.8) + burst(320, 50, 28, "#5ae0ff", 16, 1.4) + burst(560, 120, 24, "#b08aff", 14, 1.9) + `<path d='${skyline(3, 200, 16, 46, -10, 610, 18, 40, "#ffd27a", 0.18).body}' fill='#0a0818'/><rect y='170' width='600' height='30' fill='url(#gl)'/>`;
    return bannerDoc(s.d + rg("fg", [[0, "#fff", 0.5], [1, "#fff", 0]]) + lg("gl", [[0, "#ff8ab0", 0], [1, "#ff8ab0", 0.15]]), body, 0.3);
  }, ["animated"]);

add("thunderhead", "epic", 700, true,
  N("Fırtına Bulutu", "Thunderhead", "Gewitterturm", "Cumulonimbo", "Cumulonimbus", "Cúmulo de tempestade", "Грозовая туча"),
  N("Kabaran fırtına bulutu; içinden birkaç kez şimşek çakar.", "A towering storm cloud, lit from within by a few flashes of lightning.", "Eine aufgetürmte Gewitterwolke, die von innen ein paar Mal aufblitzt.", "Una gran nube de tormenta iluminada por dentro con algunos relámpagos.", "Un nuage d'orage colossal, éclairé de l'intérieur par quelques éclairs.", "Uma enorme nuvem de tempestade, iluminada por dentro por alguns relâmpagos.", "Огромная грозовая туча, которую изнутри несколько раз озаряют молнии."),
  () => {
    const s = sky("s", [[0, "#141a2e"], [0.7, "#2a3450"], [1, "#4a4a5e"]]);
    const cl = (seed, y, rmin, rmax, x0, x1, fill) => `<g fill='${fill}'>${cloudBand(seed, y, rmin, rmax, x0, x1, 18)}</g>`;
    const bolt = `<path d='M450 126L436 152L448 154L430 196L466 146L450 144L464 126Z' fill='#f5f9ff'/>`;
    const flash = (b) => `<animate attributeName='opacity' values='0;0;1;0;.8;0;0' keyTimes='0;.5;.52;.56;.6;.66;1' dur='3.4s' repeatCount='3' begin='${b}s'/>`;
    const tower = `<g fill='url(#c1)'>${cloudBand(3, 112, 22, 40, 280, 600, 16, false)}<path d='M300 130Q300 70 360 60Q380 20 440 18Q500 14 520 50Q590 56 600 100V130Z'/></g><g fill='url(#c2)'>${cloudBand(5, 40, 14, 26, 380, 520, 10, false)}</g><path d='M300 22Q450 2 600 18Q470 18 300 22Z' fill='#c8d4ea' opacity='.8'/><path d='M280 130Q450 120 600 128V150H280Z' fill='#1e2638'/>`;
    const body = s.b + `<rect width='600' height='200' fill='#9fc0ff' opacity='0'>${flash(0)}</rect>` + tower + `<g opacity='0' filter='url(#b)'>${bolt.replace(/440 90|452 90/g, (m) => m)}${flash(0)}</g><g opacity='0'>${bolt}${flash(0)}</g>` +
      `<path d='M290 150C300 170 310 190 300 200H600V150Z' fill='url(#rn)'/>` + scatter(9, 50, (r) => `<path d='M${f(300 + r() * 300)} ${f(140 + r() * 60)}l-4 12' stroke='#c8d8ff' stroke-opacity='${f(0.2 + r() * 0.35)}'/>`) + `<path d='${ridge(4, 182, 8, 0.5)}' fill='#0e121e'/>`;
    return bannerDoc(s.d + lg("c1", ["#e0e6f2", "#7a8aa8", "#2a3450"]) + lg("c2", ["#ffffff", "#aab8d0"]) + lg("rn", [[0, "#5a6a8a", 0.5], [1, "#5a6a8a", 0]]) + blur("b", 4), body, 0.35);
  }, ["animated"]);

add("firefly-meadow", "epic", 660, true,
  N("Ateşböceği Çayırı", "Firefly Meadow", "Glühwürmchenwiese", "Prado de luciérnagas", "Prairie des lucioles", "Campo de vaga-lumes", "Луг светлячков"),
  N("Mavi saatte uzun otlar arasında yanıp sönen ateşböcekleri.", "Fireflies blinking among tall grass at the blue hour.", "Glühwürmchen, die zur blauen Stunde im hohen Gras blinken.", "Luciérnagas que parpadean entre la hierba alta en la hora azul.", "Des lucioles qui clignotent dans les hautes herbes à l'heure bleue.", "Vaga-lumes piscando no capim alto na hora azul.", "Светлячки мерцают в высокой траве в синий час."),
  () => {
    const s = sky("s", [[0, "#0a1a3a"], [0.7, "#1a3a5a"], [1, "#2a5a5a"]]);
    const grass = (y, h, c, seed, n) => `<path fill='${c}' d='` + scatter(seed, n, (r) => { const x = r() * 620 - 10, hh = h * (0.6 + r() * 0.6), bend = (r() - 0.5) * 20; let d = ""; for (let k = -1; k <= 1; k += 2) { const xx = x + k * 4, b = bend + k * 6; d += `M${Math.round(xx - 2)} ${y}Q${Math.round(xx + b * 0.4)} ${Math.round(y - hh * 0.6)} ${Math.round(xx + b)} ${Math.round(y - hh * (1 - Math.abs(k) * 0.2))}Q${Math.round(xx + b * 0.4 + 1.5)} ${Math.round(y - hh * 0.6)} ${Math.round(xx + 2)} ${y}Z`; } return d; }) + `'/>`;
    const flies = scatter(11, 18, (r, i) => { const x = 220 + r() * 380, y = 40 + r() * 130; return `<g transform='translate(${f(x)} ${f(y)})'><circle r='7' fill='url(#fy)'/><circle r='1.6' fill='#fffbc0'/>${pulse("opacity", "1;.15;1", f(1.4 + r() * 1.8), 3, f(r() * 2))}<animateTransform attributeName='transform' type='translate' additive='sum' values='0 0;${f((r() - 0.5) * 16)} ${f(-6 - r() * 8)};0 0' dur='${f(4 + r() * 3)}s' repeatCount='3'/></g>`; });
    const body = s.b + stars(6, 40, [0, 0, 600, 70], ["#fff"], 0.8) + `<circle cx='500' cy='40' r='12' fill='#fff6d8'/><path d='${ridge(5, 120, 20, 0.5, 200, 48, [[200, 20, 120]])}' fill='#16304a'/><path d='${pineRow(3, 128, 16, 34, 0, 600, 22)}' fill='#0e2236'/>` + grass(200, 70, "#0e2a2a", 4, 26) + grass(200, 44, "#163a32", 5, 30) + flies + grass(206, 30, "#06161a", 7, 22);
    return bannerDoc(s.d + rg("fy", [[0, "#fff36a", 0.8], [0.4, "#c8ff6a", 0.35], [1, "#c8ff6a", 0]]), body, 0.4);
  }, ["animated"]);

add("lava-rift", "epic", 780, true,
  N("Lav Yarığı", "Lava Rift", "Lavaspalte", "Grieta de lava", "Faille de lave", "Fenda de lava", "Лавовый разлом"),
  N("Kararmış kayadaki çatlaklardan nabız gibi atan erimiş lav.", "Molten lava pulsing through cracks in blackened rock.", "Glühende Lava, die durch Risse in geschwärztem Gestein pulsiert.", "Lava fundida que late entre las grietas de una roca ennegrecida.", "De la lave en fusion qui palpite dans les fissures d'une roche noircie.", "Lava derretida pulsando pelas rachaduras de uma rocha enegrecida.", "Расплавленная лава пульсирует в трещинах почерневшей породы."),
  () => {
    const r = rnd(77);
    let cracks = "";
    const grow = (x, y, ang, len, w, depth) => { const x1 = x + len * Math.cos(ang), y1 = y + len * Math.sin(ang); cracks += `<path d='M${f(x)} ${f(y)}L${f(x1)} ${f(y1)}' stroke-width='${f(w)}'/>`; if (depth > 0) { grow(x1, y1, ang + (r() - 0.5) * 1.2, len * (0.7 + r() * 0.3), w * 0.75, depth - 1); if (r() > 0.45) grow(x1, y1, ang + (r() > 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * 0.6, w * 0.6, depth - 2); } };
    grow(250, 200, -0.5, 60, 9, 6); grow(420, 0, 1.9, 50, 7, 6); grow(600, 120, 3.4, 60, 8, 5); grow(380, 200, -1.4, 40, 6, 4);
    const body = `<rect width='600' height='200' fill='url(#rk)'/>` + scatter(3, 30, (r2) => `<path d='${poly(5 + Math.floor(r2() * 3), 10 + r2() * 30, r2() * 60)}' transform='translate(${f(r2() * 600)} ${f(r2() * 200)})' fill='#2a1a18' opacity='.5'/>`) +
      `<g stroke='#ff3d00' stroke-linecap='round' filter='url(#b)' opacity='.9'>${cracks}${pulse("opacity", ".9;.45;.9", 2.4, 3)}</g><g stroke='#ffb000' stroke-linecap='round'>${cracks.replace(/stroke-width='([\d.]+)'/g, (m, w) => `stroke-width='${f(w * 0.45)}'`)}</g>` + `<rect width='600' height='200' fill='url(#hz)'/>` +
      scatter(5, 16, (r2) => `<circle cx='${f(200 + r2() * 400)}' cy='${f(r2() * 200)}' r='${f(0.8 + r2() * 1.4)}' fill='#ffd27a'>${pulse("opacity", "0;1;0", f(1.6 + r2()), 3, f(r2() * 2))}</circle>`);
    return bannerDoc(lg("rk", ["#1a0a08", "#0a0404"], 0, 0, 1, 1) + blur("b", 4) + lg("hz", [[0, "#ff3d00", 0], [1, "#ff3d00", 0.18]]), body, 0.45);
  }, ["animated"]);

add("equalizer", "epic", 600, true,
  N("Ekolayzer", "Equalizer", "Equalizer", "Ecualizador", "Égaliseur", "Equalizador", "Эквалайзер"),
  N("Müziğe göre zıplayan parlak ses çubukları ve dalga çizgisi.", "Glowing sound bars and a waveform bouncing to the beat.", "Leuchtende Pegelbalken und eine Wellenform, die im Takt springen.", "Barras de sonido brillantes y una onda que saltan al ritmo.", "Des barres de son lumineuses et une onde qui sautent au rythme.", "Barras de som brilhantes e uma onda pulando no ritmo.", "Светящиеся полосы звука и волна, прыгающие в такт."),
  () => {
    const r = rnd(5);
    let bars = "";
    for (let i = 0; i < 34; i++) { const x = 180 + i * 12, h = 20 + Math.abs(Math.sin(i * 0.45)) * 70 + r() * 30, h2 = 14 + r() * 60; bars += `<rect x='${x}' y='${f(150 - h)}' width='8' height='${f(h)}' rx='3' fill='url(#eq)'><animate attributeName='height' values='${f(h)};${f(h2)};${f(h)}' dur='${f(0.8 + r() * 0.6)}s' repeatCount='3'/><animate attributeName='y' values='${f(150 - h)};${f(150 - h2)};${f(150 - h)}' dur='${f(0.8 + r() * 0.6)}s' repeatCount='3'/></rect>`; }
    const wave = `<path d='${waveLine(150, 10, 90, 0, 0, 600, 6)}' fill='none' stroke='#2ef2ff' stroke-width='1.6' stroke-opacity='.6'/>`;
    const body = `<rect width='600' height='200' fill='url(#bg)'/>` + `<g opacity='.35' transform='translate(0 300) scale(1 -1)' >${bars.replace(/<animate[^>]*\/>/g, "")}</g>` + `<g filter='url(#b)' opacity='.6'>${bars.replace(/<animate[^>]*\/>/g, "")}</g>` + bars + wave + `<rect y='150' width='600' height='1' fill='#fff' opacity='.3'/>`;
    return bannerDoc(lg("bg", ["#10061f", "#1a0a30"]) + lg("eq", ["#ff4ad0", "#7a5aff", "#2ef2ff"]) + blur("b", 5), body, 0.4);
  }, ["animated"]);

add("comet-pass", "epic", 740, true,
  N("Kuyruklu Yıldız", "Comet Pass", "Kometenflug", "Paso del cometa", "Passage de comète", "Passagem do cometa", "Пролёт кометы"),
  N("Gece göğünü çapraz kesen, uzun kuyruklu parlak bir kuyrukluyıldız.", "A bright comet with a long tail cutting across the night sky.", "Ein heller Komet mit langem Schweif, der den Nachthimmel durchquert.", "Un cometa brillante de larga cola que cruza el cielo nocturno.", "Une comète brillante à longue traîne qui traverse le ciel nocturne.", "Um cometa brilhante de cauda longa cruzando o céu noturno.", "Яркая комета с длинным хвостом пересекает ночное небо."),
  () => {
    const s = sky("s", [[0, "#04061a"], [1, "#1a1a44"]]);
    const comet = `<g><path d='M520 42L170 140L196 168L522 58Z' fill='url(#tl)'/><path d='M520 46L220 106L236 132L522 54Z' fill='url(#tl2)'/><circle cx='520' cy='50' r='14' fill='url(#hd)'/><circle cx='520' cy='50' r='4' fill='#fff'/><animateTransform attributeName='transform' type='translate' values='-20 6;0 0' dur='6s' repeatCount='1' fill='freeze'/></g>`;
    const body = s.b + stars(19, 150, [0, 0, 600, 200], ["#fff", "#cfe0ff", "#ffe9c8"], 1, 6) + twinkles(7, 6, [100, 10, 480, 150], "#fff", 2.2, 3) + comet + `<path d='${ridge(9, 180, 14, 0.5)}' fill='#080a1e'/>`;
    return bannerDoc(s.d + lg("tl", [[0, "#9fe0ff", 0.9], [1, "#9fe0ff", 0]], 1, 0, 0, 0.3) + lg("tl2", [[0, "#ffd6f0", 0.6], [1, "#ffd6f0", 0]], 1, 0, 0, 0.3) + rg("hd", [[0, "#ffffff"], [0.4, "#bfe6ff", 0.8], [1, "#bfe6ff", 0]]), body, 0.3);
  }, ["animated"]);

add("floating-isles", "epic", 860, true,
  N("Uçan Adalar", "Floating Isles", "Schwebende Inseln", "Islas flotantes", "Îles flottantes", "Ilhas flutuantes", "Парящие острова"),
  N("Şelaleleri boşluğa dökülen, bulutlar arasında süzülen adalar.", "Islands drifting among clouds, their waterfalls spilling into the void.", "Inseln, die zwischen Wolken schweben und deren Wasserfälle ins Leere stürzen.", "Islas que flotan entre nubes con cascadas cayendo al vacío.", "Des îles qui dérivent entre les nuages, leurs cascades se jetant dans le vide.", "Ilhas flutuando entre nuvens, com cachoeiras caindo no vazio.", "Острова парят среди облаков, их водопады низвергаются в пустоту."),
  () => {
    const s = sky("s", [[0, "#3a7ad8"], [0.7, "#a8d8ff"], [1, "#fff0d8"]]);
    const isle = (x, y, w, h, dur) => `<g><path d='M${x - w} ${y}Q${x - w * 0.6} ${y + h * 0.6} ${x - w * 0.1} ${y + h}Q${x + w * 0.2} ${y + h * 0.8} ${x + w * 0.4} ${y + h * 0.4}Q${x + w * 0.8} ${y + h * 0.2} ${x + w} ${y}Z' fill='url(#rk)'/><path d='M${x - w} ${y}Q${x} ${y - 10} ${x + w} ${y}Z' fill='#5ac85a'/><path d='M${x - w} ${y}Q${x} ${y - 4} ${x + w} ${y}' fill='none' stroke='#2a8a3a' stroke-width='3'/><path d='${pine(x - w * 0.3, y - 4, 22)}${pine(x + w * 0.1, y - 6, 30)}${pine(x + w * 0.45, y - 3, 18)}' fill='#1f6a3a'/><path d='M${x + w * 0.6} ${y + 2}V${y + 80}' stroke='url(#wf)' stroke-width='5'/><animateTransform attributeName='transform' type='translate' values='0 0;0 -6;0 0' dur='${dur}s' repeatCount='3'/></g>`;
    const body = s.b + `<circle cx='140' cy='40' r='60' fill='url(#g)'/>` + `<g fill='#fff' opacity='.6'>${cloudBand(4, 170, 14, 26)}</g>` + isle(420, 80, 70, 60, 5) + isle(540, 50, 40, 36, 6) + isle(290, 110, 32, 30, 4.5) + `<g fill='#fff' opacity='.9'>${cloudBand(8, 186, 16, 30)}</g>` + cloud(480, 140, 1.2, "#fff", 0.8) + `<path d='M330 60l5 3l5 -3M346 54l4 2l4 -2' stroke='#2a3a5a' stroke-width='1.2' fill='none'/>`;
    return bannerDoc(s.d + glow("g", "#fff", 0.8) + lg("rk", ["#8a6a4a", "#4a3020", "#2a1a10"]) + lg("wf", [[0, "#e6faff"], [1, "#e6faff", 0]]), body, 0.2);
  }, ["animated"]);

add("crystal-cavern", "epic", 800, true,
  N("Kristal Mağara", "Crystal Cavern", "Kristallhöhle", "Caverna de cristal", "Caverne de cristal", "Caverna de cristal", "Хрустальная пещера"),
  N("Karanlık mağarada nefes alır gibi parlayan mor ve camgöbeği kristaller.", "Violet and cyan crystals breathing light in a dark cave.", "Violette und cyanfarbene Kristalle, die in einer dunklen Höhle Licht atmen.", "Cristales violetas y cian que respiran luz en una cueva oscura.", "Des cristaux violets et cyan qui respirent la lumière dans une grotte sombre.", "Cristais violeta e ciano respirando luz em uma caverna escura.", "Фиолетовые и голубые кристаллы, дышащие светом в тёмной пещере."),
  () => {
    const cry = (x, y, h, w, rot, id) => `<g transform='translate(${x} ${y}) rotate(${rot})'><path d='M${-w} 0V${-h * 0.7}L0 ${-h}L${w} ${-h * 0.7}V0Z' fill='url(#${id})' stroke='#1a0a2a' stroke-width='1'/><path d='M0 ${-h}V0' stroke='#fff' stroke-opacity='.5'/><path d='M${-w} ${-h * 0.7}L0 ${-h * 0.55}L${w} ${-h * 0.7}' fill='none' stroke='#fff' stroke-opacity='.35'/></g>`;
    const cluster = (x, y, s, id) => cry(x, y, 70 * s, 10 * s, -20, id) + cry(x + 14 * s, y, 96 * s, 13 * s, 4, id) + cry(x + 32 * s, y, 60 * s, 9 * s, 26, id) + cry(x - 14 * s, y, 40 * s, 8 * s, -40, id);
    const body = `<rect width='600' height='200' fill='url(#bg)'/>` + `<g><circle cx='440' cy='120' r='150' fill='url(#gv)'/><circle cx='560' cy='160' r='90' fill='url(#gc)'/>${pulse("opacity", "1;.5;1", 3, 3)}</g>` +
      `<path d='M0 0H600V30C520 50 480 20 420 40C360 60 300 30 240 46C160 64 80 36 0 50Z' fill='#0a0612'/>` + [[300, 0, 30, 6, 180], [380, 0, 44, 7, 180], [520, 0, 36, 6, 180], [460, 0, 22, 5, 180]].map(([x, y, h, w, rot]) => cry(x, y + 30, h, w, rot, "cv")).join("") +
      `<path d='M0 200V176C80 168 160 182 240 172C320 162 400 178 480 170C540 166 580 172 600 168V200Z' fill='#0a0612'/>` + cluster(420, 178, 1, "cv") + cluster(540, 182, 0.75, "cc") + cluster(320, 182, 0.55, "cc") + scatter(3, 16, (r) => `<path d='${sparkle(f(2 + r() * 2.5))}' transform='translate(${f(300 + r() * 300)} ${f(40 + r() * 120)})' fill='#fff'>${pulse("opacity", "1;.1;1", f(1.6 + r()), 3, f(r() * 2))}</path>`);
    return bannerDoc(lg("bg", ["#140a24", "#06030c"]) + glow("gv", "#a855f7", 0.45) + glow("gc", "#2ef2ff", 0.35) + lg("cv", ["#f0d8ff", "#b06aff", "#4a1a8a"], 0, 0, 1, 1) + lg("cc", ["#d8ffff", "#3ad8f0", "#0a4a7a"], 0, 0, 1, 1), body, 0.45);
  }, ["animated"]);

add("lantern-river", "epic", 700, true,
  N("Fener Nehri", "Lantern River", "Laternenfluss", "Río de linternas", "Rivière de lanternes", "Rio de lanternas", "Река фонариков"),
  N("Gece nehrinden göğe yavaşça yükselen sıcak kâğıt fenerler.", "Warm paper lanterns slowly rising from a night river into the sky.", "Warme Papierlaternen, die langsam von einem nächtlichen Fluss in den Himmel steigen.", "Linternas de papel cálidas que suben despacio desde un río nocturno.", "Des lanternes de papier chaleureuses qui s'élèvent lentement d'une rivière nocturne.", "Lanternas de papel quentes subindo devagar de um rio noturno para o céu.", "Тёплые бумажные фонарики медленно поднимаются в небо с ночной реки."),
  () => {
    const s = sky("s", [[0, "#0a0a2a"], [0.6, "#2a1a4a"], [1, "#5a2a4a"]]);
    const lt = `<g id='lt'><circle r='12' fill='url(#lg)'/><path d='M-5 -7H5L6 6H-6Z' fill='url(#lp)'/><path d='M-5 -7H5' stroke='#8a3a0a' stroke-width='1'/></g>`;
    const lan = scatter(13, 22, (r) => { const x = 240 + r() * 360, y = 20 + r() * 120, sc = 0.5 + (y / 140) * 0.8; return `<use href='#lt' transform='translate(${f(x)} ${f(y)}) scale(${f(sc)})'><animateTransform attributeName='transform' type='translate' additive='sum' values='0 0;0 -10;0 0' dur='${f(4 + r() * 3)}s' repeatCount='3'/></use>`; });
    const body = s.b + stars(5, 50, [0, 0, 600, 100], ["#fff"], 0.8) + `<path d='${ridge(4, 140, 18, 0.5, 160)}' fill='#1a1030'/>` + `<rect y='150' width='600' height='50' fill='url(#rv)'/>` + lan + scatter(14, 18, (r) => `<path d='M${f(260 + r() * 340)} ${f(156 + r() * 40)}h${f(6 + r() * 16)}' stroke='#ffb04a' stroke-opacity='${f(0.3 + r() * 0.4)}' stroke-width='1.4'/>`) + `<path d='M0 162Q140 150 260 160' stroke='#3a2a4a' stroke-width='8' fill='none'/>`;
    return bannerDoc(s.d + lt + rg("lg", [[0, "#ffcf6a", 0.6], [1, "#ffcf6a", 0]]) + lg("lp", ["#fff0b0", "#ffb03a", "#e0601a"]) + lg("rv", ["#2a1a3a", "#0a0618"]), body, 0.35);
  }, ["animated"]);

add("holo-foil", "epic", 620, true,
  N("Hologram Folyo", "Holo Foil", "Holofolie", "Lámina holográfica", "Feuille holographique", "Folha holográfica", "Голографическая фольга"),
  N("Işıkla renk değiştiren, üzerinde gökkuşağı kayan holografik folyo.", "Holographic foil that shifts colour as a rainbow glides across it.", "Holografische Folie, deren Farben wechseln, während ein Regenbogen darübergleitet.", "Lámina holográfica que cambia de color mientras un arcoíris la recorre.", "Une feuille holographique qui change de couleur au passage d'un arc-en-ciel.", "Folha holográfica que muda de cor enquanto um arco-íris desliza sobre ela.", "Голографическая фольга, меняющая цвет под скользящей радугой."),
  () => {
    const hex = scatter(4, 1, () => { let d = ""; for (let row = 0; row < 9; row++) for (let col = 0; col < 24; col++) { const x = col * 26 + (row % 2) * 13, y = row * 22.5; d += `M${x} ${y - 13}L${x + 11} ${y - 6.5}V${y + 6.5}L${x} ${y + 13}L${x - 11} ${y + 6.5}V${y - 6.5}Z`; } return `<path d='${d}' fill='none' stroke='#fff' stroke-opacity='.18'/>`; });
    const body = `<rect width='600' height='200' fill='url(#h1)'/><rect width='600' height='200' fill='url(#h2)' opacity='.65'/>` + hex + `<rect x='-300' width='300' height='200' fill='url(#sw)'><animate attributeName='x' values='-300;600' dur='3s' repeatCount='3'/></rect>` + scatter(6, 14, (r) => `<path d='${sparkle(f(3 + r() * 4))}' transform='translate(${f(r() * 600)} ${f(r() * 200)})' fill='#fff' opacity='${f(0.5 + r() * 0.5)}'/>`);
    return bannerDoc(`<linearGradient id='h1' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff9ad8'/><stop offset='.25' stop-color='#9ad8ff'/><stop offset='.5' stop-color='#c8ffd8'/><stop offset='.75' stop-color='#fff0a0'/><stop offset='1' stop-color='#d8a8ff'/><animateTransform attributeName='gradientTransform' type='rotate' values='0 .5 .5;40 .5 .5;0 .5 .5' dur='6s' repeatCount='2'/></linearGradient>` + lg("h2", ["#7a5aff", "#ff5aa8", "#5ae0ff", "#7a5aff"], 1, 0, 0, 1) + lg("sw", [[0, "#fff", 0], [0.5, "#fff", 0.5], [1, "#fff", 0]], 0, 0, 1, 0), body, 0.25);
  }, ["animated"]);

add("whale-song", "epic", 880, true,
  N("Balina Şarkısı", "Whale Song", "Walgesang", "Canto de ballena", "Chant de baleine", "Canto da baleia", "Песнь кита"),
  N("Işık huzmelerinin içinden süzülen dev balina ve ardındaki kabarcıklar.", "A giant whale gliding through shafts of light, trailing bubbles.", "Ein riesiger Wal gleitet durch Lichtstrahlen und zieht Blasen hinter sich her.", "Una ballena gigante que se desliza entre haces de luz dejando burbujas.", "Une baleine géante qui glisse dans les rais de lumière, laissant des bulles.", "Uma baleia gigante deslizando entre feixes de luz, deixando bolhas.", "Огромный кит скользит сквозь лучи света, оставляя пузыри."),
  () => {
    const s = sky("s", [[0, "#1a7ab8"], [0.5, "#0a3a6a"], [1, "#020c22"]]);
    const rays = [0, 1, 2, 3, 4, 5].map((i) => `<path d='M${200 + i * 70} -5L${150 + i * 90} 210H${190 + i * 90}L${240 + i * 70} -5Z' fill='#bff0ff' opacity='.06'/>`).join("");
    const whale = `<g transform='translate(420 100)'><g><path d='M-130 6C-110 -26 -40 -34 20 -26C60 -20 92 -10 110 -2C118 2 124 -4 136 -18C138 -6 134 6 128 12C138 18 142 30 140 40C128 28 118 22 108 20C80 26 40 30 0 28C-60 26 -110 24 -130 6Z' fill='url(#wb)'/><path d='M-120 10C-80 22 -20 24 40 18C70 14 90 12 108 18' fill='none' stroke='#9fd0e8' stroke-opacity='.5' stroke-width='1.4'/>${Array.from({ length: 8 }, (_, i) => `<path d='M${-100 + i * 12} 14Q${-96 + i * 12} 22 ${-90 + i * 12} 24' fill='none' stroke='#cfe8f2' stroke-opacity='.4'/>`).join("")}<path d='M-40 18C-30 34 -14 40 0 38C-6 30 -16 24 -40 18Z' fill='#1a4a6a'/><circle cx='-108' cy='2' r='2' fill='#0a1a2a'/><animateTransform attributeName='transform' type='translate' values='0 0;-10 -4;0 0' dur='8s' repeatCount='2'/></g></g>`;
    const bubbles = scatter(4, 16, (r) => { const x = 300 + r() * 60, y = 60 + r() * 60; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(1.5 + r() * 3)}' fill='none' stroke='#cff6ff' stroke-opacity='.6'><animate attributeName='cy' values='${f(y)};${f(y - 30)}' dur='${f(3 + r() * 2)}s' repeatCount='3'/></circle>`; });
    const body = s.b + rays + scatter(9, 50, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(0.4 + r())}' fill='#bff0ff' opacity='${f(0.2 + r() * 0.4)}'/>`) + whale + bubbles + `<path d='${hills(186, [[6, 260, 1]])}' fill='#020814'/>`;
    return bannerDoc(s.d + lg("wb", ["#4a8ab0", "#1a4a72", "#0a2440"]), body, 0.4);
  }, ["animated"]);

add("blossom-wind", "epic", 680, true,
  N("Çiçek Rüzgârı", "Blossom Wind", "Blütenwind", "Viento de flores", "Vent de pétales", "Vento de flores", "Ветер лепестков"),
  N("Çiçek açmış bir dalı sallayan rüzgâr ve savrulan pembe yapraklar.", "Wind shaking a blossoming branch and carrying pink petals away.", "Wind, der einen blühenden Zweig schüttelt und rosa Blütenblätter davonträgt.", "El viento sacude una rama florida y se lleva pétalos rosas.", "Le vent agite une branche en fleurs et emporte des pétales roses.", "O vento balança um galho florido e leva pétalas cor-de-rosa.", "Ветер качает цветущую ветку и уносит розовые лепестки."),
  () => {
    const s = sky("s", [[0, "#ffe8f0"], [0.6, "#ffd0e0"], [1, "#f0c0e0"]]);
    const fl = `<g id='fl'>${[0, 72, 144, 216, 288].map((a) => `<path d='M0 0C4 -2 5 -8 2 -10L0 -8.6L-2 -10C-5 -8 -4 -2 0 0Z' transform='rotate(${a})' fill='url(#pt)' stroke='#d0507e' stroke-width='.4'/>`).join("")}<circle r='1.8' fill='#ffd76a'/></g><path id='pe' d='M0 0C3 -2 4 -6 2 -8L0 -7L-2 -8C-4 -6 -3 -2 0 0Z' fill='#ffb8d0'/>`;
    const branch = `<path d='M620 10C560 20 520 40 470 44C430 48 400 70 370 72M520 36C510 60 490 80 470 90M560 24C570 50 560 70 540 84' fill='none' stroke='#3a2218' stroke-width='6' stroke-linecap='round'/>`;
    const flowers = scatter(4, 22, (r) => `<use href='#fl' transform='translate(${f(380 + r() * 220)} ${f(20 + r() * 70)}) rotate(${f(r() * 72)}) scale(${f(1 + r() * 0.9)})'/>`);
    const petals = scatter(7, 22, (r) => { const x = 100 + r() * 480, y = r() * 200; return `<use href='#pe' transform='translate(${f(x)} ${f(y)}) rotate(${f(r() * 360)}) scale(${f(0.8 + r())})'><animateTransform attributeName='transform' type='translate' additive='sum' values='0 0;-60 20' dur='${f(4 + r() * 3)}s' repeatCount='3'/></use>`; });
    const body = s.b + `<circle cx='300' cy='40' r='140' fill='url(#g)'/><path d='${ridge(4, 150, 16, 0.5)}' fill='#e8b0d0' opacity='.6'/><path d='${ridge(6, 172, 12, 0.5)}' fill='#d090b8' opacity='.6'/>` + `<g>${branch}${flowers}<animateTransform attributeName='transform' type='rotate' values='0 620 10;-2 620 10;0 620 10' dur='3s' repeatCount='3'/></g>` + petals;
    return bannerDoc(s.d + fl + rg("pt", ["#ffffff", "#ffc4d8", "#f27aa6"], 0.5, 0.9, 0.9) + glow("g", "#fff", 0.6), body, 0.15);
  }, ["animated"]);

add("glitch-signal", "epic", 580, true,
  N("Bozuk Sinyal", "Glitch Signal", "Glitchsignal", "Señal con fallos", "Signal glitché", "Sinal com falha", "Глитч-сигнал"),
  N("Kayan RGB şeritleri, tarama çizgileri ve birkaç kez sarsılan bir sinyal.", "Shifting RGB bands, scanlines and a signal that jolts a few times.", "Verschobene RGB-Streifen, Scanlines und ein Signal, das ein paar Mal ruckelt.", "Bandas RGB desplazadas, líneas de escaneo y una señal que salta varias veces.", "Des bandes RVB décalées, des lignes de balayage et un signal qui saute.", "Faixas RGB deslocadas, linhas de varredura e um sinal que treme algumas vezes.", "Сдвинутые RGB-полосы, строки развёртки и сигнал, который несколько раз дёргается."),
  () => {
    const r = rnd(8);
    let bands = "";
    for (let i = 0; i < 16; i++) { const y = r() * 200, h = 2 + r() * 14, dx = (r() - 0.5) * 60; bands += `<rect x='${f(200 + r() * 200)}' y='${f(y)}' width='${f(100 + r() * 300)}' height='${f(h)}' fill='${["#ff2e88", "#2ef2ff", "#fff04a"][i % 3]}' opacity='${f(0.35 + r() * 0.5)}'><animate attributeName='x' values='${f(200 + dx)};${f(200 - dx)};${f(200 + dx)}' dur='${f(0.4 + r() * 0.5)}s' repeatCount='3' begin='${f(r() * 2)}s'/></rect>`; }
    const shape = `<g transform='translate(440 100)'><circle r='54' fill='none' stroke='#ff2e88' stroke-width='10' transform='translate(-5 0)' opacity='.8'/><circle r='54' fill='none' stroke='#2ef2ff' stroke-width='10' transform='translate(5 0)' opacity='.8'/><circle r='54' fill='none' stroke='#fff' stroke-width='6'/><path d='M-20 -26L30 0L-20 26Z' fill='#fff'/></g>`;
    const scan = `<path d='${Array.from({ length: 50 }, (_, i) => `M0 ${i * 4}H600`).join("")}' stroke='#000' stroke-opacity='.25'/>`;
    const body = `<rect width='600' height='200' fill='url(#bg)'/>` + `<g>${shape}<animateTransform attributeName='transform' type='translate' values='0 0;0 0;8 0;-6 0;0 0' keyTimes='0;.8;.85;.9;1' dur='2.4s' repeatCount='3'/></g>` + bands + scan;
    return bannerDoc(lg("bg", ["#0a0618", "#1a0a2a"], 0, 0, 1, 1), body, 0.45);
  }, ["animated"]);
// ================================================================= legendary
add("event-horizon", "legendary", 1450, true,
  N("Olay Ufku", "Event Horizon", "Ereignishorizont", "Horizonte de sucesos", "Horizon des événements", "Horizonte de eventos", "Горизонт событий"),
  N("Işığı büken bir kara delik ve etrafında parlayan toplanma diski.", "A black hole bending light, ringed by a blazing accretion disk.", "Ein Schwarzes Loch, das Licht krümmt, umgeben von einer gleißenden Akkretionsscheibe.", "Un agujero negro que curva la luz, rodeado de un disco de acreción ardiente.", "Un trou noir qui courbe la lumière, cerné d'un disque d'accrétion éclatant.", "Um buraco negro que curva a luz, cercado por um disco de acreção ardente.", "Чёрная дыра искривляет свет, её окружает пылающий аккреционный диск."),
  () => {
    const s = sky("s", [[0, "#04030c"], [1, "#0c0818"]]);
    const cx = 420, cy = 100;
    const body = s.b + stars(12, 160, [0, 0, 600, 200], ["#fff", "#ffe6c8", "#cfe0ff"], 1) + `<circle cx='${cx}' cy='${cy}' r='130' fill='url(#gl)'/>` +
      `<ellipse cx='${cx}' cy='${cy}' rx='150' ry='26' fill='none' stroke='url(#dk)' stroke-width='16' filter='url(#b)' opacity='.8'/>` +
      `<path d='M${cx - 62} ${cy}A62 62 0 0 1 ${cx + 62} ${cy}' fill='none' stroke='url(#lens)' stroke-width='12' filter='url(#b)'/><path d='M${cx - 58} ${cy}A58 58 0 0 1 ${cx + 58} ${cy}' fill='none' stroke='#fff3d8' stroke-width='3'/>` +
      `<path d='M${cx - 58} ${cy}A58 58 0 0 0 ${cx + 58} ${cy}' fill='none' stroke='#ffb05a' stroke-width='4' stroke-opacity='.6' filter='url(#b)'/>` +
      `<circle cx='${cx}' cy='${cy}' r='46' fill='#000'/><circle cx='${cx}' cy='${cy}' r='47' fill='none' stroke='#ffe0a0' stroke-width='1.6'/>` +
      `<path d='M${cx - 150} ${cy}A150 26 0 0 0 ${cx + 150} ${cy}' fill='none' stroke='url(#dk)' stroke-width='9'/><path d='M${cx - 150} ${cy}A150 26 0 0 0 ${cx + 150} ${cy}' fill='none' stroke='#fff' stroke-width='1.6' stroke-opacity='.8' stroke-dasharray='30 12 6 12'><animate attributeName='stroke-dashoffset' from='0' to='-120' dur='4s' repeatCount='3'/></path>`;
    return bannerDoc(s.d + rg("gl", [[0, "#ff9a3a", 0.35], [0.5, "#7a3aff", 0.12], [1, "#000", 0]]) + lgU("dk", ["#ff5a1a", "#ffd27a", "#ffffff", "#ffd27a", "#ff5a1a"], 270, 0, 570, 0) + lgU("lens", ["#ff8a3a", "#fff3d8", "#ff8a3a"], 358, 0, 482, 0) + blur("b", 5), body, 0.45);
  }, ["animated"]);

add("ringed-giant", "legendary", 1250, false,
  N("Halkalı Dev", "Ringed Giant", "Beringter Riese", "Gigante anillado", "Géante annelée", "Gigante anelado", "Окольцованный гигант"),
  N("Bir ayın ufkunun üstünde yükselen, halkaları gökyüzünü kesen dev gezegen.", "A giant planet rising over a moon's horizon, its rings slicing the sky.", "Ein riesiger Planet über dem Horizont eines Mondes, seine Ringe schneiden den Himmel.", "Un planeta gigante sobre el horizonte de una luna, con anillos que cortan el cielo.", "Une planète géante au-dessus de l'horizon d'une lune, ses anneaux fendant le ciel.", "Um planeta gigante sobre o horizonte de uma lua, com anéis cortando o céu.", "Огромная планета над горизонтом луны, её кольца рассекают небо."),
  () => {
    const s = sky("s", [[0, "#05050f"], [1, "#141030"]]);
    const cx = 430, cy = 120, R = 110;
    const bands = [-60, -36, -12, 10, 34, 58].map((y, i) => `<ellipse cx='${cx}' cy='${cy + y}' rx='${R}' ry='${8 + (i % 3) * 3}' fill='${["#e8c8a0", "#c8905a", "#f2dcc0", "#a86a3a", "#e0b080", "#8a5a3a"][i]}' opacity='.5'/>`).join("");
    const ring = (front) => `<path d='M${cx - 230} ${cy + 30}A230 44 -12 0 ${front ? 0 : 1} ${cx + 230} ${cy - 30}' fill='none' stroke='url(#rg)' stroke-width='14' transform='rotate(-12 ${cx} ${cy})' opacity='.9'/><path d='M${cx - 200} ${cy + 26}A200 36 -12 0 ${front ? 0 : 1} ${cx + 200} ${cy - 26}' fill='none' stroke='#fff0d8' stroke-width='2' stroke-opacity='.6' transform='rotate(-12 ${cx} ${cy})'/>`;
    const body = s.b + stars(4, 150, [0, 0, 600, 200], ["#fff", "#ffe9c8"], 1, 4) + ring(false) + `<g clip-path='url(#pc)'><circle cx='${cx}' cy='${cy}' r='${R}' fill='url(#pl)'/>${bands}<circle cx='${cx}' cy='${cy}' r='${R}' fill='url(#sh)'/></g><clipPath id='pc'><circle cx='${cx}' cy='${cy}' r='${R}'/></clipPath>` + ring(true) +
      `<path d='M0 200V176Q150 160 300 170T600 162V200Z' fill='url(#gd)'/><path d='M0 176Q150 160 300 170T600 162' fill='none' stroke='#c8c0e0' stroke-opacity='.4'/>` + scatter(8, 8, (r) => `<ellipse cx='${f(r() * 600)}' cy='${f(180 + r() * 16)}' rx='${f(6 + r() * 14)}' ry='${f(2 + r() * 3)}' fill='#000' opacity='.25'/>`);
    return bannerDoc(s.d + rg("pl", ["#ffe8c8", "#d8a070", "#8a4a2a"], 0.35, 0.35, 0.8) + rg("sh", [[0.4, "#000", 0], [1, "#000", 0.75]], 0.3, 0.3, 0.85) + lg("rg", [[0, "#c8a07a", 0.3], [0.5, "#fff0d8"], [1, "#c8a07a", 0.3]], 0, 0, 1, 0) + lg("gd", ["#5a5070", "#1a1428"]), body, 0.35);
  });

add("observatory", "legendary", 1100, true,
  N("Gözlemevi", "Observatory", "Sternwarte", "Observatorio", "Observatoire", "Observatório", "Обсерватория"),
  N("Samanyolu altında tepedeki gözlemevi; göğü kayan yıldızlar çizer.", "A hilltop observatory under the Milky Way while shooting stars streak by.", "Eine Sternwarte auf dem Hügel unter der Milchstraße, Sternschnuppen ziehen vorbei.", "Un observatorio en la colina bajo la Vía Láctea mientras pasan estrellas fugaces.", "Un observatoire sur la colline sous la Voie lactée, traversé d'étoiles filantes.", "Um observatório no alto da colina sob a Via Láctea, com estrelas cadentes.", "Обсерватория на холме под Млечным Путём, по небу чиркают падающие звёзды."),
  () => {
    const s = sky("s", [[0, "#04061a"], [0.7, "#141a44"], [1, "#2a2a5a"]]);
    const mw = `<path d='M0 150Q200 40 600 20' stroke='url(#mw)' stroke-width='70' fill='none' filter='url(#b)' opacity='.55'/>` + stars(31, 120, [80, 0, 520, 140], ["#fff", "#ffe9c8"], 0.9);
    const meteor = (x, y, b) => `<path d='M${x} ${y}l-60 24' stroke='url(#mt)' stroke-width='2' stroke-linecap='round' opacity='0'><animate attributeName='opacity' values='0;1;0;0' keyTimes='0;.1;.25;1' dur='3s' repeatCount='3' begin='${b}s'/><animateTransform attributeName='transform' type='translate' values='0 0;-40 16;-40 16' keyTimes='0;.25;1' dur='3s' repeatCount='3' begin='${b}s'/></path>`;
    const obs = `<g transform='translate(450 140)'><rect x='-26' y='-10' width='52' height='30' fill='#c8ccd8'/><path d='M-30 -10A30 30 0 0 1 30 -10Z' fill='url(#dm)'/><path d='M-4 -38L4 -38L4 -10L-4 -10Z' fill='#2a2e44'/><path d='M0 -14L22 -44' stroke='#3a3e5a' stroke-width='6' stroke-linecap='round'/><rect x='-6' y='4' width='12' height='16' fill='#ffcf6a'/><rect x='-20' y='0' width='6' height='6' fill='#ffcf6a'/></g>`;
    const body = s.b + mw + stars(32, 60, [0, 0, 600, 200], ["#fff"], 0.8) + meteor(300, 30, 0) + meteor(520, 20, 1.1) + meteor(400, 60, 2) + `<path d='M0 200V170Q200 150 330 160Q420 130 520 150Q570 156 600 150V200Z' fill='#0a0c1e'/>` + obs + `<path d='${pineRow(4, 182, 14, 26, 280, 600, 18)}' fill='#06081a'/>`;
    return bannerDoc(s.d + lg("mw", [[0, "#8a7aff", 0], [0.5, "#e6dcff", 0.8], [1, "#ffd6a0", 0.2]], 0, 1, 1, 0) + blur("b", 12) + lg("mt", [[0, "#fff"], [1, "#fff", 0]], 0, 0, 1, 0) + lg("dm", ["#f2f4fa", "#8a90a8"], 0, 0, 1, 1), body, 0.35);
  }, ["animated"]);

add("sky-citadel", "legendary", 1350, true,
  N("Gök Kalesi", "Sky Citadel", "Himmelszitadelle", "Ciudadela celeste", "Citadelle céleste", "Cidadela celeste", "Небесная цитадель"),
  N("Gün batımında bulutların üstünde altın kuleli bir kale.", "A citadel of golden spires floating on the clouds at sunset.", "Eine Zitadelle mit goldenen Türmen, die bei Sonnenuntergang auf Wolken thront.", "Una ciudadela de agujas doradas sobre las nubes al atardecer.", "Une citadelle aux flèches dorées posée sur les nuages au coucher du soleil.", "Uma cidadela de torres douradas sobre as nuvens ao pôr do sol.", "Цитадель с золотыми шпилями парит над облаками на закате."),
  () => {
    const s = sky("s", [[0, "#2a2a6a"], [0.45, "#c86a8a"], [0.8, "#ffb06a"], [1, "#ffe0a0"]]);
    const spire = (x, base, h, w) => `<rect x='${x - w / 2}' y='${base - h}' width='${w}' height='${h}' fill='url(#tw)'/><path d='M${x - w / 2 - 2} ${base - h}L${x} ${base - h - w * 2.2}L${x + w / 2 + 2} ${base - h}Z' fill='url(#rf)'/><rect x='${x - 1.5}' y='${base - h + 8}' width='3' height='6' rx='1.5' fill='#fff3c0'/><path d='M${x} ${base - h - w * 2.2}v-8' stroke='#ffe08a' stroke-width='1.2'/>`;
    const citadel = `<g>${spire(410, 128, 46, 12)}${spire(440, 128, 70, 16)}${spire(470, 128, 56, 13)}${spire(500, 128, 38, 11)}${spire(380, 128, 30, 10)}<rect x='370' y='112' width='140' height='20' fill='url(#tw)'/><path d='M370 112h140' stroke='#ffe08a' stroke-width='1.4'/>${Array.from({ length: 9 }, (_, i) => `<rect x='${376 + i * 15}' y='118' width='4' height='7' rx='2' fill='#fff3c0'/>`).join("")}<path d='M370 132Q440 170 510 132Z' fill='url(#rk)'/><animateTransform attributeName='transform' type='translate' values='0 0;0 -4;0 0' dur='5s' repeatCount='3'/></g>`;
    const body = s.b + `<circle cx='300' cy='120' r='120' fill='url(#g)'/><circle cx='300' cy='118' r='22' fill='#fff3d0'/>` + `<g fill='url(#c1)' opacity='.8'>${cloudBand(4, 120, 12, 22, -20, 620, 8, false)}</g>` + citadel + `<g fill='url(#c2)'>${cloudBand(6, 150, 16, 30)}</g><g fill='url(#c3)'>${cloudBand(9, 178, 18, 32)}</g>` + `<path d='M540 60l5 3l5 -3M556 52l4 2l4 -2M528 70l4 2l4 -2' stroke='#3a2a4a' stroke-width='1.2' fill='none'/>`;
    return bannerDoc(s.d + glow("g", "#fff0c8", 0.8) + lg("tw", ["#fff6e0", "#e8c8a8", "#a8806a"], 0, 0, 1, 0) + lg("rf", ["#ffe08a", "#c8901f"], 0, 0, 1, 1) + lg("rk", ["#8a6a5a", "#3a2a3a"]) + lg("c1", ["#ffd6c8", "#e0a0b8"]) + lg("c2", ["#ffe8d8", "#f0b8c8"]) + lg("c3", ["#fff6ee", "#f8d0d8"]), body, 0.25);
  }, ["animated"]);

add("phoenix-rising", "legendary", 1500, true,
  N("Yükselen Anka", "Phoenix Rising", "Aufsteigender Phönix", "Fénix ascendente", "Phénix renaissant", "Fênix renascida", "Восходящий феникс"),
  N("Kanatlarını afiş boyunca açan alevden bir kuş ve yükselen közler.", "A bird of flame spreading its wings across the banner as embers rise.", "Ein Vogel aus Flammen breitet die Flügel über das Banner, Glut steigt auf.", "Un ave de fuego extiende sus alas por el banner mientras suben las brasas.", "Un oiseau de flammes déploie ses ailes sur la bannière, des braises s'élèvent.", "Uma ave de fogo abre as asas pelo banner enquanto brasas sobem.", "Огненная птица расправляет крылья на весь баннер, поднимаются искры."),
  () => {
    const s = sky("s", [[0, "#1a0404"], [0.6, "#5a0e0a"], [1, "#a8300a"]]);
    const feather = (x, y, len, ang, w) => { const a = (ang * Math.PI) / 180; const tx = x + len * Math.cos(a), ty = y + len * Math.sin(a); return `<path d='${petal(f(len), w)}' transform='translate(${x} ${y}) rotate(${f(ang + 90)})' fill='url(#fe)'/>`; };
    let wings = "";
    for (let i = 0; i < 10; i++) { wings += feather(430, 100, 150 - i * 9, -165 + i * 8, 9 - i * 0.4) + feather(430, 100, 120 - i * 7, -15 - i * 8, 8 - i * 0.4); }
    const bird = `<g><g filter='url(#b)' opacity='.7'>${wings}</g>${wings}<path d='M430 70C440 72 446 82 444 96C442 120 434 140 430 160C426 140 418 120 416 96C414 82 420 72 430 70Z' fill='url(#bd)'/><path d='M430 160L416 196M430 160L430 200M430 160L444 196' stroke='#ffb000' stroke-width='3' stroke-linecap='round'/><circle cx='430' cy='70' r='8' fill='url(#bd)'/><path d='M436 68L446 72L436 74Z' fill='#ffe08a'/><path d='M426 62Q420 44 410 40M430 62Q432 42 440 34' stroke='#ffd27a' stroke-width='2' fill='none'/><animateTransform attributeName='transform' type='translate' values='0 0;0 -5;0 0' dur='2.4s' repeatCount='3'/></g>`;
    const embers = scatter(5, 24, (r) => { const x = 220 + r() * 380, y = 120 + r() * 80; return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(1 + r() * 1.6)}' fill='#ffd27a'><animate attributeName='cy' values='${f(y)};${f(y - 60)}' dur='${f(2 + r() * 2)}s' repeatCount='3'/><animate attributeName='opacity' values='1;0' dur='${f(2 + r() * 2)}s' repeatCount='3'/></circle>`; });
    return bannerDoc(s.d + lg("fe", ["#fff3b0", "#ffb52e", "#ff4a1a", "#a8100a"], 0, 1, 0, 0) + lg("bd", ["#fff6c0", "#ffb000", "#ff5a1a"]) + blur("b", 6), s.b + `<circle cx='430' cy='100' r='150' fill='url(#gw)'/>` + bird + embers, 0.4).replace("<defs>", `<defs>${rg("gw", [[0, "#ffb000", 0.45], [1, "#ff3d00", 0]])}`);
  }, ["animated"]);

add("sunken-temple", "legendary", 1200, true,
  N("Batık Tapınak", "Sunken Temple", "Versunkener Tempel", "Templo sumergido", "Temple englouti", "Templo submerso", "Затонувший храм"),
  N("Su altında yosun tutmuş sütunlar, kaya merdivenler ve dans eden ışık.", "Moss-covered columns and stone stairs under water, with dancing light.", "Bemooste Säulen und Steintreppen unter Wasser, darüber tanzendes Licht.", "Columnas cubiertas de musgo y escaleras de piedra bajo el agua con luz danzante.", "Des colonnes moussues et des marches de pierre sous l'eau, dans une lumière dansante.", "Colunas cobertas de musgo e escadas de pedra sob a água, com luz dançante.", "Поросшие мхом колонны и каменные ступени под водой в танцующем свете."),
  () => {
    const s = sky("s", [[0, "#3ac0c8"], [0.4, "#1a7a8a"], [1, "#04283a"]]);
    const col = (x, h, broken) => `<rect x='${x - 9}' y='${180 - h}' width='18' height='${h}' fill='url(#cl)'/>${[0.25, 0.5, 0.75].map((k) => `<path d='M${x - 5} ${f(180 - h * k - 10)}v20M${x} ${f(180 - h * k - 10)}v20M${x + 5} ${f(180 - h * k - 10)}v20' stroke='#0a3a4a' stroke-opacity='.25'/>`).join("")}${broken ? `<path d='M${x - 9} ${180 - h}L${x - 3} ${176 - h}L${x + 2} ${182 - h}L${x + 9} ${174 - h}V${180 - h}Z' fill='#9ad0c8'/>` : `<rect x='${x - 13}' y='${176 - h}' width='26' height='6' fill='#a8d8d0'/>`}<path d='M${x - 9} ${200 - h * 0.6}q4 8 0 18' stroke='#3a9a5a' stroke-width='3' fill='none'/>`;
    const caust = `<g opacity='.5'><path d='${Array.from({ length: 10 }, (_, i) => `M${i * 70 - 20} 10q20 10 40 0t40 0`).join("")}' stroke='#e6ffff' stroke-width='2' fill='none'/><animateTransform attributeName='transform' type='translate' values='0 0;30 6;0 0' dur='4s' repeatCount='3'/></g>`;
    const rays = [0, 1, 2, 3].map((i) => `<path d='M${330 + i * 60} -5L${300 + i * 80} 210H${330 + i * 80}L${360 + i * 60} -5Z' fill='#e6ffff' opacity='.08'>${pulse("opacity", ".08;.03;.08", 3 + i, 3)}</path>`).join("");
    const body = s.b + rays + caust + `<path d='M320 180V150H560V180Z' fill='#5a9a98'/><path d='M300 200V180H580V200Z' fill='#4a8a88'/><path d='M330 66L440 30L550 66Z' fill='url(#cl)'/><rect x='330' y='66' width='220' height='10' fill='#a8d8d0'/>` + col(350, 104, false) + col(400, 104, false) + col(480, 104, false) + col(530, 70, true) + col(260, 50, true) +
      `<path d='M420 200q-4 -30 6 -50q-12 30 -2 50z' fill='#3a9a5a'/><path d='M580 200q-8 -40 4 -70q-2 40 6 70z' fill='#2a8a4a'/>` + scatter(3, 6, (r) => `<g transform='translate(${f(240 + r() * 300)} ${f(80 + r() * 60)}) scale(${f(0.6 + r() * 0.5)})'><path d='M-8 0C-4 -4 4 -4 8 0C4 4 -4 4 -8 0ZM8 0L13 -4V4Z' fill='#ffd36a'/></g>`) + scatter(7, 14, (r) => `<circle cx='${f(r() * 600)}' cy='${f(r() * 200)}' r='${f(1 + r() * 2)}' fill='none' stroke='#e6ffff' stroke-opacity='.5'/>`);
    return bannerDoc(s.d + lg("cl", ["#d8f0e8", "#8ab8b0", "#4a7a78"], 0, 0, 1, 0), body, 0.4);
  }, ["animated"]);

add("aurora-fjord", "legendary", 1300, true,
  N("Kutup Fiyordu", "Aurora Fjord", "Polarlichtfjord", "Fiordo de aurora", "Fjord sous l'aurore", "Fiorde da aurora", "Фьорд под сиянием"),
  N("Sarp fiyord duvarları arasında suya yansıyan dalgalı kutup ışığı.", "A rippling aurora reflected in the water between steep fjord walls.", "Ein wogendes Polarlicht, das sich zwischen steilen Fjordwänden im Wasser spiegelt.", "Una aurora ondulante reflejada en el agua entre las paredes de un fiordo.", "Une aurore ondoyante qui se reflète dans l'eau entre de hautes parois de fjord.", "Uma aurora ondulante refletida na água entre as paredes íngremes de um fiorde.", "Колышущееся сияние отражается в воде между крутыми стенами фьорда."),
  () => {
    const s = sky("s", [[0, "#020814"], [1, "#0a2a3a"]]);
    const curt = (seed, y0, len, id, x0, x1) => { const r = rnd(seed); let d = ""; for (let x = x0; x < x1; x += 7) d += `M${x} ${f(y0 + 12 * Math.sin(x / 60) + 6 * Math.sin(x / 19))}v${f(len * (0.6 + r() * 0.5))}`; return `<path d='${d}' stroke='url(#${id})' stroke-width='9'/>`; };
    const sky2 = `<g id='au' filter='url(#b)' opacity='.85'>${curt(2, 10, 70, "a1", 180, 620)}${curt(3, 26, 50, "a2", 300, 600)}<animateTransform attributeName='transform' type='translate' values='0 0;-16 3;0 0' dur='8s' repeatCount='3'/></g>`;
    const walls = `<path d='M240 130L280 40L330 30L360 130Z' fill='#0e1e2a'/><path d='M600 130L560 20L510 36L470 130Z' fill='#0a1822'/><path d='M280 40L300 60L320 34' fill='none' stroke='#cfe6f2' stroke-opacity='.4' stroke-width='2'/><path d='M560 20L540 50L520 36' fill='none' stroke='#cfe6f2' stroke-opacity='.4' stroke-width='2'/><path d='${ridge(4, 120, 14, 0.5, 132)}' fill='#132836'/>`;
    const body = s.b + stars(9, 90, [0, 0, 600, 120], ["#fff"], 0.9) + sky2 + walls + `<rect y='130' width='600' height='70' fill='url(#wt)'/><use href='#au' transform='translate(0 262) scale(1 -1)' opacity='.35'/><g transform='translate(0 262) scale(1 -1)' opacity='.6'>${walls}</g>` + scatter(5, 22, (r) => `<path d='M${f(r() * 600)} ${f(136 + r() * 60)}h${f(10 + r() * 30)}' stroke='#9fffd8' stroke-opacity='${f(0.1 + r() * 0.2)}'/>`) + `<path d='M400 150l10 -4l10 4z' fill='#ffcf6a'/><path d='M410 146v-10' stroke='#2a2a3a'/>`;
    return bannerDoc(s.d + lg("a1", [[0, "#c07bff", 0], [0.3, "#8f7bff", 0.6], [0.6, "#6effc7"], [1, "#2fe0a0", 0]]) + lg("a2", [[0, "#ff7bd0", 0], [0.4, "#6effc7", 0.8], [1, "#6effc7", 0]]) + blur("b", 3.5) + lg("wt", ["#0a2430", "#020a12"]), body, 0.35);
  }, ["animated"]);

add("neon-metropolis", "legendary", 1400, true,
  N("Neon Metropol", "Neon Metropolis", "Neonmetropole", "Metrópolis de neón", "Métropole néon", "Metrópole neon", "Неоновый мегаполис"),
  N("Yağmurda parlayan neon tabelalı gökdelenler ve süzülen ışıklar.", "Skyscrapers with neon signs glowing in the rain, and gliding lights.", "Wolkenkratzer mit Neonschildern, die im Regen leuchten, und gleitende Lichter.", "Rascacielos con letreros de neón que brillan bajo la lluvia y luces que se deslizan.", "Des gratte-ciel aux enseignes néon qui brillent sous la pluie, et des lumières qui filent.", "Arranha-céus com letreiros neon brilhando na chuva e luzes deslizando.", "Небоскрёбы с неоновыми вывесками сияют под дождём, скользят огни."),
  () => {
    const s = sky("s", [[0, "#0a0418"], [0.6, "#2a0a3a"], [1, "#5a1a4a"]]);
    const far = skyline(21, 170, 50, 130, -10, 610, 16, 34, "#ff8ad8", 0.2);
    const near = skyline(23, 200, 70, 170, 200, 610, 30, 54, "#ffd27a", 0.22);
    const sign = (x, y, w, h, c) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='2' fill='none' stroke='${c}' stroke-width='3' filter='url(#b)'/><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='2' fill='${c}' fill-opacity='.15' stroke='#fff' stroke-width='1'/>`;
    const cars = [0, 1, 2].map((i) => `<g><rect x='-20' y='${50 + i * 26}' width='12' height='3' rx='1.5' fill='${i % 2 ? "#ff5a8a" : "#5af0ff"}'/><circle cx='-8' cy='${51.5 + i * 26}' r='5' fill='${i % 2 ? "#ff5a8a" : "#5af0ff"}' opacity='.3'/><animateTransform attributeName='transform' type='translate' values='${i % 2 ? "640 0;-40 0" : "-40 0;640 0"}' dur='${5 + i * 1.5}s' repeatCount='2'/></g>`).join("");
    const body = s.b + `<circle cx='430' cy='90' r='180' fill='url(#cg)'/><path d='${far.body}' fill='#1e0e30'/><path d='${far.windows}' fill='#ff8ad8' opacity='.45'/>` + cars + `<path d='${near.body}' fill='#0e0618'/><path d='${near.windows}' fill='#ffd27a' opacity='.7'/>` +
      sign(300, 70, 16, 54, "#ff2e88") + sign(400, 50, 60, 18, "#2ef2ff") + sign(520, 90, 46, 16, "#fff04a") + sign(470, 120, 14, 40, "#a77bff") + scatter(11, 80, (r) => `<path d='M${f(r() * 640)} ${f(r() * 200)}l-4 14' stroke='#d8c8ff' stroke-opacity='${f(0.12 + r() * 0.3)}'/>`) + `<rect y='186' width='600' height='14' fill='url(#wet)'/>`;
    return bannerDoc(s.d + blur("b", 3) + glow("cg", "#ff3a8a", 0.25) + lg("wet", [[0, "#ff2e88", 0.25], [1, "#2ef2ff", 0.1]], 0, 0, 1, 0), body, 0.35);
  }, ["animated"]);

add("starfall-lake", "legendary", 1150, true,
  N("Yıldız Yağmuru Gölü", "Starfall Lake", "Sternschnuppensee", "Lago de estrellas fugaces", "Lac des étoiles filantes", "Lago da chuva de estrelas", "Озеро звездопада"),
  N("Dağlar arasındaki ayna gibi gölde yansıyan bir yıldız yağmuru.", "A meteor shower mirrored in a glassy lake between the mountains.", "Ein Sternschnuppenregen, der sich in einem spiegelglatten Bergsee spiegelt.", "Una lluvia de estrellas reflejada en un lago espejado entre montañas.", "Une pluie d'étoiles filantes reflétée dans un lac miroir entre les montagnes.", "Uma chuva de meteoros refletida em um lago espelhado entre montanhas.", "Звездопад отражается в зеркальном озере между гор."),
  () => {
    const s = sky("s", [[0, "#060a24"], [0.7, "#1e2a5a"], [1, "#4a3a7a"]]);
    const met = scatter(4, 10, (r, i) => { const x = 240 + r() * 360, y = r() * 70, L = 30 + r() * 50; return `<path d='M${f(x)} ${f(y)}l${f(-L)} ${f(L * 0.45)}' stroke='url(#mt)' stroke-width='${f(1 + r() * 1.4)}' stroke-linecap='round'>${pulse("opacity", "1;.2;1", f(2 + r() * 2), 3, f(r() * 2))}</path>`; });
    const top = `<g id='tp'>${stars(17, 120, [0, 0, 600, 120], ["#fff", "#e6dcff"], 1)}${met}<path d='${ridge(5, 112, 40, 0.55, 132, 48, [[380, 40, 80], [520, 30, 70]])}' fill='#141a3a'/><path d='${ridge(7, 124, 16, 0.5, 132)}' fill='#0c1028'/></g>`;
    const body = s.b + top + `<rect y='130' width='600' height='70' fill='url(#lk)'/><use href='#tp' transform='translate(0 260) scale(1 -1)' opacity='.4'/>` + scatter(6, 16, (r) => `<path d='M${f(r() * 600)} ${f(136 + r() * 60)}h${f(10 + r() * 30)}' stroke='#c6b7ff' stroke-opacity='${f(0.1 + r() * 0.2)}'/>`);
    return bannerDoc(s.d + lg("mt", [[0, "#fff"], [1, "#c6b7ff", 0]], 0, 0, 1, 0) + lg("lk", ["#1a1e44", "#06081a"]), body, 0.35);
  }, ["animated"]);

add("emerald-falls", "legendary", 1000, true,
  N("Zümrüt Şelaleler", "Emerald Falls", "Smaragdfälle", "Cataratas esmeralda", "Chutes d'émeraude", "Cataratas esmeralda", "Изумрудные водопады"),
  N("Yeşil uçurumlardan dökülen şelaleler, sis ve tropik yapraklar.", "Waterfalls pouring from green cliffs into mist among tropical leaves.", "Wasserfälle stürzen von grünen Klippen in den Nebel, umrahmt von Tropenblättern.", "Cascadas que caen de acantilados verdes entre bruma y hojas tropicales.", "Des cascades tombant de falaises vertes dans la brume, parmi des feuilles tropicales.", "Cachoeiras despencando de penhascos verdes na névoa, entre folhas tropicais.", "Водопады низвергаются с зелёных скал в туман среди тропической листвы."),
  () => {
    const s = sky("s", [[0, "#6ac8e8"], [0.6, "#c8f0e8"], [1, "#f0fff8"]]);
    const fall = (x, y, w, h) => `<path d='M${x} ${y}h${w}l${f(w * 0.15)} ${h}h${f(-w * 1.3)}Z' fill='url(#fw)'/><path d='${Array.from({ length: Math.ceil(w / 4) }, (_, i) => `M${x + 2 + i * 4} ${y}l${f(i * 0.3 - w * 0.04)} ${h}`).join("")}' stroke='#fff' stroke-opacity='.55' stroke-dasharray='12 7'><animate attributeName='stroke-dashoffset' from='0' to='-38' dur='1.1s' repeatCount='3'/></path>`;
    const cliffP = (x0, x1, top, seed) => { const r = rnd(seed); let d = `M${x0} 200V${top + 10}`; for (let x = x0; x <= x1; x += 10) d += `L${x} ${f(top + (r() - 0.5) * 8)}`; return d + `L${x1} 200Z`; };
    const frond = (x, y, len, rot, flip) => { let d = `M0 0Q${f(len * 0.5)} ${f(-len * 0.15 * flip)} ${len} 0`; for (let i = 1; i < 12; i++) { const t = i / 12, px = len * t, py = -len * 0.15 * flip * 4 * t * (1 - t); const l = len * 0.32 * Math.sin(Math.PI * t); d += `M${f(px)} ${f(py)}l${f(l * 0.4)} ${f(-l)}M${f(px)} ${f(py)}l${f(l * 0.4)} ${f(l)}`; } return `<g transform='translate(${x} ${y}) rotate(${rot})'><path d='${d}' stroke='#1f7a3a' stroke-width='3.2' stroke-linecap='round' fill='none'/><path d='M0 0Q${f(len * 0.5)} ${f(-len * 0.15 * flip)} ${len} 0' stroke='#0e4a22' stroke-width='2' fill='none'/></g>`; };
    const body = s.b + `<circle cx='480' cy='40' r='90' fill='url(#g)'/>` + `<path d='${ridge(3, 80, 24, 0.55, 200, 32, [[420, 30, 100]])}' fill='#8ad0b0' opacity='.7'/><path d='${ridge(5, 100, 20, 0.55, 200, 32)}' fill='#5ab08a' opacity='.7'/>` +
      `<path d='${cliffP(320, 410, 52, 2)}' fill='url(#gc)'/><path d='${cliffP(450, 610, 30, 3)}' fill='url(#gc)'/><path d='${cliffP(400, 470, 96, 4)}' fill='url(#gc2)'/>` +
      `<path d='M320 62h90M450 40h160M400 104h70' stroke='#7ae08a' stroke-width='6' stroke-linecap='round'/>` + fall(406, 60, 16, 140) + fall(468, 38, 22, 162) + fall(418, 102, 38, 98) +
      `<g fill='#fff' opacity='.9'>${cloudBand(4, 184, 12, 24, 360, 560)}</g>` + ["#ff5a5a", "#ffb03a", "#ffe04a", "#5ad07a", "#4a9aff"].map((c, i) => `<path d='M370 176A100 100 0 0 1 570 176' fill='none' stroke='${c}' stroke-width='3' stroke-opacity='.32' transform='translate(0 ${i * 3})'/>`).join("") +
      frond(600, 30, 90, 150, 1) + frond(600, 120, 80, 200, -1) + frond(290, 210, 80, -60, 1) + frond(320, 210, 70, -100, -1) + scatter(5, 10, (r) => `<circle cx='${f(380 + r() * 200)}' cy='${f(150 + r() * 40)}' r='${f(1 + r() * 2)}' fill='#fff' opacity='.7'/>`);
    return bannerDoc(s.d + glow("g", "#fff", 0.7) + lg("fw", ["#ffffff", "#c8f4ff", "#7ad8f0"], 0, 0, 1, 0) + lg("gc", ["#3a9a5a", "#1e6a3a", "#0e3a22"], 0, 0, 1, 1) + lg("gc2", ["#2a8a4a", "#14502a"], 0, 0, 1, 1), body, 0.25);
  }, ["animated"]);

module.exports = { BANNERS };
