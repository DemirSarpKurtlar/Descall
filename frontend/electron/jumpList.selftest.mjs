/**
 * Run: node frontend/electron/jumpList.selftest.mjs
 * 4.2 Windows taskbar jump list: state from the page, the categories for app.setJumpList,
 * and the command line a jump list entry starts Descall with.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const jl = require("./jumpList.cjs");
const here = dirname(fileURLToPath(import.meta.url));

const labels = { newMessage: "Yeni mesaj", friends: "Arkadaşlar", online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız etme", invisible: "Görünmez", recent: "Son sohbetler", tasks: "Görevler", status: "Durum", openChat: "{name} ile sohbeti aç" };
const state = jl.normalizeJumpListState({
  signedIn: true,
  labels: { ...labels, newMessage: "Yeni\nmesaj\u0007" },
  recent: [
    { username: "ayse", name: "Ayşe" },
    { username: "ayse", name: "dup" },
    { username: "bad name", name: "x" },
    { username: "b1" }, { username: "b2" }, { username: "b3" }, { username: "b4" }, { username: "b5" },
  ],
});
assert.equal(state.labels.newMessage, "Yeni mesaj", "control characters become spaces, one line");
assert.deepEqual(state.recent.map((r) => r.username), ["ayse", "b1", "b2", "b3", "b4"], "valid, unique, at most 5");
assert.equal(state.recent[1].name, "b1", "name falls back to the username");
assert.equal(jl.normalizeJumpListState({}).labels.recent, "recent", "a missing label shows its key, never empty");

const cats = jl.buildJumpList(state, { exePath: "C:\\Program Files\\Descall\\Descall.exe" });
assert.equal(cats[0].type, "tasks");
const tasks = cats[0].items.filter((i) => i.type === "task");
assert.deepEqual(tasks.map((t) => t.args), [
  "--descall-task=newMessage", "--descall-task=friends",
  "--descall-task=status:online", "--descall-task=status:idle", "--descall-task=status:dnd", "--descall-task=status:invisible",
]);
assert.equal(tasks[4].title, "Durum: Rahatsız etme");
assert.ok(cats[0].items.some((i) => i.type === "separator"));
assert.equal(cats[1].type, "custom");
assert.equal(cats[1].name, "Son sohbetler");
assert.equal(cats[1].items[0].args, "--descall-task=dm:ayse");
assert.equal(cats[1].items[0].description, "Ayşe ile sohbeti aç");
for (const c of cats) for (const i of c.items) if (i.type === "task") assert.equal(i.program, "C:\\Program Files\\Descall\\Descall.exe");
assert.equal(jl.buildJumpList({ ...state, signedIn: false }, { exePath: "x" }), null, "signed out: Windows' own list");
assert.equal(jl.buildJumpList(jl.normalizeJumpListState({ signedIn: true }), { exePath: "x" }).length, 1, "no recent chats: tasks only");

// Command lines: only what buildJumpList writes.
assert.deepEqual(jl.parseJumpTask(["Descall.exe", "--descall-task=newMessage"]), { action: "newMessage" });
assert.deepEqual(jl.parseJumpTask(["Descall.exe", "--descall-task=status:dnd"]), { action: "status", arg: "dnd" });
assert.equal(jl.parseJumpTask(["--descall-task=status:busy"]), null);
assert.deepEqual(jl.parseJumpTask(["--descall-task=dm:ay%C5%9Fe"]), { action: "open", path: "/direct/ay%C5%9Fe" });
assert.equal(jl.parseJumpTask(["--descall-task=dm:..%2F..%2Fadmin"]), null, "path tricks refused");
assert.equal(jl.parseJumpTask(["--descall-task=dm:%E0%A4%A"]), null, "bad encoding refused");
assert.equal(jl.parseJumpTask(["--descall-task=quit"]), null);
assert.equal(jl.parseJumpTask(["Descall.exe"]), null);
assert.equal(jl.parseJumpTask(null), null);
for (const t of tasks) assert.ok(jl.parseJumpTask(["x", t.args]), `round trip ${t.args}`);
assert.ok(jl.parseJumpTask(["x", cats[1].items[0].args]), "recent round trip");

// Wiring: main sets the list on Windows only, hands tasks to the page; preload exposes it.
const main = readFileSync(join(here, "main.cjs"), "utf8");
assert.match(main, /trustedOn\('jumplist:set'/);
assert.match(main, /process\.platform !== 'win32'/);
assert.match(main, /app\.setJumpList\(jumpList\.buildJumpList\(/);
assert.match(main, /deliverJumpTask\(jumpList\.parseJumpTask\(argv\)\)/, "second instance hands the task over");
assert.match(main, /trustedHandle\('jumplist:take'/, "cold start keeps the task for the page");
const preload = readFileSync(join(here, "preload.cjs"), "utf8");
for (const fn of ["setJumpList", "takeJumpListAction", "onJumpListAction"]) assert.match(preload, new RegExp(`${fn}:`));
console.log("jumpList selftest ok");
