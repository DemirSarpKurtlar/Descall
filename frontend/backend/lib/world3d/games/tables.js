"use strict";

/**
 * Table manager for the Oyun odası: a registry of game tables per world room
 * (one live call), seats, reconnection grace, AFK handling, action nonces and
 * every timer an engine asks for (turn timeouts, bot moves, phase changes).
 *
 * Tick-free: no intervals. After every state change the manager asks the
 * engine for `timers(state)` and keeps exactly those running (one setTimeout
 * each, keyed, so an unchanged key keeps its deadline). Time and timers are
 * injectable (`now`, `setTimer`, `clearTimer`), so tests drive it with a fake
 * clock. Nothing here touches sockets: the later socket phase subscribes with
 * `onUpdate` and asks `payloadFor()` per recipient.
 */

const C = require("./common");
const { createRateLimiter } = require("../worldCore");

const ENGINES = {
  okey: () => require("./okey"),
  blackjack: () => require("./blackjack"),
  tavla: () => require("./tavla"),
  chess: () => require("./chess"),
};

const DEFAULTS = Object.freeze({
  graceMs: 45000, // seat kept for a dropped player, then the bot plays for them
  afkLimit: 2, // consecutive timeouts before the bot takes over a connected player
  maxTablesPerRoom: 8,
  maxMembersPerTable: 24,
  nonceMemory: 64,
  actionRate: { ratePerSec: 6, burst: 12 },
});

