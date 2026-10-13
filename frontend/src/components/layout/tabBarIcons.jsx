import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { GameController } from "@phosphor-icons/react/dist/csr/GameController";
import { HardDrives } from "@phosphor-icons/react/dist/csr/HardDrives";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { Phone } from "@phosphor-icons/react/dist/csr/Phone";
import { User } from "@phosphor-icons/react/dist/csr/User";
import { UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";

/**
 * Mobile tab glyphs (Phosphor, MIT). The desktop rail uses the same
 * family from railIcons.jsx.
 * Inactive = regular, active = fill. Both weights are mounted so the drag
 * hook can swap them with the hot class, without a React render.
 */
const TAB_BAR_ICONS = {
  chat: ChatCircleDots,
  groups: UsersThree,
  servers: HardDrives,
  play: GameController,
  friends: UserPlus,
  activity: Lightning,
  calls: Phone,
  you: User,
};

export function TabBarGlyph({ id }) {
  const Icon = TAB_BAR_ICONS[id];
  if (!Icon) return null;
  return (
    <span className="tab-glyph">
      <Icon className="tab-glyph-regular" weight="regular" size={29} aria-hidden="true" />
      <Icon className="tab-glyph-fill" weight="fill" size={29} aria-hidden="true" />
    </span>
  );
}
