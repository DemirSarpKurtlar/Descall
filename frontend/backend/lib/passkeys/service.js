"use strict";

/**
 * Passkey ceremonies (WebAuthn L3) on top of @simplewebauthn/server, independent of
 * Express so the selftest can drive it with a software authenticator.
 *
 *   registrationOptions / verifyRegistration     add a passkey to a signed-in account
 *   authenticationOptions / verifyAuthentication  sign in (discoverable, no username) or
 *                                                  re-authenticate a signed-in account
 *   createHandoff / handoffByCode / pollHandoff   desktop browser handoff
 *
 * Rules enforced here:
 *   - challenges are random 32 bytes, single use (deleted on first use), 5 minute expiry,
 *     bound to the purpose, the account and session (registration, re-auth) and to the
 *     handoff they were made for;
 *   - origin must be one of config.origins (web, Android apk-key-hash) and rp id config.rpId;
 *   - registration requires user verification; authentication asks for it and reports
 *     whether it happened (the route decides what a sign-in without it may do);
 *   - a sign counter that does not grow (when either side is non-zero) suspends the key
 *     (possible clone) and fails the sign-in;
 *   - the userHandle a discoverable credential returns must belong to the key's account.
 */

const crypto = require("crypto");
const meta = require("./meta");

const MAX_PASSKEYS_PER_USER = 20;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const HANDOFF_TTL_MS = 5 * 60 * 1000;
const SUPPORTED_ALGS = [-8, -7, -257]; // EdDSA, ES256, RS256

