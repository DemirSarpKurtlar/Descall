// Apple Watch games (ios/App/DescallWatch/Games): static checks that need no Mac.
//  - every GL key the Swift code uses exists in GameStrings.swift in all 7 locales with the
//    same {placeholders} as English (dynamic keys: every case of their enum);
//  - no emoji anywhere in the games code (owner rule);
//  - every Swift file of the games folder is in the DescallWatch target, the pure logic
//    files have no UI imports, and the iOS CI compiles and runs selftest/games;
//  - the catalog (game ids and modes) is the same on the watch and the backend.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const games = join(root, "ios/App/DescallWatch/Games");
const logic = join(games, "Logic");
const LOCALES = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];

const strings = readFileSync(join(games, "GameStrings.swift"), "utf8");
const table = new Map();
for (const m of strings.matchAll(/^\s*"([^"]+)": \[(.*)\],\s*$/gm)) {
  const entry = {};
  for (const p of m[2].matchAll(/"([a-zA-Z-]+)": "((?:[^"\\]|\\.)*)"/g)) entry[p[1]] = p[2];
  table.set(m[1], entry);
}
assert(table.size > 150, `parsed the table (${table.size})`);

const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
for (const [key, entry] of table) {
  if (/\.(few|many)$/.test(key)) {
    assert(entry.ru, `${key}: ru form`);
    continue;
  }
  for (const id of LOCALES) assert(entry[id] && entry[id].length > 0, `${key} missing ${id}`);
  for (const id of LOCALES) assert.strictEqual(holes(entry[id]), holes(entry.en), `${key} ${id} placeholders`);
}

const swiftFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith(".swift")).map((f) => join(dir, f));
const uiFiles = swiftFiles(games);
const logicFiles = swiftFiles(logic);
const used = new Set();
for (const f of [...uiFiles, join(root, "ios/App/DescallWatch/WatchAdminViews.swift")]) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/GL\.(?:t|plural)\("([^"\\]+)"/g)) used.add(m[1]);
}
for (const k of used) {
  if (k.includes("\\(")) continue;
  const ok = table.has(k) || table.has(`${k}.other`);
  assert(ok, `GL key used but missing: ${k}`);
}

// Dynamic keys: every case of the enums behind them.
const core = readFileSync(join(logic, "GameCore.swift"), "utf8");
const ids = [...core.match(/case pong, bricks[^\n]*/)[0].replace("case ", "").split(",")].map((s) => s.trim());
assert.strictEqual(ids.length, 10, "ten games");
const need = [
  ...ids.flatMap((g) => [`genre.${g}`, `hint.${g}`]),
  "lvl.easy", "lvl.normal", "lvl.hard", "diff.easy", "diff.medium", "diff.hard",
  "snake.walls", "snake.wrap", "snake.maze", "blocks.marathon", "blocks.sprint",
  "medal.0", "medal.1", "medal.2", "medal.3", "medal.4", "speed.1", "speed.2", "speed.3",
  ..."wide multi slow life pierce sticky shield".split(" ").map((p) => `power.${p}`),
  ..."ongoing whiteMates blackMates stalemate fiftyMoves repetition material resigned".split(" ").map((r) => `chess.${r}`),
  ..."natural win push lose bust".split(" ").map((o) => `cards.${o}`),
  ..."tile eaten lines spires bricks points cleared hands".split(" ").map((g) => `goal.${g}`),
  "alert.health", "alert.errors", "alert.reports", "haptics.strong", "haptics.light", "haptics.off",
  "group.reflex", "group.puzzle", "group.table",
];
for (const k of need) assert(table.has(k), `dynamic GL key missing: ${k}`);

// No emoji (pictographs, dingbats, flags, variation selector 16) in the games code.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2B50}\u{2B55}\u{231A}-\u{231B}]/u;
for (const f of [...uiFiles, ...logicFiles]) {
  const src = readFileSync(f, "utf8");
  const hit = src.match(EMOJI);
  assert(!hit, `emoji in ${f}: ${hit && hit[0]}`);
}

// Pure logic stays free of UI frameworks (selftest/games compiles it with Foundation only).
for (const f of logicFiles) {
  const imports = [...readFileSync(f, "utf8").matchAll(/^import (\w+)/gm)].map((m) => m[1]);
  assert.deepStrictEqual(imports, ["Foundation"], `${f} imports only Foundation`);
}

// Xcode project: every games file is a source of the watch target, none in the iPhone app.
const pbx = readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
const watchPhase = pbx.match(/82340FDEB5D31210EB510E48 \/\* Sources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/)[1];
const appPhase = pbx.match(/504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/);
for (const f of [...uiFiles, ...logicFiles]) {
  const name = f.split("/").pop();
  assert(watchPhase.includes(`/* ${name} in Sources */`), `${name} compiled into DescallWatch`);
  if (appPhase) assert(!appPhase[1].includes(`/* ${name} in Sources */`), `${name} never in the iPhone / iPad app`);
}

// CI compiles and runs the games selftest on macOS.
const ci = readFileSync(join(root, "..", ".github/workflows/ios-build-check.yml"), "utf8");
assert(/swiftc[^\n]*App\/DescallWatch\/Games\/Logic\/\*\.swift[^\n]*selftest\/games\/\*\.swift/.test(ci), "ios-build-check compiles selftest/games");

// Same catalog on the backend.
const require = createRequire(import.meta.url);
const { GAMES } = require(join(root, "backend/lib/watchGames.js"));
assert.deepStrictEqual(Object.keys(GAMES).sort(), [...ids].sort(), "backend game ids");
const modesOf = (g) => {
  const m = core.match(new RegExp(`case [^\\n]*\\.${g}[^\\n]*: return (\\[[^\\]]*\\])`));
  return m ? JSON.parse(m[1]) : [""];
};
for (const g of ids) assert.deepStrictEqual(GAMES[g].modes, modesOf(g), `modes of ${g}`);

console.log(`watchGames static selftest ok (${table.size} keys, ${used.size} used, ${uiFiles.length + logicFiles.length} files)`);
