"use strict";

// Growth 3B pushes on iOS (lib/iosAlertPush.js): people notifications carry the face
// (Communication Notification via the Notification Service Extension) and the PEOPLE
// category (Katıl / Sessiz katıl / Yanıtla); a recall and quiet-hour messages are silent.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";
const assert = require("node:assert/strict");
const ios = require("../iosAlertPush");

const FROM = "00000000-0000-4000-8000-000000000002";
const texts = { tr: { title: "Ece, Kaan ve Zeynep seste", body: "Gece Kuşları › Sohbet · yanında Kaan" }, en: { title: "Ece, Kaan and Zeynep are in voice", body: "Night Owls › Chat" } };

let req = ios.buildAlertRequest({ type: "friend-voice", fromId: FROM, fromName: "Ece", senderAvatarUrl: "https://cdn.descall.test/ece.png", serverId: "s", channelId: "c", serverName: "Gece Kuşları", channelName: "Sohbet", texts, primary: "quiet_join" }, "tr");
assert.equal(req.body.aps.alert.title, "Ece, Kaan ve Zeynep seste");
assert.equal(req.body.aps.category, "PEOPLE", "people category: join / join muted / reply");
assert.equal(req.body.aps["mutable-content"], 1, "the extension adds the face");
assert.equal(req.body.senderAvatar, "https://cdn.descall.test/ece.png");
assert.equal(req.body.conv, `dm:${FROM}`);
assert.equal(req.body.primary, "quiet_join");
assert.equal(req.body.aps.sound, "default");
assert.equal(req.collapseId, "fvoice-c");
req = ios.buildAlertRequest({ type: "friend-voice", fromId: FROM, fromName: "Ece", texts }, "en");
assert.equal(req.body.aps.alert.title, "Ece, Kaan and Zeynep are in voice", "per device language");
// Without texts (older callers) the catalog text still works.
req = ios.buildAlertRequest({ type: "friend-voice", fromId: FROM, fromName: "Ece", serverName: "G", channelName: "S" }, "tr");
assert.ok(req.body.aps.alert.title.includes("Ece"));

req = ios.buildAlertRequest({ type: "friend-call", fromId: FROM, fromName: "Kaan", senderAvatarUrl: "https://cdn.descall.test/kaan.png", texts: { tr: { title: "Kaan seni çağırıyor", body: "\"Gel\"" } } }, "tr");
assert.equal(req.body.aps.category, "PEOPLE_CALL", "a friend calling you back is not a ringing call");
assert.notEqual(req.body.aps.category, "INCOMING_CALL");
assert.equal(req.body.senderAvatar, "https://cdn.descall.test/kaan.png");

req = ios.buildAlertRequest({ type: "rg-recall", collapse: "rg-inactive7", texts: { tr: { title: "Descall", body: "Bu bildirim geri alındı." } } }, "tr");
assert.equal(req.body.aps.sound, undefined, "recall replacement is silent");
assert.equal(req.body.aps["interruption-level"], "passive");
assert.equal(req.collapseId, "rg-inactive7", "replaces the original card");

req = ios.buildAlertRequest({ type: "dm", fromId: FROM, fromName: "Ece", text: "selam", quiet: true }, "tr");
assert.equal(req.body.aps["interruption-level"], "passive", "quiet hours: messages without sound");
assert.equal(req.body.aps.sound, undefined);
req = ios.buildAlertRequest({ type: "dm", fromId: FROM, fromName: "Ece", text: "selam" }, "tr");
assert.equal(req.body.aps.sound, "default", "unchanged otherwise");

console.log("reengage push.selftest: ok");
