/**
 * App lock: a locked app never shows who wrote or what they wrote, and offers no quick reply.
 * Run: node frontend/electron/premium/appLockRedact.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { redactLockedNotification, LOCKED_TAG } = require("./appLockRedact.cjs");
const hooks = require("./notifyHooks.cjs");
const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const assert = (c, m) => { if (!c) { failures += 1; console.error(`FAIL ${m}`); } };

const dm = { title: "Ayşe", quickReply: { conv: "dm:1" }, options: { body: "Ayşe: gizli mesaj", tag: "dm-1", avatarUrl: "https://x/a.png", style: "toast", data: { type: "dm", from: "Ayşe", preview: "gizli mesaj", fromId: "u1" } } };
const r = redactLockedNotification(dm, { lockedText: "Yeni bildirim" });
const json = JSON.stringify(r);
assert(!json.includes("Ayşe") && !json.includes("gizli"), "no sender or text survives");
assert(!("quickReply" in r) && r.options.style === undefined, "no quick reply or toast style");
assert(r.options.tag === LOCKED_TAG && r.options.body === "Yeni bildirim" && r.options.avatarUrl === null, "one generic grouped notice");

const call = { title: "Mert", options: { tag: "call-9", requireInteraction: true, data: { type: "call", callerName: "Mert", from: "Mert", callType: "video", callId: "c9" } } };
const rc = redactLockedNotification(call);
assert(!JSON.stringify(rc).includes("Mert"), "caller name hidden");
assert(rc.options.data.type === "call" && rc.options.tag === "call-9" && rc.options.requireInteraction, "calls still ring and close by tag");

// Final filters run after ordinary ones (quick reply cannot add its field back).
const offA = hooks.register("qr", (p) => ({ ...p, quickReply: { conv: "x" } }));
const offB = hooks.registerFinal("lock", (p) => redactLockedNotification(p, { lockedText: "L" }));
const out = hooks.run({ title: "A", options: { body: "b", data: { type: "dm" } } });
assert(out && !out.quickReply && out.options.body === "L", "final filter runs last");
offA(); offB();
assert(hooks.run({ title: "A" }).title === "A", "pass-through once unregistered");

const lock = readFileSync(join(here, "features/app_lock.cjs"), "utf8");
assert(/if \(config\.enabled\) lock\('launch'\)/.test(lock), "the lock engages at launch");
assert(lock.includes("registerFinal('app_lock'"), "toasts are redacted while locked");
assert(lock.includes("hideOtherWindows()"), "other app windows are hidden while locked");

if (failures) { console.error(`appLockRedact.selftest: ${failures} failure(s)`); process.exit(1); }
console.log("appLockRedact.selftest: ok");
