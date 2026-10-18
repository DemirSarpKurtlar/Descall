// Daily free-quota guard (scale plan S2). Cloudflare Workers Free counts every Worker
// request and every 20 incoming WebSocket messages as one request (100,000/day, reset
// 00:00 UTC). Past `soft` the Hub stops taking new clients (they fall back to Render);
// past `hard` it closes every client, so the account never reaches the hard limit and
// nothing paid is ever needed. Pure logic; the Durable Object persists the snapshot.

export const DEFAULT_SOFT = 80000;
export const DEFAULT_HARD = 92000;
export const WS_MESSAGES_PER_UNIT = 20;

export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function createBudget({ soft = DEFAULT_SOFT, hard = DEFAULT_HARD, now = Date.now, snapshot = null } = {}) {
  let day = snapshot?.day || utcDay(now());
  let requests = Number(snapshot?.requests) || 0;
  let wsMessages = Number(snapshot?.wsMessages) || 0;
  let dirty = 0;
  const roll = () => {
    const d = utcDay(now());
    if (d !== day) {
      day = d;
      requests = 0;
      wsMessages = 0;
      dirty += 1;
    }
  };
  const units = () => requests + Math.ceil(wsMessages / WS_MESSAGES_PER_UNIT);
  return {
    request(n = 1) {
      roll();
      requests += n;
      dirty += n * WS_MESSAGES_PER_UNIT;
    },
    wsMessage(n = 1) {
      roll();
      wsMessages += n;
      dirty += n;
    },
    units() {
      roll();
      return units();
    },
    /** "ok" | "soft" | "hard" */
    level() {
      roll();
      const u = units();
      if (u >= hard) return "hard";
      if (u >= soft) return "soft";
      return "ok";
    },
    /** True about every 10 units of change, so storage writes stay tiny. */
    shouldPersist() {
      return dirty >= 10 * WS_MESSAGES_PER_UNIT;
    },
    snapshot() {
      dirty = 0;
      return { day, requests, wsMessages };
    },
    info() {
      roll();
      return { day, units: units(), soft, hard, level: this.level() };
    },
  };
}
