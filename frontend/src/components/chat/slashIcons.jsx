/** Command menu glyphs from design/coinflip-v2/d-command-menu.png (24px grid, stroke icons). */
function Glyph({ size = 18, strokeWidth = 1.7, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const CardsGlyph = (p) => (
  <Glyph {...p}>
    <rect x="4" y="3.5" width="11" height="15" rx="2" />
    <path d="M9 21h9a2 2 0 0 0 2-2V8" />
    <path d="M9.5 8.5l-1.6 3h3.2z" />
  </Glyph>
);

export const ReelsGlyph = (p) => (
  <Glyph {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M9 5v14M15 5v14" />
    <circle cx="6" cy="12" r=".6" />
    <circle cx="12" cy="12" r=".6" />
    <circle cx="18" cy="12" r=".6" />
  </Glyph>
);

export const CoinGlyph = (p) => (
  <Glyph {...p}>
    <ellipse cx="12" cy="9.5" rx="8" ry="5" />
    <path d="M4 9.5v4c0 2.8 3.6 5 8 5s8-2.2 8-5v-4" />
    <path d="M8.5 16.8v1.4M12 17.5v1.2M15.5 16.8v1.4" />
  </Glyph>
);

export const SendGlyph = (p) => (
  <Glyph {...p}>
    <path d="M4 12h13" />
    <path d="M13 7l5 5-5 5" />
    <path d="M20 5v14" />
  </Glyph>
);

export const DailyGlyph = (p) => (
  <Glyph {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
    <path d="M12 13v4M10 15h4" />
  </Glyph>
);

export const WalletGlyph = (p) => (
  <Glyph {...p}>
    <path d="M4 8a3 3 0 0 1 3-3h11v4" />
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <circle cx="16" cy="13.5" r="1" />
  </Glyph>
);

export const TrophyGlyph = (p) => (
  <Glyph {...p}>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
  </Glyph>
);
