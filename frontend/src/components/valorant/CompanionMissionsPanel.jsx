import { Target } from "lucide-react";
import useValorantMissions from "../../hooks/useValorantMissions";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

/**
 * Minimal Adım 5 stub for Dima's missions / contracts / BP UI.
 * Wire hook only — replace layout/copy freely; keep useValorantMissions.
 */
export default function CompanionMissionsPanel({ linked, identity }) {
  const t = useT();
  const region = identity?.region || "eu";
  const puuid = identity?.puuid || null;
  const {
    loading,
    error,
    configured,
    envNeeded,
    missions,
    missionCounts,
    battlePass,
    contracts,
    refresh,
  } = useValorantMissions({
    enabled: Boolean(linked),
    region,
    puuid,
  });

  if (!linked) return null;

  return (
    <div className="valorant-companion-card valorant-missions" data-adim="5">
      <div className="valorant-companion-icon" aria-hidden>
        <Target size={22} />
      </div>
      <h3>{t("valorantHub.missionsTitle")}</h3>
      <p className="valorant-auth-lead">{t("valorantHub.missionsLead")}</p>

      {loading ? (
        <div className="valorant-auth-skeleton" aria-busy="true">
          <SkeletonLine width="40%" height={12} />
          <div style={{ height: 8 }} />
          <SkeletonLine width="70%" height={12} />
        </div>
      ) : !configured ? (
        <div className="valorant-auth-env-hint" role="note">
          <div>
            <p>
              <strong>{t("valorantHub.missionsConfigTitle")}</strong>
            </p>
            <p>{t("valorantHub.missionsNotConfigured")}</p>
            {envNeeded?.length ? (
              <code className="valorant-auth-env-list">{envNeeded.join(", ")}</code>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="valorant-missions-summary">
          <p>
            {t("valorantHub.missionsOpenCount", {
              open: missionCounts?.open ?? 0,
              total: missionCounts?.total ?? missions.length,
            })}
          </p>
          {battlePass ? (
            <p>
              {t("valorantHub.missionsBpLevel", {
                name: battlePass.displayName || t("valorantHub.missionsBpFallback"),
                level: battlePass.level ?? 0,
              })}
            </p>
          ) : (
            <p className="muted">{t("valorantHub.missionsBpNone")}</p>
          )}
          <p className="muted">
            {t("valorantHub.missionsContractsCount", {
              count: contracts?.length ?? 0,
            })}
          </p>
          <button type="button" className="valorant-auth-btn ghost" onClick={refresh}>
            {t("valorantHub.refresh")}
          </button>
        </div>
      )}

      {error ? <div className="valorant-auth-error">{error}</div> : null}
      <p className="valorant-companion-note">{t("valorantHub.missionsStubNote")}</p>
    </div>
  );
}
