// Market 2.0 look links ("Arkadaşlarına göster"): a DM carries
//   https://<app>/shop/look/set/<setKey>   or   https://<app>/shop/look/item/<itemId>
// on its own line (backend lib/shop2/share.js parseShareText). Chat renders a look card for
// it, and the path opens the shop at that set or item. Pure helpers + a tiny focus bus.

export const LOOK_LINK_RE = /https?:\/\/[^\s/]+\/shop\/look\/(set|item)\/([A-Za-z0-9._%-]{1,120})/;
const LOOK_PATH_RE = /^\/shop\/look\/(set|item)\/([A-Za-z0-9._%-]{1,120})\/?$/;
export const SHOP2_FOCUS_EVENT = "descall:shop2-focus";

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** { kind, ref, note, link } of a message text with a look link, or null. */
export function parseLookText(text) {
  const s = String(text || "");
  const m = LOOK_LINK_RE.exec(s);
  if (!m) return null;
  const note = s.replace(m[0], "").trim();
  return { kind: m[1], ref: decode(m[2]), note: note || null, link: m[0] };
}

/** True when a chat message is a look share (cheap test for the message list). */
export const isLookText = (text) => typeof text === "string" && text.includes("/shop/look/") && LOOK_LINK_RE.test(text);

/** { kind, ref } for an app path /shop/look/set/<key> or /shop/look/item/<id>, or null. */
export function parseLookPath(pathname) {
  const m = LOOK_PATH_RE.exec(String(pathname || "").split("?")[0]);
  return m ? { kind: m[1], ref: decode(m[2]) } : null;
}

let pending = null;

/** Shop tabs a toast or link may open directly ({ kind: "tab", ref }). */
export const SHOP2_FOCUS_TABS = Object.freeze(["vitrin", "sets", "night", "wishlist", "gifts", "inventory", "all"]);

/** Ask the shop to open at a set, an item or a tab (the shop reads it on mount or live). */
export function requestShop2Focus({ kind, ref } = {}) {
  if (!ref || (kind !== "set" && kind !== "item" && !(kind === "tab" && SHOP2_FOCUS_TABS.includes(ref)))) return;
  pending = { kind, ref: String(ref), at: Date.now() };
  try {
    window.dispatchEvent(new CustomEvent(SHOP2_FOCUS_EVENT, { detail: pending }));
  } catch {
    /* no window (tests) */
  }
}

export function peekShop2Focus(now = Date.now()) {
  return pending && now - pending.at < 60_000 ? pending : null;
}

export function takeShop2Focus(now = Date.now()) {
  const p = peekShop2Focus(now);
  pending = null;
  return p;
}

/**
 * App route hook-up: call with the current path; a look path sets the focus and goes to the
 * shop (returns true). App.jsx: useEffect(() => { handleShopLookPath(location.pathname, navigate); }, [location.pathname]);
 */
export function handleShopLookPath(pathname, navigate) {
  const look = parseLookPath(pathname);
  if (!look) return false;
  requestShop2Focus(look);
  navigate?.("/settings/shop", { replace: true });
  return true;
}
