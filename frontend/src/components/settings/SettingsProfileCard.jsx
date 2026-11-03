import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import AdminBadge from "../social/AdminBadge";
import { ProfileBadgeRow } from "../badges/BadgeVault";
import { cssUrl } from "../../lib/cssUrl";
import { profileCardModel, effectRoom } from "../../lib/settingsProfileCard";
import { useT } from "../../context/LocaleContext";
import { Pencil } from "../ui/Icon.jsx";
import "../../styles/settings-profile-card.css";

/**
 * Settings profile header, owner pick "01 · Banner Kart": the user's banner on
 * top, the avatar (with its equipped effect fully visible) over the seam, the
 * status dot, badges, name, "@handle · Descall ekibi" and a "Profili düzenle" button.
 */
export default function SettingsProfileCard({ me, avatarUrl, status, isAdmin, onOpen, onEdit, size = 64, variant = "desk" }) {
  const t = useT();
  const model = profileCardModel(me, { status, isAdmin, teamLabel: t("staffBadge.tip"), fallbackName: t("User") });
  const user = { ...me, avatarUrl: avatarUrl || me?.avatarUrl };
  const room = effectRoom(size);
  return (
    <section className={`spc spc-${variant}`} style={{ "--spc-av": `${size}px`, "--spc-room": `${room}px` }} aria-label={model.display}>
      <div
        className="spc-banner"
        aria-hidden="true"
        style={{ background: model.bannerUrl ? `${cssUrl(model.bannerUrl)} center/cover no-repeat` : model.bannerFallback }}
      />
      <div className="spc-body">
        <div className="spc-top">
          <button type="button" className="spc-avatar" onClick={onOpen} aria-label={model.display}>
            <Avatar name={model.display} size={size} user={user} loading="eager" />
            {model.status ? <StatusBadge status={model.status} user={me} /> : null}
          </button>
          <div className="spc-badges">
            <ProfileBadgeRow user={me} me={me} size={variant === "ios" ? "ios" : "md"} />
          </div>
        </div>
        <button type="button" className="spc-id" onClick={onOpen}>
          <span className="spc-name">
            <span className="spc-name-t">{model.display}</span>
            <AdminBadge user={me} variant="inline" />
          </span>
          <span className="spc-meta">{model.meta}</span>
        </button>
        <button type="button" className="spc-edit" onClick={onEdit}>
          <Pencil size={16} aria-hidden="true" />
          {t("Edit profile")}
        </button>
      </div>
    </section>
  );
}
