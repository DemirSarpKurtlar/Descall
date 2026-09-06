import { useState } from "react";
import { Loader2, Package, RefreshCw, ShoppingBag, Wallet } from "lucide-react";
import useValorantStore from "../../hooks/useValorantStore";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";
import CompanionSkinDetail from "./CompanionSkinDetail";

/**
 * Adım 6 — wallet + daily offers + owned skins.
 * Opens real Riot skin media (displayIcon / levels / chromas streamedVideo) on item click.
 */
export default function CompanionStorePanel({ linked, identity }) {
  const t = useT();
  const region = identity?.region || "eu";
  const puuid = identity?.puuid || null;
  const [selected, setSelected] = useState(null);
  const {
    loading,
    error,
    configured,
    envNeeded,
    wallet,
    offers,
    bundles,
    offersRemainingSeconds,
    skins,
    skinCount,
    refresh,
  } = useValorantStore({
    enabled: Boolean(linked),
    region,
    puuid,
  });

  if (!linked) {
    return (
      <div className="valorant-store valorant-party-locked" data-adim="6">
        <p>{t("valorantHub.storeNeedLink")}</p>
      </div>
    );
  }

  const hoursLeft =
    typeof offersRemainingSeconds === "number"
      ? Math.max(0, Math.round(offersRemainingSeconds / 3600))
      : null;

  const openSkin = (uuid, name, icon) => {
    if (!uuid) return;
    setSelected({ uuid, name, icon });
  };

  return (
    <div className="valorant-store" data-adim="6">
      <div className="valorant-party-header">
        <div>
          <h4>{t("valorantHub.storeTitle")}</h4>
          <p className="valorant-party-sub">{t("valorantHub.storeLead")}</p>
        </div>
        <button
          type="button"
          className="valorant-auth-btn ghost"
          onClick={refresh}
          disabled={loading}
          title={t("valorantHub.refresh")}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {t("valorantHub.refresh")}
        </button>
      </div>

      {loading && !wallet ? (
        <div className="valorant-auth-skeleton" aria-busy="true">
          <SkeletonLine width="40%" height={12} />
          <div style={{ height: 8 }} />
          <SkeletonLine width="70%" height={12} />
          <div style={{ height: 8 }} />
          <SkeletonLine width="55%" height={12} />
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

      {configured ? (
        <>
          <div className="valorant-store-wallet">
            <div className="valorant-store-wallet-head">
              <Wallet size={16} aria-hidden />
              <span>{t("valorantHub.storeWallet")}</span>
            </div>
            <ul className="valorant-store-wallet-list">
              <li>
                <span>VP</span>
                <strong>{wallet?.vp ?? "—"}</strong>
              </li>
              <li>
                <span>Radianite</span>
                <strong>{wallet?.radianite ?? "—"}</strong>
              </li>
              <li>
                <span>Kingdom</span>
                <strong>{wallet?.kingdom ?? "—"}</strong>
              </li>
            </ul>
          </div>

          <div className="valorant-store-section">
            <div className="valorant-store-section-head">
              <ShoppingBag size={14} aria-hidden />
              <h5>
                {t("valorantHub.storeItemDaily")}
                {hoursLeft != null ? (
                  <span className="muted"> · {t("valorantHub.storeHoursLeft", { hours: hoursLeft })}</span>
                ) : null}
              </h5>
            </div>
            {offers?.length ? (
              <ul className="valorant-store-offers">
                {offers.slice(0, 4).map((o) => {
                  const uuid = o.itemId || o.offerId;
                  return (
                    <li key={o.offerId || o.itemId}>
                      <button
                        type="button"
                        className="valorant-store-item-btn"
                        onClick={() => openSkin(uuid, o.displayName, o.displayIcon)}
                      >
                        {o.displayIcon ? (
                          <img src={o.displayIcon} alt="" className="valorant-store-thumb" />
                        ) : (
                          <span className="valorant-store-thumb placeholder" />
                        )}
                        <div>
                          <div className="valorant-store-item-title">
                            {o.displayName || o.itemId || t("valorantHub.storeOffer")}
                          </div>
                          <div className="valorant-store-item-meta">
                            {o.cost != null
                              ? t("valorantHub.storePrice", {
                                  amount: o.cost,
                                  currency: (o.currency || "vp").toUpperCase(),
                                })
                              : "—"}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="valorant-party-sub muted">{t("valorantHub.storeOffersEmpty")}</p>
            )}
          </div>

          <div className="valorant-store-section">
            <div className="valorant-store-section-head">
              <Package size={14} aria-hidden />
              <h5>{t("valorantHub.storeItemBundle")}</h5>
            </div>
            {bundles?.length ? (
              <ul className="valorant-store-offers">
                {bundles.slice(0, 2).map((b) => (
                  <li key={b.bundleId || b.displayName}>
                    {b.displayIcon ? (
                      <img src={b.displayIcon} alt="" className="valorant-store-thumb" />
                    ) : (
                      <span className="valorant-store-thumb placeholder" />
                    )}
                    <div>
                      <div className="valorant-store-item-title">
                        {b.displayName || b.bundleId || t("valorantHub.storeBundle")}
                      </div>
                      <div className="valorant-store-item-meta">
                        {t("valorantHub.storeBundleItems", { count: b.items?.length || 0 })}
                      </div>
                      {b.items?.length ? (
                        <div className="valorant-store-bundle-items">
                          {b.items.slice(0, 4).map((it) => (
                            <button
                              key={it.itemId || it.displayName}
                              type="button"
                              className="valorant-store-bundle-chip"
                              onClick={() => openSkin(it.itemId, it.displayName, it.displayIcon)}
                              disabled={!it.itemId}
                            >
                              {it.displayIcon ? (
                                <img src={it.displayIcon} alt="" />
                              ) : (
                                <span className="valorant-store-thumb placeholder tiny" />
                              )}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="valorant-party-sub muted">{t("valorantHub.storeBundlesEmpty")}</p>
            )}
          </div>

          <div className="valorant-store-section">
            <h5>{t("valorantHub.storeOwnedSkins", { count: skinCount || skins?.length || 0 })}</h5>
            {skins?.length ? (
              <ul className="valorant-store-skins">
                {skins.slice(0, 12).map((s) => {
                  const uuid = s.itemId || s.instanceId;
                  return (
                    <li key={uuid || s.displayName} title={s.displayName || s.itemId}>
                      <button
                        type="button"
                        className="valorant-store-skin-btn"
                        onClick={() => openSkin(uuid, s.displayName, s.displayIcon)}
                      >
                        {s.displayIcon ? (
                          <img src={s.displayIcon} alt={s.displayName || ""} />
                        ) : (
                          <span className="valorant-store-thumb placeholder tiny" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="valorant-party-sub muted">{t("valorantHub.storeSkinsEmpty")}</p>
            )}
          </div>

          {selected ? (
            <CompanionSkinDetail
              skinUuid={selected.uuid}
              fallbackName={selected.name}
              fallbackIcon={selected.icon}
              onClose={() => setSelected(null)}
            />
          ) : null}

          <p className="valorant-auth-footnote muted">{t("valorantHub.storeFootnote")}</p>
        </>
      ) : null}
    </div>
  );
}
