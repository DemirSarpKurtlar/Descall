/**
 * iOS 26 Liquid Glass tab bar (DescallGlassTabBarPlugin.swift).
 *
 * The native bar is a real UITabBar over the WebView: Apple's glass and press
 * lens. It is only ever used when it is ACTUALLY on screen: the plugin has to
 * exist (iOS app), report iOS 26+, and resolve `show` with `shown: true`.
 * Anything else (mobile web, Android, desktop, iOS < 26, a plugin error, a
 * timeout) leaves `active` false and the web CSS glass bar renders as before.
 * The web bar stays in the DOM under the native one (invisible), so tab
 * layout, safe-area padding and the "is something covering the bar" check
 * keep working from the same element.
 */
import { useEffect, useRef, useState } from "react";

/** SF Symbols for the app's tabs (same meaning as tabBarIcons.jsx). */
export const TAB_SYMBOLS = Object.freeze({
  chat: "bubble.left.and.bubble.right",
  groups: "person.3",
  servers: "server.rack",
  friends: "person.2",
  activity: "bolt",
  calls: "phone",
});

export const NATIVE_TABBAR_CLASS = "native-tabbar";
const SHOW_TIMEOUT_MS = 2500;
/**
 * Cover checks used to poll every 250 ms forever (getBoundingClientRect + 3x
 * elementFromPoint, i.e. a forced style/layout + hit test 4 times a second on
 * every screen, even with nothing on screen changing: iPhone idle energy).
 * They now run only when something could have changed (DOM / class / style
 * mutation, transition or animation end, resize, visibility), at most once per
 * COVER_MIN_GAP_MS, plus one trailing check COVER_SETTLE_MS after the last
 * change so a sheet that slides in is seen once it is in place.
 */
export const COVER_MIN_GAP_MS = 200;
export const COVER_SETTLE_MS = 350;
const COVER_ATTRS = ["class", "style", "hidden", "open", "aria-hidden", "data-state"];
const COVER_EVENTS = ["transitionend", "animationend", "transitioncancel"];

/** Badge as the native side shows it: "" for none, "99+" above 99. */
export function badgeLabel(value) {
  const n = Number(value) || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(Math.floor(n));
}

/** `items` ({ id, label }) + `badges` (id → count) → plugin `tabs`. */
export function nativeTabsPayload(items, badges = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.id)
    .map((it) => ({
      id: String(it.id),
      title: String(it.label ?? it.id),
      symbol: TAB_SYMBOLS[it.id] || "circle",
      badge: badgeLabel(badges?.[it.id]),
    }));
}

export function badgesPayload(items, badges = {}) {
  const out = {};
  for (const it of Array.isArray(items) ? items : []) if (it?.id) out[it.id] = badgeLabel(badges?.[it.id]);
  return out;
}

/**
 * Whether the native bar is "in use": confirmed shown at least once
 * (`engaged`) and wanted on this screen. While in use the web bar stays
 * invisible (`.is-native`) even when the native bar is momentarily hidden for
 * a sheet / long-press menu / keyboard, and until `show()` confirms it is back.
 * The web bar must only paint when the native bar is really unavailable
 * (show() said no, an update failed, web, iOS < 26). Before this the hide for
 * a cover dropped `.is-native`, and the old web bar flashed under the server
 * long-press menu and again after it closed (iPhone, 3.0.0).
 */
export function nativeBarInUse({ wanted = false, active = false, engaged = false } = {}) {
  return Boolean(wanted && (active || engaged));
}

/** "dark" | "light" for the native bar from the glass theme's --g-scheme. */
export function barStyleFor(scheme) {
  return String(scheme || "").trim() === "light" ? "light" : "dark";
}

/**
 * Coalesces "something may have changed" pokes into `check()` calls: the first
 * poke checks on the next timer turn, later ones at most every `minGapMs`, and
 * one trailing check runs `settleMs` after the last poke. No pokes, no work.
 */
export function createCoalescedCheck(check, {
  setT = (fn, ms) => setTimeout(fn, ms),
  clearT = (id) => clearTimeout(id),
  now = () => Date.now(),
  minGapMs = COVER_MIN_GAP_MS,
  settleMs = COVER_SETTLE_MS,
} = {}) {
  let timer = 0;
  let settle = 0;
  let last = -Infinity;
  let disposed = false;
  const run = () => {
    if (disposed) return;
    last = now();
    check();
  };
  const poke = () => {
    if (disposed) return;
    if (!timer) {
      timer = setT(() => {
        timer = 0;
        run();
      }, Math.max(0, last + minGapMs - now()));
    }
    if (settle) clearT(settle);
    settle = setT(() => {
      settle = 0;
      run();
    }, settleMs);
  };
  return {
    poke,
    dispose() {
      disposed = true;
      if (timer) clearT(timer);
      if (settle) clearT(settle);
      timer = 0;
      settle = 0;
    },
  };
}

/**
 * True when something other than the web bar is on top of it at its own
 * centre line (a sheet, menu or overlay). The native bar would float over that
 * overlay, so it hides while covered. `rect` is the bar's client rect.
 */
export function barCovered(bar, rect, hitTest) {
  if (!bar || !rect || rect.width <= 0 || rect.height <= 0) return true;
  const y = rect.top + rect.height / 2;
  const xs = [rect.left + rect.width * 0.12, rect.left + rect.width / 2, rect.right - rect.width * 0.12];
  for (const x of xs) {
    const hit = hitTest(x, y);
    if (!hit || !(hit === bar || bar.contains(hit))) return true;
  }
  return false;
}

function isIosApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

