/**
 * Cloudflare Turnstile on every platform (backend lib/turnstile.js has the rules).
 *
 * Where the widget runs:
 *   web (descall.com, www.descall.com)        directly in the page ("direct")
 *   iOS app (descall://localhost), Android app (https://localhost), Electron (descall://app),
 *   Tauri (https://tauri.localhost), any other origin
 *                                             in a small bridge page served by the API
 *                                             (GET /api/turnstile/frame, "bridge"); the
 *                                             token comes back by postMessage. Turnstile
 *                                             checks the hostname of the page that runs it,
 *                                             and app origins cannot be widget hostnames.
 * Cloudflare's test site keys work anywhere, so local development runs "direct".
 *
 * The widget is managed + interaction-only: most people never see it. When Cloudflare
 * wants a click, a small card slides up at the bottom of the screen (fixed, over the form,
 * so nothing on the form moves) in the app's theme and language, with Vazgeç and, after an
 * expiry or error, Tekrar dene. If the widget cannot run at all (blocked script, no
 * network to Cloudflare, unsupported WebView), the request goes out with
 * `turnstileUnavailable: <reason>` and the server's fallback rule decides; sign-up never
 * hangs on the widget.
 *
 * Requests carry `turnstileClient: 1` so the server knows this client can run the check
 * (it then answers 428 turnstile_required instead of spending the fallback budget).
 */
import { httpRequest } from "../../api/http";
import { getLocale } from "../../i18n/runtime.js";
import { humanCheckStrings, turnstileLanguage } from "./humanCheckText.js";

export const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const WEB_HOSTS = Object.freeze(["descall.com", "www.descall.com"]);
/** Origins the bridge page may be served from (the API hosts). */
export const BRIDGE_HOSTS = Object.freeze(["des-call.onrender.com", "api.descall.com", "des-call-staging.onrender.com", "api-staging.descall.com", "pc.descall.com"]);
export const TOKEN_MAX_AGE_MS = 240 * 1000; // Turnstile tokens live 300 s
export const CONFIG_TTL_MS = 5 * 60 * 1000;
export const LOAD_TIMEOUT_MS = 12 * 1000;
export const SILENT_TIMEOUT_MS = 25 * 1000;
export const INTERACTIVE_TIMEOUT_MS = 3 * 60 * 1000;
const timeouts = { load: LOAD_TIMEOUT_MS, silent: SILENT_TIMEOUT_MS, interactive: INTERACTIVE_TIMEOUT_MS };
export const MAX_ERRORS = 3;
const TEST_SITE_KEY_RE = /^[123]x0{20}A[AB]$/;
const HUMAN_CHECK_CODES = new Set(["turnstile_required", "turnstile_failed"]);

/* ---------------- pure helpers (selftested) ---------------- */

/** "direct" on the web hosts (and with Cloudflare's test keys), else "bridge". */
export function pickProvider({ protocol, hostname, siteKey } = {}) {
  if (TEST_SITE_KEY_RE.test(String(siteKey || ""))) return "direct";
  const p = String(protocol || "").toLowerCase();
  const h = String(hostname || "").toLowerCase();
  if ((p === "https:" || p === "http:") && WEB_HOSTS.includes(h)) return "direct";
  return "bridge";
}

/** The bridge URL from the server, accepted only on a known API host (or local dev). */
export function safeBridgeUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    if (u.pathname !== "/api/turnstile/frame") return null;
    if (u.protocol === "https:" && BRIDGE_HOSTS.includes(u.hostname)) return u.origin + u.pathname;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin + u.pathname;
    return null;
  } catch {
    return null;
  }
}

/**
 * What to do with a Turnstile error code: "retry" (Cloudflare retries by itself, count it),
 * or "give_up" with a reason for the server log.
 * 110xxx / 400xxx: configuration (site key, hostname, parameters); 200500: the challenge
 * iframe could not load; 300xxx / 600xxx: challenge failed (retried a few times).
 */
