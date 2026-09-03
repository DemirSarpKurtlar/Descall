/**
 * First-party product analytics (Descall API). Never throws.
 * Third-party PostHog / Google Ads stay in site/analytics.js.
 */

import { API_BASE_URL } from "../config/api";
import { getVisitorKey, peekAttribution } from "./attribution";
import { getToken } from "./storage";

const VISIT_DAY_KEY = "descall:analytics:visitDay";
const SIGNUP_STARTED_KEY = "descall:analytics:signupStarted";
const APP_OPENED_KEY = "descall:analytics:appOpenedSession";

function postCollect(event, extra = {}) {
  try {
    if (typeof window === "undefined" || !event) return;
    const visitorKey = extra.visitorKey || getVisitorKey();
    if (!visitorKey) return;
    const body = JSON.stringify({
      event,
      visitorKey,
      attribution: peekAttribution() || undefined,
      props: extra.props && typeof extra.props === "object" ? extra.props : {},
    });
    const url = `${API_BASE_URL}/api/analytics/collect`;
    const token = extra.token || getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(url, {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

export function trackVisit() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(VISIT_DAY_KEY) === day) return;
    sessionStorage.setItem(VISIT_DAY_KEY, day);
  } catch {
    /* still send once this load */
  }
  postCollect("visit");
}

export function trackSignupStarted() {
  try {
    if (localStorage.getItem(SIGNUP_STARTED_KEY) === "1") return;
    localStorage.setItem(SIGNUP_STARTED_KEY, "1");
  } catch {
    /* continue */
  }
  postCollect("signup_started", { props: { path: "register" } });
}

export function trackAppOpened() {
  try {
    if (sessionStorage.getItem(APP_OPENED_KEY) === "1") return;
    sessionStorage.setItem(APP_OPENED_KEY, "1");
  } catch {
    /* continue */
  }
  postCollect("app_opened");
  postCollect("session_started");
}
