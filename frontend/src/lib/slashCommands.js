export const SLASH_COMMANDS = [
  { name: "bj", description: "Start a blackjack hand.", insert: "/bj 100", label: "Blackjack", chatOnly: true, casino: true },
  { name: "slot", description: "Spin the five-reel slot.", insert: "/slot 100", label: "Slot", chatOnly: true, casino: true },
  { name: "coinflip", description: "Flip a coin. Add heads, h, tails, or t.", insert: "/coinflip 100", label: "Coin flip", chatOnly: true, casino: true },
  { name: "cf", description: "Flip a coin. Same as /coinflip.", insert: "/cf 100", label: "Coin flip", chatOnly: true, casino: true },
  { name: "pay", description: "Send casino credits to someone.", insert: "/pay @user 500", label: "Send credits", chatOnly: true, casino: true },
  { name: "send", description: "Send casino credits. Same as /pay.", insert: "/send @user 500", label: "Send credits", chatOnly: true, casino: true },
  { name: "gonder", description: "Send casino credits. Same as /pay.", insert: "/gonder @user 500", label: "Send credits", chatOnly: true, casino: true },
  { name: "tip", description: "Send casino credits. Same as /pay.", insert: "/tip @user 500", label: "Send credits", chatOnly: true, casino: true },
  { name: "daily", description: "Claim your daily casino bonus.", insert: "/daily", label: "Daily bonus", chatOnly: true, casino: true },
  { name: "credits", description: "Check your casino credits.", insert: "/credits", label: "Credits", chatOnly: true, casino: true },
  { name: "top", description: "Show the casino leaderboard.", insert: "/top", label: "Leaderboard", chatOnly: true, casino: true },
  { name: "help", description: "List commands available here.", insert: "/help", label: "Help", chatOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "server", description: "Show server information.", insert: "/server", label: "Server info", chatOnly: true, serverOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "user", description: "Show a member card.", insert: "/user ", label: "User card", chatOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "avatar", description: "Show a user's avatar.", insert: "/avatar ", label: "Avatar", chatOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "nick", description: "Change your server nickname.", insert: "/nick ", label: "Nickname", chatOnly: true, serverOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "poll", description: "Create a poll: question | option | option.", insert: "/poll Question | Option 1 | Option 2", label: "Poll", chatOnly: true, permission: "USE_APPLICATION_COMMANDS" },
  { name: "timeout", description: "Timeout a member.", insert: "/timeout @user 5m ", label: "Timeout", chatOnly: true, serverOnly: true, permission: "MODERATE_MEMBERS" },
  { name: "kick", description: "Kick a member from the server.", insert: "/kick @user ", label: "Kick", chatOnly: true, serverOnly: true, permission: "KICK_MEMBERS" },
  { name: "ban", description: "Ban a member from the server.", insert: "/ban @user ", label: "Ban", chatOnly: true, serverOnly: true, permission: "BAN_MEMBERS" },
  { name: "purge", description: "Delete the last N messages (1–100).", insert: "/purge 10", label: "Purge", chatOnly: true, serverOnly: true, permission: "MANAGE_MESSAGES" },
];

export function getSlashCommandsForSurface({ activeChannel, activeGroup, permissionFlags = {}, isOwner = false } = {}) {
  const inServerText = activeChannel?.type === "text";
  const inGroup = Boolean(activeGroup);
  if (!inServerText && !inGroup) return [];

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.serverOnly && !inServerText) return false;
    if (cmd.groupOnly && !inGroup) return false;
    if (cmd.voiceOnly) return false;
    if (cmd.chatOnly && !inServerText && !inGroup) return false;
    if (inServerText && !cmd.casino && !isOwner && !permissionFlags.ADMINISTRATOR) {
      if (!permissionFlags.USE_APPLICATION_COMMANDS) return false;
      if (cmd.permission && cmd.permission !== "USE_APPLICATION_COMMANDS" && !permissionFlags[cmd.permission]) {
        return false;
      }
    }
    return true;
  }).map((cmd) => ({
    ...cmd,
    id: cmd.name,
    command: `/${cmd.name}`,
    hint: cmd.description,
  }));
}

/** Same rules as the composer picker: only a leading slash token, before arguments. */
export function filterSlashCommandMatches(commands, message) {
  if (!commands?.length) return [];
  const raw = String(message || "");
  if (!raw.startsWith("/")) return [];
  const firstToken = raw.split(/\s/)[0] || "";
  if (raw.includes(" ") && firstToken.length > 1) return [];
  const q = firstToken.toLowerCase();
  return commands.filter((cmd) => cmd.command.startsWith(q) || q === "/");
}
