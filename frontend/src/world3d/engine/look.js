/**
 * Avatar looks (phase 5, "Karakterini oluştur", approved-ui-5.png).
 *
 * A look spec is what the server stores and relays (backend/lib/world3d/cosmetics.js):
 *   { v: 1, hair, top, face, acc: [ids], skin: 0..5, colors: { hair?, top?, <accId>? } }
 * This module turns a spec into what the avatar draws: the mesh groups of
 * tools/world3d/build_character.py to show and the 64 x 64 palette (cells + stripe
 * strips). Prices are not here: the panel shows the server's catalog.
 *
 * Without a saved look every user gets a stable default from their id, built only from
 * free items (the phase 1 behaviour, now in the new format).
 */

// Palette cells, same indexes as build_character.py CELLS.
export const CELLS = {
  skin: 0, top: 1, top_dark: 2, inner: 3, pants: 4, pants_cuff: 5,
  shoe: 6, sole: 7, shoe_accent: 8, hair: 9, eye_white: 10, iris: 11,
  mouth: 12, brows: 13, acc1: 14, acc2: 15, highlight: 16, sock: 17,
  nose: 18, lens: 19, sleeve: 20, sleeve_stripe: 21, stripe: 22, blush: 23,
  pack: 24, scarf: 25, guitar: 26, guitar_dark: 27, metal: 28, sole_band: 29,
  trim: 30, trim_stripe: 31, patch: 32, teeth: 33, freckle: 34, acc_dark: 35,
  hair_tie: 36, coat_dark: 37, lash: 38, torso_stripe: 39, hair_hi: 40, tongue: 41, cuff: 42,
};

// Stripe strips in palette row 7 (build_character.py STRIP_Y / STRIP_PAIRS): U = height.
export const STRIPS = {
  torso: { y: 57, a: "top", b: "torso_stripe" },
  sleeve: { y: 59, a: "sleeve", b: "sleeve_stripe" },
  shirt: { y: 61, a: "inner", b: "stripe" },
};
export const STRIP_PERIOD_PX = 8;

/** The draft's colour row (drafts.html .colors), applied to the selected item's main colour. */
export const COLOR_ROW = ["#f2f3f8", "#587af6", "#8b6cf6", "#e2556b", "#2aa198", "#d9a21b"];
/** Saç tab: natural tones plus the brand violet. */
export const HAIR_COLORS = ["#1c2134", "#3a2a24", "#6b4334", "#9a4a2c", "#d9a560", "#8b6cf6"];
/** Yüz tab: warm skin tones, each with its nose / ear shade and cheek blush. */
export const SKINS = [
  { skin: "#ffc7a3", nose: "#f7ad8b", blush: "#f79a90" },
  { skin: "#f9b994", nose: "#f0a07c", blush: "#f08c84" },
  { skin: "#e9a47c", nose: "#dc8f69", blush: "#e47d74" },
  { skin: "#ffd0b0", nose: "#f8b796", blush: "#fa9f98" },
  { skin: "#c98b63", nose: "#b97a55", blush: "#cf6f68" },
  { skin: "#9c6a4b", nose: "#8c5d40", blush: "#b5615a" },
];

// Jeans and sneakers are not customisable: a stable pair per user (scene-5 cast).
export const LOWER = [
  { pants: "#2a3159", pants_cuff: "#3b4479", shoe: "#f4f4f4", shoe_accent: "#4f8f6a", sole: "#55a07a", sole_band: "#f2f2f2" },
  { pants: "#3a2b3a", pants_cuff: "#4b3a4a", shoe: "#f4f4f4", shoe_accent: "#3b5a9a", sole: "#6c8fd8", sole_band: "#f2f2f2" },
  { pants: "#4f78b8", pants_cuff: "#6b90c8", shoe: "#cf6178", shoe_accent: "#f2c4cc", sole: "#f1d7dc", sole_band: "#f6eef0" },
  { pants: "#334a86", pants_cuff: "#4a62a0", shoe: "#7a5a46", shoe_accent: "#e07b39", sole: "#e28a45", sole_band: "#f2e8dc" },
  { pants: "#3e6aa6", pants_cuff: "#5a85c0", shoe: "#e8742f", shoe_accent: "#2c3f7a", sole: "#f1a15a", sole_band: "#f3efe9" },
  { pants: "#2a2d40", pants_cuff: "#3a3e56", shoe: "#3b4a6b", shoe_accent: "#6f86b8", sole: "#8fa6d8", sole_band: "#eef0f6" },
  { pants: "#374062", pants_cuff: "#4a5480", shoe: "#f4f4f4", shoe_accent: "#e05a5a", sole: "#e86a6a", sole_band: "#f4f4f4" },
];

