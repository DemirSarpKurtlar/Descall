/**
 * Android system back.
 *
 * App (Capacitor): MainActivity calls window.__descallAndroidBack() and expects
 * "handled" or "exit". One back stack for every layer, top first:
 *   menu → dialog / sheet / picker → settings section → settings → classic
 *   drawer over a chat → conversation → open server → home tab → exit.
 * "exit" is only returned on the home tab so Android can finish the activity.
 *
 * Android Chrome (glass phone web): menus and sheets do not own a history
 * entry, so the back gesture used to pop the route (closing the chat under an
 * open menu). installWebBackDismiss() pushes one entry while a layer is open
 * and closes the layer on popstate instead.
 */

/** Pre-role overlays that are not [role=dialog]. */
const LEGACY_OVERLAYS = [
  ".modal-backdrop",
  ".server-modal-overlay",
  ".add-modal-backdrop",
  ".img-crop-overlay",
  ".message-media-lightbox",
  ".members-panel",
];

const MENU_SELECTOR = "[role='menu'], [role='listbox']";
const DIALOG_SELECTOR = "[role='dialog'], [role='alertdialog'], [aria-modal='true']";

/** Close-button names in the 7 UI languages. */
const CLOSE_LABEL = /^(close|kapat|schlie(ß|ss)en|cerrar|fermer|fechar|закрыть)$/i;

/** Pure: does an aria-label / title name a close action? */
export function isCloseLabel(label) {
  return CLOSE_LABEL.test(String(label || "").trim());
}

/**
 * Pure decision (androidBack.selftest.mjs). `facts` is what the DOM shows:
 * menu / dialog / settingsSection / settings / drawerOverConversation /
 * conversation / server (an open server's channel list) / view (data-view).
 */
export function decideAndroidBack(facts = {}) {
  if (facts.menu) return "menu";
  if (facts.dialog) return "dialog";
  if (facts.settingsSection) return "settings-section";
  if (facts.settings) return "settings";
  if (facts.drawerOverConversation) return "drawer";
  if (facts.conversation) return "conversation";
  if (facts.server) return "server";
  if (facts.view && facts.view !== "chat") return "home";
  return "exit";
}

function win(doc) {
  return doc?.defaultView || (typeof window !== "undefined" ? window : null);
}

