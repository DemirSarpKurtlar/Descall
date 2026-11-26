/* Line icons of the public page desk (same set as the draft, 24px grid, stroke 2). */
const P = {
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  vol: <><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24" />,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-6" /></>,
  ext: <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
  chev: <path d="m9 18 6-6-6-6" />,
  chevd: <path d="m6 9 6 6 6-6" />,
  pin: <path d="M12 17v5M5 17h14l-2-4V6h1V2H6v4h1v7z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,
  undo: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></>,
  phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  layout: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  tag: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></>,
  text: <path d="M4 7V4h16v3M9 20h6M12 4v16" />,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  google: <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.7 4.1-5.35 4.1a6.2 6.2 0 0 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.66-2.56A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.77 0 9.6-4.06 9.6-9.77 0-.66-.07-1.16-.25-1.13z" />,
  more: <path d="M12 12h.01M19 12h.01M5 12h.01" strokeWidth="3" />,
};

export function I({ n, s = 16, className = "" }) {
  return (
    <svg className={`ppd-i ${className}`} width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {P[n] || null}
    </svg>
  );
}

export const MARK_PATH =
  "M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z";

export function Mark({ s = 16 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 1024 1024" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <rect width="1024" height="1024" rx="230" fill="#393C4D" />
      <path transform="translate(87.07 87.07) scale(8.5)" fill="#587AF5" d={MARK_PATH} />
    </svg>
  );
}
