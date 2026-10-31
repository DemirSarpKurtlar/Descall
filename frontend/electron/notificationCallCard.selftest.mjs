// Desktop notification capsule (3.0.0, mockup 33) + Electron toast hygiene:
// content per kind, call capsule, Turkish text, top-centre stack/eviction,
// grouping, focus de-dup, click routing.
// Run from frontend/: node electron/notificationCallCard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Card text comes from electron/i18n; these checks use the Turkish catalog (English ones below).
const mainI18n = require("./mainI18n.cjs");
mainI18n.setLocale("tr");
const card = require("./notificationCard.cjs");
const { stackPositions, evictionsFor, capsuleWidth, NOTIF_MARGIN, NOTIF_GAP } = require("./notificationStack.cjs");
const read = (rel) => readFileSync(join(here, rel), "utf8");
const { AVATAR_PALETTE: APP_PALETTE, avatarColor: appAvatarColor, avatarInitials } = await import("../src/lib/avatarFallback.js");

// 1. Proportions: wide capsule (DIPs, identical physical size at any DPI).
assert.equal(card.NOTIF_WIDTH, 480);
assert.equal(card.NOTIF_HEIGHT, 66);
assert.equal(card.NOTIF_HEIGHT_CALL, 66);
assert.equal(card.cardHeightFor("call"), card.NOTIF_HEIGHT_CALL);
assert.equal(card.cardHeightFor("default", "message"), 66);
assert.equal(card.cardHeightFor("default", "notice"), card.NOTIF_HEIGHT_NOTICE);
assert.equal(card.MAX_VISIBLE, 3);

// 2. Letter avatars = the app's fallback (palette, crc32, initials).
assert.deepEqual(card.AVATAR_PALETTE, [...APP_PALETTE]);
for (const k of ["u-1", "ayşe", "9f1c2d", ""]) assert.equal(card.avatarColor(k), appAvatarColor(k), `colour ${k}`);
assert.equal(card.crc32("ayşe"), zlib.crc32("ayşe"));
for (const n of ["Ayşe Yılmaz", "cinar.baskin", "Zeynep", "@ege", "işık"]) assert.equal(card.initialOf(n), avatarInitials(n), `initials ${n}`);

// 3. Content per kind (mockup 33).
const d = (title, body, data, extra = {}) => card.describeNotification({ title, body, data, ...extra });
{
  const dm = d("Ayşe", "Saat 18:00 olur mu? Halı sahayı ayarladım ⚽", { type: "dm", from: "Ayşe", conversationId: "u-a", fromId: "u-a" });
  assert.equal(dm.name, "Ayşe");
  assert.equal(dm.context, "şimdi");
  assert.equal(dm.preview, "Saat 18:00 olur mu? Halı sahayı ayarladım ⚽");
  assert.equal(dm.badge, "online");
  assert.equal(dm.action, "message");

  const grp = d("Hafta Sonu Ekibi", "Mert: Kaleci kim olacak bu sefer? 😄", { type: "group", from: "Mert", groupName: "Hafta Sonu Ekibi", groupId: "g" });
  assert.equal(grp.name, "Mert");
  assert.equal(grp.context, "Hafta Sonu Ekibi");
  assert.equal(grp.preview, "Kaleci kim olacak bu sefer? 😄", "sender prefix stripped");
  assert.equal(grp.badge, "group");
  const grp2 = d("G", "Mert: x", { type: "group", from: "Mert", groupName: "G", preview: "Kaleci kim?" });
  assert.equal(grp2.preview, "Kaleci kim?", "data.preview wins");

  const online = d("Descall", "Mert is now online", { type: "friend-online", username: "Mert", userId: "u-m" });
  assert.equal(online.name, "Mert çevrimiçi");
  assert.equal(online.preview, "Az önce bağlandı");
  assert.equal(online.badge, "online");
  assert.equal(online.action, "message");
  assert.equal(online.appIcon, false, "letter avatar, not the app icon");
  assert.equal(d("Descall", "x", { type: "friend-online", username: "Mert" }).action, null, "no user id → no Mesaj");

  const call = d("Ayşe is calling", "Sesli arama", { type: "call", from: "Ayşe", callerName: "Ayşe" });
  assert.equal(call.kind, "call");
  assert.equal(call.name, "Ayşe");
  assert.equal(call.context, "arıyor...");
  assert.equal(call.contextTone, "live");
  assert.equal(call.preview, "Sesli arama");

  const notice = d("Descall", "Descall arka planda çalışmaya devam ediyor.", {}, { appIcon: true });
  assert.equal(notice.kind, "notice");
  assert.equal(notice.appIcon, true);
  assert.equal(notice.action, null);

  const server = d("Oyun #genel", "Ece: selam", { type: "server-message", from: "Ece", serverName: "Oyun Gecesi", channelName: "genel" });
  assert.equal(server.context, "#genel · Oyun Gecesi");
  assert.equal(server.preview, "selam");
  assert.equal(server.badge, "server");

  assert.equal(d("x", "a\n b", { type: "dm", from: "x" }).preview, "a b", "one line");
  assert.equal(d("x", "y".repeat(400), { type: "dm", from: "x" }).preview.length, 160);
}