export function classifyError(code) {
  const c = String(code || "");
  if (/^(110|400)\d{3}$/.test(c) || c === "config") return { kind: "give_up", reason: `config:${c}` };
  if (c === "200500" || c === "script") return { kind: "give_up", reason: "script" };
  if (c === "bridge") return { kind: "give_up", reason: "bridge" };
  if (/^(102|103|104|106|120|300|600)\d{3}$/.test(c)) return { kind: "retry", reason: `error:${c}` };
  return { kind: "retry", reason: `error:${c || "unknown"}` };
}

/** The API answered that this request needs (another) human check. */
export function isHumanCheckError(err) {
  return Boolean(err) && HUMAN_CHECK_CODES.has(err.code);
}

/** Light or dark, read from the page (glass scheme first, then data-theme). */
export function documentTheme(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  const root = doc?.documentElement;
  if (!root) return "dark";
  try {
    const scheme = win?.getComputedStyle ? win.getComputedStyle(root).getPropertyValue("--g-scheme").trim() : "";
    if (scheme === "light" || scheme === "dark") return scheme;
  } catch {
    /* no layout yet */
  }
  return root.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function errorWithCode(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/* ---------------- configuration ---------------- */

let configCache = null; // { at, value }
let configLoading = null;
let fetchConfigImpl = () => httpRequest("/api/turnstile/config", { method: "GET" });

/** { enabled, siteKey, mode, actions, bridgeUrl }; { enabled: false } when it cannot be read. */
export async function loadHumanCheckConfig({ fresh = false, now = Date.now() } = {}) {
  if (!fresh && configCache && now - configCache.at < (configCache.value.enabled ? CONFIG_TTL_MS : 30 * 1000)) return configCache.value;
  if (!configLoading) {
    configLoading = Promise.resolve()
      .then(() => fetchConfigImpl())
      .then((raw) => ({
        enabled: Boolean(raw?.enabled && raw?.siteKey),
        siteKey: raw?.siteKey ? String(raw.siteKey) : null,
        mode: raw?.mode || "off",
        actions: raw?.actions && typeof raw.actions === "object" ? raw.actions : {},
        bridgeUrl: safeBridgeUrl(raw?.bridgeUrl),
      }))
      .catch(() => ({ enabled: false, siteKey: null, mode: "off", actions: {}, bridgeUrl: null }))
      .then((value) => {
        configCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        configLoading = null;
      });
  }
  return configLoading;
}

/* ---------------- the card (plain DOM, both shells) ---------------- */

const STYLE_ID = "descall-hc-style";
const CSS = `
.dhc{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);z-index:2147483000;width:min(360px,calc(100vw - 24px));transform:translate(-50%,16px);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1);font:14px/1.45 var(--font-sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)}
.dhc[data-state="open"]{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.dhc[data-state="hidden"]{visibility:visible}
.dhc-card{border-radius:18px;padding:16px 16px 12px;background:rgba(22,24,36,.96);color:#eef0f8;border:1px solid rgba(255,255,255,.10);box-shadow:0 18px 48px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);-webkit-backdrop-filter:blur(28px) saturate(1.4);backdrop-filter:blur(28px) saturate(1.4)}
.dhc[data-look="light"] .dhc-card{background:rgba(250,251,255,.97);color:#15182a;border-color:rgba(20,24,48,.10);box-shadow:0 18px 48px rgba(20,24,48,.18),inset 0 1px 0 rgba(255,255,255,.8)}
.dhc-h{display:flex;align-items:center;gap:10px;margin:0 0 4px;font-weight:650;font-size:15px}
.dhc-ic{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(88,122,245,.18);color:#587af5}
.dhc-b{margin:0 0 12px;opacity:.78;font-size:13px}
.dhc-slot{display:flex;justify-content:center;align-items:center;min-height:65px;width:100%;overflow:hidden;border-radius:10px}
.dhc-slot iframe.dhc-bridge{border:0;width:300px;max-width:100%;height:65px;background:transparent;color-scheme:normal}
.dhc-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;min-height:32px}
.dhc-st{font-size:12px;opacity:.72;min-width:0}
.dhc-st[data-tone="warn"]{opacity:1;color:#f2a93b}
.dhc-btns{display:flex;gap:6px;flex:none}
.dhc-btn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:13px;font-weight:600;border-radius:10px;padding:6px 12px;cursor:pointer;min-height:32px}
.dhc[data-look="light"] .dhc-btn{border-color:rgba(20,24,48,.14);background:rgba(20,24,48,.04)}
.dhc-btn:hover{background:rgba(255,255,255,.12)}
.dhc[data-look="light"] .dhc-btn:hover{background:rgba(20,24,48,.08)}
.dhc-btn.is-p{background:#587af5;border-color:#587af5;color:#fff}
.dhc-btn:focus-visible{outline:2px solid #587af5;outline-offset:2px}
.dhc-btn[hidden]{display:none}
.dhc-fn{margin-top:8px;font-size:11px;opacity:.5;text-align:center}
@media (prefers-reduced-motion: reduce){.dhc{transition:opacity .01s linear;transform:translate(-50%,0)}}
`;

const SHIELD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(el);
}

let cardSeq = 0;

function el(doc, tag, cls, attrs) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

/** One card element per session; removed when the session ends. */
function createCard(doc, { locale, look, onCancel, onRetry }) {
  ensureStyle(doc);
  const s = humanCheckStrings(locale);
  cardSeq += 1;
  const titleId = `dhc-title-${cardSeq}`;
  const root = el(doc, "div", "dhc", {
    "data-state": "hidden",
    "data-look": look,
    role: "dialog",
    "aria-modal": "false",
    "aria-hidden": "true",
    "aria-labelledby": titleId,
    "data-testid": "human-check",
  });
  const card = el(doc, "div", "dhc-card");
  const head = el(doc, "div", "dhc-h");
  const icon = el(doc, "span", "dhc-ic");
  icon.innerHTML = SHIELD_SVG;
  const title = el(doc, "span", "", { id: titleId });
  title.textContent = s.title;
  head.appendChild(icon);
  head.appendChild(title);
  const body = el(doc, "p", "dhc-b");
  body.textContent = s.body;
  const slot = el(doc, "div", "dhc-slot");
  const foot = el(doc, "div", "dhc-f");
  const status = el(doc, "span", "dhc-st", { role: "status", "aria-live": "polite" });
  const btns = el(doc, "span", "dhc-btns");
  const cancelBtn = el(doc, "button", "dhc-btn", { type: "button", "data-act": "cancel" });
  cancelBtn.textContent = s.cancel;
  const retryBtn = el(doc, "button", "dhc-btn is-p", { type: "button", "data-act": "retry" });
  retryBtn.textContent = s.retry;
  retryBtn.hidden = true;
  btns.appendChild(cancelBtn);
  btns.appendChild(retryBtn);
  foot.appendChild(status);
  foot.appendChild(btns);
  const note = el(doc, "div", "dhc-fn");
  note.textContent = s.footnote;
  for (const child of [head, body, slot, foot, note]) card.appendChild(child);
  root.appendChild(card);
  cancelBtn.addEventListener("click", () => onCancel());
  retryBtn.addEventListener("click", () => onRetry());
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  });
  (doc.body || doc.documentElement).appendChild(root);
  return {
    root,
    slot,
    buttons: { cancel: cancelBtn, retry: retryBtn },
    open() {
      if (root.getAttribute("data-state") === "open") return;
      root.setAttribute("data-state", "open");
      root.setAttribute("aria-hidden", "false");
      try {
        cancelBtn.focus({ preventScroll: true });
      } catch {
        /* focus is optional */
      }
    },
    isOpen: () => root.getAttribute("data-state") === "open",
    status(text, tone) {
      status.textContent = text || "";
      if (tone) status.setAttribute("data-tone", tone);
      else status.removeAttribute("data-tone");
    },
    showRetry(on) {
      retryBtn.hidden = !on;
    },
    remove() {
      root.remove();
    },
    strings: s,
  };
}

