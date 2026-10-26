"use strict";

/**
 * DesCoin anti-bot rollout flags.
 *
 * This build is **Faz 0 (monitor only)**: signals and risk scores are
 * collected, stored (hashed) and shown to admins/moderators. Nobody's earning,
 * caps, balance or wallet changes. The enforcing stages below are parsed so
 * the admin status endpoint can show what is configured, but ENFORCEMENT_BUILD
 * is false, so they are forced off no matter what the env says. Turning one on
 * needs a later PR (Faz 1-3) that flips ENFORCEMENT_BUILD and wires the gate,
 * after Demir's approval.
 *
 *   DESCOIN_ANTIBOT_MONITOR=1           Faz 0  collect signals + risk scores (default ON; "0" = anti-bot fully off)
 *   DESCOIN_ANTIBOT_RATES=1             Faz 1  new rates / caps            (locked off in this build)
 *   DESCOIN_ANTIBOT_MESSAGE_RULES=1     Faz 1  message earning rules       (locked off in this build)
 *   DESCOIN_ANTIBOT_REFERRAL_PENDING=1  Faz 1  delayed referral rewards    (locked off in this build)
 *   DESCOIN_ANTIBOT_MEDIA_RULES=1       Faz 2  screen share / voice rules  (locked off in this build)
 *   DESCOIN_ANTIBOT_WITHHOLD=1          Faz 3  risk-based withhold         (locked off in this build)
 *
 *   DESCOIN_ANTIBOT_ALERT_EMAIL=1       email Demir when an account crosses the alert score (default OFF)
 *   DESCOIN_ANTIBOT_ALERT_PUSH=1        admin-only iOS push for the same alert         (default OFF)
 *   DESCOIN_ANTIBOT_ALERT_MIN=70        alert threshold (score)
 *   DESCOIN_ANTIBOT_ALERT_EMAIL_TO      recipient (default: REPORT_ALERT_EMAIL, else demirkurtlar@icloud.com)
 *   DESCOIN_ANTIBOT_HASH_SECRET         HMAC key for device / network hashes (falls back to a key derived from JWT_SECRET)
 *   DESCOIN_ANTIBOT_SCHEDULER=0         do not start the periodic risk / retention jobs
 */

/** Faz 0: enforcing stages cannot be enabled from env in this build. */
const ENFORCEMENT_BUILD = false;

function flag(name, def, env = process.env) {
  const raw = env[name];
  if (raw == null || raw === "") return def;
  return /^(1|true|on|yes)$/i.test(String(raw).trim());
}

const ENFORCING = ["rates", "messageRules", "referralPending", "mediaRules", "withhold"];
const ENV_NAMES = {
  rates: "DESCOIN_ANTIBOT_RATES",
  messageRules: "DESCOIN_ANTIBOT_MESSAGE_RULES",
  referralPending: "DESCOIN_ANTIBOT_REFERRAL_PENDING",
  mediaRules: "DESCOIN_ANTIBOT_MEDIA_RULES",
  withhold: "DESCOIN_ANTIBOT_WITHHOLD",
};

let warnedLocked = false;

/** What the env asks for (shown on the admin status endpoint). */
function getRequestedFlags(env = process.env) {
  const out = { monitor: flag("DESCOIN_ANTIBOT_MONITOR", true, env) };
  for (const k of ENFORCING) out[k] = flag(ENV_NAMES[k], false, env);
  return out;
}

/** Effective flags: in this build every enforcing stage is false. */
function getFlags(env = process.env) {
  const req = getRequestedFlags(env);
  const out = { monitor: req.monitor };
  for (const k of ENFORCING) out[k] = ENFORCEMENT_BUILD ? req[k] : false;
  if (!ENFORCEMENT_BUILD && !warnedLocked && ENFORCING.some((k) => req[k])) {
    warnedLocked = true;
    console.warn("[antibot] enforcement flags are set but this is a monitor-only (Faz 0) build; ignoring them");
  }
  return out;
}

function getAlertFlags(env = process.env) {
  const min = Number(env.DESCOIN_ANTIBOT_ALERT_MIN);
  return {
    email: flag("DESCOIN_ANTIBOT_ALERT_EMAIL", false, env),
    push: flag("DESCOIN_ANTIBOT_ALERT_PUSH", false, env),
    minScore: Number.isFinite(min) && min >= 1 && min <= 100 ? Math.round(min) : 70,
  };
}

/** Signal collection runs only when monitoring is on. */
function collecting(f = getFlags()) {
  return Boolean(f.monitor);
}

/** Thresholds the later withhold stage would use (Faz 0: reported as "would"). */
const RISK = { half: 40, zero: 70 };
/** Device / network hash + link + alert retention (KVKK decision, 25 Oct 2026). */
const RETENTION_DAYS = 90;
/** Message similarity fingerprints are short-lived. */
const MESSAGE_FP_RETENTION_DAYS = 7;

module.exports = {
  ENFORCEMENT_BUILD,
  getFlags,
  getRequestedFlags,
  getAlertFlags,
  collecting,
  RISK,
  RETENTION_DAYS,
  MESSAGE_FP_RETENTION_DAYS,
  _resetWarn: () => {
    warnedLocked = false;
  },
};
