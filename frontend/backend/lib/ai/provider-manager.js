"use strict";

const supabase = require("../../db/supabase");
const gemini = require("./gemini");
const groq = require("./groq");
const { decryptSecret, secretParts } = require("./cryptoKeys");
const { preferredProviderForTier, providerSupportsAgentTools, normalizeTier } = require("./modelTiers");
const { logInternal } = require("./sanitize");

function inferProvider(label, apiKey) {
  const raw = String(apiKey || "");
  const lab = String(label || "").toLowerCase();
  if (raw.startsWith("gsk_")) return "groq";
  if (lab.includes("groq")) return "groq";
  return "gemini";
}

function driverFor(provider) {
  return provider === "groq" ? groq : gemini;
}

const sticky = { keyId: null };
/** In-memory demotion after hard failures (auth/quota). Cleared on process restart. */
const coolUntil = new Map(); // keyId -> epoch ms

const COOLDOWN_MS = {
  auth: 15 * 60 * 1000,
  quota: 20 * 1000,
  unavailable: 30 * 1000,
  error: 30 * 1000,
};

function envKeyEntries() {
  const found = [];
  const seen = new Set();
  const push = (raw, label) => {
    const key = String(raw || "").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const parts = secretParts(key);
    found.push({
      id: `env:${label}`,
      source: "environment",
      label,
      apiKey: key,
      enabled: true,
      is_preferred: found.length === 0,
      failover_order: 1000 + found.length,
      mask: parts.mask,
      key_prefix: parts.prefix,
      key_suffix: parts.suffix,
      last_ok_at: null,
      last_error_at: null,
    });
  };
  push(process.env.GEMINI_API_KEY, "GEMINI_API_KEY");
  for (let i = 1; i <= 20; i += 1) {
    push(process.env[`GEMINI_API_KEY_${i}`], `GEMINI_API_KEY_${i}`);
  }
  push(process.env.GROQ_API_KEY, "GROQ_API_KEY");
  for (let i = 1; i <= 10; i += 1) {
    push(process.env[`GROQ_API_KEY_${i}`], `GROQ_API_KEY_${i}`);
  }
  return found.map((k) => ({ ...k, provider: inferProvider(k.label, k.apiKey) }));
}

async function loadDbKeys() {
  const { data, error } = await supabase
    .from("dimaai_provider_keys")
    .select(
      "id,label,provider,encrypted_secret,enabled,is_preferred,failover_order,key_prefix,key_suffix,last_ok_at,last_error_at,last_error",
    )
    .order("is_preferred", { ascending: false })
    .order("failover_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    logInternal("keys-load", error);
    return [];
  }
  const out = [];
  for (const row of data || []) {
    try {
      const apiKey = decryptSecret(row.encrypted_secret);
      out.push({
        id: row.id,
        source: "database",
        label: row.label,
        provider: row.provider || inferProvider(row.label, apiKey),
        apiKey,
        enabled: row.enabled !== false,
        is_preferred: Boolean(row.is_preferred),
        failover_order: row.failover_order ?? 100,
        mask: `${row.key_prefix || ""}...${row.key_suffix || ""}`,
        key_prefix: row.key_prefix,
        key_suffix: row.key_suffix,
        last_ok_at: row.last_ok_at || null,
        last_error_at: row.last_error_at || null,
        last_error: row.last_error || null,
      });
    } catch (err) {
      logInternal("keys-decrypt", err, { status: 0 });
    }
  }
  return out;
}

function isCooling(keyId) {
  const until = coolUntil.get(keyId);
  if (!until) return false;
  if (Date.now() >= until) {
    coolUntil.delete(keyId);
    return false;
  }
  return true;
}

function markCooldown(key, code) {
  if (!key?.id) return;
  const ms = COOLDOWN_MS[code] || COOLDOWN_MS.error;
  coolUntil.set(key.id, Date.now() + ms);
}

