"use strict";

/** Davet ödülleri: pure model, rules and texts. node lib/referrals/model.selftest.cjs */

const assert = require("assert");
const model = require("./model");
const rulesLib = require("./rules");
const texts = require("./texts");

const R = rulesLib.normalizeStored(null);
const H = model.HOUR;
const T0 = Date.UTC(2026, 10, 26, 21, 28);
const iso = (t) => new Date(t).toISOString();

// ---- channels / hashing
assert.strictEqual(model.normalizeChannel("WhatsApp"), "wa");
assert.strictEqual(model.normalizeChannel("cp"), "link");
assert.strictEqual(model.normalizeChannel("mo"), "other");
assert.strictEqual(model.normalizeChannel("evil"), null);
assert.strictEqual(model.subnetOf("85.105.12.40"), "85.105.12");
assert.strictEqual(model.subnetOf("::ffff:10.1.2.3"), "10.1.2");
const h1 = model.hashOf("device", "abc", "salt");
assert.strictEqual(h1, model.hashOf("device", "abc", "salt"));
assert.notStrictEqual(h1, model.hashOf("ip", "abc", "salt"), "kind is part of the hash");
assert.strictEqual(model.hashOf("device", "", "salt"), null);
assert.strictEqual(model.clusterLabel("a3f9deadbeef"), "a3f9");
assert.strictEqual(model.emailDomain("Can@Mailinator.com"), "mailinator.com");

// ---- unlock: first message + return after 24 h, inside 72 h
const row = (extra) => ({ id: "r1", status: "pending", signup_at: iso(T0), created_at: iso(T0), risk_signals: [], ...extra });
assert.strictEqual(model.evaluateUnlock(row({}), R, T0 + 2 * H), "wait");
assert.strictEqual(model.evaluateUnlock(row({ first_message_at: iso(T0 + H) }), R, T0 + 2 * H), "wait", "no return yet");
assert.strictEqual(model.evaluateUnlock(row({ first_message_at: iso(T0 + H), returned_at: iso(T0 + 20 * H) }), R, T0 + 21 * H), "wait", "same-day visit is not a return");
assert.strictEqual(model.evaluateUnlock(row({ first_message_at: iso(T0 + H), returned_at: iso(T0 + 25 * H) }), R, T0 + 25 * H), "pay");
assert.strictEqual(model.evaluateUnlock(row({ first_message_at: iso(T0 + 30 * H) }), R, T0 + 30 * H), "pay", "a first message the next day is the return");
assert.strictEqual(model.evaluateUnlock(row({ returned_at: iso(T0 + 30 * H) }), R, T0 + 30 * H), "wait", "return without a message waits");
assert.strictEqual(model.evaluateUnlock(row({}), R, T0 + 73 * H), "expire");
assert.strictEqual(model.evaluateUnlock(row({ first_message_at: iso(T0 + 80 * H) }), R, T0 + 80 * H), "expire", "too late");
assert.strictEqual(model.evaluateUnlock(row({ status: "held", first_message_at: iso(T0 + H), returned_at: iso(T0 + 25 * H) }), R, T0 + 25 * H), "wait", "held never pays");

// ---- views
let v = model.statusView(row({ first_message_at: iso(T0 + H) }), R, T0 + 10 * H);
assert.strictEqual(v.key, "waiting_return");
assert.strictEqual(v.countdownMs, 14 * H, "draft: '2. gün dönüşü · 14 sa'");
v = model.statusView(row({}), R, T0 + 5 * H);
assert.strictEqual(v.key, "waiting_message");
assert.strictEqual(model.statusView(row({ status: "held", hold_reason: "same_device" }), R).key, "reviewing");
assert.deepStrictEqual(model.stageOf(row({ first_message_at: iso(T0) })), { stage: 3, of: 4, waiting: true });
assert.strictEqual(model.stageOf(row({ status: "paid" })).stage, 4);
assert.strictEqual(model.stageOf(row({})).stage, 2);

// ---- signals and decisions
const sigs = model.signupSignals({
  deviceHash: "dev1",
  subnetHash: "net1",
  disposable: true,
  inviterDevices: ["dev0"],
  inviterSubnets: [],
  siblings: [{ device_hash: "dev1", subnet_hash: "net1" }, { device_hash: "dev2" }],
});
assert.deepStrictEqual(sigs.map((s) => s.code).sort(), ["disposable_email", "same_device", "same_subnet"]);
assert.strictEqual(model.decide(sigs, R), "deny", "throwaway email: no reward");
assert.strictEqual(model.decide(sigs.filter((s) => s.code !== "disposable_email"), R), "hold");
assert.strictEqual(model.decide([{ code: "same_subnet" }], R), "warn");
assert.strictEqual(model.decide([], R), "none");
const own = model.signupSignals({ deviceHash: "dev0", inviterDevices: ["dev0"], siblings: [] });
assert.strictEqual(own[0].code, "inviter_device");
const ms1 = model.messageSignals({ signupAt: iso(T0), at: iso(T0 + 4000), peerIsInviter: true, rules: R });
assert.deepStrictEqual(ms1.map((s) => s.code), ["fast_first_message", "inviter_only"]);
assert.strictEqual(ms1[0].detail.seconds, 4);
assert.strictEqual(model.decide(ms1, R), "hold");
assert.ok(model.rowRisk(sigs) > model.rowRisk([{ code: "same_subnet" }]));

