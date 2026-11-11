// node src/styles/rangeInputs.selftest.mjs
// Every slider draws its own track and thumb. A bare <input type="range"> inside a styled
// field picks up the text-box padding, border and grey background (owner report: input
// sensitivity in voice settings). Use RangeSlider, a class with its own track, or one of
// the containers below that style the range themselves.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const STYLED_CONTAINERS = ["img-crop-zoom", "amp-zoom"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".jsx")) out.push(p);
  }
  return out;
}

const offenders = [];
for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  let i = src.indexOf('type="range"');
  while (i !== -1) {
    const tagStart = src.lastIndexOf("<input", i);
    const tagEnd = src.indexOf("/>", i);
    const tag = src.slice(tagStart, tagEnd);
    const before = src.slice(Math.max(0, tagStart - 600), tagStart);
    const ok = /className=/.test(tag) || STYLED_CONTAINERS.some((c) => before.includes(c)) || file.endsWith("RangeSlider.jsx");
    if (!ok) offenders.push(`${file.slice(root.length)}:${src.slice(0, i).split("\n").length}`);
    i = src.indexOf('type="range"', i + 1);
  }
}
assert.deepEqual(offenders, [], `unstyled range inputs:\n${offenders.join("\n")}`);

const settings = readFileSync(join(root, "styles/settings.css"), "utf8");
assert.ok(!/^\.us-field input,$/m.test(settings), "text-field styles in .us-field must not apply to range inputs");
assert.ok(settings.includes('.us-field input:not([type="range"])'), "settings field styles skip range inputs");

console.log("rangeInputs selftest ok");
