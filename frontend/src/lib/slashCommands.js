import { casinoHiddenOnThisDevice } from "./casinoCommands.js";

/**
 * Composer slash commands. One row per command; aliases are chips on that row
 * (e.g. /coinflip · /cf, /pay · /gonder /send /tip), not duplicate rows.
 * Strings are English source keys; the composer runs them through t() (tr.js).
 *
 * Surfaces: server text channel, group DM, and 1:1 DM (casino + `dm: true`).
 */

export const SLASH_GROUPS = [
  { id: "games", label: "Games" },
  { id: "credits", label: "Credits" },
  { id: "general", label: "General" },
  { id: "moderation", label: "Moderation" },
];

export const SLASH_COMMANDS = [
  { name: "bj", aliases: ["blackjack"], group: "games", args: "‹bet›", description: "Start a blackjack hand against the house", insert: "/bj 100", label: "Blackjack", chatOnly: true, casino: true },
  { name: "slot", group: "games", args: "‹bet›", description: "Spin the five-reel slot", insert: "/slot 100", label: "Slot", chatOnly: true, casino: true },
  { name: "coinflip", aliases: ["cf"], group: "games", args: "‹bet› [heads|tails]", description: "Flip a coin, a win pays your bet back 2×", insert: "/coinflip 100", label: "Coin flip", chatOnly: true, casino: true },
  { name: "pay", aliases: ["gonder", "send", "tip"], group: "credits", args: "@user ‹amount›", description: "Send DesCoin to someone", insert: "/pay @user 500", label: "Send credits", chatOnly: true, casino: true },
  { name: "daily", group: "credits", description: "Claim your daily bonus · +250 every day", insert: "/daily", label: "Daily bonus", chatOnly: true, casino: true },
  { name: "credits", aliases: ["bakiye", "balance"], group: "credits", description: "See your DesCoin balance", insert: "/credits", label: "Credits", chatOnly: true, casino: true },
  { name: "top", aliases: ["lider"], group: "credits", description: "Show the leaderboard", insert: "/top", label: "Leaderboard", chatOnly: true, casino: true },
  { name: "help", aliases: ["yardım"], group: "general", description: "List the commands you can use here", insert: "/help", label: "Help", chatOnly: true, dm: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "server", group: "general", description: "Show server information", insert: "/server", label: "Server info", chatOnly: true, serverOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "user", group: "general", args: "[@user]", description: "Show a member card", insert: "/user ", label: "User card", chatOnly: true, dm: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "avatar", group: "general", args: "[@user]", description: "Show someone's avatar", insert: "/avatar ", label: "Avatar", chatOnly: true, dm: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "poll", group: "general", args: "question | option | option", description: "Start a poll", insert: "/poll Question | Option 1 | Option 2", label: "Poll", chatOnly: true, dm: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "nick", group: "moderation", args: "[name]", description: "Change your server nickname", insert: "/nick ", label: "Nickname", chatOnly: true, serverOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "timeout", group: "moderation", args: "@user 5m", description: "Time out a member", insert: "/timeout @user 5m ", label: "Timeout", chatOnly: true, serverOnly: true, permission: "MODERATE_MEMBERS" },
  { name: "kick", group: "moderation", args: "@user", description: "Kick a member from the server", insert: "/kick @user ", label: "Kick", chatOnly: true, serverOnly: true, permission: "KICK_MEMBERS" },
  { name: "ban", group: "moderation", args: "@user", description: "Ban a member from the server", insert: "/ban @user ", label: "Ban", chatOnly: true, serverOnly: true, permission: "BAN_MEMBERS" },
  { name: "purge", group: "moderation", args: "1–100", description: "Delete the last N messages", insert: "/purge 10", label: "Purge", chatOnly: true, serverOnly: true, permission: "MANAGE_MESSAGES" },
];

const DM_COMMAND_NAMES = new Set(
  SLASH_COMMANDS.filter((c) => c.casino || c.dm).flatMap((c) => [c.name, ...(c.aliases || [])])
);

export function getSlashCommandsForSurface({
  activeChannel,
  activeGroup,
  activeDmUser,
  permissionFlags = {},
  isOwner = false,
  hideCasino = casinoHiddenOnThisDevice(),
} = {}) {
  const inServerText = activeChannel?.type === "text";
  const inGroup = !inServerText && Boolean(activeGroup);
  const inDm = !inServerText && !inGroup && Boolean(activeDmUser?.id);
  if (!inServerText && !inGroup && !inDm) return [];

  return SLASH_COMMANDS.filter((cmd) => {
    // Native iOS app: no casino commands in the picker.
    if (hideCasino && cmd.casino) return false;
    if (cmd.serverOnly && !inServerText) return false;
    if (cmd.groupOnly && !inGroup) return false;
    if (cmd.voiceOnly) return false;
    if (inDm && !cmd.casino && !cmd.dm) return false;
    if (inServerText && !cmd.casino && !isOwner && !permissionFlags.ADMINISTRATOR) {
      if (!permissionFlags.USE_APPLICATION_COMMANDS) return false;
      if (cmd.permission && cmd.permission !== "USE_APPLICATION_COMMANDS" && !permissionFlags[cmd.permission]) {
        return false;
      }
    }
    return true;
  }).map((cmd) => ({
    ...cmd,
    aliases: cmd.aliases || [],
    id: cmd.name,
    command: `/${cmd.name}`,
    hint: cmd.description,
  }));
}

/**
 * Same rules as the composer picker: only a leading slash token, before arguments.
 * A command matches by its name or any alias; `matchedAlias` is set when only
 * an alias matched (the picker highlights that chip and inserts that spelling).
 */
export function filterSlashCommandMatches(commands, message) {
  if (!commands?.length) return [];
  const raw = String(message || "");
  if (!raw.startsWith("/")) return [];
  const firstToken = raw.split(/\s/)[0] || "";
  if (raw.includes(" ") && firstToken.length > 1) return [];
  const q = firstToken.slice(1).toLocaleLowerCase("tr");
  const out = [];
  for (const cmd of commands) {
    if (!q || cmd.name.startsWith(q)) {
      out.push(cmd.matchedAlias ? { ...cmd, matchedAlias: null } : cmd);
      continue;
    }
    const alias = (cmd.aliases || []).find((a) => a.startsWith(q));
    if (alias) out.push({ ...cmd, matchedAlias: alias });
  }
  return out;
}

/** Text to put in the composer for a picked command (keeps a typed alias). */
export function slashInsertText(cmd) {
  if (!cmd) return "";
  if (cmd.matchedAlias && cmd.insert.startsWith(`/${cmd.name}`)) {
    return `/${cmd.matchedAlias}${cmd.insert.slice(cmd.name.length + 1)}`;
  }
  return cmd.insert;
}

/** Matches grouped for the menu, in SLASH_GROUPS order; empty groups dropped. */
export function groupSlashMatches(matches) {
  return SLASH_GROUPS.map((g) => ({ ...g, items: matches.filter((m) => (m.group || "general") === g.id) })).filter(
    (g) => g.items.length > 0
  );
}

/** A 1:1 DM message the server runs as a command instead of storing as text. */
export function isDmSlashCommand(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("/")) return false;
  const name = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  return DM_COMMAND_NAMES.has(name) || ["hit", "stand", "stay", "double", "commands"].includes(name);
}
