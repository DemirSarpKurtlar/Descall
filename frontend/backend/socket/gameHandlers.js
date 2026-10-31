/**
 * Casino socket handlers — blackjack, slot, coin flip, and credit transfers.
 * Credits are server-authoritative. Spectators receive the same board; actions
 * are keyed to the caller's own session, so a watcher cannot spin or call.
 */

const { GameManager, MIN_BET, MAX_BET, STARTING_CREDITS } = require("../games/BlackjackGame");
const { playRound, toPublicState, roundId, LINE_COUNT } = require("../games/SlotGame");
const { CoinFlipManager } = require("../games/CoinFlipGame");
const { parsePayArgs, parseCoinArgs } = require("../games/casinoArgs");

/** Coin side as a catalog ref ("Heads" / "Yazı"). */
function sideRef(side) {
  if (side === "heads") return { key: "bot.game.heads" };
  if (side === "tails") return { key: "bot.game.tails" };
  return "";
}
const supabase = require("../db/supabase");
const { casinoAccess } = require("../lib/ageGate");
const {
  IOS_DENY_TEXT,
  noteSocketPlatform,
  forgetSocketPlatform,
  casinoBlockReason,
} = require("../lib/casinoPlatformGate");
const { AsyncLocalStorage } = require("async_hooks");
const { resolveCasinoTarget, dmRoomId } = require("../lib/casinoRoomAccess");
const { ref: G, en } = require("../lib/botText");
const { apiText } = require("../lib/apiError");

// Engine errors (games/*.js, static English) -> bot catalog keys for the board text.
const ENGINE_ERRORS = {
  "HIT is not available right now.": "bot.game.err.hit",
  "STAND is not available right now.": "bot.game.err.stand",
  "DOUBLE is only available on your first two cards.": "bot.game.err.double",
  "You already have an active hand. Use HIT / STAND / DOUBLE.": "bot.game.err.activeHand",
  "No active game. Start with /bj <amount>.": "bot.game.err.noGame",
  "This hand is already over.": "bot.game.err.handOver",
  "Unknown action.": "bot.game.err.unknownAction",
  "This flip is already settled.": "bot.game.err.flipSettled",
  "Call heads or tails.": "bot.game.err.callSide",
  "Call heads or tails on your open flip first.": "bot.game.err.openFlip",
  "No coin in the air. Start with /cf 100.": "bot.game.err.noCoin",
};

/** Ref (or the plain text) of an engine error for the board text. */
function engineErrorRef(text) {
  const msg = String(text || "");
  if (ENGINE_ERRORS[msg]) return G(ENGINE_ERRORS[msg]);
  const range = /^Bet must be between ([\d,]+) and ([\d,]+)\.$/.exec(msg);
  if (range) return G("bot.game.err.betRange", { min: range[1], max: range[2] });
  return msg;
}

/** game:notice text: static English, or text + textKey / textVars for the bet range. */
function engineNotice(text) {
  const range = /^Bet must be between ([\d,]+) and ([\d,]+)\.$/.exec(String(text || ""));
  if (range) return apiText("text", "Bet must be between {min} and {max}.", { min: range[1], max: range[2] });
  return { text };
}

const AGE_FREE_COMMANDS = new Set(["help", "yardım", "commands", "jb"]);

/**
 * Native iOS, and any other socket while that iOS session is still connected.
 * Emits a notice and does not touch credits, hands, or the room.
 */
function denyCasinoOnIos(socket, groupId) {
  const reason = casinoBlockReason(socket);
  if (!reason) return false;
  socket.emit("game:notice", {
    groupId: groupId || null,
    text: IOS_DENY_TEXT,
    code: "ios_unavailable",
  });
  return true;
}

async function denyIfNotAllowed(socket, userId, groupId) {
  const access = await casinoAccess(userId);
  if (access.ok) return false;
  socket.emit("game:notice", { groupId, text: access.text, code: "age_gate" });
  return true;
}

const BOT_USER = {
  id: "game-bot",
  username: "Casino",
  avatar_url: null,
  isBot: true,
};

const COMMAND_REGEX = /^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i;
const VALID_COMMANDS = new Set([
  "bj", "blackjack", "hit", "stand", "stay", "double",
  "slot",
  "coinflip", "cf",
  "pay", "send", "gonder", "tip",
  "credits", "bakiye", "balance", "top", "lider",
  "help", "yardım", "commands", "jb", "daily",
]);

const DAILY_BONUS = 250;

