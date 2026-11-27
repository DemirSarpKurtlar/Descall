/**
 * Where the share sheet runs.
 *  - android: DescallShareActivity (share target / Direct Share) hosts this page; the
 *    DescallShare plugin hands over the shared items (thumbnails, sizes per quality) and
 *    runs the job in DescallShareWorker (WorkManager: survives closing the sheet, waits for
 *    the network, progress / undo / retry notification).
 *  - web: items from window.__descallSharePayload (tests, future web share target); the job
 *    runs in this page with the JS engine.
 * Both expose the same interface, so the sheet does not care.
 */
import { createShareApi } from "./shareApi.js";
import { createShareEngine } from "./shareEngine.js";
import { reduceJob } from "./shareModel.js";
import { getToken } from "../storage.js";

const HISTORY_KEY = "descall_share_history_v1";
const TARGETS_KEY = "descall_share_targets_v1";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson(key, fallback) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: the sheet still works */
  }
}

export const shareHistory = {
  read: () => readJson(HISTORY_KEY, []),
  write: (h) => writeJson(HISTORY_KEY, h),
};

/** Last /targets answer, so the sheet opens with a list while offline. */
export const targetsCache = {
  read: () => readJson(TARGETS_KEY, null),
  write: (t) => writeJson(TARGETS_KEY, { ...t, cachedAt: Date.now() }),
};

function waitOnline(signal) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || navigator.onLine !== false) return resolve();
    const done = () => {
      window.removeEventListener("online", done);
      signal?.removeEventListener?.("abort", done);
      resolve();
    };
    window.addEventListener("online", done);
    signal?.addEventListener?.("abort", done);
  });
}

function androidPlugin() {
  try {
    const cap = window.Capacitor;
    if (cap?.getPlatform?.() !== "android" || !cap.isPluginAvailable?.("DescallShare")) return null;
    return cap.registerPlugin ? cap.registerPlugin("DescallShare") : cap.Plugins?.DescallShare || null;
  } catch {
    return null;
  }
}

function webHost(api) {
  const engine = createShareEngine({
    api,
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    waitOnline,
  });
  let ctl = null;
  const prepare = async (it, job) => {
    const src = (window.__descallSharePayload?.items || []).find((x) => x.id === it.id);
    return { ...it, file: src?.file || src?.blob || null, name: it.name, quality: job.quality };
  };
  return {
    platform: "web",
    canBackground: false,
    hasSession: () => Boolean(getToken()),
    async getPayload() {
      const p = window.__descallSharePayload || { items: [] };
      return { items: (p.items || []).map(({ file, blob, ...rest }) => rest), sourceLabel: p.sourceLabel || null, preset: p.preset || null };
    },
    async run(job, onUpdate) {
      ctl = new AbortController();
      return engine.run(job, { emit: onUpdate, signal: ctl.signal, prepare });
    },
    cancel() {
      ctl?.abort();
    },
    async undo(job) {
      return engine.undo(job);
    },
    async retry(job, onUpdate) {
      return this.run(reduceJob(job, { type: "retry" }), onUpdate);
    },
    async dropFailed(job) {
      return reduceJob(job, { type: "dropFailed" });
    },
    async saveDraft() {
      return false;
    },
    retryNow() {
      // Wakes the engine's wait; it re-checks the network and waits again if still offline.
      window.dispatchEvent(new Event("online"));
    },
    async remove() {
      ctl?.abort();
    },
    finish() {
      if (window.history.length > 1) window.history.back();
      else window.location.assign("/");
    },
    openApp(url) {
      // descall://dm/<name> → the same route inside the web app.
      const m = /^descall:\/\/(.+)$/.exec(String(url || ""));
      const path = m ? m[1] : "";
      if (path.startsWith("dm/")) window.location.assign(`/?dm=${path.slice(3)}`);
      else window.location.assign("/");
    },
    publishDirectShare() {},
    async watch() {},
  };
}

function androidHost(plugin, api) {
  let listener = null;
  let current = null;
  const attach = async (onUpdate) => {
    try { await listener?.remove?.(); } catch { /* ignore */ }
    listener = await plugin.addListener("job", (ev) => {
      if (!ev?.job || (current && ev.job.id !== current)) return;
      onUpdate?.(ev.job, ev.event || null);
    });
  };
  // A running job's final snapshot resolves run(); the worker keeps going if the page closes.
  const waitEnd = (id) => new Promise((resolve) => {
    let h = null;
    plugin.addListener("job", (ev) => {
      if (ev?.job?.id !== id || !ev.final) return;
      h?.remove?.();
      resolve(ev.job);
    }).then((x) => { h = x; });
  });
  return {
    platform: "android",
    canBackground: true,
    hasSession: () => Boolean(getToken()),
    async getPayload() {
      const p = await plugin.getPayload();
      return { items: p?.items || [], sourceLabel: p?.sourceLabel || null, preset: p?.preset || null, job: p?.job || null };
    },
    /** Opened from the notification ("Ayrıntılar"): follow that job's snapshots. */
    async watch(job, onUpdate) {
      current = job.id;
      await attach(onUpdate);
    },
    async run(job, onUpdate) {
      current = job.id;
      await attach(onUpdate);
      const end = waitEnd(job.id);
      await plugin.start({ job, apiBase: api.base(), token: getToken() || "" });
      return end;
    },
    cancel() { if (current) plugin.cancel({ id: current }).catch(() => {}); },
    async undo(job) {
      const r = await plugin.undo({ id: job.id });
      return { job: r?.job || reduceJob(job, { type: "undone" }), failed: Number(r?.failed) || 0 };
    },
    async retry(job, onUpdate) {
      current = job.id;
      await attach(onUpdate);
      const end = waitEnd(job.id);
      await plugin.retry({ id: job.id });
      return end;
    },
    async dropFailed(job) {
      const r = await plugin.dropFailed({ id: job.id });
      return r?.job || reduceJob(job, { type: "dropFailed" });
    },
    async saveDraft(job) {
      await plugin.saveDraft({ id: job.id });
      return true;
    },
    async remove(job) { await plugin.remove({ id: job.id }).catch(() => {}); },
    retryNow(job) { plugin.retryNow({ id: job.id }).catch(() => {}); },
    finish() { plugin.finish().catch(() => {}); },
    openApp(url) { plugin.openApp({ url }).catch(() => {}); },
    publishDirectShare(targets) { plugin.publishDirectShare({ targets }).catch(() => {}); },
  };
}

export function createShareHost({ api } = {}) {
  const client = api || createShareApi();
  const plugin = androidPlugin();
  return { api: client, ...(plugin ? androidHost(plugin, client) : webHost(client)) };
}
