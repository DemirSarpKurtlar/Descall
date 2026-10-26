// Special badge art (approved mockup 2026-10-26): 36 hand-drawn glyphs on a 24 grid inside a
// tier frame. Pure presentation: names, descriptions and holder counts come from the server
// catalog (GET /api/special-badges/catalog) and the i18n tables in badges.{en,tr}.js.
import { useId } from "react";

export const TIERS = {
  tekil:    { rim: ["#ffd1f0", "#8ff3ff", "#ffe79a", "#c7b4ff"], core: ["#2a1840", "#0d0b1c"], glyph: ["#ffffff", "#ffe6fb"], glow: "rgba(255,170,240,.55)" },
  efsanevi: { rim: ["#ffe7a6", "#c98a1b"], core: ["#4a3410", "#1a1206"], glyph: ["#fff6da", "#ffd36b"], glow: "rgba(255,196,64,.45)" },
  epik:     { rim: ["#e6cfff", "#7a45c9"], core: ["#3a1f5e", "#140b24"], glyph: ["#f8f0ff", "#d5b4ff"], glow: "rgba(176,120,255,.4)" },
  nadir:    { rim: ["#cfe4ff", "#3d78d6"], core: ["#183966", "#0a1528"], glyph: ["#f2f8ff", "#a9cdff"], glow: "rgba(90,150,255,.38)" },
};
export const TIER_ORDER = ["tekil", "efsanevi", "epik", "nadir"];

const P = (d) => ({ d });
const T = (text, size = 9.5, extra = {}) => ({ text, size, ...extra });