function msgId() {
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * One casino bubble per player in a group.
 * Lobby → deal → hit/stand → result → again all upsert the same message.
 */
function sessionIdFor(ownerUserId) {
  return ownerUserId ? `casino-session-${ownerUserId}` : null;
}

/**
 * `content` is a { key, vars } ref into bot.game.* (English fallback + i18n.content for
 * the viewer's language, lib/botText.js) or plain text.
 */
function createGameMessage(content, gameData = null, type = "game_action", ownerUserId = null) {
  const isRef = content && typeof content === "object" && typeof content.key === "string";
  const sticky = type !== "game_transfer";
  const owner = sticky ? ownerUserId || gameData?.userId || null : null;
  const sid = sessionIdFor(owner);
  const handId = gameData?.id;
  const data =
    gameData == null
      ? null
      : {
          ...gameData,
          sessionOwnerId: owner || gameData.sessionOwnerId || null,
        };
  return {
    id: sid || (handId ? `casino-hand-${handId}` : msgId()),
    sessionOwnerId: owner || null,
    sender: BOT_USER,
    content: isRef ? en(content.key, content.vars) : content,
    ...(isRef ? { i18n: { content: content } } : {}),
    type,
    gameData: data,
    created_at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };
}

async function getUserCredits(userId) {
  try {
    const { data, error } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: created, error: insertError } = await supabase
        .from("user_credits")
        .insert({ user_id: userId, credits: STARTING_CREDITS })
        .select("*")
        .single();
      if (insertError) {
        // Race: another request created it
        const { data: again } = await supabase
          .from("user_credits")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (again) return again;
        throw insertError;
      }
      return created;
    }
    return data;
  } catch (err) {
    console.error("[Game] getUserCredits:", err.message || err);
    return {
      user_id: userId,
      credits: STARTING_CREDITS,
      total_won: 0,
      total_lost: 0,
      games_played: 0,
    };
  }
}

/**
 * Apply credit delta. Returns updated row or null.
 * delta > 0 credit in, delta < 0 debit.
 */
async function applyCreditDelta(userId, delta, meta = {}) {
  try {
    const current = await getUserCredits(userId);
    const next = Math.max(0, (current.credits || 0) + delta);
    const patch = {
      user_id: userId,
      credits: next,
      updated_at: new Date().toISOString(),
    };

    if (meta.gamesPlayedInc) {
      patch.games_played = (current.games_played || 0) + 1;
    }
    if (meta.wonInc) {
      patch.total_won = (current.total_won || 0) + meta.wonInc;
    }
    if (meta.lostInc) {
      patch.total_lost = (current.total_lost || 0) + meta.lostInc;
    }

    const { data, error } = await supabase
      .from("user_credits")
      .upsert(patch, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[Game] applyCreditDelta:", err.message || err);
    return null;
  }
}

const creditChains = new Map();

function withCreditLock(userId, fn) {
  const prev = creditChains.get(userId) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => fn());
  const tracked = run.finally(() => {
    if (creditChains.get(userId) === tracked) creditChains.delete(userId);
  });
  creditChains.set(userId, tracked);
  return tracked;
}

function withCreditLocks(userIds, fn) {
  const ordered = [...new Set(userIds.filter(Boolean))].sort();
  return ordered.reduceRight((next, id) => () => withCreditLock(id, next), fn)();
}

async function saveGameHistory(userId, groupId, instance) {
  try {
    const opts = currentEmitRoom();
    const payload = instance.toHistoryPayload();
    // Only real groups carry the group_id FK; channels and DMs omit it.
    const row = {
      user_id: userId,
      game_type: "blackjack",
      bet_amount: payload.bet,
      result: payload.result,
      win_amount: payload.winAmount,
      player_hand: payload.player_hand,
      dealer_hand: payload.dealer_hand,
    };
    if (isGroupTarget(opts) && groupId) {
      row.group_id = groupId;
    }
    const { error } = await supabase.from("game_history").insert(row);
    if (error) console.error("[Game] saveGameHistory:", error.message || error);
  } catch (err) {
    console.error("[Game] saveGameHistory exception:", err.message || err);
  }
}

/**
 * Per-request chat target. Each command / action runs inside its own async
 * context, so concurrent games in a group, a server channel and a DM can never
 * pick up each other's room across awaits (the old module-level stack could).
 */
const chatTarget = new AsyncLocalStorage();
function currentEmitRoom() {
  return chatTarget.getStore() || {};
}
function runInChatTarget(target, fn) {
  return chatTarget.run(target || {}, fn);
}
function isGroupTarget(target) {
  return target.kind ? target.kind === "group" : !target.channelId;
}

