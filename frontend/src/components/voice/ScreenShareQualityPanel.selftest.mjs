/**
 * Screen-share quality panel, design A (3.7.15, owner pick): "What are you sharing?"
 * (3 tall segments), resolution and frame rate segments, a bitrate summary and one
 * button. No coloured preset cards. Same quality object and callbacks as before.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(dir, "ScreenShareQualityPanel.jsx"), "utf8");
const css = readFileSync(join(dir, "../../styles/screen-share-quality.css"), "utf8");
const styles = readFileSync(join(dir, "../../styles.css"), "utf8");
const frost = readFileSync(join(dir, "../../styles/frost.css"), "utf8");
const tr = readFileSync(join(dir, "../../i18n/locales/tr.js"), "utf8");
const en = readFileSync(join(dir, "../../i18n/locales/en.js"), "utf8");

const failures = [];
const expect = (cond, message) => {
  if (!cond) failures.push(message);
};

// Old design is gone: no preset card grid, no accent tiles, no chips row, no advanced fold.
for (const gone of ["PRESET_CARDS", "ssq-card", "ssq-grid", "ssq-chips", "ssq-advanced", "accent:", "ssq-mark", "Sparkles"]) {
  expect(!jsx.includes(gone), `old design removed: ${gone}`);
  expect(!css.includes(gone === "accent:" ? "--ssq-accent" : gone), `old css removed: ${gone}`);
}

// New structure.
for (const token of [
  "CONTENT_CHOICES",
  'value: "motion", icon: Gamepad2, labelKey: "Games, video"',
  'value: "detail", icon: Layout, labelKey: "Apps"',
  'value: "text", icon: Type, labelKey: "Text, code"',
  'className="ssq-seg is-tall" role="radiogroup"',
  't("What are you sharing?")',
  't("Resolution")',
  't("Frame rate")',
  'className="ssq-sum"',
  't("about {mbps} Mbps", { mbps: formatMbps(mbps, locale) })',
  't("Start sharing")',
  't("Screen share")',
  't("Pick the quality before you share")',
  't("Live, changes will restart sharing")',
  't("Applying…")',
  't("Settings applied")',
  'role="radio"',
  "aria-checked={on}",
  // Kept behaviour.
  "pickContent",
  "pickResolution",
  "pickFps",
  "onStartWithQuality",
  "onRestartWithQuality",
  "usePressFeedbackScope",
  "useIsNarrowViewport",
  "meshWarning",
  'e.key === "Escape"',
]) {
  expect(jsx.includes(token), `jsx has ${token}`);
}
expect(jsx.trimEnd().endsWith("}"), "component file is closed");

// Pure helpers.
const helperSrc = jsx.slice(jsx.indexOf("export function fpsSegments"), jsx.indexOf("export default function"));
const presets = { text: { id: "text", resolution: "1080p", fps: 20, contentHint: "detail" } };
const mod = new Function("SCREEN_QUALITY_PRESETS", `${helperSrc.replace(/export /g, "")}; return { fpsSegments, qualityForContent, formatMbps };`)(presets);
const RES = ["480p", "720p", "1080p", "1440p"].map((value) => ({ value }));
const FPS = [15, 20, 24, 30, 60].map((value) => ({ value, label: String(value) }));
expect(JSON.stringify(mod.fpsSegments(FPS, 30).map((f) => f.value)) === "[15,20,30,60]", "fps segments 15/20/30/60");
expect(JSON.stringify(mod.fpsSegments(FPS, 24).map((f) => f.value)) === "[15,20,24,30,60]", "a saved 24 stays reachable");
let q = mod.qualityForContent("text", { resolution: "720p", fps: 60, contentHint: "motion" }, RES, FPS);
expect(q.resolution === "1080p" && q.fps === 20 && q.contentHint === "text", "text → 1080p 20");
q = mod.qualityForContent("detail", { resolution: "480p", fps: 30 }, RES, FPS);
expect(q.resolution === "1080p" && q.fps === 30 && q.contentHint === "detail", "apps → 1080p 30 when it was 30+");
q = mod.qualityForContent("detail", { resolution: "480p", fps: 20 }, RES, FPS);
expect(q.fps === 24, "apps → 24 when it was below 30");
q = mod.qualityForContent("motion", { resolution: "720p", fps: 20, contentHint: "text" }, RES, FPS);
expect(q.resolution === "720p" && q.fps === 30 && q.contentHint === "motion", "motion keeps res, raises to 30");
q = mod.qualityForContent("motion", { resolution: "1440p", fps: 60 }, RES.slice(0, 3), FPS.filter((f) => f.value <= 24));
expect(q.resolution === "1080p" && q.fps === 24, "group limits clamp the pick");
expect(mod.formatMbps(4.4, "tr") === "4,4" && mod.formatMbps(4.4, "en") === "4.4", "decimal comma in Turkish");

// Styles.
expect(css.includes(".ssq-seg > button.is-on"), "raised selected segment");
expect(css.includes(".ssq-seg.is-tall > button"), "tall content segments");
expect(css.includes("mask-composite: exclude"), "hairline specular edge");
expect(css.includes(':root[data-theme="light"] .ssq-pop'), "light theme ink");
expect(css.includes("html.a11y-solid .ssq-sheet"), "opaque under Reduce Transparency");
expect(css.includes("prefers-reduced-motion: reduce"), "reduced motion");
expect(css.includes(":focus-visible"), "focus rings");
expect(!/linear-gradient\([^)]*#[0-9a-f]{6}/i.test(css.slice(css.indexOf(".ssq-seg"))), "no coloured gradients on options");
expect(frost.includes(".ssq-pop, .ssq-sheet"), "still a frost.css surface");
expect(styles.includes("@import './styles/screen-share-quality.css';"), "styles.css imports the sheet");
expect(styles.indexOf("screen-share-quality.css") < styles.indexOf("glass/index.css"), "glass import order stays last");
for (const k of ["What are you sharing?", "Games, video", "Apps", "Text, code", "about {mbps} Mbps", "Start sharing", "Pick the quality before you share"]) {
  expect(tr.includes(`"${k}":`) && en.includes(`"${k}":`), `locale key ${k}`);
}
expect(tr.includes('"Start sharing": "Paylaşmaya başla"') && tr.includes('"What are you sharing?": "Ne paylaşıyorsun?"'), "Turkish copy");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ScreenShareQualityPanel.selftest ok");
