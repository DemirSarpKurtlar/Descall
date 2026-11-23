// node src/lib/humanCheck/turnstileClient.selftest.mjs
// Cloudflare Turnstile on the client (lib/humanCheck/turnstileClient.js + api/auth.js):
// which provider each platform uses (web direct, iOS / Android / Electron / Tauri bridge),
// the bridge URL allow list, error classification, token acquisition through a fake
// widget (silent pass, interactive card, cancel, give-up -> turnstileUnavailable, prewarm),
// the bridge handshake (origin + nonce), the retry on turnstile_required, sign-in step-up,
// and the card strings in all seven languages. A tiny fake DOM stands in for the browser.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "hc-"));
const J = (p) => JSON.stringify(join(src, p));
const entry = `
export * as hc from ${J("lib/humanCheck/turnstileClient.js")};
export * as text from ${J("lib/humanCheck/humanCheckText.js")};
export * as auth from ${J("api/auth.js")};
export { setRuntimeLocale } from ${J("i18n/runtime.js")};
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "js" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  logLevel: "silent",
  plugins: [
    {
      name: "stubs",
      setup(b) {
        // The HTTP layer is replaced by a scripted fake (globalThis.__http).
        b.onResolve({ filter: /(^|\/)api\/http(\.js)?$|^\.\/http$/ }, () => ({ path: "http", namespace: "stub" }));
        b.onLoad({ filter: /^http$/, namespace: "stub" }, () => ({
          contents: "export function httpRequest(path, opts) { return globalThis.__http(path, opts); }",
          loader: "js",
        }));
      },
    },
  ],
});
const { hc, text, auth, setRuntimeLocale } = await import(pathToFileURL(file).href);
setRuntimeLocale("tr");
rmSync(out, { recursive: true, force: true });

/* ---------------- pure helpers ---------------- */

assert.equal(hc.pickProvider({ protocol: "https:", hostname: "descall.com", siteKey: "0x4AAA" }), "direct", "web runs the widget directly");
assert.equal(hc.pickProvider({ protocol: "https:", hostname: "www.descall.com", siteKey: "0x4AAA" }), "direct");
assert.equal(hc.pickProvider({ protocol: "descall:", hostname: "localhost", siteKey: "0x4AAA" }), "bridge", "iOS app (descall://localhost)");
assert.equal(hc.pickProvider({ protocol: "capacitor:", hostname: "localhost", siteKey: "0x4AAA" }), "bridge", "old iOS shell");
assert.equal(hc.pickProvider({ protocol: "https:", hostname: "localhost", siteKey: "0x4AAA" }), "bridge", "Android app (https://localhost)");
assert.equal(hc.pickProvider({ protocol: "descall:", hostname: "app", siteKey: "0x4AAA" }), "bridge", "Electron (descall://app)");
assert.equal(hc.pickProvider({ protocol: "https:", hostname: "tauri.localhost", siteKey: "0x4AAA" }), "bridge", "Tauri (https://tauri.localhost)");
assert.equal(hc.pickProvider({ protocol: "tauri:", hostname: "localhost", siteKey: "0x4AAA" }), "bridge", "Tauri (tauri://localhost)");
assert.equal(hc.pickProvider({ protocol: "http:", hostname: "localhost", siteKey: "1x00000000000000000000AA" }), "direct", "test keys run anywhere (dev)");

assert.equal(hc.safeBridgeUrl("https://des-call.onrender.com/api/turnstile/frame"), "https://des-call.onrender.com/api/turnstile/frame");
assert.equal(hc.safeBridgeUrl("https://api.descall.com/api/turnstile/frame?x=1"), "https://api.descall.com/api/turnstile/frame");
assert.equal(hc.safeBridgeUrl("https://evil.example/api/turnstile/frame"), null, "unknown host refused");
assert.equal(hc.safeBridgeUrl("http://des-call.onrender.com/api/turnstile/frame"), null, "plain http refused");
assert.equal(hc.safeBridgeUrl("https://des-call.onrender.com/other"), null, "other path refused");
assert.equal(hc.safeBridgeUrl("http://localhost:3000/api/turnstile/frame"), "http://localhost:3000/api/turnstile/frame", "local dev");

assert.deepEqual(hc.classifyError("110200"), { kind: "give_up", reason: "config:110200" }, "unknown domain: give up");
assert.equal(hc.classifyError("400020").kind, "give_up");
assert.equal(hc.classifyError("200500").reason, "script");
assert.equal(hc.classifyError("300030").kind, "retry");
assert.equal(hc.classifyError("600010").kind, "retry");
assert.ok(hc.isHumanCheckError({ code: "turnstile_required" }) && hc.isHumanCheckError({ code: "turnstile_failed" }) && !hc.isHumanCheckError({ code: "x" }));

/* ---------------- strings ---------------- */

const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
const keys = Object.keys(text.HUMAN_CHECK_TEXT.tr).sort();
for (const l of LOCALES) {
  assert.deepEqual(Object.keys(text.HUMAN_CHECK_TEXT[l]).sort(), keys, `card strings complete for ${l}`);
  for (const k of keys) assert.ok(String(text.HUMAN_CHECK_TEXT[l][k]).trim(), `${l}.${k}`);
  assert.ok(text.turnstileLanguage(l), l);
}
assert.equal(text.turnstileLanguage("pt-BR"), "pt-br");
assert.equal(text.turnstileLanguage("xx"), "tr", "Turkish by default");
assert.equal(text.humanCheckStrings("pt-PT").title, text.HUMAN_CHECK_TEXT["pt-BR"].title);
assert.equal(text.humanCheckStrings("de-AT").title, text.HUMAN_CHECK_TEXT.de.title);

/* ---------------- fake DOM ---------------- */

class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.parentNode = null;
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.className = "";
    this.id = "";
    this.focused = false;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "id") this.id = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    if (c.tagName === "IFRAME" && typeof doc.onIframe === "function") doc.onIframe(c);
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    const list = this.parentNode.children;
    list.splice(list.indexOf(this), 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, ev = {}) {
    for (const fn of this.listeners[type] || []) fn({ stopPropagation() {}, ...ev });
  }
  focus() {
    this.focused = true;
  }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) {
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
}
const doc = {
  documentElement: new Node("html"),
  head: new Node("head"),
  body: new Node("body"),
  createElement: (tag) => new Node(tag),
  getElementById(id) {
    return this.head.find((n) => n.id === id) || this.body.find((n) => n.id === id);
  },
  onIframe: null,
};
const winListeners = {};
const win = {
  location: { protocol: "https:", hostname: "descall.com" },
  navigator: { onLine: true },
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  addEventListener(type, fn) {
    (winListeners[type] = winListeners[type] || []).push(fn);
  },
  removeEventListener(type, fn) {
    winListeners[type] = (winListeners[type] || []).filter((f) => f !== fn);
  },
  turnstile: null,
};
globalThis.window = win;
globalThis.document = doc;
const card = () => doc.body.find((n) => n.attrs["data-testid"] === "human-check");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Fake Cloudflare widget: `script` says what each render does. */
let script = "pass";
const renders = [];
win.turnstile = {
  render(host, opts) {
    renders.push(opts);
    const id = `w${renders.length}`;
    const s = script;
    setTimeout(() => {
      if (s === "pass") opts.callback(`token-${opts.action}-${renders.length}`);
      else if (s === "interactive") opts["before-interactive-callback"]();
      else if (s === "config") opts["error-callback"]("110200");
      else if (s === "flaky") {
        opts["error-callback"]("300030");
        opts["error-callback"]("300030");
        opts["error-callback"]("300030");
      } else if (s === "unsupported") opts["unsupported-callback"]();
    }, 5);
    return id;
  },
  reset() {},
  remove() {},
};

const CFG = { enabled: true, siteKey: "0x4AAAAAAAAAAAAAAAAAAAAsitekey", mode: "enforce", actions: { register: "always", login: "stepUp", password_reset: "always", social_signup: "always" }, bridgeUrl: "https://des-call.onrender.com/api/turnstile/frame" };
const reset = (cfg = CFG, timeouts) => hc.__resetHumanCheckForTests({ fetchConfig: async () => ({ ...cfg }), timeouts });

/* ---------------- direct widget (web) ---------------- */

reset();
script = "pass";
{
  const r = await hc.acquireHumanCheck("register");
  assert.match(r.turnstileToken, /^token-register-/, "silent pass gives a token");
  const o = renders.at(-1);
  assert.equal(o.sitekey, CFG.siteKey);
  assert.equal(o.action, "register");
  assert.equal(o.appearance, "interaction-only", "invisible unless Cloudflare wants a click");
  assert.equal(o.theme, "dark");
  assert.equal(o.language, "tr", "Turkish widget");
  assert.equal(card(), null, "card removed after the token");
  assert.ok(doc.head.find((n) => n.id === "descall-hc-style"), "styles injected once");
}
{
  doc.documentElement.setAttribute("data-theme", "light");
  await hc.acquireHumanCheck("register");
  assert.equal(renders.at(-1).theme, "light", "light theme follows the app");
  doc.documentElement.removeAttribute("data-theme");
}

// Interactive: the card opens; the person cancels.
reset();
script = "interactive";
{
  const p = hc.acquireHumanCheck("register");
  await tick(20);
  const c = card();
  assert.ok(c && c.attrs["data-state"] === "open" && c.attrs["aria-hidden"] === "false", "card opens for a click");
  assert.ok(c.find((n) => n.textContent === text.HUMAN_CHECK_TEXT.tr.title), "Turkish title");
  const cancel = c.find((n) => n.attrs["data-act"] === "cancel");
  assert.ok(cancel.focused, "focus moves to the card");
  cancel.dispatch("click");
  await assert.rejects(p, (err) => err.code === "turnstile_cancelled" && err.message === text.HUMAN_CHECK_TEXT.tr.cancelled);
  assert.equal(card(), null, "card gone after cancel");
}
// Escape cancels too.
{
  const p = hc.acquireHumanCheck("register");
  await tick(20);
  card().dispatch("keydown", { key: "Escape" });
  await assert.rejects(p, (err) => err.code === "turnstile_cancelled");
}

// Widget cannot run: the request goes out with a reason instead of hanging.
reset();
script = "config";
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "config:110200" }, "bad site key / domain");
script = "flaky";
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "error:300030" }, "three failures");
script = "unsupported";
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "unsupported" });
script = "silent-forever";
reset(CFG, { silent: 60 });
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "timeout" }, "no answer: give up quietly");
win.navigator.onLine = false;
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "offline" });
win.navigator.onLine = true;
{
  const saved = win.turnstile;
  win.turnstile = null;
  doc.onIframe = null;
  reset(CFG, { load: 50 });
  const r = await hc.acquireHumanCheck("register");
  assert.equal(r.turnstileUnavailable, "script", "blocked api.js -> script");
  win.turnstile = saved;
}

// Not configured: nothing to do.
reset({ enabled: false });
assert.deepEqual(await hc.acquireHumanCheck("register"), {}, "disabled: no fields");

// Prewarm: solved in the background, used once on submit.
reset();
script = "pass";
{
  hc.prewarmHumanCheck("register");
  await tick(30);
  const before = renders.length;
  const r = await hc.acquireHumanCheck("register");
  assert.match(r.turnstileToken, /^token-register-/);
  assert.equal(renders.length, before, "the submit used the prewarmed token");
  const r2 = await hc.acquireHumanCheck("register");
  assert.equal(renders.length, before + 1, "a token is used only once");
  assert.notEqual(r2.turnstileToken, r.turnstileToken);
}
// Prewarm never shows the card: an interactive challenge waits for the submit.
reset();
script = "interactive";
{
  hc.prewarmHumanCheck("register");
  await tick(30);
  assert.equal(card(), null, "prewarm stays quiet");
  hc.prewarmHumanCheck("login");
  await tick(10);
  assert.equal(renders.filter((o) => o.action === "login").length, 0, "no prewarm for step-up actions");
}

/* ---------------- bridge (apps) ---------------- */

reset();
win.location = { protocol: "descall:", hostname: "localhost" };
{
  const posted = [];
  let frame = null;
  doc.onIframe = (f) => {
    frame = f;
    f.contentWindow = { postMessage: (msg, origin) => posted.push({ msg, origin }) };
  };
  const p = hc.acquireHumanCheck("social_signup");
  await tick(5);
  assert.ok(frame && frame.src.startsWith("https://des-call.onrender.com/api/turnstile/frame"), "bridge page framed");
  frame.dispatch("load");
  assert.equal(posted.length, 1);
  const hello = posted[0];
  assert.equal(hello.origin, "https://des-call.onrender.com", "hello goes only to the bridge origin");
  assert.equal(hello.msg.type, "descall-hc-hello");
  assert.equal(hello.msg.action, "social_signup");
  assert.equal(hello.msg.language, "tr");
  const send = (origin, source, data) => (winListeners.message || []).forEach((fn) => fn({ origin, source, data }));
  // Wrong origin, wrong source, wrong nonce: ignored.
  send("https://evil.example", frame.contentWindow, { type: "descall-hc", nonce: hello.msg.nonce, event: "token", data: { token: "evil" } });
  send("https://des-call.onrender.com", {}, { type: "descall-hc", nonce: hello.msg.nonce, event: "token", data: { token: "evil2" } });
  send("https://des-call.onrender.com", frame.contentWindow, { type: "descall-hc", nonce: "other", event: "token", data: { token: "evil3" } });
  send("https://des-call.onrender.com", frame.contentWindow, { type: "descall-hc", nonce: hello.msg.nonce, event: "hello" });
  send("https://des-call.onrender.com", frame.contentWindow, { type: "descall-hc", nonce: hello.msg.nonce, event: "interactive" });
  assert.equal(card().attrs["data-state"], "open", "bridge asks for a click -> card");
  send("https://des-call.onrender.com", frame.contentWindow, { type: "descall-hc", nonce: hello.msg.nonce, event: "token", data: { token: "bridge-token" } });
  assert.deepEqual(await p, { turnstileToken: "bridge-token" }, "token from the bridge");
  assert.equal((winListeners.message || []).length, 0, "listener removed");
}
// Bridge never answers (blocked frame): give up with "bridge".
reset(CFG, { load: 40 });
{
  doc.onIframe = (f) => {
    f.contentWindow = { postMessage() {} };
  };
  assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "bridge" }, "unreachable bridge");
}
// No usable bridge URL from the server.
reset({ ...CFG, bridgeUrl: "https://evil.example/api/turnstile/frame" });
assert.deepEqual(await hc.acquireHumanCheck("register"), { turnstileUnavailable: "config:bridge" });
win.location = { protocol: "https:", hostname: "descall.com" };
doc.onIframe = null;

/* ---------------- api/auth.js ---------------- */

const calls = [];
let answers = [];
globalThis.__http = async (path, opts) => {
  const body = JSON.parse(opts.body || "{}");
  calls.push({ path, body });
  const next = answers.shift();
  if (next && next.error) {
    const err = new Error(next.error.message || "x");
    err.code = next.error.code;
    err.status = next.error.status;
    err.body = next.error.body || { code: next.error.code };
    throw err;
  }
  return next || { ok: true };
};

reset();
script = "pass";
calls.length = 0;
answers = [];
await auth.register({ username: "ada", password: "pw-123456789", termsAccepted: true });
assert.equal(calls[0].path, "/auth/register");
assert.equal(calls[0].body.turnstileClient, 1, "client says it can run the check");
assert.match(calls[0].body.turnstileToken, /^token-register-/, "sign-up carries a token");
assert.equal(calls[0].body.username, "ada");

// The token was refused (expired): one automatic retry with a fresh token.
calls.length = 0;
answers = [{ error: { code: "turnstile_failed", status: 403, body: { code: "turnstile_failed", turnstile: { retry: true } } } }];
await auth.register({ username: "bob", password: "pw-123456789", termsAccepted: true });
assert.equal(calls.length, 2, "retried once");
assert.notEqual(calls[1].body.turnstileToken, calls[0].body.turnstileToken, "fresh token on the retry");

// Server says no retry (fallback budget used up): the error reaches the form.
calls.length = 0;
answers = [{ error: { code: "turnstile_required", status: 428, body: { code: "turnstile_required", turnstile: { retry: false } } } }];
await assert.rejects(auth.register({ username: "cy", password: "pw-123456789", termsAccepted: true }), (e) => e.code === "turnstile_required");
assert.equal(calls.length, 1);

// Sign-in: no token unless the server asks (step-up after wrong passwords).
calls.length = 0;
answers = [];
await auth.login({ username: "ada", password: "x" });
assert.equal(calls.length, 1);
assert.equal(calls[0].body.turnstileToken, undefined, "normal sign-in sends no token");
assert.equal(calls[0].body.turnstileClient, 1);
calls.length = 0;
answers = [{ error: { code: "turnstile_required", status: 428, body: { code: "turnstile_required", turnstile: { retry: true } } } }, { token: "jwt" }];
const signed = await auth.login({ username: "ada", password: "x" });
assert.equal(signed.token, "jwt");
assert.equal(calls.length, 2);
assert.match(calls[1].body.turnstileToken, /^token-login-/, "step-up token with the login action");

// Password reset: always for the email, step-up for the code.
calls.length = 0;
answers = [];
await auth.requestPasswordReset("ada");
assert.match(calls[0].body.turnstileToken, /^token-password_reset-/);
calls.length = 0;
await auth.confirmPasswordReset({ usernameOrEmail: "ada", code: "123456", newPassword: "n" });
assert.equal(calls[0].body.turnstileToken, undefined, "reset code: no token until asked");

// Google / Apple: only the account-creating call gets a token.
calls.length = 0;
await auth.loginWithGoogle("cred");
assert.equal(calls[0].body.turnstileToken, undefined, "Google sign-in: no token");
calls.length = 0;
await auth.loginWithGoogle("cred", { termsAccepted: true, birthDate: "2000-01-01" });
assert.match(calls[0].body.turnstileToken, /^token-social_signup-/, "Google sign-up: token");
calls.length = 0;
await auth.loginWithApple({ identityToken: "t" }, { termsAccepted: true, birthDate: "2000-01-01" });
assert.equal(calls[0].body.turnstileToken, undefined, "Apple before the username step: no token");
calls.length = 0;
await auth.loginWithApple({ identityToken: "t" }, { termsAccepted: true, birthDate: "2000-01-01", username: "ada2" });
assert.match(calls[0].body.turnstileToken, /^token-social_signup-/, "Apple account creation: token");

// Cancelled check: the request is never sent.
script = "interactive";
calls.length = 0;
{
  const p = auth.register({ username: "dee", password: "pw-123456789", termsAccepted: true });
  await tick(20);
  card().find((n) => n.attrs["data-act"] === "cancel").dispatch("click");
  await assert.rejects(p, (e) => e.code === "turnstile_cancelled");
  assert.equal(calls.length, 0, "nothing sent after cancel");
}

// Turnstile not set up on the server: requests carry only the capability flag.
reset({ enabled: false });
calls.length = 0;
answers = [];
await auth.register({ username: "eve", password: "pw-123456789", termsAccepted: true });
assert.deepEqual(Object.keys(calls[0].body).filter((k) => k.startsWith("turnstile")), ["turnstileClient"]);

console.log("turnstileClient.selftest.mjs: ok");
