import { useId } from "react";

/**
 * Rail glyphs. 24px grid, filled paths only (no blur filters).
 * Colour lives in the gradient; the active rail tile forces the ink white.
 */

function RailGlyph({ size = 24, stops, children }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className="rail-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={uid} x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="1" stopColor={stops[1]} />
        </linearGradient>
      </defs>
      <g className="rail-glyph-ink" fill={`url(#${uid})`}>
        {children}
      </g>
    </svg>
  );
}

function icon(stops, node) {
  function Glyph(props) {
    return (
      <RailGlyph size={props.size} stops={stops}>
        {node}
      </RailGlyph>
    );
  }
  return Glyph;
}

/* Message: rounded bubble, tail, two knocked-out lines. */
const CHAT = (
  <path
    fillRule="evenodd"
    d="M8 4.5h8.5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5H12l-4 3.5c-.5.5-1 0-1-.5l.5-3H8a3.5 3.5 0 0 1-3.5-3.5v-5A3.5 3.5 0 0 1 8 4.5zM7.5 8h8.5a1 1 0 0 1 0 2h-8.5a1 1 0 0 1 0-2zm0 3.5h5.5a1 1 0 0 1 0 2h-5.5a1 1 0 0 1 0-2z"
  />
);

/* Two people. Rear figure first so the front one overlaps it. */
const GROUPS = (
  <>
    <circle cx="15.5" cy="7" r="2" />
    <path d="M12.5 16.5c.5-2 1.5-3.5 3-3.5s2.5 1.5 3 3.5c.5.5-.5.5-1 .5h-4c-.5 0-1.5 0-1-.5z" />
    <circle cx="9" cy="8.5" r="2.5" />
    <path d="M4.5 19.5c.5-3 2.5-5 4.5-5s4 2 4.5 5c.5.5-.5.5-1 .5H5.5c-.5 0-1.5 0-1-.5z" />
  </>
);

/* Three server bays. Dots are holes so they stay crisp on the blue active tile. */
const SERVERS = (
  <path
    fillRule="evenodd"
    d="M4.5 3.5h15a2 2 0 0 1 2 2v.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-.5a2 2 0 0 1 2-2zM7 5.5a1 1 0 1 0-2 0a1 1 0 1 0 2 0zM4.5 10h15a2 2 0 0 1 2 2v.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2zM7 12a1 1 0 1 0-2 0a1 1 0 1 0 2 0zM4.5 16.5h15a2 2 0 0 1 2 2v.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-.5a2 2 0 0 1 2-2zM7 18.5a1 1 0 1 0-2 0a1 1 0 1 0 2 0z"
  />
);

/* Crosshair: ring, four ticks, center dot. */
const PLAY = (
  <>
    <path
      fillRule="evenodd"
      d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zm0 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
    />
    <rect x="11" y="4" width="2" height="3" rx="0.5" />
    <rect x="11" y="17" width="2" height="3" rx="0.5" />
    <rect x="4" y="11" width="3" height="2" rx="0.5" />
    <rect x="17" y="11" width="3" height="2" rx="0.5" />
    <circle cx="12" cy="12" r="1.5" />
  </>
);

/* Person and a plus, same ink. */
const FRIENDS = (
  <>
    <circle cx="9" cy="7.5" r="2.5" />
    <path d="M4.5 18.5c.5-3 2.5-5 4.5-5s4 2 4.5 5c.5.5-.5.5-1 .5H5.5c-.5 0-1.5 0-1-.5z" />
    <path d="M16 12.5h2V15h2.5v2H18v2.5h-2V17h-2.5v-2H16z" />
  </>
);

/* Lightning, optically centered, no hairline tips. */
const ACTIVITY = (
  <path d="M13.5 3 7 13h4.5L10.5 21 17.5 11H13L14.5 3z" />
);

/* Handset, earpiece upper-left. */
const CALLS = (
  <path d="M8 4c.5-.5 1.5-.5 2 0l1.5 1.5c.5.5.5 1.5 0 2l-1 1c.5 1 1.5 2 2.5 2.5l1-1c.5-.5 1.5-.5 2 0l1.5 1.5c.5.5.5 1.5 0 2l-.5.5c-.5.5-1.5 1-2.5 1-4.5-.5-8-4-8.5-8.5 0-1 .5-2 1-2.5z" />
);

const ADD = (
  <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
);

const SETTINGS =
  "M8.5 6L9.5 3.5L14.5 3.5L15.5 6L18.5 5.5L20.5 9.5L19 12L20.5 14.5L18.5 18.5L15.5 18L14.5 20.5L9.5 20.5L8.5 18L5.5 18.5L3.5 14.5L5 12L3.5 9.5L5.5 5.5L8.5 6ZM12 9A3 3 0 1 0 12 15A3 3 0 1 0 12 9Z";

export const RailChat = icon(["#B7C8FF", "#5C7CFA"], CHAT);
export const RailGroups = icon(["#7AF0DC", "#0F9F8F"], GROUPS);
export const RailServers = icon(["#D2C4FF", "#7C3AED"], SERVERS);
export const RailPlay = icon(["#FF9A90", "#E23B4A"], PLAY);
export const RailFriends = icon(["#86EFAC", "#16A34A"], FRIENDS);
export const RailActivity = icon(["#FDE68A", "#E8A317"], ACTIVITY);
export const RailCalls = icon(["#6EE7B7", "#059669"], CALLS);
export const RailAdd = icon(["#FFFFFF", "#C9D2E3"], ADD);
export const RailSettings = icon(["#F2F4FA", "#8E99B0"], (
  <path fillRule="evenodd" d={SETTINGS} />
));

export const RAIL_ACCENT = {
  chat: "#5C7CFA",
  groups: "#0F9F8F",
  servers: "#7C3AED",
  play: "#E23B4A",
  friends: "#16A34A",
  activity: "#E8A317",
  calls: "#059669",
  add: "#C9D2E3",
  settings: "#8E99B0",
};
