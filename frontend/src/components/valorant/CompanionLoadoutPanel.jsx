import { Loader2, RefreshCw, Shirt, Sparkles } from "lucide-react";
import useValorantLoadout from "../../hooks/useValorantLoadout";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

/**
 * Adım 6 stub — equipped loadout visible + equip() for Dima to polish.
 * Keep useValorantLoadout as the data source (Dimaru API contract).
 */
export default function CompanionLoadoutPanel({ linked, identity }) {
  const t = useT();
  const region = identity?.region || "eu";
  const puuid = identity?.puuid || null;
  const {
    loading,
    busy,
    error,
    configured,
    envNeeded,
    loadout,
    refresh,
    equip,
  } = useValorantLoadout({
    enabled: Boolean(linked),
    region,
    puuid,
  });

  if (!linked) return null;

  const guns = loadout?.guns || [];
  const identityRow = loadout?.identity || null;
  const sprays = loadout?.sprays || [];

  return (
    <div className="valorant-loadout" data-adim="6">
      <div className="valorant-party-header">
        <div>
          <h4>{t("valorantHub.loadoutTitle")}</h4>
          <p className="valorant-party-sub">{t("valorantHub.loadoutLead")}</p>
        </div>
        <button
          type="button"
          className="valorant-auth-btn ghost"
          onClick={refresh}
          disabled={busy || loading}
          title={t("valorantHub.refresh")}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {t("valorantHub.refresh")}
        </button>
      </div>

      {loading && !loadout ? (
        <div className="valorant-auth-skeleton" aria-busy="true">
          <SkeletonLine width="40%" height={12} />
          <div style={{ height: 8 }} />
          <SkeletonLine width="70%" height={12} />
        </div>
      ) : null}

      {!loading && !configured ? (
        <div className="valorant-auth-env-hint" role="note">
          <div>
            <p>
              <strong>{t("valorantHub.storeConfigTitle")}</strong>
            </p>
            <p>{t("valorantHub.storeNotConfigured")}</p>
            {envNeeded?.length ? (
              <code className="valorant-auth-env-list">{envNeeded.join(", ")}</code>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <div className="valorant-auth-error">{error}</div> : null}

      {configured && loadout ? (
        <>
          <div className="valorant-loadout-identity">
            <Shirt size={16} aria-hidden />
            <div>
              <div className="valorant-loadout-id-title">
                {identityRow?.cardName || t("valorantHub.loadoutCard")}
                {identityRow?.titleName ? ` · ${identityRow.titleName}` : ""}
              </div>
              <div className="valorant-loadout-id-meta">
                {t("valorantHub.loadoutLevel", { level: identityRow?.accountLevel ?? "—" })}
              </div>
            </div>
            {identityRow?.cardIcon ? (
              <img src={identityRow.cardIcon} alt="" className="valorant-store-thumb" />
            ) : null}
          </div>

          <div className="valorant-store-section">
            <h5>{t("valorantHub.loadoutGuns")}</h5>
            {guns.length ? (
              <ul className="valorant-loadout-guns">
                {guns.slice(0, 10).map((g) => (
                  <li key={g.weaponId || g.skinId}>
                    {g.skinIcon ? (
                      <img src={g.skinIcon} alt="" className="valorant-store-thumb" />
                    ) : (
                      <span className="valorant-store-thumb placeholder" />
                    )}
                    <div>
                      <div className="valorant-store-item-title">
                        {g.skinName || g.skinId || t("valorantHub.loadoutSkin")}
                      </div>
                      <div className="valorant-store-item-meta">
                        {g.weaponName || g.weaponId || "—"}
                        {g.buddyName ? ` · ${g.buddyName}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="valorant-party-sub muted">{t("valorantHub.loadoutEmpty")}</p>
            )}
          </div>

          <div className="valorant-store-section">
            <div className="valorant-store-section-head">
              <Sparkles size={14} aria-hidden />
              <h5>{t("valorantHub.loadoutSprays")}</h5>
            </div>
            {sprays.length ? (
              <ul className="valorant-store-skins">
                {sprays.map((s) => (
                  <li key={s.slotId || s.sprayId} title={s.sprayName || s.sprayId}>
                    {s.sprayIcon ? (
                      <img src={s.sprayIcon} alt={s.sprayName || ""} />
                    ) : (
                      <span className="valorant-store-thumb placeholder tiny" />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="valorant-party-sub muted">{t("valorantHub.loadoutSpraysEmpty")}</p>
            )}
          </div>

          {/* Expose equip for Dima — stub keeps a no-op affordance note */}
          <p className="valorant-auth-footnote muted">
            {t("valorantHub.loadoutEquipHint")}
            <span className="valorant-loadout-equip-api" hidden>
              {typeof equip === "function" ? "equip-ready" : ""}
            </span>
          </p>
        </>
      ) : null}

      {configured && !loadout && !loading ? (
        <p className="valorant-party-sub muted">{t("valorantHub.loadoutEmpty")}</p>
      ) : null}
    </div>
  );
}
