// Selftest: per-conversation notification options, client side (messaging phase 4).
//   node frontend/src/lib/notifyPrefs.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const np = await import("./notifyPrefs.js");

const now = Date.parse("2026-11-06T12:00:00.000Z");
assert.equal(np.effectiveLevel(null, now), "all");
assert.equal(np.effectiveLevel({ level: "none" }, now), "none");
assert.equal(np.effectiveLevel({ level: "all", mutedUntil: "2026-11-06T12:30:00.000Z" }, now), "none");
assert.equal(np.effectiveLevel({ level: "mentions", mutedUntil: "2026-11-06T11:59:00.000Z" }, now), "mentions");

// Store: put, default removes, replace from the server, listeners, persisted.
let pings = 0;
const off = np.subscribePrefs(() => { pings += 1; });
np.putPref({ convType: "group", convId: "g1", level: "mentions", mutedUntil: null });
assert.equal(np.allowNotify("group", "g1"), false, "plain group message is silent at 'mentions'");
assert.equal(np.allowNotify("group", "g1", { mention: true }), true, "a mention still notifies");
assert.equal(np.allowNotify("group", "g2"), true, "other chats untouched");
np.putPref({ convType: "dm", convId: "u1", level: "all", mutedUntil: new Date(Date.now() + 60_000).toISOString() });
assert.equal(np.allowNotify("dm", "u1", { mention: true }), false, "a timed mute silences mentions too");
np.putPref({ convType: "dm", convId: "u1", level: "all", mutedUntil: null });
assert.equal(np.getPref("dm", "u1"), null, "back to default: no pref kept");
assert.ok(pings >= 3);
assert.ok(JSON.parse(mem.get("descall:notify-prefs:v1"))["group:g1"], "kept for the next start");
np.replaceAllPrefs([{ convType: "dm", convId: "u9", level: "none" }]);
assert.equal(np.getPref("group", "g1"), null, "the server list replaces the cache");
assert.equal(np.allowNotify("dm", "u9"), false);
off();

// Mute choices.
assert.deepEqual(np.MUTE_CHOICES.map((c) => c.id), ["1h", "8h", "24h", "7d"]);
assert.equal(np.muteUntil("8h", now), "2026-11-06T20:00:00.000Z");
assert.equal(np.muteUntil("forever", now), null);

// Wiring: desktop / in-app cards, sounds, menus, profile row, settings.
const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const svc = read("./notificationService.js");
assert.ok(svc.includes('if (!allowNotify("dm", conversationId)) return;'));
assert.ok(svc.includes('if (!allowNotify("group", groupId)) return;'));
assert.ok(svc.includes('if (groupId && !allowNotify("group", groupId, { mention: true })) return;'));
assert.ok(svc.includes("(!hidePreviews() && stickerPreviewText(text || \"\", t)?.substring(0, 120)) || t(\"New message\")"), "preview switch hides the text");
const app = read("../App.jsx");
assert.ok(app.includes('if (allowNotify("group", groupId)) playUiSound("message");'));
assert.ok(app.includes('!pref?.muted && allowNotify("dm", convWith)'));
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.ok(sidebar.includes('data-testid="dm-menu-notify"') && sidebar.includes('testId: "group-menu-notify"'));
assert.ok(sidebar.includes('{dm.muted || silenced ? <BellOff size={11} /> : null}'));
assert.ok(read("../components/social/UserProfileModal.jsx").includes('data-testid="profile-notify-options"'));
const panel = read("../components/layout/UserPanel.jsx");
assert.ok(panel.includes('t("msg4.notify.mentionSetting")') && panel.includes('t("msg4.notify.previewSetting")'));
assert.ok(/mentionNotifications,\s*notificationPreviews,\s*msgSounds,/.test(panel), "both switches are saved");

console.log("notifyPrefs selftest OK");
