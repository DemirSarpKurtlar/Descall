import { useEffect, useState } from "react";
import { isAppleMobileUa } from "./appStoreLink";

/** Resolved after mount so the prerendered HTML and the first client render match. */
export function useIsAppleMobile() {
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIos(isAppleMobileUa(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  return ios;
}
