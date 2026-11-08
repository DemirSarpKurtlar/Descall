/**
 * Invite landings for logged-out visitors (Nov 2026), source checks:
 *   - one clear "Join with a free account" button (register) on the server, vanity and group
 *     landings, "I already have an account" as the second choice;
 *   - auto-join only for the landing resumed after sign-up / login (pending slot), never for
 *     a link opened inside the app, and cleared when the landing closes.
 * The flow itself runs in e2e/serverInvite.e2e.cjs.
 * Run: node src/lib/inviteLandingAutoJoin.source.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(src, p), "utf8");

for (const file of ["components/servers/ServerInviteLanding.jsx", "components/servers/ServerVanityLanding.jsx", "components/groups/GroupInviteLanding.jsx"]) {
  const s = read(file);
  assert.ok(s.includes('t("invl.joinFree")') && s.includes('t("invl.haveAccount")'), `${file}: join-free + have-account buttons`);
  assert.ok(!s.includes('t("Sign up and join")') && !s.includes('t("Log in to join")'), `${file}: no competing sign-up / log-in CTAs`);
  assert.ok(/autoJoin = false/.test(s), `${file}: autoJoin is opt-in`);
  assert.ok(/autoTried\.current = true;\s*joinRef\.current\?\.\(\);/.test(s), `${file}: joins at most once`);
  assert.ok(/if \(!autoJoin \|\| !me \|\| loading/.test(s), `${file}: only signed in, after the preview loaded`);
}
assert.ok(/onClick=\{\(\) => needAuth\("register"\)\}[\s\S]{0,160}invl\.joinFree/.test(read("components/servers/ServerInviteLanding.jsx")), "server: join-free opens sign-up");

const app = read("App.jsx");
const sets = [...app.matchAll(/setLandingAutoJoin\(\{ kind: "(server|vanity|group)", value: (\w+) \}\)/g)].map((m) => `${m[1]}:${m[2]}`);
assert.deepEqual(sets, ["server:pendingServerInvite", "vanity:pendingVanity", "group:pending"], "auto-join is set only where a pending landing is resumed, keyed by its code");
const resume = app.slice(app.indexOf("// After login, resume a pending group invite or server vanity link"));
assert.ok(resume.indexOf('setLandingAutoJoin({ kind: "group"') < resume.indexOf("const handleServerVanityJoined"), "set inside the resume effect");
assert.ok((app.match(/setLandingAutoJoin\(null\)/g) || []).length >= 5, "cleared on join / dismiss of every landing");
for (const [kind, state] of [["server", "serverInviteCode"], ["vanity", "serverVanitySlug"], ["group", "inviteCode"]]) {
  // Another invite opened later inside the app has another code: joining stays a click.
  assert.ok(app.includes(`autoJoin={landingAutoJoin?.kind === "${kind}" && landingAutoJoin.value === ${state}}`), `${kind} landing: only the resumed code`);
}

const api = read("api/auth.js");
// The signup-context wrapper (client platform) may sit outside the invite wrapper.
assert.ok(/JSON\.stringify\((?:withSignupContext\()?withSignupInvite\(withAttribution\(payload \|\| \{\}\)\)\)/.test(api), "register sends the invite");
assert.equal((api.match(/withSignupInvite\(withAttribution\(/g) || []).length, 3, "register, Google and Apple send it");

console.log("inviteLandingAutoJoin.source selftest ok");
