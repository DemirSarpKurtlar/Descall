// Stroke icons for the profile sheet, its ⋯ menu and the report flow.
// Paths, sizes and stroke widths are copied from the approved mockups
// (#29 profil-menu, #30 sikayet-akisi) so the glyphs match them exactly.
const PATHS = {
  x: <path d="M6 6l12 12M18 6 6 18" />,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  share: <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  flag: <path d="M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v11s-1 1-4 1-5-2-8-2-4 1-4 1" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
  msg: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  cam: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 14.5-4.6M19 14v6M16 17h6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevl: <path d="m15 18-6-6 6-6" />,
};

function make(name, defSize, defStroke) {
  function MockIcon({ size = defSize, strokeWidth = defStroke, className, style }) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
        focusable="false"
      >
        {PATHS[name]}
      </svg>
    );
  }
  MockIcon.displayName = `MockIcon(${name})`;
  return MockIcon;
}

export const MIX = make("x", 17, 2.4);
export const MIMore = make("more", 19, 2.4);
export const MIShare = make("share", 19, 1.9);
export const MICopy = make("copy", 19, 1.9);
export const MIPen = make("pen", 19, 1.9);
export const MIFlag = make("flag", 18, 2.1);
export const MIBan = make("ban", 18, 2.1);
export const MIMsg = make("msg", 20, 2);
export const MIPhone = make("phone", 20, 2);
export const MICam = make("cam", 20, 2);
export const MIUser = make("user", 20, 2);
export const MIUserPlus = make("userPlus", 20, 2);
export const MICheck = make("check", 20, 2);
export const MIChevL = make("chevl", 22, 2.4);

/** The row chevron from the mockup kit (8×13 viewBox). */
export function MIChevRow({ className = "chev" }) {
  return (
    <svg className={className} viewBox="0 0 8 13" aria-hidden="true" focusable="false">
      <path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
