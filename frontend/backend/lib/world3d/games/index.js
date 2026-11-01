"use strict";

/**
 * Oyun odası table games: server-authoritative engines and the table manager.
 * Not wired into sockets yet; see docs/design/3d-world/GAMES_PROTOCOL.md.
 */

module.exports = {
  okey: require("./okey"),
  blackjack: require("./blackjack"),
  tavla: require("./tavla"),
  chess: require("./chess"),
  common: require("./common"),
  ...require("./tables"),
};
