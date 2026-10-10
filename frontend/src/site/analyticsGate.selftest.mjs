import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = {
  dispatchEvent() {},
  __descallAnalyticsAllowed: false,
};

const gate = await import("./analyticsGate.js");

assert.equal(gate.isAnalyticsAllowed(), false);
gate.markAnalyticsAllowed();
assert.equal(gate.isAnalyticsAllowed(), false, "session flag must not grant analytics");

gate.setCookieConsent("accepted");
assert.equal(gate.isAnalyticsAllowed(), true);

gate.setCookieConsent("rejected");
assert.equal(gate.isAnalyticsAllowed(), false);

const year = new Date().getFullYear();
localStorage.setItem("descall_user", JSON.stringify({ birthDate: `${year - 14}-01-01` }));
gate.setCookieConsent("accepted");
assert.equal(gate.analyticsBlockedByAge(), true);
assert.equal(gate.isAnalyticsAllowed(), false, "under 16 stays off even after accept");

localStorage.setItem("descall_user", JSON.stringify({ birthDate: `${year - 30}-01-01` }));
assert.equal(gate.isAnalyticsAllowed(), true);

localStorage.removeItem("descall_user");
assert.equal(gate.isAnalyticsAllowed(), true, "unknown age is not blocked");

console.log("analyticsGate.selftest ok");
