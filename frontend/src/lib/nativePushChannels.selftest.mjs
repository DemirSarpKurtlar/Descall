// Android push channels: every channel the backend targets is created by the app.
// Run: node src/lib/nativePushChannels.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const app = read("./nativePush.js");
const fcm = read("../../backend/lib/fcm.js");
const manifest = read("../../android/app/src/main/AndroidManifest.xml");

const created = new Set([...app.matchAll(/\{ id: "([a-z_]+)", nameKey:/g)].map((m) => m[1]));
const targeted = new Set([...fcm.matchAll(/"((?:descall|incoming)_[a-z_]+)"/g)].map((m) => m[1]));
assert.ok(targeted.size >= 2, "backend still names its channels");
for (const id of targeted) assert.ok(created.has(id), `app creates the ${id} channel the backend sends to`);
assert.match(app, /await ensureAndroidPushChannels\(\);\s*\n\s*await PushNotifications\.register\(\)/, "channels exist before the first token");
assert.match(manifest, /default_notification_channel_id"\s*\n\s*android:value="descall_default"/, "FCM default channel is ours");
// Heads-up needs IMPORTANCE_HIGH (4) or more for both.
for (const m of app.matchAll(/\{ id: "[a-z_]+", nameKey: "[^"]+", importance: (\d)/g)) assert.ok(Number(m[1]) >= 4);
console.log("nativePushChannels.selftest ok");
