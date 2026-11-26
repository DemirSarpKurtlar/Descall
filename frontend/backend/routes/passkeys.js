"use strict";

/**
 * Passkeys (WebAuthn), mounted at /api/auth/passkeys and /auth/passkeys (server.js).
 * The password always stays; a passkey is an additional, faster way to sign in.
 *
 * Public (rate limited like /login):
 *   GET  /config                              -> { enabled, rpId }
 *   POST /auth/options   { platform }          -> PublicKeyCredentialRequestOptionsJSON (discoverable)
 *   POST /auth/verify    { response, platform} -> same body as POST /login (token, sessionId, user)
 *                                                  or requires2fa (no user verification, account
 *                                                  with 2FA), or the ban / access-ban / under-13 answers
 *
 * Signed in (requireAuth):
 *   GET    /                                   -> { passkeys, max, reauthMethods }
 *   POST   /reauth { password | code }          -> { reauthToken, expiresInSec } (password, the
 *                                                  e-mail reauth code of POST /email/reauth, or
 *                                                  the authenticator code)
 *   POST   /reauth/options, /reauth/verify      -> re-authenticate with an existing passkey
 *   POST   /register/options { reauthToken }    -> PublicKeyCredentialCreationOptionsJSON
 *   POST   /register/verify  { reauthToken, response, name, platform } -> { passkey }
 *   PATCH  /:id { name }                       -> { passkey }       (own passkeys only)
 *   DELETE /:id                                -> { ok }            (own passkeys only)
 *
 * Desktop browser handoff (Electron; Tauri on Windows older than 1903):
 *   POST /handoff          { platform }         -> { pollSecret, url, matchCode, expiresInSec }  sign-in
 *   POST /handoff/register { reauthToken }      -> same, for adding a passkey (signed in)
 *   POST /handoff/info     { code }             -> { kind, matchCode, expiresAt, username? }  (browser page)
 *   POST /handoff/auth/options|verify      { code, response }
 *   POST /handoff/register/options|verify  { code, response, name }
 *   POST /handoff/poll     { pollSecret }       -> { status: pending | expired | failed } or the sign-in
 *                                                  body (signin) / { status: "registered", passkey }
 * The code travels only in the URL fragment of the page the app opens (never sent to a
 * server in a URL); the poll secret never leaves the app. Both are single use, 5 minutes.
 */

