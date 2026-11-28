// Taskbar / dock unread badge, page side: the per-device switch (on by default), the count
// the shells get (every plan: no Descall+ check anywhere on the way), the tray state field.
// Run from frontend/: node src/lib/taskbarBadgePref.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { TASKBAR_BADGE_KEY, badgeCountFor, readTaskbarBadge, setTaskbarBadge, subscribeTaskbarBadge } = await import("./taskbarBadgePref.js");
const { buildTrayState } = await import("./desktopTray.js");
const here = dirname(fileURLToPath(import.meta.url));

// 1. On by default; the switch is remembered and announced.
assert.equal(readTaskbarBadge(), true, "on by default");
const seen = [];
const off = subscribeTaskbarBadge((v) => seen.push(v));
setTaskbarBadge(false);
assert.equal(store.get(TASKBAR_BADGE_KEY), "0");
assert.equal(readTaskbarBadge(), false);
setTaskbarBadge(true);
assert.equal(store.has(TASKBAR_BADGE_KEY), false, "back on: the default again");
assert.equal(readTaskbarBadge(), true);
off();
setTaskbarBadge(false);
assert.deepEqual(seen, [false, true], "listeners until unsubscribed");
setTaskbarBadge(true);

// 2. The count: the unread total, 0 when signed out or turned off.
assert.equal(badgeCountFor({ signedIn: true, unread: 3, enabled: true }), 3);
assert.equal(badgeCountFor({ signedIn: true, unread: 42.9, enabled: true }), 42);
assert.equal(badgeCountFor({ signedIn: true, unread: 0, enabled: true }), 0);
assert.equal(badgeCountFor({ signedIn: true, unread: -5, enabled: true }), 0);
assert.equal(badgeCountFor({ signedIn: true, unread: "x", enabled: true }), 0);
assert.equal(badgeCountFor({ signedIn: false, unread: 3, enabled: true }), 0, "signed out: no badge");
assert.equal(badgeCountFor({ signedIn: true, unread: 3, enabled: false }), 0, "turned off: no badge");

// 3. The tray state carries it to both shells.
assert.equal(buildTrayState({ app: { signedIn: true, unreadMessages: 5, badgeCount: 5 } }).badgeCount, 5);
assert.equal(buildTrayState({ app: { badgeCount: -1 } }).badgeCount, 0);
assert.equal(buildTrayState({}).badgeCount, 0);

// 4. Free: the hook computes it without any plan / premium feature check, the settings row
// is in the shared Desktop app pane, and the Descall+ panel no longer has a badge switch.
const hook = readFileSync(join(here, "..", "hooks", "useDesktopTray.js"), "utf8");
assert.match(hook, /badgeCountFor\(\{ signedIn, unread: unreadMessages, enabled: badgeOn \}\)/);
assert.match(hook, /friendRequests: requests, badgeCount \}/);
const pane = readFileSync(join(here, "..", "components", "settings", "DesktopUpdatePane.jsx"), "utf8");
assert.match(pane, /onToggle=\{setTaskbarBadge\}/);
assert.doesNotMatch(pane, /premium/i, "no plan gate on the switch");
const plusPanel = readFileSync(join(here, "..", "premium", "settings", "taskbar_plus.jsx"), "utf8");
assert.doesNotMatch(plusPanel, /id: "badge"/, "Descall+ keeps the thumbnail buttons only");

// 5. Strings in every locale.
for (const loc of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
  const text = readFileSync(join(here, "..", "i18n", "locales", `${loc}.js`), "utf8");
  for (const key of ["settings_badgeSection", "settings_badge", "settings_badgeHint", "settings_badgeHintMac"]) {
    assert.match(text, new RegExp(`"${key}": "`), `${loc}: ${key}`);
  }
}

console.log("taskbarBadgePref.selftest ok");
