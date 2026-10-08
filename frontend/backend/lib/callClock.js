"use strict";

/**
 * Wall clock for call bookkeeping (DM call log + group call summaries).
 * Tests swap `now` to fast-forward a call without real waiting.
 */
const clock = {
  now: () => Date.now(),
};

module.exports = clock;
