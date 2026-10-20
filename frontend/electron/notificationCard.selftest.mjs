// Electron toasts are frosted glass cards with a Concept 2 mark for app notices.
// Run from frontend/: node electron/notificationCard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  buildNotificationHtml,
  buildNotificationGallery,
  initialOf,
  resolveMark,
} = require("./notificationCard.cjs");

const windowSrc = readFileSync(join(here, "notificationWindow.cjs"), "utf8");
const preload = readFileSync(join(here, "notifPreload.cjs"), "utf8");
const main = readFileSync(join(here, "main.cjs"), "utf8");

const system = buildNotificationHtml({
  title: "Descall",
  body: "Descall arka planda çalışmaya devam ediyor. Simge durumundan geri açabilirsin.",
  appIcon: true,
  duration: 5000,
});
const message = buildNotificationHtml({
  title: "cinarbaskin1",
  body: "Bu mesaj iki satıra kadar uzayabilir ve kelime ortasından kesilmeden durur.",
  from: "cinarbaskin1",
  duration: 5000,
});
const call = buildNotificationHtml({
  title: "Ada is calling",
  body: "Voice call",
  type: "call",
  from: "Ada",
  duration: 0,
});

assert.equal(initialOf("📞 Ada"), "A");
assert.equal(resolveMark({ appIcon: true, title: "Descall" }).kind, "app");
assert.equal(resolveMark({ title: "Friend Request", from: "Ege" }).letter, "E");

for (const html of [system, message, call]) {
  assert.match(html, /backdrop-filter:\s*blur\(40px\) saturate\(180%\)/);
assert.match(html, /rgba\(18, 20, 30, 0\.97\)/, "card base is near-opaque (separate window, nothing to blur)");
  assert.match(html, /-webkit-line-clamp:\s*2/);
  assert.match(html, /white-space:\s*normal/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /prefers-reduced-transparency:\s*reduce/);
  assert.match(html, /prefers-contrast:\s*more/);
  assert.match(html, /const omega = \(2 \* Math\.PI\) \/ 0\.34/);
  assert.match(html, /mouseenter/);
  assert.match(html, /notifAPI\?\.pause\(\)/);
  assert.match(html, /fadeOut/);
  assert.doesNotMatch(html, /blur\(4px\)/, "exit must not blur the backdrop-filter card (dark box bug)");
  assert.doesNotMatch(html, /filter 200ms/, "exit transitions only opacity + transform");
  assert.match(html, /\.card\.leaving \{[^}]*backdrop-filter: none/, "glass dropped while leaving");
  assert.doesNotMatch(html, /border-left/);
  assert.doesNotMatch(html, /#1e1f22/);
}

assert.match(system, /class="mark app"/);
assert.match(system, /data:image\/png;base64,/);
assert.doesNotMatch(system, /class="mark letter"/);
assert.match(message, /class="mark letter">C</);
assert.match(call, /class="accept"/);
assert.match(call, /class="decline"/);
assert.doesNotMatch(call, /class="progress"/);
assert.match(system, /class="progress"/);
const mention = buildNotificationHtml({
  title: "Ege mentioned you",
  body: "design",
  type: "mention",
  from: "Ege",
  duration: 0,
});
assert.match(mention, /class="progress"/);
assert.match(mention, /--accent:#ffd60a/);
assert.match(mention, /data-duration="0"/);

const gallery = buildNotificationGallery([
  { title: "Descall", body: "Background", appIcon: true },
  { title: "Ege", body: "Hello", from: "Ege", type: "mention" },
]);
assert.match(gallery, /class="mark app"/);
assert.match(gallery, /--accent:#ffd60a/);

assert.match(windowSrc, /frame:\s*false/);
assert.match(windowSrc, /thickFrame:\s*false/);
assert.match(windowSrc, /transparent:\s*true/);
assert.match(windowSrc, /backgroundColor:\s*'#00000000'/);
assert.match(windowSrc, /roundedCorners:\s*true/);
assert.match(windowSrc, /hasShadow:\s*false/);
assert.match(windowSrc, /setBackgroundColor\('#00000000'\)/);
assert.match(windowSrc, /setHasShadow\(false\)/);
assert.doesNotMatch(windowSrc, /backgroundMaterial/);
assert.doesNotMatch(windowSrc, /vibrancy/);
assert.doesNotMatch(windowSrc, /acrylic/);
assert.match(system, /class="stage"/);
assert.match(system, /background:\s*transparent !important/);
assert.match(system, /background-color:\s*transparent !important/);

const overlay = readFileSync(join(here, "overlayWindow.cjs"), "utf8");
const overlayWin = overlay.slice(overlay.indexOf("overlayWin = new BrowserWindow"), overlay.indexOf("overlayWin.setAlwaysOnTop"));
assert.match(overlayWin, /transparent:\s*true/);
assert.match(overlayWin, /backgroundColor:\s*'#00000000'/);
assert.match(overlayWin, /hasShadow:\s*false/);
assert.match(overlayWin, /thickFrame:\s*false/);
// 2.11.8: the overlay markup moved to overlayHtml.cjs.
assert.match(readFileSync(join(here, "overlayHtml.cjs"), "utf8"), /background:transparent/);
assert.match(windowSrc, /notif:pause/);
assert.match(windowSrc, /notif:resume/);
assert.doesNotMatch(windowSrc, /border-left/);
assert.match(preload, /notif:pause/);
assert.match(preload, /notif:resume/);
assert.match(main, /appIcon: true/);
assert.match(main, /APP_KINDS/);

console.log("notificationCard.selftest ok");
