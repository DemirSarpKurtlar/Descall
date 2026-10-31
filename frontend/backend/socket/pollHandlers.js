"use strict";

/**
 * Poll socket events (2.12.0). Every event loads the poll by id and checks the
 * caller against the poll's own scope (lib/polls.resolvePollAccess).
 *   poll:get     { scope, messageIds[] }      → { ok, polls[] }
 *   poll:vote    { pollId, optionIds[] }      → { ok, poll }   ([] removes the vote)
 *   poll:close   { pollId }                   → { ok, poll }   creator or MANAGE_MESSAGES
 *   poll:edit    { pollId, poll }             → { ok, poll }   creator, before the first vote
 *   poll:voters  { pollId }                   → { ok, poll, voters }
 * Replies go to the ack callback when there is one, else as `poll:result`.
 */

const polls = require("../lib/polls");

const WINDOW_MS = 10000;
const MAX_OPS = 40;

function registerPollHandlers(io, socket) {
  const myId = socket.user?.id;
  let windowStart = Date.now();
  let ops = 0;
  const limited = () => {
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) {
      windowStart = now;
      ops = 0;
    }
    ops += 1;
    return ops > MAX_OPS;
  };

  const handle = (event, fn) => {
    socket.on(event, async (payload = {}, cb) => {
      const reply = (result) => {
        const out = { event, requestId: payload?.requestId || null, ...result };
        if (typeof cb === "function") cb(out);
        else socket.emit("poll:result", out);
      };
      if (!myId) return reply({ ok: false, code: "NO_ACCESS", message: "Session not found." });
      if (limited()) return reply({ ok: false, code: "RATE_LIMITED", message: "Too fast, wait a moment." });
      try {
        reply(await fn(payload || {}));
      } catch (err) {
        console.warn(`[polls] ${event} failed:`, err?.message || err);
        reply({ ok: false, code: "POLL_ERROR", message: "The poll action failed." });
      }
    });
  };

  handle("poll:get", async ({ scope, messageIds }) => {
    const rows = await polls.loadPollsByMessageIds(scope, messageIds);
    return { ok: true, polls: await polls.snapshotsForViewer(myId, rows) };
  });
  handle("poll:vote", ({ pollId, optionIds }) => polls.castVote(io, { userId: myId, pollId, optionIds }));
  handle("poll:close", ({ pollId }) => polls.closePoll(io, { pollId, actorId: myId }));
  handle("poll:edit", ({ pollId, poll }) => polls.editPoll(io, { userId: myId, pollId, input: poll }));
  handle("poll:voters", ({ pollId }) => polls.listVoters({ userId: myId, pollId }));
}

module.exports = { registerPollHandlers };