const express = require("express");
const { readConfig } = require("../lib/passkeys/config");
const { createSupabaseStore } = require("../lib/passkeys/store");
const { createPasskeyService, PasskeyError, MAX_PASSKEYS_PER_USER, userHandleFor } = require("../lib/passkeys/service");
const meta = require("../lib/passkeys/meta");
const { peek, recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { burstLimit } = require("../lib/burstLimit");
const { apiError, apiText } = require("../lib/apiError");

const LOGIN_USER_COLS =
  "id, username, password_hash, avatar_url, display_name, bio, custom_status, banner_url, updated_at, auth_provider, email, email_confirmed_at, two_factor_enabled, is_admin, descoin_balance, birth_date, is_banned, ban_category, ban_reason, ban_message, banned_at, ban_expires_at";
const BASIC_USER_COLS =
  "id, username, display_name, email, email_confirmed_at, password_hash, two_factor_enabled, is_admin, reauthentication_token, reauthentication_sent_at";

const LIMITS = {
  // Every call stores a challenge row; generous for shared addresses (schools, carriers):
  // a sign-in page asks twice per view (autofill + the button's prefetch).
  options: { max: 300 },
  verifyIp: { max: 40 },
  verifyCred: { max: 30 },
  reauth: { max: 10 },
  register: { max: 20 },
  handoff: { max: 20 },
  handoffCode: { max: 60 },
  poll: { max: 400 },
  manage: { max: 60 },
};

function defaultDeps() {
  const supabase = require("../db/supabase");
  const jwt = require("../config/jwt");
  const sessions = require("../lib/sessions");
  return {
    config: readConfig(),
    store: createSupabaseStore(),
    requireAuth: require("../middleware/auth").requireAuth,
    clientIp: sessions.clientIp,
    createSession: sessions.createSession,
    signToken: jwt.signToken,
    signReauthToken: jwt.signPasskeyReauthToken,
    verifyToken: jwt.verifyToken,
    kit: () => require("./auth").passkeyKit,
    async loadLoginUser(id) {
      const { data, error } = await supabase.from("users").select(LOGIN_USER_COLS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async loadBasicUser(id) {
      const { data, error } = await supabase.from("users").select(BASIC_USER_COLS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async clearReauthCode(id) {
      await supabase.from("users").update({ reauthentication_token: null, reauthentication_sent_at: null }).eq("id", id);
    },
    async verifyPassword(password, hash) {
      if (typeof password !== "string" || !password || !hash) return false;
      try {
        return await require("bcryptjs").compare(password, hash);
      } catch {
        return false;
      }
    },
    async totpState(userId) {
      const twoFactor = require("../lib/twoFactorService");
      const row = await twoFactor.loadTotp(userId).catch(() => null);
      return { enabled: Boolean(row?.totp_enabled_at) };
    },
    async verifyTotp(userId, code) {
      const v = await require("../lib/twoFactorService").verifySecondFactor(userId, code, { allowRecovery: false });
      return Boolean(v?.ok);
    },
    async cancelDeletion(userId) {
      await require("../lib/accountDeletion").cancelDeletionIfPending(userId).catch(() => false);
    },
    async afterLogin(userId) {
      await require("../lib/presenceTouch").touchLastSeen(userId, { force: true }).catch(() => {});
      const store = require("../lib/userAnalyticsStore");
      void store.recordAppOpened(userId);
      void store.recordAnalyticsEvent({ userId, event: "login", props: { method: "passkey" } });
    },
    securityNote(type, opts) {
      try {
        require("../lib/securityEvents").note(type, opts);
      } catch {
        /* never break the request */
      }
    },
    audit(user, action, target, detail) {
      try {
        if (!(user?.is_admin || user?.username === "admin")) return;
        require("../runtime/sharedState").appendAudit(user.id, user.username, action, target, detail || {});
      } catch {
        /* best effort */
      }
    },
    async notify(user, kind, req, vars = {}) {
      if (!user?.email || !user.email_confirmed_at) return;
      const { sendEmail, SUPPORT_EMAIL } = require("../lib/mailer");
      const { langFrom } = require("../lib/emailTemplates");
      const { bt } = require("../lib/i18n");
      const lang = langFrom(req?.headers?.["accept-language"]);
      const subject = bt(lang, `security.${kind}Subject`);
      const text = bt(lang, `security.${kind}Body`, { ...vars, support: SUPPORT_EMAIL });
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      await sendEmail({ to: user.email, subject, text, html: `<p>${esc(text)}</p><p>${esc(SUPPORT_EMAIL)}</p>` });
    },
    emit(req, userId, event, payload) {
      try {
        const io = req.app?.get?.("io");
        if (io) io.to(`user:${userId}`).emit(event, payload || {});
      } catch {
        /* best effort */
      }
    },
  };
}

function createPasskeyRouter(overrides = {}) {
  let resolved = null;
  const d = () => {
    if (!resolved) {
      const base = overrides.__noDefaults ? {} : defaultDeps();
      resolved = { ...base, ...overrides };
      if (!resolved.service) resolved.service = createPasskeyService({ store: resolved.store, config: resolved.config, webauthn: resolved.webauthn, now: resolved.now });
    }
    return resolved;
  };
  const kit = () => (typeof d().kit === "function" ? d().kit() : d().kit);
  const router = express.Router();
  // Coarse per-IP burst cap in front of every passkey route; the per-account limits below stay.
  router.use(burstLimit({ name: "passkeys", limit: 240 }));
  const ip = (req) => d().clientIp(req);
  const platformOf = (req) => meta.normalizePlatform(req.body?.platform || req.get?.("x-descall-platform") || "web");

  // Lazily resolved so the module loads without a database (tests, cold start).
  const requireAuth = (req, res, next) => d().requireAuth(req, res, next);

  function noStore(res) {
    res.set("Cache-Control", "no-store");
  }

  function sendError(res, err) {
    if (res.headersSent) return;
    if (err?.code === "PASSKEYS_UNAVAILABLE") {
      return res.status(503).json(apiError("Passkeys are not available right now.", null, { code: "PASSKEYS_UNAVAILABLE" }));
    }
    if (err instanceof PasskeyError) {
      const body = { error: err.message, code: err.code };
      if (err.code === "UNKNOWN_CREDENTIAL" && err.credentialId) body.credentialId = err.credentialId;
      if (err.code === "LIMIT") body.max = err.max;
      return res.status(err.status || 400).json(body);
    }
    console.error("[passkeys]", err?.message || err);
    return res.status(500).json(apiError("Internal server error.", null, { code: "SERVER_ERROR" }));
  }

  /** Feature switch + migration check, before any work. */
  async function ready(res) {
    if (!d().config.enabled) {
      res.status(503).json(apiError("Passkeys are turned off.", null, { code: "PASSKEYS_DISABLED" }));
      return false;
    }
    let ok = false;
    try {
      ok = await d().store.available();
    } catch {
      ok = false;
    }
    if (!ok) {
      res.status(503).json(apiError("Passkeys are not available right now.", null, { code: "PASSKEYS_UNAVAILABLE" }));
      return false;
    }
    return true;
  }

  /** Counts every call against `key` and answers 429 once it is over the limit. */
  function countCall(res, key, opts) {
    if (rejectIfLimited(res, [peek(key, opts)])) return false;
    recordFailure(key, opts);
    return true;
  }

  function noteFailure(req, err, userId = null) {
    d().securityNote("failed_login", {
      req,
      userId: userId || err?.userId || null,
      reason: `passkey_${String(err?.code || "error").toLowerCase()}`.slice(0, 40),
      detail: { method: "passkey" },
    });
  }

  /** A clone signal (counter went backwards): mail the owner once per suspension. */
  async function handleClone(req, err) {
    if (err?.code !== "CLONED" || !err.userId) return;
    const user = await d().loadBasicUser(err.userId).catch(() => null);
    if (user) await d().notify(user, "passkeyCloned", req, { name: err.name || "Passkey" }).catch(() => {});
    d().emit(req, err.userId, "passkeys:changed", { reason: "suspended" });
  }

  // ---- sign-in -------------------------------------------------------------------------

  /**
   * Opens a session for `userId` after a verified passkey, with every /login gate:
   * ban (with ban ticket), under-13 closure, IP / network / device bans, pending deletion.
   * Strong authentication (user verified) skips the second factor; without user
   * verification the account's second factor is asked (requires2fa), and an account
   * without one gets no session (UV_REQUIRED).
   */
  async function completeSignIn(req, res, { userId, userVerified, platform }) {
    const k = kit();
    const user = await d().loadLoginUser(userId);
    if (!user) {
      return res.status(401).json(apiError("The passkey could not be verified.", null, { code: "VERIFY_FAILED" }));
    }
    const secondFactor = userVerified ? false : await k.hasSecondFactor(user);
    if (!userVerified && !secondFactor) {
      return res.status(401).json(
        apiError("Your device did not confirm it is you (PIN, fingerprint or face). Try again, or sign in with your password.", null, { code: "UV_REQUIRED" })
      );
    }
    const banActive = Boolean(user.is_banned) && !(user.ban_expires_at && new Date(user.ban_expires_at).getTime() <= Date.now());
    const deferBan = banActive && !userVerified && secondFactor;
    if (!deferBan && (await k.rejectIfBanned(res, user))) return undefined;
    if (await k.rejectIfChildAccount(req, res, user)) return undefined;
    if (await k.accessGate(req, res, { action: "login", user })) return undefined;
    if (!deferBan) await d().cancelDeletion(user.id);
    if (!userVerified && (await k.secondFactorGate(res, user))) return undefined;

    const { session } = await d().createSession(user.id, {
      userAgent: req.headers["user-agent"],
      ip: ip(req),
      deviceId: req.get("x-descall-device"),
      method: "passkey",
    });
    const token = d().signToken({ id: user.id, username: user.username, sid: session.id });
    await d().afterLogin(user.id, platform);
    const extra = await k.resolveEquippedExtra(user.id);
    noStore(res);
    return res.status(200).json({
      ...apiText("message", "Login successful."),
      token,
      sessionId: session.id,
      method: "passkey",
      user: k.authUserPayload(user, extra),
    });
  }

  router.get("/config", async (req, res) => {
    const c = d().config;
    let ready = false;
    try {
      ready = c.enabled && (await d().store.available());
    } catch {
      ready = false;
    }
    res.set("Cache-Control", "public, max-age=300");
    // enabled: the kill switch; ready: the tables exist (migration applied). Clients hide
    // every passkey entry unless both are true.
    res.json({ enabled: c.enabled && ready, ready, rpId: c.rpId, android: c.androidOrigins.length > 0 });
  });

  router.post("/auth/options", async (req, res) => {
    try {
      if (!countCall(res, `pkopt:ip:${ip(req)}`, LIMITS.options)) return;
      if (!(await ready(res))) return;
      const options = await d().service.authenticationOptions({ purpose: "authenticate" });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/auth/verify", async (req, res) => {
    const ipKey = `passkey:ip:${ip(req)}`;
    try {
      const response = req.body?.response;
      const credKey = typeof response?.id === "string" ? `passkey:cred:${response.id.slice(0, 200)}` : null;
      const checks = [peek(ipKey, LIMITS.verifyIp)];
      if (credKey) checks.push(peek(credKey, LIMITS.verifyCred));
      if (rejectIfLimited(res, checks)) {
        d().securityNote("ip_blocked", { req, reason: "login", detail: { scope: "passkey" } });
        return;
      }
      if (!(await ready(res))) return;
      let result;
      try {
        result = await d().service.verifyAuthentication({ response, purpose: "authenticate", platform: platformOf(req) });
      } catch (err) {
        recordFailure(ipKey, LIMITS.verifyIp);
        if (credKey) recordFailure(credKey, LIMITS.verifyCred);
        if (err instanceof PasskeyError) {
          noteFailure(req, err);
          await handleClone(req, err);
        }
        return sendError(res, err);
      }
      return await completeSignIn(req, res, { userId: result.userId, userVerified: result.userVerified, platform: platformOf(req) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // ---- management (signed in) ----------------------------------------------------------

  /** Admin Tokens act for the owner but never manage the owner's passkeys. */
  function rejectApiToken(req, res) {
    if (!req.apiToken) return false;
    res.status(403).json(apiError("Passkeys can only be managed from a signed-in device.", null, { code: "SESSION_REQUIRED" }));
    return true;
  }

  async function reauthMethods(user) {
    const methods = [];
    if (user?.password_hash) methods.push("password");
    else if (user?.email && user.email_confirmed_at) methods.push("email");
    const totp = await d().totpState(user.id).catch(() => ({ enabled: false }));
    if (totp.enabled) methods.push("totp");
    return methods;
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const [rows, user] = await Promise.all([d().store.listByUser(req.user.id), d().loadBasicUser(req.user.id)]);
      const methods = await reauthMethods(user || { id: req.user.id });
      if (rows.some((r) => !r.suspended_at)) methods.push("passkey");
      noStore(res);
      return res.json({
        passkeys: rows.map(meta.publicPasskey),
        max: MAX_PASSKEYS_PER_USER,
        reauthMethods: methods,
        rpId: d().config.rpId,
        userHandle: Buffer.from(userHandleFor(req.user.id)).toString("base64url"),
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  function issueReauth(req, res) {
    noStore(res);
    return res.json({ reauthToken: d().signReauthToken({ id: req.user.id, sid: req.user.sid }), expiresInSec: 300 });
  }

  /** Valid passkey re-auth proof for this account and session, from the body or header. */
  function reauthValid(req) {
    const raw = req.body?.reauthToken || req.get("x-passkey-reauth");
    if (!raw || typeof raw !== "string") return false;
    try {
      const t = d().verifyToken(raw);
      return t?.scope === "passkey_reauth" && t.sub === req.user.id && (t.sid || null) === (req.user.sid || null);
    } catch {
      return false;
    }
  }

  function requireReauth(req, res) {
    if (reauthValid(req)) return true;
    res.status(428).json(apiError("Confirm it is you first.", null, { code: "REAUTH_REQUIRED" }));
    return false;
  }

  router.post("/reauth", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      const acctKey = `pkreauth:acct:${req.user.id}`;
      const ipKey = `pkreauth:ip:${ip(req)}`;
      if (rejectIfLimited(res, [peek(acctKey, LIMITS.reauth), peek(ipKey, LIMITS.reauth)])) return;
      const user = await d().loadBasicUser(req.user.id);
      if (!user) return res.status(404).json(apiError("User not found.", null, { code: "NO_USER" }));
      const password = req.body?.password;
      const code = String(req.body?.code || "").trim();
      const failed = (status, error, errCode) => {
        recordFailure(acctKey, LIMITS.reauth);
        recordFailure(ipKey, LIMITS.reauth);
        return res.status(status).json({ error, code: errCode });
      };
      if (typeof password === "string" && password) {
        if (!user.password_hash) return failed(400, "This account has no password.", "NO_PASSWORD");
        if (!(await d().verifyPassword(password, user.password_hash))) return failed(401, "Incorrect password.", "BAD_PASSWORD");
        return issueReauth(req, res);
      }
      if (/^\d{6}$/.test(code)) {
        // The account's authenticator app, when it is on.
        const totp = await d().totpState(user.id).catch(() => ({ enabled: false }));
        if (totp.enabled && (await d().verifyTotp(user.id, code).catch(() => false))) return issueReauth(req, res);
        // Accounts without a password: the code POST /email/reauth sent to the saved address.
        if (!user.password_hash && user.email && user.email_confirmed_at) {
          const verdict = await kit().judgeCode({
            userId: user.id,
            purpose: "email_reauth",
            code,
            storedHash: user.reauthentication_token,
            sentAtIso: user.reauthentication_sent_at,
          });
          if (verdict.ok) {
            await d().clearReauthCode(user.id).catch(() => {});
            return issueReauth(req, res);
          }
          if (verdict.reason === "too_many_attempts") return res.status(429).json(await kit().codeLockedBody(user.id, "email_reauth"));
        }
        return failed(401, "Incorrect code.", "BAD_CODE");
      }
      return res.status(400).json(apiError(user.password_hash ? "Enter your current password." : "Enter the code we sent you.", null, { code: "REAUTH_INPUT" }));
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/reauth/options", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkopt:acct:${req.user.id}`, LIMITS.options)) return;
      if (!(await ready(res))) return;
      const options = await d().service.authenticationOptions({ purpose: "reauth", userId: req.user.id, sessionId: req.user.sid || null });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/reauth/verify", requireAuth, async (req, res) => {
    const acctKey = `pkreauth:acct:${req.user.id}`;
    try {
      if (rejectApiToken(req, res)) return;
      if (rejectIfLimited(res, [peek(acctKey, LIMITS.reauth)])) return;
      if (!(await ready(res))) return;
      let result;
      try {
        result = await d().service.verifyAuthentication({
          response: req.body?.response,
          purpose: "reauth",
          userId: req.user.id,
          sessionId: req.user.sid || null,
          platform: platformOf(req),
        });
      } catch (err) {
        recordFailure(acctKey, LIMITS.reauth);
        if (err instanceof PasskeyError) {
          noteFailure(req, err, req.user.id);
          await handleClone(req, err);
        }
        return sendError(res, err);
      }
      if (!result.userVerified) {
        recordFailure(acctKey, LIMITS.reauth);
        return res.status(401).json(apiError("Your device did not confirm it is you (PIN, fingerprint or face).", null, { code: "UV_REQUIRED" }));
      }
      return issueReauth(req, res);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/register/options", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkreg:acct:${req.user.id}`, LIMITS.register)) return;
      if (!requireReauth(req, res)) return;
      if (!(await ready(res))) return;
      const user = await d().loadBasicUser(req.user.id);
      if (!user) return res.status(404).json(apiError("User not found.", null, { code: "NO_USER" }));
      const options = await d().service.registrationOptions({ user, sessionId: req.user.sid || null, platform: platformOf(req) });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  async function afterRegistered(req, user, row) {
    await d().notify(user, "passkeyAdded", req, { name: row.name }).catch((err) => {
      console.warn("[passkeys] added notice failed:", err?.message || err);
    });
    d().audit(user, "passkey_added", user.username, { passkeyId: row.id, platform: row.platform });
    d().emit(req, user.id, "passkeys:changed", { reason: "added" });
  }

  router.post("/register/verify", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!requireReauth(req, res)) return;
      if (!(await ready(res))) return;
      const user = await d().loadBasicUser(req.user.id);
      if (!user) return res.status(404).json(apiError("User not found.", null, { code: "NO_USER" }));
      const row = await d().service.verifyRegistration({
        user,
        sessionId: req.user.sid || null,
        response: req.body?.response,
        name: req.body?.name,
        platform: platformOf(req),
        userAgent: req.headers["user-agent"],
      });
      await afterRegistered(req, user, row);
      noStore(res);
      return res.status(201).json({ passkey: meta.publicPasskey(row) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  router.patch("/:id", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkmanage:acct:${req.user.id}`, LIMITS.manage)) return;
      if (!UUID_RE.test(String(req.params.id))) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      const name = meta.sanitizeName(req.body?.name);
      if (!name) return res.status(400).json(apiError("Enter a name.", null, { code: "BAD_NAME" }));
      if (!(await ready(res))) return;
      const row = await d().store.rename(req.params.id, req.user.id, name);
      if (!row) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      d().emit(req, req.user.id, "passkeys:changed", { reason: "renamed" });
      return res.json({ passkey: meta.publicPasskey(row) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.delete("/:id", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkmanage:acct:${req.user.id}`, LIMITS.manage)) return;
      if (!UUID_RE.test(String(req.params.id))) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      if (!(await ready(res))) return;
      const row = await d().store.remove(req.params.id, req.user.id);
      if (!row) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      const user = await d().loadBasicUser(req.user.id).catch(() => null);
      if (user) {
        await d().notify(user, "passkeyRemoved", req, { name: row.name }).catch(() => {});
        d().audit(user, "passkey_removed", user.username, { passkeyId: row.id });
      }
      d().emit(req, req.user.id, "passkeys:changed", { reason: "removed" });
      // credentialId lets the client tell the platform the key is gone (WebAuthn signal API).
      return res.json({ ok: true, credentialId: row.credential_id });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // ---- desktop browser handoff ---------------------------------------------------------

  router.post("/handoff", async (req, res) => {
    try {
      if (!countCall(res, `pkhand:ip:${ip(req)}`, LIMITS.handoff)) return;
      if (!(await ready(res))) return;
      const h = await d().service.createHandoff({ kind: "signin", platform: platformOf(req) });
      noStore(res);
      return res.status(201).json(h);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/register", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkhand:acct:${req.user.id}`, LIMITS.handoff)) return;
      if (!requireReauth(req, res)) return;
      if (!(await ready(res))) return;
      const h = await d().service.createHandoff({ kind: "register", userId: req.user.id, sessionId: req.user.sid || null, platform: platformOf(req) });
      noStore(res);
      return res.status(201).json(h);
    } catch (err) {
      return sendError(res, err);
    }
  });

  /** The pending handoff named by body.code, else answers 404 (and counts the miss). */
  async function handoffFromBody(req, res, kind) {
    const key = `pkhandcode:ip:${ip(req)}`;
    if (rejectIfLimited(res, [peek(key, LIMITS.handoffCode)])) return null;
    const h = await d().service.handoffByCode(req.body?.code);
    if (!h || (kind && h.kind !== kind)) {
      recordFailure(key, LIMITS.handoffCode);
      res.status(404).json(apiError("This link expired. Start again in the Descall app.", null, { code: "HANDOFF_EXPIRED" }));
      return null;
    }
    return h;
  }

  router.post("/handoff/info", async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const h = await handoffFromBody(req, res, null);
      if (!h) return;
      let username = null;
      if (h.kind === "register" && h.user_id) {
        const u = await d().loadBasicUser(h.user_id).catch(() => null);
        username = u?.username || null;
      }
      noStore(res);
      return res.json({ kind: h.kind, matchCode: h.match_code, expiresAt: h.expires_at, username });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/auth/options", async (req, res) => {
    try {
      if (!countCall(res, `pkopt:ip:${ip(req)}`, LIMITS.options)) return;
      if (!(await ready(res))) return;
      const h = await handoffFromBody(req, res, "signin");
      if (!h) return;
      const options = await d().service.authenticationOptions({ purpose: "authenticate", handoffId: h.id });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/auth/verify", async (req, res) => {
    const ipKey = `passkey:ip:${ip(req)}`;
    try {
      if (rejectIfLimited(res, [peek(ipKey, LIMITS.verifyIp)])) return;
      if (!(await ready(res))) return;
      const h = await handoffFromBody(req, res, "signin");
      if (!h) return;
      let result;
      try {
        result = await d().service.verifyAuthentication({ response: req.body?.response, purpose: "authenticate", handoffId: h.id, platform: h.platform });
      } catch (err) {
        recordFailure(ipKey, LIMITS.verifyIp);
        if (err instanceof PasskeyError) {
          noteFailure(req, err);
          await handleClone(req, err);
        }
        return sendError(res, err);
      }
      const done = await d().service.completeHandoff(h.id, { user_id: result.userId, user_verified: result.userVerified, credential_row_id: result.credential.id });
      if (!done) return res.status(409).json(apiError("This link was already used.", null, { code: "HANDOFF_USED" }));
      noStore(res);
      return res.json({ ok: true });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/register/options", async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const h = await handoffFromBody(req, res, "register");
      if (!h) return;
      if (!countCall(res, `pkreg:acct:${h.user_id}`, LIMITS.register)) return;
      const user = await d().loadBasicUser(h.user_id);
      if (!user) return res.status(404).json(apiError("This link expired. Start again in the Descall app.", null, { code: "HANDOFF_EXPIRED" }));
      const options = await d().service.registrationOptions({ user, sessionId: h.session_id || null, platform: h.platform, handoffId: h.id });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/register/verify", async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const h = await handoffFromBody(req, res, "register");
      if (!h) return;
      const user = await d().loadBasicUser(h.user_id);
      if (!user) return res.status(404).json(apiError("This link expired. Start again in the Descall app.", null, { code: "HANDOFF_EXPIRED" }));
      const row = await d().service.verifyRegistration({
        user,
        sessionId: h.session_id || null,
        handoffId: h.id,
        response: req.body?.response,
        name: req.body?.name,
        platform: h.platform,
        userAgent: req.headers["user-agent"],
      });
      const done = await d().service.completeHandoff(h.id, { credential_row_id: row.id, user_verified: true });
      if (!done) {
        // Another tab finished the same link first: keep one passkey, not two.
        await d().store.remove(row.id, user.id).catch(() => {});
        return res.status(409).json(apiError("This link was already used.", null, { code: "HANDOFF_USED" }));
      }
      await afterRegistered(req, user, row);
      noStore(res);
      return res.status(201).json({ ok: true, passkey: meta.publicPasskey(row) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/handoff/poll", async (req, res) => {
    try {
      if (!countCall(res, `pkpoll:ip:${ip(req)}`, LIMITS.poll)) return;
      if (!(await ready(res))) return;
      const h = await d().service.pollHandoff(req.body?.pollSecret);
      noStore(res);
      if (!h) return res.status(404).json(apiError("This sign-in request expired.", null, { status: "expired", code: "HANDOFF_EXPIRED" }));
      if (h.status === "failed") return res.json({ status: "failed" });
      if (h.status === "consumed") return res.status(410).json(apiError("This sign-in request was already used.", null, { status: "expired", code: "HANDOFF_USED" }));
      if (h.status === "pending") return res.json({ status: h.expired ? "expired" : "pending", matchCode: h.match_code });
      // completed: hand the result to the app exactly once.
      const taken = await d().service.consumeHandoff(h.id);
      if (!taken) return res.status(410).json(apiError("This sign-in request was already used.", null, { status: "expired", code: "HANDOFF_USED" }));
      if (h.kind === "register") {
        const row = h.credential_row_id ? await d().store.getById(h.credential_row_id) : null;
        return res.json({ status: "registered", passkey: meta.publicPasskey(row) });
      }
      return await completeSignIn(req, res, { userId: h.user_id, userVerified: Boolean(h.user_verified), platform: h.platform });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router._deps = d;
  return router;
}

module.exports = createPasskeyRouter();
module.exports.createPasskeyRouter = createPasskeyRouter;
module.exports.LIMITS = LIMITS;