// 4. Capsule markup: avatar + badge, name + context, preview, Mesaj pill, ×.
{
  const html = card.buildNotificationHtml({
    model: d("Hafta Sonu Ekibi", "Mert: Kaleci kim?", { type: "group", from: "Mert", fromId: "u-m", groupName: "Hafta Sonu Ekibi" }),
    duration: 5000,
    count: 3,
  });
  assert.match(html, /class="avatar-wrap"><div class="mark letter" style="background:#[0-9A-F]{6}">M<\/div><i class="badge group"/);
  assert.match(html, /class="title-text">Mert<\/span><span class="ctx">Hafta Sonu Ekibi<\/span><span class="count">3</);
  assert.match(html, /class="body-text">Kaleci kim\?</);
  assert.match(html, /class="pill" type="button" data-act="click" aria-label="Mesaj">.*<span>Mesaj<\/span>/s);
  assert.match(html, /class="close-btn" type="button" data-act="close" aria-label="Kapat"/);
  assert.match(html, /<html lang="tr">/);
  assert.match(html, /class="stage"/, "shadow lives inside the transparent window");
  assert.match(html, /notifAPI\?\.onUpdate/);
  assert.match(html, /x\.textContent = next\.context/, "grouped update refreshes the context too");

  const photo = card.buildNotificationHtml({ model: d("Ayşe", "selam", { type: "dm", from: "Ayşe", avatarUrl: "https://cdn.example/a.png" }) });
  assert.match(photo, /<img class="mark photo" src="https:\/\/cdn\.example\/a\.png"/);
  assert.match(photo, /<i class="badge dot"/);
  const insecure = card.buildNotificationHtml({ model: d("Ayşe", "selam", { type: "dm", from: "Ayşe", avatarUrl: "javascript:alert(1)" }) });
  assert.doesNotMatch(insecure, /javascript:/, "only https / data:image avatars");

  const call = card.buildNotificationHtml({ title: "Ada Yılmaz", body: "Sesli arama", type: "call", from: "Ada", avatarUrl: "https://cdn.example/ada.png", duration: 0 });
  assert.match(call, /class="card call"/);
  assert.match(call, /class="avatar-wrap"><img class="mark photo" src="https:\/\/cdn\.example\/ada\.png"/);
  assert.match(call, /class="title-text">Ada Yılmaz<\/span><span class="ctx live">arıyor\.\.\.</);
  assert.match(call, /class="body-text">Sesli arama</);
  assert.match(call, /class="decline"[^>]*aria-label="Reddet"/);
  assert.match(call, /class="accept"[^>]*aria-label="Kabul et"/);
  assert.match(call, /\.decline \{ background: #ff453a/);
  assert.match(call, /\.accept \{ background: #30d158/);
  assert.match(call, /\.card\.call \{ border-color: rgba\(48, 209, 88/);
  assert.doesNotMatch(call, /class="pill"|class="close-btn"/);
  assert.doesNotMatch(call, />Accept<|>Decline<|aria-label="Close"/);
  assert.match(call, /ringPulse/);
  // Escaping.
  assert.doesNotMatch(card.buildNotificationHtml({ title: "<img onerror=x>", type: "call" }), /<img onerror/);
  assert.doesNotMatch(card.buildNotificationHtml({ model: d("x", "<b>hi</b>", { type: "dm", from: "<i>" }) }), /<b>hi|<i>/);
}

// 5. Motion: slide down + blur → sharp, spring 1.0 / 0.35; leaves upwards;
//    swipe up dismisses with momentum; a tap opens the chat (not on calls).
{
  const html = card.buildNotificationHtml({ title: "Ege", body: "selam", from: "Ege" });
  assert.match(html, /const ENTER_FROM = -26/);
  assert.match(html, /'blur\(' \+ blur\.toFixed\(2\)/);
  assert.match(html, /-\(omega \* omega\) \* \(state\.y - target\) - \(2 \* omega\) \* state\.v/, "critically damped");
  assert.match(html, /state\.y < -24 \|\| s\.v < -0\.45/, "swipe up / fling dismisses");
  assert.match(html, /if \(!card\.classList\.contains\('call'\)\) beginDismiss\('click'\)/);
  assert.match(html, /translate3d\(0,' \+ to \+ 'px,0\) scale\(0\.97\)/, "exit goes up");
}

// 6. Stack: top centre of the work area, calls on top, whole DIPs, multi-monitor offsets.
{
  const area = { x: -1280, y: 0, width: 1280, height: 984 }; // left monitor
  const pos = stackPositions(area, [{ type: "default", height: 66 }, { type: "call", height: 66 }]);
  assert.equal(pos[0].entry.type, "call");
  for (const p of pos) {
    assert.equal(p.x, Math.round(p.x));
    assert.equal(p.width, 480);
    assert.equal(p.x + card.SHADOW_PAD + p.width / 2, area.x + area.width / 2, "centred");
  }
  assert.equal(pos[0].y, area.y + NOTIF_MARGIN - card.SHADOW_PAD);
  assert.equal(pos[1].y - pos[0].y, 66 + NOTIF_GAP);
  const scaled = stackPositions({ x: 0, y: 0, width: 1536.8, height: 816.4 }, [{ type: "default", height: 66 }]);
  assert.equal(scaled[0].x, Math.round(scaled[0].x), "fractional work areas (125 %) round to whole DIPs");
  assert.equal(capsuleWidth({ width: 400 }), 376, "narrow screens");
}

// 7. No wall of toasts: the oldest non-call toast goes first; calls stay.
{
  const e = (type, id) => ({ type, id, height: 66 });
  assert.deepEqual(evictionsFor([e("default", 1), e("default", 2)]), []);
  assert.deepEqual(evictionsFor([e("call", 0), e("default", 1), e("default", 2)]).map((x) => x.id), [1]);
  assert.deepEqual(evictionsFor([e("call", 0), e("call", 1), e("call", 2)]), []);
}

// 8. main / window wiring.
{
  const main = read("main.cjs");
  const win = read("notificationWindow.cjs");
  const preload = read("notifPreload.cjs");
  assert.match(main, /function mainWindowInFront\(\)/);
  assert.match(main, /if \(mainWindowInFront\(\) && \(isCall \|\| !requireInteraction\)\) return null;/, "no duplicate toast when Descall is in front");
  assert.match(main, /const model = describeNotification\(\{ title, body, data, appIcon, avatarUrl \}\);/);
  assert.match(main, /updateShownNotification\(existing\.win, \{ title: cardTitle, body: model\.preview \|\| '', context: model\.context \|\| '', count \}\)/, "same chat = one grouped toast");
  assert.match(main, /data: clickData\(entry\.data\)/, "click routes with the latest message's chat");
  assert.match(main, /type: 'dm', conversationId: d\.userId/, "Mesaj on 'çevrimiçi' opens the DM");
  assert.match(win, /getCursorScreenPoint/);
  assert.match(win, /evictionsFor\(activeNotifications\)/);
  assert.match(win, /notifWindows\.has\(w\)/, "toasts never anchor to another toast");
  assert.match(win, /zoomFactor: 1/);
  assert.match(win, /transparent: true/);
  assert.match(win, /hasShadow: false/);
  assert.match(win, /width: capsuleW \+ SHADOW_PAD \* 2/);
  assert.match(preload, /notif:update/);
  const svc = readFileSync(join(here, "../src/lib/notificationService.js"), "utf8");
  assert.match(svc, /if \(await this\._isWindowActive\(\)\) return;/, "focused window: in-app call card only");
  assert.match(svc, /data: \{ type: 'missed-call', from, fromId/, "missed-call click opens that DM");
  assert.match(svc, /callerName: from, avatarUrl/);
  assert.match(svc, /data: \{ type: 'group', groupId, from, groupName, preview, fromId, avatarUrl \}/);
  assert.match(svc, /data: \{ type: 'friend-online', username, userId, fromId: userId, avatarUrl \}/);
}

// 7. Other UI languages: same capsule, words from that catalog, <html lang> follows.
{
  mainI18n.setLocale("en");
  const online = d("Descall", "x", { type: "friend-online", username: "Mert", userId: "u-m" });
  assert.equal(online.name, "Mert is online");
  assert.equal(online.preview, "Just connected");
  assert.equal(d("Ayşe", "x", { type: "dm", from: "Ayşe" }).context, "now");
  const html = card.buildNotificationHtml({ title: "Ada", body: "Voice call", type: "call", from: "Ada", duration: 0 });
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="accept"[^>]*aria-label="Accept"/);
  mainI18n.setLocale("de");
  assert.equal(d("Ayşe", "x", { type: "missed-call", from: "Ayşe" }).context, "verpasster Anruf");
  assert.match(card.buildNotificationHtml({ title: "Mert", body: "x", type: "default", model: d("Mert", "x", { type: "dm", from: "Mert" }) }), /<html lang="de">[\s\S]*<span>Nachricht<\/span>/);
  mainI18n.setLocale("tr");
}

console.log("notificationCallCard.selftest ok");
