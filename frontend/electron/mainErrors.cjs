'use strict';

/**
 * Main-process error reporting (polish pass). Before, an exception that escaped in main showed
 * Electron's raw "A JavaScript error occurred in the main process" dialog and was never
 * reported; GPU / utility crashes and a hung renderer left no trace. Pure helpers, tested by
 * mainErrors.selftest.mjs.
 */

const MAX_MESSAGE = 300;
const MAX_STACK_LINES = 8;

/** Drop user names and absolute paths (C:\Users\x\..., /Users/x/..., /home/x/...) from text. */
function scrubPaths(text) {
  return String(text || '')
    .replace(/[A-Za-z]:\\(?:[^\\\s:]+\\)*/g, '~\\')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '~')
    .replace(/file:\/\/\/?[^\s)]*\/(?=[^/\s)]+\))/g, '');
}

/** { name, message, stack } safe to log and to forward to the renderer's error reporting. */
function summarizeError(err, kind = 'error') {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err ?? null));
  const stack = String(e.stack || '')
    .split('\n')
    .slice(1, 1 + MAX_STACK_LINES)
    .map((l) => scrubPaths(l.trim()))
    .join('\n');
  return {
    kind: String(kind),
    name: String(e.name || 'Error').slice(0, 60),
    message: scrubPaths(String(e.message || '')).slice(0, MAX_MESSAGE),
    stack,
  };
}

/**
 * Small queue for errors raised before the main window can receive them. send(summary)
 * returns true once delivered; at most `max` are kept.
 */
function createErrorRelay({ max = 10 } = {}) {
  const pending = [];
  let sender = null;
  const flush = () => {
    while (sender && pending.length) {
      if (!sender(pending[0])) return;
      pending.shift();
    }
  };
  return {
    push(summary) {
      pending.push(summary);
      if (pending.length > max) pending.shift();
      flush();
    },
    attach(fn) { sender = typeof fn === 'function' ? fn : null; flush(); },
    size: () => pending.length,
  };
}

module.exports = { scrubPaths, summarizeError, createErrorRelay };
