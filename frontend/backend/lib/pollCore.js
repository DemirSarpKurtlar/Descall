"use strict";

/**
 * Pure poll rules (no DB). Shared by the socket handlers, the /poll slash
 * command and the selftest. Error messages are static English (the client translates
 * them); stored text (fallback body, "poll ended" line) is English with an i18n ref
 * (lib/botText.js, bot.poll.*).
 */

const { ref, en } = require("./botText");

const LIMITS = Object.freeze({ question: 300, option: 100, minOptions: 2, maxOptions: 10, emoji: 16 });

/** Allowed durations, same as the creation sheet (1 sa · 4 sa · 8 sa · 24 sa · 3 gün · 1 hafta). */
const DURATIONS = Object.freeze([3600, 14400, 28800, 86400, 259200, 604800]);
const DEFAULT_DURATION = 86400;

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanEmoji(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > LIMITS.emoji || !EMOJI_RE.test(raw) || /[A-Za-z0-9<>]/.test(raw)) return null;
  return raw;
}

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * Validates a poll payload from the creation sheet or the /poll text command.
 * Returns { ok: true, poll: { question, options: [{ text, emoji }], multi, anonymous, durationSeconds } }.
 */
function normalizePollInput(raw) {
  if (!raw || typeof raw !== "object") return fail("BAD_POLL", "Poll details are missing.");
  const question = clean(raw.question, LIMITS.question);
  if (!question) return fail("BAD_QUESTION", "Write a question.");
  const list = Array.isArray(raw.options) ? raw.options : [];
  const options = [];
  const seen = new Set();
  for (const item of list) {
    const text = clean(typeof item === "string" ? item : item?.text, LIMITS.option);
    if (!text) continue;
    const key = text.toLocaleLowerCase("tr");
    if (seen.has(key)) return fail("DUPLICATE_OPTION", "Options must be different from each other.");
    seen.add(key);
    options.push({ text, emoji: typeof item === "object" ? cleanEmoji(item?.emoji) : null });
  }
  if (options.length < LIMITS.minOptions) return fail("TOO_FEW_OPTIONS", "Add at least 2 options.");
  if (options.length > LIMITS.maxOptions) return fail("TOO_MANY_OPTIONS", "You can add up to 10 options.");
  const wanted = Math.floor(Number(raw.durationSeconds) || 0);
  const durationSeconds = DURATIONS.includes(wanted) ? wanted : DEFAULT_DURATION;
  return {
    ok: true,
    poll: {
      question,
      options,
      multi: Boolean(raw.multi ?? raw.allowMultiselect),
      anonymous: Boolean(raw.anonymous),
      durationSeconds,
    },
  };
}

/** `/poll Soru | A | B` quick form → raw input for normalizePollInput (null when not that shape). */
function parsePollArgs(args) {
  const parts = String(args || "").split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const [question, ...options] = parts;
  return { question, options: options.slice(0, LIMITS.maxOptions + 1) };
}

/** Plain-text body stored in the message row. Old clients (and previews / push) show this. */
function pollFallbackText(poll) {
  const lines = [en("bot.poll.fallbackTitle", { question: poll.question })];
  (poll.options || []).forEach((o, i) => lines.push(`${i + 1}. ${o.emoji ? `${o.emoji} ` : ""}${o.text}`));
  lines.push(en("bot.poll.updateToVote"));
  return lines.join("\n");
}

/** Bot card explanation for a normalizePollInput() failure code. */
function inputErrorRef(code) {
  const known = ["BAD_POLL", "BAD_QUESTION", "DUPLICATE_OPTION", "TOO_FEW_OPTIONS", "TOO_MANY_OPTIONS"];
  return ref(`bot.poll.err.${known.includes(code) ? code : "BAD_POLL"}`);
}

function isClosed(poll, now = Date.now()) {
  if (!poll) return true;
  if (poll.closed_at) return true;
  if (poll.ends_at && new Date(poll.ends_at).getTime() <= now) return true;
  return false;
}

