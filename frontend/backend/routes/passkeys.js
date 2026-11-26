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
 *   DELETE /:id { reason, endSessions }        -> { ok, sessionsEnded } (own passkeys only)
 *
 * Control center (Settings > Security > Passkeys, lib/passkeys/center.js):
 *   GET    /center                             -> passkeys with places + 30-day uses, summary
 *                                                  (score, sign-in mix, speed), activity, alerts
 *   POST   /alerts/:id/resolve { action }       -> "me" (it was me) | "revoke" (remove the
 *                                                  passkey and end the other sessions)
 *   POST   /report/info    { token }            -> what the e-mail link is about (public)
 *   POST   /report/resolve { token, action }    -> "confirm" | "revoke" (public, one time):
 *                                                  revoke removes the passkey and ends every
 *                                                  session of the account
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
const center = require("../lib/passkeys/center");
const { peek, recordFailure, rejectIfLimited } = require("../lib/rateLimit");
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
  report: { max: 30 },
};

/** A session this young counts as a fresh sign-in: adding a passkey needs no second prompt. */
const FRESH_SESSION_MS = 10 * 60 * 1000;
const FRESH_METHODS = new Set(["password", "passkey", "google", "apple", "2fa_totp", "2fa_email", "2fa_recovery", "register"]);
const MAIL_KINDS = { passkeyAdded: "added", passkeyNewPlace: "newPlace", passkeyRevokedByReport: "revoked" };

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
      if (MAIL_KINDS[kind]) {
        // Designed e-mail with the "Ben degildim" / "Bendim" buttons (lib/passkeys/securityMail.js).
        const { buildPasskeySecurityEmail } = require("../lib/passkeys/securityMail");
        const tzRaw = String(req?.headers?.["cf-timezone"] || req?.headers?.["x-vercel-ip-timezone"] || "");
        const timeZone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(tzRaw) ? tzRaw : undefined;
        const mail = buildPasskeySecurityEmail({ kind: MAIL_KINDS[kind], lang, timeZone, base: readConfig().desktopOrigin, ...vars });
        await sendEmail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
        return;
      }
      const subject = bt(lang, `security.${kind}Subject`);
      const text = bt(lang, `security.${kind}Body`, { ...vars, support: SUPPORT_EMAIL });
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      await sendEmail({ to: user.email, subject, text, html: `<p>${esc(text)}</p><p>${esc(SUPPORT_EMAIL)}</p>` });
    },
    async sessionsOf(userId) {
      return sessions.listSessions(userId);
    },
    async endSessions(req, userId, ids) {
      const removed = await sessions.removeSessions(userId, ids);
      require("./auth").passkeyKit.revokeSessionIds(req, userId, removed);
      return removed;
    },
    geo(req) {
      return center.placeFromHeaders(req?.headers || {});
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
  /**
   * History of a passkey sign-in (best effort, never blocks the sign-in): the coarse place,
   * the 30-day usage row and, when the passkey was never used from this place before, a
   * new-place alert with a "Ben degildim" e-mail.
   */
  async function recordUse(req, { user, credential, platform, durationMs }) {
    try {
      if (!credential?.id || typeof d().store.insertEvent !== "function") return;
      const geo = typeof d().geo === "function" ? d().geo(req) : { country: "", city: "" };
      const at = new Date(d().now ? d().now() : Date.now()).toISOString();
      const places = Array.isArray(credential.places) ? credential.places : [];
      const fresh = center.isNewPlace(places, geo);
      await d().store.setPlaces(credential.id, {
        places: center.mergePlace(places, geo, at),
        last_used_country: geo.country || null,
        last_used_city: geo.city || null,
      });
      const base = {
        user_id: user.id,
        credential_row_id: credential.id,
        credential_name: String(credential.name || "").slice(0, 64) || null,
        platform: meta.normalizePlatform(platform),
        device: meta.deviceFromUserAgent(req.headers?.["user-agent"]),
        country: geo.country || null,
        city: geo.city || null,
      };
      await d().store.insertEvent({ ...base, kind: "signin", at, duration_ms: center.cleanDuration(durationMs) });
      if (!fresh) return;
      const report = center.newReportToken(d().now ? d().now() : Date.now());
      const alert = await d().store.insertEvent({
        ...base,
        kind: "new_place",
        at,
        report_hash: report.hash,
        report_expires_at: report.expiresAt,
        detail: { previous: places.slice(0, 3).map((p) => ({ country: p.country, city: p.city || "" })) },
      });
      if (!alert) return;
      d().emit(req, user.id, "passkeys:changed", { reason: "alert" });
      await d()
        .notify(user, "passkeyNewPlace", req, { name: credential.name, provider: meta.providerName(credential.aaguid) || "", at, place: geo, token: report.token })
        .catch(() => {});
    } catch (err) {
      console.warn("[passkeys] history:", err?.message || err);
    }
  }

  async function completeSignIn(req, res, { userId, userVerified, platform, credential = null, durationMs = null }) {
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
      passkeyId: credential?.id || undefined,
      signInMs: center.cleanDuration(durationMs) || undefined,
    });
    const token = d().signToken({ id: user.id, username: user.username, sid: session.id });
    await d().afterLogin(user.id, platform);
    await recordUse(req, { user, credential, platform, durationMs });
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
      return await completeSignIn(req, res, {
        userId: result.userId,
        userVerified: result.userVerified,
        platform: platformOf(req),
        credential: result.credential,
        durationMs: req.body?.durationMs,
      });
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

  /** This request's session, when the sessions list is available (null otherwise). */
  async function currentSession(req) {
    if (typeof d().sessionsOf !== "function" || !req.user?.sid) return null;
    const list = await d().sessionsOf(req.user.id).catch(() => []);
    return (Array.isArray(list) ? list : []).find((s) => s && s.id === req.user.sid) || null;
  }

  /** Signed in within the last 10 minutes (any real sign-in method): counts as re-auth. */
  async function freshSignIn(req) {
    if (req.apiToken) return false;
    const s = await currentSession(req);
    const created = Date.parse(s?.createdAt || "");
    const now = d().now ? d().now() : Date.now();
    return Boolean(s && FRESH_METHODS.has(String(s.method || "")) && Number.isFinite(created) && now - created >= 0 && now - created < FRESH_SESSION_MS);
  }

  async function requireReauth(req, res) {
    if (reauthValid(req)) return true;
    if (await freshSignIn(req)) return true;
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
      if (!(await requireReauth(req, res))) return;
      if (!(await ready(res))) return;
      const user = await d().loadBasicUser(req.user.id);
      if (!user) return res.status(404).json(apiError("User not found.", null, { code: "NO_USER" }));
      const prefer = req.body?.prefer === "securityKey" || req.body?.prefer === "remoteDevice" ? req.body.prefer : undefined;
      const options = await d().service.registrationOptions({ user, sessionId: req.user.sid || null, platform: platformOf(req), prefer });
      noStore(res);
      return res.json(options);
    } catch (err) {
      return sendError(res, err);
    }
  });

  async function afterRegistered(req, user, row) {
    let token;
    try {
      if (typeof d().store.insertEvent === "function") {
        const geo = typeof d().geo === "function" ? d().geo(req) : { country: "", city: "" };
        const at = new Date(d().now ? d().now() : Date.now()).toISOString();
        await d().store.setPlaces(row.id, {
          created_country: geo.country || null,
          created_city: geo.city || null,
          places: center.mergePlace([], geo, at),
        });
        const report = center.newReportToken(d().now ? d().now() : Date.now());
        const ev = await d().store.insertEvent({
          user_id: user.id,
          credential_row_id: row.id,
          credential_name: row.name,
          kind: "added",
          at,
          platform: row.platform || null,
          device: meta.deviceFromUserAgent(req.headers?.["user-agent"]),
          country: geo.country || null,
          city: geo.city || null,
          report_hash: report.hash,
          report_expires_at: report.expiresAt,
        });
        if (ev) token = report.token;
        row.__geo = geo;
      }
    } catch (err) {
      console.warn("[passkeys] history:", err?.message || err);
    }
    await d()
      .notify(user, "passkeyAdded", req, { name: row.name, provider: meta.providerName(row.aaguid) || "", at: row.created_at, place: row.__geo, token })
      .catch((err) => {
        console.warn("[passkeys] added notice failed:", err?.message || err);
      });
    delete row.__geo;
    d().audit(user, "passkey_added", user.username, { passkeyId: row.id, platform: row.platform });
    d().emit(req, user.id, "passkeys:changed", { reason: "added" });
  }

  router.post("/register/verify", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!(await requireReauth(req, res))) return;
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
      const before = await d().store.getById(req.params.id).catch(() => null);
      const row = await d().store.rename(req.params.id, req.user.id, name);
      if (!row) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      await history(req, { kind: "renamed", row, detail: { from: before?.name || null } });
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
      const reason = center.cleanReason(req.body?.reason || req.query?.reason);
      const endSessions = req.body?.endSessions === true || req.query?.endSessions === "1";
      const row = await d().store.remove(req.params.id, req.user.id);
      if (!row) return res.status(404).json(apiError("Passkey not found.", null, { code: "NOT_FOUND" }));
      // "Undo" right after adding: the person just made it here, no e-mail about it.
      const nowMs = d().now ? d().now() : Date.now();
      const quietUndo = reason === "undo" && nowMs - Date.parse(row.created_at || 0) < 10 * 60 * 1000;
      const user = await d().loadBasicUser(req.user.id).catch(() => null);
      if (user) {
        if (!quietUndo) await d().notify(user, "passkeyRemoved", req, { name: row.name }).catch(() => {});
        d().audit(user, "passkey_removed", user.username, { passkeyId: row.id, reason });
      }
      // The sessions this passkey opened (never the one making the request).
      let ended = [];
      if (endSessions && typeof d().endSessions === "function") {
        const list = (await d().sessionsOf(req.user.id).catch(() => [])) || [];
        const ids = list.filter((s) => s && s.passkeyId === row.id && s.id !== req.user.sid).map((s) => s.id);
        if (ids.length) ended = await d().endSessions(req, req.user.id, ids).catch(() => []);
      }
      await history(req, { kind: "removed", row, detail: { reason, sessionsEnded: ended.length } });
      d().emit(req, req.user.id, "passkeys:changed", { reason: "removed" });
      // credentialId lets the client tell the platform the key is gone (WebAuthn signal API).
      return res.json({ ok: true, credentialId: row.credential_id, sessionsEnded: ended.length });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // ---- control center ------------------------------------------------------------------

  const nowMs = () => (d().now ? d().now() : Date.now());

  /** One history row for a management action (best effort). */
  async function history(req, { kind, row, detail = {}, userId = null }) {
    try {
      if (typeof d().store.insertEvent !== "function") return null;
      const geo = typeof d().geo === "function" ? d().geo(req) : { country: "", city: "" };
      return await d().store.insertEvent({
        user_id: userId || req.user?.id || row?.user_id,
        credential_row_id: row?.id || null,
        credential_name: String(row?.name || "").slice(0, 64) || null,
        kind,
        at: new Date(nowMs()).toISOString(),
        platform: meta.normalizePlatform(req.body?.platform || req.get?.("x-descall-platform") || "web"),
        device: meta.deviceFromUserAgent(req.headers?.["user-agent"]),
        country: geo.country || null,
        city: geo.city || null,
        detail,
      });
    } catch {
      return null;
    }
  }

  let lastPrune = 0;

  router.get("/center", requireAuth, async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const now = nowMs();
      const since = new Date(now - center.USAGE_DAYS * 86400000).toISOString();
      const [rows, user, events, recent, sessionList] = await Promise.all([
        d().store.listByUser(req.user.id),
        d().loadBasicUser(req.user.id),
        typeof d().store.listEvents === "function" ? d().store.listEvents(req.user.id, { sinceIso: since, limit: 1000, kinds: ["signin"] }) : [],
        typeof d().store.listEvents === "function" ? d().store.listEvents(req.user.id, { limit: 40 }) : [],
        typeof d().sessionsOf === "function" ? d().sessionsOf(req.user.id).catch(() => []) : [],
      ]);
      if (now - lastPrune > 3600 * 1000 && typeof d().store.pruneEvents === "function") {
        lastPrune = now;
        d().store.pruneEvents(new Date(now - 400 * 86400000).toISOString()).catch(() => {});
      }
      const totp = await d().totpState(req.user.id).catch(() => ({ enabled: false }));
      const methods = await reauthMethods(user || { id: req.user.id });
      if (rows.some((r) => !r.suspended_at)) methods.push("passkey");
      const uses = new Map();
      for (const e of events) {
        if (!e.credential_row_id) continue;
        if (!uses.has(e.credential_row_id)) uses.set(e.credential_row_id, []);
        uses.get(e.credential_row_id).push(e.at);
      }
      const durations = events.map((e) => center.cleanDuration(e.duration_ms)).filter(Boolean);
      const passkeys = rows.map((r) => ({
        ...meta.publicPasskey(r),
        createdCountry: r.created_country || null,
        createdCity: r.created_city || null,
        lastCountry: r.last_used_country || null,
        lastCity: r.last_used_city || null,
        places: (Array.isArray(r.places) ? r.places : []).slice(0, 6).map((p) => ({ country: p.country, city: p.city || "", last: p.last, n: p.n })),
        uses30: (uses.get(r.id) || []).slice(0, 400),
        idleDays: center.idleDays(r, now),
        family: center.familyOf({ ...r, provider: meta.providerName(r.aaguid) }),
      }));
      const mix = center.methodMix(sessionList);
      const score = center.securityScore({ user: user || {}, totp: Boolean(totp.enabled), passkeys: rows.map((r) => ({ ...r, provider: meta.providerName(r.aaguid) })), nowMs: now });
      const alerts = recent
        .filter((e) => e.kind === "new_place" && !e.resolved_at && now - Date.parse(e.at) < 30 * 86400000)
        .map(center.publicEvent);
      const current = (sessionList || []).find((x) => x && x.id === req.user.sid) || null;
      noStore(res);
      return res.json({
        passkeys,
        max: MAX_PASSKEYS_PER_USER,
        reauthMethods: methods,
        rpId: d().config.rpId,
        userHandle: Buffer.from(userHandleFor(req.user.id)).toString("base64url"),
        staleDays: center.STALE_DAYS,
        geo: typeof d().geo === "function" ? (d().geo(req).city ? "city" : d().geo(req).country ? "country" : "none") : "none",
        freshSignIn: await freshSignIn(req),
        currentPasskeyId: current?.passkeyId || null,
        summary: {
          count: rows.length,
          families: score.families,
          mix,
          avgPasskeyMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
          avgPasswordMs: mix.avgPasswordMs,
          score: { value: score.value, level: score.level, checks: score.checks, methods: score.methods },
          staleCount: score.staleCount,
          suspendedCount: score.suspendedCount,
          password: Boolean(user?.password_hash),
          totp: Boolean(totp.enabled),
          email2fa: Boolean(user?.two_factor_enabled),
          emailConfirmed: Boolean(user?.email && user?.email_confirmed_at),
        },
        activity: recent.filter((e) => e.kind !== "new_place" || e.resolved_at).slice(0, 30).map(center.publicEvent),
        alerts,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  /** End every other session of the account (the current one stays). */
  async function endOtherSessions(req, userId, keepSid) {
    if (typeof d().endSessions !== "function") return [];
    const list = (await d().sessionsOf(userId).catch(() => [])) || [];
    const ids = list.filter((s) => s && s.id && s.id !== keepSid).map((s) => s.id);
    return ids.length ? d().endSessions(req, userId, ids).catch(() => []) : [];
  }

  router.post("/alerts/:id/resolve", requireAuth, async (req, res) => {
    try {
      if (rejectApiToken(req, res)) return;
      if (!countCall(res, `pkmanage:acct:${req.user.id}`, LIMITS.manage)) return;
      if (!UUID_RE.test(String(req.params.id))) return res.status(404).json(apiError("Alert not found.", null, { code: "NOT_FOUND" }));
      const action = req.body?.action === "revoke" ? "revoke" : req.body?.action === "me" ? "me" : null;
      if (!action) return res.status(400).json(apiError("Choose an answer.", null, { code: "BAD_ACTION" }));
      if (!(await ready(res))) return;
      const ev = typeof d().store.getEvent === "function" ? await d().store.getEvent(req.params.id, req.user.id) : null;
      if (!ev || ev.kind !== "new_place") return res.status(404).json(apiError("Alert not found.", null, { code: "NOT_FOUND" }));
      const done = await d().store.resolveEvent(ev.id, action === "revoke" ? "revoked" : "confirmed");
      if (!done) return res.status(409).json(apiError("This alert was already answered.", null, { code: "ALREADY_RESOLVED" }));
      let removed = null;
      let ended = [];
      if (action === "revoke") {
        removed = ev.credential_row_id ? await d().store.remove(ev.credential_row_id, req.user.id) : null;
        ended = await endOtherSessions(req, req.user.id, req.user.sid);
        const user = await d().loadBasicUser(req.user.id).catch(() => null);
        if (user) d().audit(user, "passkey_alert_revoked", user.username, { passkeyId: ev.credential_row_id, sessionsEnded: ended.length });
        await history(req, { kind: "removed", row: removed || { id: ev.credential_row_id, name: ev.credential_name }, detail: { reason: "alert", sessionsEnded: ended.length } });
      }
      d().emit(req, req.user.id, "passkeys:changed", { reason: "alert" });
      return res.json({ ok: true, removed: Boolean(removed), credentialId: removed?.credential_id || null, sessionsEnded: ended.length });
    } catch (err) {
      return sendError(res, err);
    }
  });

  /** The open report named by body.token, else answers (404 / 410) and returns null. */
  async function reportFromBody(req, res) {
    const key = `pkreport:ip:${ip(req)}`;
    if (rejectIfLimited(res, [peek(key, LIMITS.report)])) return null;
    const token = req.body?.token;
    const ev = center.isReportToken(token) && typeof d().store.getEventByReportHash === "function" ? await d().store.getEventByReportHash(center.sha256hex(token)) : null;
    if (!ev) {
      recordFailure(key, LIMITS.report);
      res.status(404).json(apiError("This link is not valid.", null, { code: "REPORT_NOT_FOUND" }));
      return null;
    }
    if (Date.parse(ev.report_expires_at || 0) <= nowMs() && !ev.resolved_at) {
      res.status(410).json(apiError("This link expired. Sign in and check Settings > Security.", null, { code: "REPORT_EXPIRED" }));
      return null;
    }
    return ev;
  }

  router.post("/report/info", async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const ev = await reportFromBody(req, res);
      if (!ev) return;
      const row = ev.credential_row_id ? await d().store.getById(ev.credential_row_id).catch(() => null) : null;
      noStore(res);
      return res.json({
        kind: ev.kind,
        name: ev.credential_name || row?.name || null,
        provider: row ? meta.providerName(row.aaguid) : null,
        at: ev.at,
        platform: ev.platform || null,
        device: ev.device || null,
        country: ev.country || null,
        city: ev.city || null,
        passkeyExists: Boolean(row && row.user_id === ev.user_id),
        resolution: ev.resolution || null,
        resolvedAt: ev.resolved_at || null,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/report/resolve", async (req, res) => {
    try {
      if (!(await ready(res))) return;
      const action = req.body?.action === "revoke" ? "revoke" : req.body?.action === "confirm" ? "confirm" : null;
      if (!action) return res.status(400).json(apiError("Choose an answer.", null, { code: "BAD_ACTION" }));
      const ev = await reportFromBody(req, res);
      if (!ev) return;
      const done = await d().store.resolveEvent(ev.id, action === "revoke" ? "revoked" : "confirmed");
      if (!done) return res.status(409).json(apiError("This link was already used.", null, { code: "ALREADY_RESOLVED", resolution: ev.resolution || null }));
      if (action === "confirm") {
        await history(req, { kind: "report_confirmed", row: { id: ev.credential_row_id, name: ev.credential_name }, userId: ev.user_id });
        d().emit(req, ev.user_id, "passkeys:changed", { reason: "alert" });
        noStore(res);
        return res.json({ ok: true, resolution: "confirmed" });
      }
      // "Ben degildim": the passkey goes, every session of the account ends (the person
      // reading the mail may not be signed in anywhere; the attacker must not stay).
      const removed = ev.credential_row_id ? await d().store.remove(ev.credential_row_id, ev.user_id).catch(() => null) : null;
      let ended = [];
      if (typeof d().endSessions === "function") {
        const list = (await d().sessionsOf(ev.user_id).catch(() => [])) || [];
        const ids = list.map((s) => s && s.id).filter(Boolean);
        if (ids.length) ended = await d().endSessions(req, ev.user_id, ids).catch(() => []);
      }
      await history(req, { kind: "report_revoked", row: { id: ev.credential_row_id, name: ev.credential_name }, userId: ev.user_id, detail: { sessionsEnded: ended.length, removed: Boolean(removed) } });
      const user = await d().loadBasicUser(ev.user_id).catch(() => null);
      if (user) {
        d().audit(user, "passkey_report_revoked", user.username, { passkeyId: ev.credential_row_id, sessionsEnded: ended.length });
        await d().notify(user, "passkeyRevokedByReport", req, { name: ev.credential_name || "Passkey", at: new Date(nowMs()).toISOString(), sessions: ended.length }).catch(() => {});
      }
      d().securityNote("account_locked", { req, userId: ev.user_id, reason: "passkey_report", detail: { method: "passkey", sessionsEnded: ended.length } });
      d().emit(req, ev.user_id, "passkeys:changed", { reason: "removed" });
      noStore(res);
      return res.json({ ok: true, resolution: "revoked", removed: Boolean(removed), credentialId: removed?.credential_id || null, sessionsEnded: ended.length });
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
      if (!(await requireReauth(req, res))) return;
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
      const credential = h.credential_row_id ? await d().store.getById(h.credential_row_id).catch(() => null) : null;
      return await completeSignIn(req, res, { userId: h.user_id, userVerified: Boolean(h.user_verified), platform: h.platform, credential });
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
