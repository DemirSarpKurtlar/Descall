/**
 * Android system back for the Capacitor shell.
 * MainActivity calls window.__descallAndroidBack() and expects "handled" or "exit".
 * Exit is only returned at the app root so Android can finish the activity.
 */

const OVERLAY_SELECTORS = [
  ".modal-backdrop",
  ".server-modal-overlay",
  ".lfg-modal-overlay",
  ".add-modal-backdrop",
  ".user-settings-shell",
  ".img-crop-overlay",
  ".message-media-lightbox",
  ".members-panel",
];

function isVisible(el) {
  if (!el || el.nodeType !== 1) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function stackRank(el) {
  const style = window.getComputedStyle(el);
  const z = Number.parseInt(style.zIndex, 10);
  return Number.isFinite(z) ? z : 0;
}

function closeButton(root) {
  const buttons = [...root.querySelectorAll("button")];
  const labeled = buttons.find((button) => {
    const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`.trim();
    return /^(close|kapat)$/i.test(label);
  });
  if (labeled) return labeled;
  const classed = buttons.find((button) => /close/i.test(button.className || ""));
  if (classed) return classed;
  return root.querySelector("header button, .add-modal-header button, .modal-header button");
}

function topmost(elements) {
  let best = null;
  let bestRank = -1;
  elements.forEach((el, index) => {
    const rank = stackRank(el) * 1000 + index;
    if (rank >= bestRank) {
      best = el;
      bestRank = rank;
    }
  });
  return best;
}

export function findAndroidBackTarget(doc = document) {
  const menu = [...doc.querySelectorAll("[role='menu']")].filter(isVisible);
  if (menu.length) return { action: "menu" };

  const overlays = OVERLAY_SELECTORS.flatMap((selector) => [...doc.querySelectorAll(selector)]).filter((el) => {
    if (!isVisible(el)) return false;
    if (el.classList.contains("members-panel")) {
      return window.getComputedStyle(el).position === "fixed";
    }
    return true;
  });
  const direct = [...doc.querySelectorAll(".user-profile-close")].filter(isVisible);
  const overlay = topmost([...overlays, ...direct]);
  if (overlay) return { action: "overlay", element: overlay };

  const lfgBack = doc.querySelector(".lfg-main.is-open .lfg-mobile-detail-back");
  if (isVisible(lfgBack)) return { action: "lfg-detail", element: lfgBack };

  const root = doc.querySelector(".app-root.is-mobile");
  if (root?.classList.contains("mobile-drawer-open") && root.classList.contains("in-conversation")) {
    const backdrop = doc.querySelector(".mobile-drawer-backdrop");
    if (isVisible(backdrop)) return { action: "drawer", element: backdrop };
  }

  const conversationBack = doc.querySelector(".app-root.is-mobile.in-conversation [data-mobile-back]");
  if (isVisible(conversationBack)) return { action: "conversation", element: conversationBack };

  return { action: "exit" };
}

function runTarget(target) {
  if (target.action === "menu") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return "handled";
  }
  if (target.action === "exit") return "exit";
  const el = target.element;
  if (!el) return "exit";
  if (target.action === "overlay") {
    const button = el.matches("button") ? el : closeButton(el);
    if (button) button.click();
    else el.click();
    return "handled";
  }
  el.click();
  return "handled";
}

export function handleAndroidBack() {
  return runTarget(findAndroidBackTarget(document));
}

export function installAndroidBack() {
  if (typeof window === "undefined") return;
  window.__descallAndroidBack = handleAndroidBack;
}
