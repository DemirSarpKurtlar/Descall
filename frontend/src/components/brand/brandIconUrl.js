/**
 * Konsept 2 Descall mark (Bağlı Geometri, #393C4D / #587AF5).
 * Shipped from `frontend/public/brand/` (copied into dist/brand/).
 *
 * The rounded tile is `descall-icon.png`. Wordmarks use `descall-lockup.svg`
 * (the designed desc·all lockup, not an icon plus the word Descall).
 * At 32px and below, use `descall-icon-small.png`.
 *
 * Do NOT Vite-import a hashed image module. Electron builds use `base: "./"`
 * + IIFE, and Vite rewrites those imports to
 * `new URL(file, document.currentScript.src || document.baseURI)`. The
 * injected script used to stay `type="module"`, so `currentScript` was null
 * and the URL resolved to `dist/<hash>.jpeg` instead of `dist/assets/<hash>.jpeg`
 * → broken-image mountain in titlebar, nav rail, and AuthView.
 *
 * `import.meta.env.BASE_URL` is replaced at build time (`"/"` web, `"./"`
 * Electron). Keep these plain templates — wrapping `import.meta` in
 * `typeof` checks breaks Vite's IIFE rewrite.
 */
function brandFile(name) {
  return `${import.meta.env.BASE_URL}brand/${name}`;
}

export function brandIconUrl() {
  return brandFile("descall-icon.png");
}

export function brandIconSmallUrl() {
  return brandFile("descall-icon-small.png");
}

export function brandLockupUrl() {
  return brandFile("descall-lockup.svg");
}

export default brandIconUrl;