class TableManager {
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    this.setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
    this.rng = opts.rng || C.cryptoRng;
    this.engineCtx = opts.engineCtx || {}; // e.g. { chessRunner } or { syncBot: true } in tests
    this.onUpdate = opts.onUpdate || (() => {});
    this.onResult = opts.onResult || (() => {});
    this.onError = opts.onError || (() => {});
    this.cfg = { ...DEFAULTS, ...(opts.config || {}) };
    this.engines = opts.engines || Object.fromEntries(Object.entries(ENGINES).map(([k, f]) => [k, f()]));
    this.tables = new Map(); // id -> table
    this.rooms = new Map(); // roomKey -> Set<tableId>
    this.counter = 0;
    this.disposed = false;
  }

  ctx() {
    return { ...this.engineCtx, rng: this.rng, now: this.now() };
  }

  // ---------------------------------------------------------------- registry

  createTable(roomKey, game, options = {}) {
    const engine = this.engines[game];
    if (!engine) return { ok: false, error: "unknown_game" };
    if (typeof roomKey !== "string" || !roomKey) return { ok: false, error: "bad_room" };
    const set = this.rooms.get(roomKey) || new Set();
    if (set.size >= this.cfg.maxTablesPerRoom) return { ok: false, error: "too_many_tables" };
    const id = `${game}-${(++this.counter).toString(36)}`;
    const table = {
      id,
      roomKey,
      game,
      engine,
      state: engine.create(options),
      timers: new Map(), // key -> { handle, spec, deadline }
      grace: new Map(), // playerId -> handle
      afk: new Map(), // playerId -> consecutive timeouts
      nonces: new Map(), // playerId -> Map(nonce -> result)
      limits: new Map(), // playerId -> rate limiter
      createdAt: this.now(),
      busy: false, // an async bot move is in flight
    };
    this.tables.set(id, table);
    set.add(id);
    this.rooms.set(roomKey, set);
    return { ok: true, tableId: id };
  }

  table(id) {
    return this.tables.get(id) || null;
  }

  listTables(roomKey) {
    const ids = this.rooms.get(roomKey);
    if (!ids) return [];
    return Array.from(ids, (id) => {
      const t = this.tables.get(id);
      const st = t.state;
      return {
        id,
        game: t.game,
        phase: st.phase,
        seats: st.seats.map((x, i) => C.publicSeat(x, i)),
        members: Object.keys(st.members).length,
      };
    });
  }

  removeTable(id) {
    const t = this.tables.get(id);
    if (!t) return false;
    for (const x of t.timers.values()) this.clearTimer(x.handle);
    for (const h of t.grace.values()) this.clearTimer(h);
    t.timers.clear();
    t.grace.clear();
    this.tables.delete(id);
    const set = this.rooms.get(t.roomKey);
    if (set) {
      set.delete(id);
      if (!set.size) this.rooms.delete(t.roomKey);
    }
    return true;
  }

  /** The live call ended: drop every table of the room. */
  closeRoom(roomKey) {
    const ids = Array.from(this.rooms.get(roomKey) || []);
    ids.forEach((id) => this.removeTable(id));
    return ids.length;
  }

  dispose() {
    for (const id of Array.from(this.tables.keys())) this.removeTable(id);
    this.disposed = true;
  }

  // ---------------------------------------------------------------- membership

  join(tableId, user) {
    const t = this.table(tableId);
    if (!t) return { ok: false, error: "no_table" };
    const id = C.cleanPlayerId(user && user.id);
    if (!t.state.members[id] && Object.keys(t.state.members).length >= this.cfg.maxMembersPerTable) return { ok: false, error: "table_full" };
    return this.commit(t, t.engine.join(t.state, user));
  }

  sit(tableId, userId, seatIndex) {
    const t = this.table(tableId);
    if (!t) return { ok: false, error: "no_table" };
    return this.commit(t, t.engine.seat(t.state, userId, seatIndex, this.ctx()));
  }

  stand(tableId, userId) {
    return this.sit(tableId, userId, null);
  }

  leave(tableId, userId) {
    const t = this.table(tableId);
    if (!t) return { ok: false, error: "no_table" };
    this.clearGrace(t, String(userId));
    const res = this.commit(t, t.engine.leave(t.state, userId, this.ctx()));
    t.nonces.delete(String(userId));
    t.limits.delete(String(userId));
    t.afk.delete(String(userId));
    return res;
  }

  /** User left the world room entirely: leave every table there. */
  leaveRoom(roomKey, userId) {
    for (const id of Array.from(this.rooms.get(roomKey) || [])) {
      const t = this.tables.get(id);
      if (t && t.state.members[String(userId)]) this.leave(id, userId);
    }
  }

  start(tableId, userId) {
    const t = this.table(tableId);
    if (!t) return { ok: false, error: "no_table" };
    return this.commit(t, t.engine.start(t.state, userId, this.ctx()));
  }

  // ---------------------------------------------------------------- actions

  /**
   * A client action: { action, seq, nonce }.
   *   nonce: client-unique string; a repeat returns the first answer without
   *          applying twice (retries after a reconnect are safe).
   *   seq:   the state seq the client acted on; a turn action against an older
   *          seq is refused as "stale" (free actions such as rack arranging
   *          skip the check).
   */
  act(tableId, userId, msg = {}) {
    const t = this.table(tableId);
    if (!t) return { ok: false, error: "no_table" };
    const uid = C.cleanPlayerId(userId);
    if (!uid || !t.state.members[uid]) return { ok: false, error: "not_member" };
    const action = msg && msg.action;
    if (!action || typeof action !== "object" || typeof action.type !== "string" || action.type.length > 32) return { ok: false, error: "bad_action" };
    const nonce = typeof msg.nonce === "string" && msg.nonce.length <= 64 ? msg.nonce : null;
    const seen = nonce ? t.nonces.get(uid) : null;
    if (seen && seen.has(nonce)) return { ...seen.get(nonce), duplicate: true };
    let limiter = t.limits.get(uid);
    if (!limiter) {
      limiter = createRateLimiter({ ...this.cfg.actionRate, now: this.now });
      t.limits.set(uid, limiter);
    }
    if (!limiter.take()) return { ok: false, error: "rate_limited" };
    const free = t.engine.FREE_ACTIONS && t.engine.FREE_ACTIONS.has(action.type);
    let result;
    if (!free && msg.seq != null && msg.seq !== t.state.seq) result = { ok: false, error: "stale", seq: t.state.seq };
    else {
      const res = t.engine.apply(t.state, uid, action, this.ctx());
      if (!res.error) {
        t.afk.delete(uid);
        // A player who acts is present: hand the seat back from the bot.
        const si = C.seatOf(res.state, uid);
        if (si >= 0 && res.state.seats[si].autopilot && res.state.seats[si].connected && !this.isLeaving(res.state, si)) {
          const back = C.setPresence(res.state, uid, { autopilot: false });
          res.state = back.state;
          res.events = res.events.concat(back.events);
        }
      }
      result = this.commit(t, res);
    }
    if (nonce) {
      const map = seen || new Map();
      map.set(nonce, result);
      while (map.size > this.cfg.nonceMemory) map.delete(map.keys().next().value);
      t.nonces.set(uid, map);
    }
    return result;
  }

  isLeaving(state, seatIdx) {
    return Array.isArray(state.leaving) && state.leaving.includes(seatIdx);
  }

  /** Apply an engine result, notify, reschedule timers. */
  commit(t, res) {
    if (res.error) return { ok: false, error: res.error };
    if (res.state === t.state && res.events.length === 0) return { ok: true, seq: t.state.seq };
    t.state = res.state;
    this.reportResults(t, res.events);
    this.schedule(t);
    try {
      this.onUpdate({ tableId: t.id, roomKey: t.roomKey, game: t.game, seq: t.state.seq, events: res.events });
    } catch (err) {
      this.onError(err);
    }
    return { ok: true, seq: t.state.seq };
  }

  reportResults(t, events) {
    for (const ev of events) {
      if (ev.type === "matchOver" || ev.type === "settle" || (t.game === "chess" && ev.type === "gameOver")) {
        try {
          this.onResult({ tableId: t.id, roomKey: t.roomKey, game: t.game, event: ev, standings: t.engine.scores(t.state) });
        } catch (err) {
          this.onError(err);
        }
      }
    }
  }

  // ---------------------------------------------------------------- timers

  schedule(t) {
    if (!this.tables.has(t.id)) return;
    const specs = t.engine.timers(t.state) || [];
    const want = new Map(specs.map((s) => [s.key, s]));
    for (const [key, x] of t.timers) {
      if (!want.has(key)) {
        this.clearTimer(x.handle);
        t.timers.delete(key);
      }
    }
    for (const [key, spec] of want) {
      if (t.timers.has(key)) continue;
      const ms = Math.max(0, spec.ms | 0);
      const handle = this.setTimer(() => this.fire(t.id, key), ms);
      t.timers.set(key, { handle, spec, deadline: this.now() + ms });
    }
  }

  fire(tableId, key) {
    const t = this.table(tableId);
    if (!t) return;
    const x = t.timers.get(key);
    if (!x) return;
    t.timers.delete(key);
    const spec = x.spec;
    if (spec.kind === "system") {
      this.commitOrRetry(t, t.engine.apply(t.state, C.SYSTEM, spec.action, this.ctx()), spec);
      return;
    }
    if (spec.kind === "turn") {
      const res = t.engine.apply(t.state, spec.playerId, spec.action, this.ctx());
      if (!res.error) {
        const n = (t.afk.get(spec.playerId) || 0) + 1;
        t.afk.set(spec.playerId, n);
        if (n >= this.cfg.afkLimit) {
          const ap = C.setPresence(res.state, spec.playerId, { autopilot: true });
          if (!ap.error) {
            res.state = ap.state;
            res.events = res.events.concat(ap.events);
          }
        }
      }
      this.commitOrRetry(t, res, spec);
      return;
    }
    // Bot move (bot seat, autopiloted human, or an idle human in untimed chess).
    const seqAtFire = t.state.seq;
    let action;
    try {
      action = t.engine.botAction(t.state, spec.playerId, this.ctx());
    } catch (err) {
      this.onError(err);
      action = null;
    }
    const applyBot = (a) => {
      if (!this.tables.has(t.id)) return;
      if (t.state.seq !== seqAtFire) {
        // The table moved on while the bot was thinking: ask the engine again.
        this.schedule(t);
        return;
      }
      if (!a) {
        this.schedule(t);
        return;
      }
      this.commitOrRetry(t, t.engine.apply(t.state, spec.playerId, a, this.ctx()), spec);
    };
    if (action && typeof action.then === "function") {
      t.busy = true;
      action
        .then((a) => {
          t.busy = false;
          applyBot(a);
        })
        .catch((err) => {
          t.busy = false;
          this.onError(err);
          this.schedule(t);
        });
    } else applyBot(action);
  }

  commitOrRetry(t, res, spec) {
    if (res.error) {
      this.onError(new Error(`timer ${spec.kind} ${spec.key}: ${res.error}`));
      // Nothing changed; the same timer would fire again at once. Re-arm with a back-off.
      if (this.tables.has(t.id) && !t.timers.has(spec.key)) {
        const handle = this.setTimer(() => this.fire(t.id, spec.key), 1000);
        t.timers.set(spec.key, { handle, spec, deadline: this.now() + 1000 });
      }
      return;
    }
    this.commit(t, res);
  }

  // ---------------------------------------------------------------- reconnection

  /** Socket dropped: the seat stays, a bot plays after graceMs. */
  disconnect(userId) {
    const uid = String(userId);
    for (const t of this.tables.values()) {
      const i = C.seatOf(t.state, uid);
      if (i < 0 || t.state.seats[i].kind !== "human") continue;
      this.commit(t, t.engine.setPresence(t.state, uid, { connected: false }));
      this.clearGrace(t, uid);
      const handle = this.setTimer(() => {
        t.grace.delete(uid);
        if (!this.tables.has(t.id)) return;
        const r = t.engine.setPresence(t.state, uid, { autopilot: true });
        if (!r.error) this.commit(t, r);
      }, this.cfg.graceMs);
      t.grace.set(uid, handle);
    }
  }

  reconnect(userId) {
    const uid = String(userId);
    for (const t of this.tables.values()) {
      const i = C.seatOf(t.state, uid);
      if (i < 0 || t.state.seats[i].kind !== "human") continue;
      this.clearGrace(t, uid);
      t.afk.delete(uid);
      if (!t.state.seats[i].connected || t.state.seats[i].autopilot) {
        this.commit(t, t.engine.setPresence(t.state, uid, { connected: true }));
      }
    }
  }

  clearGrace(t, uid) {
    const h = t.grace.get(uid);
    if (h !== undefined) {
      this.clearTimer(h);
      t.grace.delete(uid);
    }
  }

  // ---------------------------------------------------------------- views

  timersOf(t) {
    return Array.from(t.timers.values()).map((x) => ({ kind: x.spec.kind, playerId: x.spec.playerId, deadline: x.deadline }));
  }

  /** Redacted view for one user (seated player, or spectator). */
  viewFor(tableId, userId) {
    const t = this.table(tableId);
    if (!t) return null;
    const v = userId == null ? t.engine.publicView(t.state) : t.engine.viewFor(t.state, String(userId));
    return { tableId: t.id, roomKey: t.roomKey, ...v, timers: this.timersOf(t), serverTime: this.now() };
  }

  /** What one recipient gets after an update: own events (private parts only for them) and view. */
  payloadFor(tableId, userId, events) {
    const t = this.table(tableId);
    if (!t) return null;
    return { tableId, seq: t.state.seq, events: C.eventsFor(events, userId), view: this.viewFor(tableId, userId) };
  }

  /** Okey rack helper (only the viewer's own rack). */
  suggest(tableId, userId, mode) {
    const t = this.table(tableId);
    if (!t || typeof t.engine.suggest !== "function") return null;
    if (!["runs", "pairs", "sorted"].includes(mode)) return null;
    return t.engine.suggest(t.state, String(userId), mode);
  }
}

module.exports = { TableManager, DEFAULTS, ENGINES };
