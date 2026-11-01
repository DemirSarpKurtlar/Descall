/**
 * Tiny, always-bundled entry to the 3D world: the "3D Dünya" button and the lazy
 * stage. The world itself (Babylon.js, assets) is a separate chunk that loads only
 * when someone opens it. Builds with VITE_WORLD3D=0 (iOS / Android) drop the lazy
 * import entirely, so the chunk is not emitted there.
 */
import { lazy, Suspense, useMemo } from "react";
import { canShowWorld, detectEnvironment } from "./gate.js";
import "./launcher.css";

export const WORLD3D_BUILD = import.meta.env.VITE_WORLD3D !== "0";

const World3DView = WORLD3D_BUILD ? lazy(() => import("./World3DView.jsx")) : null;

export function useWorld3DAvailable(me) {
  return useMemo(() => {
    if (!WORLD3D_BUILD) return false;
    return canShowWorld({ me, buildEnabled: WORLD3D_BUILD, ...detectEnvironment() }).ok;
  }, [me]);
}

export function World3DButton({ label, hint, onClick, className = "" }) {
  return (
    <button type="button" className={`w3d-enter ${className}`.trim()} onClick={onClick} title={hint} aria-label={hint || label}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
        <path d="M4 7.4 12 12l8-4.6M12 12v9.2" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function World3DStage(props) {
  if (!World3DView) return null;
  return (
    <div className="w3d-host">
      <Suspense fallback={<div className="w3d-host-boot" aria-hidden />}>
        <World3DView {...props} />
      </Suspense>
    </div>
  );
}
