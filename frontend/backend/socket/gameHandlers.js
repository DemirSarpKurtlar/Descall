/**
 * Casino socket handlers — blackjack, slot, coin flip, and credit transfers.
 * Credits are server-authoritative. Spectators receive the same board; actions
 * are keyed to the caller's own session, so a watcher cannot spin or call.
 */

const { GameManager, MIN_BET, MAX_BET, STARTING_CREDITS } = require("../games/BlackjackGame");
const { playRound, toPublicState, roundId, LINE_COUNT } = require("../games/SlotGame");
const { CoinFlipManager } = require("../games/CoinFlipGame");
const { parsePayArgs, parseCoinArgs, sideLabel } = require("../games/casinoArgs");
const supabase = require("../db/supabase");
const { casinoAccess } = require("../lib/ageGate");

const AGE_FREE_COMMANDS = new Set(["help", "yardım", "commands", "jb"]);

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

function createGameMessage(content, gameData = null, type = "game_action", ownerUserId = null) {
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
    content,
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
    // Server text channels reuse roomId as channelId — omit FK group_id there
    const row = {
      user_id: userId,
      game_type: "blackjack",
      bet_amount: payload.bet,
      result: payload.result,
      win_amount: payload.winAmount,
      player_hand: payload.player_hand,
      dealer_hand: payload.dealer_hand,
    };
    if (!opts.channelId && groupId) {
      row.group_id = groupId;
    }
    const { error } = await supabase.from("game_history").insert(row);
    if (error) console.error("[Game] saveGameHistory:", error.message || error);
  } catch (err) {
    console.error("[Game] saveGameHistory exception:", err.message || err);
  }
}

/** Stack so server-channel games can reuse group emit helpers. */
const emitRoomStack = [];
function pushEmitRoom(opts) {
  emitRoomStack.push(opts || {});
}
function popEmitRoom() {
  emitRoomStack.pop();
}
function currentEmitRoom() {
  return emitRoomStack[emitRoomStack.length - 1] || {};
}

function emitToGroup(io, socket, groupId, message) {
  const opts = currentEmitRoom();
  const channelId = opts.channelId || null;
  const roomId = channelId || groupId;
  const payload = {
    groupId: roomId,
    channelId: channelId || null,
    serverId: opts.serverId || null,
    message,
  };
  const room = channelId ? `server-channel:${channelId}` : `group:${groupId}`;
  socket.emit("game:message", payload);
  socket.to(room).emit("game:message", payload);
}

function emitGameUpdate(io, socket, groupId, message) {
  const opts = currentEmitRoom();
  const channelId = opts.channelId || null;
  const roomId = channelId || groupId;
  const payload = {
    groupId: roomId,
    channelId: channelId || null,
    serverId: opts.serverId || null,
    message,
  };
  const room = channelId ? `server-channel:${channelId}` : `group:${groupId}`;
  // Emit both: game:update (in-place) + game:message (first paint / older clients)
  socket.emit("game:update", payload);
  socket.to(room).emit("game:update", payload);
  socket.emit("game:message", payload);
  socket.to(room).emit("game:message", payload);
}