// ---- inviter risk
const clean = Array.from({ length: 20 }, (_, i) => ({ status: i < 14 ? "paid" : "pending", risk_signals: [] }));
const dirty = Array.from({ length: 19 }, (_, i) => ({
  status: i < 2 ? "paid" : "held",
  risk_signals: i < 7 ? [{ code: "same_device" }] : i < 10 ? [{ code: "disposable_email" }] : i < 12 ? [{ code: "fast_first_message" }] : [],
}));
const rc = model.inviterRisk(clean);
const rd = model.inviterRisk(dirty);
assert.strictEqual(rc.band, "low");
assert.strictEqual(rd.band, "high");
assert.ok(rd.score >= 70 && rd.score <= 100, `dirty risk ${rd.score}`);
assert.strictEqual(rd.counts.devices, 7);

// ---- anomaly: 9 in an hour vs 1.5 a window baseline, 7 risky
assert.strictEqual(model.detectAnomaly({ recent: 9, baselinePerWindow: 1.5, riskyRecent: 7 }, R).flagged, true);
assert.strictEqual(model.detectAnomaly({ recent: 9, baselinePerWindow: 1.5, riskyRecent: 0 }, R).flagged, false, "needs overlapping signals");
assert.strictEqual(model.detectAnomaly({ recent: 3, baselinePerWindow: 0, riskyRecent: 3 }, R).flagged, false, "needs a burst");
assert.strictEqual(model.detectAnomaly({ recent: 9, baselinePerWindow: 3, riskyRecent: 5 }, R).flagged, false, "not 6x normal");

// ---- milestones
const mv = model.milestonesView(6, R, [{ milestone: 3, amount: 250 }]);
assert.strictEqual(mv.next, 10);
assert.deepStrictEqual(mv.list.map((m) => [m.at, m.claimed, m.left]), [[3, true, 0], [10, false, 4], [25, false, 19]]);

// ---- funnels and channels
const now = T0 + 3 * model.DAY;
const rows = [
  { status: "paid", channel: "wa", signup_at: iso(T0), first_message_at: iso(T0 + H), paid_at: iso(T0 + 26 * H), risk_signals: [] },
  { status: "pending", channel: "wa", signup_at: iso(T0 + H), first_message_at: iso(T0 + 2 * H), risk_signals: [] },
  { status: "pending", channel: "tt", signup_at: iso(T0 + 2 * H), risk_signals: [] },
  { status: "held", channel: "ig", signup_at: iso(T0 + 3 * H), risk_signals: [{ code: "same_device" }, { code: "inviter_device" }] },
];
const opens = Array.from({ length: 10 }, (_, i) => ({ opened_at: iso(T0 + i * H), channel: i % 2 ? "wa" : "ig" }));
const pf = model.personalFunnel({ rows, opens }, now);
assert.deepStrictEqual([pf.opened, pf.signedUp, pf.firstMessage, pf.active], [10, 4, 2, 1]);
assert.strictEqual(pf.series.opened.length, 12);
assert.strictEqual(pf.series.opened.reduce((a, b) => a + b, 0), 10);
const share = model.channelShare(rows);
assert.deepStrictEqual(share.map((s) => [s.channel, s.pct]), [["wa", 50], ["ig", 25], ["tt", 25]]);
const card = model.channelScorecard({ rows, opens });
assert.deepStrictEqual(card.find((c) => c.channel === "wa"), { channel: "wa", opens: 5, signups: 2, active: 1 });
const af = model.adminFunnel({ rows, opens });
assert.deepStrictEqual([af.opened, af.signups, af.firstMessage, af.paid, af.held], [10, 4, 2, 1, 1]);
const shield = model.shieldCounts(rows, R);
assert.strictEqual(shield.find((s) => s.code === "same_device").count, 2, "inviter device folds into same device");
assert.ok(!shield.find((s) => s.code === "inviter_device"));
const top = model.topInviters([{ ...rows[0], inviter_id: "a" }, { ...rows[1], inviter_id: "b" }, { ...rows[2], inviter_id: "b" }], new Map([["a", 4]]), "signups");
assert.strictEqual(top[0].inviterId, "b");
assert.strictEqual(model.topInviters([{ ...rows[0], inviter_id: "a" }, { ...rows[1], inviter_id: "b" }], null, "active")[0].inviterId, "a");

