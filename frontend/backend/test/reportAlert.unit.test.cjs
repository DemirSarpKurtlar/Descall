"use strict";

/**
 * Report alert email (lib/reportAlertEmail.js): builder escaping, message
 * context lookup, throttling, fire-and-forget behaviour, and the real
 * createReport() path with a mocked Resend fetch. No network, no real DB.
 */

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("./fakeSupabase.cjs");

const U_REPORTER = "11111111-1111-4111-8111-111111111111";
const U_TARGET = "22222222-2222-4222-8222-222222222222";
const MSG_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_ID = "44444444-4444-4444-8444-444444444444";
const CHANNEL_ID = "55555555-5555-4555-8555-555555555555";

function seed() {
  return createFakeSupabase({
    users: [
      { id: U_REPORTER, username: "reporter", display_name: "Rep" },
      { id: U_TARGET, username: "badguy", display_name: "Bad <b>Guy</b>" },
    ],
    server_messages: [
      {
        id: MSG_ID,
        server_id: SERVER_ID,
        channel_id: CHANNEL_ID,
        sender_id: U_TARGET,
        content: "siktir <script>alert(1)</script>",
        created_at: "2026-10-09T06:00:00.000Z",
      },
    ],
    servers: [{ id: SERVER_ID, name: "Test Sunucu" }],
    server_channels: [{ id: CHANNEL_ID, name: "genel" }],
    user_reports: [
      { id: "old-1", reporter_id: "x", target_id: U_TARGET, status: "dismissed", created_at: "2026-10-01T00:00:00Z" },
      { id: "old-2", reporter_id: "y", target_id: U_TARGET, status: "open", created_at: "2026-10-02T00:00:00Z" },
    ],
  });
}

const supabasePath = require.resolve("../db/supabase");
let fake = seed();
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: new Proxy({}, { get: (_t, k) => fake[k] }),
};

const {
  buildReportAlertEmail,
  createReportAlerter,
  escapeHtml,
} = require("../lib/reportAlertEmail");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const quietLogger = { log() {}, warn() {} };
const ENV = { RESEND_API_KEY: "test-key", FEEDBACK_EMAIL_FROM: "Descall <noreply@descall.com>", REPORT_ALERT_MAX_PER_HOUR: "3" };

function baseReport(over = {}) {
  return {
    id: "rep-1",
    kind: "user",
    reporterId: U_REPORTER,
    targetId: U_TARGET,
    reason: "harassment",
    note: "çok kaba <img src=x>",
    contextType: "server",
    contextId: MSG_ID,
    snippet: "client snippet",
    createdAt: "2026-10-09T06:01:00.000Z",
    ...over,
  };
}

async function testBuilder() {
  const email = buildReportAlertEmail({
    report: baseReport(),
    reporter: { id: U_REPORTER, username: "reporter" },
    target: { id: U_TARGET, username: "bad\nguy" },
    message: { content: "<script>x</script>", createdAt: "2026-10-09T06:00:00Z", where: "Sunucu: <X>" },
    priorCount: 2,
    openCount: 1,
    env: {},
  });
  assert(email.subject === "🚩 Yeni şikayet: Taciz — @bad guy", "subject format + newline flattened: " + email.subject);
  assert(!email.html.includes("<script>x</script>"), "message content escaped in html");
  assert(email.html.includes("&lt;script&gt;x&lt;/script&gt;"), "escaped content present");
  assert(!email.html.includes("<img src=x>"), "note escaped");
  assert(email.html.includes("Sunucu: &lt;X&gt;"), "context escaped");
  assert(email.text.includes("<script>x</script>"), "text fallback keeps raw content");
  assert(email.text.includes("09:00:00"), "Istanbul time (UTC+3) in text: " + email.text);
  assert(email.text.includes("Önceki şikayetler: 2"), "prior count");
  assert(email.text.includes("https://descall.com/app"), "admin link default");
  assert(escapeHtml(`"'&`) === "&quot;&#39;&amp;", "escapeHtml quotes");
}

async function testNotifyLooksUpMessage() {
  fake = seed();
  const sent = [];
  const alerter = createReportAlerter({
    sendEmail: async (msg) => { sent.push(msg); return { sent: true, providerId: "em_1" }; },
    env: { ...ENV, REPORT_ALERT_EMAIL: "owner@example.com" },
    logger: quietLogger,
  });
  const res = await alerter.notify({ report: baseReport(), openCount: 2 });
  assert(res.sent === true, "sent");
  assert(sent.length === 1 && sent[0].to === "owner@example.com", "recipient from env");
  const { html, text, subject } = sent[0];
  assert(subject.includes("@badguy"), "subject has reported username");
  assert(text.includes("siktir <script>alert(1)</script>"), "raw unmasked DB content in text");
  assert(html.includes("siktir &lt;script&gt;alert(1)&lt;/script&gt;"), "DB content escaped in html");
  assert(text.includes("Test Sunucu") && text.includes("#genel"), "server/channel context");
  assert(text.includes("Önceki şikayetler: 2"), "prior count from DB excludes current report");
  assert(html.includes("Bad &lt;b&gt;Guy&lt;/b&gt;"), "display name escaped");
}

