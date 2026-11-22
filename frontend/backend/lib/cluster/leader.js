"use strict";

/**
 * Leader lock: `dc:leader` = nodeId, SET NX PX <ttl>, renewed every beat.
 * The primary (Render) is preferred: a secondary takes the lock only while no
 * primary's alive key exists (missing for its 15 s TTL), and hands it back as
 * soon as a primary is alive again.
 *
 * KV away: the primary leads alone (single node), a secondary does not, so a
 * KV outage never runs the once-per-cluster jobs twice.
 */

const LEADER_KEY = "dc:leader";

function createLeader({ kv, nodeId, role, ttlMs = 15000, primaryAlive = async () => false, onChange = () => {} } = {}) {
  let leader = false;
  let leaderId = null;
  let busy = false;

  function set(next, id) {
    const changed = next !== leader || id !== leaderId;
    leader = next;
    leaderId = id;
    if (changed) {
      try {
        onChange(leader, leaderId);
      } catch {
        /* listener errors never break the lock */
      }
    }
  }

  /** KV away (or single node): decide alone. */
  function offline() {
    if (role === "primary") set(true, nodeId);
    else set(false, null);
  }

  async function tick() {
    if (!kv || !kv.isUp()) {
      offline();
      return leader;
    }
    if (busy) return leader;
    busy = true;
    try {
      const cur = await kv.call("get", LEADER_KEY);
      if (cur === nodeId) {
        if (role === "secondary" && (await primaryAlive())) {
          // Give the lock back to the primary.
          const again = await kv.call("get", LEADER_KEY);
          if (again === nodeId) await kv.call("del", LEADER_KEY);
          set(false, null);
        } else {
          const ok = await kv.call("set", LEADER_KEY, nodeId, "XX", "PX", ttlMs);
          set(ok === "OK", ok === "OK" ? nodeId : null);
        }
      } else if (!cur) {
        if (role === "secondary" && (await primaryAlive())) {
          set(false, null);
        } else {
          const ok = await kv.call("set", LEADER_KEY, nodeId, "NX", "PX", ttlMs);
          if (ok === "OK") set(true, nodeId);
          else set(false, await kv.call("get", LEADER_KEY).catch(() => null));
        }
      } else {
        set(false, cur);
      }
    } catch {
      offline();
    } finally {
      busy = false;
    }
    return leader;
  }

  /** Graceful stop: hand the lock over at once instead of after the TTL. */
  async function release() {
    try {
      if (kv && kv.isUp()) {
        const cur = await kv.call("get", LEADER_KEY);
        if (cur === nodeId) await kv.call("del", LEADER_KEY);
      }
    } catch {
      /* the TTL frees it anyway */
    }
    set(false, null);
  }

  offline();
  return {
    tick,
    release,
    offline,
    isLeader: () => leader,
    leaderId: () => leaderId,
  };
}

module.exports = { createLeader, LEADER_KEY };
