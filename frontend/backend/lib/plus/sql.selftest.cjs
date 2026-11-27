"use strict";

/**
 * Descall+ 2.0 SQL (supabase/migrations/20261125c_descall_plus_2.sql) against a real, throwaway
 * Postgres: a temp cluster is created with initdb, a minimal stub of the base schema is loaded,
 * then the phase 1 premium migration and this migration (twice: it must be re-runnable).
 * Skips (exit 0 with a note) when no Postgres server binaries are installed.
 */

const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../../../../");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");

function findBin() {
  const base = "/usr/lib/postgresql";
  try {
    const versions = fs.readdirSync(base).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const bin = path.join(base, v, "bin");
      if (fs.existsSync(path.join(bin, "initdb")) && fs.existsSync(path.join(bin, "pg_ctl"))) return bin;
    }
  } catch {
    /* none */
  }
  const which = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return path.dirname(which.stdout.trim());
  return null;
}

const bin = findBin();
const psqlBin = spawnSync("sh", ["-c", "command -v psql"], { encoding: "utf8" }).stdout.trim();
if (!bin || !psqlBin) {
  console.log("plus sql selftest: skipped (no local Postgres binaries)");
  process.exit(0);
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plus-sql-"));
fs.chmodSync(dir, 0o777);
const data = path.join(dir, "data");
const port = 56000 + Math.floor(Math.random() * 2000);

function asPg(cmd, args) {
  if (!isRoot) return spawnSync(cmd, args, { encoding: "utf8" });
  const quoted = [cmd, ...args].map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(" ");
  return spawnSync("su", ["postgres", "-s", "/bin/sh", "-c", quoted], { encoding: "utf8" });
}

let started = false;
function cleanup() {
  if (started) asPg(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.on("exit", cleanup);

const init = asPg(path.join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
if (init.status !== 0) {
  console.log("plus sql selftest: skipped (initdb failed here)", (init.stderr || "").slice(0, 200));
  process.exit(0);
}
const start = asPg(path.join(bin, "pg_ctl"), ["-D", data, "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"]);
if (start.status !== 0) {
  console.log("plus sql selftest: skipped (server did not start)");
  process.exit(0);
}
started = true;

function psql(sql, { file = null } = {}) {
  const args = ["-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"];
  if (file) args.push("-f", file);
  else args.push("-c", sql);
  return execFileSync(psqlBin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const j = (sql) => JSON.parse(psql(sql));

const STUB = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text, display_name text, avatar_url text,
  banner_url text, email text, deleted_at timestamptz, descoin_balance integer DEFAULT 0, descoin_frozen boolean DEFAULT false,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.descoin_ledger (id bigserial PRIMARY KEY, user_id uuid, amount integer, reason text, meta jsonb,
  balance_after integer, created_at timestamptz DEFAULT now());
CREATE TABLE public.servers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.users(id), vanity_slug text, is_public boolean DEFAULT false, icon_url text);
CREATE TABLE public.server_members (server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE, joined_at timestamptz DEFAULT now(), PRIMARY KEY (server_id, user_id));
`;
const stubFile = path.join(dir, "stub.sql");
fs.writeFileSync(stubFile, STUB);
psql(null, { file: stubFile });
psql(null, { file: path.join(MIG_DIR, "20261106_premium_memberships.sql") });
psql(null, { file: path.join(MIG_DIR, "20261125c_descall_plus_2.sql") });
psql(null, { file: path.join(MIG_DIR, "20261125c_descall_plus_2.sql") }); // re-runnable

const U = {};
for (const name of ["admin", "manual", "buyer", "friend", "owner", "other", "group1", "group2"]) {
  U[name] = psql(`INSERT INTO public.users (username) VALUES ('${name}') RETURNING id`);
}
const S1 = psql(`INSERT INTO public.servers (name, owner_id) VALUES ('Gece Kuslari', '${U.owner}') RETURNING id`);
const S2 = psql(`INSERT INTO public.servers (name, owner_id) VALUES ('Kod Atolyesi', '${U.owner}') RETURNING id`);
const S3 = psql(`INSERT INTO public.servers (name, owner_id) VALUES ('Lo-fi Oda', '${U.owner}') RETURNING id`);
for (const s of [S1, S2]) psql(`INSERT INTO public.server_members (server_id, user_id) VALUES ('${s}', '${U.buyer}'), ('${s}', '${U.owner}')`);

const apply = (user, op, plan, days, origin, req, { endsAt = null, autoRenew = true, period = "monthly" } = {}) => j(
  `SELECT public.premium_plus_apply('${user}', '${op}', ${plan ? `'${plan}'` : "NULL"}, ${days ?? "NULL"}, ${endsAt ? `'${endsAt}'` : "NULL"},
   '${origin}', 'iyzico', 'web', ${period ? `'${period}'` : "NULL"}, ${autoRenew}, '${req}', '{}'::jsonb, NULL)`,
);

// 1) A manual (admin) unlimited grant is never shortened or ended by a payment.
let r = j(`SELECT public.premium_admin_apply('${U.admin}', '${U.manual}', 'grant', 'plus', NULL, NULL, true, true, 'test', NULL, 'req-manual-1', NULL)`);
assert.equal(r.ok, true);
r = apply(U.manual, "purchase", "plus", 30, "web", "pay-manual-1");
assert.equal(r.ok, true);
assert.equal(r.subscription.unlimited, true, "unlimited admin grant stays unlimited");
assert.equal(r.subscription.plan_id, "plus");
r = apply(U.manual, "purchase", "ultra", 30, "web", "pay-manual-2");
assert.equal(r.subscription.plan_id, "ultra", "an upgrade still changes the plan");
r = apply(U.manual, "revoke", null, null, "web", "pay-manual-3");
assert.equal(r.ok, false);
assert.equal(r.error, "admin_grant", "a refund never ends a manual grant");

// 2) Fresh purchase: active, paid, first DesCoin gift once; a replay changes nothing.
r = apply(U.buyer, "purchase", "plus", 30, "web", "pay-buyer-1");
assert.equal(r.ok, true);
assert.equal(r.subscription.active, true);
assert.equal(r.subscription.is_free, false);
assert.equal(r.subscription.source, "payment");
const bal1 = Number(psql(`SELECT descoin_balance FROM public.users WHERE id = '${U.buyer}'`));
assert.equal(bal1, 5000, "first monthly gift paid at purchase");
r = apply(U.buyer, "purchase", "plus", 30, "web", "pay-buyer-1");
assert.equal(r.replay, true);
assert.equal(Number(psql(`SELECT descoin_balance FROM public.users WHERE id = '${U.buyer}'`)), 5000, "replay pays nothing");
const end1 = psql(`SELECT ends_at FROM public.user_subscriptions WHERE user_id = '${U.buyer}'`);
r = apply(U.buyer, "renew", "plus", 30, "web", "pay-buyer-2");
assert.equal(r.event.kind, "extend");
assert.ok(new Date(r.subscription.ends_at) > new Date(end1), "renewal extends");
const me = j(`SELECT public.premium_plus_me('${U.buyer}')`);
assert.equal(me.plan, "plus");
assert.equal(me.origin, "web");
assert.equal(me.auto_renew, true);
assert.equal(me.ever_paid, true);

// cancel at period end + resume
r = apply(U.buyer, "cancel_at_end", null, null, "web", "pay-buyer-3");
assert.equal(r.ok, true);
assert.equal(j(`SELECT public.premium_plus_me('${U.buyer}')`).cancel_at_period_end, true);
r = apply(U.buyer, "resume", null, null, "web", "pay-buyer-4");
assert.equal(j(`SELECT public.premium_plus_me('${U.buyer}')`).cancel_at_period_end, false);

// 3) Trial tickets: once per account, no DesCoin while in trial, conversion pays.
const T1 = psql(`INSERT INTO public.premium_trial_tickets (owner_id, source, period, seq, status, sent_to, sent_at, expires_at)
  VALUES ('${U.buyer}', 'monthly', '2026-11', 1, 'sent', '${U.friend}', now(), now() + interval '30 days') RETURNING id`);
const T2 = psql(`INSERT INTO public.premium_trial_tickets (owner_id, source, period, seq, status, sent_to, sent_at, expires_at)
  VALUES ('${U.buyer}', 'monthly', '2026-11', 2, 'sent', '${U.friend}', now(), now() + interval '30 days') RETURNING id`);
r = j(`SELECT public.premium_ticket_redeem('${T1}', '${U.other}', 'plus', 3)`);
assert.equal(r.error, "not_redeemable", "only the person it was sent to");
r = j(`SELECT public.premium_ticket_redeem('${T1}', '${U.friend}', 'plus', 3)`);
assert.equal(r.ok, true);
assert.equal(r.subscription.is_free, true);
assert.equal(Number(psql(`SELECT descoin_balance FROM public.users WHERE id = '${U.friend}'`)), 0, "no DesCoin gift on a trial");
r = j(`SELECT public.premium_ticket_redeem('${T2}', '${U.friend}', 'plus', 3)`);
assert.equal(r.ok, false);
assert.ok(["already_active", "trial_used"].includes(r.error));
psql(`UPDATE public.user_subscriptions SET ends_at = now() - interval '1 minute' WHERE user_id = '${U.friend}'`);
r = j(`SELECT public.premium_ticket_redeem('${T2}', '${U.friend}', 'plus', 3)`);
assert.equal(r.error, "trial_used", "a second trial is refused");
psql(`UPDATE public.user_subscriptions SET ends_at = now() + interval '1 day' WHERE user_id = '${U.friend}'`);
r = apply(U.friend, "purchase", "plus", 30, "store", "pay-friend-1");
assert.equal(r.ok, true);
assert.equal(r.subscription.is_free, false, "converted trial is paid");
assert.equal(Number(psql(`SELECT descoin_balance FROM public.users WHERE id = '${U.friend}'`)), 5000, "conversion starts the DesCoin gift");

// 4) Boosts: slots, membership, cooldown, delayed move, grace, removal.
r = j(`SELECT public.premium_boost_assign('${U.other}', '${S1}', 2, 'boost-other-1')`);
assert.equal(r.error, "not_member");
r = j(`SELECT public.premium_boost_assign('${U.buyer}', '${S3}', 2, 'boost-buyer-0')`);
assert.equal(r.error, "not_in_server");
r = j(`SELECT public.premium_boost_assign('${U.buyer}', '${S1}', 2, 'boost-buyer-1')`);
assert.equal(r.ok, true);
assert.equal(r.server_count, 1);
const B1 = r.boost.id;
r = j(`SELECT public.premium_boost_assign('${U.buyer}', '${S1}', 2, 'boost-buyer-1')`);
assert.equal(r.replay, true, "boost assign is idempotent");
r = j(`SELECT public.premium_boost_assign('${U.buyer}', '${S1}', 2, 'boost-buyer-2')`);
assert.equal(r.server_count, 2);
r = j(`SELECT public.premium_boost_assign('${U.buyer}', '${S2}', 2, 'boost-buyer-3')`);
assert.equal(r.error, "no_slots");
assert.equal(j(`SELECT public.premium_boost_counts(ARRAY['${S1}']::uuid[])`)[S1], 2);
r = j(`SELECT public.premium_boost_move('${U.buyer}', '${B1}', '${S2}', 7, 24)`);
assert.equal(r.error, "cooldown");
psql(`UPDATE public.server_boosts SET created_at = now() - interval '8 days' WHERE id = '${B1}'`);
r = j(`SELECT public.premium_boost_move('${U.buyer}', '${B1}', '${S2}', 7, 24)`);
assert.equal(r.ok, true);
assert.equal(r.boost.status, "moving");
assert.equal(j(`SELECT public.premium_boost_counts(ARRAY['${S1}']::uuid[])`)[S1], 2, "still counts for the old server during the notice");
psql(`UPDATE public.server_boosts SET move_at = now() - interval '1 minute' WHERE id = '${B1}'`);
r = j(`SELECT public.premium_boost_sweep(2, 5, 3)`);
assert.ok(r.changes.some((c) => c.event === "moved_in" && c.server_id === S2));
assert.equal(j(`SELECT public.premium_boost_counts(ARRAY['${S2}']::uuid[])`)[S2], 1);
// membership lapses -> grace (3 days), then removed
psql(`UPDATE public.user_subscriptions SET ends_at = now() - interval '1 hour' WHERE user_id = '${U.buyer}'`);
r = j(`SELECT public.premium_boost_sweep(2, 5, 3)`);
assert.ok(r.changes.filter((c) => c.event === "grace").length === 2);
assert.equal(j(`SELECT public.premium_boost_counts(ARRAY['${S1}']::uuid[])`)[S1], 1, "grace still counts");
psql(`UPDATE public.server_boosts SET grace_until = now() - interval '1 minute' WHERE user_id = '${U.buyer}'`);
r = j(`SELECT public.premium_boost_sweep(2, 5, 3)`);
assert.equal(r.changes.filter((c) => c.event === "removed").length, 2);
assert.equal(j(`SELECT public.premium_boost_counts(ARRAY['${S1}','${S2}']::uuid[])`)[S1], undefined);

// 5) Gifts: scheduled -> delivered -> opened (extends), single open; return after 30 days.
const G1 = psql(`INSERT INTO public.premium_gifts (sender_id, recipient_id, plan, months, status, deliver_at, paid_at)
  VALUES ('${U.buyer}', '${U.other}', 'plus', 3, 'scheduled', now() - interval '1 minute', now()) RETURNING id`);
r = j(`SELECT public.premium_gift_sweep(30)`);
assert.equal(r.delivered.length, 1);
r = j(`SELECT public.premium_gift_open('${G1}', '${U.buyer}')`);
assert.equal(r.error, "not_openable", "the sender cannot open a delivered gift");
r = j(`SELECT public.premium_gift_open('${G1}', '${U.other}')`);
assert.equal(r.ok, true);
assert.ok(new Date(r.subscription.ends_at) > new Date(Date.now() + 85 * 86400000), "3 months");
r = j(`SELECT public.premium_gift_open('${G1}', '${U.other}')`);
assert.equal(r.error, "gift_opened");
const G2 = psql(`INSERT INTO public.premium_gifts (sender_id, recipient_id, plan, months, status, deliver_at, delivered_at, paid_at)
  VALUES ('${U.owner}', '${U.friend}', 'plus', 1, 'delivered', now() - interval '31 days', now() - interval '31 days', now()) RETURNING id`);
r = j(`SELECT public.premium_gift_sweep(30)`);
assert.equal(r.returned.length, 1);
r = j(`SELECT public.premium_gift_open('${G2}', '${U.owner}')`);
assert.equal(r.ok, true, "a returned gift goes back to the sender");

// 6) Group gift: the gift exists only when every share is paid.
const GG = psql(`INSERT INTO public.premium_group_gifts (organizer_id, recipient_id, plan, months, shares, share_minor, expires_at)
  VALUES ('${U.group1}', '${U.admin}', 'plus', 12, 2, 30000, now() + interval '7 days') RETURNING id`);
r = j(`SELECT public.premium_group_share_paid('${GG}', '${U.group1}', 'o1', 'iyzico', 'web')`);
assert.equal(r.complete, false);
r = j(`SELECT public.premium_group_share_paid('${GG}', '${U.group1}', 'o1', 'iyzico', 'web')`);
assert.equal(r.paid, 1, "paying twice is one share");
r = j(`SELECT public.premium_group_share_paid('${GG}', '${U.group2}', 'o2', 'iyzico', 'web')`);
assert.equal(r.complete, true);
assert.ok(r.gift_id);
assert.equal(psql(`SELECT status FROM public.premium_gifts WHERE id = '${r.gift_id}'`), "scheduled");

// 7) Refund of a paid membership ends it.
r = apply(U.friend, "revoke", null, null, "store", "pay-friend-2");
assert.equal(r.ok, true);
assert.equal(r.subscription.active, false);

// 8) Metrics.
const m = j(`SELECT public.premium_plus_metrics(ARRAY[2,5,10])`);
assert.ok(typeof m.subscribers === "number");
assert.ok("gift_funnel_30d" in m && "paywall_30d" in m);

// 9) Clients have no direct access.
const grants = psql(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated')
  AND table_name IN ('server_boosts','premium_gifts','premium_checkouts','payment_webhook_events')`);
assert.equal(Number(grants), 0);

console.log("plus sql selftest: ok");
