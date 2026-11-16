/* Line icons for the end-of-call DesCoin summary (24x24, stroke = currentColor), the
   same glyphs as the approved draft. Static path data only. */
const P = {
  x: <path d="M18 6 6 18M6 6l12 12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
    </>
  ),
  screen: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  trend: <path d="m23 6-9.5 9.5-5-5L1 18M17 6h6v6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  play: <path d="M6 4l14 8-14 8z" />,
  eye: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export function CcsIcon({ name, size = 16, stroke = 2, className }) {
  return (
    <svg
      className={className ? `ccs-i ${className}` : "ccs-i"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name] || null}
    </svg>
  );
}

let gid = 0;
/** The DesCoin coin (gold disc with the D), same art as the draft. */
export function CoinArt({ size = 94, className }) {
  const k = `ccsc${(gid += 1)}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${k}a`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".35" stopColor="#f8cf5c" />
          <stop offset=".8" stopColor="#e3a12b" />
          <stop offset="1" stopColor="#b8761a" />
        </radialGradient>
        <linearGradient id={`${k}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe7a0" />
          <stop offset="1" stopColor="#c98a22" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${k}b)`} />
      <circle cx="50" cy="50" r="43" fill={`url(#${k}a)`} />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#b97b1c" strokeOpacity=".55" strokeWidth="2.4" />
      <path d="M39 31h11.5c11 0 18.5 7.6 18.5 19s-7.5 19-18.5 19H39z" fill="none" stroke="#8f5a10" strokeOpacity=".85" strokeWidth="6.5" strokeLinejoin="round" />
      <path d="M39 31h11.5c11 0 18.5 7.6 18.5 19" fill="none" stroke="#fff4cf" strokeOpacity=".55" strokeWidth="2" transform="translate(-1.5 -1.5)" />
      <ellipse cx="33" cy="25" rx="13" ry="6" fill="#fff" opacity=".35" transform="rotate(-30 33 25)" />
    </svg>
  );
}

/** Small coin used next to prices. */
export function MiniCoin({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="11" fill="#e3a12b" />
      <circle cx="12" cy="12" r="9.3" fill="#f5c451" />
      <path d="M9.2 7.4h2.6c2.6 0 4.4 1.8 4.4 4.6s-1.8 4.6-4.4 4.6H9.2z" fill="none" stroke="#8f5a10" strokeWidth="1.8" />
    </svg>
  );
}
