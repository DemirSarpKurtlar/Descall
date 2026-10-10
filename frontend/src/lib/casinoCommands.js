/** Slash names handled by the casino socket, not inserted as chat rows. */
const CASINO_COMMANDS = new Set([
  "bj",
  "blackjack",
  "hit",
  "stand",
  "stay",
  "double",
  "slot",
  "coinflip",
  "cf",
  "pay",
  "send",
  "gonder",
  "tip",
  "credits",
  "bakiye",
  "balance",
  "top",
  "lider",
  "help",
  "yardım",
  "commands",
  "jb",
  "daily",
]);

export function isCasinoSlash(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  if (!trimmed.startsWith("/")) return false;
  const name = trimmed.slice(1).split(/\s+/)[0];
  return CASINO_COMMANDS.has(name);
}

/** Casino game / credit commands (excludes the shared /help aliases). */
const CASINO_GAME_COMMANDS = new Set(
  [...CASINO_COMMANDS].filter((name) => !["help", "yardım", "commands"].includes(name))
);

export function isCasinoGameCommandName(name) {
  return CASINO_GAME_COMMANDS.has(String(name || "").replace(/^\//, "").toLowerCase());
}

/**
 * Casino games, casino slash commands and their results are not shown in the
 * native iOS app (App Review: simulated gambling). Uses window.Capacitor so
 * this stays importable from Node selftests.
 */
const CASINO_EMBED_RE = /\b(blackjack|coin\s*flip|slot)\b|\/(?:bj|blackjack|slot|coinflip)\b/i;

/** True for a slash-command embed that is a casino result. Help embeds are excluded. */
export function isCasinoEmbed(embed, type) {
  const kind = String(type || "");
  if (kind === "app_help") return false;
  if (!embed || typeof embed !== "object") return false;
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const blob = [embed.title, embed.description, embed.footer?.text]
    .concat(fields.map((f) => `${f?.name || ""} ${typeof f?.value === "string" ? f.value : ""}`))
    .join("\n");
  return CASINO_EMBED_RE.test(blob);
}

/**
 * Chat row that would show a casino board, a casino slash, or a casino result embed.
 * app_help is not a casino message; its command list is filtered separately.
 */
export function isCasinoChatMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.isGameMessage || message.gameData) return true;
  const type = String(message.type || "");
  const appType = String(message.appType || "");
  if (type.startsWith("game_") || appType.startsWith("game_")) return true;
  if (isCasinoSlash(message.text) || isCasinoSlash(message.content)) return true;
  if (type === "app_help" || appType === "app_help") return false;
  return isCasinoEmbed(message.embed, appType || type);
}

export function casinoHiddenOnThisDevice() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}
