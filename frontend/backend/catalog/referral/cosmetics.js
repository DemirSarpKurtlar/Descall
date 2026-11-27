"use strict";

/**
 * Davet ödülleri: exclusive cosmetics (owner decision, 27 Nov 2026). They are never on sale,
 * never in the storefront and never giftable from the shop: the referral system is the only
 * way to get them (lib/referrals/engine.js grants them idempotently). They use the Market 2.0
 * rendering contract (s2- skus, c1-lib geometry), so frames and badges render everywhere an
 * avatar or a name does, without new client code.
 *
 *   3 friends   s2-profile_badge-ref-baglanti   "Bağlantı" profile badge
 *   10 friends  s2-avatar_frame-ref-kopru       "Köprü" avatar frame (animated, finite)
 *   25 friends  s2-banner-ref-halka             "Halka" profile banner
 *               s2-name_effect-ref-halka        "Halka" name glow (CSS: styles/shop2-c2.css)
 *   invitee     s2-profile_badge-ref-davetli    "Davetli" badge once the welcome gift unlocks
 *
 * The rows are inserted by supabase/migrations/20261125b_invite_rewards.sql with fixed ids,
 * active = false and the "exclusive" / "referral" tags; this file is the source of the art
 * (node backend/catalog/referral/cosmetics.js --sql prints the insert).
 * This folder is not read by the shop2 catalog seed (catalog/shop2/seed.js).
 */

const L = require("../shop2/c1-lib");

const { f, lg, rg, lgU, rgU, circ, band, at, sparkle, pulse, spin, dataUri, minifyBanner, frameDoc, badgeDoc, bannerDoc, BW, BH } = L;

const N = (tr, en, de, es, fr, pt, ru) => ({ tr, en, de, es, fr, "pt-BR": pt, ru });

/** Fixed ids so rules, grants and the migration agree without a lookup. */
const IDS = {
  badge: "5f7a1c00-0d3a-4e8b-9c11-000000000003",
  frame: "5f7a1c00-0d3a-4e8b-9c11-000000000010",
  banner: "5f7a1c00-0d3a-4e8b-9c11-000000000025",
  glow: "5f7a1c00-0d3a-4e8b-9c11-000000000026",
  invited: "5f7a1c00-0d3a-4e8b-9c11-000000000001",
};

// ---------------------------------------------------------------- badge art (24 grid)
const SHIELD = "M12 1.4L20.8 4.6V11.2C20.8 16.6 17 20.6 12 22.6C7 20.6 3.2 16.6 3.2 11.2V4.6Z";
const HEX = "M12 1.2L21.4 6.6V17.4L12 22.8L2.6 17.4V6.6Z";

function badgeBody(shape, pal, glyph, extra = "") {
  const [light, mid, dark] = pal;
  const defs = rg("b", [[0, light], [0.55, mid], [1, dark]], 0.32, 0.25, 0.85) + lg("hl", [[0, "#fff", 0.55], [0.5, "#fff", 0]], 0, 0, 0, 1);
  let body = `<path d='${shape}' fill='url(#b)' stroke='#0b0d17' stroke-width='1.3' stroke-linejoin='round'/>`;
  body += `<path d='${shape}' fill='none' stroke='#fff' stroke-opacity='.42' stroke-width='.8' transform='translate(12 12) scale(.84) translate(-12 -12)'/>`;
  body += `<path d='${shape}' fill='url(#hl)' transform='translate(12 9) scale(.78 .6) translate(-12 -12)'/>`;
  return badgeDoc(defs, body + glyph + extra);
}

/** Two interlocked chain links: "Bağlantı". */
function linkBadge() {
  const link = (dx, dy, rot) =>
    `<rect x='-3.8' y='-2.2' width='7.6' height='4.4' rx='2.2' fill='none' stroke='#fff' stroke-width='1.7' transform='translate(${12 + dx} ${12.4 + dy}) rotate(${rot})'/>`;
  const shadow = `<g opacity='.5' transform='translate(0 .9)'><rect x='-3.8' y='-2.2' width='7.6' height='4.4' rx='2.2' fill='none' stroke='#1b2a80' stroke-width='1.7' transform='translate(10 14.4) rotate(-40)'/><rect x='-3.8' y='-2.2' width='7.6' height='4.4' rx='2.2' fill='none' stroke='#1b2a80' stroke-width='1.7' transform='translate(14 10.4) rotate(-40)'/></g>`;
  const spark = `<path d='${sparkle(2.2, 0.2)}' transform='translate(16.6 7)' fill='#fff'/>`;
  return badgeBody(SHIELD, ["#c9d5ff", "#587af5", "#1c2a8f"], shadow + link(-2, 2, -40) + link(2, -2, -40), spark);
}