// glyph: array of {d} stroke paths, {text}, {circle:[cx,cy,r]}, {dot:[cx,cy,r]}.
// Facebook (#36) keeps the Nadir frame with its own blue tint; an original "f" stroke, not Meta's logo.
export const BADGE_ART = [
  { id: "no001", tier: "tekil", g: [T("#001", 8.4)] },
  { id: "kurucu", tier: "efsanevi", g: [P("M3.8 20h16.4"), P("M6.2 20v-7.2a5.8 5.8 0 0 1 4.1-5.55 M17.8 20v-7.2a5.8 5.8 0 0 0-4.1-5.55"), P("M10.2 4h3.6l-.7 4.6h-2.2z"), P("M9.6 20v-5.2a2.4 2.4 0 0 1 4.8 0V20")] },
  { id: "demironayli", tier: "efsanevi", g: [P("M12 3l2.1 1.6 2.6-.3 1 2.4 2.4 1-.3 2.6L21 12l-1.6 2.1.3 2.6-2.4 1-1 2.4-2.6-.3L12 21l-2.1-1.6-2.6.3-1-2.4-2.4-1 .3-2.6L3 12l1.6-2.1-.3-2.6 2.4-1 1-2.4 2.6.3z"), P("M8.7 12.2l2.3 2.3 4.3-4.5")] },
  { id: "og", tier: "efsanevi", g: [T("OG", 10.5)] },
  { id: "efsane", tier: "efsanevi", g: [P("M4.6 17.5 3.6 8.2l5 3.9L12 6l3.4 6.1 5-3.9-1 9.3z"), P("M5 20.5h14"), { dot: [12, 6, 1.1] }] },
  { id: "sonsuz", tier: "efsanevi", g: [P("M12 12c-1.8-2.4-3.3-3.7-5.2-3.7a3.7 3.7 0 0 0 0 7.4c1.9 0 3.4-1.3 5.2-3.7s3.3-3.7 5.2-3.7a3.7 3.7 0 0 1 0 7.4c-1.9 0-3.4-1.3-5.2-3.7z")] },
  { id: "kazanan", tier: "efsanevi", g: [P("M8 4.5h8v4.6a4 4 0 0 1-8 0z"), P("M8 6.2H5.6a2.6 2.6 0 0 0 2.6 3.4"), P("M16 6.2h2.4a2.6 2.6 0 0 1-2.6 3.4"), P("M12 13.1v3.2"), P("M9 16.3h6l.6 3.7H8.4z")] },
  { id: "ilk100", tier: "efsanevi", g: [T("100", 8.6), P("M6.5 17.6h11")] },
  { id: "alfa", tier: "epik", g: [P("M17.6 8.3c-.7 4.7-2.3 9.2-5.7 9.2-2.9 0-4.9-2.3-4.9-5.1S9 7 11.9 7c3.6 0 4.6 4.9 6.6 10.5")] },
  { id: "v1", tier: "epik", g: [T("v1", 10.5)] },
  { id: "bughunter", tier: "epik", g: [{ circle: [12, 12, 7.2] }, P("M12 2.8v3 M12 18.2v3 M2.8 12h3 M18.2 12h3"), P("M12 9.6c1.3 0 2.1 1 2.1 2.6s-.8 2.6-2.1 2.6-2.1-1-2.1-2.6.8-2.6 2.1-2.6z"), P("M9.9 11.4l-1.2-.6 M14.1 11.4l1.2-.6 M9.9 13.4l-1.2.5 M14.1 13.4l1.2.5")] },
  { id: "partner", tier: "epik", g: [{ circle: [9.3, 12, 5] }, { circle: [14.7, 12, 5] }] },
  { id: "yapimci", tier: "epik", g: [P("M12 3.5l5.6 7.2L12 20.5 6.4 10.7z"), P("M12 3.5v7.3"), { circle: [12, 12.3, 1.5] }] },
  { id: "finalist", tier: "epik", g: [P("M8.2 3.5l2.4 6.2 M15.8 3.5l-2.4 6.2"), { circle: [12, 15, 5.6] }, { circle: [12, 15, 2.4] }] },
  { id: "turnuva", tier: "epik", g: [P("M3.5 4H8v6H3.5 M8 7h4 M3.5 14H8v6H3.5 M8 17h4 M12 7v10 M12 12h7.3"), { dot: [20.2, 12, 1.4] }] },
  { id: "moderator", tier: "epik", g: [P("M12 3.5l7 2.6v5.4c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6.1z"), P("M8.8 12.2l2.2 2.2 4.2-4.4")] },
  { id: "ekip", tier: "epik", g: [P("M12 8.4 7.4 15.6 M12 8.4l4.6 7.2 M8.6 17.3h6.8"), { circle: [12, 6.2, 2.3] }, { circle: [6.3, 17.3, 2.3] }, { circle: [17.7, 17.3, 2.3] }] },
  { id: "kayipkod", tier: "epik", g: [P("M8.5 4.5c-2 0-2.5 1-2.5 2.5v2.3c0 1.2-.7 2.2-2 2.7 1.3.5 2 1.5 2 2.7V17c0 1.5.5 2.5 2.5 2.5"), P("M15.5 4.5c2 0 2.5 1 2.5 2.5v2.3c0 1.2.7 2.2 2 2.7-1.3.5-2 1.5-2 2.7V17c0 1.5-.5 2.5-2.5 2.5"), { dot: [10, 12, 1.1] }, { dot: [14, 12, 1.1] }] },
  { id: "saat1000", tier: "epik", g: [P("M7 3.5h10 M7 20.5h10"), P("M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5 M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5"), P("M10 18.3h4")] },
  { id: "sezon1", tier: "epik", g: [T("S1", 10.5)] },
  { id: "beta", tier: "nadir", g: [P("M9 20.5V7.6a3.5 3.5 0 0 1 7 0c0 1.9-1.4 3.2-3.3 3.3 2.4 0 4.3 1.6 4.3 3.9s-1.9 3.8-4.2 3.8c-1.5 0-2.8-.6-3.8-1.6")] },
  { id: "tester", tier: "nadir", g: [P("M9.5 3.5h5 M10.5 3.5v5.2L5.8 17a2 2 0 0 0 1.7 3h9a2 2 0 0 0 1.7-3l-4.7-8.3V3.5"), P("M7.6 14.6h8.8")] },
  { id: "oneri", tier: "nadir", g: [P("M9.2 17.6h5.6 M10.2 20.5h3.6"), P("M8.6 14.2A6 6 0 1 1 15.4 14.2c-.7.6-1 1.4-1 2.3v1.1H9.6v-1.1c0-.9-.3-1.7-1-2.3z")] },
  { id: "destekci", tier: "nadir", g: [P("M12 19.5s-7-4.3-7-9.3A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.2c0 5-7 9.3-7 9.3z")] },
  { id: "katkici", tier: "nadir", g: [P("M5 8.5h3.4a2 2 0 1 1 3.6 0H15.5v3.4a2 2 0 1 1 0 3.6v3.5H5v-3.5a2 2 0 1 0 0-3.6z")] },
  { id: "dost", tier: "nadir", g: [{ circle: [9, 8.3, 2.5] }, { circle: [15.6, 9.2, 2.2] }, P("M4.4 18.5a4.6 4.6 0 0 1 9.2 0 M12.3 18.5a3.9 3.9 0 0 1 7.6-.6")] },
  { id: "yilbasi26", tier: "nadir", g: [P("M12 3.5v17 M4.6 7.75l14.8 8.5 M4.6 16.25l14.8-8.5"), P("M10 4.8 12 6.6l2-1.8 M10 19.2l2-1.8 2 1.8 M5.2 10.3l2.6-.6-.8-2.6 M18.8 13.7l-2.6.6.8 2.6 M5.2 13.7l2.6.6-.8 2.6 M18.8 10.3l-2.6-.6.8-2.6")] },
  { id: "ekim29", tier: "nadir", g: [T("29", 10.5), P("M17.6 4.2l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.3.7.3-1.4-1-1 1.4-.2z")] },
  { id: "gece", tier: "nadir", g: [P("M15.8 4.2a7.6 7.6 0 1 0 4 13A6.2 6.2 0 0 1 15.8 4.2z"), { dot: [18.4, 7.4, 0.9] }, { dot: [20.4, 10.6, 0.7] }] },
  { id: "sessiz", tier: "nadir", g: [P("M4.5 15v-2.5a7.5 7.5 0 0 1 15 0V15"), P("M4.5 14.5H7v5H6a1.5 1.5 0 0 1-1.5-1.5z M19.5 14.5H17v5h1a1.5 1.5 0 0 0 1.5-1.5z")] },
  { id: "e404", tier: "nadir", g: [T("404", 8.6)] },
  { id: "glitch", tier: "nadir", g: [P("M6.5 5.5h10v4h-10z"), P("M8.8 9.5h10v4h-10z"), P("M5.2 13.5h10v4.5h-10z")] },
  { id: "yil1", tier: "nadir", g: [{ circle: [12, 12, 8] }, T("1", 11)] },
  { id: "hergun", tier: "nadir", g: [P("M5 6.5h14v13H5z M5 10.2h14 M9 4v4 M15 4v4"), P("M9.3 15l1.9 1.9 3.6-3.8")] },
  { id: "ilkarama", tier: "nadir", g: [P("M8.7 4.8l2 4.2-1.8 1.4a10 10 0 0 0 5 5l1.4-1.8 4.2 2-.5 2.7a2 2 0 0 1-2 1.6A14 14 0 0 1 4.4 7.3a2 2 0 0 1 1.6-2z"), P("M15.2 4.4l.7-1.6 M18.2 7.2l1.6-.7 M17.1 5.6l1.3-1.3")] },
  { id: "facebook", tier: "nadir", tint: { core: ["#2f6fe4", "#0e2a6b"], rim: ["#e3eeff", "#4f8cff"], glow: "rgba(96,160,255,.5)" }, g: [{ d: "M11.3 20.2V10.3a4.4 4.4 0 0 1 4.4-4.4h1.2 M7.9 12.1h7.6", w: 2.9 }] }, 
];
export const ART_BY_ID = Object.fromEntries(BADGE_ART.map((b) => [b.id, b]));

