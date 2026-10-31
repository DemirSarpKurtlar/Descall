/**
 * Profile card colours (shop category `profile_color`, 3.7.10).
 *
 * One equipped colour repaints the grey body of the profile card (glass
 * sheet / form, the classic card and the hover card). Every colour is dark
 * enough for white text. The palette lives only here: the shop item carries
 * the key (`effect_key`), the card reads `--pc-a` / `--pc-b` / `--pc-accent`
 * from `profileColorStyle`, and styles/profile-color.css paints with them.
 */

export const PROFILE_COLOR_CATEGORY = "profile_color";

/** key → [top, bottom, accent, angle in deg]. */
export const PROFILE_COLORS = Object.freeze({
  ocean: ["#0f3d63", "#0a1a2e", "#4aa8ff", 180],
  emerald: ["#0e5640", "#08231b", "#3ddc97", 180],
  ruby: ["#6a1428", "#2a0910", "#ff5c7a", 180],
  amethyst: ["#45207a", "#1a0d33", "#b78cff", 180],
  midnight: ["#18214a", "#080b1c", "#7d8dff", 180],
  graphite: ["#34373e", "#151619", "#c3c8d4", 180],
  rose: ["#6b2748", "#2b0f1e", "#ff8fc2", 180],
  forest: ["#2a4a1f", "#0f1f0b", "#8fd16a", 180],
  copper: ["#6b3a17", "#2b160a", "#ff9d5c", 180],
  glacier: ["#1d5566", "#0b2329", "#7fe3ff", 180],
  lavender: ["#524685", "#211c3b", "#c7b8ff", 180],
  sunset: ["#7a3220", "#2e1030", "#ffb36b", 165],
  aurora: ["#0f5a5e", "#3b1d6e", "#6cf5d6", 155],
  gold: ["#6b5212", "#2a1f06", "#ffd25c", 180],
  obsidian: ["#121216", "#030304", "#9aa0ad", 180],
});

export function profileColorKey(source) {
  const key = source && typeof source === "object" ? source.equippedProfileColor?.effect_key ?? source.effect_key : source;
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(PROFILE_COLORS, key) ? key : null;
}

/** CSS custom properties for a key / item / user, or null when none is equipped. */
export function profileColorStyle(source) {
  const key = profileColorKey(source);
  if (!key) return null;
  const [a, b, accent, angle] = PROFILE_COLORS[key];
  return { "--pc-a": a, "--pc-b": b, "--pc-accent": accent, "--pc-angle": `${angle}deg` };
}

/** "has-pcolor" when a colour is equipped, else "". */
export function profileColorClass(source) {
  return profileColorKey(source) ? "has-pcolor" : "";
}

/** CSS background for a swatch (shop card, purchase preview). */
export function profileColorSwatch(source) {
  const key = profileColorKey(source);
  if (!key) return null;
  const [a, b, , angle] = PROFILE_COLORS[key];
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`;
}
