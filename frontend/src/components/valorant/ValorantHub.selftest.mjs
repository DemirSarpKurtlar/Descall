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
assert(hub.includes('return "companion"'), "default tab must be Companion");
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
assert(routes.includes("/store/status"), "GET store/status");

assert(api.includes("inviteValorantFriendToParty") || friendsApi.includes("inviteValorantFriendToParty"), "friend party invite client");

assert(electronAuth.includes("valorant:local-friends"), "electron friends IPC");
assert(electronAuth.includes("/chat/v4/friends"), "local chat friends path");
assert(electronAuth.includes("/chat/v4/presences"), "local chat presence path");

assert(auth.includes("CompanionFriendsPanel"), "auth panel mounts CompanionFriendsPanel (Adım 4 UI)");

const friendsPanel = readFileSync(join(root, "CompanionFriendsPanel.jsx"), "utf8");
assert(friendsPanel.includes("useValorantFriends"), "friends panel uses Dimaru hook");
assert(friendsPanel.includes("inviteToParty"), "friends panel invites via hook");
assert(!friendsPanel.includes("inviteValorantParty("), "invite must use friends/party-invite path via hook, not parallel party invite");
assert(friendsPanel.includes("sendRequest"), "friends panel can send requests");
assert(friendsPanel.includes("acceptRequest"), "friends panel can accept requests");
assert(css.includes(".valorant-friends"), "friends panel styles exist");
assert(css.includes("grid-template-columns"), "companion uses full-width grid layout");
assert(hub.includes('return "companion"'), "selftest companion default reinforced");
assert(css.includes(".valorant-presence-dot"), "presence dot styles exist");

assert(en.includes("friendsTitle"), "EN friends strings");
assert(tr.includes("friendsTitle"), "TR friends strings");
assert(en.includes("presenceIngame"), "EN presence strings");
assert(tr.includes("presenceIngame"), "TR presence strings");


const missionsLib = readFileSync(join(root, "../../../backend/lib/valorantMissions.js"), "utf8");
assert(missionsLib.includes("notConfiguredPayload"), "missions missing-key payload");
assert(missionsLib.includes("RIOT_API_KEY"), "missions gates on RIOT_API_KEY");
assert(missionsLib.includes("/contracts/v1/contracts/"), "PD contracts path");
assert(/never logs tokens/i.test(missionsLib), "missions lib documents no token logging");

assert(routes.includes("/missions/status"), "GET missions/status");
assert(routes.includes('router.get("/missions"'), "GET /missions");
assert(routes.includes("/contracts/activate"), "POST contracts/activate");
assert(routes.includes("/battlepass"), "GET battlepass");

assert(api.includes("getValorantMissions"), "client exports getValorantMissions");
assert(api.includes("activateValorantContract"), "client exports activateValorantContract");

const missionsHook = readFileSync(join(root, "../../hooks/useValorantMissions.js"), "utf8");
assert(missionsHook.includes("getValorantMissions"), "useValorantMissions loads missions");
assert(missionsHook.includes("activate"), "hook exposes activate");

assert(auth.includes("CompanionMissionsPanel"), "auth panel mounts CompanionMissionsPanel (Adım 5)");
assert(en.includes("missionsTitle"), "EN missions strings");
assert(tr.includes("missionsTitle"), "TR missions strings");
assert(css.includes(".valorant-missions"), "missions panel styles exist");
assert(css.includes(".valorant-missions-bp"), "missions BP card styles");
const missionsUi = readFileSync(join(root, "CompanionMissionsPanel.jsx"), "utf8");
assert(missionsUi.includes("useValorantMissions"), "missions panel keeps hook");
assert(missionsUi.includes("activate("), "missions panel can activate contracts");
assert(!missionsUi.includes("missionsStubNote"), "stub note removed");

const storeLib = readFileSync(join(root, "../../../backend/lib/valorantStore.js"), "utf8");
assert(storeLib.includes("notConfiguredPayload"), "store missing-key payload");
assert(storeLib.includes("RIOT_API_KEY"), "store gates on RIOT_API_KEY");
assert(storeLib.includes("/store/v1/wallet/"), "PD wallet path");
assert(storeLib.includes("/personalization/v2/players/"), "PD loadout path");
assert(storeLib.includes("/store/v2/storefront/"), "PD storefront path");
assert(/never logs tokens/i.test(storeLib), "store lib documents no token logging");

assert(routes.includes('router.get("/wallet"'), "GET /wallet");
assert(routes.includes("/inventory/skins"), "GET inventory/skins");
assert(routes.includes('router.get("/loadout"'), "GET /loadout");
assert(routes.includes('router.put("/loadout"'), "PUT /loadout");
assert(routes.includes("/store/offers"), "GET store/offers");

assert(api.includes("getValorantWallet"), "client exports getValorantWallet");
assert(api.includes("putValorantLoadout"), "client exports putValorantLoadout");
assert(api.includes("getValorantStoreOffers"), "client exports getValorantStoreOffers");

const storeHook = readFileSync(join(root, "../../hooks/useValorantStore.js"), "utf8");
assert(storeHook.includes("getValorantWallet"), "useValorantStore loads wallet");
assert(storeHook.includes("getValorantStoreOffers"), "useValorantStore loads offers");
const loadoutHook = readFileSync(join(root, "../../hooks/useValorantLoadout.js"), "utf8");
assert(loadoutHook.includes("putValorantLoadout"), "useValorantLoadout can equip");
assert(loadoutHook.includes("equip"), "hook exposes equip");

assert(auth.includes("CompanionStorePanel"), "auth panel mounts CompanionStorePanel (Adım 6)");
assert(auth.includes("CompanionLoadoutPanel"), "auth panel mounts CompanionLoadoutPanel (Adım 6)");
assert(en.includes("storeWallet"), "EN store wallet strings");
assert(tr.includes("storeWallet"), "TR store wallet strings");
assert(en.includes("loadoutTitle"), "EN loadout strings");
assert(tr.includes("loadoutTitle"), "TR loadout strings");
assert(css.includes(".valorant-store"), "store panel styles exist");
assert(css.includes(".valorant-loadout"), "loadout panel styles exist");
const storeUi = readFileSync(join(root, "CompanionStorePanel.jsx"), "utf8");
assert(storeUi.includes("useValorantStore"), "store panel keeps hook");
const loadoutUi = readFileSync(join(root, "CompanionLoadoutPanel.jsx"), "utf8");
assert(loadoutUi.includes("useValorantLoadout"), "loadout panel keeps hook");
assert(loadoutUi.includes("equip"), "loadout panel surfaces equip contract");

console.log("ValorantHub.selftest.mjs: ok");
