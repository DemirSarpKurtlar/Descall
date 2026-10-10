"use strict";

const path = require("path");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase();
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const { getCodeAttempts, bumpCodeAttempts, clearCodeAttempts, resetAttemptMemory } = require("./authAttempts");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  resetAttemptMemory();
  const userId = "11111111-1111-1111-1111-111111111111";
  assert((await getCodeAttempts(userId, "password_reset")) === 0, "starts at zero");
  assert((await bumpCodeAttempts(userId, "password_reset")) === 1, "first guess");
  assert((await bumpCodeAttempts(userId, "password_reset")) === 2, "second guess");
  const row = fake._tables.auth_code_attempts.rows.find((r) => r.user_id === userId);
  assert(row && row.attempts === 2, "count is stored in the table: " + JSON.stringify(row));
  assert((await getCodeAttempts(userId, "password_reset")) === 2, "a later read keeps the count");
  await clearCodeAttempts(userId, "password_reset");
  assert((await getCodeAttempts(userId, "password_reset")) === 0, "success clears the row");
  console.log("authAttempts.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