const BASE = {
  inner: "#f1e9da", stripe: "#f1e9da", eye_white: "#fbfbff", iris: "#22150f", mouth: "#7a2c35",
  highlight: "#ffffff", sock: "#f4f4f4", acc1: "#c94a4a", acc2: "#f5f5f5", lens: "#17171d",
  pack: "#3b4a7a", scarf: "#5cc0c8", guitar: "#d9954a", guitar_dark: "#4a2a1a", metal: "#d2d5de",
  trim: "#f1ece4", trim_stripe: "#8f2f35", patch: "#f1ece4", teeth: "#fbfaf7", freckle: "#c97a5c",
  acc_dark: "#8f2f35", hair_tie: "#e2556b", coat_dark: "#1f7d76", lash: "#1b1420", tongue: "#e0707a",
};

/**
 * Render data per catalog item (ids and slots mirror backend/lib/world3d/cosmetics.js,
 * look.selftest.mjs checks both lists). swatch = the card gradient (Kıyafet: drafts.html),
 * colors = item defaults, tint = cells the colour row sets (main) and shaded cells.
 */
export const ITEMS = {
  // Saç
  hair_swept: { slot: "hair", swatch: ["#2b3352", "#56618c"], colors: { hair: "#1c2134" } },
  hair_fringe: { slot: "hair", swatch: ["#3b2f45", "#7a5f8f"], colors: { hair: "#1e2236" } },
  hair_bob: { slot: "hair", swatch: ["#26243a", "#5b5680"], colors: { hair: "#1e1d2a" } },
  hair_bun: { slot: "hair", swatch: ["#6b4334", "#a8705a"], colors: { hair: "#6b4334" } },
  hair_ponytail: { slot: "hair", swatch: ["#3a2a24", "#8a5a48"], colors: { hair: "#3a2a24", hair_tie: "#e2556b" } },
  hair_curly: { slot: "hair", swatch: ["#2a1d1a", "#6f4a3c"], colors: { hair: "#2a1d1a" } },
  // Kıyafet (drafts.html swatches, in the draft's order)
  top_hoodie: {
    slot: "top", swatch: ["#e8e8ee", "#b9bcc8"],
    colors: { top: "#eceef3", top_dark: "#d3d6df", cuff: "#d3d6df" },
    tint: { main: ["top", "sleeve", "sleeve_stripe", "torso_stripe"], shade: { top_dark: -0.12, cuff: -0.12 } },
  },
  top_bomber: {
    slot: "top", swatch: ["#1e2a5a", "#3a4fd8"],
    colors: { top: "#2d3f86", top_dark: "#243467", cuff: "#243467", trim: "#243467", inner: "#efe2cc", patch: "#e2a33b" },
    tint: { main: ["top", "sleeve", "sleeve_stripe", "torso_stripe"], shade: { top_dark: -0.2, cuff: -0.2, trim: -0.2 } },
  },
  top_varsity: {
    slot: "top", swatch: ["#b23a3a", "#e2556b"],
    colors: { top: "#c8564f", top_dark: "#a8433d", cuff: "#f1ece4", trim: "#f1ece4", trim_stripe: "#8f2f35", patch: "#f1ece4", inner: "#f4f1ec" },
    tint: { main: ["top", "sleeve", "sleeve_stripe", "torso_stripe"], shade: { top_dark: -0.18, trim_stripe: -0.32 } },
  },
  top_vest: {
    slot: "top", swatch: ["#d9a21b", "#f2c94c"],
    colors: { top: "#2c3b7c", top_dark: "#22306a", sleeve: "#eab949", sleeve_stripe: "#eab949", cuff: "#d9a63a", inner: "#eab949", stripe: "#eab949" },
    tint: { main: ["top", "torso_stripe"], shade: { top_dark: -0.18 } },
  },
  top_raincoat: {
    slot: "top", swatch: ["#2aa198", "#5ad1c4"],
    colors: { top: "#2aa198", top_dark: "#1f7d76", coat_dark: "#1f7d76", cuff: "#1f7d76" },
    tint: { main: ["top", "sleeve", "sleeve_stripe", "torso_stripe"], shade: { top_dark: -0.22, coat_dark: -0.22, cuff: -0.22 } },
  },
  top_striped: {
    slot: "top", swatch: ["#3a3d4a", "#6b6f80"],
    colors: { top: "#454856", torso_stripe: "#8d909c", sleeve: "#454856", sleeve_stripe: "#8d909c", top_dark: "#363945", cuff: "#363945" },
    tint: { main: ["top", "sleeve"], shade: { top_dark: -0.2, cuff: -0.2 } },
  },
  // Aksesuar (one per zone: a cap and a beanie never stack)
  acc_headphones: { slot: "acc", zone: "head", swatch: ["#c9cde0", "#8b6cf6"], colors: { acc2: "#e3e6f2", acc1: "#6f63e8" }, tint: { main: ["acc2"] } },
  acc_cap: { slot: "acc", zone: "head", swatch: ["#b8343a", "#f4f1ea"], colors: { acc1: "#b8343a", acc2: "#f4f1ea" }, tint: { main: ["acc1"] }, hat: true },
  acc_glasses: { slot: "acc", zone: "eyes", swatch: ["#17171d", "#4a4d5a"], colors: { lens: "#17171d" }, tint: { main: ["lens"] } },
  acc_scarf: { slot: "acc", zone: "neck", swatch: ["#2aa198", "#5cc0c8"], colors: { scarf: "#4fb8c4" }, tint: { main: ["scarf"] } },
  acc_backpack: { slot: "acc", zone: "back", swatch: ["#1e2a5a", "#3b4a7a"], colors: { pack: "#2b3b70" }, tint: { main: ["pack"] } },
  acc_beanie: { slot: "acc", zone: "head", swatch: ["#e2556b", "#f09aa8"], colors: { acc1: "#e2556b", acc_dark: "#b9404f", acc2: "#f4f1ea" }, tint: { main: ["acc1"], shade: { acc_dark: -0.2 } }, hat: true },
  // Yüz
  face_classic: { slot: "face", swatch: ["#f2b58f", "#ffd0b0"] },
  face_lashes: { slot: "face", swatch: ["#f5b7a8", "#ffd6cc"] },
  face_bold: { slot: "face", swatch: ["#d99a74", "#f2c09a"] },
  face_sleepy: { slot: "face", swatch: ["#c9a2d8", "#ead0f2"] },
  face_grin: { slot: "face", swatch: ["#f29a8e", "#ffd0b0"] },
  face_freckles: { slot: "face", swatch: ["#e0a07a", "#f7c9a6"] },
};