async function testDefaultRecipient() {
  fake = seed();
  const sent = [];
  const alerter = createReportAlerter({
    sendEmail: async (msg) => { sent.push(msg); return { sent: true }; },
    env: ENV,
    logger: quietLogger,
  });
  await alerter.notify({ report: baseReport({ contextType: "profile", contextId: null }) });
  assert(sent[0].to === "demirkurtlar@icloud.com", "default recipient");
}

async function testThrottle() {
  fake = seed();
  let t = 1_000_000;
  const sent = [];
  const alerter = createReportAlerter({
    sendEmail: async (msg) => { sent.push(msg); return { sent: true }; },
    now: () => t,
    env: ENV, // cap 3/hour
    logger: quietLogger,
  });
  await alerter.notify({ report: baseReport({ id: "a" }) });
  const dup = await alerter.notify({ report: baseReport({ id: "b" }) });
  assert(dup.throttled === "pair", "same reporter+target within 10 min suppressed");
  t += 10 * 60 * 1000;
  await alerter.notify({ report: baseReport({ id: "c" }) });
  assert(sent.length === 2, "pair window expires after 10 min");
  assert(sent[1].text.includes("1 şikayet e-postası limit nedeniyle gönderilmedi"), "suppressed summary in next email");
  await alerter.notify({ report: baseReport({ id: "d", reporterId: "r2" }) });
  assert(sent.length === 3, "third email allowed");
  assert(sent[2].text.includes("Saatlik e-posta limitine (3) ulaşıldı"), "cap note on last allowed email");
  const capped = await alerter.notify({ report: baseReport({ id: "e", reporterId: "r3" }) });
  assert(capped.throttled === "global", "global cap");
  t += 61 * 60 * 1000;
  await alerter.notify({ report: baseReport({ id: "f", reporterId: "r4" }) });
  assert(sent.length === 4, "cap resets after an hour");
}

async function testFireAndForget() {
  fake = seed();
  let started = false;
  const logs = [];
  const alerter = createReportAlerter({
    sendEmail: async () => { started = true; throw new Error("resend down"); },
    env: ENV,
    logger: { log() {}, warn: (...a) => logs.push(a.join(" ")) },
  });
  alerter.schedule({ report: baseReport() });
  assert(started === false, "schedule returns before sending");
  await new Promise((r) => setTimeout(r, 50));
  assert(started === true, "send ran later");
  assert(logs.some((l) => l.includes("resend down")), "error caught and logged");
  const res = await alerter.notify({ report: baseReport({ reporterId: "zz" }) });
  assert(res.sent === false && res.error, "notify resolves (never rejects) on provider error");
}

async function testCreateReportPath() {
  fake = seed();
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ id: "em_x" }) };
  };
  Object.assign(process.env, { RESEND_API_KEY: "test-key", FEEDBACK_EMAIL_FROM: "Descall <noreply@descall.com>" });
  delete process.env.REPORT_ALERT_EMAIL;
  try {
    const reports = require("../lib/userReports");
    const result = await reports.createReport({
      reporterId: U_REPORTER,
      targetId: U_TARGET,
      reason: "hate_speech",
      contextType: "server",
      contextId: MSG_ID,
      snippet: "x",
    });
    assert(result.report && result.report.id, "report created");
    assert(calls.length === 0, "createReport does not wait for the email");
    await new Promise((r) => setTimeout(r, 50));
    assert(calls.length === 1, "email sent once via Resend");
    assert(calls[0].url === "https://api.resend.com/emails", "Resend endpoint");
    assert(calls[0].body.to[0] === "demirkurtlar@icloud.com", "default recipient on real path");
    assert(calls[0].body.subject === "🚩 Yeni şikayet: Nefret söylemi — @badguy", "subject: " + calls[0].body.subject);
    assert(calls[0].body.text.includes("Önceki şikayetler: 2"), "prior count on real path");
  } finally {
    global.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.FEEDBACK_EMAIL_FROM;
  }
}

(async () => {
  await testBuilder();
  await testNotifyLooksUpMessage();
  await testDefaultRecipient();
  await testThrottle();
  await testFireAndForget();
  await testCreateReportPath();
  console.log("reportAlert.unit.test: all passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
