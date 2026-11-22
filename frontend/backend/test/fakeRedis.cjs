"use strict";

/**
 * In-memory fake of the Redis / Render Key Value commands the cluster layer
 * (lib/cluster/*) and @socket.io/redis-adapter use, with an ioredis-shaped
 * client: promises, `status`, ready/close/end events, `duplicate()`,
 * pub/sub with message / messageBuffer / pmessage / pmessageBuffer events and
 * `send_command("PUBSUB", ["NUMSUB", ch], cb)`.
 *
 * One `createFakeRedisServer()` is shared by every node of a test. The server
 * can be stopped (clients go to "reconnecting", commands reject) and started
 * again (clients come back "ready" and resubscribe, like ioredis'
 * autoResubscribe); `restart({ flush: true })` drops every key, like a Render
 * Key Value restart without persistence.
 *
 * Not a test file itself (no .test. in the name): required by the cluster tests.
 */

const { EventEmitter } = require("events");

function globToRegExp(glob) {
  let re = "^";
  for (const ch of String(glob)) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(re + "$");
}

function createFakeRedisServer({ now = () => Date.now() } = {}) {
  /** key -> { type: "string"|"hash"|"set"|"list", value, expiresAt } */
  const data = new Map();
  const clients = new Set();
  let up = true;
  const stats = { commands: 0, publishes: 0 };

  function live(key) {
    const row = data.get(key);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= now()) {
      data.delete(key);
      return null;
    }
    return row;
  }

  function typed(key, type, create) {
    let row = live(key);
    if (row && row.type !== type) {
      const err = new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
      throw err;
    }
    if (!row && create) {
      row = { type, value: type === "hash" ? new Map() : type === "set" ? new Set() : type === "list" ? [] : null, expiresAt: 0 };
      data.set(key, row);
    }
    return row;
  }

  function dropIfEmpty(key, row) {
    if (!row) return;
    const v = row.value;
    if ((v instanceof Map || v instanceof Set) && v.size === 0) data.delete(key);
    if (Array.isArray(v) && v.length === 0) data.delete(key);
  }

  function str(v) {
    if (Buffer.isBuffer(v)) return v.toString("binary");
    return String(v);
  }

  const commands = {
    ping: () => "PONG",
    get(key) {
      const row = typed(key, "string", false);
      return row ? row.value : null;
    },
    set(key, value, ...opts) {
      let nx = false;
      let xx = false;
      let px = 0;
      for (let i = 0; i < opts.length; i++) {
        const o = String(opts[i]).toUpperCase();
        if (o === "NX") nx = true;
        else if (o === "XX") xx = true;
        else if (o === "PX") px = Number(opts[++i]);
        else if (o === "EX") px = Number(opts[++i]) * 1000;
      }
      const exists = Boolean(live(key));
      if (nx && exists) return null;
      if (xx && !exists) return null;
      data.set(key, { type: "string", value: str(value), expiresAt: px ? now() + px : 0 });
      return "OK";
    },
    del(...keys) {
      let n = 0;
      for (const k of keys.flat()) if (live(k)) { data.delete(k); n += 1; }
      return n;
    },
    exists(...keys) {
      let n = 0;
      for (const k of keys.flat()) if (live(k)) n += 1;
      return n;
    },
    pexpire(key, ms) {
      const row = live(key);
      if (!row) return 0;
      row.expiresAt = now() + Number(ms);
      return 1;
    },
    expire(key, sec) {
      return commands.pexpire(key, Number(sec) * 1000);
    },
    pttl(key) {
      const row = live(key);
      if (!row) return -2;
      if (!row.expiresAt) return -1;
      return Math.max(0, row.expiresAt - now());
    },
    incr(key) {
      const row = typed(key, "string", false);
      const next = (row ? Number(row.value) || 0 : 0) + 1;
      if (row) row.value = String(next);
      else data.set(key, { type: "string", value: String(next), expiresAt: 0 });
      return next;
    },
    hset(key, ...args) {
      const row = typed(key, "hash", true);
      let pairs = args;
      if (args.length === 1 && args[0] && typeof args[0] === "object") pairs = Object.entries(args[0]).flat();
      let added = 0;
      for (let i = 0; i < pairs.length; i += 2) {
        if (!row.value.has(String(pairs[i]))) added += 1;
        row.value.set(String(pairs[i]), str(pairs[i + 1]));
      }
      return added;
    },
    hget(key, field) {
      const row = typed(key, "hash", false);
      return row ? row.value.get(String(field)) ?? null : null;
    },
    hgetall(key) {
      const row = typed(key, "hash", false);
      return row ? Object.fromEntries(row.value) : {};
    },
    hdel(key, ...fields) {
      const row = typed(key, "hash", false);
      if (!row) return 0;
      let n = 0;
      for (const f of fields.flat()) if (row.value.delete(String(f))) n += 1;
      dropIfEmpty(key, row);
      return n;
    },
    hlen(key) {
      const row = typed(key, "hash", false);
      return row ? row.value.size : 0;
    },
    sadd(key, ...members) {
      const row = typed(key, "set", true);
      let n = 0;
      for (const m of members.flat()) if (!row.value.has(str(m))) { row.value.add(str(m)); n += 1; }
      return n;
    },
    srem(key, ...members) {
      const row = typed(key, "set", false);
      if (!row) return 0;
      let n = 0;
      for (const m of members.flat()) if (row.value.delete(str(m))) n += 1;
      dropIfEmpty(key, row);
      return n;
    },
    smembers(key) {
      const row = typed(key, "set", false);
      return row ? [...row.value] : [];
    },
    sismember(key, member) {
      const row = typed(key, "set", false);
      return row && row.value.has(str(member)) ? 1 : 0;
    },
    scard(key) {
      const row = typed(key, "set", false);
      return row ? row.value.size : 0;
    },
    lpush(key, ...values) {
      const row = typed(key, "list", true);
      for (const v of values.flat()) row.value.unshift(str(v));
      return row.value.length;
    },
    ltrim(key, start, stop) {
      const row = typed(key, "list", false);
      if (!row) return "OK";
      const len = row.value.length;
      let s = Number(start);
      let e = Number(stop);
      if (s < 0) s = Math.max(0, len + s);
      if (e < 0) e = len + e;
      row.value = row.value.slice(s, e + 1);
      dropIfEmpty(key, row);
      return "OK";
    },
    lrange(key, start, stop) {
      const row = typed(key, "list", false);
      if (!row) return [];
      const len = row.value.length;
      let s = Number(start);
      let e = Number(stop);
      if (s < 0) s = Math.max(0, len + s);
      if (e < 0) e = len + e;
      return row.value.slice(s, e + 1);
    },
    llen(key) {
      const row = typed(key, "list", false);
      return row ? row.value.length : 0;
    },
    scan(cursor, ...opts) {
      let match = "*";
      for (let i = 0; i < opts.length; i++) {
        if (String(opts[i]).toUpperCase() === "MATCH") match = opts[++i];
        else if (String(opts[i]).toUpperCase() === "COUNT") i += 1;
      }
      const re = globToRegExp(match);
      const keys = [];
      for (const k of [...data.keys()]) if (live(k) && re.test(k)) keys.push(k);
      return ["0", keys];
    },
    keys(pattern) {
      return commands.scan("0", "MATCH", pattern)[1];
    },
    info() {
      let bytes = 0;
      for (const [k, row] of data) {
        bytes += k.length + 48;
        const v = row.value;
        if (typeof v === "string") bytes += v.length;
        else if (v instanceof Map) for (const [f, x] of v) bytes += f.length + x.length + 16;
        else if (v instanceof Set) for (const x of v) bytes += x.length + 16;
        else if (Array.isArray(v)) for (const x of v) bytes += x.length + 16;
      }
      return `# Memory\r\nused_memory:${bytes}\r\nmaxmemory:${25 * 1024 * 1024}\r\n`;
    },
    flushall() {
      data.clear();
      return "OK";
    },
    dbsize() {
      let n = 0;
      for (const k of [...data.keys()]) if (live(k)) n += 1;
      return n;
    },
  };

  function deliver(channel, message) {
    stats.publishes += 1;
    let receivers = 0;
    const chStr = String(channel);
    for (const c of clients) {
      if (c._closed || c.status !== "ready") continue;
      if (c._subs.has(chStr)) {
        receivers += 1;
        c._emitMessage(chStr, message);
      }
      for (const pat of c._psubs.keys()) {
        if (c._psubs.get(pat).test(chStr)) {
          receivers += 1;
          c._emitPMessage(pat, chStr, message);
        }
      }
    }
    return receivers;
  }

  function numsub(channel) {
    let n = 0;
    for (const c of clients) if (!c._closed && c.status === "ready" && c._subs.has(String(channel))) n += 1;
    return n;
  }

  const server = {
    stats,
    data,
    clients,
    isUp: () => up,
    hasCommand: (name) => Object.prototype.hasOwnProperty.call(commands, name),
    exec(name, args) {
      if (!up) throw new Error("Connection is closed.");
      const fn = commands[name];
      if (!fn) throw new Error(`ERR unknown command '${name}' (fake)`);
      stats.commands += 1;
      return fn(...args);
    },
    publish(channel, message) {
      if (!up) throw new Error("Connection is closed.");
      return deliver(channel, message);
    },
    numsub,
    /** KV goes away: every client sees close + reconnecting. */
    stop() {
      if (!up) return;
      up = false;
      for (const c of clients) c._serverDown();
    },
    /** KV is back (optionally empty). */
    start({ flush = false } = {}) {
      if (flush) data.clear();
      if (up) return;
      up = true;
      for (const c of clients) c._serverUp();
    },
    restart({ flush = true } = {}) {
      server.stop();
      server.start({ flush });
    },
    createClient(opts = {}) {
      return new FakeRedisClient(server, opts);
    },
    /** For assertions. */
    dump() {
      const out = {};
      for (const k of [...data.keys()]) {
        const row = live(k);
        if (!row) continue;
        const v = row.value;
        out[k] = v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : Array.isArray(v) ? [...v] : v;
      }
      return out;
    },
  };
  return server;
}

