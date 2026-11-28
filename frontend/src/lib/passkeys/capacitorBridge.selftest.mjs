/**
 * Run: node frontend/src/lib/passkeys/capacitorBridge.selftest.mjs
 * The passkey client against the real @capacitor/core plugin proxy, as in the iPhone app.
 *
 * The other selftests fake the plugin with a plain object. A real Capacitor proxy answers
 * every property, `then` included, so a promise resolved with it never settles: the loader
 * in lib/passkeys/index.js returned the proxy from an async function, isAvailable() hung
 * in the iOS / Android apps, Settings > Security > Passkeys said "this device does not
 * support passkeys" and the sign-in button never showed. This file runs the real
 * registerPlugin over a fake WKWebView bridge (what Capacitor's native-bridge.js leaves on
 * window), so that bug cannot come back unnoticed.
 */
import assert from "node:assert/strict";

const PASSKEY_METHODS = ["isAvailable", "create", "get", "cancel", "autofill", "autofillCancel"];
const native = []; // [plugin, method, options]
let isAvailableAnswer = () => Promise.resolve({ available: true });

// The base64url JSON DescallPasskeyLogic.swift builds (registrationJSON / assertionJSON).
const assertionJSON = JSON.stringify({
  id: "q83vEjRWeJA",
  rawId: "q83vEjRWeJA",
  type: "public-key",
  authenticatorAttachment: "platform",
  response: { clientDataJSON: "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0", authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2M", signature: "MEUCIQ-_", userHandle: "dXNlci0x" },
  clientExtensionResults: {},
});
const registrationJSON = JSON.stringify({
  id: "AAEC-vv8_f7_",
  rawId: "AAEC-vv8_f7_",
  type: "public-key",
  authenticatorAttachment: "platform",
  response: { clientDataJSON: "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0", attestationObject: "o2NmbXRkbm9uZQ", transports: ["internal", "hybrid"] },
  clientExtensionResults: {},
});

globalThis.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
globalThis.Capacitor = {
  PluginHeaders: [
    { name: "DescallPasskey", methods: PASSKEY_METHODS.map((name) => ({ name, rtype: "promise" })) },
    { name: "DescallTrap", methods: [{ name: "isAvailable", rtype: "promise" }] },
  ],
  nativePromise(plugin, method, options) {
    native.push([plugin, method, options]);
    if (plugin === "DescallPasskey" && method === "isAvailable") return isAvailableAnswer();
    if (plugin === "DescallPasskey" && method === "get") return Promise.resolve({ response: assertionJSON });
    if (plugin === "DescallPasskey" && method === "create") return Promise.resolve({ response: registrationJSON });
    return Promise.reject(Object.assign(new Error(`${plugin}.${method}() is not implemented on ios`), { code: "UNIMPLEMENTED" }));
  },
};

const { registerPlugin, Capacitor } = await import("@capacitor/core");
const pk = await import("./index.js");

assert.equal(Capacitor.getPlatform(), "ios", "the fake bridge makes core report iOS");
assert.equal(pk.detectPasskeyPath(globalThis), "ios");

const pending = Symbol("pending");
const settled = (p, ms = 300) => Promise.race([p, new Promise((r) => setTimeout(() => r(pending), ms))]);

// Capacitor rejects a method the native plugin does not list ("then") on a promise nobody
// holds: in the app that is a console error, in node an unhandled rejection.
const unhandled = [];
process.on("unhandledRejection", (err) => unhandled.push(String(err?.message || err)));

// The trap itself: a promise resolved with a plugin proxy never settles (it calls the
// proxy's then(), which the native plugin does not have). Boxed as { plugin } it settles.
{
  const trap = registerPlugin("DescallTrap");
  assert.equal(await settled((async () => trap)()), pending, "an async function returning the proxy never settles");
  assert.ok(unhandled.some((m) => m.includes("DescallTrap.then()")), "resolving with the proxy asks the plugin for then()");
  const boxed = await settled((async () => ({ plugin: trap }))());
  assert.notEqual(boxed, pending);
  assert.equal(boxed.plugin, trap);
}

const log = [];
const api = {
  config: async () => ({ enabled: true, ready: true, rpId: "descall.com", android: false }),
  authOptions: async (platform) => {
    log.push(["authOptions", platform]);
    return { challenge: "AAECAwQFBgcICQoLDA0ODw", rpId: "descall.com", timeout: 300000, userVerification: "required", allowCredentials: [] };
  },
  authVerify: async (response, platform) => {
    log.push(["authVerify", platform, response]);
    return { token: "tok", method: "passkey" };
  },
  registerOptions: async (token, platform) => {
    log.push(["registerOptions", token, platform]);
    return { challenge: "AAECAwQFBgcICQoLDA0ODw", rp: { id: "descall.com", name: "Descall" }, user: { id: "dXNlci0x", name: "ada", displayName: "Ada" }, excludeCredentials: [{ id: "q83vEjRWeJA", type: "public-key" }], timeout: 300000 };
  },
  registerVerify: async (token, response, name, platform) => {
    log.push(["registerVerify", token, response, name, platform]);
    return { passkey: { id: "new", name } };
  },
  reauthOptions: async (platform) => {
    log.push(["reauthOptions", platform]);
    return { challenge: "AAECAwQFBgcICQoLDA0ODw", rpId: "descall.com", userVerification: "required", allowCredentials: [{ id: "q83vEjRWeJA", type: "public-key" }] };
  },
  reauthVerify: async (response, platform) => {
    log.push(["reauthVerify", platform, response.id]);
    return { reauthToken: "rt-2" };
  },
};

// Default loader (env.loadPlugin is not replaced): the real registerPlugin.
pk.__setPasskeyEnvForTests({ win: () => globalThis, api });

// Settings > Security > Passkeys and the sign-in button: available on iOS 16+.
{
  const avail = await settled(pk.isAvailable(), 2000);
  assert.notEqual(avail, pending, "isAvailable() settles with the real Capacitor proxy");
  assert.deepEqual(avail, { available: true, path: "ios", conditional: false, reason: null });
  assert.ok(native.some(([p, m]) => p === "DescallPasskey" && m === "isAvailable"));
  assert.ok(!unhandled.some((m) => m.includes("DescallPasskey.then()")), "the passkey proxy is never adopted as a thenable");
}

// Sign-in: the server's options go to the native get() as JSON, the plugin's base64url
// response reaches /auth/verify unchanged (the server verifies it as from a browser).
{
  const body = await settled(pk.signIn(), 2000);
  assert.notEqual(body, pending, "signIn() settles");
  assert.equal(body.token, "tok");
  const call = native.find(([p, m]) => p === "DescallPasskey" && m === "get");
  assert.ok(call, "the native get() ran");
  const sent = JSON.parse(call[2].options);
  assert.equal(sent.rpId, "descall.com");
  assert.equal(sent.challenge, "AAECAwQFBgcICQoLDA0ODw", "the challenge stays base64url");
  const verify = log.find((l) => l[0] === "authVerify");
  assert.equal(verify[1], "ios");
  assert.deepEqual(verify[2], JSON.parse(assertionJSON), "the assertion reaches the server as the plugin built it");
}

// Adding a passkey: native create() with rp descall.com and the exclude list.
{
  const res = await settled(pk.register("iPhone", { reauthToken: "rt" }), 2000);
  assert.notEqual(res, pending, "register() settles");
  assert.equal(res.passkey.name, "iPhone");
  const call = native.find(([p, m]) => p === "DescallPasskey" && m === "create");
  const sent = JSON.parse(call[2].options);
  assert.equal(sent.rp.id, "descall.com");
  assert.equal(sent.user.id, "dXNlci0x");
  assert.deepEqual(sent.excludeCredentials.map((c) => c.id), ["q83vEjRWeJA"]);
  const verify = log.find((l) => l[0] === "registerVerify");
  assert.deepEqual(verify.slice(1), ["rt", JSON.parse(registrationJSON), "iPhone", "ios"]);
}

// Re-auth with a passkey: allowCredentials reach the native get().
{
  const before = native.length;
  assert.equal(await pk.reauthWithPasskey(), "rt-2");
  const call = native.slice(before).find(([p, m]) => p === "DescallPasskey" && m === "get");
  assert.deepEqual(JSON.parse(call[2].options).allowCredentials.map((c) => c.id), ["q83vEjRWeJA"]);
}

// A native isAvailable() that never answers: the screens get an answer anyway and the next
// check asks again (not kept as a final "no").
{
  isAvailableAnswer = () => new Promise(() => {});
  pk.__setPasskeyEnvForTests({ win: () => globalThis, api, nativeStatusTimeoutMs: 50 });
  assert.deepEqual(await settled(pk.isAvailable(), 2000), { available: false, path: "ios", conditional: false, reason: "plugin_timeout" });
  isAvailableAnswer = () => Promise.resolve({ available: true });
  assert.equal((await pk.isAvailable()).available, true, "a timeout is not cached");
  // A build without the native plugin method: unavailable, then retried.
  isAvailableAnswer = () => Promise.reject(Object.assign(new Error("not implemented"), { code: "UNIMPLEMENTED" }));
  pk.__setPasskeyEnvForTests({ win: () => globalThis, api });
  assert.equal((await pk.isAvailable()).reason, "plugin_missing");
  isAvailableAnswer = () => Promise.resolve({ available: false, reason: "os_too_old" });
  assert.equal((await pk.isAvailable()).reason, "os_too_old", "plugin_missing is retried, a real answer is used");
}

assert.ok(!unhandled.some((m) => m.includes("DescallPasskey")), `no stray passkey rejections: ${unhandled.join("; ")}`);
console.log("passkeys capacitor bridge selftest OK");