/** Percent of voters (multi-select) or of votes (single choice; equal to voters). Rounded. */
function percent(count, voters) {
  const n = Number(count) || 0;
  const d = Number(voters) || 0;
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

/**
 * What one viewer may see of a poll. Results (counts, %, winner) are hidden until the
 * viewer has voted or the poll has ended; the voter total is always visible.
 */
function buildPollSnapshot(poll, options, tally, { viewerId = null, canManage = false, canVote = true, now = Date.now() } = {}) {
  const counts = (tally && tally.counts) || {};
  const voters = Number(tally?.voters) || 0;
  const mine = Array.isArray(tally?.mine) ? tally.mine.map(String) : [];
  const closed = isClosed(poll, now);
  const reveal = closed || mine.length > 0;
  const sorted = [...(options || [])].sort((a, b) => a.position - b.position);
  let max = 0;
  for (const o of sorted) max = Math.max(max, Number(counts[o.id]) || 0);
  const isCreator = viewerId != null && poll.creator_id != null && String(poll.creator_id) === String(viewerId);
  return {
    id: poll.id,
    scope: poll.scope,
    messageId: poll.server_message_id || poll.group_message_id || poll.dm_message_id,
    serverId: poll.server_id || null,
    channelId: poll.channel_id || null,
    groupId: poll.group_id || null,
    creatorId: poll.creator_id || null,
    question: poll.question,
    multi: Boolean(poll.allow_multiselect),
    anonymous: Boolean(poll.anonymous),
    endsAt: poll.ends_at || null,
    closedAt: poll.closed_at || (closed ? poll.ends_at : null),
    closeReason: poll.close_reason || (closed && !poll.closed_at ? "expired" : null),
    closed,
    version: Number(poll.version) || 0,
    voters,
    totalVotes: reveal ? sorted.reduce((s, o) => s + (Number(counts[o.id]) || 0), 0) : null,
    revealed: reveal,
    myVotes: mine,
    options: sorted.map((o) => {
      const n = Number(counts[o.id]) || 0;
      return {
        id: o.id,
        text: o.text,
        emoji: o.emoji || null,
        votes: reveal ? n : null,
        percent: reveal ? percent(n, voters) : null,
        winner: Boolean(closed && voters > 0 && n === max && max > 0),
      };
    }),
    canVote: Boolean(canVote && !closed),
    canClose: Boolean(!closed && (isCreator || canManage)),
    canEdit: Boolean(!closed && isCreator && voters === 0),
    isCreator,
  };
}

/** { key, vars } of the one-line system text posted when a poll ends. */
function pollEndRef(snapshot) {
  const question = snapshot.question;
  if (!snapshot.voters) return ref("bot.poll.endedNoVotes", { question });
  const winners = snapshot.options.filter((o) => o.winner);
  if (!winners.length) return ref("bot.poll.ended", { question });
  const label = (o) => `${o.emoji ? `${o.emoji} ` : ""}${o.text}`;
  if (winners.length === 1) return ref("bot.poll.endedWinner", { question, winner: label(winners[0]), percent: winners[0].percent });
  return ref("bot.poll.endedTie", { question, winners: winners.map(label).join(", "), percent: winners[0].percent });
}

/** English fallback of pollEndRef (stored as the message content). */
function pollEndText(snapshot) {
  const r = pollEndRef(snapshot);
  return en(r.key, r.vars);
}

const VOTE_ERRORS = Object.freeze({
  POLL_NOT_FOUND: "Poll not found.",
  POLL_CLOSED: "This poll has ended.",
  SINGLE_CHOICE: "You can pick only one option in this poll.",
  BAD_OPTION: "Option not found.",
  HAS_VOTES: "A poll that has votes can't be edited.",
  NOT_CREATOR: "Only the person who created the poll can edit it.",
  BAD_OPTIONS: "A poll needs 2 to 10 options.",
  NO_ACCESS: "You don't have access to this poll.",
  TIMED_OUT: "You can't vote while you're timed out.",
  ANONYMOUS: "This poll is anonymous; voters are not shown.",
  HIDDEN: "Vote first to see who voted.",
  NO_PERMISSION: "You don't have permission to do that.",
});

/** Maps a Postgres RAISE message (or our own code) to { code, message }. */
function voteError(errOrCode) {
  const raw = typeof errOrCode === "string" ? errOrCode : String(errOrCode?.code || errOrCode?.message || "");
  const code = Object.keys(VOTE_ERRORS).find((k) => raw.includes(k)) || "POLL_ERROR";
  return { code, message: VOTE_ERRORS[code] || "The poll action failed." };
}

module.exports = {
  LIMITS,
  DURATIONS,
  DEFAULT_DURATION,
  normalizePollInput,
  parsePollArgs,
  pollFallbackText,
  isClosed,
  percent,
  buildPollSnapshot,
  pollEndText,
  pollEndRef,
  inputErrorRef,
  voteError,
  VOTE_ERRORS,
};
