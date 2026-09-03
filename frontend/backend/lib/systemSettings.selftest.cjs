"use strict";

const {
  DEFAULT_SYSTEM_CONFIG,
  pickConfig,
  mergeSystemConfig,
  applySystemConfigToState,
  loadSystemSettings,
  persistSystemConfig,
} = require("./systemSettings");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const defaults = mergeSystemConfig({});
assert(defaults.maintenanceMode === false, "default maintenance off");
assert(defaults.chatFrozen === false, "default chat unfrozen");
assert(defaults.slowModeSeconds === 0, "default slowmode 0");
assert(defaults.registrationEnabled === true, "default registration on");
assert(defaults.maxMessageLength === 2000, "default max length fills empty UI");
assert(defaults.featureFlags.voice === true, "default voice on");

const picked = pickConfig({
  chatFrozen: true,
  slowModeSeconds: "15",
  maxLoginAttempts: 0,
  evil: "nope",
  featureFlags: { voice: false, extra: 1 },
  profanityWords: ["bad", "bad", "  ", "worse"],
});
assert(picked.chatFrozen === true, "bool persist");
assert(picked.slowModeSeconds === 15, "numeric coerce");
assert(picked.maxLoginAttempts === 1, "min clamp");
assert(picked.evil === undefined, "unknown keys dropped");
assert(picked.featureFlags.voice === false && picked.featureFlags.dm === true, "flags sanitized");
assert(picked.profanityWords.join(",") === "bad,worse", "profanity deduped");

const merged = mergeSystemConfig({ chatFrozen: true });
assert(merged.chatFrozen === true && merged.maintenanceMode === false, "merge keeps defaults");

const state = {
  systemConfig: { ...DEFAULT_SYSTEM_CONFIG },
  profanityWords: new Set(),
};
applySystemConfigToState(state, { chatFrozen: true, profanityWords: ["x"] });
assert(state.systemConfig.chatFrozen === true, "applied to ram");
assert(state.profanityWords.has("x"), "profanity applied");

function mockSettingsClient({ row, insertError, updateError, selectError } = {}) {
  let stored = row;
  return {
    from(table) {
      const ctx = { table, op: "select" };
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        insert(payload) {
          ctx.op = "insert";
          ctx.payload = payload;
          return chain;
        },
        update(payload) {
          ctx.op = "update";
          ctx.payload = payload;
          return chain;
        },
        maybeSingle() { return chain; },
        then(onFulfilled, onRejected) {
          if (ctx.op === "insert") {
            if (insertError) return Promise.resolve({ data: null, error: insertError }).then(onFulfilled, onRejected);
            stored = { id: "default", config: ctx.payload.config || {}, started_at: ctx.payload.started_at };
            return Promise.resolve({ data: stored, error: null }).then(onFulfilled, onRejected);
          }
          if (ctx.op === "update") {
            if (updateError) return Promise.resolve({ data: null, error: updateError }).then(onFulfilled, onRejected);
            stored = { ...(stored || { id: "default" }), config: ctx.payload.config, started_at: (stored && stored.started_at) || "2026-01-01T00:00:00.000Z" };
            return Promise.resolve({ data: stored, error: null }).then(onFulfilled, onRejected);
          }
          if (selectError) return Promise.resolve({ data: null, error: selectError }).then(onFulfilled, onRejected);
          return Promise.resolve({ data: stored || null, error: null }).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}

(async () => {
  const missing = await loadSystemSettings(
    mockSettingsClient({ selectError: { code: "42P01", message: "relation system_settings does not exist" } }),
    { timeoutMs: 200 }
  );
  assert(missing.missingTable === true && missing.config.registrationEnabled === true, "missing table returns defaults");
  assert(missing.startedAt === null, "missing table has no started_at");

  const first = await loadSystemSettings(mockSettingsClient({ row: null }), { timeoutMs: 200 });
  assert(first.startedAt, "first boot stores started_at");
  assert(first.config.chatFrozen === false, "first boot defaults fill UI");

  const loaded = await loadSystemSettings(
    mockSettingsClient({ row: { id: "default", config: { chatFrozen: true, slowModeSeconds: 8 }, started_at: "2026-08-01T00:00:00.000Z" } }),
    { timeoutMs: 200 }
  );
  assert(loaded.config.chatFrozen === true && loaded.config.slowModeSeconds === 8, "stored flags load");
  assert(loaded.startedAt === "2026-08-01T00:00:00.000Z", "started_at preserved");

  const saved = await persistSystemConfig(
    mockSettingsClient({
      row: { id: "default", config: { maintenanceMode: false }, started_at: "2026-08-01T00:00:00.000Z" },
    }),
    { maintenanceMode: true, chatFrozen: true },
    { timeoutMs: 200 }
  );
  assert(saved.persisted === true && saved.config.maintenanceMode === true && saved.config.chatFrozen === true, "patch persists");
  assert(saved.startedAt === "2026-08-01T00:00:00.000Z", "persist does not clobber started_at");

  console.log("systemSettings.selftest.cjs ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
