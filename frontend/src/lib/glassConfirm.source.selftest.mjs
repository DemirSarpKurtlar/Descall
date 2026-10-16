// File-only checks so CI can run this without node_modules.
// Run: node src/lib/glassConfirm.source.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name.startsWith(".")) continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|cjs)$/.test(name.name)) out.push(full);
  }
  return out;
}

const allow = new Set([
  join(root, "lib/glassConfirm.js"),
  join(root, "lib/glassConfirm.selftest.mjs"),
]);

for (const file of walk(root)) {
  if (allow.has(file)) continue;
  const text = readFileSync(file, "utf8");
  assert.doesNotMatch(text, /window\.(confirm|prompt|alert)\(/, file);
  assert.doesNotMatch(text, /(?:^|[^.\w])confirm\(/, file);
}

const alert = src("components/ui/GlassConfirm.jsx");
assert.match(alert, /scale: 1\.1/);
assert.match(alert, /SPRINGS\.materialize/);
assert.match(alert, /REDUCED_MOTION_FADE/);
assert.match(alert, /usePressFeedback/);
assert.match(alert, /role="alertdialog"/);

const css = src("styles/glass/alert.css");
assert.match(css, /width: min\(420px/);
assert.match(css, /\.g-alert-btn\.is-danger[\s\S]*color: var\(--g-red\)/);
assert.match(css, /\.g-alert-btn:active/);

const dialogs = src("styles/glass-dialogs.css");
assert.match(dialogs, /\.g-alert-btn\.is-danger/);
assert.match(dialogs, /\.report-reason-chip\.active/);
assert.match(dialogs, /\.report-btn\.danger/);
assert.match(src("styles.css"), /glass-dialogs\.css/);

assert.match(src("lib/glassConfirm.js"), /typeof present === "function"/);
assert.match(src("lib/blockedUsers.js"), /confirmAction/);
assert.match(src("components/chat/MessageList.jsx"), /<GlassConfirm/);
assert.match(src("components/layout/ServerSidebar.jsx"), /<GlassConfirm/);
assert.match(src("components/social/ReportUserModal.jsx"), /SPRINGS\.materialize/);

console.log("glassConfirm.source.selftest ok");