function broadcastGame(io, socket, events, groupId, message) {
  const target = currentEmitRoom();
  if (target.kind === "dm") {
    const payload = {
      groupId: null,
      channelId: null,
      serverId: null,
      dmUserIds: target.dmUserIds,
      message,
    };
    // Both participants' sockets (every tab) join user:<id> on connect.
    const rooms = target.dmUserIds.map((id) => `user:${id}`);
    for (const event of events) io.to(rooms).emit(event, payload);
    return;
  }
  const channelId = target.channelId || null;
  const roomId = channelId || groupId;
  const payload = {
    groupId: roomId,
    channelId,
    serverId: target.serverId || null,
    message,
  };
  const room = channelId ? `server-channel:${channelId}` : `group:${groupId}`;
  for (const event of events) {
    socket.emit(event, payload);
    socket.to(room).emit(event, payload);
  }
}

function emitToGroup(io, socket, groupId, message) {
  broadcastGame(io, socket, ["game:message"], groupId, message);
}

function emitGameUpdate(io, socket, groupId, message) {
  // Emit both: game:update (in-place) + game:message (first paint / older clients)
  broadcastGame(io, socket, ["game:update", "game:message"], groupId, message);
}

/** Resolve + authorize the chat a game event targets. Emits a notice on refusal. */
async function authorizeTarget(socket, userId, { groupId, channelId, dmUserId, target } = {}) {
  if (target && target.kind && target.roomId) return target;
  const res = await resolveCasinoTarget({
    userId,
    groupId: channelId || dmUserId ? null : groupId,
    channelId,
    dmUserId,
  });
  if (!res.ok) {
    socket.emit("game:notice", {
      groupId: groupId || channelId || null,
      dmUserId: dmUserId || null,
      text: res.text,
      code: res.code,
    });
    return null;
  }
  return res.target;
}

function registerGameHandlers(io, socket) {
  const myId = socket.user?.id;
  const myUsername = socket.user?.username;
  if (!myId) return;

  noteSocketPlatform(socket);
  socket.on("disconnect", () => forgetSocketPlatform(socket));

  socket.on("game:command", async ({ groupId, channelId, dmUserId, command, args } = {}) => {
    if (!command || (!groupId && !channelId && !dmUserId)) return;
    const full = `/${command}${args != null && args !== "" ? ` ${args}` : ""}`.trim();
    await handleGameCommand(io, socket, myId, myUsername, channelId || groupId || null, full, {
      channelId: channelId || null,
      dmUserId: dmUserId || null,
    });
  });

  socket.on("game:action", async ({ groupId, channelId, dmUserId, action } = {}) => {
    if (!action || (!groupId && !channelId && !dmUserId)) return;
    if (denyCasinoOnIos(socket, channelId || groupId || null)) return;
    const target = await authorizeTarget(socket, myId, { groupId, channelId, dmUserId });
    if (!target) return;
    const roomId = target.roomId;
    const a = String(action).toLowerCase();
    if (a !== "help" && (await denyIfNotAllowed(socket, myId, roomId))) return;
    await runInChatTarget(target, async () => {
      if (a === "help") {
        await handleHelp(io, socket, myId, roomId);
        return;
      }
      if (a === "credits" || a === "balance") {
        await handleCreditsCheck(io, socket, myId, roomId);
        return;
      }
      if (a === "call:heads" || a === "call:tails") {
        await handleCoinFlip(io, socket, myId, myUsername, roomId, a === "call:heads" ? "heads" : "tails");
        return;
      }
      await handleBlackjackAction(io, socket, myId, myUsername, roomId, a);
    });
  });

  socket.on("game:credits", async (callback) => {
    if (denyCasinoOnIos(socket, null)) {
      if (typeof callback === "function") {
        callback({ error: IOS_DENY_TEXT, code: "ios_unavailable" });
      }
      return;
    }
    const row = await getUserCredits(myId);
    if (typeof callback === "function") {
      callback({
        credits: row.credits,
        total_won: row.total_won || 0,
        total_lost: row.total_lost || 0,
        games_played: row.games_played || 0,
      });
    }
  });

  socket.on("game:status", ({ groupId, channelId, dmUserId } = {}, callback) => {
    if (denyCasinoOnIos(socket, groupId || null)) {
      if (typeof callback === "function") {
        callback({ active: false, game: null, error: IOS_DENY_TEXT, code: "ios_unavailable" });
      }
      return;
    }
    // Read-only: only ever returns the caller's own hand.
    const key = dmUserId ? dmRoomId(myId, dmUserId) : channelId || groupId;
    const game = key ? GameManager.get(myId, key) : null;
    if (typeof callback === "function") {
      callback({
        active: Boolean(game && game.status !== "finished"),
        game: game ? game.getPublicState() : null,
      });
    }
  });
}

