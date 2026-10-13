import {
  ChatCircleDots,
  GameController,
  GearSix,
  HardDrives,
  Lightning,
  Phone,
  Plus,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";

/**
 * Desktop / iPad / Electron rail glyphs (Phosphor, MIT).
 * Inactive = regular, active = fill. The glass tile, hover, and badge
 * stay in rail-icons.css. The Descall logo is not a rail glyph.
 */
const RAIL_ICONS = {
  chat: ChatCircleDots,
  groups: UsersThree,
  servers: HardDrives,
  play: GameController,
  friends: UserPlus,
  activity: Lightning,
  calls: Phone,
  add: Plus,
  settings: GearSix,
};

function RailGlyph({ id, size = 24 }) {
  const Icon = RAIL_ICONS[id];
  if (!Icon) return null;
  return (
    <span className="rail-glyph">
      <Icon className="rail-glyph-regular" weight="regular" size={size} aria-hidden="true" />
      <Icon className="rail-glyph-fill" weight="fill" size={size} aria-hidden="true" />
    </span>
  );
}

function railIcon(id) {
  function Icon(props) {
    return <RailGlyph id={id} size={props.size} />;
  }
  return Icon;
}

export const RailChat = railIcon("chat");
export const RailGroups = railIcon("groups");
export const RailServers = railIcon("servers");
export const RailPlay = railIcon("play");
export const RailFriends = railIcon("friends");
export const RailActivity = railIcon("activity");
export const RailCalls = railIcon("calls");
export const RailAdd = railIcon("add");
export const RailSettings = railIcon("settings");

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