function isVisible(el) {
  if (!el || el.nodeType !== 1) return false;
  const w = win(el.ownerDocument);
  const style = w.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function stackRank(el) {
  const style = win(el.ownerDocument).getComputedStyle(el);
  const z = Number.parseInt(style.zIndex, 10);
  return Number.isFinite(z) ? z : 0;
}

/** Highest z-index wins; on a tie the later node in the DOM (opened later) wins. */
function topmost(elements) {
  let best = null;
  let bestRank = -Infinity;
  elements.forEach((el, index) => {
    const rank = stackRank(el) * 1000 + index;
    if (rank > bestRank) {
      best = el;
      bestRank = rank;
    }
  });
  return best;
}

/** Innermost element: a nested menu inside a sheet goes first. */
function innermost(elements) {
  const list = elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
  return topmost(list.length ? list : elements);
}

function visibleAll(doc, selector) {
  return [...doc.querySelectorAll(selector)].filter(isVisible);
}

function findDialog(doc) {
  const dialogs = visibleAll(doc, DIALOG_SELECTOR)
    // The settings window is a step of its own (section → menu → close).
    .filter((el) => !el.classList.contains("user-settings-shell") && !el.closest(".user-settings-shell"));
  const legacy = LEGACY_OVERLAYS.flatMap((selector) => visibleAll(doc, selector)).filter((el) => {
    if (el.classList.contains("members-panel")) return win(doc).getComputedStyle(el).position === "fixed";
    return true;
  });
  const all = [...dialogs, ...legacy];
  return all.length ? innermost(all) : null;
}

/** Facts + the element each step acts on. */
export function findAndroidBackTarget(doc = document) {
  const menus = visibleAll(doc, MENU_SELECTOR);
  if (menus.length) return { action: "menu", element: innermost(menus) };

  const dialog = findDialog(doc);
  if (dialog) return { action: "dialog", element: dialog };

  const settings = [...doc.querySelectorAll(".user-settings-shell")].find(isVisible);
  if (settings) {
    const sectionBack = [...settings.querySelectorAll(".s3-back")].find(isVisible);
    if (sectionBack) return { action: "settings-section", element: sectionBack };
    return { action: "settings", element: settings };
  }

  const root = doc.querySelector(".app-root.is-mobile");
  if (root?.classList.contains("mobile-drawer-open") && root.classList.contains("in-conversation")) {
    const backdrop = doc.querySelector(".mobile-drawer-backdrop");
    if (isVisible(backdrop)) return { action: "drawer", element: backdrop };
  }

  const conversationBack = doc.querySelector(".app-root.is-mobile.in-conversation [data-mobile-back]");
  if (isVisible(conversationBack)) return { action: "conversation", element: conversationBack };

  const serverBack = [...doc.querySelectorAll(".app-root.is-mobile .server-back-btn")].find(isVisible);
  if (serverBack) return { action: "server", element: serverBack };

  const view = root?.getAttribute("data-view") || "";
  if (view && view !== "chat") {
    const home = doc.querySelector(".g-tabbar .g-tab[data-tab-index='0'], .mobile-tab-bar .mobile-tab[data-tab-index='0']");
    if (home) return { action: "home", element: home };
  }
  return { action: "exit" };
}

/** Escape from the focused element, so document AND window listeners both hear it. */
export function sendEscape(doc = document) {
  const active = doc.activeElement;
  const target = active && active !== doc.body && active !== doc.documentElement ? active : doc.body || doc.documentElement;
  const KE = win(doc).KeyboardEvent;
  target.dispatchEvent(new KE("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}

function closeButton(root) {
  const explicit = root.querySelector("[data-android-back-close]");
  if (explicit) return explicit;
  const buttons = [...root.querySelectorAll("button")].filter(isVisible);
  const labeled = buttons.find((button) =>
    !button.classList.contains("user-profile-more")
    && (isCloseLabel(button.getAttribute("aria-label")) || isCloseLabel(button.getAttribute("title"))));
  if (labeled) return labeled;
  return buttons.find((button) => /(^|[\s-])close(\b|-btn)/i.test(button.className || "") && !/more|option/i.test(button.className || "")) || null;
}

/** A menu's own outside-tap catcher / scrim: a sibling of the menu or of one of its wrappers. */
function menuCatcher(menu) {
  let node = menu;
  for (let depth = 0; node && node.parentElement && depth < 4; depth += 1) {
    const parent = node.parentElement;
    const hit = [...parent.children].find((el) => el !== node && /catcher|scrim|backdrop/i.test(el.className || "") && isVisible(el));
    if (hit) return hit;
    if (parent.tagName === "BODY") break;
    node = parent;
  }
  return null;
}

/** Outside press: the "click away" path every menu supports. */
function pressOutside(doc) {
  const w = win(doc);
  const at = { bubbles: true, cancelable: true, clientX: 1, clientY: 1, button: 0, pointerType: "touch", isPrimary: true };
  const target = doc.body || doc.documentElement;
  try { target.dispatchEvent(new w.PointerEvent("pointerdown", at)); } catch { /* old engine */ }
  target.dispatchEvent(new w.MouseEvent("mousedown", at));
  target.dispatchEvent(new w.MouseEvent("mouseup", at));
}

/**
 * A real press: glass controls arm on pointerdown and act on the click that
 * follows (glassMessageMenu.js pressToActivate), so a bare .click() is ignored.
 */
export function pressElement(el) {
  if (!el) return;
  const w = win(el.ownerDocument);
  const r = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const at = {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerType: "touch",
    isPrimary: true,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  };
  try {
    el.dispatchEvent(new w.PointerEvent("pointerdown", at));
    el.dispatchEvent(new w.PointerEvent("pointerup", at));
  } catch {
    /* engine without PointerEvent */
  }
  el.click();
}

// Escalation: the first back on a layer asks it nicely (Escape); if it is still
// there a moment later, or on the next back, its own close control is used.
const FALLBACK_MS = 180;
let lastLayer = null;

function stillShown(el) {
  return Boolean(el && el.isConnected && isVisible(el));
}

/** Fading out (exit animation in progress) counts as closed: never press through it. */
function isClosing(el) {
  try {
    if (el.closest?.("[aria-hidden='true'], [inert]")) return true;
    return Number(win(el.ownerDocument).getComputedStyle(el).opacity) < 0.95;
  } catch {
    return false;
  }
}

function forceClose(target, doc) {
  const el = target.element;
  if (!stillShown(el) || isClosing(el)) return;
  if (target.action === "menu") {
    const catcher = menuCatcher(el);
    if (catcher) pressElement(catcher);
    else pressOutside(doc);
    return;
  }
  const button = el.matches?.("button") ? el : closeButton(el);
  if (button) pressElement(button);
  else if (/backdrop|overlay|scrim/i.test(el.className || "")) pressElement(el);
  else sendEscape(doc);
}

function runLayer(target, doc) {
  const repeat = lastLayer === target.element && stillShown(target.element);
  lastLayer = target.element;
  if (repeat) {
    forceClose(target, doc);
    return "handled";
  }
  // A menu with its own scrim closes exactly like a tap outside it, and the
  // Escape cannot leak to a sheet underneath.
  const catcher = target.action === "menu" ? menuCatcher(target.element) : null;
  if (catcher) {
    pressElement(catcher);
    return "handled";
  }
  sendEscape(doc);
  win(doc).setTimeout(() => forceClose(target, doc), FALLBACK_MS);
  return "handled";
}

export function runAndroidBack(doc = document) {
  const target = findAndroidBackTarget(doc);
  if (target.action === "exit") {
    lastLayer = null;
    return "exit";
  }
  if (target.action === "menu" || target.action === "dialog") return runLayer(target, doc);
  lastLayer = null;
  if (target.action === "settings") {
    const button = closeButton(target.element);
    if (button) pressElement(button);
    else sendEscape(doc);
    return "handled";
  }
  pressElement(target.element);
  return "handled";
}

export function handleAndroidBack() {
  return runAndroidBack(document);
}

export function installAndroidBack() {
  if (typeof window === "undefined") return;
  window.__descallAndroidBack = handleAndroidBack;
}

/** Pure: is there a layer the back gesture should close first? */
export function hasBackLayer(doc = document) {
  const t = findAndroidBackTarget(doc);
  return t.action === "menu" || t.action === "dialog" || t.action === "settings-section";
}

const LAYER_STATE = "__descallBackLayer";

/**
 * Android Chrome: while a menu / sheet / dialog is open, keep one extra history
 * entry (same URL) so the system back closes the layer, not the route under it.
 */
export function installWebBackDismiss(w = typeof window !== "undefined" ? window : null) {
  if (!w || w.__descallWebBackDismiss) return;
  const doc = w.document;
  if (!doc?.body || typeof w.MutationObserver !== "function") return;
  w.__descallWebBackDismiss = true;
  let armed = false;
  let raf = 0;

  const check = () => {
    raf = 0;
    const open = hasBackLayer(doc);
    if (open && !armed) {
      armed = true;
      try {
        w.history.pushState({ ...(w.history.state || {}), [LAYER_STATE]: 1 }, "", w.location.href);
      } catch {
        armed = false;
      }
    } else if (!open && armed && w.history.state?.[LAYER_STATE]) {
      // Closed by a tap: drop the extra entry so the next back is a real back.
      armed = false;
      w.history.back();
    } else if (!open) {
      armed = false;
    }
  };
  const schedule = () => {
    if (!raf) raf = w.requestAnimationFrame(check);
  };

  new w.MutationObserver(schedule).observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // No "style": springs write it every frame.
    attributeFilter: ["class", "hidden", "aria-hidden", "open"],
  });

  w.addEventListener("popstate", () => {
    if (!armed) return;
    armed = false;
    if (hasBackLayer(doc)) runAndroidBack(doc);
  });
}
