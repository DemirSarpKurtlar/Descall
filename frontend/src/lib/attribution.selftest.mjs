/**
 * Run: node frontend/src/lib/attribution.selftest.mjs
 */
import { captureVisit, peekAttribution, hasMarketingSignal } from "./attribution.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function fakeWindow({ search, href, pathname, referrer, localStorage, sessionStorage }) {
  return {
    location: { search, href, pathname },
    document: { referrer },
    localStorage,
    sessionStorage,
  };
}

const localStorage = memoryStorage();
const sessionStorage = memoryStorage();

const adsWin = fakeWindow({
  search: "?gclid=GCLID1&utm_source=google&utm_medium=cpc&utm_campaign=brand",
  href: "https://descall.com/?gclid=GCLID1&utm_source=google&utm_medium=cpc&utm_campaign=brand",
  pathname: "/",
  referrer: "https://www.google.com/",
  localStorage,
  sessionStorage,
});

captureVisit(adsWin);
const first = peekAttribution(adsWin);
assert(first.first.gclid === "GCLID1", "first visit stores gclid");
assert(hasMarketingSignal(first.first), "ads landing has marketing signal");

const later = fakeWindow({
  search: "",
  href: "https://descall.com/register",
  pathname: "/register",
  referrer: "",
  localStorage,
  sessionStorage,
});
captureVisit(later);
const after = peekAttribution(later);
assert(after.first.gclid === "GCLID1", "first-touch gclid is preserved after a later direct visit");
assert(after.last.landing_path === "/register", "last-touch updates to the later direct visit");
assert(!after.last.gclid, "later direct visit does not keep gclid on last touch");

console.log("attribution.selftest.mjs: ok");