// ---- rules
assert.throws(() => rulesLib.validateRules({ monthlyCap: -1 }), /monthlyCap/);
assert.throws(() => rulesLib.validateRules({ returnAfterHours: 80 }), /returnWindowHours/);
assert.throws(() => rulesLib.validateRules({ milestones: [{ at: 5 }, { at: 3 }] }), /grow/);
assert.throws(() => rulesLib.validateRules({ signals: { same_device: "explode" } }), /signals.same_device/);
const edited = rulesLib.validateRules({ monthlyCap: 25, junk: 1 });
assert.strictEqual(edited.monthlyCap, 25);
assert.ok(!("junk" in edited));
assert.deepStrictEqual(rulesLib.diffRules(R, edited), [{ key: "monthlyCap", from: 20, to: 25 }]);
assert.deepStrictEqual(rulesLib.diffRules(edited, rulesLib.validateRules({ signals: { same_subnet: "hold" } }, edited)), [{ key: "signals.same_subnet", from: "warn", to: "hold" }]);
assert.strictEqual(rulesLib.normalizeStored({ monthlyCap: "x" }).monthlyCap, 20, "a broken stored version falls back");

// ---- texts
assert.strictEqual(texts.trPossessive(7), "7'si");
assert.strictEqual(texts.trPossessive(3), "3'ü");
assert.strictEqual(texts.trPossessive(6), "6'sı");
assert.strictEqual(texts.trPossessive(10), "10'u");
assert.strictEqual(texts.trPossessive(40), "40'ı");
assert.strictEqual(texts.trPossessive(100), "100'ü");
assert.strictEqual(texts.trPossessive(1000), "1000'i");
assert.strictEqual(
  texts.noticeText("revokeInviter", { lang: "tr", count: 7, amount: 700, reasonCode: "same_device" }),
  "Davetlerinden 7'si incelendi ve ödül şartlarını karşılamadı (aynı cihazdan açılmış hesaplar). 700 D geri alındı. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.",
  "matches the draft's 'Bora'nın göreceği'"
);
assert.ok(/2\.000 D/.test(texts.noticeText("revokeInviter", { lang: "tr", count: 1, amount: 2000, reasonCode: "other", note: "x" })));
assert.ok(!/D geri/.test(texts.noticeText("revokeInviter", { lang: "tr", count: 2, amount: 0, reasonCode: "fake_activity" })), "no money line when nothing was taken");
assert.ok(texts.noticeText("revokeInviter", { lang: "en", count: 2, amount: 200, reasonCode: "other", note: "Test note" }).includes("(Test note)"));
for (const lang of texts.LOCALES) {
  for (const kind of ["revokeInviter", "revokeInvitee", "holdInviter", "releaseInviter", "pausedInviter", "resumedInviter"]) {
    const t = texts.noticeText(kind, { lang, count: 3, amount: 300, reasonCode: "same_device" });
    assert.ok(t && t.length > 10 && !/undefined|\{/.test(t), `${lang} ${kind}`);
  }
  for (let i = 0; i < 3; i += 1) assert.ok(texts.nudgeText({ lang, name: "Mert", variant: i }).includes("Mert"), `${lang} nudge ${i}`);
}
assert.strictEqual(texts.langOf("pt"), "pt-BR");
assert.strictEqual(texts.langOf("xx"), "tr");
assert.strictEqual(texts.reasonText("nope", "tr"), texts.reasonText("other", "tr"));

console.log("referrals model selftest ok");

// ---- exclusive cosmetics in the rules
{
  const COS = require("../../catalog/referral/cosmetics");
  const def = rulesLib.normalizeStored(null);
  assert.deepStrictEqual(def.milestones.map((m) => m.itemIds), [[COS.IDS.badge], [COS.IDS.frame], [COS.IDS.banner, COS.IDS.glow]]);
  assert.deepStrictEqual(def.inviteeItemIds, [COS.IDS.invited]);
  const legacy = rulesLib.validateRules({ milestones: [{ at: 3, amount: 100, itemId: "s2-x" }], inviteeItemId: "abc-123" });
  assert.deepStrictEqual(legacy.milestones[0].itemIds, ["s2-x"]);
  assert.deepStrictEqual(legacy.inviteeItemIds, ["abc-123"]);
  const kept = rulesLib.validateRules({ milestones: [{ at: 10, amount: 900 }] });
  assert.deepStrictEqual(kept.milestones[0].itemIds, [COS.IDS.frame], "editing an amount keeps the items");
  assert.ok(COS.rows().every((r) => r.active === false && r.tags.includes("exclusive") && r.sku.startsWith("s2-")), "never on sale");
  assert.ok(/ON CONFLICT \(sku\) DO NOTHING/.test(COS.sql()));
  console.log("referrals cosmetics rules ok");
}
