/**
 * Run: node frontend/src/components/dimaai/accountScope.selftest.mjs
 */
import assert from "node:assert/strict";
import { shouldApplyAccountFetch, shouldWipeConversationOnError } from "./accountScope.js";

assert.equal(
  shouldApplyAccountFetch({
    startedUserId: "user-a",
    currentUserId: "user-b",
    startedGen: 1,
    currentGen: 1,
  }),
  false,
  "late response from account A must not apply after switch to B",
);

assert.equal(
  shouldApplyAccountFetch({
    startedUserId: "user-b",
    currentUserId: "user-b",
    startedGen: 1,
    currentGen: 2,
  }),
  false,
  "stale generation after logout/login must not apply",
);

assert.equal(
  shouldApplyAccountFetch({
    startedUserId: "user-a",
    currentUserId: "user-a",
    aborted: true,
    startedGen: 1,
    currentGen: 1,
  }),
  false,
  "aborted fetches must not write history",
);

assert.equal(
  shouldApplyAccountFetch({
    startedUserId: "user-b",
    currentUserId: "user-b",
    startedGen: 2,
    currentGen: 2,
  }),
  true,
  "matching account + generation applies",
);

assert.equal(
  shouldApplyAccountFetch({
    startedUserId: "user-a",
    currentUserId: null,
  }),
  false,
  "logged-out session must ignore in-flight history",
);

const notFound = new Error("Conversation not found.");
notFound.status = 404;
assert.equal(shouldWipeConversationOnError(notFound), true, "404 wipes leftover thread");

const forbidden = new Error("Not authorized.");
forbidden.status = 403;
assert.equal(shouldWipeConversationOnError(forbidden), true, "403 wipes leftover thread");

assert.equal(
  shouldWipeConversationOnError(new Error("Dima is temporarily unavailable. Please try again shortly.")),
  false,
  "generic outage keeps local thread only if it belongs to this account",
);

console.log("accountScope.selftest.mjs: ok");