/** Smile with two friends: "Davetli". */
function invitedBadge() {
  const glyph =
    `<path d='M7 14.5c2-3.6 8-3.6 10 0' stroke='#0d4d6a' stroke-opacity='.5' stroke-width='1.9' fill='none' stroke-linecap='round' transform='translate(0 .9)'/>` +
    `<path d='M7 14.5c2-3.6 8-3.6 10 0' stroke='#fff' stroke-width='1.8' fill='none' stroke-linecap='round'/>` +
    `<circle cx='7' cy='14.5' r='1.6' fill='#fff'/><circle cx='17' cy='14.5' r='1.6' fill='#fff'/><circle cx='12' cy='8.4' r='2' fill='#fff'/>`;
  return badgeBody(HEX, ["#b9fff1", "#2ad4b8", "#0d5a8a"], glyph);
}

// ---------------------------------------------------------------- frame art (200 grid)
/** "Köprü": a brand-blue ring, two cable arcs like a suspension bridge, friend nodes. */
function bridgeFrame() {
  const defs =
    lgU("m", [[0, "#eaf0ff"], [0.28, "#a9bbff"], [0.55, "#587af5"], [0.8, "#2a3fb8"], [1, "#0e1752"]], 20, 20, 180, 180) +
    lgU("cab", [[0, "#7cebd8"], [0.5, "#a9bbff"], [1, "#8c5cf6"]], 20, 0, 180, 0) +
    rgU("glow", [[0.72, "#587af5", 0], [0.84, "#587af5", 0.45], [1, "#8c5cf6", 0]], 100, 100, 100) +
    rg("node", [[0, "#ffffff"], [0.45, "#c9d5ff"], [1, "#3a52d6"]], 0.35, 0.3, 0.7) +
    `<g id='n'><circle r='4.4' fill='url(#node)' stroke='#0e1752' stroke-width='.9'/><circle cx='-1.3' cy='-1.4' r='1.1' fill='#fff' fill-opacity='.9'/></g>`;
  // Two suspension cables over the top and the bottom, outside the ring (towers at 60 / 300 and 120 / 240).
  const cables =
    `<path d='${L.arc(94, 300, 60)}' fill='none' stroke='url(#cab)' stroke-width='2.4' stroke-linecap='round'/>` +
    `<path d='${L.arc(94, 120, 240)}' fill='none' stroke='url(#cab)' stroke-width='2.4' stroke-linecap='round'/>`;
  // Hangers from the cables down to the ring (thin, every 12 degrees around the top and bottom).
  let hangers = "";
  for (let d = -48; d <= 48; d += 12) hangers += at(89.5, d, `<path d='M0 -4.4V2' stroke='#a9bbff' stroke-width='1.1' stroke-opacity='.75'/>`);
  for (let d = 132; d <= 228; d += 12) hangers += at(89.5, d, `<path d='M0 -4.4V2' stroke='#a9bbff' stroke-width='1.1' stroke-opacity='.75'/>`);
  // Towers at the four cable ends.
  let towers = "";
  for (const d of [60, 120, 240, 300]) towers += at(88, d, `<rect x='-3.2' y='-8' width='6.4' height='16' rx='1.6' fill='url(#m)' stroke='#0e1752' stroke-width='.9'/>`);
  // Ten friend nodes (one per invited friend at this milestone), lit one after another.
  let nodes = "";
  for (let i = 0; i < 10; i++) {
    const d = i * 36 + 18;
    nodes += at(80, d, `<use href='#n'/><circle r='5.6' fill='none' stroke='#a9bbff' stroke-width='1' opacity='0'>${pulse("opacity", "0;.9;0", 2.4, 2, f(i * 0.24))}</circle>`);
  }
  const glints = [[100, 8], [100, 192]].map(([x, y], i) => `<path d='${sparkle(6, 0.16)}' transform='translate(${x} ${y})' fill='#fff' opacity='0'>${pulse("opacity", "0;1;0", 1.8, 3, i * 0.9)}</path>`).join("");
  return frameDoc(
    defs,
    `<circle cx='100' cy='100' r='97' fill='url(#glow)'>${pulse("opacity", "1;.55;1", 4, 3)}</circle>` +
      cables +
      hangers +
      band(80, 8, "url(#m)", { lip: "#dfe6ff" }) +
      circ(80, "#eaf0ff", 1, " stroke-dasharray='1.5 7' stroke-opacity='.55'") +
      towers +
      `<g>${nodes}${spin(60, 1)}</g>` +
      glints
  );
}