/* ---------------- widget drivers ---------------- */

let scriptPromise = null;

function loadScript(doc, win, timeoutMs = timeouts.load) {
  if (win.turnstile && typeof win.turnstile.render === "function") return Promise.resolve(win.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = doc.createElement("script");
    el.src = SCRIPT_URL;
    el.async = true;
    el.defer = true;
    const timer = setTimeout(() => reject(errorWithCode("turnstile script timeout", "script")), timeoutMs);
    el.onload = () => {
      // api.js defines window.turnstile synchronously when it runs.
      const poll = (n) => {
        if (win.turnstile && typeof win.turnstile.render === "function") {
          clearTimeout(timer);
          resolve(win.turnstile);
        } else if (n > 40) {
          clearTimeout(timer);
          reject(errorWithCode("turnstile missing", "script"));
        } else setTimeout(() => poll(n + 1), 50);
      };
      poll(0);
    };
    el.onerror = () => {
      clearTimeout(timer);
      reject(errorWithCode("turnstile script failed", "script"));
    };
    (doc.head || doc.documentElement).appendChild(el);
  }).catch((err) => {
    scriptPromise = null; // next attempt may load it (network came back)
    throw err;
  });
  return scriptPromise;
}

function directDriver({ doc, win, slot, siteKey, emit }) {
  let id = null;
  let dead = false;
  return {
    async start({ action, theme, language }) {
      let ts;
      try {
        ts = await loadScript(doc, win);
      } catch {
        if (!dead) emit("error", { code: "script" });
        return;
      }
      if (dead) return;
      const host = doc.createElement("div");
      slot.appendChild(host);
      id = ts.render(host, {
        sitekey: siteKey,
        action,
        theme,
        language,
        appearance: "interaction-only",
        "refresh-expired": "manual",
        "response-field": false,
        callback: (token) => emit("token", { token }),
        "error-callback": (code) => {
          emit("error", { code: String(code || "") });
          return true;
        },
        "expired-callback": () => emit("expired"),
        "timeout-callback": () => emit("timeout"),
        "before-interactive-callback": () => emit("interactive"),
        "after-interactive-callback": () => emit("interactiveDone"),
        "unsupported-callback": () => emit("unsupported"),
      });
    },
    reset() {
      try {
        if (id != null) win.turnstile?.reset(id);
      } catch {
        /* widget gone */
      }
    },
    destroy() {
      dead = true;
      try {
        if (id != null) win.turnstile?.remove(id);
      } catch {
        /* widget gone */
      }
      id = null;
    },
  };
}

