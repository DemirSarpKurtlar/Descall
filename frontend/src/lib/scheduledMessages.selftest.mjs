// Selftest: scheduled sending, client side (messaging phase 4).
//   node frontend/src/lib/scheduledMessages.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.TZ = "Europe/Istanbul";
const s = await import("./scheduledMessages.js");

// Presets, local clock. Thursday 2026-11-05 15:10.
const thu = new Date(2026, 10, 5, 15, 10);
let p = s.schedulePresets(thu);
assert.deepEqual(p.map((x) => x.id), ["1h", "tonight", "tomorrow", "monday"]);
assert.equal(p[0].at.getTime(), thu.getTime() + 3600e3);
assert.equal(p[1].at.getHours(), 21);
assert.deepEqual([p[2].at.getDate(), p[2].at.getHours(), p[2].at.getMinutes()], [6, 9, 0], "tomorrow 09:00");
assert.deepEqual([p[3].at.getDay(), p[3].at.getDate(), p[3].at.getHours()], [1, 9, 9], "next Monday 09:00");
// Late evening: no "tonight"; Sunday: tomorrow is Monday, so no separate Monday chip.
p = s.schedulePresets(new Date(2026, 10, 5, 20, 45));
assert.ok(!p.some((x) => x.id === "tonight"), "less than 30 minutes before 21:00");
p = s.schedulePresets(new Date(2026, 10, 8, 10, 0));
assert.ok(!p.some((x) => x.id === "monday"), "Sunday: tomorrow already is Monday morning");

// datetime-local round trip and the one-minute floor.
assert.equal(s.toLocalInput(new Date(2026, 10, 6, 9, 5)), "2026-11-06T09:05");
assert.equal(s.fromLocalInput("2026-11-06T09:05").getTime(), new Date(2026, 10, 6, 9, 5).getTime());
assert.equal(s.fromLocalInput("nope"), null);
const now = Date.now();
assert.equal(s.validSendAt(new Date(now + 30e3), now), false);
assert.equal(s.validSendAt(new Date(now + 120e3), now), true);

// Targets.
assert.deepEqual(s.scheduleTarget({ activeDmUser: { id: "u1", username: "ayse", displayName: "Ayşe" } }), { convType: "dm", convId: "u1", name: "Ayşe" });
assert.deepEqual(s.scheduleTarget({ activeGroup: { id: "g1", name: "Ekip" } }), { convType: "group", convId: "g1", name: "Ekip" });
assert.deepEqual(s.scheduleTarget({ activeChannel: { id: "c1", name: "genel" }, activeServer: { id: "s1" } }), { convType: "channel", convId: "c1", serverId: "s1", name: "#genel" });
assert.equal(s.scheduleTarget({}), null);

// Pending store: only pending items, sorted, updated by server events.
let pings = 0;
const off = s.subscribeScheduled(() => { pings += 1; });
s.setScheduled([
  { id: "b", status: "pending", convType: "dm", convId: "u1", sendAt: "2026-11-06T10:00:00Z" },
  { id: "a", status: "pending", convType: "dm", convId: "u1", sendAt: "2026-11-06T09:00:00Z" },
  { id: "x", status: "sent", convType: "dm", convId: "u1", sendAt: "2026-11-06T08:00:00Z" },
]);
assert.deepEqual(s.getScheduledSnapshot().map((x) => x.id), ["a", "b"]);
s.applyScheduled({ id: "a", status: "sent" });
assert.deepEqual(s.getScheduledSnapshot().map((x) => x.id), ["b"], "sent leaves the list");
s.applyScheduled({ id: "c", status: "pending", convType: "group", convId: "g1", sendAt: "2026-11-06T08:30:00Z" });
assert.deepEqual(s.pendingFor(s.getScheduledSnapshot(), "dm", "u1").map((x) => x.id), ["b"]);
assert.equal(pings, 3);
off();

// Wiring: composer entry points and pill, host loads the list and follows scheduled:update.
const here = dirname(fileURLToPath(import.meta.url));
const composer = readFileSync(join(here, "../components/chat/MessageComposer.jsx"), "utf8");
assert.ok(composer.includes('data-testid="attach-schedule"'), "+ menu: Zamanla gönder");
assert.ok(/onContextMenu=\{\(e\) => \{\s*if \(editing \|\| !schedTarget \|\| !message\.trim\(\) \|\| pendingAttach\) return;/.test(composer), "right click on Send");
assert.ok(composer.includes("}, 520);"), "long press on Send (touch)");
assert.ok(composer.includes('data-testid="composer-scheduled"'));
assert.ok(composer.includes("if (e?.detail?.draftKey && e.detail.draftKey === draftKeyRef.current) setMessage(\"\");"), "scheduled text leaves the field (and its draft)");
const host = readFileSync(join(here, "../components/chat/ChatSheetsHost.jsx"), "utf8");
assert.ok(host.includes('api("/api/scheduled-messages")') && host.includes('socket.on("scheduled:update", onScheduled)'));
assert.ok(host.includes('lazy(() => import("./ScheduleSheet.jsx"))'));

console.log("scheduledMessages selftest OK");
