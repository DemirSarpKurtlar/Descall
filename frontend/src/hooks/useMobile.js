import { useState, useEffect, useCallback } from "react";
import { readDeviceLayout } from "../lib/deviceLayout.js";

// Phone layout: phones always, touch tablets and desktop windows up to 768px
// (lib/deviceLayout.js). An iPad / Android tablet UA no longer forces the phone
// tree at desktop widths, and a Split View / iPad mini portrait window gets it
// cleanly instead of a hybrid.
function readIsMobile() {
  if (typeof window === "undefined") return false;
  return readDeviceLayout(window).phoneLayout;
}

function readIsPortrait() {
  if (typeof window === "undefined") return true;
  return window.innerHeight > window.innerWidth;
}

function readTouchSupported() {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function useMobile() {
  // Sync initial state so the first paint (e.g. User Settings open) already
  // knows we're on mobile, otherwise framer-motion skips enter animation.
  const [isMobile, setIsMobile] = useState(readIsMobile);
  const [isPortrait, setIsPortrait] = useState(readIsPortrait);
  const [touchSupported, setTouchSupported] = useState(readTouchSupported);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(readIsMobile());
      setIsPortrait(readIsPortrait());
      setTouchSupported(readTouchSupported());
    };

    checkMobile();

    window.addEventListener("resize", checkMobile);
    window.addEventListener("orientationchange", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("orientationchange", checkMobile);
    };
  }, []);

  const vibrate = useCallback((pattern = 50) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  return { isMobile, isPortrait, touchSupported, vibrate };
}
