/**
 * Descall shows no Valorant / Riot content on profiles (2.11.16, R1).
 * Run: node frontend/src/components/social/noValorantProfile.selftest.mjs
 *
 * Covers the profile card (Settings → My Account), the hover card, the profile
 * modal and the shop live preview, plus the public `valorant` field that
 * /auth/me and /auth/users/:id used to return and the per-user Riot card route.
 * LFG / Companion / RSO are out of scope here (separate, pending removal).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "../..", rel), "utf8");
const backend = (rel) => readFileSync(join(here, "../../../backend", rel), "utf8");

assert.equal(existsSync(join(here, "ValorantBadge.jsx")), false, "ValorantBadge.jsx must stay deleted");
assert.equal(existsSync(join(here, "../settings/RiotLinkCard.jsx")), false, "RiotLinkCard.jsx must stay deleted");

for (const rel of [
  "components/layout/UserPanel.jsx",
  "components/social/UserHoverCard.jsx",
  "components/social/UserProfileModal.jsx",
  "components/settings/ShopProfilePreview.jsx",
]) {
  const file = src(rel);
  assert.doesNotMatch(file, /ValorantBadge|RiotLinkCard|getUserValorant/, `${rel}: no Valorant badge / Riot link card`);
  assert.doesNotMatch(file, /\.valorant\b|valorantState|\bvalorant\?\./, `${rel}: never reads a user's valorant card`);
  assert.doesNotMatch(file, /\bRR\b/, `${rel}: no Riot rank rating`);
}

assert.doesNotMatch(src("api/riot.js"), /getUserValorant/, "client never fetches another user's Riot card");
assert.doesNotMatch(src("styles/settings.css"), /\.val-badge|\.riot-link-/, "badge / link-card styles are gone");

const auth = backend("routes/auth.js");
assert.doesNotMatch(auth, /loadPublicValorant|publicRiotCard|user_riot_accounts/, "auth routes do not load Riot data");
assert.doesNotMatch(auth, /^\s*valorant,\s*$/m, "/auth/me and /auth/users/:id do not return `valorant`");

const riot = backend("routes/riot.js");
const usersRoute = riot.slice(riot.indexOf('router.get("/users/:userId"'), riot.indexOf("// POST /riot/link"));
assert.ok(usersRoute.length > 0, "the per-user route still answers installed builds");
assert.match(usersRoute, /valorant: null/, "the per-user Riot card is always empty");
assert.doesNotMatch(usersRoute, /supabase|publicRiotCard/, "the per-user route never reads user_riot_accounts");

console.log("noValorantProfile.selftest.mjs: ok");
