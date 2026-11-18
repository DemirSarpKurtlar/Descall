"use strict";

/** lib/selectPaged.js: reads past the 1000-row cap, in order, without repeats (polish admin-b-04). */

const assert = require("assert");
const { selectPaged } = require("../lib/selectPaged");

const ROWS = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
let calls = 0;
function build({ withCount = true, failAt = null } = {}) {
  return () => ({
    range(from, to) {
      calls += 1;
      if (failAt != null && from >= failAt) return Promise.resolve({ data: null, error: { message: "boom" } });
      // PostgREST cap: never more than 1000 rows per read.
      const end = Math.min(to, from + 999);
      return Promise.resolve({ data: ROWS.slice(from, end + 1), error: null, count: withCount ? ROWS.length : null });
    },
  });
}

(async () => {
  let r = await selectPaged(build());
  assert.equal(r.error, null);
  assert.equal(r.data.length, 2500, "all rows past the cap");
  assert.equal(new Set(r.data.map((x) => x.id)).size, 2500, "no repeats");
  assert.equal(r.count, 2500);

  r = await selectPaged(build({ withCount: false }));
  assert.equal(r.data.length, 2500, "works without an exact count");

  r = await selectPaged(build(), { maxRows: 1500 });
  assert.equal(r.data.length, 1500);
  assert.equal(r.capped, true, "reports the cap");

  r = await selectPaged(build({ failAt: 1000 }));
  assert.ok(r.error && r.data === null, "a failing page fails the read");

  calls = 0;
  r = await selectPaged(() => ({ range: () => Promise.resolve({ data: [{ id: 1 }], error: null, count: 1 }) }));
  assert.equal(r.data.length, 1);
  console.log("selectPaged.unit: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