async function handleGameCommand(io, socket, userId, username, roomArg, fullCommand, opts = {}) {
  // Slash commands (/bj, /slot, /pay, …) enter here from group, server channel
  // and DM chat. Refuse before membership, age lookup, credit reads, or any
  // deal/spin/transfer.
  if (denyCasinoOnIos(socket, roomArg)) return;

  const match = String(fullCommand || "").trim().match(COMMAND_REGEX);
  if (!match) return;

  // Every command is authorized against the chat it targets.
  const target = await authorizeTarget(socket, userId, {
    groupId: roomArg,
    channelId: opts.channelId || null,
    dmUserId: opts.dmUserId || null,
    target: opts.target || null,
  });
  if (!target) return;
  const groupId = target.roomId;

  const command = match[1].toLowerCase();
  const arg = match[2];
  if (VALID_COMMANDS.has(command) && !AGE_FREE_COMMANDS.has(command)) {
    if (await denyIfNotAllowed(socket, userId, groupId)) return;
  }
  await runInChatTarget(target, async () => {
  switch (command) {
    case "bj":
    case "blackjack":
      await handleBlackjackStart(io, socket, userId, username, groupId, arg);
      break;
    case "hit":
      await handleBlackjackAction(io, socket, userId, username, groupId, "hit");
      break;
    case "stand":
    case "stay":
      await handleBlackjackAction(io, socket, userId, username, groupId, "stand");
      break;
    case "double":
      await handleBlackjackAction(io, socket, userId, username, groupId, "double");
      break;
    case "slot":
      await handleSlot(io, socket, userId, username, groupId, arg);
      break;
    case "coinflip":
    case "cf":
      await handleCoinFlip(io, socket, userId, username, groupId, arg);
      break;
    case "pay":
    case "send":
    case "gonder":
    case "tip":
      await handlePay(io, socket, userId, username, groupId, arg);
      break;
    case "credits":
    case "bakiye":
    case "balance":
      await handleCreditsCheck(io, socket, userId, groupId);
      break;
    case "top":
    case "lider":
      await handleLeaderboard(io, socket, userId, groupId);
      break;
    case "daily":
      await handleDailyClaim(io, socket, userId, username, groupId);
      break;
    case "help":
    case "yardım":
    case "commands":
      await handleHelp(io, socket, userId, groupId);
      break;
    case "jb":
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.jbHint"),
          { userId },
          "game_help",
          userId
        )
      );
      break;
    default:
      if (VALID_COMMANDS.has(command)) break;
      await handleHelp(io, socket, userId, groupId, command);
  }
  });
}

async function handleBlackjackStart(io, socket, userId, username, groupId, betArg) {
  const bet = parseInt(betArg, 10);

  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.bjInvalidBet", { min: MIN_BET, max: MAX_BET }),
        { status: "lobby", actions: [], userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  const openCoin = CoinFlipManager.get(userId, groupId);
  if (openCoin && openCoin.status === "calling") {
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.callOpenFlipFirst"),
        { ...openCoin.getPublicState(), credits: (await getUserCredits(userId)).credits },
        "game_update",
        userId
      )
    );
    return;
  }

  const existing = GameManager.get(userId, groupId);
  if (existing && existing.status !== "finished") {
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.activeHand"),
        existing.getPublicState(),
        "game_update",
        userId
      )
    );
    return;
  }

  const credits = await getUserCredits(userId);
  if ((credits.credits || 0) < bet) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.insufficient", { have: credits.credits || 0, need: bet }),
        { status: "lobby", credits: credits.credits, userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  // Escrow stake
  const afterDebit = await applyCreditDelta(userId, -bet);
  if (!afterDebit || afterDebit.credits < 0) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(G("bot.game.placeBetFailed"), { status: "lobby", userId }, "game_lobby", userId)
    );
    return;
  }

  const created = GameManager.create(userId, groupId, bet, username);
  if (created.error) {
    // Refund escrow
    await applyCreditDelta(userId, bet);
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.errorLine", { error: engineErrorRef(created.error) }),
        { status: "lobby", credits: (await getUserCredits(userId)).credits, userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  const state = created.game;
  const instance = created.instance;

  // Natural blackjack / dealer peek resolved immediately
  if (state.status === "finished") {
    await settleFinishedHand(userId, groupId, instance);
    const msg = createGameMessage(
      buildResultText(username, state),
      { ...state, credits: (await getUserCredits(userId)).credits },
      "game_end",
      userId
    );
    emitGameUpdate(io, socket, groupId, msg);
    return;
  }

  const msg = createGameMessage(
    G("bot.game.bjStart", { username, bet, balance: afterDebit.credits }),
    { ...state, credits: afterDebit.credits },
    "game_start",
    userId
  );
  emitGameUpdate(io, socket, groupId, msg);
}

async function handleBlackjackAction(io, socket, userId, username, groupId, action) {
  const instance = GameManager.get(userId, groupId);
  if (!instance) {
    // Soft notice only — do not wipe a finished board with a fresh lobby
    socket.emit("game:notice", {
      groupId,
      text: "No active hand. Start with `/bj 100` or tap Again.",
    });
    return;
  }

  let result;
  if (action === "double") {
    if (!instance.canDouble) {
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.errorLine", { error: G("bot.game.err.double") }),
          instance.getPublicState(),
          "game_update",
          userId
        )
      );
      return;
    }
    const extra = instance.originalBet;
    const credits = await getUserCredits(userId);
    if ((credits.credits || 0) < extra) {
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.doubleNotEnough", { extra }),
          instance.getPublicState(),
          "game_update",
          userId
        )
      );
      return;
    }
    const debited = await applyCreditDelta(userId, -extra);
    if (!debited) {
      socket.emit("game:notice", { groupId, text: "Could not double bet." });
      return;
    }

    result = GameManager.action(userId, groupId, action);
    if (result.error) {
      // Refund the double stake — action failed after debit
      await applyCreditDelta(userId, extra);
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.errorLine", { error: engineErrorRef(result.error) }),
          result.game || instance.getPublicState(),
          "game_update",
          userId
        )
      );
      return;
    }
  } else {
    result = GameManager.action(userId, groupId, action);
    if (result.error) {
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.errorLine", { error: engineErrorRef(result.error) }),
          result.game || instance.getPublicState(),
          "game_update",
          userId
        )
      );
      return;
    }
  }

  const state = result.game;
  const live = result.instance || instance;

  if (state.status === "finished") {
    await settleFinishedHand(userId, groupId, live);
    const credits = await getUserCredits(userId);
    const msg = createGameMessage(
      buildResultText(username, state),
      { ...state, credits: credits.credits },
      "game_end",
      userId
    );
    emitGameUpdate(io, socket, groupId, msg);
    return;
  }

  const credits = await getUserCredits(userId);
  const msg = createGameMessage(
    G("bot.game.actionLine", { action: action.toUpperCase(), username }),
    { ...state, credits: credits.credits },
    "game_update",
    userId
  );
  emitGameUpdate(io, socket, groupId, msg);
}

