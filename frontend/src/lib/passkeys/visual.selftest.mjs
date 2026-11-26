// Pure helpers of the passkey screens (lib/passkeys/visual.js).
//   node frontend/src/lib/passkeys/visual.selftest.mjs
import assert from "node:assert/strict";
import * as v from "./visual.js";

// Kinds.
assert.equal(v.passkeyKind({ provider: "Windows Hello", platform: "windows" }), "windows");
assert.equal(v.passkeyKind({ provider: "iCloud Keychain", synced: true, device: "iPhone" }), "ios");
assert.equal(v.passkeyKind({ provider: "iCloud Keychain", synced: true, device: "Mac" }), "mac");
assert.equal(v.passkeyKind({ provider: "Google Password Manager", synced: true }), "android");
assert.equal(v.passkeyKind({ provider: "YubiKey 5", synced: false, transports: ["usb", "nfc"] }), "key");
assert.equal(v.passkeyKind({ synced: false, transports: ["nfc"] }), "key");
assert.equal(v.passkeyKind({ provider: "1Password", synced: true, platform: "web" }), "web");
assert.equal(v.passkeyKind({ platform: "android" }), "android");
assert.equal(v.passkeyKind(null), "web");

// 30-day bars by local day, oldest first.
{
  const now = new Date(2026, 10, 24, 12, 0, 0).getTime();
  const at = (d, h = 10) => new Date(2026, 10, 24 - d, h, 0, 0).toISOString();
  const bars = v.usageBars([at(0), at(0, 1), at(1), at(29), at(30), "nope"], now);
  assert.equal(bars.length, 30);
  assert.equal(bars[29], 2, "today");
  assert.equal(bars[28], 1, "yesterday");
  assert.equal(bars[0], 1, "29 days ago");
  assert.equal(bars.reduce((a, b) => a + b, 0), 4, "30 days ago and garbage are out");
}

// Idle and stale.
{
  const now = Date.parse("2026-11-24T12:00:00Z");
  const list = [
    { id: "a", lastUsedAt: "2026-11-23T12:00:00Z" },
    { id: "b", lastUsedAt: "2026-10-08T12:00:00Z" },
    { id: "c", createdAt: "2026-09-01T12:00:00Z" },
    { id: "d", lastUsedAt: "2026-01-01T00:00:00Z", suspended: true },
  ];
  assert.equal(v.idleDays(list[1], now), 47);
  assert.deepEqual(v.stalePasskeys(list, now).map((p) => p.id), ["c", "b"], "never used counts from the day it was added; suspended ones are not 'unused'");
}

// Sign-in mix in whole percentages.
assert.deepEqual(v.mixPercent({ passkey: 21, password: 3, social: 1, total: 25 }), { passkey: 84, password: 12, social: 4 });
assert.deepEqual(v.mixPercent({ passkey: 1, password: 1, social: 1, total: 3 }), { passkey: 34, password: 33, social: 33 });
assert.equal(v.mixPercent({ total: 0 }), null);
assert.equal(v.seconds(1834), 1.8);
assert.equal(v.seconds(null), null);

// Backup advice.
{
  const win = { provider: "Windows Hello", platform: "windows" };
  const phone = { provider: "iCloud Keychain", synced: true, device: "iPhone" };
  const key = { provider: "YubiKey 5", transports: ["usb"] };
  assert.equal(v.backupAdvice([], "web"), null, "no passkey: the main button, not this card");
  assert.deepEqual(v.backupAdvice([win], "tauri"), { only: "windows", options: ["remoteDevice", "securityKey"] });
  assert.deepEqual(v.backupAdvice([phone], "web"), { only: "apple", options: ["securityKey"] });
  assert.deepEqual(v.backupAdvice([key], "web"), { only: "key", options: ["remoteDevice"] });
  assert.deepEqual(v.backupAdvice([phone], "ios"), { only: "apple", options: ["computer"] });
  assert.equal(v.backupAdvice([win, phone], "web"), null, "two families are enough");
  assert.equal(v.backupAdvice([{ ...win, suspended: true }], "web"), null);
}

// Previews and labels.
assert.deepEqual(v.previewFor("windows"), { desktop: "hello", phone: "none" });
assert.deepEqual(v.previewFor("ios"), { desktop: "qr", phone: "ios" });
assert.deepEqual(v.previewFor("key"), { desktop: "usb", phone: "nfc" });
assert.equal(v.signInStyle("ios"), "face");
assert.equal(v.signInStyle("android"), "finger");
assert.equal(v.signInStyle("tauri"), "hello");
assert.equal(v.signInStyle("handoff", { navigator: { userAgent: "Windows NT 10.0 Electron" } }), "hello");
assert.equal(v.signInStyle("web"), "passkey");
assert.equal(v.statePlatform("web", { navigator: { userAgent: "Mozilla (iPhone)" } }), "ios");
assert.equal(v.stateForError({ code: "cancelled" }), "cancel");
assert.equal(v.stateForError({ code: "no_credential" }), "none");
assert.equal(v.stateForError({ code: "timeout" }), "err");
assert.equal(v.stateForError({ code: "aborted" }), null);
assert.ok(v.nameSuggestions("windows").length >= 3);

// Post-sign-in suggestion rules.
{
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, x) => mem.set(k, x) };
  const ok = { available: true, localPasskey: false };
  assert.equal(v.shouldSuggest(st, ok), false, "nothing before a sign-in");
  v.noteSignIn(st, "password");
  assert.equal(v.shouldSuggest(st, { ...ok, available: false }), false, "only where passkeys work");
  assert.equal(v.shouldSuggest(st, { ...ok, localPasskey: true }), false, "not when this device already has one");
  assert.equal(v.shouldSuggest(st, ok), true, "right after a password sign-in");
  v.answerSuggestion(st, "later");
  assert.equal(v.shouldSuggest(st, ok), false, "once per sign-in");
  v.noteSignIn(st, "passkey");
  assert.equal(v.shouldSuggest(st, ok), false, "a passkey sign-in does not count");
  v.noteSignIn(st, "password");
  v.noteSignIn(st, "google");
  assert.equal(v.shouldSuggest(st, ok), false, "later: not for the next 2 sign-ins");
  v.noteSignIn(st, "password");
  assert.equal(v.shouldSuggest(st, ok), true, "3 sign-ins later it is back");
  v.answerSuggestion(st, "later");
  for (let i = 0; i < 3; i += 1) v.noteSignIn(st, "password");
  v.answerSuggestion(st, "later");
  for (let i = 0; i < 3; i += 1) v.noteSignIn(st, "password");
  assert.equal(v.shouldSuggest(st, ok), false, "at most 3 reminders");
  v.resetSuggestion(st);
  v.noteSignIn(st, "apple");
  assert.equal(v.shouldSuggest(st, ok), true, "Settings turns it back on");
  v.answerSuggestion(st, "never");
  v.noteSignIn(st, "password");
  assert.equal(v.shouldSuggest(st, ok), false, "never on this device");
  mem.set(v.SUGGEST_KEY, "{broken");
  assert.equal(v.suggestionState(st).never, false, "a broken value starts over");
}

console.log("passkey visual selftest OK");
