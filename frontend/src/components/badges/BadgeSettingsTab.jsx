// Ayarlar → Rozetler (mockup 03-equip, adapted to "next to": the country badge always shows,
// you pick which one special badge sits beside it, or none).
import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, Gift } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { CountryFlag } from "../shop/CountryFlag";
import { SpecialBadgeIcon, ART_BY_ID } from "./specialBadgeArt.jsx";
import { useBadgeCopy } from "./SpecialBadge.jsx";
import { showBadgeToast } from "./BadgeToast.jsx";
import { equipMine, holdersOf, loadCatalog, loadUserBadges, sortOwned, useSpecialBadgeStore, userBadgesState } from "../../lib/specialBadges";
import { hapticSelection, hapticSuccess } from "../../lib/fluid/haptics";
import { openPromoRedeem } from "../../lib/promoBus";

export default function BadgeSettingsTab({ me }) {
  const { t, locale, name, tierLabel, num } = useBadgeCopy();
  useSpecialBadgeStore();
  const meId = me?.id || me?._id || null;
  useEffect(() => {
    if (!meId) return;
    loadUserBadges(meId, { fresh: true }).catch(() => {});
    loadCatalog().catch(() => {});
  }, [meId]);
  const { data, error } = userBadgesState(meId);
  const owned = sortOwned(data?.badges || [], "tier", name);
  const eq = data?.equipped || null;
  const lastWorn = useRef(null);
  if (eq) lastWorn.current = eq;
  const [busy, setBusy] = useState(false);
  const country = me?.equippedCountry || null;
  const countryName = country ? (country.name || country.label || t("badges.modeCountry")) : t("badges.noCountry");
  const now = new Date().toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const myName = me?.displayName || me?.username || "";

  const equip = async (badgeId) => {
    if (busy || !meId || badgeId === eq) return;
    const before = eq;
    hapticSelection();
    setBusy(true);
    try {
      await equipMine(meId, badgeId);
      hapticSuccess();
      showBadgeToast({
        id: badgeId || before,
        text: badgeId ? t("badges.toastOn", { name: name(badgeId) }) : t("badges.toastOff", { name: name(before) }),
        undo: () => equipMine(meId, before).catch(() => showBadgeToast({ text: t("badges.errEquip"), tone: "err" })),
      });
    } catch {
      showBadgeToast({ text: t("badges.errEquip"), tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const specialPick = eq || (lastWorn.current && owned.some((b) => b.id === lastWorn.current) ? lastWorn.current : owned[0]?.id) || null;

  return (
    <div className="us-tab">
      <p className="us-lead">{t("badges.settingsLead")}</p>
      <section className="us-section">
        <h4 className="us-section-label">{t("badges.sectionBeside")}</h4>
        <div className="us-theme-grid bs-mode">
          <button type="button" className={`us-theme-card${!eq ? " selected" : ""}`} aria-pressed={!eq} disabled={busy} onClick={() => equip(null)}>
            <div className="us-theme-meta bs-mode-meta">
              {country ? <CountryFlag item={country} size={20} decorative /> : null}
              <div><b>{t("badges.modeCountry")}</b><span>{countryName}</span></div>
            </div>
            {!eq && <Check size={14} className="us-theme-check" />}
          </button>
          <button type="button" className={`us-theme-card${eq ? " selected" : ""}`} aria-pressed={Boolean(eq)} disabled={busy || !specialPick} onClick={() => specialPick && equip(specialPick)}>
            <div className="us-theme-meta bs-mode-meta">
              {specialPick ? <SpecialBadgeIcon id={specialPick} size={22} /> : null}
              <div><b>{t("badges.modeSpecial")}</b><span>{specialPick ? name(specialPick) : t("badges.pickBelow")}</span></div>
            </div>
            {eq && <Check size={14} className="us-theme-check" />}
          </button>
        </div>
        <div className="bs-preview" aria-label={t("badges.previewAria")}>
          <Avatar name={myName} size={36} user={me} animate="none" />
          <div className="bs-preview-body">
            <div className="bs-preview-line">
              <b>{myName}</b>
              {country ? <CountryFlag item={country} size={14} decorative /> : null}
              {eq ? <SpecialBadgeIcon id={eq} size={17} /> : null}
              <time className="tnum">{t("badges.today", { time: now })}</time>
            </div>
            <p>{t("badges.previewBody")}</p>
          </div>
        </div>
      </section>
      <section className="us-section">
        <h4 className="us-section-label">{t("badges.sectionOwned")} <span className="tnum bs-count">{owned.length}</span></h4>
        {error && !data ? <p className="us-row-desc">{t("badges.errLoad")}</p> : null}
        {data && owned.length === 0 ? (
          <div className="bp-empty bs-empty">
            <h3>{t("badges.emptySelf")}</h3>
            <p>{t("badges.emptySelfBody")}</p>
            <button type="button" className="bp-btn is-ghost" onClick={() => openPromoRedeem()}><Gift size={14} /> {t("badges.useCode")}</button>
          </div>
        ) : null}
        {owned.length ? (
          <div className="bs-grid">
            {owned.map((b) => {
              const tier = ART_BY_ID[b.id].tier;
              const h = holdersOf(b.id);
              const on = eq === b.id;
              return (
                <button type="button" key={b.id} className={`bs-card${on ? " selected" : ""}`} aria-pressed={on} disabled={busy}
                  onClick={() => equip(on ? null : b.id)}
                  aria-label={t(on ? "badges.tileAriaOn" : "badges.tileAria", { name: name(b.id), tier: tierLabel(tier), serial: `#${String(b.serial).padStart(3, "0")}` })}>
                  <SpecialBadgeIcon id={b.id} size={48} />
                  <span className="bs-card-text">
                    <b>{name(b.id)}</b>
                    <span className={`sb-tier-pill t-${tier}`}>{tierLabel(tier)}</span>
                    {h != null ? <span className="bs-rare tnum">{t("badges.holdersShort", { n: num(h) })}</span> : null}
                  </span>
                  {on ? <span className="bs-on"><Check size={12} /> {t("badges.wearing")}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <p className="us-row-desc ps-hint"><Sparkles size={13} /> {t("badges.settingsHint")}</p>
      </section>
    </div>
  );
}
