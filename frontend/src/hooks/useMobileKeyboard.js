import { useEffect } from "react";
import { isTextEditing, mobileViewportBox } from "../lib/mobileViewport";

function resetScroll() {
  try {
    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
      document.documentElement.scrollLeft = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
    }
    // iOS sometimes leaves a residual visualViewport offset after blur.
    if (window.visualViewport && (window.visualViewport.offsetTop || window.visualViewport.offsetLeft)) {
      window.scrollTo(0, 0);
    }
  } catch {
    /* ignore */
  }
}

const KB_CLOSE_ANIM_MS = 280;

/**
 * Keep the mobile shell aligned to the visual viewport while the keyboard
 * is open, and smooth-reset when it closes (composer slides down with the KB).
 */
export function useMobileKeyboard(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const root = document.documentElement;
    const vv = window.visualViewport;
    let raf = 0;
    let lastOpen = false;
    let closeAnimTimer = 0;

    const apply = () => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const layoutW = window.innerWidth || root.clientWidth || 0;
      const vvH = vv?.height ?? layoutH;
      const vvW = vv?.width ?? layoutW;
      const box = mobileViewportBox({
        innerHeight: layoutH,
        vvHeight: vvH,
        offsetTop: vv?.offsetTop ?? 0,
        offsetLeft: vv?.offsetLeft ?? 0,
        editing: isTextEditing(document.activeElement),
      });
      const open = box.open;

      // Closing: enable height transition before the VV jump so the composer
      // eases down instead of snapping. Opening stays instant to track the KB.
      if (!open && lastOpen) {
        root.classList.add("kb-closing");
        window.clearTimeout(closeAnimTimer);
        closeAnimTimer = window.setTimeout(() => {
          root.classList.remove("kb-closing");
        }, KB_CLOSE_ANIM_MS);
      }

      // A 0px visual viewport (iOS, during the fixed splash) collapses the shell
      // to nothing. Leave the 100dvh fallback in place until the height is real.
      // Closed keyboards always restore the full layout height, even if iOS
      // reports a leftover short visual viewport.
      if (box.height >= 160) root.style.setProperty("--vv-height", `${box.height}px`);
      else if (!open) root.style.removeProperty("--vv-height");
      root.style.setProperty("--vv-width", `${Math.round(vvW)}px`);
      root.style.setProperty("--vv-offset-top", `${box.top}px`);
      root.style.setProperty("--vv-offset-left", `${open ? box.left : 0}px`);
      root.style.setProperty("--kb-inset", `${box.kb}px`);
      root.classList.toggle("kb-open", open);

      if (open !== lastOpen) {
        lastOpen = open;
        if (!open) {
          // Keyboard closed — clear any iOS focus-scroll residue after the slide.
          resetScroll();
          window.setTimeout(resetScroll, 40);
          window.setTimeout(resetScroll, KB_CLOSE_ANIM_MS);
        } else {
          root.classList.remove("kb-closing");
          window.clearTimeout(closeAnimTimer);
          resetScroll();
        }
      } else if (
        !open &&
        (window.scrollY ||
          window.scrollX ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          (vv?.offsetTop || 0) > 1)
      ) {
        resetScroll();
      } else if (
        window.scrollY ||
        window.scrollX ||
        document.documentElement.scrollTop ||
        document.documentElement.scrollLeft ||
        document.body.scrollTop ||
        document.body.scrollLeft
      ) {
        // iOS pans the document to chase the focused field. The shell is pinned
        // to the visual viewport, so the document itself stays at 0.
        resetScroll();
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    const onFocusOut = () => {
      // Blur path: wait for visualViewport to settle, then let apply() clear
      // kb-open — do not yank the class early (that snaps the composer).
      window.setTimeout(schedule, 40);
      window.setTimeout(schedule, 120);
      window.setTimeout(() => {
        const active = document.activeElement;
        const stillEditing =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable);
        if (!stillEditing) resetScroll();
      }, KB_CLOSE_ANIM_MS);
    };

    root.classList.add("mobile-keyboard-lock");
    apply();
    const onFocusIn = () => schedule();
    if (vv) {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("focusin", onFocusIn);
    document.addEventListener("visibilitychange", schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(closeAnimTimer);
      if (vv) {
        vv.removeEventListener("resize", schedule);
        vv.removeEventListener("scroll", schedule);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("visibilitychange", schedule);
      root.classList.remove("mobile-keyboard-lock");
      root.classList.remove("kb-open");
      root.classList.remove("kb-closing");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-width");
      root.style.removeProperty("--vv-offset-top");
      root.style.removeProperty("--vv-offset-left");
      root.style.removeProperty("--kb-inset");
      resetScroll();
    };
  }, [enabled]);
}

export default useMobileKeyboard;