async function settleFinishedHand(userId, groupId, instance) {
  const payout = instance.winAmount || 0;
  const meta = { gamesPlayedInc: true };
  if (instance.result === "win" || instance.result === "blackjack") {
    meta.wonInc = Math.max(0, instance.profit || 0);
  }
  if (instance.result === "loss") {
    meta.lostInc = instance.bet;
  }

  if (payout > 0) {
    await applyCreditDelta(userId, payout, meta);
  } else {
    await applyCreditDelta(userId, 0, meta);
  }

  await saveGameHistory(userId, groupId, instance);
  GameManager.remove(userId, groupId);
}

/** Ref of the finished-hand text (bot.game.bjResult). */
function buildResultText(username, state) {
  return G("bot.game.bjResult", {
    username,
    player: state.playerHand?.value,
    dealer: state.dealerHand?.value,
    result: ["blackjack", "win", "push", "loss"].includes(state.result) ? state.result : "other",
    profit: state.profit || 0,
    bet: state.bet || 0,
  });
}

async function handleDailyClaim(io, socket, userId, username, groupId) {
  try {
    const credits = await getUserCredits(userId);
    const last = credits.last_daily_claim ? new Date(credits.last_daily_claim) : null;
    const now = new Date();
    const sameUtcDay =
      last &&
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate();

    if (sameUtcDay) {
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const hours = Math.max(1, Math.ceil((next - now) / (60 * 60 * 1000)));
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.dailyAlready", { hours, balance: credits.credits || 0 }),
          { credits: credits.credits, userId, dailyClaimed: true },
          "game_credits",
          userId
        )
      );
      return;
    }

    // Atomic-ish claim: only succeed if last claim is older than today (or null)
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const nextCredits = Math.max(0, (credits.credits || 0) + DAILY_BONUS);
    let query = supabase
      .from("user_credits")
      .update({
        credits: nextCredits,
        last_daily_claim: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);

    if (credits.last_daily_claim) {
      query = query.lt("last_daily_claim", todayStart);
    } else {
      query = query.is("last_daily_claim", null);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      // Column may not exist yet — fall back to applyCreditDelta + best-effort stamp
      console.warn("[Game] daily claim update:", error.message || error);
      const updated = await applyCreditDelta(userId, DAILY_BONUS);
      await supabase
        .from("user_credits")
        .update({ last_daily_claim: now.toISOString() })
        .eq("user_id", userId);
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.dailyClaimed", { bonus: DAILY_BONUS, balance: updated?.credits ?? nextCredits }),
          { credits: updated?.credits ?? nextCredits, userId, dailyClaimed: true },
          "game_credits",
          userId
        )
      );
      return;
    }

    if (!data) {
      // Lost race or already claimed
      const fresh = await getUserCredits(userId);
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.dailyAlreadyShort", { balance: fresh.credits || 0 }),
          { credits: fresh.credits, userId, dailyClaimed: true },
          "game_credits",
          userId
        )
      );
      return;
    }

    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.dailyAnnounce", { username, bonus: DAILY_BONUS, balance: data.credits || 0 }),
        { credits: data.credits, userId, dailyClaimed: true },
        "game_credits",
        userId
      )
    );
  } catch (err) {
    console.error("[Game] daily:", err.message || err);
    socket.emit("game:notice", { groupId, text: "Could not claim daily bonus." });
  }
}

