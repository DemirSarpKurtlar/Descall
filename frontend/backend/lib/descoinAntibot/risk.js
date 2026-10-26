"use strict";

/**
 * Pure risk scoring (plan §7). Inputs are already-aggregated signals.
 * Faz 0: the score is only stored and shown; `multiplierFor` is what the later
 * withhold stage *would* apply and is used only for the "would withhold"
 * shadow counter.
 */

const WEIGHTS = {
  timing_regular: 25,
  automation_client: 30,
  headless: 15,
  rate_extreme: 15,
  linked_account: 35,
  referral_insular: 20,
  new_unverified: 10,
  missing_client_signals: 5,
};

/** Coefficient of variation of the gaps between timestamps (ms). null if too few. */
function timingCv(timestamps, minSamples = 12) {
  const t = (timestamps || []).slice().sort((a, b) => a - b);
  if (t.length < minSamples) return null;
  const gaps = [];
  for (let i = 1; i < t.length; i += 1) gaps.push(t[i] - t[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  return sd / mean;
}

const AUTOMATION_UA = /(headless|phantomjs|puppeteer|playwright|selenium|webdriver|python-requests|python|aiohttp|node-fetch|axios|okhttp|go-http-client|curl|wget|socket\.io-client-node)/i;

function isAutomationUa(ua) {
  if (!ua) return true; // a real browser/Electron/WebView always sends one
  return AUTOMATION_UA.test(String(ua).slice(0, 512));
}

/**
 * @param {object} s
 * @param {number|null} s.messageCv
 * @param {boolean} s.automationUa
 * @param {boolean} s.webdriver
 * @param {boolean} s.headlessHints
 * @param {number} s.activeHours24
 * @param {number} s.dayCapsHit       distinct activity reasons that hit their day cap today
 * @param {boolean} s.linked
 * @param {boolean} s.referralInsular
 * @param {number} s.accountAgeDays
 * @param {boolean} s.emailVerified
 * @param {boolean} s.clientSignalsSeen
 * @param {boolean} [s.clientSignalsExpected] only then is a silent client a signal
 *        (the client-side sender ships later; until then this never scores)
 * @returns {{score:number, reasons:string[]}}
 */
function scoreRisk(s) {
  const reasons = [];
  if (s.messageCv != null && s.messageCv < 0.15) reasons.push("timing_regular");
  if (s.automationUa || s.webdriver) reasons.push("automation_client");
  if (s.headlessHints) reasons.push("headless");
  if ((s.activeHours24 || 0) > 18 || (s.dayCapsHit || 0) >= 3) reasons.push("rate_extreme");
  if (s.linked) reasons.push("linked_account");
  if (s.referralInsular) reasons.push("referral_insular");
  if ((s.accountAgeDays ?? 999) < 3 && !s.emailVerified) reasons.push("new_unverified");
  if (s.clientSignalsExpected && !s.clientSignalsSeen) reasons.push("missing_client_signals");
  const score = Math.min(100, reasons.reduce((sum, r) => sum + WEIGHTS[r], 0));
  return { score, reasons };
}

/** Earning multiplier for a score (only applied when the withhold stage is on). */
function multiplierFor(score, trusted, thresholds = { half: 40, zero: 70 }) {
  if (trusted) return 1;
  if (score >= thresholds.zero) return 0;
  if (score >= thresholds.half) return 0.5;
  return 1;
}

/**
 * Two accounts are "linked" only with ≥2 independent signals, so a shared
 * family PC or school network alone never links anyone (plan §11).
 */
function linkStrength(sig) {
  const kinds = [];
  if (sig.sameDevice) kinds.push("same_device");
  if (sig.sameSubnet) kinds.push("same_subnet");
  if (sig.referralPair) kinds.push("referral_pair");
  if (sig.signupClose) kinds.push("signup_close");
  if (sig.insular) kinds.push("insular_pair");
  return { linked: kinds.length >= 2, kinds };
}

module.exports = { WEIGHTS, timingCv, isAutomationUa, scoreRisk, multiplierFor, linkStrength };
