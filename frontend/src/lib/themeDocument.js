/* One document theme.
   Catalog themes own background, glass tint, accent, and text through
   [data-theme] in design-tokens.css. An inline accent on <html> beats
   that stylesheet, so buttons, letter avatars, and the glass tint stay
   on the old color while surfaces follow the theme. Dark and light are
   the only themes that keep a custom accent. */

const ACCENT_PROPS = [
  "--primary",
  "--primary-2",
  "--primary-soft",
  "--primary-glow",
  "--shadow-glow-primary",
  "--accent",
];

export function isCatalogTheme(theme) {
  return Boolean(theme) && theme !== "dark" && theme !== "light";
}

/** "clear" drops inline accent so the stylesheet theme wins. "apply" pins a custom accent on dark/light. */
export function themeAccentAction(theme, accentColor) {
  if (isCatalogTheme(theme) || !accentColor) return "clear";
  return "apply";
}

function hexToRgba(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(88, 101, 242, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Liquid Glass (html.glass-ui / html.glass-desktop) paints buttons, selected
   tabs and own bubbles from --g-brand*, so the accent pins those too. */
function hexToRgbList(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "88,122,246";
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
}

function mix(hex, other, t) {
  const a = hexToRgbList(hex).split(",").map(Number);
  const b = hexToRgbList(other).split(",").map(Number);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** The Liquid Glass accent tokens for one accent color (glass-ui + glass-desktop read --g-*). */
export function glassAccentTokens(hex, { light = false } = {}) {
  const rgb = hexToRgbList(hex);
  const hi = light ? mix(hex, "#000000", 0.22) : mix(hex, "#FFFFFF", 0.35);
  const top = mix(hex, "#FFFFFF", 0.18);
  const bot = mix(hex, "#000000", 0.06);
  return {
    "--g-brand": hex,
    "--g-brand-rgb": rgb,
    "--g-brand-hi": `rgb(${hi.join(",")})`,
    "--g-cta-top": `rgba(${top.join(",")},0.95)`,
    "--g-cta-bot": `rgba(${bot.join(",")},0.95)`,
  };
}
export const DEFAULT_GLASS_BRAND = "#587AF6";
export const GLASS_ACCENT_PROPS = Object.freeze(Object.keys(glassAccentTokens(DEFAULT_GLASS_BRAND)));

export function clearInlineAccent(root) {
  if (!root?.style) return;
  for (const prop of ACCENT_PROPS) root.style.removeProperty(prop);
  for (const prop of GLASS_ACCENT_PROPS) root.style.removeProperty(prop);
}

export function applyInlineAccent(root, accentColor, theme) {
  if (!root?.style || !accentColor) return;
  root.style.setProperty("--primary", accentColor);
  root.style.setProperty("--primary-2", accentColor);
  root.style.setProperty("--primary-soft", hexToRgba(accentColor, 0.12));
  root.style.setProperty("--primary-glow", hexToRgba(accentColor, 0.35));
  root.style.setProperty("--shadow-glow-primary", `0 0 16px ${hexToRgba(accentColor, 0.24)}`);
  root.style.setProperty("--accent", accentColor);
  // The default accent keeps the stylesheet glass tokens (exact per-theme values).
  if (String(accentColor).toUpperCase() === DEFAULT_GLASS_BRAND) {
    for (const prop of GLASS_ACCENT_PROPS) root.style.removeProperty(prop);
    return;
  }
  for (const [prop, value] of Object.entries(glassAccentTokens(accentColor, { light: theme === "light" }))) root.style.setProperty(prop, value);
}

/** Sets data-theme and the accent mode together. Call this everywhere a theme is applied. */
export function applyDocumentTheme(root, theme, { accentColor } = {}) {
  if (!root) return theme || "dark";
  const next = theme || "dark";
  if (themeAccentAction(next, accentColor) === "clear") clearInlineAccent(root);
  else applyInlineAccent(root, accentColor, next);
  root.setAttribute("data-theme", next);
  return next;
}