async function handleCreditsCheck(io, socket, userId, groupId) {
  const credits = await getUserCredits(userId);
  const content = G("bot.game.balance", {
    credits: credits.credits || 0,
    won: credits.total_won || 0,
    lost: credits.total_lost || 0,
    hands: credits.games_played || 0,
  });

  emitToGroup(
    io,
    socket,
    groupId,
    createGameMessage(content, { credits: credits.credits, stats: credits, userId }, "game_credits", userId)
  );
}

async function handleLeaderboard(io, socket, userId, groupId) {
  try {
    const { data: topUsers, error } = await supabase
      .from("user_credits")
      .select("user_id, credits, total_won, games_played")
      .order("credits", { ascending: false })
      .limit(10);

    if (error) throw error;

    let content = G("bot.game.leaderboardEmpty");
    if (topUsers?.length) {
      const ids = topUsers.map((u) => u.user_id);
      const { data: users } = await supabase
        .from("users")
        .select("id, username")
        .in("id", ids);
      const nameById = new Map((users || []).map((u) => [u.id, u.username]));
      const medals = ["🥇", "🥈", "🥉"];
      let rows = "";
      topUsers.forEach((row, i) => {
        const name = nameById.get(row.user_id) || "Player";
        const medal = medals[i] || `${i + 1}.`;
        rows += `${medal} **${name}** — ${(row.credits || 0).toLocaleString("en-US")}\n`;
      });
      content = G("bot.game.leaderboard", { rows });
    }

    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(content, { leaders: topUsers || [], userId }, "game_leaderboard", userId)
    );
  } catch (err) {
    console.error("[Game] leaderboard:", err.message || err);
    socket.emit("game:notice", { groupId, text: "Could not load leaderboard." });
  }
}

async function handleHelp(io, socket, userId, groupId, unknownCommand = null) {
  const credits = await getUserCredits(userId);
  const content = G("bot.game.help", {
    hasUnknown: unknownCommand ? "yes" : "no",
    command: unknownCommand || "",
    balance: credits.credits || 0,
    bonus: DAILY_BONUS,
    starting: STARTING_CREDITS,
  });

  emitToGroup(
    io,
    socket,
    groupId,
    createGameMessage(
      content,
      { credits: credits.credits, userId },
      "game_help",
      userId
    )
  );
}

function blockingTable(userId, groupId) {
  const hand = GameManager.get(userId, groupId);
  if (hand && hand.status !== "finished") return "blackjack";
  const coin = CoinFlipManager.get(userId, groupId);
  if (coin && coin.status === "calling") return "coinflip";
  return null;
}

async function saveRound(userId, groupId, { gameType, bet, result, winAmount, player, dealer }) {
  try {
    const opts = currentEmitRoom();
    const row = {
      user_id: userId,
      game_type: gameType,
      bet_amount: bet,
      result: result || "loss",
      win_amount: winAmount || 0,
      player_hand: player || null,
      dealer_hand: dealer || null,
    };
    if (isGroupTarget(opts) && groupId) row.group_id = groupId;
    const { error } = await supabase.from("game_history").insert(row);
    if (error) console.error("[Game] saveRound:", error.message || error);
  } catch (err) {
    console.error("[Game] saveRound exception:", err.message || err);
  }
}

