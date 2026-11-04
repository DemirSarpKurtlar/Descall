/**
 * Run: node frontend/src/lib/attributionSources.selftest.mjs
 * Landing referrer/UTM survive SPA reloads and OAuth round-trips.
 */
import { captureVisit, peekAttribution } from "./attribution.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function win({ search = "", pathname = "/", referrer = "", ls, ss, extra = {} }) {
  return { location: { search, href: `https://descall.com${pathname}${search}`, pathname }, document: { referrer }, localStorage: ls, sessionStorage: ss, ...extra };
}

const ls = mem();
const ss = mem();
captureVisit(win({ search: "?utm_source=tiktok&utm_medium=social&ttclid=t1", referrer: "https://www.tiktok.com/", ls, ss }));
// SPA reload from own host and Google OAuth return must not erase last-touch.
captureVisit(win({ pathname: "/register", referrer: "https://descall.com/", ls, ss }));
captureVisit(win({ pathname: "/", referrer: "https://accounts.google.com/", ls, ss }));
let a = peekAttribution({ localStorage: ls, sessionStorage: ss });
assert(a.first.utm_source === "tiktok", "first keeps tiktok");
assert(a.last.utm_source === "tiktok", "last survives own-host + oauth return");
assert(a.first.landing_page.includes("ttclid=t1"), "ttclid kept in landing URL for server-side parsing");

// A genuinely new external visit does update last-touch.
captureVisit(win({ referrer: "https://www.reddit.com/r/x", ls, ss }));
a = peekAttribution({ localStorage: ls, sessionStorage: ss });
assert(a.last.referrer.includes("reddit"), "new external visit updates last");
assert(a.first.utm_source === "tiktok", "first is write-once");





console.log("attributionSources.selftest.mjs: ok");