/** DB last_error age windows before admin treats a key as available again / before auto-revive. */
const REVIVE_WINDOW_MS = {
  quota: 60 * 1000,
  unavailable: 45 * 1000,
  error: 90 * 1000,
  // auth: never auto-revive
};

const FAILING_WINDOW_MS = {
  quota: 60 * 1000,
  unavailable: 45 * 1000,
  error: 90 * 1000,
  auth: 30 * 60 * 1000,
};

function normalizeErrorCode(raw) {
  const c = String(raw || "error").toLowerCase().trim();
  if (c === "auth" || c === "quota" || c === "unavailable" || c === "error" || c === "request") {
    return c;
  }
  if (c.includes("quota") || c.includes("429")) return "quota";
  if (c.includes("auth") || c.includes("401") || c.includes("403")) return "auth";
  if (c.includes("unavailable") || c.includes("503") || c.includes("502") || c.includes("504")) {
    return "unavailable";
  }
  return "error";
}

function reviveWindowMs(code) {
  const c = normalizeErrorCode(code);
  if (c === "auth") return null; // do not auto-revive auth failures
  return REVIVE_WINDOW_MS[c] || REVIVE_WINDOW_MS.error;
}

function failingWindowMs(code) {
  const c = normalizeErrorCode(code);
  return FAILING_WINDOW_MS[c] || FAILING_WINDOW_MS.error;
}

/**
 * True while last_error is still within the error-aware failing window
 * (and not superseded by a newer last_ok_at).
 */
function isRecentlyFailing(row) {
  if (!row?.last_error_at) return false;
  const errAt = new Date(row.last_error_at).getTime();
  if (!Number.isFinite(errAt)) return false;
  if (row.last_ok_at && new Date(row.last_ok_at).getTime() > errAt) return false;
  const age = Date.now() - errAt;
  return age < failingWindowMs(row.last_error);
}

function reviveAfterMs(row) {
  if (!row?.last_error_at) return 0;
  const errAt = new Date(row.last_error_at).getTime();
  if (!Number.isFinite(errAt)) return 0;
  if (row.last_ok_at && new Date(row.last_ok_at).getTime() > errAt) return 0;
  const windowMs = failingWindowMs(row.last_error);
  return Math.max(0, errAt + windowMs - Date.now());
}

function keyReviveMeta(row, keyId) {
  const ms = reviveAfterMs(row);
  const errAt = row?.last_error_at ? new Date(row.last_error_at).getTime() : NaN;
  const windowMs = failingWindowMs(row?.last_error);
  const reviveAfterAt =
    Number.isFinite(errAt) && row?.last_error_at && !(row.last_ok_at && new Date(row.last_ok_at).getTime() > errAt)
      ? new Date(errAt + windowMs).toISOString()
      : null;
  const coolMs = keyId ? remainingCoolMs(keyId) : 0;
  const cooldownUntil = coolMs > 0 ? new Date(Date.now() + coolMs).toISOString() : reviveAfterAt;
  return {
    reviveAfterAt,
    msUntilRevive: ms,
    cooldownUntil,
  };
}

let lastReviveSweepAt = 0;
const REVIVE_SWEEP_MIN_MS = 30 * 1000;
let reviveSchedulerStarted = false;

/**
 * Proactively ping DB keys whose last_error is past the revive window so
 * last_error clears without requiring Admin → Test.
 */
