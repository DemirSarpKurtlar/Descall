/**
 * Market 2.0 card colours (shop category `profile_color`, catalog group C2).
 *
 * Same contract as lib/profileColors.js: the shop item carries the key in
 * `effect_key`, the card reads --pc-a / --pc-b / --pc-accent / --pc-angle, and
 * every body stop keeps white text at AAA. Market 2.0 adds a mid stop (--pc-c),
 * a texture layer and, for the 16 set pieces, a name colour; both live in
 * styles/shop2-c2.css under `.pc-<key>` (profileColorClass adds that class).
 *
 * key -> [top, bottom, accent, angle in deg, mid]
 */
export const SHOP2_PROFILE_COLORS = Object.freeze({
  // Singles
  "s2-pc-midnight-velvet": ["#3a1240", "#12061a", "#e08cff", 165, "#24092c"],
  "s2-pc-deep-lagoon": ["#0b4a58", "#061826", "#5fe0e6", 180, "#08303e"],
  "s2-pc-ember-dusk": ["#5a1a10", "#1a0806", "#ff8a4a", 180, "#3a0f0a"],
  "s2-pc-forest-floor": ["#1c4026", "#08140c", "#8fe07a", 180, "#10281a"],
  "s2-pc-graphite-silk": ["#33363e", "#111216", "#d6dbe6", 150, "#202227"],
  "s2-pc-royal-indigo": ["#2a2a78", "#0c0c2c", "#ffd36a", 180, "#1a1a4e"],
  "s2-pc-oxblood": ["#5a1018", "#1e0508", "#ff7a86", 180, "#3a0a10"],
  "s2-pc-storm-slate": ["#2e3a50", "#0e121c", "#9ab8ff", 180, "#1c2434"],
  "s2-pc-aubergine-gold": ["#4a1a4a", "#160616", "#f2c440", 170, "#2e0e2e"],
  "s2-pc-polar-night": ["#0c2440", "#040c18", "#6effc7", 180, "#081830"],
  "s2-pc-cocoa": ["#4a2a1a", "#160c06", "#e6a86a", 180, "#2e1a10"],
  "s2-pc-sapphire-deep": ["#123a8a", "#060f2e", "#7fb8ff", 160, "#0c2460"],
  "s2-pc-pine-teal": ["#0e4440", "#041614", "#5ee6c8", 180, "#082c28"],
  "s2-pc-rosewood": ["#5a1e34", "#1c0810", "#ff9ac0", 175, "#3a1222"],
  "s2-pc-cosmos": ["#141a3e", "#04050e", "#c6b7ff", 180, "#0a0e26"],
  // Set pieces (name colour + card colour in the set palette)
  "s2-set-gece-limani": ["#173a72", "#0b1b3a", "#35d0e0", 180, "#10295a"],
  "s2-set-bakir-kervan": ["#5a2a12", "#2a140a", "#f0a443", 180, "#40200e"],
  "s2-set-orkide-sisi": ["#3e1a66", "#1d0f2e", "#ff6fb5", 165, "#2c1448"],
  "s2-set-kor-bahcesi": ["#5a1208", "#1a0705", "#ff6a2b", 180, "#3a0c06"],
  "s2-set-buzul-sessizligi": ["#124058", "#071a24", "#a6e7ff", 180, "#0c2c3e"],
  "s2-set-neon-carsi": ["#2a0c40", "#0a0618", "#ff2e88", 160, "#18082c"],
  "s2-set-altin-hasat": ["#4a3608", "#1b1405", "#f2c230", 180, "#30240a"],
  "s2-set-mor-sis": ["#30206a", "#120a24", "#a77bff", 180, "#201546"],
  "s2-set-gece-mercani": ["#3a1240", "#0c0a1f", "#ff8fab", 165, "#22102e"],
  "s2-set-kuzey-isigi": ["#0a3a36", "#04121c", "#6effc7", 180, "#06242a"],
  "s2-set-zumrut-orman": ["#124a2a", "#06140c", "#49d17d", 180, "#0c2e1a"],
  "s2-set-kum-saati": ["#4e3a1e", "#1f160c", "#e8cf9a", 180, "#352814"],
  "s2-set-firtina-cekirdegi": ["#2a3550", "#0a0d14", "#7aa7ff", 180, "#1a2134"],
  "s2-set-lav-akisi": ["#5a0e0e", "#120404", "#ff3d00", 180, "#360808"],
  "s2-set-inci-kiyisi": ["#2c3c46", "#0e1418", "#ffd8e4", 180, "#1c282e"],
  "s2-set-yildiz-tozu": ["#2b1f6e", "#05030f", "#ffe9a8", 170, "#160f3c"],
});

export function shop2ProfileColor(key) {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(SHOP2_PROFILE_COLORS, key)
    ? SHOP2_PROFILE_COLORS[key]
    : null;
}
