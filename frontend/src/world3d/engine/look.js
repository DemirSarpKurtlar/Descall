/**
 * Avatar looks (phase 1, no customisation panel yet): every user gets a stable
 * outfit from their id, modelled on the approved character sheet (scene-5.jpg).
 * Palette cells mirror tools/world3d/build_character.py CELLS.
 */

export const CELLS = {
  skin: 0, top: 1, top_dark: 2, inner: 3, pants: 4, pants_cuff: 5,
  shoe: 6, sole: 7, shoe_accent: 8, hair: 9, eye_white: 10, iris: 11,
  mouth: 12, brows: 13, acc1: 14, acc2: 15, highlight: 16, sock: 17,
  nose: 18, lens: 19,
};

const SKINS = [
  { skin: "#f4bf9a", nose: "#eca883" },
  { skin: "#eaa77f", nose: "#df946c" },
  { skin: "#d8956c", nose: "#c9825a" },
  { skin: "#f6c9a8", nose: "#efb08f" },
  { skin: "#b97a54", nose: "#a86b47" },
];

// The six characters of the approved sheet, then a few recolours.
export const LOOKS = [
  { hair: "spiky", outfit: "hoodie", acc: null, c: { top: "#e4e6ec", top_dark: "#c5c8d2", pants: "#2b3360", pants_cuff: "#3d477d", shoe: "#f2f2f2", shoe_accent: "#3f7f62", hair: "#1c2134" } },
  { hair: "bob", outfit: "jacket", acc: "headphones", c: { top: "#2c3f8a", top_dark: "#22326f", inner: "#efe2cc", pants: "#3a2c38", pants_cuff: "#4b3a48", shoe: "#f3f3f3", shoe_accent: "#2e4f8f", hair: "#1e1d2a", acc1: "#5a6bd8", acc2: "#e8e9f2" } },
  { hair: "bun", outfit: "hoodie", acc: null, c: { top: "#f3eee9", top_dark: "#d9d2cb", pants: "#4a6fae", pants_cuff: "#6687c0", shoe: "#c2536b", shoe_accent: "#f0c0c8", hair: "#6b4636" } },
  { hair: "spiky", outfit: "jacket", acc: "cap+glasses", c: { top: "#c8564f", top_dark: "#a5443f", inner: "#f2efe9", pants: "#334a86", pants_cuff: "#4a62a0", shoe: "#7a5a46", shoe_accent: "#e07b39", hair: "#1c2134", acc1: "#b8343a", acc2: "#f4f1ea" }, skin: 2 },
  { hair: "spiky", outfit: "jacket", acc: null, c: { top: "#2d3d82", top_dark: "#22306a", inner: "#f0c75a", pants: "#3d6aa8", pants_cuff: "#5a85c0", shoe: "#e8742f", shoe_accent: "#2c3f7a", hair: "#1c2134" } },
  { hair: "spiky", outfit: "jacket", acc: null, c: { top: "#9aa3c4", top_dark: "#7c84a6", inner: "#55565e", pants: "#2a2d40", pants_cuff: "#3a3e56", shoe: "#3b4a6b", shoe_accent: "#6f86b8", hair: "#1c2134" } },
  { hair: "bob", outfit: "hoodie", acc: "glasses", c: { top: "#f2a640", top_dark: "#d58a2a", pants: "#374062", pants_cuff: "#4a5480", shoe: "#f2f2f2", shoe_accent: "#e05a5a", hair: "#3a2a24" } },
  { hair: "bun", outfit: "jacket", acc: "headphones", c: { top: "#4f9a8f", top_dark: "#3e7d74", inner: "#f6efe3", pants: "#2f3a5e", pants_cuff: "#43507c", shoe: "#f2f2f2", shoe_accent: "#4f9a8f", hair: "#24202e", acc1: "#f07aa0", acc2: "#f4f4f8" } },
  { hair: "spiky", outfit: "hoodie", acc: "cap", c: { top: "#7c6cf0", top_dark: "#6556d0", pants: "#2b3360", pants_cuff: "#3d477d", shoe: "#f2f2f2", shoe_accent: "#7c6cf0", hair: "#2b1f1a", acc1: "#26283a", acc2: "#f2f2f2" } },
  { hair: "bob", outfit: "jacket", acc: null, c: { top: "#e56b8a", top_dark: "#c45473", inner: "#fdf3e7", pants: "#46557f", pants_cuff: "#5b6b99", shoe: "#f5f5f5", shoe_accent: "#e56b8a", hair: "#5a3326" } },
];

const BASE = {
  inner: "#f1e9da", sole: "#ececee", eye_white: "#fbfbff", iris: "#2a1c16", mouth: "#7a2c35",
  highlight: "#ffffff", sock: "#f4f4f4", acc1: "#c94a4a", acc2: "#f5f5f5", lens: "#17171d",
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
export function looksForRoom(ids) {
  const used = new Set();
  const out = new Map();
  for (const id of ids) {
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
