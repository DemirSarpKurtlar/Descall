import assert from "node:assert/strict";
import { isCasinoChatMessage, isCasinoEmbed } from "./casinoCommands.js";

assert.equal(isCasinoChatMessage({ isGameMessage: true, type: "game_bj" }), true);
assert.equal(isCasinoChatMessage({ type: "game_slot", text: "spin" }), true);
assert.equal(isCasinoChatMessage({ text: "/bj 50" }), true);
assert.equal(isCasinoChatMessage({ content: "/coinflip 10" }), true);
assert.equal(isCasinoChatMessage({ type: "app_help", embed: { title: "Blackjack" } }), false);
assert.equal(
  isCasinoChatMessage({
    type: "app_command",
    embed: { title: "Blackjack", description: "You won" },
  }),
  true
);
assert.equal(isCasinoEmbed({ title: "Hello", description: "a normal note" }, "app_user"), false);
assert.equal(isCasinoChatMessage({ text: "want to play later?" }), false);

console.log("casinoCommands.selftest ok");
