// Compact Liquid Glass incoming-call card + Electron toast hygiene:
// sizing, Turkish text, glass buttons, stack/eviction, grouping, focus
// de-dup, click routing. Run from frontend/: node electron/notificationCallCard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const card = require("./notificationCard.cjs");
const { stackPositions, evictionsFor, NOTIF_MARGIN } = require("./notificationStack.cjs");
const read = (rel) => readFileSync(join(here, rel), "utf8");

// 1. Proportions (DIPs: identical physical size at any DPI).
assert.ok(card.NOTIF_WIDTH >= 320 && card.NOTIF_WIDTH <= 360);
assert.ok(card.NOTIF_HEIGHT_CALL >= 76 && card.NOTIF_HEIGHT_CALL <= 100, "compact call card");
assert.ok(card.NOTIF_HEIGHT <= 100);
assert.equal(card.cardHeightFor("call"), card.NOTIF_HEIGHT_CALL);
assert.equal(card.MAX_VISIBLE, 3);

// 2. Call card: avatar + name + "Sesli arama" + Reddet / Kabul et tinted glass.
const call = card.buildNotificationHtml({
  title: "Ada Yılmaz",
  body: "Sesli arama",
  type: "call",
  from: "Ada",
  avatarUrl: "https://cdn.example/ada.png",
  duration: 0,
});
assert.match(call, /class="card call"/);
assert.match(call, /class="avatar-wrap"><img class="mark photo" src="https:\/\/cdn\.example\/ada\.png"/);
assert.match(call, /class="title">Ada Yılmaz</);
assert.match(call, /class="body-text">Sesli arama</);
assert.match(call, /class="decline"[^>]*aria-label="Reddet"/);
assert.match(call, /class="accept"[^>]*aria-label="Kabul et"/);
assert.doesNotMatch(call, />Accept<|>Decline<|aria-label="Close"/);
assert.match(call, /\.accept \{\s*background: linear-gradient\(180deg, rgba\(64, 222, 104/);
assert.match(call, /\.decline \{\s*background: linear-gradient\(180deg, rgba\(255, 92, 82/);
assert.match(call, /backdrop-filter: blur\(20px\) saturate\(180%\)/);
assert.match(call, /<html lang="tr">/);
assert.match(call, /class="stage"/, "shadow lives inside the transparent window");
assert.match(call, /ringPulse/);
assert.match(call, /\.avatar-wrap::after \{ animation: none/, "reduced motion stops the pulse");
assert.doesNotMatch(call, /class="progress"/);
const noBody = card.buildNotificationHtml({ title: "Ada", type: "call" });
assert.match(noBody, /class="body-text">Sesli arama</);
// Escaping.
assert.doesNotMatch(card.buildNotificationHtml({ title: "<img onerror=x>", type: "call" }), /<img onerror/);

// 3. Message card: Turkish close label, click handler, count chip, spring exit.
const msg = card.buildNotificationHtml({ title: "Ege", body: "selam", from: "Ege", duration: 5000, count: 3 });
assert.match(msg, /aria-label="Kapat"/);
assert.match(msg, /onclick="window\.__notifClick && window\.__notifClick\(\)"/, "clicking the card opens the chat");
assert.match(msg, /class="count">3</);
assert.match(msg, /notifAPI\?\.onUpdate/);
assert.match(msg, /translate3d\(28px,0,0\)/);

// 4. Stack: top-right of the work area, calls on top, whole DIPs, multi-monitor offsets.
{
  const area = { x: -1280, y: 0, width: 1280, height: 984 }; // left monitor
  const pos = stackPositions(area, [{ type: "default", height: 92 }, { type: "call", height: 84 }]);
  assert.equal(pos[0].entry.type, "call");
  for (const p of pos) {
    assert.equal(p.x, Math.round(p.x));
    assert.equal(p.x, area.x + area.width - card.NOTIF_WIDTH - NOTIF_MARGIN - card.SHADOW_PAD);
    assert.ok(p.x + card.SHADOW_PAD + card.NOTIF_WIDTH <= area.x + area.width);
  }
  assert.equal(pos[1].y - pos[0].y, 84 + NOTIF_MARGIN);
  const scaled = stackPositions({ x: 0, y: 0, width: 1536.8, height: 816.4 }, [{ type: "default", height: 92 }]);
  assert.equal(scaled[0].x, Math.round(scaled[0].x), "fractional work areas (125 %) round to whole DIPs");
}

// 5. No wall of toasts: the oldest non-call toast goes first; calls stay.
{
  const e = (type, id) => ({ type, id, height: 92 });
  assert.deepEqual(evictionsFor([e("default", 1), e("default", 2)]), []);
  assert.deepEqual(evictionsFor([e("call", 0), e("default", 1), e("default", 2)]).map((x) => x.id), [1]);
  assert.deepEqual(evictionsFor([e("call", 0), e("call", 1), e("call", 2)]), []);
}

// 6. main / window wiring.
{
  const main = read("main.cjs");
  const win = read("notificationWindow.cjs");
  const preload = read("notifPreload.cjs");
  assert.match(main, /function mainWindowInFront\(\)/);
  assert.match(main, /if \(mainWindowInFront\(\) && \(isCall \|\| !requireInteraction\)\) return null;/, "no duplicate toast when Descall is in front");
  assert.match(main, /updateShownNotification\(existing\.win, \{ title: cardTitle, body: body \|\| '', count \}\)/, "same chat = one grouped toast");
  assert.match(main, /data: entry\.data \|\| \{\}/, "click routes with the latest message's chat");
  assert.match(main, /data\.callerName \|\| data\.from/);
  assert.match(win, /getCursorScreenPoint/);
  assert.match(win, /evictionsFor\(activeNotifications\)/);
  assert.match(win, /notifWindows\.has\(w\)/, "toasts never anchor to another toast");
  assert.match(win, /zoomFactor: 1/);
  assert.match(win, /transparent: true/);
  assert.match(win, /hasShadow: false/);
  assert.match(preload, /notif:update/);
  const svc = readFileSync(join(here, "../src/lib/notificationService.js"), "utf8");
  assert.match(svc, /if \(await this\._isWindowActive\(\)\) return;/, "focused window: in-app call card only");
  assert.match(svc, /data: \{ type: 'missed-call', from, fromId/, "missed-call click opens that DM");
  assert.match(svc, /callerName: from, avatarUrl/);
}

console.log("notificationCallCard.selftest ok");