class PasskeyError extends Error {
  constructor(code, status = 400, message = code, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256hex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

/** Opaque WebAuthn user handle for an account: the UUID's 16 bytes (no personal data). */
function userHandleFor(userId) {
  const s = String(userId || "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return Buffer.from(s.replace(/-/g, ""), "hex");
  return crypto.createHash("sha256").update(`descall-user:${s}`).digest().subarray(0, 32);
}

function createPasskeyService({ store, config, webauthn, now = () => Date.now() } = {}) {
  if (!store || !config) throw new Error("passkey service needs store and config");
  const lib = () => webauthn || require("@simplewebauthn/server");
  let lastPrune = 0;

  function prune() {
    const t = now();
    if (t - lastPrune < 60_000) return;
    lastPrune = t;
    Promise.resolve(store.pruneChallenges(new Date(t).toISOString())).catch(() => {});
  }

  async function newChallenge({ purpose, userId = null, sessionId = null, handoffId = null, meta: extra = {} }) {
    const bytes = crypto.randomBytes(32);
    const challenge = b64u(bytes);
    await store.putChallenge({
      challenge,
      purpose,
      user_id: userId,
      session_id: sessionId,
      handoff_id: handoffId,
      meta: extra,
      expires_at: new Date(now() + CHALLENGE_TTL_MS).toISOString(),
    });
    prune();
    return bytes;
  }

  /** Takes the challenge a response signed (single use) and checks its binding. */
  async function consumeChallenge(response, purpose, { userId = null, sessionId = null, handoffId = null } = {}) {
    const challenge = meta.challengeFromResponse(response);
    if (!challenge) throw new PasskeyError("BAD_RESPONSE", 400, "The passkey response is not valid.");
    const row = await store.takeChallenge(challenge, purpose);
    if (!row) throw new PasskeyError("CHALLENGE_EXPIRED", 400, "This passkey request expired. Try again.");
    if (Date.parse(row.expires_at) <= now()) throw new PasskeyError("CHALLENGE_EXPIRED", 400, "This passkey request expired. Try again.");
    if ((row.user_id || null) !== (userId || null)) throw new PasskeyError("CHALLENGE_MISMATCH", 400, "This passkey request belongs to another sign-in.");
    if (sessionId !== undefined && row.session_id && row.session_id !== (sessionId || null)) {
      throw new PasskeyError("CHALLENGE_MISMATCH", 400, "This passkey request belongs to another sign-in.");
    }
    if ((row.handoff_id || null) !== (handoffId || null)) throw new PasskeyError("CHALLENGE_MISMATCH", 400, "This passkey request belongs to another sign-in.");
    return { challenge, row };
  }

  async function registrationOptions({ user, sessionId = null, platform = "web", handoffId = null }) {
    if (!user?.id) throw new PasskeyError("NO_USER", 401, "Sign in first.");
    const existing = await store.listByUser(user.id);
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw new PasskeyError("LIMIT", 409, "You already have the maximum number of passkeys. Remove one first.", { max: MAX_PASSKEYS_PER_USER });
    }
    const challenge = await newChallenge({ purpose: "register", userId: user.id, sessionId, handoffId, meta: { platform: meta.normalizePlatform(platform) } });
    const name = String(user.username || "user").slice(0, 64);
    const options = await lib().generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: name,
      userDisplayName: String(user.displayName || user.display_name || name).slice(0, 64),
      userID: new Uint8Array(userHandleFor(user.id)),
      challenge: new Uint8Array(challenge),
      timeout: config.timeoutMs,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: Array.isArray(c.transports) ? c.transports : [] })),
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      supportedAlgorithmIDs: SUPPORTED_ALGS,
      extensions: { credProps: true },
    });
    return options;
  }

  async function verifyRegistration({ user, sessionId = null, handoffId = null, response, name, platform = "web", userAgent = "" }) {
    if (!user?.id) throw new PasskeyError("NO_USER", 401, "Sign in first.");
    if (!meta.looksLikeCredentialResponse(response, "register")) throw new PasskeyError("BAD_RESPONSE", 400, "The passkey response is not valid.");
    const { challenge } = await consumeChallenge(response, "register", { userId: user.id, sessionId, handoffId });
    let verification;
    try {
      verification = await lib().verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: [...config.origins],
        expectedRPID: config.rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: SUPPORTED_ALGS,
      });
    } catch (err) {
      throw new PasskeyError("VERIFY_FAILED", 400, "The passkey could not be verified.", { detail: String(err?.message || err).slice(0, 200) });
    }
    if (!verification?.verified || !verification.registrationInfo) throw new PasskeyError("VERIFY_FAILED", 400, "The passkey could not be verified.");
    const info = verification.registrationInfo;
    if (!config.origins.includes(info.origin)) throw new PasskeyError("BAD_ORIGIN", 400, "The passkey was made for another site.");
    const cleanPlatform = meta.normalizePlatform(platform);
    const row = await store
      .insertCredential({
        user_id: user.id,
        credential_id: info.credential.id,
        public_key: b64u(info.credential.publicKey),
        sign_count: Number(info.credential.counter) || 0,
        transports: meta.cleanTransports(info.credential.transports || response.response?.transports),
        aaguid: info.aaguid || null,
        device_type: info.credentialDeviceType || null,
        backup_eligible: info.credentialDeviceType === "multiDevice",
        backup_state: Boolean(info.credentialBackedUp),
        attestation_fmt: info.fmt || null,
        name: meta.sanitizeName(name) || meta.defaultPasskeyName({ aaguid: info.aaguid, platform: cleanPlatform, userAgent }),
        platform: cleanPlatform,
        created_device: meta.deviceFromUserAgent(userAgent),
      })
      .catch((err) => {
        if (err?.code === "DUPLICATE") throw new PasskeyError("DUPLICATE", 409, "This passkey is already registered.");
        throw err;
      });
    return row;
  }

  async function authenticationOptions({ purpose = "authenticate", userId = null, sessionId = null, handoffId = null } = {}) {
    let allowCredentials = [];
    if (purpose === "reauth") {
      if (!userId) throw new PasskeyError("NO_USER", 401, "Sign in first.");
      const mine = (await store.listByUser(userId)).filter((c) => !c.suspended_at);
      if (!mine.length) throw new PasskeyError("NO_PASSKEYS", 404, "This account has no passkey yet.");
      allowCredentials = mine.map((c) => ({ id: c.credential_id, transports: Array.isArray(c.transports) ? c.transports : [] }));
    }
    const challenge = await newChallenge({ purpose, userId: purpose === "reauth" ? userId : null, sessionId: purpose === "reauth" ? sessionId : null, handoffId });
    return lib().generateAuthenticationOptions({
      rpID: config.rpId,
      allowCredentials,
      userVerification: "required",
      timeout: config.timeoutMs,
      challenge: new Uint8Array(challenge),
    });
  }

  async function verifyAuthentication({ response, purpose = "authenticate", userId = null, sessionId = null, handoffId = null, platform = "web" }) {
    if (!meta.looksLikeCredentialResponse(response, "authenticate")) throw new PasskeyError("BAD_RESPONSE", 400, "The passkey response is not valid.");
    const { challenge } = await consumeChallenge(response, purpose, {
      userId: purpose === "reauth" ? userId : null,
      sessionId: purpose === "reauth" ? sessionId : undefined,
      handoffId,
    });
    const cred = await store.getByCredentialId(response.id);
    if (!cred) {
      throw new PasskeyError("UNKNOWN_CREDENTIAL", 401, "This passkey is not registered on Descall. Sign in with your password.", { credentialId: response.id });
    }
    const handle = response.response?.userHandle;
    if (handle && Buffer.from(String(handle), "base64url").compare(userHandleFor(cred.user_id)) !== 0) {
      throw new PasskeyError("VERIFY_FAILED", 401, "The passkey could not be verified.");
    }
    if (purpose === "authenticate" && !handle) {
      // Discoverable sign-in: the authenticator must name the account.
      throw new PasskeyError("VERIFY_FAILED", 401, "The passkey could not be verified.");
    }
    if (purpose === "reauth" && cred.user_id !== userId) throw new PasskeyError("WRONG_ACCOUNT", 401, "This passkey belongs to another account.");
    if (cred.suspended_at) {
      throw new PasskeyError("SUSPENDED", 403, "This passkey was turned off because it may have been copied. Sign in with your password and remove it.", { credentialRowId: cred.id, userId: cred.user_id });
    }
    let verification;
    try {
      verification = await lib().verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: [...config.origins],
        expectedRPID: config.rpId,
        credential: {
          id: cred.credential_id,
          publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")),
          counter: Number(cred.sign_count) || 0,
          transports: Array.isArray(cred.transports) ? cred.transports : [],
        },
        requireUserVerification: false,
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (/counter value/i.test(msg)) {
        await store.suspend(cred.id, "counter").catch(() => {});
        throw new PasskeyError("CLONED", 403, "This passkey was turned off because it may have been copied. Sign in with your password and remove it.", { credentialRowId: cred.id, userId: cred.user_id, name: cred.name });
      }
      throw new PasskeyError("VERIFY_FAILED", 401, "The passkey could not be verified.", { detail: msg.slice(0, 200), userId: cred.user_id });
    }
    if (!verification?.verified) throw new PasskeyError("VERIFY_FAILED", 401, "The passkey could not be verified.", { userId: cred.user_id });
    const info = verification.authenticationInfo;
    if (!config.origins.includes(info.origin)) throw new PasskeyError("BAD_ORIGIN", 400, "The passkey was made for another site.");
    const updated = await store.updateCounter(cred.id, {
      expected: Number(cred.sign_count) || 0,
      next: Number(info.newCounter) || 0,
      usedAt: new Date(now()).toISOString(),
      platform: meta.normalizePlatform(platform),
      useCount: (Number(cred.use_count) || 0) + 1,
    });
    if (!updated) throw new PasskeyError("REPLAY", 409, "This passkey was just used. Try again.");
    if (Boolean(info.credentialBackedUp) !== Boolean(cred.backup_state)) await store.setBackupState(cred.id, info.credentialBackedUp).catch(() => {});
    return { userId: cred.user_id, credential: cred, userVerified: Boolean(info.userVerified), origin: info.origin };
  }

  // ---- desktop browser handoff ----------------------------------------------------------

  async function createHandoff({ kind, userId = null, sessionId = null, platform = "electron" }) {
    if (kind !== "signin" && kind !== "register") throw new PasskeyError("BAD_KIND", 400, "Unknown request.");
    if (kind === "register" && !userId) throw new PasskeyError("NO_USER", 401, "Sign in first.");
    const code = b64u(crypto.randomBytes(32));
    const pollSecret = b64u(crypto.randomBytes(32));
    const matchCode = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    const expiresAt = new Date(now() + HANDOFF_TTL_MS).toISOString();
    await store.createHandoff({
      kind,
      code_hash: sha256hex(code),
      poll_hash: sha256hex(pollSecret),
      match_code: matchCode,
      user_id: kind === "register" ? userId : null,
      session_id: kind === "register" ? sessionId : null,
      platform: meta.normalizePlatform(platform),
      expires_at: expiresAt,
    });
    prune();
    const base = config.desktopOrigin;
    return { code, pollSecret, matchCode, expiresAt, url: `${base}/passkey/desktop#c=${code}`, expiresInSec: HANDOFF_TTL_MS / 1000 };
  }

  /** A pending, unexpired handoff for the browser page, or null. */
  async function handoffByCode(code) {
    if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
    const h = await store.getHandoffByCodeHash(sha256hex(code));
    if (!h || h.status !== "pending" || Date.parse(h.expires_at) <= now()) return null;
    return h;
  }

  async function pollHandoff(pollSecret) {
    if (typeof pollSecret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(pollSecret)) return null;
    const h = await store.getHandoffByPollHash(sha256hex(pollSecret));
    if (!h) return null;
    const expired = Date.parse(h.expires_at) <= now();
    return { ...h, expired };
  }

  return {
    registrationOptions,
    verifyRegistration,
    authenticationOptions,
    verifyAuthentication,
    createHandoff,
    handoffByCode,
    pollHandoff,
    completeHandoff: (id, patch) => store.completeHandoff(id, patch),
    consumeHandoff: (id) => store.consumeHandoff(id),
    failHandoff: (id) => store.failHandoff(id),
    store,
    config,
  };
}

module.exports = { createPasskeyService, PasskeyError, userHandleFor, MAX_PASSKEYS_PER_USER, CHALLENGE_TTL_MS, HANDOFF_TTL_MS, sha256hex };