export const SLOT_ORDER = ["hair", "top", "acc", "face"];
export const ITEM_IDS = Object.keys(ITEMS);
export const itemsInSlot = (slot) => ITEM_IDS.filter((id) => ITEMS[id].slot === slot);

export const BASE_SPEC = Object.freeze({ v: 1, hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: [], skin: 0, colors: {} });

// Free-only defaults (phase 1 per-user default, in the new format).
const FREE_DEFAULTS = [
  { hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: [], colors: { top: 0 } },
  { hair: "hair_bob", top: "top_striped", face: "face_lashes", acc: ["acc_glasses"], colors: { top: 1 } },
  { hair: "hair_bun", top: "top_hoodie", face: "face_lashes", acc: ["acc_scarf"], colors: { top: 2, hair: 2 } },
  { hair: "hair_swept", top: "top_striped", face: "face_classic", acc: ["acc_glasses"], colors: {} },
  { hair: "hair_bob", top: "top_hoodie", face: "face_classic", acc: [], colors: { top: 3 } },
  { hair: "hair_bun", top: "top_striped", face: "face_lashes", acc: ["acc_scarf"], colors: { top: 4, hair: 1 } },
  { hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: ["acc_scarf"], colors: { top: 5 } },
  { hair: "hair_bob", top: "top_hoodie", face: "face_lashes", acc: ["acc_glasses"], colors: { top: 1, hair: 1 } },
];

