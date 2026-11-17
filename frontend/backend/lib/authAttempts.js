"use strict";

/**
 * Per-account, per-purpose code guesses. The count lives in
 * auth_code_attempts and is NOT cleared when a new code is emailed.
 * A rolling hour opens a fresh window. Memory is the fallback when the
 * table is missing (tests, or a database that has not migrated yet).
 */

const supabase = require("../db/supabase");

const WINDOW_MS = 60 * 60 * 1000;
const memory = new Map();
let useMemory = false;

function keyOf(userId, purpose) {
  return `${userId}:${purpose}`;
}

function readMemory(userId, purpose, now) {
  const row = memory.get(keyOf(userId, purpose));
  if (!row || now - row.windowStart >= WINDOW_MS) return 0;
  return row.attempts;
}

function writeMemory(userId, purpose, attempts, now) {
  const key = keyOf(userId, purpose);
  const prev = memory.get(key);
  const windowStart = prev && now - prev.windowStart < WINDOW_MS ? prev.windowStart : now;
  memory.set(key, { attempts, windowStart });
}

async function readRow(userId, purpose) {
  if (useMemory) return null;
  const { data, error } = await supabase
    .from("auth_code_attempts")
    .select("attempts, window_start")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) {
    useMemory = true;
    return null;
  }
  return data;
}

async function getCodeAttempts(userId, purpose, now = Date.now()) {
  if (useMemory) return readMemory(userId, purpose, now);
  try {
    const row = await readRow(userId, purpose);
    if (useMemory || !row) return readMemory(userId, purpose, now);
    const start = new Date(row.window_start).getTime();
    if (!Number.isFinite(start) || now - start >= WINDOW_MS) return 0;
    return Number(row.attempts) || 0;
  } catch {
    useMemory = true;
    return readMemory(userId, purpose, now);
  }
}

async function bumpCodeAttempts(userId, purpose, now = Date.now()) {
  const current = await getCodeAttempts(userId, purpose, now);
  const next = current + 1;
  if (useMemory) {
    writeMemory(userId, purpose, next, now);
    return next;
  }
  const existing = await readRow(userId, purpose);
  if (useMemory) {
    writeMemory(userId, purpose, next, now);
    return next;
  }
  const startMs = existing?.window_start ? new Date(existing.window_start).getTime() : 0;
  const fresh = !existing || !Number.isFinite(startMs) || now - startMs >= WINDOW_MS;
  const attempts = fresh ? 1 : next;
  const windowStart = fresh ? new Date(now).toISOString() : existing.window_start;
  if (!existing || fresh) {
    if (existing && fresh) {
      await supabase
        .from("auth_code_attempts")
        .update({ attempts, window_start: windowStart })
        .eq("user_id", userId)
        .eq("purpose", purpose);
    } else {
      const { error } = await supabase.from("auth_code_attempts").insert({
        user_id: userId,
        purpose,
        attempts,
        window_start: windowStart,
      });
      if (error) {
        useMemory = true;
        writeMemory(userId, purpose, attempts, now);
      }
    }
    return attempts;
  }
  const { error } = await supabase
    .from("auth_code_attempts")
    .update({ attempts })
    .eq("user_id", userId)
    .eq("purpose", purpose);
  if (error) {
    useMemory = true;
    writeMemory(userId, purpose, attempts, now);
  }
  return attempts;
}

async function clearCodeAttempts(userId, purpose) {
  memory.delete(keyOf(userId, purpose));
  if (useMemory) return;
  const { error } = await supabase
    .from("auth_code_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("purpose", purpose);
  if (error) useMemory = true;
}

/**
 * Minutes until a locked code (MAX_ATTEMPTS wrong guesses in the rolling hour) can be
 * tried again, or 0 when it is not locked. Callers must not email a new code while
 * this is above 0: the new code would be refused too.
 */
async function codeLockMinutes(userId, purpose, now = Date.now()) {
  const { MAX_ATTEMPTS } = require("./authCodes");
  const attempts = await getCodeAttempts(userId, purpose, now);
  if (attempts < MAX_ATTEMPTS) return 0;
  let start = null;
  if (useMemory) {
    start = memory.get(keyOf(userId, purpose))?.windowStart ?? null;
  } else {
    try {
      const row = await readRow(userId, purpose);
      start = useMemory ? memory.get(keyOf(userId, purpose))?.windowStart ?? null : row ? new Date(row.window_start).getTime() : null;
    } catch {
      start = null;
    }
  }
  const left = Number.isFinite(start) ? WINDOW_MS - (now - start) : WINDOW_MS;
  return Math.max(1, Math.ceil(left / 60000));
}

function resetAttemptMemory() {
  memory.clear();
  useMemory = false;
}

module.exports = {
  WINDOW_MS,
  getCodeAttempts,
  bumpCodeAttempts,
  clearCodeAttempts,
  codeLockMinutes,
  resetAttemptMemory,
};
