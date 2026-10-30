"use strict";

/**
 * admin_audit (3.1.3) against a real Postgres: the migration applies twice
 * cleanly, rows insert, and UPDATE / DELETE are refused (append-only). Skips
 * without SPECIAL_BADGES_TEST_PG_URL; the "Special badges (Postgres)" CI job sets it.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE = process.env.SPECIAL_BADGES_TEST_PG_URL || process.env.PROMO_TEST_PG_URL || "";
if (!BASE || spawnSync("psql", ["--version"]).status !== 0) {
  console.log("adminAudit.db.test.cjs: skipped (set SPECIAL_BADGES_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

const MIGRATION = path.join(__dirname, "../../../supabase/migrations/20261030_admin_audit.sql");
const withDb = (url, db) => url.replace(/\/[^/?]*(\?|$)/, `/${db}$1`);
function psql(url, sql) {
  const r = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-qtA"], { input: sql, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: r.stderr || "" };
}
function must(url, sql, msg) {
  const r = psql(url, sql);
  if (!r.ok) throw new Error(`FAIL: ${msg}\n${r.err}`);
  return r.out;
}

const name = `admin_audit_${process.pid}`;
const admin = withDb(BASE, "postgres");
must(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE); CREATE DATABASE ${name};`, "create db");
const url = withDb(BASE, name);
try {
  must(url, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;", "roles");
  const sql = fs.readFileSync(MIGRATION, "utf8");
  must(url, sql, "migration applies");
  must(url, sql, "migration re-applies (idempotent)");
  must(url, `INSERT INTO public.admin_audit (id, actor_username, action, target, meta) VALUES ('e1', 'demir', 'chat_freeze', 'true', '{"x":1}');`, "insert");
  if (must(url, "SELECT count(*) FROM public.admin_audit;", "count") !== "1") throw new Error("FAIL: one row");
  const upd = psql(url, "UPDATE public.admin_audit SET action = 'edited' WHERE id = 'e1';");
  if (upd.ok || !/append-only/.test(upd.err)) throw new Error("FAIL: UPDATE must be refused");
  const del = psql(url, "DELETE FROM public.admin_audit WHERE id = 'e1';");
  if (del.ok || !/append-only/.test(del.err)) throw new Error("FAIL: DELETE must be refused");
  const dup = psql(url, `INSERT INTO public.admin_audit (id, action) VALUES ('e1', 'again');`);
  if (dup.ok) throw new Error("FAIL: duplicate id must be refused");
  if (must(url, "SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_audit';", "rls") !== "t") throw new Error("FAIL: RLS on");
  if (must(url, "SELECT has_table_privilege('anon', 'public.admin_audit', 'SELECT')::text;", "anon") !== "false") throw new Error("FAIL: anon has no access");
  console.log("adminAudit.db.test.cjs: ok");
} finally {
  psql(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`);
}
