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

module.exports = { BANNERS };
