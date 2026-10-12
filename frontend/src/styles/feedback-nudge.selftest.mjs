import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "feedback-nudge.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const banner = readFileSync(join(here, "../components/feedback/FeedbackNudgeBanner.jsx"), "utf8");

assert.match(
  styles,
  /@import '\.\/styles\/conv-rows\.css';\s*@import '\.\/styles\/feedback-nudge\.css';/
);
assert.equal(css.includes("translateX(-50%)"), false);
assert.match(css, /margin-inline:\s*auto/);
assert.match(css, /transform:\s*none/);
assert.match(css, /white-space:\s*normal/);
assert.match(css, /-webkit-line-clamp:\s*unset/);
assert.match(css, /backdrop-filter:\s*blur\(22px\)/);
assert.doesNotMatch(css, /#5865f2|#4752c4|#6a5cff/);
assert.match(banner, /type:\s*"spring"/);
assert.match(banner, /stiffness:\s*380/);
assert.match(banner, /damping:\s*26/);
assert.match(banner, /y:\s*-72/);
assert.equal(banner.includes("translateX"), false);

console.log("feedback-nudge.selftest ok");
