"use strict";

/**
 * Duyurular pure rules: status, audience matching, language fallback, CTA links,
 * validation, templates rendered in all 7 languages, engagement counts, CSV, and
 * the data migration that refreshes the four live announcements (no emojis,
 * 7 languages, icon keys, nothing deleted).
 * Run: node frontend/backend/test/announcementsModel.unit.test.cjs
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const M = require("../lib/announcements/model");

const NOW = Date.parse("2026-11-15T12:00:00Z");
const iso = (ms) => new Date(NOW + ms).toISOString();

// status
assert.equal(M.statusOf({ is_active: true }), "live");
assert.equal(M.statusOf({ is_active: false }), "ended");
assert.equal(M.statusOf({ status: "live", ends_at: iso(-1000) }, NOW), "ended");
assert.equal(M.statusOf({ status: "scheduled", starts_at: iso(-1000) }, NOW), "live");
assert.equal(M.statusOf({ status: "scheduled", starts_at: iso(60000) }, NOW), "scheduled");

// audience
const who = { lang: "de", platform: "electron", premium: false, createdAt: iso(-3 * 86400000) };
assert.equal(M.matchAudience({}, who, NOW), true);
assert.equal(M.matchAudience({ premium: "member" }, who, NOW), false);
assert.equal(M.matchAudience({ premium: "non_member" }, who, NOW), true);
assert.equal(M.matchAudience({ langs: ["tr"] }, who, NOW), false);
assert.equal(M.matchAudience({ platforms: ["desktop"] }, who, NOW), true);
assert.equal(M.matchAudience({ platforms: ["ios"] }, who, NOW), false);
assert.equal(M.matchAudience({ newDays: 14 }, who, NOW), true);
assert.equal(M.matchAudience({ newDays: 2 }, who, NOW), false);
assert.equal(M.audienceKey({ langs: ["tr", "de"] }), M.audienceKey({ langs: ["de", "tr", "xx"] }));
assert.equal(M.needsApproval("urgent", {}), true);
assert.equal(M.needsApproval("urgent", { platforms: ["ios"] }), false);
assert.equal(M.needsApproval("important", {}), false);

// language fallback
const row = { title: "Selam", content: "Metin", cta_label: "Aç", source_lang: "tr", translations: { en: { title: "Hi", content: "Text", cta_label: "Open" } } };
assert.deepEqual([M.localize(row, "en").title, M.localize(row, "en").fallback], ["Hi", false]);
assert.deepEqual([M.localize(row, "ru").title, M.localize(row, "ru").lang, M.localize(row, "ru").fallback], ["Hi", "en", true]);
assert.equal(M.localize({ ...row, translations: {} }, "ru").title, "Selam");
assert.deepEqual(M.translationStates(row), { tr: "source", en: "ready", de: "missing", es: "missing", fr: "missing", "pt-BR": "missing", ru: "missing" });
assert.equal(M.markStale({ en: { state: "ready" } }, ["title"]).en.state, "stale");

// icons
assert.equal(M.iconOf({ emoji: "📌" }), "pin");
assert.equal(M.iconOf({ emoji: "⚠️" }), "alert");
assert.equal(M.iconOf({ icon: "shop", emoji: "🚨" }), "shop");
assert.equal(M.iconOf({}), "megaphone");

// CTA
assert.deepEqual(M.sanitizeCtaUrl("/settings/shop"), { ok: true, url: "/settings/shop", kind: "app" });
assert.equal(M.sanitizeCtaUrl("/feedback?type=bug").kind, "app");
assert.equal(M.sanitizeCtaUrl("descall.com/status").kind, "own");
assert.equal(M.sanitizeCtaUrl("https://apps.apple.com/app/id1").kind, "external");
assert.equal(M.sanitizeCtaUrl("javascript:alert(1)").ok, false);
assert.equal(M.sanitizeCtaUrl("http://descall.com").ok, false);
assert.equal(M.sanitizeCtaUrl("//evil.com").ok, false);

// validation
assert.equal(M.validateDraft({ title: "", content: "x" }).code, "TITLE_REQUIRED");
assert.equal(M.validateDraft({ title: "x".repeat(81), content: "x" }).code, "TITLE_TOO_LONG");
assert.equal(M.validateDraft({ title: "a", content: "b", ctaLabel: "Aç" }).code, "CTA_URL_REQUIRED");
assert.equal(M.validateDraft({ title: "a", content: "b", startsAt: iso(3600000), endsAt: iso(1000) }, { now: NOW }).code, "EXPIRY_BEFORE_START");
const ok = M.validateDraft({ title: " a ", content: "b", icon: "nope", priority: "important", audience: { langs: ["pt"] }, translations: { tr: { title: "x", content: "y" }, de: { title: "Hallo", content: "Text" } } });
assert.equal(ok.ok, true);
assert.equal(ok.value.title, "a");
assert.equal(ok.value.icon, "megaphone");
assert.deepEqual(ok.value.audience.langs, ["pt-BR"]);
assert.deepEqual(Object.keys(ok.value.translations), ["de"], "the source language is never a translation");
const checks = M.prePublishChecks({ title: "Selam 💙", content: "x", priority: "urgent", audience: {}, cta_url: "https://example.org", cta_label: "Aç", source_lang: "tr", translations: {} });
assert.ok(["emoji", "approval", "cta_external", "missing_langs"].every((id) => checks.some((c) => c.id === id)));
assert.equal(M.stripEmoji("💬 Geri Bildirim ❤️"), "Geri Bildirim");

// templates: every builtin renders in every language, no leftover placeholders, no emojis
for (const tpl of M.BUILTIN_TEMPLATES) {
  const values = { ...M.templateDefaults(tpl, "2026-11-16"), feature: "Ekran paylaşımı", details: "Yeni.", place: "Ayarlar", event: "Kış etkinliği", until: "2026-11-30", effective: "2026-11-21" };
  const out = M.fillTemplate(tpl, values, { sourceLang: "tr" });
  assert.ok(out.title && out.content, tpl.key);
  assert.equal(Object.keys(out.translations).length, 6, `${tpl.key}: 6 translations`);
  for (const [lang, t] of Object.entries({ tr: { title: out.title, content: out.content }, ...out.translations })) {
    assert.equal(/\{[a-z_]+\}/i.test(`${t.title} ${t.content}`), false, `${tpl.key} ${lang}: placeholder left`);
    assert.equal(M.hasEmoji(`${t.title} ${t.content}`), false, `${tpl.key} ${lang}: emoji`);
    assert.ok(t.title.length <= 80, `${tpl.key} ${lang}: title too long`);
  }
}
const maint = M.fillTemplate(M.templateByKey("b:maintenance"), { date: "2026-11-16", start: "03:00", end: "04:30", affected: "voice_screen" });
assert.equal(maint.title, "Planlı bakım: 16 Kasım 03:00-04:30");
assert.match(maint.content, /1 saat 30 dakika/);
assert.match(maint.translations.en.content, /1 hour 30 minutes/);
assert.match(maint.translations.ru.content, /1 час 30 минут/);
assert.match(maint.translations.fr.title, /16 novembre/);
assert.match(maint.translations.de.content, /Sprachkanälen/);
assert.equal(maint.translations.de.state, "ready");
const feat = M.fillTemplate(M.templateByKey("b:feature"), { feature: "X", details: "Y.", place: "Z" });
assert.equal(feat.translations.en.state, "auto", "free text needs a review in other languages");
assert.equal(M.fmtDuration(120, "ru"), "2 часа");
assert.equal(M.fmtDuration(300, "ru"), "5 часов");
assert.equal(M.fmtDuration(60, "pt-BR"), "1 hora");
assert.equal(M.fmtDuration(150, "es"), "2 horas y 30 minutos");

// engagement + CSV
const reads = [
  { announcement_id: "a", read_at: "x", seen_at: "x", clicked_at: "x", platform: "ios", lang: "tr" },
  { announcement_id: "a", read_at: null, seen_at: "x", platform: "web", lang: "en" },
  { announcement_id: "a", read_at: null, seen_at: null, platform: "web", lang: "en" },
  { announcement_id: "b", read_at: "x" },
];
const agg = M.aggregateReads(reads);
assert.deepEqual([agg.get("a").delivered, agg.get("a").seen, agg.get("a").read, agg.get("a").clicked], [3, 2, 1, 1]);
assert.deepEqual(agg.get("a").platforms.web, { delivered: 2, seen: 1 });
assert.deepEqual(agg.get("a").langs, { tr: 1, en: 1 });
assert.equal(agg.get("b").seen, 1, "old read marks count as seen");
const csv = M.statsCsv({ title: "Planlı, bakım", status: "live" }, agg.get("a"), 10);
assert.match(csv, /^metric,segment,value\n/);
assert.match(csv, /title,,"Planlı, bakım"/);
assert.match(csv, /seen_rate_pct,,20/);

// public view: localized, legacy fields kept for old clients
const view = M.publicView({ id: "1", ...row, cta_url: "/status", pinned: true, pin_order: 2, emoji: "📌", created_at: iso(0) }, "en");
assert.deepEqual([view.title, view.ctaLabel, view.ctaUrl, view.icon, view.pinOrder, view.emoji], ["Hi", "Open", "/status", "pin", 2, "📌"]);
assert.deepEqual(M.sortFeed([{ id: 1, created_at: iso(0) }, { id: 2, pinned: true, pin_order: 2 }, { id: 3, pinned: true, pin_order: 1 }]).map((x) => x.id), [3, 2, 1]);

// data migration: only the four live rows, no deletes, no emojis, 7 languages, known icon keys
const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261115_announcements_refresh_data.sql"), "utf8");
assert.equal(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i.test(sql), false, "no deletes");
const updates = sql.match(/UPDATE public\.announcements SET[\s\S]*?WHERE id = \$a\$([0-9a-f-]{36})\$a\$::uuid AND is_active = true;/g) || [];
assert.equal(updates.length, 4);
for (const u of updates) {
  const icon = u.match(/icon = \$a\$(\w+)\$a\$/)[1];
  assert.ok(M.ICONS.includes(icon), icon);
  const src = u.match(/source_lang = \$a\$([\w-]+)\$a\$/)[1];
  const tr = JSON.parse(u.match(/translations = \$a\$([\s\S]*?)\$a\$::jsonb/)[1]);
  assert.deepEqual([src, ...Object.keys(tr)].sort(), [...M.LOCALES].sort(), "7 languages");
  const text = u.replace(/emoji = '',/, "");
  assert.equal(M.hasEmoji(text), false, "no emojis");
  assert.equal(M.sanitizeCtaUrl(u.match(/cta_url = \$a\$([^$]+)\$a\$/)[1]).ok, true);
  assert.equal(/\bpriority\b|\bpinned =/.test(u.replace(/CASE WHEN pinned/, "")), false, "priority and pin untouched");
}
const schema = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261115_announcements_schema.sql"), "utf8");
assert.equal(/\bDROP\b|\bDELETE\b/i.test(schema.replace(/ON DELETE (SET NULL|CASCADE)/g, "")), false, "schema migration is additive");

console.log("announcementsModel.unit: ok");
