"use strict";

/**
 * In-process stand-in for the Market 2.0 tables while supabase/migrations/20261115_shop2.sql
 * is not applied (degraded mode: per instance, lost on restart, nothing about money lives
 * here: wallet, ledger and inventory always use the real tables). Implements the subset of the
 * supabase-js builder the shop2 services use.
 */

const crypto = require("crypto");

/** PostgREST-shaped error (code + diagnostic text, never shown to users). */
function pgErr(code, detail) {
  return { code, message: detail };
}
const NO_ROWS = "no rows";
const DUPLICATE = "duplicate key value violates unique constraint";

const UNIQUE = {
  shop2_storefronts: ["user_id", "day"],
  shop2_wishlist: ["user_id", "item_id"],
  shop2_set_locks: ["user_id", "set_key"],
  shop2_night_flips: ["night_id", "user_id", "card_index"],
  shop2_set_completions: ["user_id", "set_key"],
  shop2_ab_exposures: ["test_id", "user_id"],
  shop2_user_state: ["user_id"],
  shop2_settings: ["key"],
  shop2_sets: ["set_key"],
  shop2_rule_versions: ["version"],
};

function cmp(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a > b ? 1 : -1;
}

function likeRe(pat) {
  return new RegExp(`^${String(pat).split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
}

class Q {
  constructor(store, name) {
    this.store = store;
    this.name = name;
    this.mode = "select";
    this.filters = [];
    this.one = false;
    this.maybe = false;
  }
  get rows() {
    if (!this.store.has(this.name)) this.store.set(this.name, []);
    return this.store.get(this.name);
  }
  select(_c, opts) {
    if (opts && opts.count) {
      this.count = true;
      this.head = Boolean(opts.head);
    }
    return this;
  }
  f(fn) {
    this.filters.push(fn);
    return this;
  }
  eq(c, v) { return this.f((r) => r[c] === v || (r[c] != null && v != null && String(r[c]) === String(v) && typeof r[c] !== "boolean")); }
  neq(c, v) { return this.f((r) => r[c] !== v); }
  in(c, v) { const s = new Set((v || []).map(String)); return this.f((r) => r[c] != null && s.has(String(r[c]))); }
  gt(c, v) { return this.f((r) => r[c] != null && cmp(r[c], v) > 0); }
  gte(c, v) { return this.f((r) => r[c] != null && cmp(r[c], v) >= 0); }
  lt(c, v) { return this.f((r) => r[c] != null && cmp(r[c], v) < 0); }
  lte(c, v) { return this.f((r) => r[c] != null && cmp(r[c], v) <= 0); }
  like(c, v) { const re = likeRe(v); return this.f((r) => re.test(String(r[c] ?? ""))); }
  is(c, v) { return this.f((r) => (v === null ? r[c] == null : r[c] === v)); }
  not(c, op, v) { return op === "is" && v === null ? this.f((r) => r[c] != null) : this; }
  contains(c, v) { return this.f((r) => Array.isArray(r[c]) && (v || []).every((x) => r[c].includes(x))); }
  order(c, o = {}) { this.ord = [c, o.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  maybeSingle() { this.one = true; this.maybe = true; return this; }
  single() { this.one = true; return this; }
  insert(p) { this.mode = "insert"; this.payload = p; return this; }
  upsert(p, o = {}) { this.mode = "upsert"; this.payload = p; this.uopts = o; return this; }
  update(p) { this.mode = "update"; this.payload = p; return this; }
  delete() { this.mode = "delete"; return this; }
  match(r) { return this.filters.every((fn) => fn(r)); }
  fresh(p) {
    return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(JSON.stringify(p)) };
  }
  run() {
    const rows = this.rows;
    const out = (list) => {
      if (this.one) {
        if (!list.length) return this.maybe ? { data: null, error: null } : { data: null, error: pgErr("PGRST116", NO_ROWS) };
        return { data: list[0], error: null };
      }
      return { data: list, error: null };
    };
    if (this.mode === "insert" || this.mode === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = this.uopts?.onConflict ? String(this.uopts.onConflict).split(",") : UNIQUE[this.name];
      const done = [];
      for (const p of list) {
        const hit = keys ? rows.find((r) => keys.every((k) => String(r[k]) === String(p[k]))) : null;
        if (hit && this.mode === "insert") return { data: null, error: pgErr("23505", `${DUPLICATE} "${this.name}_key"`) };
        if (hit) {
          if (this.uopts?.ignoreDuplicates) continue;
          Object.assign(hit, JSON.parse(JSON.stringify(p)));
          done.push(hit);
        } else {
          const row = this.fresh(p);
          rows.push(row);
          done.push(row);
        }
      }
      return out(done.map((r) => ({ ...r })));
    }
    const matched = rows.filter((r) => this.match(r));
    if (this.mode === "update") {
      for (const r of matched) Object.assign(r, JSON.parse(JSON.stringify(this.payload)));
      return out(matched.map((r) => ({ ...r })));
    }
    if (this.mode === "delete") {
      const keep = rows.filter((r) => !this.match(r));
      rows.length = 0;
      rows.push(...keep);
      return out(matched.map((r) => ({ ...r })));
    }
    let list = matched.map((r) => ({ ...r }));
    if (this.ord) {
      const [c, asc] = this.ord;
      list.sort((a, b) => (asc ? cmp(a[c], b[c]) : cmp(b[c], a[c])));
    }
    const total = list.length;
    if (this.rng) list = list.slice(this.rng[0], this.rng[1] + 1);
    if (typeof this.lim === "number") list = list.slice(0, this.lim);
    if (this.count) return { data: this.head ? null : list, count: total, error: null };
    return out(list);
  }
  then(resolve, reject) {
    try {
      resolve(this.run());
    } catch (err) {
      if (reject) reject(err);
    }
  }
}
function createMemDb() {
  const store = new Map();
  return {
    _store: store,
    from(name) {
      return new Q(store, name);
    },
    reset() {
      store.clear();
    },
  };
}

module.exports = { createMemDb, UNIQUE };
