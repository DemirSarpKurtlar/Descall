/**
 * Run: node frontend/src/components/admin/AdminLivePopup.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = readFileSync(join(root, "AdminPanel.jsx"), "utf8");
const live = readFileSync(join(root, "AdminLivePopup.jsx"), "utf8");
const popup = readFileSync(join(root, "AdminBroadcastPopup.jsx"), "utf8");
const app = readFileSync(join(root, "../../App.jsx"), "utf8");
const route = readFileSync(join(root, "../../../backend/routes/admin.js"), "utf8");
const css = readFileSync(join(root, "../../styles/admin-broadcast.css"), "utf8");

assert(panel.includes('id: "livepopup"'), "admin tabs must include the live popup tab");
assert(panel.includes("<AdminLivePopup"), "admin panel must render the live popup composer");
assert(panel.includes("<AdminDimaai"), "DimaAI tab must still render");
assert(live.includes('adminFetch("/popup"'), "composer posts to /popup");
assert(live.includes("preview: true"), "composer confirms recipients before sending");
assert(popup.includes('"dialog"'), "member popup is a dialog");
assert(app.includes('socket.on("admin:popup"'), "app must listen for admin popups");
assert(app.includes("<AdminBroadcastPopup"), "app must mount the live popup overlay");
assert(route.includes('router.post("/popup"'), "admin API must expose POST /popup");
assert(route.includes("deliverPopup"), "route must deliver through the popup engine");
assert(css.includes("z-index: 100000"), "popup must sit above the admin shell");

console.log("AdminLivePopup.selftest.mjs: ok");
