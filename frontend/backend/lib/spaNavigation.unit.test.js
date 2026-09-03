"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { AMBIGUOUS_APP_ROUTE_PREFIXES, shouldServeSpaShell } = require("./spaNavigation");

function req(overrides = {}) {
  const headers = { ...(overrides.headers || {}) };
  return {
    method: overrides.method || "GET",
    path: overrides.path,
    url: overrides.url,
    headers,
    get(name) {
      return headers[String(name).toLowerCase()];
    },
  };
}

test("ambiguous prefixes include /servers plus groups/friends/calls", () => {
  for (const prefix of ["/groups", "/friends", "/calls", "/servers"]) {
    assert.ok(AMBIGUOUS_APP_ROUTE_PREFIXES.includes(prefix), prefix);
  }
});

test("browser refresh of /groups and /servers gets the SPA", () => {
  assert.equal(
    shouldServeSpaShell(req({ path: "/groups", headers: { "sec-fetch-mode": "navigate" } })),
    true
  );
  assert.equal(
    shouldServeSpaShell(req({ path: "/servers", headers: { accept: "text/html,application/xhtml+xml" } })),
    true
  );
  assert.equal(
    shouldServeSpaShell(req({ path: "/servers/abc/chan", headers: { "sec-fetch-mode": "navigate" } })),
    true
  );
});

test("API fetches without HTML/navigate stay JSON", () => {
  assert.equal(shouldServeSpaShell(req({ path: "/groups/my", headers: { accept: "application/json" } })), false);
  assert.equal(shouldServeSpaShell(req({ path: "/groups/my", headers: { accept: "*/*" } })), false);
  assert.equal(shouldServeSpaShell(req({ path: "/servers/my", headers: { accept: "*/*" } })), false);
});

test("never intercept GET /api/...", () => {
  assert.equal(
    shouldServeSpaShell(
      req({
        path: "/api/servers/my",
        headers: { accept: "text/html", "sec-fetch-mode": "navigate" },
      })
    ),
    false
  );
  assert.equal(
    shouldServeSpaShell(
      req({
        path: "/servers/my",
        headers: {
          accept: "text/html",
          "sec-fetch-mode": "navigate",
          "x-forwarded-uri": "/api/servers/my",
        },
      })
    ),
    false
  );
});

test("POST and non-ambiguous paths are left alone", () => {
  assert.equal(
    shouldServeSpaShell(req({ method: "POST", path: "/groups", headers: { accept: "text/html" } })),
    false
  );
  assert.equal(
    shouldServeSpaShell(req({ path: "/direct", headers: { "sec-fetch-mode": "navigate" } })),
    false
  );
});