/**
 * Resolves `{ plugin }`, never the plugin itself. A Capacitor plugin proxy
 * answers every property, `then` included, so resolving a promise with it
 * makes the promise adopt it as a thenable: it calls the native "then"
 * method, which does not exist, and the promise never settles. That kept
 * `available` false and the web bar on screen in 2.13.11.
 */
export function loadPluginBox(importCore = () => import("@capacitor/core")) {
  return Promise.resolve()
    .then(importCore)
    .then(({ registerPlugin }) => ({ plugin: registerPlugin("DescallGlassTabBar") }))
    .catch(() => ({ plugin: null }));
}

let pluginPromise = null;
function loadPlugin() {
  if (!pluginPromise) pluginPromise = loadPluginBox();
  return pluginPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

function readScheme() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue("--g-scheme");
  } catch {
    return "";
  }
}

/**
 * Drives the native bar. `selector` finds the web bar (kept rendered).
 * Returns true while the native bar is in use (see nativeBarInUse): the web
 * bar stays hidden, including while the native one steps aside for an overlay.
 */
export function useNativeGlassTabBar({ enabled, items, activeId, badges, onSelect, selector = ".g-tabbar" }) {
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(false);
  // Native bar confirmed shown once and not given up on since (show() said no
  // or update() failed). Only that brings the web bar back.
  const [engaged, setEngaged] = useState(false);
  const [covered, setCovered] = useState(false);
  const pluginRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ items, activeId, badges });
  latest.current = { items, activeId, badges };

  // Plugin presence + iOS 26 check, once. Web never loads the plugin.
  useEffect(() => {
    if (!isIosApp()) return undefined;
    let cancelled = false;
    const subs = [];
    (async () => {
      const { plugin } = (await withTimeout(loadPlugin(), SHOW_TIMEOUT_MS)) || {};
      if (!plugin || cancelled) return;
      const res = await withTimeout(plugin.isAvailable?.().catch(() => null), SHOW_TIMEOUT_MS);
      if (cancelled || !res?.available) return;
      pluginRef.current = plugin;
      try {
        subs.push(await plugin.addListener("select", (e) => e?.id && onSelectRef.current?.(e.id)));
        subs.push(
          await plugin.addListener("layout", (e) => {
            const h = Math.max(0, Number(e?.height) || 0);
            document.documentElement.style.setProperty("--native-tabbar-h", `${Math.round(h)}px`);
          })
        );
      } catch {
        /* listeners are best-effort; show() still decides `active` */
      }
      if (!cancelled) setAvailable(true);
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s?.remove?.());
    };
  }, []);

  // Hide the native bar while an overlay covers the web bar or the keyboard is up.
  const wanted = available && enabled;
  useEffect(() => {
    if (!wanted) {
      setCovered(false);
      return undefined;
    }
    const check = () => {
      const root = document.documentElement;
      const bar = document.querySelector(selector);
      const hidden = root.classList.contains("kb-bar-hidden") || document.hidden;
      const next = hidden || barCovered(bar, bar?.getBoundingClientRect?.(), (x, y) => document.elementFromPoint(x, y));
      setCovered((prev) => (prev === next ? prev : next));
    };
    check();
    const watch = createCoalescedCheck(check);
    const root = document.documentElement;
    let mo = null;
    if (typeof MutationObserver === "function") {
      mo = new MutationObserver(watch.poke);
      mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: COVER_ATTRS });
    }
    for (const ev of COVER_EVENTS) document.addEventListener(ev, watch.poke, true);
    window.addEventListener("resize", watch.poke);
    document.addEventListener("visibilitychange", watch.poke);
    return () => {
      mo?.disconnect();
      for (const ev of COVER_EVENTS) document.removeEventListener(ev, watch.poke, true);
      window.removeEventListener("resize", watch.poke);
      document.removeEventListener("visibilitychange", watch.poke);
      watch.dispose();
    };
  }, [wanted, selector]);

  const show = wanted && !covered;
  const tabsKey = JSON.stringify(nativeTabsPayload(items).map((t) => [t.id, t.title, t.symbol]));

  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return undefined;
    let cancelled = false;
    if (!show) {
      // Stepping aside (overlay, keyboard, a screen without the bar) keeps
      // `engaged`: the web bar stays hidden and the native one comes back.
      setActive(false);
      plugin.hide?.().catch?.(() => {});
      return undefined;
    }
    const { items: its, activeId: sel, badges: b } = latest.current;
    withTimeout(
      plugin
        .show({ tabs: nativeTabsPayload(its, b), selected: sel ?? null, style: barStyleFor(readScheme()) })
        .catch(() => null),
      SHOW_TIMEOUT_MS
    ).then((res) => {
      if (cancelled) return;
      const shown = Boolean(res?.shown);
      setActive(shown);
      setEngaged(shown);
    });
    return () => {
      cancelled = true;
    };
  }, [show, tabsKey]);

  // Selection, badges and theme follow without re-creating the tabs.
  const badgeKey = JSON.stringify(badgesPayload(items, badges));
  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin || !active) return;
    plugin
      .update({ selected: activeId ?? null, badges: JSON.parse(badgeKey), style: barStyleFor(readScheme()) })
      .catch(() => {
        setActive(false);
        setEngaged(false);
      });
  }, [active, activeId, badgeKey]);

  const inUse = nativeBarInUse({ wanted, active, engaged });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(NATIVE_TABBAR_CLASS, inUse);
    return () => root.classList.remove(NATIVE_TABBAR_CLASS);
  }, [inUse]);

  useEffect(
    () => () => {
      pluginRef.current?.hide?.().catch?.(() => {});
    },
    []
  );

  return inUse;
}
