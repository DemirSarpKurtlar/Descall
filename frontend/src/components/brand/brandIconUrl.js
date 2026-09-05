/**
 * Canonical Descall mark — repo-root `Descall Icon.jpeg`, shipped as
 * `frontend/public/brand/descall-icon.jpeg` (copied into dist/brand/).
 *
 * Do NOT Vite-import the JPEG as a hashed `/assets/*.jpeg` module. Electron
 * builds use `base: "./"` + IIFE, and Vite rewrites those imports to
 * `new URL(file, document.currentScript.src || document.baseURI)`. The
 * injected script used to stay `type="module"`, so `currentScript` was null
 * and the URL resolved to `dist/<hash>.jpeg` instead of `dist/assets/<hash>.jpeg`
 * → broken-image mountain in titlebar, nav rail, and AuthView.
 *
 * `import.meta.env.BASE_URL` is replaced at build time (`"/"` web, `"./"`
 * Electron). Keep this a plain template — wrapping `import.meta` in
 * `typeof` checks breaks Vite's IIFE rewrite.
 */
export function brandIconUrl() {
  return `${import.meta.env.BASE_URL}brand/descall-icon.jpeg`;
}

export default brandIconUrl;
