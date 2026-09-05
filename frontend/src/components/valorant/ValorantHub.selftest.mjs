/**
 * Run: node frontend/src/components/valorant/ValorantHub.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const hub = readFileSync(join(root, "ValorantHub.jsx"), "utf8");
const layout = readFileSync(join(root, "../layout/AppLayout.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/valorant.css"), "utf8");
const appCss = readFileSync(join(root, "../../styles/app-layout.css"), "utf8");
const mobileCss = readFileSync(join(root, "../../styles/mobile.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(hub.includes('import LfgWorkspace from "../lfg/LfgWorkspace"'), "hub must mount existing LFG");
assert(hub.includes("<LfgWorkspace"), "hub must render LfgWorkspace");
assert(!hub.includes("onClose={onClose}"), "hub must own Back — do not pass onClose into LFG");
assert(hub.includes('wanted === "companion"') || hub.includes('return "lfg"'), "default tab must be LFG for Adım 1 regression");
assert(hub.includes('role="tablist"'), "hub tabs must be accessible");
assert(hub.includes("CompanionAuthPanel"), "companion auth panel required (Adım 2)");
assert(!hub.includes("CompanionPlaceholder"), "placeholder must be replaced");
assert(layout.includes("<ValorantHub"), "AppLayout Play slot mounts ValorantHub");
assert(!/activeView === "play" \? \([\s\S]{0,40}<LfgWorkspace/.test(layout), "LFG must not mount bare from AppLayout");
assert(css.includes(".valorant-hub"), "valorant hub styles exist");
assert(css.includes(".valorant-hub-tab"), "tab styles exist");
assert(css.includes(".valorant-party"), "party panel styles exist (Adım 3)");
assert(/\[data-view="play"\]\s*\.valorant-hub/.test(appCss), "play overlay targets valorant-hub");
assert(/:not\(\[data-view="play"\]\)\s*\.valorant-hub/.test(appCss), "leftover hide for valorant-hub");
assert(/@media \(max-width: 768px\)/.test(css) && css.includes(".valorant-hub-tabs"), "valorant hub has mobile tab layout");
assert(mobileCss.includes('[data-view="play"] .valorant-hub'), "mobile play view sizes valorant-hub");

const auth = readFileSync(join(root, "CompanionAuthPanel.jsx"), "utf8");
assert(auth.includes("valorantHub.connectLocal") || auth.includes("connectLocal"), "local connect CTA");
assert(auth.includes("disconnect"), "disconnect control");
assert(auth.includes("CompanionPartyPanel"), "auth panel mounts party panel (Adım 3)");

const party = readFileSync(join(root, "CompanionPartyPanel.jsx"), "utf8");
assert(party.includes("startValorantQueue"), "party can start queue");
assert(party.includes("stopValorantQueue"), "party can stop queue");
assert(party.includes("inviteValorantParty"), "party can invite by Riot ID");
assert(party.includes("transferValorantParty"), "party can transfer leadership");
assert(party.includes("generateValorantPartyCode"), "party can generate code");

const api = readFileSync(join(root, "../../api/valorant.js"), "utf8");
assert(api.includes("/me"), "client calls /valorant/me");
assert(api.includes("/party"), "client calls /valorant/party");
assert(api.includes("startValorantQueue"), "client exports queue start");

const routes = readFileSync(join(root, "../../../backend/routes/valorant.js"), "utf8");
assert(routes.includes('router.get("/me"'), "GET /api/valorant/me exists");
assert(routes.includes('router.get("/party"'), "GET /api/valorant/party exists");
assert(routes.includes('router.post("/party/queue/start"'), "POST queue start exists");
assert(routes.includes('router.post("/party/queue/stop"'), "POST queue stop exists");
assert(routes.includes('router.post("/party/invite"'), "POST party invite exists");
assert(routes.includes('router.post("/party/transfer"'), "POST party transfer exists");
assert(routes.includes("passwords are not accepted") || routes.includes("Passwords are not accepted"), "password rejection present");

const partyLib = readFileSync(join(root, "../../../backend/lib/valorantParty.js"), "utf8");
assert(partyLib.includes("glz-"), "GLZ base used");
assert(partyLib.includes("/matchmaking/join"), "queue join path");
assert(partyLib.includes("/invites/name/"), "invite by name path");
assert(!/req\.body\?\.(password|riotPassword)/.test(partyLib), "party lib must not accept password fields");
assert(/never logs tokens/i.test(partyLib), "party lib documents no token logging");

const electronAuth = readFileSync(join(root, "../../../electron/riotLocalAuth.cjs"), "utf8");
assert(electronAuth.includes("lockfile"), "electron lockfile reader");
assert(electronAuth.includes("safeStorage"), "electron safeStorage");

const en = readFileSync(join(root, "../../i18n/locales/en.js"), "utf8");
assert(en.includes("partyTitle"), "EN party strings");
const tr = readFileSync(join(root, "../../i18n/locales/tr.js"), "utf8");
assert(tr.includes("partyTitle"), "TR party strings");


const friendsLib = readFileSync(join(root, "../../../backend/lib/valorantFriends.js"), "utf8");
assert(friendsLib.includes("mergeFriendsAndPresences"), "friends merge helper");
assert(friendsLib.includes("decodePrivatePresence"), "presence decode");

const friendsHook = readFileSync(join(root, "../../hooks/useValorantFriends.js"), "utf8");
assert(friendsHook.includes("inviteToParty"), "useValorantFriends exposes inviteToParty");
assert(friendsHook.includes("localFriends"), "hook loads local friends");

const friendsApi = readFileSync(join(root, "../../api/valorantFriends.js"), "utf8");
assert(friendsApi.includes("inviteValorantFriendToParty"), "friends API barrel");

assert(routes.includes("/friends/status"), "GET friends/status");
assert(routes.includes("/friends/party-invite"), "POST friends/party-invite");
assert(routes.includes("/friends/shape"), "POST friends/shape");
assert(routes.includes("/store/status"), "GET store/status stub");

assert(api.includes("inviteValorantFriendToParty") || friendsApi.includes("inviteValorantFriendToParty"), "friend party invite client");

assert(electronAuth.includes("valorant:local-friends"), "electron friends IPC");
assert(electronAuth.includes("/chat/v4/friends"), "local chat friends path");
assert(electronAuth.includes("/chat/v4/presences"), "local chat presence path");

assert(auth.includes("useValorantFriends") || auth.includes("Dima"), "auth panel defers friends UI to Dima");
assert(!auth.includes("CompanionFriendsPanel"), "no duplicated friends panel in AuthPanel");

assert(en.includes("friendsTitle"), "EN friends strings for Dima panel");
assert(tr.includes("friendsTitle"), "TR friends strings for Dima panel");

console.log("ValorantHub.selftest.mjs: ok");
