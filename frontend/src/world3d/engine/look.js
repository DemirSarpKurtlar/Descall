/**
 * Avatar looks (phase 1, no customisation panel yet): every user gets a stable
 * outfit from their id, modelled on the approved character sheet (scene-5.jpg).
 * Palette cells mirror tools/world3d/build_character.py CELLS.
 */

export const CELLS = {
  skin: 0, top: 1, top_dark: 2, inner: 3, pants: 4, pants_cuff: 5,
  shoe: 6, sole: 7, shoe_accent: 8, hair: 9, eye_white: 10, iris: 11,
  mouth: 12, brows: 13, acc1: 14, acc2: 15, highlight: 16, sock: 17,
  nose: 18, lens: 19, sleeve: 20, sleeve_stripe: 21, stripe: 22, blush: 23,
  pack: 24, scarf: 25, guitar: 26, guitar_dark: 27, metal: 28, sole_band: 29,
};

// warm peach skin tones, each with its nose / ear shade and cheek blush
const SKINS = [
  { skin: "#ffc7a3", nose: "#f7ad8b", blush: "#f79a90" },
  { skin: "#f9b994", nose: "#f0a07c", blush: "#f08c84" },
  { skin: "#e9a47c", nose: "#dc8f69", blush: "#e47d74" },
  { skin: "#ffd0b0", nose: "#f8b796", blush: "#fa9f98" },
  { skin: "#c98b63", nose: "#b97a55", blush: "#cf6f68" },
];

// The six characters of the approved sheet (scene-5.jpg), left to right, then four recolours.
// outfit: hoodie | jacket (open zip jacket over a tee) | vest (puffer vest over a long-sleeve) | sweater
export const LOOKS = [
  // 1 white hoodie, navy trousers, swept black hair, white sneakers with green
  { hair: "spiky", outfit: "hoodie", acc: null, c: { top: "#eceef3", top_dark: "#d3d6df", sleeve: "#eceef3", sleeve_stripe: "#eceef3", pants: "#2a3159", pants_cuff: "#3b4479", shoe: "#f4f4f4", shoe_accent: "#4f8f6a", sole: "#55a07a", sole_band: "#f2f2f2", hair: "#1c2134" } },
  // 2 navy zip jacket over a beige tee, long bob with headphones
  { hair: "bob", outfit: "jacket", acc: "headphones", c: { top: "#2d3f86", top_dark: "#243467", sleeve: "#2d3f86", sleeve_stripe: "#2d3f86", inner: "#efe2cc", pants: "#3a2b3a", pants_cuff: "#4b3a4a", shoe: "#f4f4f4", shoe_accent: "#3b5a9a", sole: "#6c8fd8", sole_band: "#f2f2f2", hair: "#1e1d2a", acc1: "#5a6bd8", acc2: "#e3e6f2" }, skin: 3 },
  // 3 white sweater, teal scarf, bun, light jeans, pink sneakers
  { hair: "bun", outfit: "sweater", acc: "scarf", c: { top: "#f5f1ec", top_dark: "#e2dbd3", sleeve: "#f5f1ec", sleeve_stripe: "#f5f1ec", pants: "#4f78b8", pants_cuff: "#6b90c8", shoe: "#cf6178", shoe_accent: "#f2c4cc", sole: "#f1d7dc", sole_band: "#f6eef0", hair: "#6b4334", scarf: "#4fb8c4" }, skin: 0 },
  // 4 red jacket over a white tee, cap and round glasses, brown shoes
  { hair: "spiky", outfit: "jacket", acc: "cap+glasses", c: { top: "#c8564f", top_dark: "#f1ece4", sleeve: "#c8564f", sleeve_stripe: "#c8564f", inner: "#f4f1ec", pants: "#334a86", pants_cuff: "#4a62a0", shoe: "#7a5a46", shoe_accent: "#e07b39", sole: "#e28a45", sole_band: "#f2e8dc", hair: "#1c2134", acc1: "#b8343a", acc2: "#f4f1ea" }, skin: 2 },
  // 5 navy puffer vest over a mustard sweater, backpack, blue jeans, orange sneakers
  { hair: "spiky", outfit: "vest", acc: "backpack", c: { top: "#2c3b7c", top_dark: "#22306a", sleeve: "#eab949", sleeve_stripe: "#eab949", inner: "#eab949", stripe: "#eab949", pants: "#3e6aa6", pants_cuff: "#5a85c0", shoe: "#e8742f", shoe_accent: "#2c3f7a", sole: "#f1a15a", sole_band: "#f3efe9", hair: "#1c2134", pack: "#2b3b70" }, skin: 1 },
  // 6 navy vest over a striped long-sleeve shirt, grey sleeves, dark jeans
  { hair: "spiky", outfit: "vest", acc: null, c: { top: "#2f3d72", top_dark: "#26325e", sleeve: "#a5abc0", sleeve_stripe: "#8c93ab", inner: "#5a5d68", stripe: "#8d909c", pants: "#2a2d40", pants_cuff: "#3a3e56", shoe: "#3b4a6b", shoe_accent: "#6f86b8", sole: "#8fa6d8", sole_band: "#eef0f6", hair: "#1c2134" } },
  // recolours
  { hair: "bob", outfit: "hoodie", acc: "glasses", c: { top: "#f2a640", top_dark: "#d58a2a", sleeve: "#f2a640", sleeve_stripe: "#f2a640", pants: "#374062", pants_cuff: "#4a5480", shoe: "#f4f4f4", shoe_accent: "#e05a5a", sole: "#e86a6a", sole_band: "#f4f4f4", hair: "#3a2a24" } },
  { hair: "bun", outfit: "jacket", acc: "headphones", c: { top: "#4f9a8f", top_dark: "#f2e9da", sleeve: "#4f9a8f", sleeve_stripe: "#4f9a8f", inner: "#f6efe3", pants: "#2f3a5e", pants_cuff: "#43507c", shoe: "#f4f4f4", shoe_accent: "#4f9a8f", sole: "#76c2b6", sole_band: "#f4f4f4", hair: "#24202e", acc1: "#f07aa0", acc2: "#f4f4f8" } },
  { hair: "spiky", outfit: "hoodie", acc: "cap", c: { top: "#7c6cf0", top_dark: "#6556d0", sleeve: "#7c6cf0", sleeve_stripe: "#7c6cf0", pants: "#2b3360", pants_cuff: "#3d477d", shoe: "#f4f4f4", shoe_accent: "#7c6cf0", sole: "#a99cf6", sole_band: "#f4f4f4", hair: "#2b1f1a", acc1: "#26283a", acc2: "#f2f2f2" }, skin: 4 },
  { hair: "bob", outfit: "vest", acc: "scarf", c: { top: "#e56b8a", top_dark: "#c45473", sleeve: "#fdf3e7", sleeve_stripe: "#f1d9c9", inner: "#fdf3e7", stripe: "#f1d9c9", pants: "#46557f", pants_cuff: "#5b6b99", shoe: "#f5f5f5", shoe_accent: "#e56b8a", sole: "#f09ab0", sole_band: "#f5f5f5", hair: "#5a3326", scarf: "#f2c94c" } },
];

