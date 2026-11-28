// node src/components/admin/invites/invitesAdmin.selftest.mjs
import assert from "node:assert/strict";
import { bandTone, deltaText, funnelRows, logText, signalRows } from "./invitesAdminModel.js";
import { INVITES_I18N } from "../../../i18n/locales/invites.i18n.js";

const tr = INVITES_I18N.tr;
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const t = (key, vars = {}) => {
  const raw = get({ dvt: tr }, key);
  if (typeof raw !== "string") return key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
};

assert.equal(bandTone("high"), "dg");
assert.equal(bandTone("medium"), "wa");
assert.equal(bandTone("low"), "ok");
assert.equal(deltaText(18, "tr"), "+%18");
assert.equal(deltaText(-4, "en"), "−4%");
assert.equal(deltaText(null), "–");

const rows = funnelRows({ opened: 1284, signups: 96, firstMessage: 58, returned: 41, paid: 38, held: 3, rates: { signup: 7.5, firstMessage: 60, returned: 71 } });
assert.deepEqual(rows.map((r) => r.value), [1284, 96, 58, 41, 38]);
assert.equal(rows[4].rateKey, "fHeld");
assert.equal(t("dvt.adm.fHeld", { n: rows[4].extra }), "3 bekletildi");

const sh = signalRows([
  { code: "same_device", count: 7, action: "hold" },
  { code: "same_subnet", count: 12, action: "warn" },
  { code: "disposable_email", count: 5, action: "deny" },
  { code: "fast_first_message", count: 2, action: "hold" },
  { code: "inviter_only", count: 4, action: "warn" },
]);
assert.deepEqual(sh.map((s) => [s.code, s.actionTone]), [["same_device", "wa"], ["same_subnet", ""], ["disposable_email", "dg"], ["fast_first_message", "wa"], ["inviter_only", ""]]);
assert.equal(t("dvt.adm.sh_fast_first_message", { s: 10 }), "Kayıt → mesaj < 10 sn");

assert.equal(logText({ kind: "auto_hold", inviter: "bora.aksoy", count: 9 }, t), "9 ödülü bekletti · @bora.aksoy");
assert.equal(logText({ kind: "rules", diff: [{ key: "monthlyCap", from: 25, to: 20 }] }, t), "aylık sınır 25 → 20");
assert.equal(logText({ kind: "paid", inviter: "kaanyz", invitee: "can.ozturk", amount: 150 }, t), "@kaanyz → @can.ozturk · 150 D");
assert.equal(logText({ kind: "release", inviter: "mert.dgn" }, t), "@mert.dgn bekletmesini kaldırdı");

// Every locale has the same keys as Turkish, and placeholders match.
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const trFlat = new Map(flat(tr));
for (const [loc, pack] of Object.entries(INVITES_I18N)) {
  const f = new Map(flat(pack));
  for (const [k, v] of trFlat) {
    assert.ok(f.has(k), `${loc} misses ${k}`);
    const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((x) => !/Gen$|Dat$/.test(x)).sort().join(",");
    const want = ph(v);
    const got = ph(f.get(k));
    // Languages may drop the Turkish-only case forms but must not invent unknown names.
    for (const name of got.split(",").filter(Boolean)) assert.ok(want.split(",").includes(name) || name === "name", `${loc} ${k}: unknown {${name}}`);
  }
  assert.equal(f.size, trFlat.size, `${loc} has extra keys`);
}
console.log("invitesAdmin selftest ok");