/** Frame + glow colours for a badge, Facebook's own tint included. */
export function tierPalette(id) {
  const a = ART_BY_ID[id];
  if (!a) return TIERS.nadir;
  return a.tint ? { ...TIERS[a.tier], ...a.tint } : TIERS[a.tier];
}

function framePath(tier) {
  switch (tier) {
    case "nadir": return "M20 4h24c9 0 16 7 16 16v24c0 9-7 16-16 16H20C11 60 4 53 4 44V20C4 11 11 4 20 4z";
    case "epik": return "M32 3.5c1.3 0 2.5.3 3.6 1l19 11c2.2 1.3 3.6 3.7 3.6 6.2v20.6c0 2.6-1.4 4.9-3.6 6.2l-19 11c-2.2 1.3-5 1.3-7.2 0l-19-11c-2.2-1.3-3.6-3.6-3.6-6.2V21.7c0-2.5 1.4-4.9 3.6-6.2l19-11c1.1-.7 2.3-1 3.6-1z";
    case "efsanevi": return "M32 3.2c.8 0 1.5.1 2.3.4l19.4 6.6c2 .7 3.3 2.5 3.3 4.6V30c0 13.6-8.6 24.4-23 30.4-1.3.6-2.7.6-4 0C15.6 54.4 7 43.6 7 30V14.8c0-2.1 1.3-3.9 3.3-4.6l19.4-6.6c.8-.3 1.5-.4 2.3-.4z";
    default: { // 8-point rosette
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = (Math.PI / 8) * i - Math.PI / 2; const r = i % 2 ? 26.5 : 31; pts.push([32 + r * Math.cos(a), 32 + r * Math.sin(a)]); }
      return "M" + pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L") + "Z";
    }
  }
}

