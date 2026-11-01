/**
 * Tiny, always-bundled entry to the 3D world: the "3D Dünya" dock button, the session
 * state (loading -> entering -> open -> leaving) and the lazy stage. The world itself
 * (Babylon.js, assets) is a separate chunk that loads only when someone opens it. Builds
 * with VITE_WORLD3D=0 (iOS / Android) drop the lazy import entirely, so the chunk is not
 * emitted there.
 *
 * Flow: the button starts loading; the world mounts invisible behind the call (engine,
 * room and avatars download, shaders compile and warm up) while the button shows the
 * progress; when it is ready the call stage fades and scales into the world over 400 ms,
 * then the call stage is unmounted (videos, meters and their animations stop; the call's
 * audio keeps playing). Leaving runs the same transition backwards.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canShowWorld, detectEnvironment } from "./gate.js";
import "./launcher.css";

export const WORLD3D_BUILD = import.meta.env.VITE_WORLD3D !== "0";
export const WORLD3D_TRANSITION_MS = 400;

const World3DView = WORLD3D_BUILD ? lazy(() => import("./World3DView.jsx")) : null;

export function useWorld3DAvailable(me) {
  return useMemo(() => {
    if (!WORLD3D_BUILD) return false;
    return canShowWorld({ me, buildEnabled: WORLD3D_BUILD, ...detectEnvironment() }).ok;
  }, [me]);
}

function reducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * Session of one call surface. phase: idle | loading | entering | open | leaving.
 * `stageHidden` is true while the world fully covers the call: the surface should not
 * render its stage then (audio sinks stay).
 */
export function useWorld3DSession() {
  const [phase, setPhase] = useState("idle");
  const [progress, setProgressState] = useState(0);
  const timer = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = 0;
  };
  useEffect(() => clear, []);
  const duration = () => (reducedMotion() ? 180 : WORLD3D_TRANSITION_MS);
  const open = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    clear();
    setProgressState(0);
    setPhase("loading");
  }, []);
  const ready = useCallback(() => {
    if (phaseRef.current !== "loading") return;
    setProgressState(1);
    setPhase("entering");
    clear();
    timer.current = setTimeout(() => setPhase("open"), duration());
  }, []);
  const close = useCallback(() => {
    const p = phaseRef.current;
    if (p === "idle" || p === "leaving") return;
    clear();
    if (p === "loading") {
      setPhase("idle");
      return;
    }
    setPhase("leaving");
    timer.current = setTimeout(() => setPhase("idle"), duration());
  }, []);
  const reset = useCallback(() => {
    clear();
    setPhase("idle");
  }, []);
  const setProgress = useCallback((p) => {
    const v = Math.max(0, Math.min(1, Number(p) || 0));
    // whole percents only: no re-render per byte
    setProgressState((prev) => (Math.round(v * 100) === Math.round(prev * 100) ? prev : v));
  }, []);
  return useMemo(
    () => ({
      phase,
      progress,
      active: phase !== "idle",
      loading: phase === "loading",
      stageHidden: phase === "open",
      open,
      ready,
      close,
      reset,
      setProgress,
    }),
    [phase, progress, open, ready, close, reset, setProgress]
  );
}

/** Small isometric cube (three faces), animated on hover / while loading by launcher.css. */
function CubeIcon() {
  return (
    <svg className="w3d-cube" width="22" height="22" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path className="w3d-cube-left" d="M3.6 7.6 12 12.4v9.1l-8.4-4.8z" />
      <path className="w3d-cube-right" d="M20.4 7.6 12 12.4v9.1l8.4-4.8z" />
      <path className="w3d-cube-top" d="M12 2.6l8.4 5-8.4 4.8-8.4-4.8z" />
      <path className="w3d-cube-edge" d="M12 2.6l8.4 5v9.1L12 21.5l-8.4-4.8V7.6zM3.6 7.6 12 12.4l8.4-4.8M12 12.4v9.1" />
    </svg>
  );
}

/**
 * The "3D Dünya" pill at the end of a call's control dock (after a divider).
 * label / hint / loadingLabel come translated from the caller.
 */
export function World3DDockButton({ session, label, hint, loadingLabel, divider = true, compact = false }) {
  const loading = session.phase === "loading";
  const pct = Math.round((session.progress || 0) * 100);
  const tipId = useMemo(() => `w3d-tip-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <>
      {divider ? <i className="w3d-dock-divider" aria-hidden /> : null}
      <button
        type="button"
        className={`w3d-enter${loading ? " is-loading" : ""}${compact ? " is-compact" : ""}`}
        style={loading ? { "--w3d-p": pct } : undefined}
        onClick={() => (session.phase === "idle" ? session.open() : null)}
        aria-label={loading ? loadingLabel : label}
        aria-describedby={tipId}
        aria-busy={loading || undefined}
        aria-disabled={session.phase !== "idle" || undefined}
        data-w3d-enter=""
      >
        <CubeIcon />
        <span className="w3d-enter-label">{loading ? loadingLabel : label}</span>
        {loading ? <span className="w3d-enter-bar" aria-hidden><i style={{ transform: `scaleX(${Math.max(0.04, pct / 100)})` }} /></span> : null}
        <span className="w3d-enter-tip" id={tipId} role="tooltip">
          {hint}
        </span>
      </button>
    </>
  );
}

/**
 * The world layer of a call surface. Mounted from "loading" on (invisible until ready).
 * Callbacks reach the memoised view through `api` (always the latest props), so the call
 * UI re-rendering every second does not re-render the world.
 */
export function World3DStage({ session, onExit, onFallback, ...props }) {
  const latest = useRef(null);
  latest.current = {
    ...props,
    onExit: (reason) => {
      session?.close();
      onExit?.(reason);
    },
    onFallback: (reason) => {
      session?.reset();
      onFallback?.(reason);
    },
    onProgress: (p) => session?.setProgress(p),
    onReady: () => session?.ready(),
  };
  if (!World3DView || (session && !session.active)) return null;
  const phase = session ? session.phase : "open";
  return (
    <div className="w3d-host" data-phase={phase} aria-hidden={phase === "loading" || undefined}>
      <Suspense fallback={<div className="w3d-host-boot" aria-hidden />}>
        <World3DView {...props} api={latest} />
      </Suspense>
    </div>
  );
}
