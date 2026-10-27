// node src/lib/mediaViewerHeader.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enrichSender, senderAvatarUrl, senderName, formatViewerTime } from "./mediaViewerHeader.js";

process.env.TZ = "Europe/Istanbul";

// Sender from the message payload has no photo; the friends list does.
const raw = { id: 42, username: "sn1pez53", avatarUrl: null };
const friends = [{ id: "42", username: "sn1pez53", displayName: "Snipez", avatarUrl: "https://cdn.example/a.png" }];
const merged = enrichSender(raw, { friends, onlineUsers: [], me: { id: "1" } });
assert.ok(senderAvatarUrl(merged).startsWith("https://cdn.example/a.png"), "friend photo reaches the viewer");
assert.equal(senderName(merged), "Snipez");
assert.equal(senderAvatarUrl(enrichSender({ id: 7 }, { friends })), "", "no photo → empty (letter fallback)");
assert.equal(senderName(null, "x"), "x");
assert.equal(enrichSender(null, { friends }), null);

const at = "2026-10-20T20:09:00.000Z";
const now = new Date("2026-10-27T06:00:00.000Z");
assert.equal(formatViewerTime(at, "tr", null, now), "20.10.2026 23:09", "Turkish app shows dd.MM.yyyy HH:mm");
assert.ok(!/PM|AM/.test(formatViewerTime(at, "en", null, now)), "24h clock in English too");
assert.equal(formatViewerTime("2026-10-27T05:30:00.000Z", "tr", (k) => (k === "Today" ? "Bugün" : k), now), "Bugün 08:30");
assert.equal(formatViewerTime(null, "tr"), "");

// The viewer keeps the letter as fallback, also when the photo fails to load.
const lb = readFileSync(new URL("../components/chat/MessageMediaLightbox.jsx", import.meta.url), "utf8");
assert.match(lb, /onError=\{\(\) => setFailedAvatar\(item\.avatar\)\}/);
assert.match(lb, /mv-avatar-fallback/);
assert.match(lb, /formatViewerTime\(item\?\.at, locale, t\)/);
const ml = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
assert.match(ml, /avatar=\{senderAvatarUrl\(senderFor\(message\.from\) \|\| message\.from\)\}/, "single (GIF) viewer gets the avatar");
console.log("mediaViewerHeader.selftest ok");