/** The badge itself. `label` is the accessible name; pass "" when the badge sits next to visible text. */
export function SpecialBadgeIcon({ id, size = 48, className = "", label }) {
  const b = ART_BY_ID[id];
  const raw = useId().replace(/[:]/g, "");
  if (!b) return null;
  const t = tierPalette(id);
  const key = (k) => `${raw}-${k}`;
  const d = framePath(b.tier);
  const small = size < 22;
  const glyphScale = b.tier === "efsanevi" ? 1.38 : b.tier === "tekil" ? 1.32 : 1.45;
  const gx = 32 - 12 * glyphScale, gy = (b.tier === "efsanevi" ? 30.5 : 32) - 12 * glyphScale;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: "false" };
  return (
    <svg className={`sb-icon sb-${b.tier}${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 64 64" {...a11y}>
      {label ? <title>{label}</title> : null}
      <defs>
        <radialGradient id={key("core")} cx="50%" cy="28%" r="78%">
          <stop offset="0" stopColor={t.core[0]} />
          <stop offset="1" stopColor={t.core[1]} />
        </radialGradient>
        <linearGradient id={key("rim")} x1="0" y1="0" x2="0.35" y2="1">
          {t.rim.map((c, i) => <stop key={i} offset={i / (t.rim.length - 1)} stopColor={c} />)}
        </linearGradient>
        <linearGradient id={key("sheen")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".26" />
          <stop offset=".46" stopColor="#fff" stopOpacity=".05" />
          <stop offset=".47" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={key("glyph")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.glyph[0]} />
          <stop offset="1" stopColor={t.glyph[1]} />
        </linearGradient>
        <clipPath id={key("clip")}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={`url(#${key("core")})`} />
      <g clipPath={`url(#${key("clip")})`}>
        <ellipse cx="32" cy="64" rx="30" ry="14" fill={t.glow} opacity=".55" />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${key("sheen")})`} />
      </g>
      <path d={d} fill="none" stroke={`url(#${key("rim")})`} strokeWidth={small ? 4 : 2.4} strokeLinejoin="round" />
      {!small && <path d={d} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="1" transform="translate(32 32) scale(.9) translate(-32 -32)" />}
      <g transform={`translate(${gx} ${gy}) scale(${glyphScale})`}>
        <g transform="translate(0 .55)" opacity=".45">{renderGlyph(b.g, "#000", small)}</g>
        {renderGlyph(b.g, `url(#${key("glyph")})`, small)}
      </g>
    </svg>
  );
}

function renderGlyph(g, paint, small) {
  const sw = small ? 2.4 : 1.75;
  return g.map((p, i) => {
    if (p.d) return <path key={i} d={p.d} fill="none" stroke={paint} strokeWidth={p.w ? (small ? p.w + 0.6 : p.w) : sw} strokeLinecap="round" strokeLinejoin="round" />;
    if (p.circle) return <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} fill="none" stroke={paint} strokeWidth={sw} />;
    if (p.dot) return <circle key={i} cx={p.dot[0]} cy={p.dot[1]} r={p.dot[2]} fill={paint} />;
    if (p.text) return <text key={i} x="12" y={13 + p.size * 0.36} textAnchor="middle" fontSize={p.size} fontWeight="800" letterSpacing="-.4" fontFamily='"SF Pro Rounded", "SF Pro Display", Inter, system-ui, sans-serif' fill={paint}>{p.text}</text>;
    return null;
  });
}
