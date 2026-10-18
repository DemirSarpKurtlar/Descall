"use strict";

/**
 * 1:1 DM slash routing, called from `dm:send` before anything is persisted.
 *
 * - Casino commands (/cf, /bj, /slot, /pay, /daily, /credits, /top, …) run in
 *   the DM target and both participants receive the game card.
 * - DM-safe app commands (/help, /user, /avatar, /poll) reply with an app card
 *   to both participants; /poll returns `dmPoll` so dm:send stores it as the
 *   caller's own poll_v2 DM row (2.12.0).
 * - Unknown slash text is not handled and goes out as a normal message.
 *
 * Access = resolveCasinoTarget({ dmUserId }): accepted friends only (no
 * message requests), not blocked either way, caller not banned / timed out.
 */

const { resolveCasinoTarget } = require("./casinoRoomAccess");

function lazySlash() {
  return require("./slashCommands");
}

function dmCommandNames(slash = lazySlash()) {
  return new Set(
    slash.slashCommands.filter((c) => c.contexts.includes("dm")).flatMap((c) => [c.name, ...(c.aliases || [])])
  );
}

async function routeDmSlashCommand({ io, socket, myId, me, toUserId, tempId, text }, deps = {}) {
  const slash = deps.slash || lazySlash();
  const resolve = deps.resolveCasinoTarget || resolveCasinoTarget;
  const parsed = slash.parseSlashCommand(text);
  if (!parsed) return { handled: false };
  const isCasino = slash.isCasinoCommand(parsed.name);
  if (!isCasino && !dmCommandNames(slash).has(parsed.name)) return { handled: false };

  const access = await resolve({ userId: myId, dmUserId: toUserId });
  if (!access.ok) {
    socket.emit("dm:error", { message: access.text, code: access.code, tempId: tempId || null, toUserId });
    return { handled: true };
  }

  try {
    const result = await slash.executeSlashCommand({
      io,
      socket,
      context: "dm",
      userId: myId,
      roomId: access.target.roomId,
      dmUserId: toUserId,
      sender: { id: myId, username: me?.username || socket.user?.username || null },
      content: text,
      gameOptions: { dmUserId: toUserId, target: access.target },
    });
    socket.emit("dm:command:ack", {
      toUserId,
      tempId: tempId || null,
      isGameCommand: isCasino,
      isAppCommand: !isCasino,
    });
    if (result?.message) {
      slash.emitAppMessage({ io, socket, context: "dm", roomId: access.target.roomId, message: result.message });
    }
    if (result?.dmPoll) return { handled: true, dmText: null, dmPoll: result.dmPoll };
    return { handled: true, dmText: result?.dmText || null };
  } catch (err) {
    socket.emit("dm:error", {
      message: err?.message || "Komut çalıştırılamadı.",
      code: err?.code || "COMMAND_FAILED",
      tempId: tempId || null,
      toUserId,
    });
    return { handled: true };
  }
}

module.exports = { routeDmSlashCommand, dmCommandNames };
