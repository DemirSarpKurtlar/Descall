import { useLayoutEffect, useMemo, useRef } from "react";
import { createDragController } from "../lib/fluid/drag";
import { createValueAnimator } from "../lib/fluid/animator";
import { hapticTabLift, hapticTabTick } from "../lib/fluid/haptics";
import { SPRINGS } from "../lib/fluid/springs";
import {
  TAB_DECEL,
  TAB_HOLD_MS,
  TAB_LIFT_SCALE,
  TAB_SLOP_PX,
  previewTabIndex,
  tabReleasePreset,
} from "../lib/fluid/tabBarDrag";

/**
 * Press-and-hold + drag on a mobile tab bar.
 *
 * The pill is one compositor transform (translate + scale), written from
 * requestAnimationFrame. Icon/label classes change only when the finger
 * crosses a tab. A quick pointerup before the lift stays a normal click —
 * this hook does not navigate on a tap, so the tab changes on the same frame
 * as today.
 *
 * mode "fraction": glass lens, translate3d(index * 100%, …).
 * mode "stride": classic bar, translate by the measured button pitch.
 * hotClass: "on" (glass) or "active" (classic) on [data-tab-index].
 */
function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function releasePressedTabs(nav, pointerId) {
  nav.querySelectorAll("[data-pressed]").forEach((el) => {
    el.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      cancelable: true,
      pointerId,
    }));
    el.style.transform = "";
    el.removeAttribute("data-pressed");
  });
}