function registerGameHandlers(io, socket) {
  const myId = socket.user?.id;
  const myUsername = socket.user?.username;
  if (!myId) return;

  socket.on("game:command", async ({ groupId, channelId, command, args } = {}) => {
    const roomId = channelId || groupId;
    if (!roomId || !command) return;
    const full = `/${command}${args != null && args !== "" ? ` ${args}` : ""}`.trim();
    await handleGameCommand(
      io,
      socket,
      myId,
      myUsername,
      roomId,
      full,
      channelId ? { channelId } : {}
    );
  });

  socket.on("game:action", async ({ groupId, channelId, action } = {}) => {
    const roomId = channelId || groupId;
    if (!roomId || !action) return;
    const a = String(action).toLowerCase();
    if (a !== "help" && (await denyIfNotAllowed(socket, myId, roomId))) return;
    const opts = channelId ? { channelId } : {};
    pushEmitRoom(opts);
    try {
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
    } finally {
      popEmitRoom();
    }
  });

  socket.on("game:credits", async (callback) => {
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

  socket.on("game:status", ({ groupId } = {}, callback) => {
    const game = groupId ? GameManager.get(myId, groupId) : null;
    if (typeof callback === "function") {
      callback({
        active: Boolean(game && game.status !== "finished"),
        game: game ? game.getPublicState() : null,
      });
    }
  });
}

async function handleGameCommand(io, socket, userId, username, groupId, fullCommand, opts = {}) {
  const match = String(fullCommand || "").trim().match(COMMAND_REGEX);
  if (!match) return;

  const command = match[1].toLowerCase();
  const arg = match[2];
  if (VALID_COMMANDS.has(command) && !AGE_FREE_COMMANDS.has(command)) {
    if (await denyIfNotAllowed(socket, userId, groupId)) return;
  }
  pushEmitRoom(opts);
  try {
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
          "Did you mean **/bj**?\n\nStart a hand: `/bj 100`\nAll commands: `/help`",
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
  } finally {
    popEmitRoom();
  }
}

async function handleBlackjackStart(io, socket, userId, username, groupId, betArg) {
  const bet = parseInt(betArg, 10);

  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        `**Blackjack**\n\nInvalid bet.\nUsage: \`/bj <amount>\`\nMin **${MIN_BET}** · Max **${MAX_BET.toLocaleString()}**`,
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
        "Call **yazı** or **tura** on your open flip first.",
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
        "You already have an active hand. Use **HIT**, **STAND**, or **DOUBLE**.",
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
        `Insufficient balance.\nYou have **${(credits.credits || 0).toLocaleString()}** · need **${bet.toLocaleString()}**`,
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
      createGameMessage("Could not place bet. Try again.", { status: "lobby", userId }, "game_lobby", userId)
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
        `❌ ${created.error}`,
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
    `**Blackjack** — @${username}\nBet **${bet.toLocaleString()}** · Balance **${afterDebit.credits.toLocaleString()}**`,
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
          `❌ DOUBLE is only available on your first two cards.`,
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
          `Not enough credits to double (need **${extra.toLocaleString()}** more).`,
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
          `❌ ${result.error}`,
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
          `❌ ${result.error}`,
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
    `**${action.toUpperCase()}** — @${username}`,
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

function buildResultText(username, state) {
  const lines = [`**Blackjack** — @${username}`];
  lines.push(`Player **${state.playerHand?.value}** · Dealer **${state.dealerHand?.value}**`);
  switch (state.result) {
    case "blackjack":
      lines.push(`BLACKJACK · +${(state.profit || 0).toLocaleString()} credits`);
      break;
    case "win":
      lines.push(`You win · +${(state.profit || 0).toLocaleString()} credits`);
      break;
    case "push":
      lines.push("Push — stake returned");
      break;
    case "loss":
      lines.push(`Dealer wins · −${(state.bet || 0).toLocaleString()} credits`);
      break;
    default:
      break;
  }
  return lines.join("\n");
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
          `**Daily bonus** already claimed today.\n\nCome back in about **${hours}h**.\nBalance: **${(credits.credits || 0).toLocaleString()}**`,
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
          `**Daily bonus** claimed!\n\n+**${DAILY_BONUS.toLocaleString()}** credits\nBalance: **${(updated?.credits ?? nextCredits).toLocaleString()}**\n\nCome back tomorrow for more.`,
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
          `**Daily bonus** already claimed today.\n\nBalance: **${(fresh.credits || 0).toLocaleString()}**`,
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
        `🎁 **@${username}** claimed the daily bonus!\n\n+**${DAILY_BONUS.toLocaleString()}** credits\nBalance: **${(data.credits || 0).toLocaleString()}**`,
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
  const content =
    `**Balance**\n\n` +
    `Credits: **${(credits.credits || 0).toLocaleString()}**\n` +
    `Won: **${(credits.total_won || 0).toLocaleString()}**\n` +
    `Lost: **${(credits.total_lost || 0).toLocaleString()}**\n` +
    `Hands: **${(credits.games_played || 0).toLocaleString()}**\n\n` +
    `Play: \`/bj 100\` · \`/slot 100\` · \`/cf 100\`\n` +
    `Send: \`/pay @user 500\``;

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

    let content = "**Leaderboard** — Top 10\n\n";
    if (!topUsers?.length) {
      content += "No hands played yet. Be first: `/bj 100`";
    } else {
      const ids = topUsers.map((u) => u.user_id);
      const { data: users } = await supabase
        .from("users")
        .select("id, username")
        .in("id", ids);
      const nameById = new Map((users || []).map((u) => [u.id, u.username]));
      const medals = ["🥇", "🥈", "🥉"];
      topUsers.forEach((row, i) => {
        const name = nameById.get(row.user_id) || "Player";
        const medal = medals[i] || `${i + 1}.`;
        content += `${medal} **${name}** — ${(row.credits || 0).toLocaleString()}\n`;
      });
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
  let content = "**Casino Help**\n\n";
  if (unknownCommand) content += `Unknown command: \`/${unknownCommand}\`\n\n`;
  content +=
    `Balance: **${(credits.credits || 0).toLocaleString()}**\n\n` +
    `**Play**\n` +
    `\`/bj <amount>\` — deal a hand\n` +
    `\`/hit\` · \`/stand\` · \`/double\`\n` +
    `\`/slot <amount>\` — 5 reels, 10 lines\n` +
    `\`/cf <amount> [yazı|tura|heads|tails|h|t]\` or \`/coinflip\`\n` +
    `\`/pay @user <amount>\` — send credits (\`/gonder\`, \`/send\`, \`/tip\`)\n\n` +
    `**Info**\n` +
    `\`/credits\` · \`/top\` · \`/daily\` · \`/help\`\n\n` +
    `**Rules**\n` +
    `• Beat the dealer without busting (21)\n` +
    `• Dealer hits soft 17\n` +
    `• Blackjack pays 3:2\n` +
    `• Slot: wild substitutes · scatter pays anywhere and opens free spins\n` +
    `• Coin is even money — call yazı, tura, heads, h, tails, or t\n` +
    `• Others can watch a live board; only you can act on it\n` +
    `• Daily bonus: **${DAILY_BONUS.toLocaleString()}** credits once per day\n` +
    `• Starting bankroll: ${STARTING_CREDITS.toLocaleString()} credits`;

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
    if (!opts.channelId && groupId) row.group_id = groupId;
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
        "**Send credits**\n\nUsage: `/pay @user 500`\nAlso: `/gonder`, `/send`, `/tip`",
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
        `No player matches **${parsed.userToken}**.\nUse @username or a mention.`,
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
          `Not enough credits to send **${parsed.amount.toLocaleString()}**.\nBalance: **${balance.toLocaleString()}**`,
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
        `**@${username}** sent **${parsed.amount.toLocaleString()}** credits to **@${toName}**.\nBalance: **${debited.credits.toLocaleString()}**`,
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
        `**Slot**\n\nUsage: \`/slot <amount>\`\nMin **${MIN_BET}** · Max **${MAX_BET.toLocaleString()}** · ${LINE_COUNT} paylines`,
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
        "Call **yazı** or **tura** before spinning.",
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
          `Insufficient balance.\nYou have **${(credits.credits || 0).toLocaleString()}** · need **${bet.toLocaleString()}**`,
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
    const headline =
      round.profit > 0
        ? `Win **+${round.profit.toLocaleString()}**`
        : round.profit === 0
          ? "Push"
          : `Loss **${round.profit.toLocaleString()}**`;
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        `**Slot** — @${username}\nBet **${bet.toLocaleString()}** · ${headline}`,
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
        "**Coin flip**\n\nUsage: `/cf 100` then call yazı or tura\nOr `/cf 100 heads` · `/cf 100 h` · `/cf 100 tails` · `/cf 100 t`",
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
          `**Coin** — @${username}\nPick **yazı** or **tura**.`,
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
        text: "You already have a coin in the air. Call yazı or tura.",
      });
    }
    const called = CoinFlipManager.call(userId, groupId, parsed.side);
    if (called.error) {
      socket.emit("game:notice", { groupId, text: called.error });
      return;
    }
    const paid = await withCreditLock(userId, () => settleCoin(userId, groupId, called.round));
    const state = {
      ...called.state,
      credits: paid?.credits ?? (await getUserCredits(userId)).credits,
    };
    const face = sideLabel(called.round.face);
    const call = sideLabel(called.round.call);
    const outcome =
      called.round.result === "win"
        ? `Landed **${face}** · +${called.round.profit.toLocaleString()}`
        : `Called **${call}**, landed **${face}**`;
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(`**Coin** — @${username}\n${outcome}`, state, "game_end", userId)
    );
    return;
  }

  if (parsed.amount == null) {
    emitToGroup(
      io,
      socket,
      groupId,
      createGameMessage(
        "**Coin flip**\n\nUsage: `/cf 100 heads` · `/cf 100 h` · `/cf 100 tails` · `/cf 100 t`",
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
        `**Coin flip**\n\nBet must be **${MIN_BET}**–**${MAX_BET.toLocaleString()}**.`,
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
          `Insufficient balance.\nYou have **${(credits.credits || 0).toLocaleString()}** · need **${bet.toLocaleString()}**`,
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
      socket.emit("game:notice", { groupId, text: created.error || "Could not flip." });
      return;
    }
    if (created.round.status === "finished") {
      const paid = await settleCoin(userId, groupId, created.round);
      const state = {
        ...created.state,
        credits: paid?.credits ?? afterDebit.credits,
      };
      const face = sideLabel(created.round.face);
      const call = sideLabel(created.round.call);
      const outcome =
        created.round.result === "win"
          ? `Called **${call}** · landed **${face}** · +${created.round.profit.toLocaleString()}`
          : `Called **${call}** · landed **${face}** · −${bet.toLocaleString()}`;
      emitGameUpdate(
        io,
        socket,
        groupId,
        createGameMessage(`**Coin** — @${username}\n${outcome}`, state, "game_end", userId)
      );
      return;
    }
    emitGameUpdate(
      io,
      socket,
      groupId,
      createGameMessage(
        `**Coin** — @${username}\nStake **${bet.toLocaleString()}** escrowed. Call yazı or tura.`,
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
};