// ---------------------------------------------------------------- banner art (600 x 200)
/** "Halka": interlocking glowing rings over a deep night, the circle you built. */
function ringBanner() {
  const defs =
    lg("sky", [[0, "#0b0f2a"], [0.55, "#121a4a"], [1, "#0a0b1c"]], 0, 0, 0, 1) +
    rgU("aur1", [[0, "#587af5", 0.55], [1, "#587af5", 0]], 170, 40, 260) +
    rgU("aur2", [[0, "#8c5cf6", 0.45], [1, "#8c5cf6", 0]], 470, 170, 260) +
    rgU("aur3", [[0, "#2ad4b8", 0.35], [1, "#2ad4b8", 0]], 330, 210, 200) +
    lgU("r1", [[0, "#a9bbff"], [0.5, "#587af5"], [1, "#2ad4b8"]], 120, 0, 480, 0) +
    lgU("r2", [[0, "#7cebd8"], [0.5, "#a9bbff"], [1, "#8c5cf6"]], 120, 0, 480, 0) +
    rgU("core", [[0, "#ffffff", 0.9], [0.35, "#a9bbff", 0.55], [1, "#587af5", 0]], 300, 100, 34) +
    `<filter id='gl' x='-20%' y='-40%' width='140%' height='180%'><feGaussianBlur stdDeviation='5'/></filter>`;
  let stars = "";
  const rand = L.rnd(L.seedOf("halka-stars"));
  for (let i = 0; i < 70; i++) {
    const x = Math.round(rand() * BW);
    const y = Math.round(rand() * BH);
    const r = (0.4 + rand() * 1.1).toFixed(1);
    stars += `<circle cx='${x}' cy='${y}' r='${r}' fill='#fff' fill-opacity='${(0.25 + rand() * 0.6).toFixed(2)}'/>`;
  }
  // The circle you built: a bright core ring, two tilted orbits and 25 friend lights on the ring.
  const cx = 300;
  const cy = 100;
  const orbit = (rx, ry, rot, grad, w) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='none' stroke='url(#${grad})' stroke-width='${w}' transform='rotate(${rot} ${cx} ${cy})'/>`;
  const glow = `<g filter='url(#gl)' opacity='.9'>${orbit(70, 70, 0, "r1", 12)}${orbit(150, 44, -8, "r2", 6)}${orbit(150, 44, 8, "r1", 6)}</g>`;
  let lights = "";
  for (let i = 0; i < 25; i++) {
    const a2 = ((i * 360) / 25 - 90) * (Math.PI / 180);
    const x = f(cx + 70 * Math.cos(a2));
    const y = f(cy + 70 * Math.sin(a2));
    const big = i % 5 === 0;
    lights += `<circle cx='${x}' cy='${y}' r='${big ? 4.6 : 3.2}' fill='#fff'/><circle cx='${x}' cy='${y}' r='${big ? 2.6 : 1.7}' fill='${i % 3 === 0 ? "#7cebd8" : i % 3 === 1 ? "#a9bbff" : "#c3a8ff"}'/>`;
  }
  const crisp =
    orbit(150, 44, -8, "r2", 2.2) +
    orbit(150, 44, 8, "r1", 2.2) +
    orbit(70, 70, 0, "r1", 4.4) +
    `<circle cx='${cx}' cy='${cy}' r='34' fill='url(#core)'/>` +
    lights +
    [[cx - 150, cy - 12], [cx + 150, cy + 12], [cx, cy - 92]].map(([x, y]) => `<path d='${sparkle(8, 0.16)}' transform='translate(${f(x)} ${f(y)})' fill='#fff' fill-opacity='.9'/>`).join("");
  const body =
    `<rect width='${BW}' height='${BH}' fill='url(#sky)'/>` +
    `<rect width='${BW}' height='${BH}' fill='url(#aur1)'/><rect width='${BW}' height='${BH}' fill='url(#aur2)'/><rect width='${BW}' height='${BH}' fill='url(#aur3)'/>` +
    stars +
    glow +
    crisp;
  return bannerDoc(defs, body, 0.45);
}

const ITEMS = [
  {
    key: "badge",
    id: IDS.badge,
    sku: "s2-profile_badge-ref-baglanti",
    category: "profile_badge",
    rarity: "rare",
    milestone: 3,
    effect_key: null,
    svg: () => linkBadge(),
    name: N("Bağlantı", "Bond", "Verbindung", "Vínculo", "Lien", "Vínculo", "Связь"),
    description: N(
      "Davet ödülü: Descall'a 3 aktif arkadaş getirenlere. Satışta değil.",
      "Invite reward: for bringing 3 active friends to Descall. Not for sale.",
      "Einladungsbelohnung: für 3 aktive Freunde auf Descall. Nicht käuflich.",
      "Recompensa por invitación: por traer 3 amigos activos a Descall. No está a la venta.",
      "Récompense d'invitation : pour 3 amis actifs amenés sur Descall. Pas en vente.",
      "Recompensa de convite: por trazer 3 amigos ativos ao Descall. Não está à venda.",
      "Награда за приглашения: за 3 активных друзей в Descall. Не продаётся."
    ),
  },
  {
    key: "frame",
    id: IDS.frame,
    sku: "s2-avatar_frame-ref-kopru",
    category: "avatar_frame",
    rarity: "epic",
    milestone: 10,
    effect_key: null,
    svg: () => bridgeFrame(),
    name: N("Köprü", "Bridge", "Brücke", "Puente", "Pont", "Ponte", "Мост"),
    description: N(
      "Davet ödülü: 10 aktif arkadaş. Mavi bir köprü halkası ve sırayla yanan on arkadaş ışığı. Satışta değil.",
      "Invite reward: 10 active friends. A blue bridge ring and ten friend lights that glow one by one. Not for sale.",
      "Einladungsbelohnung: 10 aktive Freunde. Ein blauer Brückenring und zehn Freundeslichter, die nacheinander leuchten. Nicht käuflich.",
      "Recompensa por invitación: 10 amigos activos. Un aro de puente azul y diez luces de amigos que se encienden una a una. No está a la venta.",
      "Récompense d'invitation : 10 amis actifs. Un anneau de pont bleu et dix lumières d'amis qui s'allument une à une. Pas en vente.",
      "Recompensa de convite: 10 amigos ativos. Um aro de ponte azul e dez luzes de amigos que acendem uma a uma. Não está à venda.",
      "Награда за приглашения: 10 активных друзей. Синее кольцо-мост и десять огоньков друзей, загорающихся по очереди. Не продаётся."
    ),
  },
  {
    key: "banner",
    id: IDS.banner,
    sku: "s2-banner-ref-halka",
    category: "banner",
    rarity: "legendary",
    milestone: 25,
    effect_key: null,
    svg: () => minifyBanner(ringBanner()),
    name: N("Halka", "Circle", "Kreis", "Círculo", "Cercle", "Círculo", "Круг"),
    description: N(
      "Davet ödülü: 25 aktif arkadaş. Gece göğünde iç içe parlayan halkalar. Satışta değil.",
      "Invite reward: 25 active friends. Interlocking rings glowing in a night sky. Not for sale.",
      "Einladungsbelohnung: 25 aktive Freunde. Ineinandergreifende Ringe, die am Nachthimmel leuchten. Nicht käuflich.",
      "Recompensa por invitación: 25 amigos activos. Anillos entrelazados que brillan en un cielo nocturno. No está a la venta.",
      "Récompense d'invitation : 25 amis actifs. Des anneaux entrelacés qui brillent dans un ciel de nuit. Pas en vente.",
      "Recompensa de convite: 25 amigos ativos. Anéis entrelaçados brilhando num céu noturno. Não está à venda.",
      "Награда за приглашения: 25 активных друзей. Переплетённые кольца, сияющие в ночном небе. Не продаётся."
    ),
  },
  {
    key: "glow",
    id: IDS.glow,
    sku: "s2-name_effect-ref-halka",
    category: "name_effect",
    rarity: "legendary",
    milestone: 25,
    effect_key: "s2-ref-halka",
    svg: null,
    name: N("Halka Parıltısı", "Circle Glow", "Kreisglanz", "Brillo de círculo", "Éclat du cercle", "Brilho do círculo", "Сияние круга"),
    description: N(
      "Davet ödülü: 25 aktif arkadaş. Adında mavi, turkuaz ve mor arasında akan bir parıltı. Satışta değil.",
      "Invite reward: 25 active friends. A glow flowing through blue, teal and violet on your name. Not for sale.",
      "Einladungsbelohnung: 25 aktive Freunde. Ein Glanz, der in Blau, Türkis und Violett über deinen Namen fließt. Nicht käuflich.",
      "Recompensa por invitación: 25 amigos activos. Un brillo que fluye entre azul, turquesa y violeta en tu nombre. No está a la venta.",
      "Récompense d'invitation : 25 amis actifs. Un éclat qui coule entre bleu, turquoise et violet sur ton nom. Pas en vente.",
      "Recompensa de convite: 25 amigos ativos. Um brilho que corre entre azul, turquesa e violeta no seu nome. Não está à venda.",
      "Награда за приглашения: 25 активных друзей. Сияние, переливающееся синим, бирюзовым и фиолетовым на твоём имени. Не продаётся."
    ),
  },
  {
    key: "invited",
    id: IDS.invited,
    sku: "s2-profile_badge-ref-davetli",
    category: "profile_badge",
    rarity: "common",
    milestone: null,
    effect_key: null,
    svg: () => invitedBadge(),
    name: N("Davetli", "Invited", "Eingeladen", "Invitado", "Invité", "Convidado", "Приглашённый"),
    description: N(
      "Bir arkadaşın davetiyle geldin ve gerçekten aktif oldun. Satışta değil.",
      "You came with a friend's invite and became really active. Not for sale.",
      "Du bist mit der Einladung eines Freundes gekommen und wirklich aktiv geworden. Nicht käuflich.",
      "Llegaste con la invitación de un amigo y te volviste realmente activo. No está a la venta.",
      "Tu es venu avec l'invitation d'un ami et tu es devenu vraiment actif. Pas en vente.",
      "Você chegou com o convite de um amigo e ficou ativo de verdade. Não está à venda.",
      "Ты пришёл по приглашению друга и стал по-настоящему активным. Не продаётся."
    ),
  },
];

/** Shop rows for the migration (asset as data URI). */
function rows() {
  return ITEMS.map((it, i) => ({
    id: it.id,
    sku: it.sku,
    name: it.name.en,
    description: it.description.en,
    category: it.category,
    asset_url: it.svg ? dataUri(it.svg()) : "data:,",
    preview_url: null,
    price_cents: 0,
    price_descoin: 0,
    effect_key: it.effect_key,
    rarity: it.rarity,
    sort_order: 29000 + i,
    active: false,
    i18n: { name: it.name, description: it.description },
    tags: ["shop2", "exclusive", "referral", it.milestone ? `milestone:${it.milestone}` : "invitee"],
  }));
}

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;

function sql() {
  const cols = ["id", "sku", "name", "description", "category", "asset_url", "preview_url", "price_cents", "price_descoin", "effect_key", "rarity", "sort_order", "active", "i18n", "tags"];
  const values = rows().map((r) =>
    `  (${[
      `${sqlText(r.id)}::uuid`,
      sqlText(r.sku),
      sqlText(r.name),
      sqlText(r.description),
      sqlText(r.category),
      sqlText(r.asset_url),
      "NULL",
      "0",
      "0",
      r.effect_key ? sqlText(r.effect_key) : "NULL",
      sqlText(r.rarity),
      String(r.sort_order),
      "false",
      `${sqlText(JSON.stringify(r.i18n))}::jsonb`,
      `ARRAY[${r.tags.map(sqlText).join(", ")}]::text[]`,
    ].join(", ")})`
  );
  return `INSERT INTO public.shop_items (${cols.join(", ")})\nVALUES\n${values.join(",\n")}\nON CONFLICT (sku) DO NOTHING;\n`;
}

/** Default item ids per milestone and for the invitee (rules.js). */
const MILESTONE_ITEMS = { 3: [IDS.badge], 10: [IDS.frame], 25: [IDS.banner, IDS.glow] };
const INVITEE_ITEMS = [IDS.invited];
const EXCLUSIVE_IDS = Object.values(IDS);

module.exports = { IDS, ITEMS, MILESTONE_ITEMS, INVITEE_ITEMS, EXCLUSIVE_IDS, rows, sql, linkBadge, invitedBadge, bridgeFrame, ringBanner };

if (require.main === module) {
  if (process.argv.includes("--sql")) process.stdout.write(sql());
  else if (process.argv.includes("--svg")) {
    const key = process.argv[process.argv.indexOf("--svg") + 1];
    const it = ITEMS.find((x) => x.key === key);
    process.stdout.write(it && it.svg ? it.svg() : "");
  }
}
