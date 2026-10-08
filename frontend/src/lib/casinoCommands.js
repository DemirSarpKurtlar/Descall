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
export function casinoHiddenOnThisDevice() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}