async function findRecipient(token) {
  const raw = String(token || "").trim();
  const mention = raw.match(/^<@!?([0-9a-f-]{20,})>$/i);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const id = mention?.[1] || (uuid.test(raw) ? raw : null);
  if (id) {
    const { data, error } = await supabase
      .from("users")
      .select("id, username")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const username = raw.replace(/^@/, "").trim();
  if (!username) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, username")
    .ilike("username", username)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function handlePay(io, socket, userId, username, groupId, arg) {
  const parsed = parsePayArgs(arg);
  if (parsed.error) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.payUsage"),
        { fromUserId: userId },
        "game_transfer"
      )
    );
    return;
  }

  let recipient;
  try {
    recipient = await findRecipient(parsed.userToken);
  } catch (err) {
    console.error("[Game] pay lookup:", err.message || err);
    socket.emit("game:notice", { groupId, text: "Could not find that player." });
    return;
  }
  if (!recipient) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.payNoMatch", { query: parsed.userToken }),
        { fromUserId: userId },
        "game_transfer"
      )
    );
    return;
  }
  if (recipient.id === userId) {
    socket.emit("game:notice", { groupId, text: "You can't send credits to yourself." });
    return;
  }

  await withCreditLocks([userId, recipient.id], async () => {
    const mine = await getUserCredits(userId);
    const balance = mine.credits || 0;
    if (balance < parsed.amount) {
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.payNotEnough", { amount: parsed.amount, balance }),
          { fromUserId: userId, balance },
          "game_transfer"
        )
      );
      return;
    }
    const debited = await applyCreditDelta(userId, -parsed.amount);
    if (!debited || Number(debited.credits) !== balance - parsed.amount) {
      if (debited && debited.credits !== balance) {
        await applyCreditDelta(userId, balance - debited.credits);
      }
      socket.emit("game:notice", { groupId, text: "Could not send credits. Try again." });
      return;
    }
    const credited = await applyCreditDelta(recipient.id, parsed.amount);
    if (!credited) {
      await applyCreditDelta(userId, parsed.amount);
      socket.emit("game:notice", { groupId, text: "Could not deliver credits. Your balance was restored." });
      return;
    }
    const toName = recipient.username || "player";
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.paySent", { from: username, amount: parsed.amount, to: toName, balance: debited.credits }),
        {
          fromUserId: userId,
          fromUsername: username,
          toUserId: recipient.id,
          toUsername: toName,
          amount: parsed.amount,
          balance: debited.credits,
        },
        "game_transfer"
      )
    );
  });
}

async function handleSlot(io, socket, userId, username, groupId, arg) {
  const bet = parseInt(String(arg || "").trim(), 10);
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.slotUsage", { min: MIN_BET, max: MAX_BET, lines: LINE_COUNT }),
        { game: "slot", status: "lobby", userId },
        "game_lobby",
        userId
      )
    );
    return;
  }
  const blocked = blockingTable(userId, groupId);
  if (blocked === "blackjack") {
    socket.emit("game:notice", { groupId, text: "Finish your blackjack hand before spinning." });
    return;
  }
  if (blocked === "coinflip") {
    const coin = CoinFlipManager.get(userId, groupId);
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.callBeforeSpin"),
        { ...coin.getPublicState(), credits: (await getUserCredits(userId)).credits },
        "game_update",
        userId
      )
    );
    return;
  }

  await withCreditLock(userId, async () => {
    const credits = await getUserCredits(userId);
    if ((credits.credits || 0) < bet) {
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.insufficient", { have: credits.credits || 0, need: bet }),
          { game: "slot", status: "lobby", credits: credits.credits, userId },
          "game_lobby",
          userId
        )
      );
      return;
    }
    const afterDebit = await applyCreditDelta(userId, -bet);
    if (!afterDebit || Number(afterDebit.credits) !== (credits.credits || 0) - bet) {
      if (afterDebit) {
        const drift = (credits.credits || 0) - Number(afterDebit.credits);
        if (drift) await applyCreditDelta(userId, drift);
      }
      socket.emit("game:notice", { groupId, text: "Could not place the spin. Try again." });
      return;
    }
    const round = playRound({ bet });
    round.id = roundId();
    const meta = { gamesPlayedInc: true };
    if (round.profit > 0) meta.wonInc = round.profit;
    else if (round.profit < 0) meta.lostInc = -round.profit;
    const paid = await applyCreditDelta(userId, round.prize, meta);
    if (!paid && round.prize > 0) {
      await applyCreditDelta(userId, bet);
      socket.emit("game:notice", { groupId, text: "Spin failed to settle. Stake returned." });
      return;
    }
    const balance = paid?.credits ?? afterDebit.credits + round.prize;
    const state = toPublicState({
      userId,
      username,
      groupId,
      bet,
      round,
      credits: balance,
    });
    const outcome = round.profit > 0 ? "win" : round.profit === 0 ? "push" : "loss";
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.slotResult", { username, bet, outcome, profit: round.profit.toLocaleString("en-US") }),
        state,
        "game_end",
        userId
      )
    );
    await saveRound(userId, groupId, {
      gameType: "slot",
      bet,
      result: round.result,
      winAmount: round.prize,
      player: { grid: round.phases[0].grid, freeSpins: round.freeSpins, profit: round.profit },
    });
  });
}

