// Mağaza masası: the few Phosphor glyphs components/ui/Icon.jsx does not export yet
// (same set, regular weight, hidden from screen readers like the shared wrapper).
import { createElement, forwardRef } from "react";
import { HourglassMedium, Percent as PPercent, Power as PPower, Repeat as PRepeat, Tag as PTag, TrendDown, TrendUp } from "@phosphor-icons/react/dist/ssr";

function make(Glyph, name) {
  const C = forwardRef(function ShopDeskIcon({ size = 24, weight = "regular", className, ...rest }, ref) {
    return createElement(Glyph, { ref, size, weight, color: "currentColor", className: className ? `ui-icon ${className}` : "ui-icon", "aria-hidden": true, focusable: "false", ...rest });
  });
  C.displayName = name;
  return C;
}

export const Power = make(PPower, "Power");
export const Percent = make(PPercent, "Percent");
export const Tag = make(PTag, "Tag");
export const Repeat = make(PRepeat, "Repeat");
export const Hourglass = make(HourglassMedium, "Hourglass");
export const TrendUpIcon = make(TrendUp, "TrendUp");
export const TrendDownIcon = make(TrendDown, "TrendDown");
