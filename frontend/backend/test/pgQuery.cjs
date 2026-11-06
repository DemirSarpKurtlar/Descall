"use strict";

/**
 * A supabase-js shaped query builder backed by a real Postgres through psql (tests only). It covers
 * the chains the premium admin service uses on its tables: select (with {count, head}), insert,
 * update, eq / neq / in / gt / gte / lt / lte / like / ilike / or, order, limit, single and
 * maybeSingle. Errors come back as { code: SQLSTATE, message } like PostgREST does, so the
 * service's own error mapping (23505 -> code_taken, ...) is exercised against the real constraints.
 */

const { spawn } = require("child_process");

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name) {
  if (!IDENT.test(String(name))) throw new Error(`pgQuery: bad identifier ${name}`);
  return name;
}

function literal(v) {
  if (v === null || v === undefined) return "NULL";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

function psql(url, sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ ok: code === 0, out: out.trim(), err }));
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}`);
  });
}

function pgError(stderr) {
  const m = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr || "");
  return { code: m ? m[1] : "XX000", message: m ? m[2] : String(stderr || "psql failed").slice(0, 300) };
}

const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function condition(col, op, val) {
  const c = ident(col);
  if (OPS[op]) return `${c} ${OPS[op]} ${literal(val)}`;
  if (op === "like") return `${c}::text LIKE ${literal(val)}`;
  if (op === "ilike") return `${c}::text ILIKE ${literal(val)}`;
  if (op === "in") return `${c} = ANY(${literal(`{${(val || []).map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")}}`)})`;
  if (op === "is") return val === null || val === "null" ? `${c} IS NULL` : `${c} IS ${val === true || val === "true" ? "TRUE" : "FALSE"}`;
  throw new Error(`pgQuery: unsupported operator ${op}`);
}

/** PostgREST or(): "a.eq.1,b.ilike.%x%" (no nested groups). */
function orCondition(expr) {
  const parts = String(expr).split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    return condition(col, op, rest.join("."));
  });
  return `(${parts.join(" OR ")})`;
}

class Query {
  constructor(url, table) {
    this.url = url;
    this.table = ident(table);
    this.kind = "select";
    this.cols = "*";
    this.where = [];
    this.orders = [];
    this.limitN = null;
    this.countMode = null;
    this.head = false;
    this.one = null;
    this.payload = null;
    this.returning = false;
  }

  select(cols = "*", opts = {}) {
    if (this.kind === "select") {
      this.cols = cols;
      this.countMode = opts.count || null;
      this.head = Boolean(opts.head);
    } else {
      this.returning = true;
      this.cols = cols;
    }
    return this;
  }

  insert(row) {
    this.kind = "insert";
    this.payload = row;
    return this;
  }

  update(patch) {
    this.kind = "update";
    this.payload = patch;
    return this;
  }

  eq(c, v) { this.where.push(condition(c, "eq", v)); return this; }
  neq(c, v) { this.where.push(condition(c, "neq", v)); return this; }
  gt(c, v) { this.where.push(condition(c, "gt", v)); return this; }
  gte(c, v) { this.where.push(condition(c, "gte", v)); return this; }
  lt(c, v) { this.where.push(condition(c, "lt", v)); return this; }
  lte(c, v) { this.where.push(condition(c, "lte", v)); return this; }
  like(c, v) { this.where.push(condition(c, "like", v)); return this; }
  ilike(c, v) { this.where.push(condition(c, "ilike", v)); return this; }
  in(c, v) { this.where.push(condition(c, "in", v)); return this; }
  is(c, v) { this.where.push(condition(c, "is", v)); return this; }
  or(expr) { this.where.push(orCondition(expr)); return this; }

  order(col, { ascending = true } = {}) {
    this.orders.push(`${ident(col)} ${ascending ? "ASC" : "DESC"}`);
    return this;
  }

  limit(n) {
    this.limitN = Math.max(0, Number(n) || 0);
    return this;
  }

  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "one"; return this; }

  colList() {
    if (!this.cols || this.cols.trim() === "*") return "t.*";
    return this.cols.split(",").map((c) => `t.${ident(c.trim())}`).join(", ");
  }

  sql() {
    const where = this.where.length ? ` WHERE ${this.where.join(" AND ")}` : "";
    if (this.kind === "select") {
      if (this.head) return `SELECT json_build_object('count', count(*))::text FROM public.${this.table}${where};`;
      const order = this.orders.length ? ` ORDER BY ${this.orders.join(", ")}` : "";
      const limit = this.limitN != null ? ` LIMIT ${this.limitN}` : "";
      const count = this.countMode ? `, 'count', (SELECT count(*) FROM public.${this.table}${where})` : "";
      return `SELECT json_build_object('rows', coalesce(json_agg(x), '[]'::json)${count})::text FROM (SELECT ${this.colList()} FROM public.${this.table} t${where}${order}${limit}) x;`;
    }
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))].map(ident);
    const ret = this.returning ? this.colList() : "NULL";
    if (this.kind === "insert") {
      const json = literal(JSON.stringify(rows));
      return `WITH ins AS (INSERT INTO public.${this.table} (${keys.join(", ")}) SELECT ${keys.map((k) => `r.${k}`).join(", ")} FROM jsonb_populate_recordset(NULL::public.${this.table}, ${json}::jsonb) r RETURNING *)
SELECT json_build_object('rows', coalesce(json_agg(x), '[]'::json))::text FROM (SELECT ${ret} FROM ins t) x;`;
    }
    const json = literal(JSON.stringify(this.payload || {}));
    // The record sits in one composite column (z.rec) so the WHERE columns stay unambiguous.
    const set = keys.map((k) => `${k} = (z.rec).${k}`).join(", ");
    const whereUpd = this.where.length ? ` AND ${this.where.join(" AND ")}` : "";
    return `WITH upd AS (UPDATE public.${this.table} SET ${set} FROM (SELECT jsonb_populate_record(NULL::public.${this.table}, ${json}::jsonb) AS rec) z WHERE true${whereUpd} RETURNING public.${this.table}.*)
SELECT json_build_object('rows', coalesce(json_agg(x), '[]'::json))::text FROM (SELECT ${ret} FROM upd t) x;`;
  }

  async run() {
    let text;
    try {
      text = this.sql();
    } catch (err) {
      return { data: null, error: { code: "PGRST100", message: err.message } };
    }
    const res = await psql(this.url, text);
    if (!res.ok) return { data: null, error: pgError(res.err) };
    const body = JSON.parse(res.out || "{}");
    if (this.head) return { data: null, count: body.count, error: null };
    const rows = body.rows || [];
    if (this.one === "maybe") return { data: rows[0] || null, error: null };
    if (this.one === "one") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } };
    if (this.kind !== "select" && !this.returning) return { data: null, error: null };
    return { data: rows, count: body.count, error: null };
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
}

function from(url, table) {
  return new Query(url, table);
}

/** Routes .from(table) for the listed tables to Postgres; every other table stays on the fake. */
function attachTables(fake, url, tables) {
  const real = new Set(tables);
  const orig = fake.from.bind(fake);
  fake.from = (table) => (real.has(table) ? from(url, table) : orig(table));
  return fake;
}

module.exports = { attachTables, from, literal };
