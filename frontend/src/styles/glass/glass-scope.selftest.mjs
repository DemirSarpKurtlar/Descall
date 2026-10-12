// Liquid Glass CSS must never leak to desktop / web / Android (2.9.151).
// Every selector in src/styles/glass/*.css is scoped under html.glass-ui, and the
// generated theme file is current. Run: node src/styles/glass/glass-scope.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../../../scripts/generate-glass-themes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".css"));
assert.ok(files.includes("tokens.css") && files.includes("material.css") && files.includes("auth.css"));

function selectors(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let buf = "";
  const stack = [];
  for (const ch of src) {
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      const atRule = head.startsWith("@");
      // Inside a keyframes block the "selectors" are offsets, not elements.
      const inKeyframes = stack.some((h) => /^@(-webkit-)?keyframes/.test(h));
      if (!atRule && !inKeyframes) out.push(head);
      stack.push(head);
      depth++;
    } else if (ch === "}") {
      stack.pop();
      depth--;
      buf = "";
    } else if (ch === ";" ) {
      buf = "";
    } else {
      buf += ch;
    }
  }
  assert.equal(depth, 0, "balanced braces");
  return out;
}

let count = 0;
for (const f of files) {
  const css = readFileSync(join(here, f), "utf8");
  for (const group of selectors(css)) {
    for (const sel of group.split(",").map((s) => s.trim()).filter(Boolean)) {
      count++;
      assert.ok(/^html\.glass-ui(?=[\s.[:#:>]|$)/.test(sel), `${f}: unscoped selector "${sel}"`);
    }
  }
  assert.ok(!/@import\s+url\(\s*['"]?https?:/i.test(css), `${f}: no remote imports`);
}
assert.ok(count > 100, `found ${count} selectors`);

// themes.css is generated from design-tokens.css and must be current.
const tokensCss = readFileSync(join(here, "..", "design-tokens.css"), "utf8");
assert.equal(readFileSync(join(here, "themes.css"), "utf8"), generate(tokensCss), "themes.css is stale: run node scripts/generate-glass-themes.mjs");

// Mockup-exact dark defaults (final/src/glass.css).
const tokens = readFileSync(join(here, "tokens.css"), "utf8");
for (const exact of [
  "--g-brand: #587AF6",
  "--g-brand-hi: #8FA6FF",
  "--g-deep: #0D0E13",
  "--g-t1: rgba(255,255,255,0.96)",
  "--g-t2: rgba(235,238,255,0.72)",
  "--g-t3: rgba(235,238,255,0.46)",
]) {
  assert.ok(tokens.includes(exact), `tokens.css keeps ${exact}`);
}
assert.match(
  tokens,
  /html\.glass-ui:not\(\.native-app\)[\s\S]*--g-chrome-top: calc\(var\(--g-safe-top\) \+ var\(--g-frame-clear\)\)/,
  "phone web chrome clears the frame and the Island"
);

// Glass loads after every legacy sheet. Desktop glass follows it. Auth fields
// follow desktop glass. Admin liquid glass follows auth fields. The activity
// card sheet follows admin glass. Conversation rows load last so list
// alignment beats the absolute more button.
const styles = readFileSync(join(here, "..", "..", "styles.css"), "utf8");
const imports = [...styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
const glassAt = imports.indexOf("./styles/glass/index.css");
const desktopAt = imports.indexOf("./styles/glass-desktop/index.css");
const authAt = imports.indexOf("./styles/auth-fields.css");
const adminAt = imports.indexOf("./styles/admin-liquid.css");
const activityAt = imports.indexOf("./styles/activity-card.css");
const convAt = imports.indexOf("./styles/conv-rows.css");
assert.ok(glassAt > 0, "glass sheet imported");
assert.ok(desktopAt > glassAt, "desktop glass follows iphone glass");
assert.equal(authAt, desktopAt + 1, "auth fields follow desktop glass");
assert.equal(adminAt, authAt + 1, "admin liquid glass follows auth fields");
assert.equal(activityAt, adminAt + 1, "activity card follows admin liquid glass");
assert.equal(convAt, activityAt + 1, "conversation rows follow the activity card");
assert.equal(imports[imports.length - 1], "./styles/conv-rows.css", "conversation rows imported last");

console.log(`glass-scope.selftest ok (${count} selectors)`);
