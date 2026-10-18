"use strict";

/**
 * Pure poll rules (no DB). Shared by the socket handlers, the /poll slash
 * command and the selftest. Strings shown to users are Turkish.
 */

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
  if (!raw || typeof raw !== "object") return fail("BAD_POLL", "Anket bilgisi eksik.");
  const question = clean(raw.question, LIMITS.question);
  if (!question) return fail("BAD_QUESTION", "Bir soru yaz.");
  const list = Array.isArray(raw.options) ? raw.options : [];
  const options = [];
  const seen = new Set();
  for (const item of list) {
    const text = clean(typeof item === "string" ? item : item?.text, LIMITS.option);
    if (!text) continue;
    const key = text.toLocaleLowerCase("tr");
    if (seen.has(key)) return fail("DUPLICATE_OPTION", "Seçenekler birbirinden farklı olmalı.");
    seen.add(key);
    options.push({ text, emoji: typeof item === "object" ? cleanEmoji(item?.emoji) : null });
  }
  if (options.length < LIMITS.minOptions) return fail("TOO_FEW_OPTIONS", "En az 2 seçenek ekle.");
  if (options.length > LIMITS.maxOptions) return fail("TOO_MANY_OPTIONS", "En fazla 10 seçenek ekleyebilirsin.");
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
  const lines = [`📊 Anket: ${poll.question}`];
  (poll.options || []).forEach((o, i) => lines.push(`${i + 1}. ${o.emoji ? `${o.emoji} ` : ""}${o.text}`));
  return lines.join("\n");
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

/** One-line system text posted when a poll ends. */
function pollEndText(snapshot) {
  const q = `“${snapshot.question}” anketi sona erdi`;
  if (!snapshot.voters) return `📊 ${q} · Kimse oy vermedi`;
  const winners = snapshot.options.filter((o) => o.winner);
  if (!winners.length) return `📊 ${q}`;
  const label = (o) => `${o.emoji ? `${o.emoji} ` : ""}${o.text}`;
  if (winners.length === 1) return `📊 ${q} · Kazanan: ${label(winners[0])} (%${winners[0].percent})`;
  return `📊 ${q} · Berabere: ${winners.map(label).join(", ")} (%${winners[0].percent})`;
}

const VOTE_ERRORS = Object.freeze({
  POLL_NOT_FOUND: "Anket bulunamadı.",
  POLL_CLOSED: "Bu anket sona erdi.",
  SINGLE_CHOICE: "Bu ankette yalnızca bir seçenek seçebilirsin.",
  BAD_OPTION: "Seçenek bulunamadı.",
  HAS_VOTES: "Oy verilmiş bir anket düzenlenemez.",
  NOT_CREATOR: "Anketi yalnızca oluşturan kişi düzenleyebilir.",
  BAD_OPTIONS: "2 ile 10 arasında seçenek olmalı.",
  NO_ACCESS: "Bu ankete erişimin yok.",
  TIMED_OUT: "Susturulmuşken oy veremezsin.",
  ANONYMOUS: "Bu anket anonim; oy verenler gösterilmez.",
  HIDDEN: "Oy verenleri görmek için önce oy ver.",
  NO_PERMISSION: "Bunun için yetkin yok.",
});

/** Maps a Postgres RAISE message (or our own code) to { code, message }. */
function voteError(errOrCode) {
  const raw = typeof errOrCode === "string" ? errOrCode : String(errOrCode?.code || errOrCode?.message || "");
  const code = Object.keys(VOTE_ERRORS).find((k) => raw.includes(k)) || "POLL_ERROR";
  return { code, message: VOTE_ERRORS[code] || "Anket işlemi başarısız oldu." };
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
  voteError,
  VOTE_ERRORS,
};