function bridgeDriver({ doc, win, slot, bridgeUrl, emit }) {
  const origin = new URL(bridgeUrl).origin;
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let frame = null;
  let opts = null;
  let helloTimer = null;
  let greeted = false;
  const onMessage = (e) => {
    if (e.origin !== origin || !frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || m.type !== "descall-hc" || m.nonce !== nonce) return;
    if (m.event === "hello") {
      greeted = true;
      clearTimeout(helloTimer);
      return;
    }
    emit(m.event, m.data || null);
  };
  const hello = (extra = {}) => {
    try {
      frame?.contentWindow?.postMessage({ type: "descall-hc-hello", nonce, ...opts, ...extra }, origin);
    } catch {
      /* frame gone */
    }
  };
  return {
    start(o) {
      opts = o;
      win.addEventListener("message", onMessage);
      frame = doc.createElement("iframe");
      frame.className = "dhc-bridge";
      frame.title = humanCheckStrings(o.locale).title;
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.addEventListener("load", () => hello());
      helloTimer = setTimeout(() => {
        if (!greeted) emit("error", { code: "bridge" });
      }, timeouts.load);
      frame.src = `${bridgeUrl}?v=1`;
      slot.appendChild(frame);
    },
    reset() {
      hello({ reset: true });
    },
    destroy() {
      clearTimeout(helloTimer);
      win.removeEventListener("message", onMessage);
      frame?.remove();
      frame = null;
    },
  };
}

/* ---------------- sessions ---------------- */

const cachedTokens = new Map(); // action -> { token, at }
const inflight = new Map(); // action -> { promise, prewarm, wantsInteraction }
let active = null;

