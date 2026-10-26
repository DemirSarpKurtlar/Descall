"use strict";

/**
 * Unit coverage for the DesCoin anti-bot Faz 0 (monitor only) building blocks:
 * hashing / subnets, risk scoring, account-link rule, message rules, the
 * monitor-only flag lock, alert flags (recorded, not sent by default) and the
 * missing-table tolerance of the store.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.DESCOIN_ANTIBOT_HASH_SECRET;

const assert = require("assert");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

let fake = createFakeSupabase({});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  get exports() {
    return fake;
  },
};

const hashing = require("../lib/descoinAntibot/hashing");
const risk = require("../lib/descoinAntibot/risk");
const messageRules = require("../lib/descoinAntibot/messageRules");
const config = require("../lib/descoinAntibot/config");
const alerts = require("../lib/descoinAntibot/alerts");
const store = require("../lib/descoinAntibot/store");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// --- hashing -----------------------------------------------------------------

test("ipSubnet reduces IPv4 to /24 and IPv6 to /64", () => {
  assert.strictEqual(hashing.ipSubnet("203.0.113.77"), "203.0.113.0/24");
  assert.strictEqual(hashing.ipSubnet("::ffff:203.0.113.9"), "203.0.113.0/24");
  assert.strictEqual(hashing.ipSubnet("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.strictEqual(hashing.ipSubnet("2001:db8::1"), hashing.ipSubnet("2001:0db8:0:0:ffff::9"));
  assert.strictEqual(hashing.ipSubnet("999.1.1.1"), null);
  assert.strictEqual(hashing.ipSubnet("unknown"), null);
  assert.strictEqual(hashing.ipSubnet("not-an-ip"), null);
});

test("private / loopback networks are never hashed", () => {
  for (const ip of ["10.1.2.3", "192.168.1.5", "172.16.4.4", "127.0.0.1", "::1", "fd00::1", "fe80::1"]) {
    assert.strictEqual(hashing.hashSubnet(ip), null, ip);
  }
});

test("subnet hash is keyed, stable and never contains the address", () => {
  const a = hashing.hashSubnet("203.0.113.10");
  const b = hashing.hashSubnet("203.0.113.200");
  assert.ok(a && a === b, "same /24 → same hash");
  assert.notStrictEqual(a, hashing.hashSubnet("198.51.100.1"));
  assert.ok(!a.includes("203.0.113"), "hash must not embed the address");
  assert.ok(/^[A-Za-z0-9_-]{16,128}$/.test(a), "opaque token");
  const before = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "another-secret";
  assert.notStrictEqual(hashing.hashSubnet("203.0.113.10"), a, "different key → different hash");
  process.env.JWT_SECRET = before;
});

test("no secret configured → no hashes at all (no constant fallback)", () => {
  const before = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.strictEqual(hashing.hashSubnet("203.0.113.10"), null);
    assert.strictEqual(hashing.hashFingerprint("abc123"), null);
    assert.strictEqual(hashing.hashConversation("dm:a:b"), null);
  } finally {
    process.env.JWT_SECRET = before;
  }
});

test("fingerprint hashing rejects oversized input", () => {
  assert.ok(hashing.hashFingerprint("x".repeat(64)));
  assert.strictEqual(hashing.hashFingerprint("x".repeat(600)), null);
});

// --- risk ----------------------------------------------------------------------

const base = {
  messageCv: null,
  automationUa: false,
  webdriver: false,
  headlessHints: false,
  activeHours24: 4,
  dayCapsHit: 0,
  linked: false,
  referralInsular: false,
  accountAgeDays: 100,
  emailVerified: true,
  clientSignalsSeen: false,
};

test("an ordinary account scores 0 (missing client signals is not counted yet)", () => {
  assert.deepStrictEqual(risk.scoreRisk(base), { score: 0, reasons: [] });
  assert.deepStrictEqual(risk.scoreRisk({ ...base, clientSignalsExpected: true }).reasons, ["missing_client_signals"]);
});

test("risk reasons and weights add up and cap at 100", () => {
  const r = risk.scoreRisk({ ...base, messageCv: 0.05, automationUa: true, linked: true, activeHours24: 20 });
  assert.deepStrictEqual(r.reasons.sort(), ["automation_client", "linked_account", "rate_extreme", "timing_regular"]);
  assert.strictEqual(r.score, 100);
  assert.strictEqual(risk.scoreRisk({ ...base, accountAgeDays: 1, emailVerified: false }).score, 10);
  assert.strictEqual(risk.scoreRisk({ ...base, accountAgeDays: 1, emailVerified: true }).score, 0);
  assert.strictEqual(risk.scoreRisk({ ...base, dayCapsHit: 3 }).score, 15);
});

test("timingCv detects metronome-like sending", () => {
  const regular = Array.from({ length: 20 }, (_, i) => i * 30_000);
  assert.ok(risk.timingCv(regular) < 0.01);
  let t = 0;
  const human = Array.from({ length: 20 }, (_, i) => (t += 5_000 + ((i * 7919) % 97) * 1_000));
  assert.ok(risk.timingCv(human) > 0.15);
  assert.strictEqual(risk.timingCv([1, 2, 3]), null, "too few samples → no signal");
});

test("automation UA detection", () => {
  assert.ok(risk.isAutomationUa("python-requests/2.31"));
  assert.ok(risk.isAutomationUa("Mozilla/5.0 HeadlessChrome/120"));
  assert.ok(!risk.isAutomationUa("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15"));
});

test("multiplierFor is what a later stage would apply (trusted → always 1)", () => {
  assert.strictEqual(risk.multiplierFor(10, false), 1);
  assert.strictEqual(risk.multiplierFor(40, false), 0.5);
  assert.strictEqual(risk.multiplierFor(70, false), 0);
  assert.strictEqual(risk.multiplierFor(100, true), 1);
});

test("accounts are linked only with >= 2 independent signals", () => {
  assert.strictEqual(risk.linkStrength({ sameSubnet: true }).linked, false, "shared school / family network alone");
  assert.strictEqual(risk.linkStrength({ sameDevice: true }).linked, false, "shared family PC alone");
  const r = risk.linkStrength({ sameDevice: true, referralPair: true });
  assert.strictEqual(r.linked, true);
  assert.deepStrictEqual(r.kinds, ["same_device", "referral_pair"]);
});

// --- message rules (shadow) ------------------------------------------------------

test("message rules: short, similar, self-DM, no reply, alternating turns", () => {
  const now = 1_000_000;
  const p = {
    userId: "a",
    dmPeerId: null,
    history: [],
    convLog: [{ userId: "b", at: now - 1000 }],
    lastCreditedHereAt: 0,
    isRealOther: () => true,
    counterpartCreditsToday: new Map([["c", 3]]),
    dayCap: 30,
    now,
    salt: 1234,
  };
  assert.strictEqual(messageRules.evaluateMessage({ ...p, text: "ok" }).reason, "too_short");
  assert.strictEqual(messageRules.evaluateMessage({ ...p, text: "merhaba nasılsın", dmPeerId: "a" }).reason, "self_dm");
  const first = messageRules.evaluateMessage({ ...p, text: "bu akşam maça geliyor musun?" });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.counterpartId, "b");
  const again = messageRules.evaluateMessage({ ...p, text: "bu akşam maça geliyor musun??", history: [first.signature] });
  assert.strictEqual(again.reason, "similar");
  assert.strictEqual(messageRules.evaluateMessage({ ...p, text: "kimse cevap vermedi ama yazıyorum", convLog: [] }).reason, "no_reply");
  assert.strictEqual(
    messageRules.evaluateMessage({ ...p, text: "ikinci mesajım bu sıra bende", lastCreditedHereAt: now - 500 }).reason,
    "same_turn"
  );
});

test("keyed MinHash: different salt → different signature for the same text", () => {
  const n = messageRules.normalize("aynı metin aynı metin");
  assert.notDeepStrictEqual(messageRules.minhash(n, 1), messageRules.minhash(n, 2));
  assert.deepStrictEqual(messageRules.minhash(n, 7), messageRules.minhash(n, 7));
});

// --- flags -------------------------------------------------------------------------

test("monitor on by default; enforcing stages are locked off even if env asks", () => {
  assert.strictEqual(config.ENFORCEMENT_BUILD, false);
  assert.deepStrictEqual(config.getFlags({}), {
    monitor: true,
    rates: false,
    messageRules: false,
    referralPending: false,
    mediaRules: false,
    withhold: false,
  });
  const env = {
    DESCOIN_ANTIBOT_RATES: "1",
    DESCOIN_ANTIBOT_MESSAGE_RULES: "true",
    DESCOIN_ANTIBOT_REFERRAL_PENDING: "on",
    DESCOIN_ANTIBOT_MEDIA_RULES: "1",
    DESCOIN_ANTIBOT_WITHHOLD: "1",
  };
  const f = config.getFlags(env);
  for (const k of ["rates", "messageRules", "referralPending", "mediaRules", "withhold"]) assert.strictEqual(f[k], false, k);
  assert.strictEqual(config.getRequestedFlags(env).withhold, true, "requested value is still reported");
  assert.strictEqual(config.getFlags({ DESCOIN_ANTIBOT_MONITOR: "0" }).monitor, false);
  assert.strictEqual(config.collecting({ monitor: false }), false);
});

test("alert flags default off, threshold 70, bounded", () => {
  assert.deepStrictEqual(config.getAlertFlags({}), { email: false, push: false, minScore: 70 });
  assert.strictEqual(config.getAlertFlags({ DESCOIN_ANTIBOT_ALERT_MIN: "500" }).minScore, 70);
  assert.strictEqual(config.getAlertFlags({ DESCOIN_ANTIBOT_ALERT_MIN: "55" }).minScore, 55);
  assert.strictEqual(config.RETENTION_DAYS, 90);
});

// --- alerts --------------------------------------------------------------------------

function crossing(id, score) {
  return { user_id: id, score, prevScore: 10, trusted: false, reasons: ["automation_client", "linked_account"] };
}

test("alerts: flags off → recorded only, nothing sent", async () => {
  fake = createFakeSupabase({ users: [{ id: "u-admin", is_admin: true }] });
  store._reset();
  alerts._reset();
  let sent = 0;
  const deps = { sendEmail: async () => (sent += 1), sendPush: async () => (sent += 1), listAdminIds: async () => ["u-admin"] };
  const r = await alerts.processCrossings([crossing("u-1", 80), crossing("u-2", 30), { ...crossing("u-3", 90), trusted: true }], deps);
  assert.strictEqual(r.recorded, 1);
  assert.strictEqual(sent, 0);
  const rows = fake._tables.descoin_risk_alerts.rows;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].user_id, "u-1");
  assert.strictEqual(rows[0].email_enabled, false);
  assert.strictEqual(rows[0].push_enabled, false);
  // Same account again within 24 h → not re-alerted.
  const again = await alerts.processCrossings([crossing("u-1", 85)], deps);
  assert.strictEqual(again.recorded, 0);
});

test("alerts: flags on → one digest email + admin push, counts only (no PII)", async () => {
  fake = createFakeSupabase({});
  store._reset();
  alerts._reset();
  process.env.DESCOIN_ANTIBOT_ALERT_EMAIL = "1";
  process.env.DESCOIN_ANTIBOT_ALERT_PUSH = "1";
  try {
    const emails = [];
    const pushes = [];
    const deps = {
      sendEmail: async (m) => (emails.push(m), { sent: true }),
      sendPush: async (ids, ev) => pushes.push({ ids, ev }),
      listAdminIds: async () => ["u-admin"],
      now: () => 10_000_000,
    };
    const r = await alerts.processCrossings([crossing("u-secret-id-1", 80), crossing("u-secret-id-2", 95)], deps);
    assert.strictEqual(r.recorded, 2);
    assert.strictEqual(emails.length, 1);
    assert.strictEqual(pushes.length, 1);
    assert.deepStrictEqual(pushes[0].ids, ["u-admin"]);
    assert.deepStrictEqual(pushes[0].ev, { type: "admin-antibot", count: 2, topScore: 95 });
    const blob = JSON.stringify(emails[0]);
    assert.ok(!blob.includes("u-secret-id"), "email must not contain user ids");
    assert.ok(emails[0].subject.includes("2 hesap"));
    assert.strictEqual(emails[0].to, "demirkurtlar@icloud.com");
    // A second crossing inside the 30-minute digest window is not sent immediately.
    const r2 = await alerts.processCrossings([crossing("u-secret-id-3", 99)], deps);
    assert.strictEqual(r2.emailed, false);
    assert.strictEqual(emails.length, 1);
  } finally {
    delete process.env.DESCOIN_ANTIBOT_ALERT_EMAIL;
    delete process.env.DESCOIN_ANTIBOT_ALERT_PUSH;
  }
});

test("iOS alert push renders admin-antibot with counts only", () => {
  const push = require("../lib/iosAlertPush");
  for (const lang of ["tr", "en"]) {
    const d = push.describeEvent({ type: "admin-antibot", count: 3, topScore: 88, userId: "u-leak" }, lang);
    assert.ok(d, lang);
    assert.strictEqual(d.collapseId, "admin-antibot");
    assert.ok(d.body.includes("3") && d.body.includes("88"), d.body);
    assert.deepStrictEqual(d.data, { type: "admin-antibot", count: 3, topScore: 88 });
    const req = push.buildAlertRequest({ type: "admin-antibot", count: 3, topScore: 88, userId: "u-leak" }, lang);
    assert.ok(!JSON.stringify(req).includes("u-leak"), "no ids in the push");
  }
});

// --- store ----------------------------------------------------------------------------

test("store: a missing table latches off after one warning and never throws", async () => {
  fake = createFakeSupabase({}, { missingTables: ["descoin_risk"] });
  store._reset();
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  try {
    const a = await store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("*"));
    assert.ok(a.error && !a.skipped);
    const b = await store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("*"));
    assert.strictEqual(b.skipped, true);
    assert.strictEqual(store.available("descoin_risk"), false);
    assert.strictEqual(warns.length, 1);
    const c = await store.run("x", "select", () => {
      throw new Error("boom");
    });
    assert.ok(c.error);
  } finally {
    console.warn = orig;
  }
});

test("store: only real missing-table errors latch (not missing columns)", () => {
  assert.ok(store.isMissingTableError({ code: "PGRST205" }));
  assert.ok(store.isMissingTableError({ code: "42P01" }));
  assert.ok(store.isMissingTableError({ message: 'relation "public.descoin_risk" does not exist' }));
  assert.ok(!store.isMissingTableError({ message: 'column "foo" does not exist' }));
  assert.ok(!store.isMissingTableError({ code: "23505" }));
});

test("store: buffered inserts flush in batches", async () => {
  fake = createFakeSupabase({});
  store._reset();
  for (let i = 0; i < 1200; i += 1) store.enqueue("descoin_message_fingerprints", { user_id: `u${i}`, minhash: [1] });
  await store.flush();
  assert.strictEqual(fake._tables.descoin_message_fingerprints.rows.length, 1200);
  store._reset();
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${t.name}\n       ${err && err.stack ? err.stack : err}`);
    }
  }
  console.log(`descoinAntibot unit: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