async function reviveEligibleKeys({ limit = 3, signal } = {}) {
  const now = Date.now();
  if (now - lastReviveSweepAt < REVIVE_SWEEP_MIN_MS) {
    return { revived: 0, failed: 0, skipped: true };
  }
  lastReviveSweepAt = now;

  const db = (await loadDbKeys()).filter((k) => k.enabled && k.apiKey && k.last_error);
  const eligible = [];
  for (const key of db) {
    if (isCooling(key.id)) continue;
    const errAt = key.last_error_at ? Date.parse(key.last_error_at) : 0;
    if (!errAt) continue;
    if (key.last_ok_at && Date.parse(key.last_ok_at) > errAt) continue;
    const windowMs = reviveWindowMs(key.last_error);
    if (windowMs == null) continue; // auth — never auto-revive
    if (now - errAt < windowMs) continue;
    eligible.push(key);
  }

  const toPing = eligible.slice(0, Math.max(0, Number(limit) || 0));
  let revived = 0;
  let failed = 0;
  for (const key of toPing) {
    if (signal?.aborted) break;
    try {
      await pingWithKey(key.apiKey, signal, key.provider);
      coolUntil.delete(key.id);
      await markKeyResult(key, { ok: true });
      revived += 1;
      logInternal("key-revive", {
        message: `revived key ${String(key.id).slice(0, 8)} (${key.provider || "unknown"})`,
      });
    } catch (err) {
      if (err?.code === "aborted") throw err;
      failed += 1;
      await markKeyResult(key, { ok: false, errorText: err.code || "error" });
      markCooldown(key, err.code);
      logInternal("key-revive-fail", {
        message: `revive failed (${err.code || "error"}) for ${String(key.id).slice(0, 8)}`,
      });
    }
  }
  return { revived, failed, skipped: false, attempted: toPing.length };
}

function startKeyReviveScheduler() {
  if (reviveSchedulerStarted) return;
  reviveSchedulerStarted = true;
  setInterval(() => {
    reviveEligibleKeys({ limit: 4 }).catch((err) => {
      logInternal("key-revive", err);
    });
  }, 60 * 1000);
}

function remainingCoolMs(keyId) {
  const until = coolUntil.get(keyId);
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

function maxRemainingCoolMs(keyIds) {
  let max = 0;
  for (const id of keyIds || []) {
    max = Math.max(max, remainingCoolMs(id));
  }
  return max;
}

/** Abort-aware sleep. Rejects with code "aborted" if signal fires. */
function sleep(ms, signal) {
  const wait = Math.max(0, Number(ms) || 0);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.code = "aborted";
      reject(err);
      return;
    }
    let timer = null;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      const err = new Error("aborted");
      err.code = "aborted";
      reject(err);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, wait);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function sortPool(keys) {
  return [...keys].sort((a, b) => {
    const aCool = isCooling(a.id) ? 1 : 0;
    const bCool = isCooling(b.id) ? 1 : 0;
    if (aCool !== bCool) return aCool - bCool;
    if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
    // Prefer keys that worked recently over ones that errored recently.
    const aErr = a.last_error_at ? Date.parse(a.last_error_at) || 0 : 0;
    const bErr = b.last_error_at ? Date.parse(b.last_error_at) || 0 : 0;
    if (aErr !== bErr) return aErr - bErr; // older/no error first
    const aOk = a.last_ok_at ? Date.parse(a.last_ok_at) || 0 : 0;
    const bOk = b.last_ok_at ? Date.parse(b.last_ok_at) || 0 : 0;
    if (aOk !== bOk) return bOk - aOk;
    return (a.failover_order || 100) - (b.failover_order || 100);
  });
}

async function getKeyPool({ skipRevive = false } = {}) {
  // Cheap background revive (throttled). Chat failover may await its own sweep.
  if (!skipRevive) {
    void reviveEligibleKeys({ limit: 2 }).catch((err) => logInternal("key-revive", err));
  }
  const db = (await loadDbKeys()).filter((k) => k.enabled && k.apiKey);
  const env = envKeyEntries();
  const dbSuffixes = new Set(db.map((k) => k.key_suffix));
  const extraEnv = env.filter((k) => !dbSuffixes.has(k.key_suffix));
  let pool = sortPool([...db, ...extraEnv]);
  // Sticky preferred only if not cooling.
  if (sticky.keyId && !isCooling(sticky.keyId)) {
    const idx = pool.findIndex((k) => k.id === sticky.keyId);
    if (idx > 0) {
      const [hit] = pool.splice(idx, 1);
      pool.unshift(hit);
    }
  }
  // If every key is cooling, still try them (better than hard fail).
  const warm = pool.filter((k) => !isCooling(k.id));
  if (warm.length) pool = [...warm, ...pool.filter((k) => isCooling(k.id))];
  return pool;
}

