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
