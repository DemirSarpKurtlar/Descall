"use strict";

/**
 * Real-Postgres harness for the promo-code tests. Each test file gets its own throwaway
 * database (created from PROMO_TEST_PG_URL's server), loaded with a minimal copy of the
 * production tables (fixtures/promoBaseSchema.sql) and then the real migration.
 * Uses the psql client, so no extra npm dependency. Never point this at a shared database:
 * it refuses URLs that look like Supabase.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.PROMO_TEST_PG_URL || "";
const MIGRATION = path.join(__dirname, "../../../supabase/migrations/20261026_promo_codes.sql");
const FIXTURE = path.join(__dirname, "fixtures/promoBaseSchema.sql");

function available() {
  if (!BASE_URL) return false;
  if (/supabase\.(co|com)|pooler\.supabase/i.test(BASE_URL)) {
    throw new Error("PROMO_TEST_PG_URL must be a local/CI throwaway Postgres, never Supabase");
  }
  return spawnSync("psql", ["--version"]).status === 0;
}

function withDb(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

function psqlSync(url, sql, { vars = {} } = {}) {
  const args = [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  const r = spawnSync("psql", args, { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function psqlAsync(url, sql, { vars = {} } = {}) {
  return new Promise((resolve, reject) => {
    const args = [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
    for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
    const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out))));
    child.stdin.end(sql);
  });
}

/** Fresh database named promo_<tag>_<pid>; returns its URL. */
function freshDb(tag) {
  const name = `promo_${String(tag).replace(/[^a-z0-9]/gi, "").toLowerCase()}_${process.pid}`;
  const admin = withDb(BASE_URL, "postgres");
  psqlSync(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);\nCREATE DATABASE ${name};`);
  const url = withDb(BASE_URL, name);
  psqlSync(url, fs.readFileSync(FIXTURE, "utf8"));
  psqlSync(url, fs.readFileSync(MIGRATION, "utf8"));
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

/** SELECT fn(named => literal, ...) — literals stay "unknown" so Postgres casts them to the parameter types. */
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

/** supabase-js shaped .rpc() backed by the real database (for the HTTP integration test). */
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

function q(url, sql) {
  return psqlSync(url, sql);
}

function json(url, sql) {
  const out = psqlSync(url, sql);
  return out ? JSON.parse(out) : null;
}

module.exports = { available, freshDb, rpc, rpcSql, attachRpc, q, json, psqlAsync, literal };
