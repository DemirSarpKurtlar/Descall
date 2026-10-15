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

export function clearInlineAccent(root) {
  if (!root?.style) return;
  for (const prop of ACCENT_PROPS) root.style.removeProperty(prop);
}

export function applyInlineAccent(root, accentColor) {
  if (!root?.style || !accentColor) return;
  root.style.setProperty("--primary", accentColor);
  root.style.setProperty("--primary-2", accentColor);
  root.style.setProperty("--primary-soft", hexToRgba(accentColor, 0.12));
  root.style.setProperty("--primary-glow", hexToRgba(accentColor, 0.35));
  root.style.setProperty("--shadow-glow-primary", `0 0 16px ${hexToRgba(accentColor, 0.24)}`);
  root.style.setProperty("--accent", accentColor);
}

/** Sets data-theme and the accent mode together. Call this everywhere a theme is applied. */
export function applyDocumentTheme(root, theme, { accentColor } = {}) {
  if (!root) return theme || "dark";
  const next = theme || "dark";
  if (themeAccentAction(next, accentColor) === "clear") clearInlineAccent(root);
  else applyInlineAccent(root, accentColor);
  root.setAttribute("data-theme", next);
  return next;
}
