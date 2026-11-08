"use strict";

/**
 * Admin agent, phase 1: the loop, the tools and the storage, with a fake Claude client,
 * a fake database and a fake admin API. No network, no key.
 */
const assert = require("node:assert/strict");
process.env.ANTHROPIC_API_KEY = "";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";

const store = require("../lib/adminAgent/store");
const run = require("../lib/adminAgent/run");
const tools = require("../lib/adminAgent/tools");
const { displayMessages } = require("../routes/adminAgent");

/* ---------- tiny in-memory Supabase ---------- */
function fakeDb() {
  const tables = { admin_agent_settings: [{ id: 1, enabled: true, monthly_budget_usd: 50 }], admin_agent_threads: [], admin_agent_messages: [], admin_agent_usage: [] };
  let seq = 0;
  function q(name) {
    const st = { name, filters: [], order: null, limit: null, op: "select", payload: null, single: false };
    const rows = () => tables[name].filter((r) => st.filters.every((f) => f(r)));
    const api = {
      select() { return api; },
      eq(k, v) { st.filters.push((r) => String(r[k]) === String(v)); return api; },
      gte(k, v) { st.filters.push((r) => String(r[k]) >= String(v)); return api; },
      order(k, { ascending }) { st.order = [k, ascending]; return api; },
      limit(n) { st.limit = n; return api; },
      insert(p) { st.op = "insert"; st.payload = Array.isArray(p) ? p : [p]; return api; },
      upsert(p) { st.op = "upsert"; st.payload = [p]; return api; },
      update(p) { st.op = "update"; st.payload = p; return api; },
      delete() { st.op = "delete"; return api; },
      maybeSingle() { st.single = true; return api; },
      single() { st.single = true; return api; },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
    };
    function exec() {
      if (st.op === "insert") {
        const made = st.payload.map((r) => ({ id: r.id || `id-${++seq}`, at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
        if (name === "admin_agent_threads") made.forEach((r) => { r.id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`; });
        tables[name].push(...made);
        return { data: st.single ? made[0] : made, error: null };
      }
      if (st.op === "upsert") {
        const i = tables[name].findIndex((r) => r.id === st.payload[0].id);
        if (i >= 0) Object.assign(tables[name][i], st.payload[0]); else tables[name].push(st.payload[0]);
        return { data: null, error: null };
      }
      if (st.op === "update") { rows().forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
      if (st.op === "delete") { const keep = tables[name].filter((r) => !st.filters.every((f) => f(r))); tables[name] = keep; return { data: null, error: null }; }
      let out = rows();
      if (st.order) out = [...out].sort((a, b) => (a[st.order[0]] > b[st.order[0]] ? 1 : -1) * (st.order[1] ? 1 : -1));
      if (st.limit) out = out.slice(0, st.limit);
      return { data: st.single ? out[0] || null : out, error: null };
    }
    return api;
  }
  return { from: q, tables };
}

/* ---------- fake Claude: scripted responses ---------- */
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(JSON.parse(JSON.stringify(params)));
          const msg = script.shift();
          const handlers = {};
          return {
            on(ev, cb) { handlers[ev] = cb; return this; },
            async finalMessage() {
              for (const b of msg.content) if (b.type === "text" && handlers.text) handlers.text(b.text, b.text);
              return { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 200 }, ...msg };
            },
          };
        },
      },
    },
  };
}

(async () => {
  const db = fakeDb();
  const audits = [];
  store.__setDbForTests(db, (e) => { audits.push(e); return true; });

  // Pricing: Opus 5.5 at $4 / $20 per million.
  assert.equal(store.costOf("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 24);
  assert.equal(Number(store.costOf("claude-haiku-5-5", { input_tokens: 2_000_000 }).toFixed(4)), 0.2);

  // Tools: ids are checked, unknown fields refused, query strings built from listed fields only.
  assert.throws(() => tools.cleanId("..", "userId"), /Invalid/);
  assert.throws(() => tools.cleanId("a/b", "userId"), /Invalid/);
  const dossier = tools.BY_NAME.get("user_dossier");
  assert.throws(() => tools.validateInput(dossier, {}), /Missing "userId"/);
  assert.throws(() => tools.validateInput(dossier, { userId: "x", evil: 1 }), /Unknown field/);
  const top = tools.BY_NAME.get("top_users");
  assert.equal(tools.buildRequest(top, tools.validateInput(top, { limit: 5, sort: "voice" })).path, "/activity/leaderboard?limit=5&sort=voice");
  const readDm = tools.BY_NAME.get("read_dm");
  const dmReq = tools.buildRequest(readDm, tools.validateInput(readDm, { conversationKey: "a:b", purpose: "report", reason: "Rapor 12 inceleniyor" }));
  assert.equal(dmReq.method, "POST");
  assert.equal(dmReq.body.reason, "[Ajan] Rapor 12 inceleniyor", "the audit row shows the read came through the agent");
  assert.ok(tools.toolDefinitions().every((d) => d.input_schema.additionalProperties === false));

  // No key on the server: refused before any call.
  await assert.rejects(run.runChat({ adminUser: { id: "a1" }, authHeader: "Bearer t", text: "selam", onEvent() {} }), (e) => e.code === "AGENT_NO_KEY");

  // A tool round, then an answer.
  const client = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "tu1", name: "overview", input: {} }, { type: "tool_use", id: "tu2", name: "search_users", input: { q: "void" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Bugün 42 kayıt var." }] },
  ]);
  run.__setClientForTests(client);
  const fetched = [];
  const fetchImpl = async (url, init) => {
    fetched.push({ url, init });
    const body = url.includes("/overview") ? { signupsToday: 42 } : { users: [{ id: "u1", username: "void" }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const events = [];
  const out = await run.runChat({ adminUser: { id: "a1", username: "demir" }, authHeader: "Bearer tok", stepUpHeader: "su", text: "Bugün kaç kayıt var?", onEvent: (e) => events.push(e), baseUrl: "http://x", fetchImpl });

  assert.equal(fetched.length, 2, "both tool calls ran");
  assert.equal(fetched[0].init.headers.authorization, "Bearer tok", "tools run with the admin's own session");
  assert.equal(fetched[0].init.headers["x-admin-step-up"], "su");
  assert.match(fetched[1].url, /^http:\/\/x\/api\/admin\/people\/search\?q=void$/);
  assert.equal(audits.filter((a) => a.action === "agent_tool").length, 2, "every tool call is in the audit log");
  assert.ok(events.some((e) => e.type === "text" && e.delta === "Bugün 42 kayıt var."));
  assert.ok(events.some((e) => e.type === "done" && e.threadId === out.threadId));

  // Second request carried the tool results in one user message after the tool calls.
  const second = client.calls[1];
  const last = second.messages[second.messages.length - 1];
  assert.equal(last.role, "user");
  assert.deepEqual(last.content.map((b) => b.tool_use_id), ["tu1", "tu2"]);
  assert.equal(second.model, "claude-opus-5-5");
  assert.equal(second.fallbacks, "default");
  assert.deepEqual(second.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(second.system[0].cache_control.type, "ephemeral");

  // Stored unchanged and in order (thinking block kept); usage recorded with cost.
  const stored = db.tables.admin_agent_messages.filter((m) => m.thread_id === out.threadId).sort((a, b) => a.seq - b.seq);
  assert.deepEqual(stored.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(stored[1].content[0].type, "thinking");
  assert.equal(db.tables.admin_agent_usage.length, 2);
  assert.ok(Math.abs(db.tables.admin_agent_usage[0].cost_usd - (1000 * 4 + 200 * 20) / 1e6) < 1e-9);

  // The panel view: user text, assistant text with the tools it used.
  const view = displayMessages(stored);
  assert.equal(view[0].text, "Bugün kaç kayıt var?");
  assert.deepEqual(view[1].tools.map((t) => t.name), ["overview", "search_users"]);
  assert.equal(view[1].text, "Bugün 42 kayıt var.");

  // A follow-up in the same thread replays the stored history first.
  const client2 = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Tamam." }] }]);
  run.__setClientForTests(client2);
  await run.runChat({ adminUser: { id: "a1", username: "demir" }, authHeader: "Bearer tok", threadId: out.threadId, text: "Teşekkürler", onEvent() {}, baseUrl: "http://x", fetchImpl });
  assert.equal(client2.calls[0].messages.length, 5);
  assert.equal(client2.calls[0].messages[1].content[0].type, "thinking", "thinking blocks are passed back unchanged");

  // Another admin cannot continue this conversation.
  await assert.rejects(run.runChat({ adminUser: { id: "a2" }, authHeader: "Bearer x", threadId: out.threadId, text: "hi", onEvent() {} }), (e) => e.code === "NO_THREAD");

  // A failed admin call (no 2FA step-up) becomes an error result and a step-up event.
  const client3 = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu9", name: "read_dm", input: { conversationKey: "a:b", purpose: "report", reason: "Rapor 12 inceleniyor" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Doğrulama gerekiyor." }] },
  ]);
  run.__setClientForTests(client3);
  const ev3 = [];
  await run.runChat({
    adminUser: { id: "a1", username: "demir" }, authHeader: "Bearer tok", text: "Şu DM'i oku", onEvent: (e) => ev3.push(e), baseUrl: "http://x",
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: "This action needs a verification code.", code: "STEP_UP_REQUIRED" }) }),
  });
  assert.ok(ev3.some((e) => e.type === "step_up_required"));
  const r3 = client3.calls[1].messages.at(-1).content[0];
  assert.equal(r3.is_error, true);
  assert.match(r3.content, /STEP_UP_REQUIRED/);

  // Kill switch and budget.
  db.tables.admin_agent_settings[0].enabled = false;
  await assert.rejects(run.runChat({ adminUser: { id: "a1" }, authHeader: "Bearer t", text: "selam", onEvent() {} }), (e) => e.code === "AGENT_DISABLED");
  db.tables.admin_agent_settings[0].enabled = true;
  db.tables.admin_agent_usage.push({ at: new Date().toISOString(), cost_usd: 60 });
  await assert.rejects(run.runChat({ adminUser: { id: "a1" }, authHeader: "Bearer t", text: "selam", onEvent() {} }), (e) => e.code === "AGENT_BUDGET");

  // An interrupted turn never stores a tool call without its result.
  const pending = [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "tool_use", id: "x", name: "overview", input: {} }] }];
  assert.equal(run.completePrefix(pending).length, 1);

  console.log("adminAgent.unit.test: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
