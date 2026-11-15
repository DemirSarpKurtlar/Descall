/**
 * Run: node frontend/src/components/admin/AdminLivePopup.selftest.mjs
 * Wiring of the live popup (remake Nov 2026, Draft B): the admin tab renders the
 * new page, sends go through the campaign API with an audience estimate and a
 * review step, the member popup reports receipts and handles recall.
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
const api = readFileSync(join(root, "livepopup/livePopupApi.js"), "utf8");
const composer = readFileSync(join(root, "livepopup/ComposerDrawer.jsx"), "utf8");
const popup = readFileSync(join(root, "AdminBroadcastPopup.jsx"), "utf8");
const app = readFileSync(join(root, "../../App.jsx"), "utf8");
const route = readFileSync(join(root, "../../../backend/routes/admin.js"), "utf8");
const lpRoute = readFileSync(join(root, "../../../backend/routes/adminLivePopup.js"), "utf8");
const css = readFileSync(join(root, "../../styles/admin-broadcast.css"), "utf8");

assert(panel.includes('id: "livepopup"'), "admin tabs must include the live popup tab");
assert(/<AdminLivePopup socket=\{socket\}/.test(panel), "admin panel renders the live popup page with the admin socket");
assert(live.includes("LivePopupPage"), "the tab file renders the remade page");
assert(api.includes('"/popup/campaigns"') && api.includes('"/popup/audience/preview"'), "page sends through the campaign API with an audience estimate");
assert(composer.includes("ReviewDialog") && composer.includes("note: note.trim()"), "sending goes through a review with a required note");
assert(popup.includes('"dialog"'), "member popup is a dialog");
assert(popup.includes("sendPopupReceipt") && popup.includes('"seen"') && popup.includes('"acked"'), "member popup reports seen / acked");
assert(app.includes('socket.on("admin:popup"'), "app must listen for admin popups");
assert(app.includes('socket.on("admin:popup:recall"') && app.includes('socket.on("admin:popup:close"'), "app handles recall and other-device close");
assert(app.includes("<AdminBroadcastPopup") && app.includes("socket={socketApi}"), "app mounts the popup overlay with the socket");
assert(route.includes('router.post("/popup"'), "single-person POST /popup stays for the user file");
assert(route.includes('require("./adminLivePopup")'), "admin router mounts the live popup routes");
assert(lpRoute.includes('router.post("/popup/campaigns"') && lpRoute.includes("/recall"), "campaign + recall routes exist");
assert(css.includes("z-index: 100000"), "popup must sit above the admin shell");

console.log("AdminLivePopup.selftest.mjs: ok");
