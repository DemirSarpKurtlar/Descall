"use strict";

/**
 * Real-Postgres harness for the special-badge tests. Each test file gets a throwaway database
 * on SPECIAL_BADGES_TEST_PG_URL's server (falls back to PROMO_TEST_PG_URL), loaded with a
 * minimal copy of the production tables, the promo migration when it is in the tree, and
 * then the special-badge migration. Uses the psql client, no extra npm dependency.
 * Refuses URLs that look like Supabase: never point it at a shared database.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.SPECIAL_BADGES_TEST_PG_URL || process.env.PROMO_TEST_PG_URL || "";
const MIGRATIONS = path.join(__dirname, "../../../supabase/migrations");
const BADGE_MIGRATION = path.join(MIGRATIONS, "20261026_special_badges.sql");
const PROMO_MIGRATION = path.join(MIGRATIONS, "20261026_promo_codes.sql");
const PROMO_FIXTURE = path.join(__dirname, "fixtures/promoBaseSchema.sql");
const OWN_FIXTURE = path.join(__dirname, "fixtures/specialBadgesBaseSchema.sql");

function available() {
  if (!BASE_URL) return false;
  if (/supabase\.(co|com)|pooler\.supabase/i.test(BASE_URL)) {
    throw new Error("SPECIAL_BADGES_TEST_PG_URL must be a local/CI throwaway Postgres, never Supabase");
  }
  return spawnSync("psql", ["--version"]).status === 0;
}

function withDb(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

function psqlArgs(url) {
  return [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
}

function psqlSync(url, sql) {
  const r = spawnSync("psql", psqlArgs(url), { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function psqlAsync(url, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", psqlArgs(url), { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out))));
    child.stdin.end(sql);
  });
}

const hasPromo = () => fs.existsSync(PROMO_MIGRATION) && fs.existsSync(PROMO_FIXTURE);

/**
 * Fresh database sbadge_<tag>_<pid>; returns { url, promo, drop() }.
 * `withPromo: false` skips the promo migration (checks the badge migration stands alone).
 */
function freshDb(tag, { withPromo = true } = {}) {
  const name = `sbadge_${String(tag).replace(/[^a-z0-9]/gi, "").toLowerCase()}_${process.pid}`;
  const admin = withDb(BASE_URL, "postgres");
  psqlSync(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);\nCREATE DATABASE ${name};`);
  const url = withDb(BASE_URL, name);
  const promo = withPromo && hasPromo();
  psqlSync(url, fs.readFileSync(promo || hasPromo() ? PROMO_FIXTURE : OWN_FIXTURE, "utf8"));
  if (promo) psqlSync(url, fs.readFileSync(PROMO_MIGRATION, "utf8"));
  psqlSync(url, fs.readFileSync(BADGE_MIGRATION, "utf8"));
  return {
    url,
    promo,
    drop() {
      try { psqlSync(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`); } catch { /* best effort */ }
    },
  };
}

function literal(v) {
  if (v === null || v === undefined) return "NULL";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

function rpcSql(name, args = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("bad function name");
  const parts = Object.entries(args).map(([k, v]) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error("bad arg name");
    return `${k} => ${literal(v)}`;
  });
  return `SELECT coalesce(to_jsonb(public.${name}(${parts.join(", ")})), 'null'::jsonb);`;
}

async function rpc(url, name, args) {
  const out = await psqlAsync(url, rpcSql(name, args));
  return JSON.parse(out || "null");
}

module.exports = {
  available, freshDb, rpc, rpcSql, literal, psqlAsync, BADGE_MIGRATION,
  q: (url, sql) => psqlSync(url, sql),
  json: (url, sql) => { const out = psqlSync(url, sql); return out ? JSON.parse(out) : null; },
};
