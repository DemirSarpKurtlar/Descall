/**
 * DesCoin artwork (bimetal coin, Konsept 2 logo on Tura, "1" + star on Yazı).
 * Static SVG strings, no user input. Every id carries a per-instance prefix so
 * two coins in different chats never share (or lose) a gradient.
 */

export const LOGO_D =
  "M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z";

function starPath(r, cx = 0, cy = 0) {
  let p = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(2) + "," + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return p + "Z";
}

const DOTS = Array.from({ length: 120 }, (_, i) => {
  const a = (i / 120) * Math.PI * 2;
  return `<circle cx="${(91 * Math.cos(a)).toFixed(2)}" cy="${(91 * Math.sin(a)).toFixed(2)}" r=".75" fill="#7a5c2a" opacity=".35"/>`;
}).join("");

function defs(p) {
  return `<defs>${DEFS_TEMPLATE.replace(/__P__/g, p)}</defs>`;
}

const DEFS_TEMPLATE = `<linearGradient id="__P__gRing" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#f6e7bd"/><stop offset=".28" stop-color="#ddb977"/> <stop offset=".62" stop-color="#a98545"/><stop offset=".86" stop-color="#cfae6c"/><stop offset="1" stop-color="#ead39b"/> </linearGradient> <linearGradient id="__P__gRim" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#fff6dc"/><stop offset=".35" stop-color="#e2c182"/> <stop offset=".7" stop-color="#8f6d33"/><stop offset="1" stop-color="#d8b874"/> </linearGradient> <linearGradient id="__P__gRimIn" x1="1" y1="1" x2="0" y2="0"> <stop offset="0" stop-color="#fff3d0" stop-opacity=".9"/><stop offset=".5" stop-color="#b8924f" stop-opacity=".2"/><stop offset="1" stop-color="#5e4520" stop-opacity=".9"/> </linearGradient> <linearGradient id="__P__gDisc" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#fbfbfc"/><stop offset=".3" stop-color="#d9dce1"/> <stop offset=".66" stop-color="#9ea3ac"/><stop offset="1" stop-color="#dfe2e7"/> </linearGradient> <linearGradient id="__P__gGroove" x1="1" y1="1" x2="0" y2="0"> <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#4a3a1e"/> </linearGradient> <radialGradient id="__P__gLathe" cx="0" cy="0" r="1.25" gradientUnits="userSpaceOnUse" spreadMethod="repeat"> <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".35"/> </radialGradient> <radialGradient id="__P__gSheen" cx="-38" cy="-52" r="118" gradientUnits="userSpaceOnUse"> <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <linearGradient id="__P__gShade" x1="0" y1="0" x2="1" y2="1"> <stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a1206" stop-opacity=".38"/> </linearGradient> <linearGradient id="__P__gEdge" x1="0" y1="0" x2="1" y2="0"> <stop offset="0" stop-color="#4b3818"/><stop offset=".22" stop-color="#b8924f"/><stop offset=".4" stop-color="#f1dca6"/> <stop offset=".62" stop-color="#b08a48"/><stop offset="1" stop-color="#3a2a10"/> </linearGradient> <path id="__P__ringPath" d="M 0,-83 a83,83 0 1,1 -0.01,0"/> <filter id="__P__fEmb" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"> <feGaussianBlur in="SourceAlpha" stdDeviation="1.15" result="b"/> <feDiffuseLighting in="b" surfaceScale="3.2" diffuseConstant="1.05" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="42"/></feDiffuseLighting> <feComposite in="d" in2="SourceAlpha" operator="in" result="di"/> <feBlend in="SourceGraphic" in2="di" mode="multiply" result="m"/> <feSpecularLighting in="b" surfaceScale="3.2" specularConstant="1.25" specularExponent="26" lighting-color="#fff" result="s"><feDistantLight azimuth="235" elevation="42"/></feSpecularLighting> <feComposite in="s" in2="SourceAlpha" operator="in" result="si"/> <feComposite in="m" in2="si" operator="arithmetic" k2="1" k3=".75" result="lit"/> <feOffset in="SourceAlpha" dx="1" dy="1.3" result="o"/><feGaussianBlur in="o" stdDeviation=".9" result="ob"/> <feFlood flood-color="#1b1307" flood-opacity=".55"/><feComposite in2="ob" operator="in" result="cast"/> <feMerge><feMergeNode in="cast"/><feMergeNode in="lit"/></feMerge> </filter> <filter id="__P__fEmbSoft" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"> <feOffset in="SourceAlpha" dx=".6" dy=".8" result="o"/><feFlood flood-color="#2a1d08" flood-opacity=".6"/><feComposite in2="o" operator="in" result="sh"/> <feOffset in="SourceAlpha" dx="-.5" dy="-.6" result="o2"/><feFlood flood-color="#fff8e6" flood-opacity=".7"/><feComposite in2="o2" operator="in" result="hl"/> <feMerge><feMergeNode in="sh"/><feMergeNode in="hl"/><feMergeNode in="SourceGraphic"/></feMerge> </filter> <filter id="__P__fMotion" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.2 7"/></filter>`;

/**
 * Face SVG markup (viewBox -100..100). face: "yazi" | "tura".
 * simple: no ring lettering / dots (small icons).
 */
export function coinFaceSvg(face, prefix, { simple = false, size = null } = {}) {
  const P = prefix;
  const u = (id) => `url(#${P}${id})`;
  const s = 1.26;
  const ring = simple
    ? ""
    : `<text font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="700" font-size="12" letter-spacing="2" fill="#c9a660" filter="${u("fEmbSoft")}"><textPath href="#${P}ringPath" textLength="505" lengthAdjust="spacing">${
        face === "tura" ? "DESCALL · DESCOIN · DESCALL · DESCOIN · " : "BİR DESCOIN · MMXXVI · BİR DESCOIN · MMXXVI · "
      }</textPath></text>`;
  const emb = ` filter="${u("fEmb")}"`;
  const inner =
    face === "tura"
      ? `<g${emb}><path d="${LOGO_D}" transform="translate(${-50 * s},${-50 * s}) scale(${s})" fill="${u("gDisc")}"/></g>`
      : `<g${emb}><path d="${starPath(7.5, 0, -45)}" fill="${u("gDisc")}"/><text x="0" y="27" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="78" letter-spacing="-3" fill="${u("gDisc")}">1</text><rect x="-20" y="36" width="40" height="2.2" rx="1.1" fill="${u("gDisc")}"/></g>${
          simple ? "" : `<text x="0" y="52" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="650" font-size="7.4" letter-spacing="2.6" fill="#8d929b" filter="${u("fEmbSoft")}">DESCOIN</text>`
        }`;
  const dim = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-101 -101 202 202"${dim} aria-hidden="true" focusable="false">${defs(P)}
    <circle r="100" fill="${u("gRim")}"/>
    <circle r="96.2" fill="none" stroke="${u("gRimIn")}" stroke-width="1.6"/>
    <circle r="94" fill="${u("gRing")}"/>
    <circle r="94" fill="${u("gLathe")}" opacity=".05"/>
    ${simple ? "" : DOTS}
    ${ring}
    <circle r="71.6" fill="none" stroke="${u("gGroove")}" stroke-width="1.8"/>
    <circle r="70.4" fill="${u("gDisc")}"/>
    <circle r="70.4" fill="${u("gLathe")}" opacity=".07"/>
    ${inner}
    <circle r="100" fill="${u("gSheen")}"/>
    <circle r="100" fill="${u("gShade")}"/>
    <circle r="99.4" fill="none" stroke="rgba(255,248,226,.55)" stroke-width=".9"/>
  </svg>`;
}