/**
 * The scene-5 cast as presets (harness / evidence: ?looks=id:index). One of each outfit:
 * Kapüşonlu, Bomber, Çizgili, Kolej ceket, Yelek, Yağmurluk; `lower` pins jeans and shoes.
 */
export const LOOKS = [
  { hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: [], skin: 1, lower: 0, colors: {} },
  { hair: "hair_bob", top: "top_bomber", face: "face_lashes", acc: ["acc_headphones"], skin: 3, lower: 1, colors: { hair: 0 } },
  { hair: "hair_bun", top: "top_striped", face: "face_lashes", acc: ["acc_scarf"], skin: 0, lower: 2, colors: { top: 0, hair: 2 } },
  { hair: "hair_swept", top: "top_varsity", face: "face_bold", acc: ["acc_cap", "acc_glasses"], skin: 2, lower: 3, colors: {} },
  { hair: "hair_fringe", top: "top_vest", face: "face_classic", acc: ["acc_backpack"], skin: 1, lower: 4, colors: {} },
  { hair: "hair_ponytail", top: "top_raincoat", face: "face_freckles", acc: [], skin: 3, lower: 5, colors: {} },
  { hair: "hair_curly", top: "top_striped", face: "face_grin", acc: ["acc_beanie"], skin: 4, lower: 6, colors: { top: 2 } },
  { hair: "hair_bun", top: "top_bomber", face: "face_sleepy", acc: ["acc_headphones"], skin: 0, lower: 1, colors: { top: 4 } },
].map((l) => ({ v: 1, ...l }));

