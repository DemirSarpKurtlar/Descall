"use strict";

/**
 * İşlem kaydı "Geri al": the reverse of one audited action, done with the same
 * library calls the forward route's sibling uses (moderation, descoin, access
 * bans, premium, special badges, directory), then audited with meta.undoOf =
 * the original entry id so the list shows "Geri alındı".
 *
 *   ban                   -> unban (optional "yasağın kaldırıldı" e-mail)
 *   timeout               -> untimeout
 *   wallet_freeze         -> wallet_unfreeze
 *   access_ban            -> access_unban (the bans that entry added)
 *   premium_grant         -> premium cancel (only while that grant is the latest event)
 *   special_badge_grant   -> special_badge_revoke
 *   server_directory_hide -> server_directory_show
 *   feedback_bug_confirm  -> feedback_bug_undo (Bug Avcısı; DesCoin back while unspent)
 *
 * Refusals carry a code: NOT_UNDOABLE, NO_PERMISSION, ALREADY_UNDONE,
 * ALREADY_REVERSED (someone already lifted it), SUPERSEDED (a newer action of
 * the same kind replaced it), TARGET_MISSING.
 */

const model = require("./auditConsoleModel");

class UndoError extends Error {
  constructor(code, status = 409, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// "Yasağın kaldırıldı" e-mail copy (Turkish + English, like the ban e-mails).
const UNBAN_COPY = require("./auditUndoEmail.json");

function unbanEmail(username) {
  const part = (c) => [username ? c.hello.replace("{name}", username) : c.helloAnon, "", c.body];
  return {
    subject: `${UNBAN_COPY.tr.subject} / ${UNBAN_COPY.en.subject}`,
    text: [...part(UNBAN_COPY.tr), "", "----", "", ...part(UNBAN_COPY.en), "", "Descall"].join("\n"),
  };
}

function deps() {
  return {
    supabase: require("../db/supabase"),
    moderation: require("./moderation"),
    state: require("../runtime/sharedState"),
    notifyAdminRoom: (io, payload) => {
      try {
        require("../socket/adminHandlers").notifyAdminRoom(io, payload);
      } catch {
        /* io without rooms */
      }
    },
  };
}

let depsOverride = null;
const d = () => depsOverride || deps();

/**
 * Whether an entry can be undone now, without changing anything.
 * @param {object} entry merged entry
 * @param {object[]} later entries about the same target (any order)
 * @returns {{available: boolean, reverse?: string, section?: string, code?: string, undoneBy?: object}}
 */
function undoState(entry, later = [], { sections = null } = {}) {
  const spec = model.UNDO[entry?.action];
  if (!spec) return { available: false, code: "NOT_UNDOABLE" };
  const ids = new Set([entry.id, ...(entry.merged || []).map((m) => m.id)]);
  const undone = later.find((e) => e.meta && ids.has(String(e.meta.undoOf || "")));
  if (undone) return { available: false, reverse: spec.reverse, section: spec.section, code: "ALREADY_UNDONE", undoneBy: { id: undone.id, at: undone.at, actorUsername: undone.actorUsername } };
  const at = Date.parse(entry.at || "");
  const after = later.filter((e) => Date.parse(e.at || "") > at && String(e.target ?? "") === String(entry.target ?? "") && !ids.has(e.id));
  const sameBadge = (e) => {
    if (entry.action === "feedback_bug_confirm") return String(e.meta?.feedbackId || "") === String(entry.meta?.feedbackId || "");
    return entry.action !== "special_badge_grant" || String(e.meta?.badgeId || "") === String(entry.meta?.badgeId || "");
  };
  if (after.some((e) => e.action === spec.reverse && sameBadge(e))) return { available: false, reverse: spec.reverse, section: spec.section, code: "ALREADY_REVERSED" };
  if (after.some((e) => e.action === entry.action && sameBadge(e))) return { available: false, reverse: spec.reverse, section: spec.section, code: "SUPERSEDED" };
  if (entry.action === "premium_grant" && after.some((e) => /^premium_/.test(e.action) && e.action !== "premium_denied")) {
    return { available: false, reverse: spec.reverse, section: spec.section, code: "SUPERSEDED" };
  }
  if (sections && !sections.includes(spec.section)) return { available: false, reverse: spec.reverse, section: spec.section, code: "NO_PERMISSION" };
  return { available: true, reverse: spec.reverse, section: spec.section };
}

/**
 * @param {{entry: object, later: object[], actor: {id: string, username: string}, reason: string,
 *   notify?: boolean, io?: object, sections?: string[], batch?: string}} args
 */
async function undoEntry({ entry, later = [], actor, reason, notify = false, io = null, sections = null, batch = null }) {
  const st = undoState(entry, later, { sections });
  if (!st.available) throw new UndoError(st.code, st.code === "NO_PERMISSION" ? 403 : st.code === "NOT_UNDOABLE" ? 400 : 409);
  const { supabase, moderation, state, notifyAdminRoom } = d();
  const target = String(entry.target || "");
  const meta = { undoOf: entry.id, reason, via: "audit", originalActor: entry.actorUsername || null, ...(batch ? { batch } : {}) };
  let result = {};

  switch (entry.action) {
    case "ban": {
      if (!model.UUID_RE.test(target)) throw new UndoError("TARGET_MISSING", 404);
      if (!moderation.isBanned(target)) throw new UndoError("ALREADY_REVERSED");
      await moderation.revokeBan({ targetUserId: target, actorUserId: actor.id, note: reason });
      let emailed = false;
      if (notify) {
        try {
          const { data } = await supabase.from("users").select("username, email, email_confirmed_at").eq("id", target).maybeSingle();
          if (data?.email && data.email_confirmed_at) {
            emailed = await require("./banExperience").sendPlainEmail(data.email, unbanEmail(data.username));
          }
        } catch {
          emailed = false;
        }
      }
      meta.emailed = emailed;
      result = { emailed };
      notifyAdminRoom(io, { type: "unban", userId: target });
      break;
    }
    case "timeout": {
      if (!model.UUID_RE.test(target)) throw new UndoError("TARGET_MISSING", 404);
      if (!moderation.isTimedOut(target)) throw new UndoError("ALREADY_REVERSED");
      await moderation.revokeTimeout({ targetUserId: target, actorUserId: actor.id, note: reason });
      try {
        io?.to?.(`user:${target}`)?.emit?.("system:timeout:cleared", { ok: true });
      } catch {
        /* offline */
      }
      notifyAdminRoom(io, { type: "untimeout", userId: target });
      break;
    }
    case "wallet_freeze": {
      if (!model.UUID_RE.test(target)) throw new UndoError("TARGET_MISSING", 404);
      const out = await require("./descoin").setWalletFrozen(target, false);
      try {
        io?.to?.(`user:${target}`)?.emit?.("descoin:frozen", { frozen: Boolean(out?.frozen) });
      } catch {
        /* offline */
      }
      notifyAdminRoom(io, { type: "wallet_unfreeze", userId: target });
      break;
    }
    case "access_ban": {
      const accessBans = require("./accessBans");
      const { bans } = await accessBans.listBans({ status: "active", limit: 500 });
      const at = Date.parse(entry.at || "");
      const mine = (bans || []).filter(
        (b) =>
          (!entry.actorUsername || b.createdBy === entry.actorUsername) &&
          (b.sourceUsername === target || b.label === target || b.sourceUserId === target) &&
          Math.abs(Date.parse(b.createdAt || "") - at) <= 20000
      );
      if (!mine.length) throw new UndoError("ALREADY_REVERSED");
      for (const b of mine) await accessBans.revokeBan({ id: b.id, actor });
      meta.count = mine.length;
      result = { lifted: mine.length };
      notifyAdminRoom(io, { type: "access_unban", count: mine.length });
      break;
    }
    case "premium_grant": {
      const premium = require("./premium/service");
      const detail = await premium.userDetail(target);
      const events = Array.isArray(detail?.events) ? detail.events : [];
      const latest = events.find((e) => e.kind !== "expire") || null;
      if (entry.meta?.event_id && latest && String(latest.id) !== String(entry.meta.event_id)) throw new UndoError("SUPERSEDED");
      const out = await premium.apply(actor.id, target, { op: "cancel", reason });
      meta.event_id = out?.event?.id || null;
      try {
        require("../socket/premium").emitPremiumUpdated(io, target, { kind: "cancel" });
      } catch {
        /* offline */
      }
      break;
    }
    case "special_badge_grant": {
      const badgeId = entry.meta?.badgeId;
      if (!badgeId) throw new UndoError("TARGET_MISSING", 404);
      const out = await require("./specialBadges").revoke({ userId: target, badgeId, actorId: actor.id, reason });
      meta.badgeId = badgeId;
      meta.serial = out?.serial ?? null;
      break;
    }
    case "feedback_bug_confirm": {
      const feedbackId = entry.meta?.feedbackId;
      if (!feedbackId) throw new UndoError("TARGET_MISSING", 404);
      const bugHunter = require("./bugHunter/service");
      try {
        const out = await bugHunter.undo({ feedbackId, reason, actor, io, audit: false });
        Object.assign(meta, out.meta || {});
        result = { reward: out.reward || null, badgeRevoked: Boolean(out.badgeRevoked) };
      } catch (err) {
        if (err instanceof bugHunter.BugHuntError) {
          throw new UndoError(err.code === "ALREADY_UNDONE" ? "ALREADY_REVERSED" : err.code === "NOT_CONFIRMED" ? "TARGET_MISSING" : err.code, err.status || 409);
        }
        throw err;
      }
      break;
    }
    case "server_directory_hide": {
      const { data, error } = await supabase.from("servers").update({ directory_hidden_at: null, directory_hidden_reason: null }).eq("id", target).select("id").maybeSingle();
      if (error) throw new UndoError("FAILED", 500);
      if (!data) throw new UndoError("TARGET_MISSING", 404);
      try {
        require("../routes/directory").__resetDirectoryCache();
      } catch {
        /* cache warms itself */
      }
      break;
    }
    default:
      throw new UndoError("NOT_UNDOABLE", 400);
  }

  const written = state.appendAudit(actor.id, actor.username, st.reverse, entry.target, meta);
  return { ok: true, reverse: st.reverse, entryId: written?.id || null, ...result };
}

function __setDepsForTests(x) {
  depsOverride = x;
}

module.exports = { UndoError, undoState, undoEntry, unbanEmail, __setDepsForTests };
