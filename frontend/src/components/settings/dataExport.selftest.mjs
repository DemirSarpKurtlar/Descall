// node src/components/settings/dataExport.selftest.mjs
// KVKK veri dışa aktarma (3.6.0): Gizlilik shows the card, the server asks for
// the password / code, admins get the same file from the dossier, copy in both
// languages, files are saved on iPhone too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const card = rd("./DataExportCard.jsx");
const panel = rd("../layout/UserPanel.jsx");
const dossier = rd("../admin/AdminUserDossier.jsx");
const save = rd("../../lib/saveFile.js");
const route = rd("../../../backend/routes/dataExport.js");
const server = rd("../../../backend/server.js");
const lib = rd("../../../backend/lib/dataExport.js");

assert.match(panel, /<DataExportCard \/>/);
assert.match(card, /authedRequest\("\/api\/me\/data-export", \{ method: "POST", body \}\)/);
assert.match(server, /app\.use\("\/api\/me", require\("\.\/routes\/dataExport"\)\)/);
assert.match(route, /bcrypt\.compare\(req\.body\.password, user\.password_hash\)/, "password asked again");
assert.match(route, /verifySecondFactor\(id, req\.body\?\.code/, "authenticator code when there is no password");
assert.match(route, /const EXPORTS = \{ windowMs: DAY, max: 3 \}/, "3 a day");
assert.match(dossier, /adminFetch\(`\/people\/\$\{userId\}\/export`\)/);
assert.match(save, /navigator\.share\(\{ files: \[file\]/, "iPhone app saves through the share sheet");
assert.match(save, /a\.download = filename/);
for (const secret of ["password_hash", "totp_secret_enc", "totp_recovery_hashes", "password_reset_token", "confirmation_token", "apple_refresh_token"]) {
  const profile = lib.match(/const PROFILE_COLS = \[([\s\S]*?)\];/)[1];
  assert.ok(!profile.includes(`"${secret}"`), `profile never selects ${secret}`);
}

const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
for (const key of new Set([...card.matchAll(/t\("dex\.(\w+)"\)/g)].map((m) => m[1]))) {
  const re = new RegExp(`"dex": \\{[\\s\\S]*?"${key}":`);
  assert.ok(re.test(tr), `tr dex.${key}`);
  assert.ok(re.test(en), `en dex.${key}`);
}
assert.ok(/"dataExport":/.test(tr) && /"dataExport":/.test(en));
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(card), "no emoji");
console.log("dataExport.selftest: ok");
