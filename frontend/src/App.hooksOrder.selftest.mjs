// App renders early returns (boot error, session check, invite landings, sign-in) before the
// signed-in shell. A hook placed after them runs only once signed in, and React throws
// "Rendered more hooks than during the previous render" (#310) on sign-in: the whole app
// shows "Something went wrong". It happened with the draft C language-switch refetch
// (caught by the Electron boot smoke). Every top-level hook call in App must come before
// the first early return.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "App.jsx"), "utf8");

const start = src.indexOf("\nexport default function App() {");
assert.ok(start > 0, "App() found");
const end = src.indexOf("\n}\n", start);
assert.ok(end > start, "end of App() found");
const body = src.slice(start, end);

const firstReturn = body.indexOf("\n  if (bootError && !me) {");
assert.ok(firstReturn > 0, "the first early return (boot error) is still where this test expects it");

// Top-level statements of App are indented by two spaces.
const TOP_LEVEL_HOOK = /^  (?:const [^=\n]+=\s*)?(use[A-Z][A-Za-z0-9]*)\(/gm;
const after = body.slice(firstReturn);
const late = [];
for (const m of after.matchAll(TOP_LEVEL_HOOK)) {
  const line = src.slice(0, start + firstReturn + m.index).split("\n").length + 1;
  late.push(`${m[1]} at App.jsx:${line}`);
}
assert.deepEqual(late, [], `hooks after App's early returns (move them above "if (bootError && !me)"): ${late.join(", ")}`);

const before = body.slice(0, firstReturn);
const count = [...before.matchAll(TOP_LEVEL_HOOK)].length;
assert.ok(count > 50, `App's hooks are all above the early returns (${count})`);

console.log(`App.hooksOrder.selftest: ok (${count} top-level hooks, none after the early returns)`);
