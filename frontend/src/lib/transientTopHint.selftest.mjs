// node src/lib/transientTopHint.selftest.mjs
// User report (Nov 2026): in fullscreen screen-share viewing, "Click anywhere to exit
// fullscreen" sat on the bottom edge over the shared video's subtitles. The hint now shows
// at the top for 2.5 s, fades, and comes back only when the pointer enters the top strip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HINT_VISIBLE_MS, TOP_ZONE_PX, hintShouldWake } from "./transientTopHint.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

assert.equal(HINT_VISIBLE_MS, 2500);
const box = { top: 0, height: 720 };
assert.equal(hintShouldWake(10, box), true, "top strip wakes it");
assert.equal(hintShouldWake(TOP_ZONE_PX, box), true);
assert.equal(hintShouldWake(TOP_ZONE_PX + 1, box), false);
assert.equal(hintShouldWake(650, box), false, "the bottom (subtitles) never wakes it");
assert.equal(hintShouldWake(-5, box), false, "above the box");
assert.equal(hintShouldWake(50, { top: 0, height: 120 }), false, "a small tile: only its top third");
assert.equal(hintShouldWake(30, { top: 0, height: 120 }), true);
assert.equal(hintShouldWake(NaN, box), false);

const css = read("../components/ui/TransientTopHint.css");
assert.match(css, /top: calc\(14px/, "placed at the top");
assert.match(css, /bottom: auto/, "never pinned to the bottom");
assert.match(css, /pointer-events: none/, "clicks go through to exit fullscreen");
assert.match(css, /\.is-visible \{[^}]*opacity: 1/);

const comp = read("../components/ui/TransientTopHint.jsx");
assert.match(comp, /setTimeout\(\(\) => setVisible\(false\), HINT_VISIBLE_MS\)/, "fades after 2.5 s");
assert.match(comp, /addEventListener\("pointermove"/, "wakes on pointer move");

// Every exit / expand hint over a shared screen uses it.
const panel = read("../components/servers/ServerVoicePanel.jsx");
const overlay = read("../components/CallOverlay.jsx");
assert.doesNotMatch(panel, /<div className="server-voice-screen-hint/, "no fixed hint left in the voice panel");
assert.equal((panel.match(/<TransientTopHint /g) || []).length, 3, "fullscreen x2 and the tile's expand hint");
assert.doesNotMatch(overlay, /<div className="ss-pill ss-expanded-hint"/);
assert.match(overlay, /<TransientTopHint className="ss-pill ss-expanded-hint">/);

console.log("transientTopHint selftest ok");
