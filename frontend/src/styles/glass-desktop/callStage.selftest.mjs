// Calls-tab calls must open the DM, and the desktop stage must be an opaque
// surface. An undefined --gd-aurora-base-* stop made the !important background
// resolve to transparent, so the transcript showed through the tiles.
// Run: node src/styles/glass-desktop/callStage.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calls = readFileSync(join(here, "calls.css"), "utf8");
const layout = readFileSync(join(here, "../../components/layout/AppLayout.jsx"), "utf8");
const tokens = readFileSync(join(here, "tokens.css"), "utf8");

function block(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const stage = block(calls, "html.glass-desktop .call-overlay-root,");
assert.match(stage, /background-color:\s*var\(--g-base-1\)\s*!important/);
assert.match(stage, /linear-gradient\(180deg,\s*var\(--g-base-0\),\s*var\(--g-base-2\)\)/);
assert.equal(stage.includes("--gd-aurora-base-0"), false);
assert.equal(stage.includes("--gd-aurora-base-2"), false);
assert.equal(stage.includes("background:"), false);
assert.match(tokens, /--g-base-0:\s*#151724/);
assert.match(tokens, /--g-base-1:\s*#17181F/);
assert.match(tokens, /--g-base-2:\s*#101118/);
assert.equal(tokens.includes("--gd-aurora-base-0"), false);

function fnBody(source, name) {
  const start = source.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const next = source.indexOf("\n  const ", start + 10);
  return source.slice(start, next === -1 ? source.length : next);
}

const startDm = fnBody(layout, "handleStartCall");
assert.match(startDm, /if \(!user\?\.id\) return/);
assert.match(startDm, /handleOpenChatFromCalls\(user\)/);
assert.ok(
  startDm.indexOf("handleOpenChatFromCalls(user)") < startDm.indexOf("onStartCall?.(user, type)"),
  "open the DM before starting the call",
);

const startGroup = fnBody(layout, "handleStartGroupCallFromCalls");
assert.match(startGroup, /if \(!group\?\.id\) return/);
assert.match(startGroup, /handleOpenGroupFromCalls\(group\)/);
assert.ok(
  startGroup.indexOf("handleOpenGroupFromCalls(group)") < startGroup.indexOf("onStartGroupCallFromCalls?.(group, type)"),
  "open the group before starting the call",
);

const openDm = fnBody(layout, "handleOpenChatFromCalls");
assert.match(openDm, /setActiveView\("chat"\)/);
assert.match(openDm, /handleDmSelect\(user\)/);

console.log("callStage.selftest ok");