const BASE = {
  inner: "#f1e9da", stripe: "#f1e9da", sole: "#ececee", sole_band: "#f2f2f2", eye_white: "#fbfbff", iris: "#22150f", mouth: "#7a2c35",
  highlight: "#ffffff", sock: "#f4f4f4", acc1: "#c94a4a", acc2: "#f5f5f5", lens: "#17171d",
  pack: "#3b4a7a", scarf: "#5cc0c8", guitar: "#d9954a", guitar_dark: "#4a2a1a", metal: "#d2d5de",
};

export function hashId(id) {
  const s = String(id || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable look for a user id: { hair, outfit, accessories[], colors{cell: hex} }. */
export function lookFor(id) {
  const h = hashId(id);
  const preset = LOOKS[h % LOOKS.length];
  const skin = SKINS[preset.skin != null ? preset.skin : (h >>> 8) % SKINS.length];
  const colors = { ...BASE, ...skin, ...preset.c };
  colors.brows = colors.hair;
  return {
    index: h % LOOKS.length,
    hair: preset.hair,
    outfit: preset.outfit,
    accessories: preset.acc ? preset.acc.split("+") : [],
    colors,
  };
}

/** Assign looks so people in the same room get different presets where possible. */
export function looksForRoom(ids, overrides = null) {
  const used = new Set();
  const out = new Map();
  for (const id of ids) {
    const forced = overrides ? overrides[String(id)] : undefined;
    if (Number.isInteger(forced) && LOOKS[forced]) {
      out.set(String(id), { index: forced, ...pick(forced, id) });
      used.add(forced);
      continue;
    }
    let look = lookFor(id);
    if (used.has(look.index) && used.size < LOOKS.length) {
      let i = look.index;
      while (used.has(i)) i = (i + 1) % LOOKS.length;
      look = { ...lookFor(id), index: i, ...pick(i, id) };
    }
    used.add(look.index);
    out.set(String(id), look);
  }
  return out;
}

function pick(i, id) {
  const preset = LOOKS[i];
  const h = hashId(id);
  const skin = SKINS[preset.skin != null ? preset.skin : (h >>> 8) % SKINS.length];
  const colors = { ...BASE, ...skin, ...preset.c };
  colors.brows = colors.hair;
  return { hair: preset.hair, outfit: preset.outfit, accessories: preset.acc ? preset.acc.split("+") : [], colors };
}
