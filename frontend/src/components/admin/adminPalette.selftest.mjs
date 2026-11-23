// Admin colour vocabulary (color sweep, Nov 2026): one status palette and one chart
// palette for every admin tab, readable on the dark admin glass, and no leftover iOS
// system / Tailwind default colours in the admin styles or models.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHART, CHART_PAIRS, STATUS } from "./adminPalette.js";

const here = dirname(fileURLToPath(import.meta.url));
const styles = join(here, "../../styles");

function lum(hex) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SURFACE = "#1b1d26"; // admin standalone base (admin-shell.css)
for (const k of ["okInk", "warnInk", "badInk", "infoInk"]) {
  assert.ok(ratio(STATUS[k], SURFACE) >= 4.5, `STATUS.${k} is readable text on the admin surface`);
}
for (const k of ["ok", "warn", "bad", "info", "neutral"]) {
  assert.ok(ratio(STATUS[k], SURFACE) >= 3, `STATUS.${k} is a visible mark on the admin surface`);
}
for (const c of CHART) assert.ok(ratio(c, SURFACE) >= 3, `chart colour ${c} is a visible mark`);
assert.equal(CHART[0], "#587af5", "charts lead with the brand blue");
assert.equal(new Set(CHART).size, CHART.length, "chart colours are distinct");
assert.equal(CHART_PAIRS.length, CHART.length);

// The growth charts keep literal hexes (their selftest evaluates the source alone): same palette.
const growth = readFileSync(join(here, "growth/GrowthCharts.jsx"), "utf8");
assert.match(growth, new RegExp(`SERIES_A = "${CHART[0]}"`));
assert.match(growth, new RegExp(`SERIES_B = "${CHART[6]}"`));

// The shell status vars are the same inks.
const shell = readFileSync(join(styles, "admin-shell.css"), "utf8");
assert.match(shell, new RegExp(`--adm-ok: ${STATUS.okInk};`));
assert.match(shell, new RegExp(`--adm-warn: ${STATUS.warnInk};`));
assert.match(shell, new RegExp(`--adm-bad: ${STATUS.badInk};`));

// No iOS system colours or Tailwind / Bootstrap defaults in the admin styles and models.
const BANNED = /#(0a84ff|30d158|ff453a|ffd60a|ff9f0a|bf5af2|ff6961|64d2ff|5856d6|34d399|fbbf24|f87171|fca5a5|fcd34d|86efac|6ee7b7|ef4444|f59e0b|22c55e|3b82f6|a78bfa|8b5cf6|ec4899|5865f2|007bff|0d6efd|1e90ff)\b/i;
const cssFiles = readdirSync(styles)
  .filter((f) => /^(admin-.*|suspicious|premium-admin|maintenance)\.css$/.test(f))
  .map((f) => join(styles, f));
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|css)$/.test(e.name) && !/selftest/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...cssFiles, ...walk(here)];
assert.ok(files.length > 40, "scanned the admin files");
// A var(--app-token, #fallback) fallback is fine: the app token wins.
const FALLBACK = /var\(--[a-z0-9-]+,\s*#[0-9a-f]{3,8}\)/gi;
const hits = [];
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (BANNED.test(line.replace(FALLBACK, ""))) hits.push(`${f.replace(join(here, "../.."), "src")}:${i + 1}: ${line.trim().slice(0, 110)}`);
  });
}
assert.deepEqual(hits, [], `off-palette colours in admin:\n${hits.join("\n")}`);

// Buttons: one gradient per role (primary, primary hover, danger, danger hover, amber, green),
// and focus-ring fallbacks are the logo blue (not Tailwind indigo or Discord blurple).
const BTN_OK = new Set(["#6788ff, #587af5", "#7896ff, #6283f7", "#f4555a, #e5383c", "#f8676b, #ec4549", "#ffbd59, #f2a93b", "#28a862, #1e9655"]);
const btnHits = [];
for (const f of cssFiles) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/99, 102, 241|88, 101, 242/.test(line)) btnHits.push(`${f}:${i + 1} focus fallback`);
    if (!/btn|button/.test(line) || /spark|bar-fill|revbar|tl-now/.test(line)) return;
    for (const m of line.matchAll(/linear-gradient\(180deg, (#[0-9a-f]{6}, #[0-9a-f]{6})\)/gi)) {
      if (!BTN_OK.has(m[1].toLowerCase())) btnHits.push(`${f}:${i + 1} ${m[1]}`);
    }
  });
}
assert.deepEqual(btnHits, [], `admin button colours outside the set:\n${btnHits.join("\n")}`);

console.log("adminPalette selftest ok");