function takeCached(action, now = Date.now()) {
  const hit = cachedTokens.get(action);
  cachedTokens.delete(action);
  if (hit && now - hit.at < TOKEN_MAX_AGE_MS) return hit.token;
  return null;
}

/**
 * Run the widget once. Resolves { token } or { unavailable: reason }; rejects with
 * code "turnstile_cancelled" when the person closes the card.
 * prewarm: solve silently in the background; if Cloudflare wants a click, stop quietly
 * (the real request shows the card).
 */
function runSession(cfg, action, { prewarm = false, env } = {}) {
  const { doc, win } = env;
  const locale = getLocale();
  const look = documentTheme(doc, win);
  const provider = pickProvider({ protocol: win.location?.protocol, hostname: win.location?.hostname, siteKey: cfg.siteKey });
  if (provider === "bridge" && !cfg.bridgeUrl) return Promise.resolve({ unavailable: "config:bridge" });
  if (win.navigator && win.navigator.onLine === false) return Promise.resolve({ unavailable: "offline" });

  return new Promise((resolve, reject) => {
    let settled = false;
    let errors = 0;
    let silentTimer = null;
    let hardTimer = null;
    let driver = null;
    let card = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(silentTimer);
      clearTimeout(hardTimer);
      try {
        driver?.destroy();
      } catch {
        /* ignore */
      }
      card?.remove();
      if (active && active.finish === stop) active = null;
      fn(value);
    };
    const stop = (reason) => finish(resolve, { unavailable: reason });
    const cancel = () => finish(reject, errorWithCode(card ? card.strings.cancelled : humanCheckStrings(locale).cancelled, "turnstile_cancelled"));

    card = createCard(doc, {
      locale,
      look,
      onCancel: cancel,
      onRetry: () => {
        errors = 0;
        card.showRetry(false);
        card.status(card.strings.working);
        driver.reset();
      },
    });
    active = { finish: stop, cancel };

    const emit = (event, data) => {
      if (settled) return;
      if (event === "token" && data?.token) {
        finish(resolve, { token: String(data.token) });
        return;
      }
      if (event === "interactive") {
        if (prewarm) {
          stop("prewarm_interactive");
          return;
        }
        clearTimeout(silentTimer);
        card.status("");
        card.open();
        return;
      }
      if (event === "interactiveDone") {
        card.status(card.strings.working);
        return;
      }
      if (event === "unsupported") {
        stop("unsupported");
        return;
      }
      if (event === "expired" || event === "timeout") {
        if (!card.isOpen() && !prewarm) card.open();
        if (prewarm) {
          stop("expired");
          return;
        }
        card.status(card.strings.expired, "warn");
        card.showRetry(true);
        return;
      }
      if (event === "error") {
        const c = classifyError(data?.code);
        errors += 1;
        if (c.kind === "give_up" || errors >= MAX_ERRORS || prewarm) {
          stop(c.reason);
          return;
        }
        if (card.isOpen()) {
          card.status(card.strings.failed, "warn");
          card.showRetry(true);
        }
      }
    };

    const opts = { action, theme: look, language: turnstileLanguage(locale), locale };
    driver = provider === "direct"
      ? directDriver({ doc, win, slot: card.slot, siteKey: cfg.siteKey, emit })
      : bridgeDriver({ doc, win, slot: card.slot, bridgeUrl: cfg.bridgeUrl, emit });
    // Without a click Cloudflare answers in a second or two; give up quietly after 25 s.
    silentTimer = setTimeout(() => {
      if (!card.isOpen()) stop("timeout");
    }, timeouts.silent);
    hardTimer = setTimeout(() => stop("timeout"), timeouts.interactive);
    try {
      const started = driver.start(opts);
      if (started && typeof started.catch === "function") started.catch(() => stop("script"));
    } catch {
      stop("script");
    }
  });
}

function defaultEnv() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return { win: window, doc: document };
}

/**
 * Fields for one protected request: { turnstileToken } or { turnstileUnavailable }.
 * Never rejects except when the person cancels (code turnstile_cancelled).
 */
