"use strict";

/** In-memory generation runs so Stop can abort through the Vercel→Render proxy. */
const runs = new Map(); // key -> AbortController

function runKey(userId, conversationId) {
  return `${userId}:${conversationId}`;
}

function registerRun(userId, conversationId, controller) {
  const key = runKey(userId, conversationId);
  const prev = runs.get(key);
  if (prev && prev !== controller) {
    try { prev.abort(); } catch { /* ignore */ }
  }
  runs.set(key, controller);
  return key;
}

function clearRun(userId, conversationId, controller) {
  const key = runKey(userId, conversationId);
  if (runs.get(key) === controller) runs.delete(key);
}

function abortRun(userId, conversationId) {
  const key = runKey(userId, conversationId);
  const controller = runs.get(key);
  if (!controller) return false;
  try { controller.abort(); } catch { /* ignore */ }
  runs.delete(key);
  return true;
}

module.exports = { registerRun, clearRun, abortRun, runKey };
