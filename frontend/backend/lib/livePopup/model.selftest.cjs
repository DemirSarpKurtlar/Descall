"use strict";

// node backend/lib/livePopup/model.selftest.cjs
// Canlı popup pure helpers: content rules, audience cleanup + matching,
// receipt status, stats (funnel, spark, split, feed), CSV safety, recall input.

const assert = require("node:assert/strict");
const m = require("./model");

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

/* ---- content ---- */
let c = m.normalizeContent({ title: "  Bakim ", body: " Govde ", severity: "urgent" });
assert.equal(c.ok, true);
assert.equal(c.content.title, "Bakim");
assert.equal(c.content.requireAck, true, "urgent asks for an OK by default");
assert.equal(c.content.icon, "siren", "urgent default icon");
c = m.normalizeContent({ title: "a", body: "b", severity: "info", requireAck: true, durationMs: 30000 });
assert.equal(c.content.durationMs, 0, "a popup that needs an OK never auto-closes");
c = m.normalizeContent({ title: "a", body: "b", durationMs: 12345 });
assert.equal(c.content.durationMs, 0, "unknown duration -> until closed");
assert.equal(m.normalizeContent({ title: "", body: "b" }).code, "TITLE_REQUIRED");
assert.equal(m.normalizeContent({ title: "a", body: "" }).code, "BODY_REQUIRED");
assert.equal(m.normalizeContent({ title: "x".repeat(81), body: "b" }).code, "TITLE_TOO_LONG");
assert.equal(m.normalizeContent({ title: "a", body: "b", ctaLabel: "Go", ctaUrl: "javascript:alert(1)" }).code, "BAD_CTA_URL");
assert.equal(m.normalizeContent({ title: "a", body: "b", ctaLabel: "Go", ctaUrl: "https://descall.com.evil.io/" }).code, "BAD_CTA_URL");
assert.equal(m.normalizeContent({ title: "a", body: "b", ctaUrl: "/download" }).code, "CTA_LABEL_REQUIRED");
assert.equal(m.normalizeContent({ title: "a", body: "b", ctaLabel: "Durum", ctaUrl: "descall.com/durum" }).content.ctaUrl, "https://descall.com/durum");
assert.equal(m.normalizeContent({ title: "a", body: "b", ctaLabel: "Durum", ctaUrl: "/settings" }).content.ctaUrl, "/settings");
assert.equal(m.cleanNote("  ok ").ok, false);
assert.equal(m.cleanNote("Planli bakim").note, "Planli bakim");

const wire = m.toWirePopup({ id: U1, title: "t", body: "b", severity: "warning", icon: "wrench", duration_ms: 30000, require_ack: true, sent_at: "2026-11-14T00:00:00.000Z", created_by_username: "demir" });
assert.equal(wire.durationMs, 0);
assert.equal(wire.emoji, m.ICON_EMOJI.wrench, "old clients keep their emoji field");
assert.equal(wire.track, true);
assert.equal(m.toWirePopup({ id: U1, icon: "nope" }, { test: true }).track, false);

/* ---- audience ---- */
const aud = m.normalizeAudience({
  rules: [
    { type: "platform", values: ["ios", "desktop", "fax"] },
    { type: "language", values: ["pt-br", "TR", "xx"] },
    { type: "users", users: [{ id: U1, username: "elif" }, { id: U1 }, { id: "bad" }] },
    { type: "accountAge", op: "newer", days: 7 },
    { type: "accountAge", op: "older", days: 0 },
    { type: "nope" },
    { type: "platform", values: [] },
  ],
});
assert.deepEqual(aud.rules.find((r) => r.type === "platform").values, ["desktop", "ios"], "platform order + unknown dropped");
assert.deepEqual(aud.rules.find((r) => r.type === "language").values, ["tr", "pt-BR"]);
assert.equal(aud.rules.find((r) => r.type === "users").users.length, 1, "deduped, bad ids dropped");
assert.equal(aud.rules.find((r) => r.type === "accountAge").days, 7, "invalid duplicate ignored");
assert.equal(aud.rules.length, 4);

const now = Date.parse("2026-11-14T12:00:00Z");
const cand = { id: U1, status: "online", platforms: ["ios"], lang: "tr", createdAt: "2026-11-10T12:00:00Z", plan: null, inVoice: true };
assert.equal(m.matchCandidate(cand, aud, { now }), true);
assert.equal(m.matchCandidate({ ...cand, id: U2 }, aud, { now }), false, "not picked");
assert.equal(m.matchCandidate({ ...cand, createdAt: "2026-01-01T00:00:00Z" }, aud, { now }), false, "too old");
assert.equal(m.matchCandidate({ ...cand, platforms: ["web"] }, aud, { now }), false);
assert.equal(m.matchCandidate(cand, { rules: [{ type: "premium", value: "non" }] }), true);
assert.equal(m.matchCandidate({ ...cand, plan: "plus" }, { rules: [{ type: "premium", value: "non" }] }), false);
assert.equal(m.matchCandidate({ ...cand, status: "invisible" }, { rules: [{ type: "visibility", value: "visible" }] }), false);
assert.equal(m.matchCandidate({ ...cand, inVoice: false }, { rules: [{ type: "voice" }] }), false);
assert.equal(m.matchCandidate(cand, { rules: [{ type: "server", serverId: U2 }] }, { serverMembers: new Set([U1]) }), true);