export function hashId(id) {
  const s = String(id || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** hex colour lighter (k > 0, toward white) or darker (k < 0). */
export function shade(hex, k) {
  const h = String(hex).replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = c.map((v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

/** Item ids a spec uses. */
export function specItems(spec) {
  return [spec.hair, spec.top, spec.face, ...(spec.acc || [])].filter(Boolean);
}

/** Only what the server stores (drops local fields such as `lower`). */
export function cleanSpec(spec) {
  const s = spec || BASE_SPEC;
  const acc = (s.acc || []).filter((id) => ITEMS[id]?.slot === "acc");
  const colors = {};
  for (const [k, v] of Object.entries(s.colors || {})) {
    if (v == null) continue;
    if (k === "hair" || k === "top" || acc.includes(k)) colors[k] = v;
  }
  acc.sort((a, b) => ITEM_IDS.indexOf(a) - ITEM_IDS.indexOf(b));
  return { v: 1, hair: s.hair, top: s.top, face: s.face, acc, skin: s.skin | 0, colors };
}

/** Default spec for a user id (free items only), with its stable jeans / shoes. */
export function defaultSpec(id, index = null) {
  const h = hashId(id);
  const i = index == null ? h % FREE_DEFAULTS.length : index;
  return { v: 1, ...FREE_DEFAULTS[i], skin: (h >>> 8) % SKINS.length, lower: (h >>> 4) % LOWER.length };
}

function safeSlot(spec, slot, fallback) {
  const id = spec?.[slot];
  return ITEMS[id]?.slot === slot ? id : fallback;
}

/**
 * Spec -> { spec, groups (mesh groups merged into one draw call), face (face mesh group),
 * colors (palette cell -> hex), strips }.
 */
export function resolveLook(rawSpec, userId = "") {
  const fallback = defaultSpec(userId);
  const spec = {
    v: 1,
    hair: safeSlot(rawSpec, "hair", fallback.hair),
    top: safeSlot(rawSpec, "top", fallback.top),
    face: safeSlot(rawSpec, "face", fallback.face),
    acc: [],
    skin: Number.isInteger(rawSpec?.skin) && SKINS[rawSpec.skin] ? rawSpec.skin : fallback.skin,
    colors: { ...(rawSpec?.colors || {}) },
  };
  const zones = new Set();
  for (const id of rawSpec?.acc || []) {
    const it = ITEMS[id];
    if (!it || it.slot !== "acc" || zones.has(it.zone)) continue;
    zones.add(it.zone);
    spec.acc.push(id);
  }
  const lower = LOWER[Number.isInteger(rawSpec?.lower) ? rawSpec.lower % LOWER.length : fallback.lower];
  const colors = { ...BASE, ...SKINS[spec.skin], ...lower };
  const paint = (id) => {
    const it = ITEMS[id];
    Object.assign(colors, it.colors || {});
    if (it.slot === "top") {
      // body cloth follows the top: sleeves and the torso stripe are the top colour unless
      // the item says otherwise (vest: a mustard long-sleeve; striped: two greys)
      for (const cell of ["sleeve", "sleeve_stripe", "torso_stripe"]) if (!it.colors?.[cell]) colors[cell] = colors.top;
    }
    const pick = spec.colors[id === spec.top ? "top" : id === spec.hair ? "hair" : id];
    const row = it.slot === "hair" ? HAIR_COLORS : COLOR_ROW;
    if (Number.isInteger(pick) && row[pick]) {
      if (it.slot === "hair") colors.hair = row[pick];
      for (const cell of it.tint?.main || []) colors[cell] = row[pick];
      for (const [cell, k] of Object.entries(it.tint?.shade || {})) colors[cell] = shade(row[pick], k);
    }
  };
  paint(spec.top);
  paint(spec.hair);
  colors.brows = shade(colors.hair, -0.18);
  colors.hair_hi = shade(colors.hair, 0.18);
  for (const id of spec.acc) paint(id);
  const hat = spec.acc.some((id) => ITEMS[id].hat);
  const groups = ["body", hat ? `${spec.hair}_hat` : spec.hair, spec.top, ...spec.acc];
  return { spec, groups, face: spec.face, colors };
}

/** Stable look for a user id (no saved look). */
export function lookFor(id) {
  return { index: hashId(id) % FREE_DEFAULTS.length, ...resolveLook(defaultSpec(id), id) };
}

/**
 * Looks for everyone in a room. overrides[userId] = saved spec (from the server roster)
 * or a LOOKS preset index (harness). Without one, people get distinct free defaults.
 */
export function looksForRoom(ids, overrides = null) {
  const used = new Set();
  const out = new Map();
  for (const id of ids) {
    const forced = overrides ? overrides[String(id)] : undefined;
    if (Number.isInteger(forced) && LOOKS[forced]) {
      out.set(String(id), { index: forced, ...resolveLook(LOOKS[forced], id) });
      continue;
    }
    if (forced && typeof forced === "object") {
      out.set(String(id), { index: -1, ...resolveLook(forced, id) });
      continue;
    }
    let i = hashId(id) % FREE_DEFAULTS.length;
    if (used.has(i) && used.size < FREE_DEFAULTS.length) while (used.has(i)) i = (i + 1) % FREE_DEFAULTS.length;
    used.add(i);
    out.set(String(id), { index: i, ...resolveLook(defaultSpec(id, i), id) });
  }
  return out;
}

/**
 * Rastgele: a random look from items the user may wear (free or owned). Skin stays.
 * rng() in [0, 1).
 */
export function randomSpec(current, allowed, rng = Math.random) {
  const can = (id) => allowed.has(id);
  const pickFrom = (slot) => {
    const list = itemsInSlot(slot).filter(can);
    return list.length ? list[Math.floor(rng() * list.length)] : current[slot];
  };
  const colorPick = (n) => (rng() < 0.25 ? undefined : Math.floor(rng() * n));
  const spec = { v: 1, hair: pickFrom("hair"), top: pickFrom("top"), face: pickFrom("face"), acc: [], skin: current.skin | 0, colors: {} };
  for (const zone of ["head", "eyes", "neck", "back"]) {
    const list = itemsInSlot("acc").filter((id) => ITEMS[id].zone === zone && can(id));
    if (list.length && rng() < (zone === "head" ? 0.45 : 0.35)) spec.acc.push(list[Math.floor(rng() * list.length)]);
  }
  const hc = colorPick(HAIR_COLORS.length);
  if (hc != null) spec.colors.hair = hc;
  const tc = colorPick(COLOR_ROW.length);
  if (tc != null) spec.colors.top = tc;
  for (const id of spec.acc) {
    const c = colorPick(COLOR_ROW.length);
    if (c != null) spec.colors[id] = c;
  }
  return cleanSpec(spec);
}
