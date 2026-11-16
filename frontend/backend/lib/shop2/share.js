"use strict";

/**
 * "Arkadaşlarına göster": send my new look (an item I own, or a set I own completely) to
 * chosen friends as a DM. It goes through the existing server-side DM send path
 * (lib/notifyActions.js reply -> same checks, unread, fan-out and push as dm:send: ban,
 * timeout, blocks, platform policy, DM rate limit, accepted friends only).
 *
 * The message text is the sender's own note (optional) plus a look link on its own line:
 *   https://<app>/shop/look/set/<setKey>      or      https://<app>/shop/look/item/<itemId>
 * Old clients show a link; the Market 2.0 UI renders a look card from it (parseShareText).
 */

const catalog = require("./catalog");
const people = require("./people");
const actions = require("./actions");
const { shopError } = require("./storefrontService");

const MAX_RECIPIENTS = 10;
const MAX_NOTE = 300;
const LINK_RE = /https?:\/\/[^\s/]+\/shop\/look\/(set|item)\/([A-Za-z0-9._-]{1,80})/;
let actionsOverride = null;

function appBase() {
  return String(process.env.PUBLIC_APP_URL || "https://descall.com").replace(/\/+$/, "");
}

function shareLink(kind, ref) {
  return `${appBase()}/shop/look/${kind}/${encodeURIComponent(ref)}`;
}

function shareText({ kind, ref, note }) {
  const n = typeof note === "string" ? note.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, MAX_NOTE) : "";
  return n ? `${n}\n${shareLink(kind, ref)}` : shareLink(kind, ref);
}

/** { kind: "set"|"item", ref, note } of a share message text, or null. */
function parseShareText(text) {
  const s = String(text || "");
  const m = LINK_RE.exec(s);
  if (!m) return null;
  const note = s.replace(m[0], "").trim();
  return { kind: m[1], ref: decodeURIComponent(m[2]), note: note || null };
}

function dmActions() {
  return actionsOverride || require("../notifyActions").createNotifyActions();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ itemId?, setKey?, toUserIds: string[], message? }} body
 * @returns {{ kind, ref, link, results: [{ userId, ok, code?, messageId? }], sent }}
 */
async function share(userId, body, { io = null } = {}) {
  const ids = [...new Set((Array.isArray(body?.toUserIds) ? body.toUserIds : []).map(String))].filter((x) => x && x !== userId);
  if (!ids.length) throw shopError("share_no_recipients", 400);
  if (ids.length > MAX_RECIPIENTS) throw shopError("share_too_many", 400, { max: MAX_RECIPIENTS });
  const owned = await people.ownedIds(userId);
  let kind;
  let ref;
  if (body?.setKey) {
    const set = await catalog.getSet(String(body.setKey));
    if (!set || !set.items.length) throw shopError("not_found", 404);
    if (!set.items.every((it) => owned.has(String(it.id)))) throw shopError("share_not_owned", 403);
    kind = "set";
    ref = set.key;
  } else if (body?.itemId) {
    const cat = await catalog.getCatalog();
    const it = cat.byId.get(String(body.itemId));
    if (!it) throw shopError("not_found", 404);
    if (!owned.has(String(it.id))) throw shopError("share_not_owned", 403);
    kind = "item";
    ref = String(it.id);
  } else {
    throw shopError("item_required", 400);
  }
  const text = shareText({ kind, ref, note: body?.message });
  const friends = new Set(await people.friendIds(userId));
  const results = [];
  const a = dmActions();
  for (let i = 0; i < ids.length; i += 1) {
    const to = ids[i];
    if (!friends.has(to)) {
      results.push({ userId: to, ok: false, code: "recipient_not_friend" });
      continue;
    }
    try {
      // dm:send keeps 200 ms between one sender's messages (systemConfig.dmRateLimitMs).
      if (results.some((r) => r.ok)) await sleep(220);
      let out;
      try {
        out = await a.reply(io, userId, { conv: `dm:${to}`, text, markRead: false });
      } catch (err) {
        if (err?.code !== "rate_limited") throw err;
        await sleep(220);
        out = await a.reply(io, userId, { conv: `dm:${to}`, text, markRead: false });
      }
      results.push({ userId: to, ok: true, messageId: out?.messageId || null });
    } catch (err) {
      results.push({ userId: to, ok: false, code: err?.code || "not_sent" });
    }
  }
  const sent = results.filter((r) => r.ok).length;
  if (sent) await actions.log(userId, "share", { kind, ref, to: results.filter((r) => r.ok).map((r) => r.userId) });
  return { kind, ref, link: shareLink(kind, ref), results, sent };
}

function __setActionsForTests(a) {
  actionsOverride = a;
}

module.exports = { MAX_RECIPIENTS, share, shareText, shareLink, parseShareText, __setActionsForTests };
