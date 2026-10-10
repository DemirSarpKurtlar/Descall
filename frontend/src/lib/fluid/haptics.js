/**
 * iOS haptics (Capacitor → UIKit feedback generators).
 *
 * One helper for the whole app. Web, Electron, Android and the PWA no-op:
 * UIKit generators only exist in the native iOS shell, and they already
 * respect the system Haptics switch. Reduce Motion changes animation, not
 * these taps — a commit still ticks.
 *
 * Fire once per causal event. The same kind inside 50ms collapses so a
 * pointerdown and the click it synthesizes cannot double-buzz. Do not call
 * these from scroll handlers or from a gesture that is still held; threshold
 * crossings own their own once-flag.
 *
 * Capacitor 8 exposes Light / Medium / Heavy. Rigid is Medium.
 * Selection is a one-shot UISelectionFeedbackGenerator tick (start, change, end
 * queued in order — selectionChanged alone is a no-op until start).
 */
import { isNativeIOS } from "../platform.js";
import { shouldEmitHaptic } from "./hapticCoalesce.js";

const COALESCE_MS = 50;

let plugin = null;
let loading = null;
let last = { kind: "", at: 0 };
let callLive = false;
let hintsInstalled = false;

export function primeHaptics() {
  if (!isNativeIOS()) return Promise.resolve(null);
  if (!loading) {
    loading = import("@capacitor/haptics")
      .then((mod) => {
        plugin = mod;
        return mod;
      })
      .catch(() => null);
  }
  return loading;
}

function mark(kind, now = Date.now()) {
  const next = shouldEmitHaptic(last.kind ? last : null, kind, now, COALESCE_MS);
  last = next.last;
  return next.emit;
}

export { shouldEmitHaptic };

function play(kind) {
  if (!isNativeIOS()) return;
  if (!mark(kind)) return;
  const run = (mod) => {
    if (!mod?.Haptics) return;
    try {
      if (kind === "selection") {
        mod.Haptics.selectionStart();
        mod.Haptics.selectionChanged();
        mod.Haptics.selectionEnd();
        return;
      }
      if (kind === "light" || kind === "medium") {
        const style = kind === "light" ? mod.ImpactStyle.Light : mod.ImpactStyle.Medium;
        mod.Haptics.impact({ style })?.catch?.(() => {});
        return;
      }
      const type = kind === "warning"
        ? mod.NotificationType.Warning
        : kind === "error"
          ? mod.NotificationType.Error
          : mod.NotificationType.Success;
      mod.Haptics.notification({ type })?.catch?.(() => {});
    } catch {
      /* old shell without the plugin */
    }
  };
  if (plugin) run(plugin);
  else primeHaptics().then(run);
}

/** UISelectionFeedback — tabs, chips, toggles, pickers, emoji, reactions. */
export function hapticSelection() {
  play("selection");
}

/** UIImpact light — primary presses, sheets, threshold commits. */
export function hapticImpactLight() {
  play("light");
}

/** UIImpact medium — long-press menus, pin, drag start, hang up. */
export function hapticImpactMedium() {
  play("medium");
}

/** Capacitor has no Rigid style; medium is that collision. */
export function hapticImpactRigid() {
  play("medium");
}

export function hapticSuccess() {
  play("success");
}

export function hapticWarning() {
  play("warning");
}

export function hapticError() {
  play("error");
}

/** One success per live call. Reset when the call actually ends. */
export function hapticCallConnected() {
  if (callLive) return;
  callLive = true;
  hapticSuccess();
}

export function resetCallHaptic() {
  callLive = false;
}

/** Back-compat for the reply-swipe and swipe-back commits. */
export function hapticLight() {
  hapticImpactLight();
}

const EXCLUSIVE_CURRENT = [
  ".g-tab[aria-current='page']",
  ".mobile-tab.active",
  ".us-segment.selected",
  ".us-theme-card.selected",
  ".shop-category-tab.active",
  ".calls-filter-chip.active",
  ".auth-tab.active",
  ".us-nav-item.active",
  ".status-picker-item.active",
  ".report-reason-chip.active",
  ".g-activity-seg button.on",
  "[role='tab'][aria-selected='true']",
].join(",");

const SELECTION = [
  "[role='switch']",
  ".us-toggle",
  "input[type='checkbox']",
  "input[type='radio']",
  "[role='tab']",
  ".g-tab",
  ".mobile-tab",
  ".us-segment",
  ".us-theme-card",
  ".shop-category-tab",
  ".calls-filter-chip",
  ".auth-tab",
  ".us-nav-item",
  ".status-picker-item",
  ".emoji-btn",
  ".emoji-chip",
  ".report-reason-chip",
  ".lfg-role-chip",
  ".g-activity-seg button",
].join(",");

const LIGHT = [
  "button.is-brand",
  "button.us-btn.primary",
  "button.lfg-btn.primary",
  "button.auth-submit",
  "button.btn-primary",
].join(",");

/** Which hint a press should make, or null. Exclusive controls that are already current stay quiet. */
export function hapticKindForElement(target) {
  if (!target || typeof target.closest !== "function") return null;
  const field = target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  if (field) {
    const type = typeof field.getAttribute === "function" ? field.getAttribute("type") : "";
    const tag = String(field.tagName || "").toUpperCase();
    if (tag === "INPUT" && (type === "checkbox" || type === "radio")) {
      if (field.disabled) return null;
      return "selection";
    }
    return null;
  }
  const control = target.closest("button, [role='switch'], [role='tab']");
  if (control && (control.disabled || control.getAttribute?.("aria-disabled") === "true")) return null;
  const selected = target.closest(SELECTION);
  if (selected) {
    if (typeof selected.matches === "function" && selected.matches(EXCLUSIVE_CURRENT)) return null;
    return "selection";
  }
  const primary = target.closest(LIGHT);
  if (!primary) return null;
  if (primary.disabled || primary.getAttribute?.("aria-disabled") === "true") return null;
  return "light";
}

/**
 * Capture-phase pointerdown hints for controls that share a class.
 * Semantic events (send, failure, long-press, call, drag commit) stay explicit.
 */
export function installIosHapticHints() {
  if (!isNativeIOS() || typeof document === "undefined" || hintsInstalled) return;
  hintsInstalled = true;
  document.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    const kind = hapticKindForElement(event.target);
    if (!kind) return;
    primeHaptics();
    if (kind === "selection") hapticSelection();
    else hapticImpactLight();
  }, { capture: true, passive: true });
}
