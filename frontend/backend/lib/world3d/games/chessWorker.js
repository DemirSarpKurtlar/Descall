"use strict";

/** Worker thread entry for the chess bot: runs chessBot.search off the main event loop. */

const { parentPort } = require("worker_threads");
const { search } = require("./chessBot");

parentPort.on("message", (msg) => {
  try {
    const result = search(msg.fen, msg.opts || {});
    parentPort.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, error: String((err && err.message) || err) });
  }
});
