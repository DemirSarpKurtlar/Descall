/**
 * Screen-share quality sheet keeps every preset and the live controls,
 * and the glass styles apply on every platform (not only html.glass-ui).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(dir, "ScreenShareQualityPanel.jsx"), "utf8");
const css = readFileSync(join(dir, "../../styles/screen-share-quality.css"), "utf8");
const styles = readFileSync(join(dir, "../../styles.css"), "utf8");

const failures = [];
const expect = (cond, message) => {
  if (!cond) failures.push(message);
};

for (const id of ["smooth", "balanced", "high", "ultra", "text"]) {
  expect(jsx.includes(`id: "${id}"`), `preset card ${id}`);
}
for (const hex of ["#34d399", "#818cf8", "#60a5fa", "#f472b6", "#fbbf24"]) {
  expect(jsx.includes(`accent: "${hex}"`), `accent ${hex}`);
}
for (const token of [
  "pickPreset",
  "pickResolution",
  "pickFps",
  "pickContentHint",
  "onStartWithQuality",
  "onRestartWithQuality",
  "usePressFeedbackScope",
  "CHECK_SPRING",
  "ssq-sheet",
  "ssq-chips",
  "ssq-slider",
  "ssq-seg is-res",
  "ssq-seg is-mode",
  "ssq-cta",
  "card.id === \"ultra\"",
]) {
  expect(jsx.includes(token), `jsx keeps ${token}`);
}
expect(jsx.trimEnd().endsWith("}"), "component file is closed");
expect(!jsx.includes("{summary}"), "old summary line is gone");
expect(css.includes("backdrop-filter: blur(40px) saturate(190%)"), "frosted sheet");
expect(css.includes("mask-composite: exclude"), "specular edge");
expect(css.includes(".ssq-card.is-on"), "selected glass border");
expect(css.includes(".ssq-cta"), "gradient share button");
expect(!css.includes("html.glass-ui") && !css.includes("html.glass-desktop"), "unscoped for every platform");
expect(
  styles.includes("@import './styles/screen-share-quality.css';"),
  "styles.css imports the sheet"
);
expect(
  styles.indexOf("screen-share-quality.css") < styles.indexOf("glass/index.css"),
  "glass import order stays last"
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ScreenShareQualityPanel.selftest ok");