class FakeRedisClient extends EventEmitter {
  constructor(server, opts = {}) {
    super();
    this.setMaxListeners(100);
    this._server = server;
    this._opts = opts;
    this._subs = new Set();
    this._psubs = new Map();
    this._closed = false;
    this.status = "connecting";
    server.clients.add(this);
    setImmediate(() => {
      if (this._closed) return;
      if (server.isUp()) this._becomeReady();
      else this.status = "reconnecting";
    });
    const self = this;
    // Generic command proxy: client.hset(...) -> Promise.
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target || typeof prop === "symbol") return Reflect.get(target, prop, receiver);
        if (prop === "then" || prop === "toJSON" || prop === "inspect") return undefined;
        // Only real command names (an ioredis client has no pSubscribe / sSubscribe:
        // the Socket.IO adapter probes for them to tell node-redis v4 apart).
        if (!target._server.hasCommand(String(prop))) return undefined;
        const name = String(prop).toLowerCase();
        return (...args) => self._cmd(name, args);
      },
    });
  }

  _becomeReady() {
    this.status = "ready";
    this.emit("connect");
    this.emit("ready");
  }

  _serverDown() {
    if (this._closed) return;
    this.status = "reconnecting";
    this.emit("close");
    this.emit("reconnecting", 50);
  }

  _serverUp() {
    if (this._closed) return;
    setImmediate(() => {
      if (this._closed || !this._server.isUp()) return;
      // Subscriptions survive (ioredis autoResubscribe).
      this._becomeReady();
    });
  }

  _cmd(name, args) {
    if (this._closed) return Promise.reject(new Error("Connection is closed."));
    if (this.status !== "ready") {
      if (this._opts.enableOfflineQueue === false || !this._server.isUp()) {
        return Promise.reject(new Error("Stream isn't writeable and enableOfflineQueue options is false"));
      }
    }
    try {
      const out = this._server.exec(name, args);
      return new Promise((resolve) => setImmediate(() => resolve(out)));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  publish(channel, message) {
    if (this._closed) return Promise.reject(new Error("Connection is closed."));
    try {
      const n = this._server.publish(channel, message);
      return Promise.resolve(n);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  subscribe(...channels) {
    const cb = typeof channels[channels.length - 1] === "function" ? channels.pop() : null;
    for (const ch of channels.flat()) this._subs.add(String(ch));
    if (cb) cb(null, this._subs.size);
    return Promise.resolve(this._subs.size);
  }

  unsubscribe(...channels) {
    const list = channels.flat().filter((c) => typeof c === "string");
    if (!list.length) this._subs.clear();
    for (const ch of list) this._subs.delete(ch);
    return Promise.resolve(this._subs.size);
  }

  psubscribe(...patterns) {
    for (const p of patterns.flat()) this._psubs.set(String(p), globToRegExp(p));
    return Promise.resolve(this._psubs.size);
  }

  punsubscribe(...patterns) {
    const list = patterns.flat().filter((c) => typeof c === "string");
    if (!list.length) this._psubs.clear();
    for (const p of list) this._psubs.delete(p);
    return Promise.resolve(this._psubs.size);
  }

  _emitMessage(channel, message) {
    const buf = Buffer.isBuffer(message) ? message : Buffer.from(String(message));
    setImmediate(() => {
      if (this._closed) return;
      this.emit("message", channel, buf.toString());
      this.emit("messageBuffer", Buffer.from(channel), buf);
    });
  }

  _emitPMessage(pattern, channel, message) {
    const buf = Buffer.isBuffer(message) ? message : Buffer.from(String(message));
    setImmediate(() => {
      if (this._closed) return;
      this.emit("pmessage", pattern, channel, buf.toString());
      this.emit("pmessageBuffer", Buffer.from(pattern), Buffer.from(channel), buf);
    });
  }

  send_command(name, args, cb) {
    const upper = String(name).toUpperCase();
    let p;
    if (upper === "PUBSUB" && String(args?.[0]).toUpperCase() === "NUMSUB") {
      p = this._server.isUp() ? Promise.resolve([args[1], this._server.numsub(args[1])]) : Promise.reject(new Error("Connection is closed."));
    } else {
      p = this._cmd(String(name).toLowerCase(), args || []);
    }
    if (typeof cb === "function") p.then((r) => cb(null, r), (e) => cb(e));
    return p;
  }

  call(name, ...args) {
    return this.send_command(name, args);
  }

  info(section) {
    return this._cmd("info", [section]);
  }

  duplicate(opts = {}) {
    return new FakeRedisClient(this._server, { ...this._opts, ...opts });
  }

  quit() {
    this.disconnect();
    return Promise.resolve("OK");
  }

  disconnect() {
    if (this._closed) return;
    this._closed = true;
    this.status = "end";
    this._server.clients.delete(this);
    this.emit("close");
    this.emit("end");
  }
}

module.exports = { createFakeRedisServer, FakeRedisClient };