export async function acquireHumanCheck(action, { fresh = false, cfg: given, env = defaultEnv() } = {}) {
  const cfg = given || (await loadHumanCheckConfig());
  if (!cfg.enabled) return {};
  if (!env) return { turnstileUnavailable: "unsupported" };
  if (!fresh) {
    const cached = takeCached(action);
    if (cached) return { turnstileToken: cached };
    const running = inflight.get(action);
    if (running && !running.prewarm) {
      const r = await running.promise;
      if (r.token) {
        // Shared result: the token is single-use, so only one caller may send it.
        const again = takeCached(action);
        if (again) return { turnstileToken: again };
      }
    }
    if (running && running.prewarm) {
      const r = await running.promise.catch(() => ({}));
      const cachedAfter = takeCached(action);
      if (cachedAfter) return { turnstileToken: cachedAfter };
      if (r && r.unavailable && r.unavailable !== "prewarm_interactive" && r.unavailable !== "expired") return { turnstileUnavailable: r.unavailable };
    }
  } else {
    cachedTokens.delete(action);
  }
  if (active && typeof active.finish === "function") active.finish("superseded");
  const promise = runSession(cfg, action, { env });
  inflight.set(action, { promise, prewarm: false });
  try {
    const r = await promise;
    return r.token ? { turnstileToken: r.token } : { turnstileUnavailable: r.unavailable || "missing" };
  } finally {
    if (inflight.get(action)?.promise === promise) inflight.delete(action);
  }
}

/**
 * Solve in the background while the person fills the form (register, forgot password),
 * so the submit does not wait for Cloudflare. Quiet: never shows the card.
 */
export function prewarmHumanCheck(action, { env = defaultEnv() } = {}) {
  if (!env) return;
  loadHumanCheckConfig()
    .then((cfg) => {
      if (!cfg.enabled || cfg.actions?.[action] !== "always") return;
      const hit = cachedTokens.get(action);
      if (hit && Date.now() - hit.at < TOKEN_MAX_AGE_MS) return;
      if (inflight.has(action) || active) return;
      const promise = runSession(cfg, action, { prewarm: true, env }).then((r) => {
        if (r.token) cachedTokens.set(action, { token: r.token, at: Date.now() });
        return r;
      });
      inflight.set(action, { promise, prewarm: true });
      promise.catch(() => {}).finally(() => {
        if (inflight.get(action)?.promise === promise) inflight.delete(action);
      });
    })
    .catch(() => {});
}

/**
 * Send a protected request with the human check.
 *   always: get a token before the first try (register, social sign-up, password reset)
 *   stepUp: try without one; when the server answers turnstile_required /
 *           turnstile_failed, run the check and send once more (sign-in)
 * `send(fields)` must merge `fields` into the JSON body.
 */
export async function runWithHumanCheck(action, send, { always = true } = {}) {
  let cfg = await loadHumanCheckConfig();
  const first = { turnstileClient: 1 };
  if (always && cfg.enabled) Object.assign(first, await acquireHumanCheck(action, { cfg }));
  try {
    return await send(first);
  } catch (err) {
    if (!isHumanCheckError(err) || err.body?.turnstile?.retry === false) throw err;
    if (!cfg.enabled) cfg = await loadHumanCheckConfig({ fresh: true });
    if (!cfg.enabled) throw err;
    const second = { turnstileClient: 1, ...(await acquireHumanCheck(action, { cfg, fresh: true })) };
    return send(second);
  }
}

/** Tests only. */
export function __resetHumanCheckForTests({ fetchConfig, timeouts: t } = {}) {
  Object.assign(timeouts, { load: LOAD_TIMEOUT_MS, silent: SILENT_TIMEOUT_MS, interactive: INTERACTIVE_TIMEOUT_MS }, t || {});
  configCache = null;
  configLoading = null;
  cachedTokens.clear();
  inflight.clear();
  active = null;
  scriptPromise = null;
  if (fetchConfig) fetchConfigImpl = fetchConfig;
}
