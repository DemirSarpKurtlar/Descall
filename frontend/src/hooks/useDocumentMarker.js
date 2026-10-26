import { useLayoutEffect } from "react";
import { holdDocumentMarker } from "../lib/documentMarker";

/**
 * Keeps `className` on <body> (or <html>) while `active`. Layout effect, so the
 * class is there before the first paint, the same frame `:has()` matched.
 */
export function useDocumentMarker(className, active = true, target = "body") {
  useLayoutEffect(() => {
    if (!active) return undefined;
    return holdDocumentMarker(className, { target });
  }, [className, active, target]);
}
