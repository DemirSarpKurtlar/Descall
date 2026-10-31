// One icon set (approved 2026-10-19, design/ai-look-2026-10-19/02-unified-icons):
// Phosphor Regular through components/ui/Icon.jsx, no lucide-react, no "×" close glyph,
// sparkles only where they mean "new/automatic" (06-sparkle-overuse).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs|tsx?)$/.test(n) && !/selftest|\.test\./.test(n)) files.push(p);
  }
})(src);

for (const f of files) {
  const s = readFileSync(f, "utf8");
  assert.equal(/from\s*["']lucide-react["']/.test(s), false, `${f}: import icons from components/ui/Icon.jsx, not lucide-react`);
}
const pkg = JSON.parse(readFileSync(join(src, "../package.json"), "utf8"));
assert.equal(Boolean(pkg.dependencies?.["lucide-react"]), false, "lucide-react must not come back as a dependency");

const icon = readFileSync(join(here, "Icon.jsx"), "utf8");
assert.match(icon, /from "@phosphor-icons\/react\/dist\/ssr"/);
assert.match(icon, /weight = "regular"/);

const close = readFileSync(join(here, "CloseButton.jsx"), "utf8");
assert.match(close, /weight="bold"/);
assert.match(close, /size=\{16\}/);
const closeCss = readFileSync(join(src, "styles/close-button.css"), "utf8");
assert.match(closeCss, /--ui-close-size: 32px/);
assert.match(closeCss, /44px/);
for (const f of ["components/VoiceEffectsPanel.jsx", "components/ui/Modal.jsx"]) {
  const s = readFileSync(join(src, f), "utf8");
  assert.equal(/>\s*×\s*</.test(s), false, `${f}: use <CloseButton>, not a "×" character`);
}

// 06-sparkle-overuse: these places say what they do instead of "magic".
const noSparkle = [
  "components/VideoConference.jsx", "components/VideoConferenceClean.jsx", "components/VoiceEffectsPanel.jsx",
  "components/download/DownloadPage.jsx", "site/icons.jsx",
];
for (const f of noSparkle) {
  const s = readFileSync(join(src, f), "utf8");
  assert.equal(/\bSparkles?\b|✨/.test(s), false, `${f}: no sparkle icon here (06-sparkle-overuse)`);
}
const vfx = readFileSync(join(src, "components/VoiceEffectsPanel.jsx"), "utf8");
assert.match(vfx, /alien: MaskHappy/);
assert.match(readFileSync(join(src, "components/VideoConferenceClean.jsx"), "utf8"), /<Waveform size=\{20\} \/>/);
console.log("iconSet.selftest ok");