export function useTabBarDrag({
  count,
  activeIndex,
  enabled = true,
  mode = "fraction",
  hotClass = "on",
  onCommit,
}) {
  const navRef = useRef(null);
  const lensRef = useRef(null);
  const countRef = useRef(count);
  const activeRef = useRef(activeIndex);
  const commitRef = useRef(onCommit);
  const modeRef = useRef(mode);
  const hotClassRef = useRef(hotClass);
  const reducedRef = useRef(false);
  const ownedRef = useRef(false);
  const hotRef = useRef(null);
  const metricsRef = useRef({ stride: 1 });
  const measuredKeyRef = useRef(null);
  const paintRef = useRef(() => {});
  countRef.current = count;
  activeRef.current = activeIndex;
  commitRef.current = onCommit;
  modeRef.current = mode;
  hotClassRef.current = hotClass;

  const xAnim = useMemo(
    () => createValueAnimator(activeIndex, () => paintRef.current(), { scale: 0.01 }),
    // One writer for the life of the bar. Retargets from the live value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const scaleAnim = useMemo(
    () => createValueAnimator(1, () => paintRef.current(), { scale: 0.001 }),
    []
  );

  const markHot = (index) => {
    const nav = navRef.current;
    if (!nav || index == null) return;
    const cls = hotClassRef.current;
    nav.querySelectorAll("[data-tab-index]").forEach((el) => {
      el.classList.toggle(cls, Number(el.dataset.tabIndex) === index);
    });
  };

  paintRef.current = () => {
    const lens = lensRef.current;
    if (!lens) return;
    const x = xAnim.value;
    const scale = reducedRef.current ? 1 : scaleAnim.value;
    if (modeRef.current === "stride") {
      const stride = metricsRef.current.stride || 0;
      lens.style.transform = `translate3d(${(x * stride).toFixed(2)}px,0,0) scale(${scale.toFixed(4)})`;
    } else {
      lens.style.transform = `translate3d(${(x * 100).toFixed(3)}%,0,0) scale(${scale.toFixed(4)})`;
    }
  };

  const measure = () => {
    const nav = navRef.current;
    const lens = lensRef.current;
    if (!nav || !lens) return 1;
    if (modeRef.current === "stride") {
      const buttons = nav.querySelectorAll("[data-tab-index]");
      const first = buttons[0];
      if (!first) return metricsRef.current.stride || 1;
      const second = buttons[1];
      const stride = Math.max(1, second ? second.offsetLeft - first.offsetLeft : first.offsetWidth);
      metricsRef.current = { stride };
      lens.style.left = `${first.offsetLeft}px`;
      lens.style.width = `${first.offsetWidth}px`;
      lens.style.top = `${first.offsetTop}px`;
      lens.style.height = `${first.offsetHeight}px`;
      return stride;
    }
    const box = lens.getBoundingClientRect().width;
    const stride = Math.max(1, box || nav.getBoundingClientRect().width / Math.max(1, countRef.current));
    metricsRef.current = { stride };
    return stride;
  };

  useLayoutEffect(() => {
    reducedRef.current = prefersReducedMotion();
    if (ownedRef.current) {
      if (hotRef.current != null) markHot(hotRef.current);
      return;
    }
    // A tab tap commits the new route in the same task, so measuring here
    // forces a synchronous layout of that whole route before paint (~50ms
    // per switch on a 4x-throttled phone). The pitch only changes with the
    // tab count, mode or bar size, and the ResizeObserver below re-measures
    // on size changes, so a plain index change reuses the cached stride.
    const key = `${count}|${enabled ? 1 : 0}|${modeRef.current}`;
    if (measuredKeyRef.current !== key || !metricsRef.current.stride) {
      measure();
      measuredKeyRef.current = key;
    }
    const lens = lensRef.current;
    if (reducedRef.current || !lens?.dataset.ready) {
      xAnim.set(activeIndex);
      if (lens) lens.dataset.ready = "1";
    } else {
      xAnim.to(activeIndex, { preset: SPRINGS.move });
    }
  }, [activeIndex, count, enabled, xAnim]);

  useLayoutEffect(() => {
    if (ownedRef.current && hotRef.current != null) markHot(hotRef.current);
  });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return undefined;

    let pointerId = null;
    let lifted = false;
    let timer = 0;
    let drag = null;
    let stride = 1;
    let liftGen = 0;
    let releaseGen = 0;
    let suppressClick = false;

    const setLifted = (on) => {
      const lens = lensRef.current;
      if (lens) lens.classList.toggle("is-lifted", on && !reducedRef.current);
      nav.classList.toggle("is-dragging", on);
    };

    const dropLift = () => {
      const gen = ++liftGen;
      lifted = false;
      if (reducedRef.current) {
        scaleAnim.set(1);
        setLifted(false);
        return;
      }
      scaleAnim.to(1, { preset: SPRINGS.press }).then(() => {
        if (gen === liftGen) setLifted(false);
      });
    };

    const settleHome = () => {
      ownedRef.current = false;
      hotRef.current = null;
      const back = activeRef.current;
      markHot(back);
      if (reducedRef.current) xAnim.set(back);
      else if (Math.abs(xAnim.value - back) > 0.01) xAnim.to(back, { preset: SPRINGS.move });
      if (Math.abs(scaleAnim.value - 1) > 0.001) dropLift();
      else setLifted(false);
    };

    const follow = (value, t) => {
      xAnim.set(value, t);
      const next = previewTabIndex(value, countRef.current);
      if (next !== hotRef.current) {
        hotRef.current = next;
        markHot(next);
        hapticTabTick();
      }
    };

    const lift = (e) => {
      if (lifted || !drag) return;
      if (drag.phase === "pending" && !drag.arm()) return;
      if (drag.phase !== "dragging") return;
      lifted = true;
      suppressClick = true;
      ownedRef.current = true;
      reducedRef.current = prefersReducedMotion();
      hotRef.current = previewTabIndex(xAnim.value, countRef.current);
      markHot(hotRef.current);
      setLifted(true);
      releasePressedTabs(nav, e.pointerId);
      try {
        nav.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already released */
      }
      if (!reducedRef.current) {
        liftGen += 1;
        scaleAnim.to(TAB_LIFT_SCALE, { preset: { dampingRatio: 1, response: 0.18 } });
      }
      hapticTabLift();
      paintRef.current();
    };

    const onDown = (e) => {
      if (e.button > 0 || pointerId != null || countRef.current < 1) return;
      reducedRef.current = prefersReducedMotion();
      stride = measure() || 1;
      pointerId = e.pointerId;
      lifted = false;
      suppressClick = false;
      releaseGen += 1;
      ownedRef.current = true;
      xAnim.stop();
      scaleAnim.stop();
      const n = countRef.current;
      const points = [];
      for (let i = 0; i < n; i += 1) points.push(i);
      drag = createDragController({
        min: 0,
        max: Math.max(0, n - 1),
        snapPoints: points,
        slop: TAB_SLOP_PX / stride,
        dimension: 2,
        decelerationRate: TAB_DECEL,
        slopMode: "threshold",
      });
      drag.begin({
        main: e.clientX / stride,
        cross: e.clientY / stride,
        t: e.timeStamp,
        liveValue: xAnim.value,
      });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        if (pointerId != null && !lifted) lift(e);
      }, TAB_HOLD_MS);
    };

    const onMove = (e) => {
      if (e.pointerId !== pointerId || !drag) return;
      const r = drag.move({
        main: e.clientX / stride,
        cross: e.clientY / stride,
        t: e.timeStamp,
      });
      if (r.type === "reject") {
        window.clearTimeout(timer);
        timer = 0;
        drag = null;
        pointerId = null;
        settleHome();
        return;
      }
      if (r.type === "lock") {
        window.clearTimeout(timer);
        timer = 0;
        lift(e);
        e.preventDefault();
        follow(r.value, e.timeStamp);
        return;
      }
      if (r.type !== "drag" || !lifted) return;
      e.preventDefault();
      follow(r.value, e.timeStamp);
    };

    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      window.clearTimeout(timer);
      timer = 0;
      pointerId = null;
      const current = drag;
      drag = null;
      if (!lifted || !current) {
        const interrupted = Math.abs(xAnim.value - activeRef.current) > 0.01 || Math.abs(scaleAnim.value - 1) > 0.001;
        ownedRef.current = false;
        if (interrupted) {
          requestAnimationFrame(() => {
            if (ownedRef.current) return;
            if (Math.abs(scaleAnim.value - 1) > 0.001) dropLift();
            if (!xAnim.animating && Math.abs(xAnim.value - activeRef.current) > 0.01) {
              if (reducedRef.current) xAnim.set(activeRef.current);
              else xAnim.to(activeRef.current, { preset: SPRINGS.move });
            }
          });
        }
        return;
      }
      const r = current.end({ t: e.timeStamp });
      if (r.type !== "release") {
        settleHome();
        return;
      }
      const target = previewTabIndex(r.target, countRef.current);
      hotRef.current = target;
      markHot(target);
      if (reducedRef.current) {
        xAnim.set(target);
        dropLift();
        ownedRef.current = false;
        hotRef.current = null;
        commitRef.current?.(target);
        return;
      }
      const preset = SPRINGS[tabReleasePreset(r.velocity)] || SPRINGS.move;
      const myRelease = ++releaseGen;
      xAnim.to(target, { preset, velocity: r.velocity }).then(() => {
        if (myRelease !== releaseGen) return;
        ownedRef.current = false;
        hotRef.current = null;
      });
      dropLift();
      commitRef.current?.(target);
    };

    const onCancel = (e) => {
      if (!e.isTrusted || e.pointerId !== pointerId) return;
      window.clearTimeout(timer);
      timer = 0;
      pointerId = null;
      drag?.cancel();
      drag = null;
      suppressClick = false;
      settleHome();
    };

    const onClick = (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    const onResize = () => {
      if (ownedRef.current) return;
      measure();
      paintRef.current();
    };

    const onContext = (e) => e.preventDefault();

    nav.addEventListener("pointerdown", onDown);
    nav.addEventListener("click", onClick, true);
    nav.addEventListener("contextmenu", onContext);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    observer?.observe(nav);

    return () => {
      window.clearTimeout(timer);
      releaseGen += 1;
      pointerId = null;
      drag = null;
      lifted = false;
      ownedRef.current = false;
      hotRef.current = null;
      nav.classList.remove("is-dragging");
      lensRef.current?.classList.remove("is-lifted");
      nav.removeEventListener("pointerdown", onDown);
      nav.removeEventListener("click", onClick, true);
      nav.removeEventListener("contextmenu", onContext);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [enabled, scaleAnim, xAnim]);

  useLayoutEffect(() => () => {
    xAnim.stop();
    scaleAnim.stop();
  }, [scaleAnim, xAnim]);

  return { navRef, lensRef };
}
