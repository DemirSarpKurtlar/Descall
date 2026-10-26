// App-level glue for special badges: socket events (granted / revoked / equipped on another
// device), the badge toast, and the promo-code bridge in the current language.
import { useEffect, useRef } from "react";
import { useLocale } from "../../context/LocaleContext";
import { BadgeToast, showBadgeToast } from "./BadgeToast.jsx";
import { registerSpecialPromoBadges } from "./promoBridge.jsx";
import { ART_BY_ID } from "./specialBadgeArt.jsx";
import { equipMine, formatSerial, invalidateUser, loadCatalog, loadUserBadges, noteEquipped, userBadgesState } from "../../lib/specialBadges";
import { hapticSuccess, hapticWarning } from "../../lib/fluid/haptics";
import { translate } from "../../i18n";

export default function SpecialBadgeHost({ socket, meId }) {
  const { locale } = useLocale();
  const loc = useRef(locale);
  loc.current = locale;

  useEffect(() => { registerSpecialPromoBadges(locale); }, [locale]);
  useEffect(() => { if (meId) loadCatalog().catch(() => {}); }, [meId]);

  useEffect(() => {
    if (!socket || !meId) return undefined;
    const t = (k, v) => translate(loc.current, k, v);
    const nameOf = (id) => {
      const v = t(`badges.names.${id}`);
      return v && v !== `badges.names.${id}` ? v : id;
    };
    const onGranted = (p = {}) => {
      const id = p.id || p.badgeId;
      if (!ART_BY_ID[id]) return;
      invalidateUser(meId);
      loadUserBadges(meId, { fresh: true }).catch(() => {});
      loadCatalog({ fresh: true }).catch(() => {});
      hapticSuccess();
      const serial = formatSerial(p.serial);
      const fromName = p.from?.displayName || p.from?.username;
      const sub = p.via === "promo" ? t("badges.grantedVia", { serial })
        : fromName ? t("badges.grantedBy", { name: fromName, serial }) : t("badges.grantedTeam", { serial });
      showBadgeToast({
        id,
        text: `${t("badges.newBadge")}: ${nameOf(id)} · ${sub}`,
        action: {
          label: t("badges.wearNow"),
          run: () => equipMine(meId, id).then(() => {
            hapticSuccess();
            showBadgeToast({ id, text: t("badges.toastOn", { name: nameOf(id) }) });
          }).catch(() => showBadgeToast({ text: t("badges.errEquip"), tone: "err" })),
        },
      });
    };
    const onRevoked = (p = {}) => {
      const id = p.id || p.badgeId;
      if (!ART_BY_ID[id]) return;
      if (userBadgesState(meId).data?.equipped === id) noteEquipped(meId, null);
      invalidateUser(meId);
      loadUserBadges(meId, { fresh: true }).catch(() => {});
      hapticWarning();
      showBadgeToast({ id, tone: "err", text: `${t("badges.revokedTitle")} · ${t("badges.revokedBody", { name: nameOf(id) })}` });
    };
    const onEquipped = (p = {}) => {
      const id = p.badgeId ?? null;
      if (id && !ART_BY_ID[id]) return;
      const serial = userBadgesState(meId).data?.badges?.find((b) => b.id === id)?.serial || 0;
      noteEquipped(meId, id ? { id, serial } : null);
    };
    socket.on("special-badge:granted", onGranted);
    socket.on("special-badge:revoked", onRevoked);
    socket.on("special-badge:equipped", onEquipped);
    return () => {
      socket.off("special-badge:granted", onGranted);
      socket.off("special-badge:revoked", onRevoked);
      socket.off("special-badge:equipped", onEquipped);
    };
  }, [socket, meId]);

  return <BadgeToast />;
}
