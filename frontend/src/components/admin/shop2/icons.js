// Vitrin ve Setler: the shared icon set plus the few Phosphor glyphs components/ui/Icon.jsx
// does not export yet (same set, regular weight, hidden from screen readers).
import { createElement, forwardRef } from "react";
import { MagicWand as PMagicWand, Ruler as PRuler, Shuffle as PShuffle, Swatches as PSwatches, TestTube as PTestTube } from "@phosphor-icons/react/dist/ssr";

export * from "../../ui/Icon.jsx";

function make(Glyph, name) {
  const C = forwardRef(function Shop2Icon({ size = 24, weight = "regular", className, ...rest }, ref) {
    return createElement(Glyph, { ref, size, weight, color: "currentColor", className: className ? `ui-icon ${className}` : "ui-icon", "aria-hidden": true, focusable: "false", ...rest });
  });
  C.displayName = name;
  return C;
}

export const Shuffle2 = make(PShuffle, "Shuffle");
export const Ruler = make(PRuler, "Ruler");
export const Swatches = make(PSwatches, "Swatches");
export const MagicWand = make(PMagicWand, "MagicWand");
export const TestTube = make(PTestTube, "TestTube");