async function settleCoin(userId, groupId, round) {
  const meta = { gamesPlayedInc: true };
  if (round.profit > 0) meta.wonInc = round.profit;
  else if (round.profit < 0) meta.lostInc = -round.profit;
  const paid =
    round.winAmount > 0
      ? await applyCreditDelta(userId, round.winAmount, meta)
      : await applyCreditDelta(userId, 0, meta);
  await saveRound(userId, groupId, {
    gameType: "coinflip",
    bet: round.bet,
    result: round.result,
    winAmount: round.winAmount,
    player: round.toHistoryPayload().player_hand,
  });
  return paid;
}

async function handleCoinFlip(io, socket, userId, username, groupId, arg) {
  const parsed = parseCoinArgs(arg);
  if (parsed.error) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.coinUsage"),
        { game: "coinflip", status: "lobby", userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  const existing = CoinFlipManager.get(userId, groupId);
  if (existing && existing.status === "calling") {
    if (!parsed.side) {
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.coinPick", { username }),
          { ...existing.getPublicState(), credits: (await getUserCredits(userId)).credits },
          "game_update",
          userId
        )
      );
      return;
    }
    if (parsed.amount != null && parsed.amount !== existing.bet) {
      socket.emit("game:notice", {
        groupId,
        text: "You already have a coin in the air. Call heads or tails.",
      });
    }
    const called = CoinFlipManager.call(userId, groupId, parsed.side);
    if (called.error) {
      socket.emit("game:notice", { groupId, ...engineNotice(called.error) });
      return;
    }
    const paid = await withCreditLock(userId, () => settleCoin(userId, groupId, called.round));
    const state = {
      ...called.state,
      credits: paid?.credits ?? (await getUserCredits(userId)).credits,
    };
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.coinCalledResult", {
          username,
          won: called.round.result === "win" ? "yes" : "no",
          face: sideRef(called.round.face),
          call: sideRef(called.round.call),
          profit: called.round.profit,
        }),
        state,
        "game_end",
        userId
      )
    );
    return;
  }

  if (parsed.amount == null) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.coinUsageSide"),
        { game: "coinflip", status: "lobby", userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  const bet = parsed.amount;
  if (bet < MIN_BET || bet > MAX_BET) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.coinBetRange", { min: MIN_BET, max: MAX_BET }),
        { game: "coinflip", status: "lobby", userId },
        "game_lobby",
        userId
      )
    );
    return;
  }

  const hand = GameManager.get(userId, groupId);
  if (hand && hand.status !== "finished") {
    socket.emit("game:notice", { groupId, text: "Finish your blackjack hand before flipping." });
    return;
  }

  await withCreditLock(userId, async () => {
    const credits = await getUserCredits(userId);
    if ((credits.credits || 0) < bet) {
      emitToGroup(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.insufficient", { have: credits.credits || 0, need: bet }),
          { game: "coinflip", status: "lobby", credits: credits.credits, userId },
          "game_lobby",
          userId
        )
      );
      return;
    }
    const afterDebit = await applyCreditDelta(userId, -bet);
    if (!afterDebit || Number(afterDebit.credits) !== (credits.credits || 0) - bet) {
      if (afterDebit) {
        const drift = (credits.credits || 0) - Number(afterDebit.credits);
        if (drift) await applyCreditDelta(userId, drift);
      }
      socket.emit("game:notice", { groupId, text: "Could not escrow the stake." });
      return;
    }
    const created = CoinFlipManager.create({
      userId,
      username,
      groupId,
      bet,
      side: parsed.side,
    });
    if (created.error || !created.round) {
      await applyCreditDelta(userId, bet);
      socket.emit("game:notice", { groupId, ...engineNotice(created.error || "Could not flip.") });
      return;
    }
    if (created.round.status === "finished") {
      const paid = await settleCoin(userId, groupId, created.round);
      const state = {
        ...created.state,
        credits: paid?.credits ?? afterDebit.credits,
      };
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(
          G("bot.game.coinInstantResult", {
            username,
            won: created.round.result === "win" ? "yes" : "no",
            face: sideRef(created.round.face),
            call: sideRef(created.round.call),
            profit: created.round.profit,
            bet,
          }),
          state,
          "game_end",
          userId
        )
      );
      return;
    }
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        G("bot.game.coinEscrowed", { username, bet }),
        { ...created.state, credits: afterDebit.credits },
        "game_start",
        userId
      )
    );
  });
}

module.exports = {
  registerGameHandlers,
  getUserCredits,
  BOT_USER,
  handleGameCommand,
  createGameMessage,
  VALID_COMMANDS,
  MIN_BET,
  MAX_BET,
  IOS_DENY_TEXT,
  denyCasinoOnIos,
  currentEmitRoom,
  runInChatTarget,
};
