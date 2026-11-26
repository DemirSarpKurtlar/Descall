/** Stroke icons of the share sheet draft (share.html#A sprite), 24 x 24, currentColor. */
const PATHS = {
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  search: (<><circle cx="11" cy="11" r="7.5" /><path d="m21 21-4.3-4.3" /></>),
  chevR: <path d="m9 18 6-6-6-6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  bellOff: <path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" />,
  clock: (<><circle cx="12" cy="12" r="9.5" /><path d="M12 6.5V12l3.5 2" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>),
  video: (<><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10.5 5.2-3a.5.5 0 0 1 .8.4v8.2a.5.5 0 0 1-.8.4L16 13.5" /></>),
  file: (<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>),
  send: (<><path d="M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1z" /><path d="M21.9 2.1 10.9 13.1" /></>),
  undo: (<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8" /><path d="M21 3v5h-5" /></>),
  wifiOff: <path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2-1.5M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M2 2l20 20" />,
  sliders: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
  pinOff: <path d="M12.8 7.1a3 3 0 0 1 2.1 2.1M17.1 17.1c-1.6 2.2-3.5 3.9-4.5 4.7a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 1.4-4.6M2 2l20 20M8.5 2.8A8 8 0 0 1 20 10c0 1.2-.3 2.4-.8 3.5M9.1 9.1a3 3 0 0 0 3.8 3.8" />,
  pin: (<><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
  spark: (<><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" /><path d="M5 16v4M3 18h4M19 3v3M17.5 4.5h3" /></>),
  out: <path d="M7 7h10v10M7 17 17 7" />,
  alert: (<><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5M12 16.2h.01" /></>),
  info: (<><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4.5M12 8h.01" /></>),
  msg: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  play: <path d="M6 3.5v17a.8.8 0 0 0 1.2.7l14-8.5a.8.8 0 0 0 0-1.4l-14-8.5A.8.8 0 0 0 6 3.5Z" />,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  user: (<><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></>),
};

export function Icon({ name, className = "" }) {
  return (
    <svg className={`shs-i ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name] || null}
    </svg>
  );
}

/** The Descall mark on its dark tile (draft #logo). */
export function DescallMark() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
      <rect width="1024" height="1024" rx="230" fill="#393C4D" />
      <path
        transform="translate(87.07 87.07) scale(8.5)"
        fill="#587AF5"
        d="M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z"
      />
    </svg>
  );
}
