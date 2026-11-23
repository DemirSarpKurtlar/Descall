/**
 * One colour vocabulary for the whole admin panel (color sweep, Nov 2026).
 *
 * STATUS: a colour means the same thing on every tab. Fills (dots, bars, rings,
 * chips with white text) use the solid tone; text and icons on the dark admin
 * glass use the matching *Ink tone (>= 4.5:1 on #1b1d26).
 * CHART: categorical series, brand blue first. Charts, legends, category dots
 * and per-game / per-scope colours all draw from this list in this order.
 * CHART_PAIRS: [top, bottom] gradient stops for bars and stacked columns.
 */
export const STATUS = Object.freeze({
  ok: "#34c77b",
  warn: "#f2a93b",
  bad: "#f23f43",
  info: "#587af5",
  neutral: "#8e93a6",
  okInk: "#6fe0a3",
  warnInk: "#ffc773",
  badInk: "#ff9a9c",
  infoInk: "#b6c4ff",
});

export const CHART = Object.freeze([
  "#587af5", // brand blue
  "#22c3a6", // teal
  "#f2a93b", // amber
  "#9b5de5", // violet
  "#e8789a", // rose
  "#3fb5e8", // sky
  "#d9823b", // orange
  "#8e93a6", // slate (other / rest)
]);

export const CHART_PAIRS = Object.freeze([
  ["#7b93ff", "#4a5fd6"],
  ["#4fd8be", "#1d9a84"],
  ["#ffc773", "#d68a1f"],
  ["#b58cff", "#7a4fd6"],
  ["#ff9ab6", "#c2557a"],
  ["#7fd0f2", "#2a8fbd"],
  ["#f0a56b", "#b5642a"],
  ["#aab0c4", "#5b6385"],
]);

/** Muted fill for the "other / rest" bucket. */
export const CHART_OTHER = "rgba(160, 166, 190, 0.45)";
