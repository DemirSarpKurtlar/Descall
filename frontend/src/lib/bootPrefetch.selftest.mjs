// node src/lib/bootPrefetch.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOOT_PREFETCH_TTL_MS, bootPrefetchOr, clearBootPrefetch, putBootPrefetch, takeBootPrefetch } from "./bootPrefetch.js";

// One-shot: the first caller with the same token gets the promise, the next one nothing.
{
  clearBootPrefetch();
  const p = Promise.resolve({ user: { id: 1 } });
  putBootPrefetch("me", "tok", p, 1000);
  assert.equal(takeBootPrefetch("me", "tok", 1500), p);
  assert.equal(takeBootPrefetch("me", "tok", 1600), null);
}

// Another token (sign-out, account switch) or an old entry is never served.
{
  clearBootPrefetch();
  putBootPrefetch("friends", "old", Promise.resolve([]), 0);
  assert.equal(takeBootPrefetch("friends", "new", 10), null);
  putBootPrefetch("friends", "tok", Promise.resolve([]), 0);
  assert.equal(takeBootPrefetch("friends", "tok", BOOT_PREFETCH_TTL_MS + 1), null);
}

// bootPrefetchOr: no entry -> fresh request; network failure -> fresh request;
// HTTP error -> passed on (a 401 must still sign out, no second request).
{
  clearBootPrefetch();
  let fresh = 0;
  const run = () => {
    fresh += 1;
    return Promise.resolve("fresh");
  };
  assert.equal(await bootPrefetchOr("dmPreviews", "tok", run), "fresh");
  assert.equal(fresh, 1);

  putBootPrefetch("dmPreviews", "tok", Promise.resolve("boot"));
  assert.equal(await bootPrefetchOr("dmPreviews", "tok", run), "boot");
  assert.equal(fresh, 1);

  putBootPrefetch("dmPreviews", "tok", Promise.reject(new TypeError("Failed to fetch")));
  assert.equal(await bootPrefetchOr("dmPreviews", "tok", run), "fresh");
  assert.equal(fresh, 2);

  const unauthorized = Object.assign(new Error("Unauthorized"), { status: 401 });
  putBootPrefetch("me", "tok", Promise.reject(unauthorized));
  await assert.rejects(bootPrefetchOr("me", "tok", run), (err) => err.status === 401);
  assert.equal(fresh, 2);
}

// Wiring: main.jsx starts it for a signed-in app boot only; the API calls take it.
{
  const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(main, /!preferMarketingShell && hasSession && !isAdminWindow[\s\S]{0,200}startBootPrefetch\(token\)/);
  const auth = readFileSync(new URL("../api/auth.js", import.meta.url), "utf8");
  assert.match(auth, /bootPrefetchOr\("me", token/);
  assert.match(readFileSync(new URL("../api/friends.js", import.meta.url), "utf8"), /bootPrefetchOr\("friends"/);
  assert.match(readFileSync(new URL("../api/dm.js", import.meta.url), "utf8"), /bootPrefetchOr\("dmPreviews"/);
}

console.log("bootPrefetch selftest ok");