assert.equal(m.platformOf("electron"), "desktop");
assert.equal(m.platformOf("android"), "android");
assert.equal(m.platformOf(undefined), "web");
assert.equal(m.primaryPlatform(["ios", "desktop"]), "desktop");
assert.equal(m.primaryPlatform(["ios", "desktop"], ["ios"]), "ios");
assert.equal(m.normLang("pt_BR"), "pt-BR");
assert.equal(m.normLang("en-US"), "en");
assert.equal(m.normLang("ja"), null);

/* ---- receipts ---- */
const T = (s) => `2026-11-14T12:0${s}:00.000Z`;
const rows = [
  { user_id: "a", username: "elif", platform: "desktop", language: "tr", delivered_at: T(0), seen_at: T(0), acked_at: T(2), clicked_at: T(1) },
  { user_id: "b", username: "mert", platform: "ios", language: "tr", delivered_at: T(0), seen_at: T(1), clicked_at: T(1) },
  { user_id: "c", username: "zey", platform: "web", language: "tr", delivered_at: T(0), seen_at: T(0) },
  { user_id: "d", username: "kaan", platform: "android", language: "tr", delivered_at: T(0) },
  { user_id: "e", username: "john", platform: "desktop", language: "en", delivered_at: T(0), seen_at: T(0), dismissed_at: T(3) },
  { user_id: "f", username: "ays", platform: "ios", language: "tr", missed_at: T(0), missed_reason: "left", pending_login: true },
  { user_id: "g", username: "new", platform: "web", language: "tr" },
];
assert.deepEqual(rows.map(m.receiptStatus), ["acked", "clicked", "open", "unseen", "dismissed", "missed", "sending"]);
assert.equal(m.receiptStatus({ ...rows[2], closed_at: T(4) }), "seen", "closed by a recall");
assert.equal(m.isOpen(rows[1]), true, "clicked a required popup: still open");
assert.equal(m.isOpen(rows[0]), false);
const fc = m.filterCounts(rows);
assert.deepEqual(fc, { all: 7, seen: 4, acked: 1, clicked: 2, open: 1, dismissed: 1, missed: 1 });
const st = m.computeStats(rows, { sentAt: T(0), ctaUrl: "https://descall.com/durum" });
assert.equal(st.targeted, 7);
assert.equal(st.delivered, 5);
assert.equal(st.pct.delivered, 71);
assert.equal(st.pendingLogin, 1);
assert.equal(st.closable, 3, "mert, zey, kaan would close on a recall");
assert.deepEqual(st.spark.slice(0, 3), [3, 1, 0], "seen per minute");
assert.equal(st.avgSeenMs, 15000, "mean of 0, 60, 0, 0 s");
assert.deepEqual(st.platforms.map((p) => p.id), ["desktop", "web", "ios", "android"]);
assert.equal(st.platforms[0].pct, 100);
assert.equal(st.languages[0].id, "tr");
assert.equal(st.recentAckers[0].username, "elif");
assert.equal(st.events[0].kind, "dismissed", "newest first");
assert.equal(st.events.find((e) => e.kind === "clicked").url, "https://descall.com/durum");
assert.equal(st.events.find((e) => e.kind === "missed").pending, true);
assert.deepEqual(m.statsSnapshot(st), { targeted: 7, delivered: 5, seen: 4, acked: 1, clicked: 2, dismissed: 1, missed: 1, open: 1, pendingLogin: 1 });

/* ---- CSV ---- */
const csv = m.receiptsCsv([{ username: "=HYPERLINK(1)", user_id: U1, language: "en", delivered_at: T(0) }, { username: 'a,"b"', user_id: U2 }]);
assert.ok(csv.startsWith("﻿username,"), "BOM + header");
assert.ok(csv.includes("'=HYPERLINK(1)"), "formula neutralized");
assert.ok(csv.includes('"a,""b"""'), "quoted");
assert.ok(csv.includes(",unseen,") && csv.includes(",sending,"));

/* ---- recall ---- */
assert.equal(m.normalizeRecall({ mode: "silent", reason: "" }).code, "NOTE_REQUIRED");
assert.equal(m.normalizeRecall({ mode: "note", reason: "Yanlis saat" }).code, "CORRECTION_REQUIRED");
assert.equal(m.normalizeRecall({ mode: "edited", reason: "Yanlis saat", edited: { title: "", body: "x" } }).code, "TITLE_REQUIRED");
const rc = m.normalizeRecall({ mode: "edited", reason: "Yanlis saat", edited: { title: "Yeni", body: "Dogru saat 04:00", severity: "warning" } });
assert.equal(rc.ok, true);
assert.equal(rc.edited.title, "Yeni");
assert.equal(m.normalizeRecall({ mode: "weird", reason: "Yanlis saat" }).mode, "silent");

/* ---- day start (Turkey) ---- */
assert.equal(m.dayStartIso(Date.parse("2026-11-14T22:30:00Z")), "2026-11-14T21:00:00.000Z", "after 00:00 in Istanbul the day has turned");
assert.equal(m.dayStartIso(Date.parse("2026-11-14T20:30:00Z")), "2026-11-13T21:00:00.000Z");

console.log("livePopup model.selftest.cjs: ok");
