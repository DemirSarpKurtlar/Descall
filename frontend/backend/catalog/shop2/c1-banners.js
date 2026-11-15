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

module.exports = { BANNERS };
