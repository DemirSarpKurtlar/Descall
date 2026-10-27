// Windows flag-font detection, split out of countryFlags.js (3.0.0) so main.jsx
// can call installFlagFont() at boot without bundling the country tables into
// the marketing first-paint entry chunk (scripts/perf-budget.mjs).

/**
 * Windows (Segoe UI Emoji) draws regional-indicator pairs as two letters, so
 * flags need the bundled Twemoji flag font there. A colour pixel in a drawn
 * flag means the system font already has it.
 */
export function systemDrawsFlags() {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;
    ctx.textBaseline = "top";
    ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText("\u{1F1E8}\u{1F1ED}", 0, 0);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a > 0 && (Math.abs(r - g) > 40 || Math.abs(g - b) > 40)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Adds `html.flag-font` once when the system cannot draw flag emoji. */
export function installFlagFont() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.dataset.flagFontChecked) return root.classList.contains("flag-font");
  root.dataset.flagFontChecked = "1";
  const needs = !systemDrawsFlags();
  root.classList.toggle("flag-font", needs);
  return needs;
}
