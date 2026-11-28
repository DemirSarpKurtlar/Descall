"use strict";

/**
 * Localized server content (draft C) end to end over HTTP on the fake database, with
 * the real seed (backend/content/descallCommunityL10n.js) and the live rows of the
 * official server (fixtures/descallCommunityLive.cjs):
 *   - GET /servers/my in pt-BR / en / de / tr: nameLocalized, descriptionLocalized,
 *     channel nameLocalized + topicLocalized with resolved mentions, l10n.messages of
 *     visible channels only (a hidden team channel never leaks), originals untouched
 *   - GET /servers/:id/channels/:id/messages: content_localized on the official message,
 *     user chat untouched; ?lang= wins over Accept-Language; no header: nothing added
 *   - a server that did not opt in is never decorated; invite preview + discover card;
 *     discover finds the server by a translated name
 *   - an edited original goes stale (the source-language reader sees the edit)
 *   - admin editor: coverage, save (audited, source_text set), delete, emoji refused,
 *     unknown mention refused, settings off needs a reason, "Taslak çevir" without a key
 *     explains itself, with a mocked client drafts only the missing languages
 * Synthetic users, public server content only; nothing reaches a database.
 * Run: node frontend/backend/test/serverL10n.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";
delete process.env.ANTHROPIC_API_KEY;

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const live = require("./fixtures/descallCommunityLive.cjs");
const content = require("../content/descallCommunityL10n");

const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };
const P = require("../lib/serverPermissions");
const big = (b) => P.toPgBigint(b);

const SID = live.SERVER.id;
const OWNER = live.SERVER.owner_id;
const READER = "00000000-0000-4000-8000-000000000101";
const ADMIN = "00000000-0000-4000-8000-000000000108";
const OTHER = "00000000-0000-4000-8000-0000000000aa";
const EVERYONE = `${SID}-everyone`;
const CH = content.CHANNELS;
const USER_MSG = "00000000-0000-4000-9000-000000000001";
const HIDDEN_MSG = "00000000-0000-4000-9000-000000000002";
const NOW = "2026-11-28T17:00:00.000Z";

const originalOf = (kind, ref) => {
  if (kind === "server_name") return live.SERVER.name;
  if (kind === "server_description") return live.SERVER.description;
  if (kind === "message") return live.MESSAGES.find((m) => m.id === ref)?.content ?? null;
  const ch = live.CHANNELS.find((c) => c.id === ref);
  return kind === "channel_name" ? ch?.name ?? null : ch?.topic ?? null;
};

const fake = createFakeSupabase({
  users: [
    { id: OWNER, username: "demir", display_name: "Demir", active_sessions: [{ id: "s-owner" }] },
    { id: READER, username: "joana", display_name: "Joana", active_sessions: [{ id: "s-reader" }] },
    { id: ADMIN, username: "admin", is_admin: true, active_sessions: [{ id: "s-admin" }] },
  ],
  servers: [
    { ...live.SERVER, icon_url: null, community_enabled: false, verification_level: "none", created_at: "2026-11-27T18:40:41Z", updated_at: NOW },
    { id: OTHER, owner_id: OWNER, name: "Oyun Gecesi", description: "Cuma oyun", is_public: true, verification_level: "none", created_at: "2026-11-01T00:00:00Z", updated_at: NOW },
  ],
  server_members: [
    { server_id: SID, user_id: OWNER, joined_at: NOW, list_position: 0 },
    { server_id: SID, user_id: READER, joined_at: NOW, list_position: 0 },
    { server_id: OTHER, user_id: READER, joined_at: NOW, list_position: 1 },
  ],
  server_roles: [
    { id: EVERYONE, server_id: SID, is_everyone: true, position: 0, permissions: big(P.EVERYONE_DEFAULT) },
    { id: `${OTHER}-everyone`, server_id: OTHER, is_everyone: true, position: 0, permissions: big(P.EVERYONE_DEFAULT) },
  ],
  server_member_roles: [],
  server_channels: [
    ...live.CHANNELS.map((c) => ({ ...c, slowmode_seconds: 0, nsfw: false, created_at: NOW })),
    { id: "00000000-0000-4000-8000-0000000000c1", server_id: OTHER, name: "genel", type: "text", topic: "Sohbet", position: 0, parent_id: null, created_at: NOW },
  ],
  // The team channels are hidden from @everyone, like on the live server.
  server_channel_overrides: [CH["ekip-sohbet"], CH["mod-kayitlari"]].map((id, i) => ({ id: `o${i}`, channel_id: id, target_type: "role", target_id: EVERYONE, allow_permissions: "0", deny_permissions: big(P.Permissions.VIEW_CHANNEL) })),
  server_messages: [
    ...live.MESSAGES.map((m) => ({ ...m, reply_to: null, pinned_by: null, system_kind: null, system_meta: null })),
    { id: USER_MSG, server_id: SID, channel_id: CH.kurallar, sender_id: READER, content: "Oi! Sou do Brasil.", created_at: "2026-11-28T16:00:00Z", updated_at: "2026-11-28T16:00:00Z", message_type: "text" },
    { id: HIDDEN_MSG, server_id: SID, channel_id: CH["ekip-sohbet"], sender_id: OWNER, content: "Ekip notu: yarin toplanti.", created_at: "2026-11-28T16:10:00Z", updated_at: "2026-11-28T16:10:00Z", message_type: "text" },
  ],
  server_message_reactions: [],
  server_invites: [{ code: "TOPLULUK", server_id: SID, creator_id: OWNER, uses: 0, max_uses: null, expires_at: null, created_at: NOW }],
  server_bans: [],
  server_audit_logs: [],
  server_content_l10n: [{ server_id: SID, enabled: true, source_locale: "tr", updated_at: NOW, updated_by_username: "seed" }],
  server_content_translations: [
    ...content.seedRows().map((r, i) => ({ id: i + 1, server_id: SID, kind: r.kind, ref_id: r.refId, locale: r.locale, text: r.text, source_text: originalOf(r.kind, r.refId), updated_at: NOW, updated_by_username: "seed" })),
    // A translation of the hidden team message: must never reach a member who cannot see it.
    { id: 9001, server_id: SID, kind: "message", ref_id: HIDDEN_MSG, locale: "pt-BR", text: "Nota da equipe", source_text: "Ekip notu: yarin toplanti.", updated_at: NOW },
  ],
  admin_audit: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
const rows = (t) => fake._tables[t]?.rows || [];

const failures = [];
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}: ${String(err.stack || err.message).split("\n").slice(0, 6).join(" | ").slice(0, 900)}`);
  }
}

async function run() {
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const state = require("../runtime/sharedState");
  const store = require("../lib/serverL10n/store");
  const io = { to: () => ({ emit() {} }), in: () => ({ emit() {}, fetchSockets: async () => [], socketsJoin() {}, socketsLeave() {} }), emit() {}, of() { return io; }, fetchSockets: async () => [], sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/servers", require("../routes/servers"));
  app.use("/api/directory", require("../routes/directory"));
  const admin = express.Router();
  admin.use((req, _res, next) => {
    req.user = { id: ADMIN, username: "admin" };
    next();
  });
  admin.use(require("../routes/adminServerTranslations"));
  app.use("/admin", admin);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, user = READER, lang } = {}) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: user, username: user === ADMIN ? "admin" : "u", sid: user === READER ? "s-reader" : user === ADMIN ? "s-admin" : "s-owner" })}` };
    if (lang) headers["Accept-Language"] = lang;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})), vary: res.headers.get("vary") };
  };
  const official = (b) => (b.servers || []).find((s) => s.id === SID);
  const chOf = (srvPub, id) => (srvPub.channels || []).find((c) => c.id === id);

  try {
    await check("GET /servers/my in pt-BR: localized fields next to the originals", async () => {
      const r = await call("/servers/my", { lang: "pt-BR,pt;q=0.9,en;q=0.8" });
      assert.equal(r.status, 200);
      assert.match(String(r.vary || ""), /Accept-Language/i);
      const s = official(r.body);
      assert.equal(s.name, "Descall Topluluk", "original kept");
      assert.equal(s.nameLocalized, "Comunidade Descall");
      assert.match(s.descriptionLocalized, /servidor oficial da comunidade Descall/);
      assert.deepEqual({ enabled: s.l10n.enabled, locale: s.l10n.locale, sourceLocale: s.l10n.sourceLocale }, { enabled: true, locale: "pt-BR", sourceLocale: "tr" });
      const rules = chOf(s, CH.kurallar);
      assert.equal(rules.name, "kurallar");
      assert.equal(rules.nameLocalized, "regras");
      assert.equal(rules.l10n.name.source, "kurallar");
      assert.equal(rules.l10n.name.translated, true);
      assert.equal(chOf(s, CH["cat-basla"]).nameLocalized, "Comece aqui");
      assert.equal(chOf(s, CH.lobi).nameLocalized, "Lobby");
      const welcomeTopic = chOf(s, CH["hos-geldin"]);
      assert.equal(welcomeTopic.topic, live.CHANNELS.find((c) => c.id === CH["hos-geldin"]).topic);
      assert.match(welcomeTopic.topicLocalized, /se apresente em #apresentacoes e mande suas dúvidas em #ajuda\./);
      const msgs = s.l10n.messages;
      assert.ok(msgs["401e70db-e932-4393-86be-0425a241b85a"], "welcome message");
      assert.match(msgs["401e70db-e932-4393-86be-0425a241b85a"].text, /Leia e aceite as #regras/);
      assert.equal(msgs["81d1ae52-594a-479a-a2b1-2a9a3fff5d2f"].locale, "pt-BR");
      assert.ok(!msgs[HIDDEN_MSG], "hidden team message never listed");
      assert.ok(!chOf(s, CH["ekip-sohbet"]), "hidden channel stays hidden");
      const other = r.body.servers.find((x) => x.id === OTHER);
      assert.ok(other && !("nameLocalized" in other) && !("l10n" in other), "a server that did not opt in is untouched");
    });

    await check("English and German readers (German falls back per item, never to Turkish)", async () => {
      const en = official((await call("/servers/my", { lang: "en-US" })).body);
      assert.equal(chOf(en, CH.kurallar).nameLocalized, "rules");
      assert.equal(en.nameLocalized, "Descall Community");
      const de = official((await call("/servers/my", { lang: "de-DE" })).body);
      assert.equal(chOf(de, CH.kurallar).nameLocalized, "regeln");
      assert.equal(chOf(de, CH.duyurular).nameLocalized, "ankuendigungen");
    });

    await check("Turkish reader: originals only, no localized copies", async () => {
      const tr = official((await call("/servers/my", { lang: "tr-TR" })).body);
      assert.ok(!("nameLocalized" in tr));
      assert.ok(!chOf(tr, CH.kurallar).nameLocalized);
      assert.ok(!chOf(tr, CH["hos-geldin"]).topicLocalized, "the Turkish row renders to the same text");
      assert.ok(!tr.l10n.messages, "no message differs from the original");
      assert.equal(tr.l10n.locale, "tr");
    });

    await check("no Accept-Language: nothing is added", async () => {
      const r = await call("/servers/my");
      assert.ok(!("l10n" in official(r.body)));
    });

    await check("messages endpoint: the official message is localized, user chat is not", async () => {
      const r = await call(`/servers/${SID}/channels/${CH.kurallar}/messages`, { lang: "pt-BR" });
      assert.equal(r.status, 200);
      const rulesMsg = r.body.messages.find((m) => m.id === "81d1ae52-594a-479a-a2b1-2a9a3fff5d2f");
      assert.equal(rulesMsg.content, live.MESSAGES[1].content, "original kept");
      assert.match(rulesMsg.content_localized, /^\*\*Regras do servidor\*\*/);
      assert.match(rulesMsg.content_localized, /dúvidas em #ajuda, bugs em #reportar-bugs e ideias em #sugestoes/);
      assert.deepEqual({ locale: rulesMsg.l10n.locale, translated: rulesMsg.l10n.translated, sourceLocale: rulesMsg.l10n.sourceLocale }, { locale: "pt-BR", translated: true, sourceLocale: "tr" });
      const userMsg = r.body.messages.find((m) => m.id === USER_MSG);
      assert.ok(userMsg && !("content_localized" in userMsg) && !("l10n" in userMsg), "user chat never translated");
      const q = await call(`/servers/${SID}/channels/${CH.kurallar}/messages?lang=ru`, { lang: "pt-BR" });
      assert.match(q.body.messages.find((m) => m.id === "81d1ae52-594a-479a-a2b1-2a9a3fff5d2f").content_localized, /Правила сервера/);
    });

    await check("invite preview, server page and discover card carry the localized name", async () => {
      const inv = await call("/servers/invites/TOPLULUK", { lang: "pt-BR" });
      assert.equal(inv.status, 200);
      assert.equal(inv.body.server.name, "Descall Topluluk");
      assert.equal(inv.body.server.nameLocalized, "Comunidade Descall");
      const one = await call(`/servers/${SID}`, { lang: "fr" });
      assert.equal(one.status, 200);
      assert.equal(one.body.server.nameLocalized, "Communauté Descall");
      const disc = await call("/servers/discover?q=Comunidade", { lang: "pt-BR" });
      assert.equal(disc.status, 200);
      const card = disc.body.servers.find((x) => x.id === SID);
      assert.ok(card, "found by the translated name");
      assert.equal(card.nameLocalized, "Comunidade Descall");
      const orig = await call("/servers/discover?q=Topluluk", { lang: "pt-BR" });
      assert.ok(orig.body.servers.some((x) => x.id === SID), "still found by the original name");
    });

    await check("an edited original goes stale; the Turkish reader sees the edit", async () => {
      const ch = rows("server_channels").find((c) => c.id === CH.genel);
      ch.topic = "Her konuda sohbet. Yeni: haftalık tartışma.";
      store.invalidate(SID);
      const tr = official((await call("/servers/my", { lang: "tr" })).body);
      assert.ok(!chOf(tr, CH.genel).topicLocalized);
      const pt = official((await call("/servers/my", { lang: "pt-BR" })).body);
      const genel = chOf(pt, CH.genel);
      assert.equal(genel.topicLocalized, "Papo sobre qualquer assunto. Seja respeitoso e ajude quem está chegando.");
      assert.equal(genel.l10n.topic.stale, true, "flagged stale, still shown");
      const ed = await call(`/admin/server-translations/${SID}`, { user: ADMIN });
      const item = ed.body.items.find((it) => it.kind === "channel_topic" && it.refId === CH.genel);
      assert.equal(item.translations["pt-BR"].stale, true);
      assert.equal(ed.body.coverage["pt-BR"].stale, 1);
    });

    await check("admin editor: items x locales and coverage", async () => {
      const list = await call("/admin/server-translations", { user: ADMIN });
      assert.equal(list.status, 200);
      const row = list.body.servers.find((s) => s.id === SID);
      assert.equal(row.enabled, true);
      assert.equal(row.official, true);
      const ed = await call(`/admin/server-translations/${SID}`, { user: ADMIN });
      assert.equal(ed.status, 200);
      assert.deepEqual(ed.body.locales, ["en", "tr", "de", "es", "fr", "pt-BR", "ru"].filter((l) => ed.body.locales.includes(l)));
      assert.equal(ed.body.locales.length, 7);
      // Every seeded item is covered; the owner's later team note (only pt-BR) is the one gap.
      assert.equal(ed.body.coverage.en.missing, 1);
      assert.equal(ed.body.coverage["pt-BR"].missing, 0);
      assert.ok(ed.body.items.some((it) => it.refId === HIDDEN_MSG && !it.translations.en), "the owner's message is offered");
      assert.ok(ed.body.items.some((it) => it.kind === "message" && it.pinned), "pinned messages listed");
      assert.ok(!ed.body.items.some((it) => it.refId === USER_MSG), "user chat is not offered");
      assert.equal(ed.body.translateAvailable, false);
    });

    await check("save: upsert with source_text, delete, audit; emoji and bad mentions refused", async () => {
      const before = state.auditLog.length;
      const saved = await call(`/admin/server-translations/${SID}/items`, {
        user: ADMIN,
        method: "PUT",
        body: { items: [
          { kind: "channel_topic", refId: CH.genel, locale: "pt-BR", text: "Papo sobre tudo. Novo: debate semanal em <#" + CH.genel + ">." },
          { kind: "channel_name", refId: CH.muzik, locale: "es", text: "" },
        ] },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.saved, 1);
      assert.equal(saved.body.removed, 1);
      const r = rows("server_content_translations").find((x) => x.kind === "channel_topic" && x.ref_id === CH.genel && x.locale === "pt-BR");
      assert.equal(r.source_text, "Her konuda sohbet. Yeni: haftalık tartışma.");
      assert.equal(r.updated_by_username, "admin");
      assert.ok(!rows("server_content_translations").some((x) => x.kind === "channel_name" && x.ref_id === CH.muzik && x.locale === "es"));
      assert.equal(saved.body.coverage.es.missing, 2, "the removed name + the team note");
      const entry = state.auditLog.slice(0, state.auditLog.length - before).find((e) => e.action === "server_l10n_save");
      assert.ok(entry, "audited");
      assert.equal(entry.target, SID);
      assert.equal(entry.meta.saved, 1);
      const pt = official((await call("/servers/my", { lang: "pt-BR" })).body);
      assert.equal(chOf(pt, CH.genel).topicLocalized, "Papo sobre tudo. Novo: debate semanal em #geral.");
      assert.ok(!chOf(pt, CH.genel).l10n.topic.stale);
      const emoji = await call(`/admin/server-translations/${SID}/items`, { user: ADMIN, method: "PUT", body: { items: [{ kind: "channel_name", refId: CH.muzik, locale: "es", text: "musica 🎵" }] } });
      assert.equal(emoji.body.code, "NO_EMOJI");
      const bad = await call(`/admin/server-translations/${SID}/items`, { user: ADMIN, method: "PUT", body: { items: [{ kind: "channel_topic", refId: CH.muzik, locale: "es", text: "ver <#00000000-0000-4000-8000-00000000dead>" }] } });
      assert.equal(bad.body.code, "BAD_MENTION");
      const unknown = await call(`/admin/server-translations/${SID}/items`, { user: ADMIN, method: "PUT", body: { items: [{ kind: "message", refId: USER_MSG, locale: "es", text: "hola" }] } });
      assert.equal(unknown.body.code, "BAD_ITEM", "user chat cannot be translated");
    });

    await check("settings: turning a server off needs a reason and is audited", async () => {
      const noReason = await call(`/admin/server-translations/${SID}/settings`, { user: ADMIN, method: "PUT", body: { enabled: false } });
      assert.equal(noReason.body.code, "REASON_REQUIRED");
      const off = await call(`/admin/server-translations/${SID}/settings`, { user: ADMIN, method: "PUT", body: { enabled: false, reason: "test" } });
      assert.equal(off.status, 200);
      assert.ok(state.auditLog.find((e) => e.action === "server_l10n_settings" && e.meta.enabled === false));
      const s = official((await call("/servers/my", { lang: "pt-BR" })).body);
      assert.ok(!("nameLocalized" in s), "off: nothing localized");
      const on = await call(`/admin/server-translations/${SID}/settings`, { user: ADMIN, method: "PUT", body: { enabled: true } });
      assert.equal(on.status, 200);
      assert.equal(official((await call("/servers/my", { lang: "pt-BR" })).body).nameLocalized, "Comunidade Descall");
    });

    await check("Taslak çevir: no key explains itself; with a client drafts only the missing languages", async () => {
      const none = await call(`/admin/server-translations/${SID}/draft/preview`, { user: ADMIN, method: "POST", body: { items: [{ kind: "channel_name", refId: CH.muzik }] } });
      assert.equal(none.status, 503);
      assert.equal(none.body.code, "TRANSLATE_UNAVAILABLE");
      process.env.ANTHROPIC_API_KEY = "test-key";
      const service = require("../lib/announcements/service");
      const seen = [];
      service.__setTranslateClientForTests({
        messages: {
          create: async (req) => {
            const u = JSON.parse(req.messages[0].content);
            seen.push(u);
            const out = {};
            for (const l of Object.keys(u.targets)) out[l] = { title: "Música Boa", content: `${u.content} (${l})`, cta_label: "" };
            return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] };
          },
        },
      });
      const r = await call(`/admin/server-translations/${SID}/draft/preview`, { user: ADMIN, method: "POST", body: { items: [{ kind: "channel_name", refId: CH.muzik }, { kind: "channel_topic", refId: CH.paylasim }] } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.drafts.filter((d) => d.kind === "channel_name"), [{ kind: "channel_name", refId: CH.muzik, locale: "es", text: "musica-boa" }], "only es was missing; slug style");
      assert.equal(seen.length, 1, "the complete topic was not sent");
      assert.ok(!rows("server_content_translations").some((x) => x.kind === "channel_name" && x.ref_id === CH.muzik && x.locale === "es"), "nothing saved");
      const all = await call(`/admin/server-translations/${SID}/draft/preview`, { user: ADMIN, method: "POST", body: { items: [{ kind: "channel_topic", refId: CH.paylasim }], locales: ["de"], overwrite: true } });
      const de = all.body.drafts.find((d) => d.locale === "de");
      assert.equal(de.text, `Fotoğraf, klip, çizim, kendi yaptıkların. Sadece paylaşım, sohbet <#${CH.genel}> kanalında. (de)`, "mentions go back to <#id>");
      assert.ok(state.auditLog.find((e) => e.action === "server_l10n_draft"));
      service.__setTranslateClientForTests(null);
      delete process.env.ANTHROPIC_API_KEY;
    });
  } finally {
    srv.close();
  }

  if (failures.length) {
    console.error(`serverL10n integration: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log(`serverL10n integration: ${passed} passed`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