async function markKeyResult(key, { ok, errorText }) {
  if (!key || key.source !== "database") return;
  const patch = { updated_at: new Date().toISOString() };
  if (ok) {
    patch.last_ok_at = new Date().toISOString();
    patch.last_error = null;
  } else {
    patch.last_error_at = new Date().toISOString();
    patch.last_error = String(errorText || "unavailable").slice(0, 180);
  }
  const { error } = await supabase.from("dimaai_provider_keys").update(patch).eq("id", key.id);
  if (error) logInternal("keys-mark", error);
}

/**
 * Rotate to the next key on auth, quota (429), unavailable/5xx.
 * Do not rotate to another key of the SAME provider on pure client/schema "request" (400) —
 * the same payload would fail again. Cross-provider fallback is handled separately.
 */
function shouldFailover(code) {
  return code === "unavailable" || code === "auth" || code === "quota" || code === "error";
}

function shouldSkipSameProvider(code) {
  return code === "request";
}

/**
 * Complete with sticky key + health-aware pool.
 * Failover on auth/quota/unavailable before any tokens stream to the client.
 */
async function completeWithFailover({
  messages,
  signal,
  onToken,
  onThought,
  userId,
  locale,
  modelTier,
  customInstructions,
  memoryBlock,
  memoryEnabled,
  nsfwMode,
  agentEnabled,
  conversationId,
  io,
  onPendingAction,
}) {
  const prefer = preferredProviderForTier(modelTier, { agentEnabled: Boolean(agentEnabled) });
  const tierId = normalizeTier(modelTier);
  const keyProvider = (k) => k.provider || inferProvider(k.label, k.apiKey);

  let pool = await getKeyPool({ skipRevive: true });
  const matchingPreview = pool.filter((k) => keyProvider(k) === prefer);
  const preferAllStaleQuota =
    matchingPreview.length > 0 &&
    matchingPreview.every((k) => {
      if (!k.last_error || !k.last_error_at) return false;
      if (k.last_ok_at && Date.parse(k.last_ok_at) > Date.parse(k.last_error_at)) return false;
      return normalizeErrorCode(k.last_error) === "quota";
    });

  if (preferAllStaleQuota) {
    // Await a quick revive sweep so chat does not keep treating cooled keys as dead.
    try {
      await Promise.race([
        reviveEligibleKeys({ limit: 2, signal }),
        sleep(2000).catch(() => {}),
      ]);
    } catch (err) {
      if (err?.code === "aborted") throw err;
    }
    pool = await getKeyPool({ skipRevive: true });
  } else {
    void reviveEligibleKeys({ limit: 2 }).catch((err) => logInternal("key-revive", err));
  }

  if (!pool.length) {
    const err = new Error("no_keys");
    err.code = "no_keys";
    throw err;
  }

  const matching = pool.filter((k) => keyProvider(k) === prefer);
  const rest = pool.filter((k) => keyProvider(k) !== prefer);
  // Prefer the tier's provider, then fall back across the rest of the pool.
  const ordered = matching.length ? [...matching, ...rest] : pool;

  const tryOrdered = async () => {
    let lastErr = null;
    let loggedCrossProvider = false;
    const tried = [];
    for (let i = 0; i < ordered.length; i += 1) {
      const key = ordered[i];
      const provider = keyProvider(key);
      if (Boolean(agentEnabled) && !providerSupportsAgentTools(provider)) {
        continue;
      }
      if (matching.length && provider !== prefer && !loggedCrossProvider) {
        loggedCrossProvider = true;
        logInternal("failover", {
          message: `cross-provider fallback: preferred ${prefer} exhausted; trying ${provider} (tier ${tierId})`,
        });
      }
      let streamed = false;
      try {
        const driver = driverFor(provider);
        const result = await driver.complete({
          apiKey: key.apiKey,
          messages,
          signal,
          onToken: (chunk) => {
            streamed = true;
            onToken?.(chunk);
          },
          onThought: (chunk) => {
            streamed = true;
            onThought?.(chunk);
          },
          userId,
          locale,
          modelTier,
          customInstructions,
          memoryBlock,
          memoryEnabled,
          nsfwMode,
          agentEnabled: Boolean(agentEnabled),
          conversationId,
          io,
          onPendingAction,
        });
        sticky.keyId = key.id;
        coolUntil.delete(key.id);
        await markKeyResult(key, { ok: true });
        return { ok: true, result, tried };
      } catch (err) {
        if (err?.code === "aborted") throw err;
        lastErr = err;
        tried.push({ key, code: err.code || "error" });
        await markKeyResult(key, { ok: false, errorText: err.code || "error" });
        markCooldown(key, err.code);

        // Mid-stream failure: cannot safely retry another key (client already saw tokens).
        if (streamed) throw err;

        if (shouldSkipSameProvider(err.code)) {
          while (i + 1 < ordered.length && keyProvider(ordered[i + 1]) === provider) {
            i += 1;
          }
          if (i + 1 >= ordered.length) throw err;
          if (sticky.keyId === key.id) sticky.keyId = null;
          logInternal("failover", {
            message: `key failed (request); skipping same provider, trying next (${i + 1}/${ordered.length})`,
          });
          continue;
        }

        if (!shouldFailover(err.code)) throw err;

        if (sticky.keyId === key.id) sticky.keyId = null;
        logInternal("failover", {
          message: `key failed (${err.code || "error"}); trying next (${i + 1}/${ordered.length})`,
        });
      }
    }
    if (Boolean(agentEnabled) && !lastErr) {
      lastErr = new Error("unavailable");
      lastErr.code = "unavailable";
    }
    return { ok: false, lastErr, tried };
  };

  const first = await tryOrdered();
  if (first.ok) return first.result;

  const lastErr = first.lastErr || new Error("unavailable");
  if (!shouldFailover(lastErr.code)) throw lastErr;

  // One deferred second pass: wait briefly so quota/unavailable keys can recover.
  const remaining = maxRemainingCoolMs((first.tried || []).map((t) => t.key?.id).filter(Boolean));
  const waitMs = Math.min(20000, remaining > 0 ? remaining : 8000);
  logInternal("deferred-retry", {
    message: `pool exhausted (${lastErr.code || "error"}); waiting ${waitMs}ms then retrying keys once`,
  });
  await sleep(waitMs, signal);

  for (const entry of first.tried || []) {
    const code = entry.code;
    if ((code === "quota" || code === "unavailable") && entry.key?.id) {
      coolUntil.delete(entry.key.id);
    }
  }

  const second = await tryOrdered();
  if (second.ok) return second.result;
  throw second.lastErr || lastErr;
}

async function pingWithKey(apiKey, signal, provider) {
  const p = provider || inferProvider("", apiKey);
  return driverFor(p).pingKey(apiKey, signal);
}

module.exports = {
  envKeyEntries,
  getKeyPool,
  completeWithFailover,
  pingWithKey,
  markKeyResult,
  shouldFailover,
  shouldSkipSameProvider,
  inferProvider,
  reviveEligibleKeys,
  startKeyReviveScheduler,
  isRecentlyFailing,
  keyReviveMeta,
  reviveAfterMs,
  failingWindowMs,
  reviveWindowMs,
  normalizeErrorCode,
  remainingCoolMs,
};
