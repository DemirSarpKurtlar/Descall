"use strict";

/**
 * Real-Postgres harness for the Descall+ / Ultra tests (copy of promoPg.cjs). Each test file gets
 * a throwaway database on PREMIUM_TEST_PG_URL's server (falls back to PROMO_TEST_PG_URL), loaded
 * with the minimal production stand-ins, the promo migration (it widened the ledger reasons that
 * production has today) and then the premium migration. Uses the psql client, no npm dependency.
 * Refuses URLs that look like Supabase: never point it at a shared database.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.PREMIUM_TEST_PG_URL || process.env.PROMO_TEST_PG_URL || "";
const MIGRATIONS = path.join(__dirname, "../../../supabase/migrations");
const PREMIUM_MIGRATION = path.join(MIGRATIONS, "20261106_premium_memberships.sql");
const PROMO_MIGRATION = path.join(MIGRATIONS, "20261026_promo_codes.sql");
const PROMO_FIXTURE = path.join(__dirname, "fixtures/promoBaseSchema.sql");
const OWN_FIXTURE = path.join(__dirname, "fixtures/premiumBaseSchema.sql");

function available() {
  if (!BASE_URL) return false;
  if (/supabase\.(co|com)|pooler\.supabase/i.test(BASE_URL)) {
    throw new Error("PREMIUM_TEST_PG_URL must be a local/CI throwaway Postgres, never Supabase");
  }
  return spawnSync("psql", ["--version"]).status === 0;
}

function withDb(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const ARGS = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];

function psqlSync(url, sql) {
  const r = spawnSync("psql", [url, ...ARGS], { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function psqlAsync(url, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [url, ...ARGS], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out))));
    child.stdin.end(sql);
  });
}

/** Fresh database premium_<tag>_<pid>; returns { url, drop() }. */
function freshDb(tag) {
  const name = `premium_${String(tag).replace(/[^a-z0-9]/gi, "").toLowerCase()}_${process.pid}`;
  const admin = withDb(BASE_URL, "postgres");
  psqlSync(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);\nCREATE DATABASE ${name};`);
  const url = withDb(BASE_URL, name);
  psqlSync(url, fs.readFileSync(PROMO_FIXTURE, "utf8"));
  psqlSync(url, fs.readFileSync(OWN_FIXTURE, "utf8"));
  psqlSync(url, fs.readFileSync(PROMO_MIGRATION, "utf8"));
  psqlSync(url, fs.readFileSync(PREMIUM_MIGRATION, "utf8"));
  return {
    url,
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

/** SELECT fn(named => literal, ...); literals stay "unknown" so Postgres casts them to the parameter types. */
function rpcSql(name, args = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("bad function name");
  const parts = Object.entries(args).map(([k, v]) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error("bad arg name");
    if (Array.isArray(v)) return `${k} => ${literal(`{${v.join(",")}}`)}`;
    return `${k} => ${literal(v)}`;
  });
  return `SELECT coalesce(to_jsonb(public.${name}(${parts.join(", ")})), 'null'::jsonb);`;
}

async function rpc(url, name, args) {
  const out = await psqlAsync(url, rpcSql(name, args));
  return JSON.parse(out || "null");
}

/** supabase-js shaped .rpc() backed by the real database (for HTTP tests). */
function attachRpc(fake, url) {
  fake.rpc = async (name, args) => {
    try {
      return { data: await rpc(url, name, args), error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  };
  return fake;
}

module.exports = {
  available,
  freshDb,
  rpc,
  rpcSql,
  attachRpc,
  literal,
  psqlAsync,
  PREMIUM_MIGRATION,
  q: (url, sql) => psqlSync(url, sql),
  json: (url, sql) => { const out = psqlSync(url, sql); return out ? JSON.parse(out) : null; },
};
