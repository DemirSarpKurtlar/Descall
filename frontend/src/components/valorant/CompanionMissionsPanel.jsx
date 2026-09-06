import { Loader2, RefreshCw, ScrollText, Target, Trophy } from "lucide-react";
import useValorantMissions from "../../hooks/useValorantMissions";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

/**
 * Adım 5 — missions / contracts / Battle Pass Companion panel.
 * Keep useValorantMissions as the data source (Dimaru API contract).
 */
export default function CompanionMissionsPanel({ linked, identity }) {
  const t = useT();
  const region = identity?.region || "eu";
  const puuid = identity?.puuid || null;
  const {
    loading,
    busy,
    error,
    configured,
    envNeeded,
    missions,
    missionCounts,
    battlePass,
    contracts,
    activeSpecialContract,
    refresh,
    activate,
  } = useValorantMissions({
    enabled: Boolean(linked),
    region,
    puuid,
  });

  if (!linked) return null;

  const openMissions = (missions || []).filter((m) => !m.complete);
  const doneMissions = (missions || []).filter((m) => m.complete);
  const agentContracts = (contracts || []).filter((c) => c.kind === "agent" || c.kind === "event" || c.kind === "other");

  return (
    <div className="valorant-missions" data-adim="5">
      <div className="valorant-party-header">
        <div>
          <h4>{t("valorantHub.missionsTitle")}</h4>
          <p className="valorant-party-sub">{t("valorantHub.missionsLead")}</p>
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

      {loading && !missions?.length && !battlePass ? (
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
              <strong>{t("valorantHub.missionsConfigTitle")}</strong>
            </p>
            <p>{t("valorantHub.missionsNotConfigured")}</p>
            {envNeeded?.length ? (
              <code className="valorant-auth-env-list">{envNeeded.join(", ")}</code>
            ) : null}
          </div>
        </div>
      ) : null}

      {configured ? (
        <>
          <div className="valorant-missions-bp">
            <div className="valorant-missions-bp-head">
              <Trophy size={16} aria-hidden />
              <div>
                <div className="valorant-missions-bp-title">
                  {battlePass?.displayName || t("valorantHub.missionsBpFallback")}
                </div>
                {battlePass ? (
                  <div className="valorant-missions-bp-meta">
                    {t("valorantHub.missionsBpLevel", {
                      name: battlePass.displayName || t("valorantHub.missionsBpFallback"),
                      level: battlePass.level ?? 0,
                    })}
                  </div>
                ) : (
                  <div className="valorant-missions-bp-meta muted">{t("valorantHub.missionsBpNone")}</div>
                )}
              </div>
            </div>
            {battlePass ? (
              <div
                className="valorant-missions-xp"
                role="progressbar"
                aria-valuenow={battlePass.xpTowardsNext ?? 0}
                aria-valuemin={0}
                aria-valuemax={Math.max(1, battlePass.xpTowardsNext ?? 0, 100)}
              >
                <div
                  className="valorant-missions-xp-fill"
                  style={{
                    width: `${Math.min(100, Math.max(4, Number(battlePass.xpTowardsNext) || 0) % 100 || 8)}%`,
                  }}
                />
              </div>
            ) : null}
            <div className="valorant-friends-counts">
              <span className="valorant-auth-pill rank">
                {t("valorantHub.missionsOpenCount", {
                  open: missionCounts?.open ?? openMissions.length,
                  total: missionCounts?.total ?? missions.length,
                })}
              </span>
              <span className="valorant-auth-pill muted">
                {t("valorantHub.missionsContractsCount", {
                  count: agentContracts.length,
                })}
              </span>
            </div>
          </div>

          <section className="valorant-missions-section" aria-label={t("valorantHub.missionsWeekly")}>
            <h5>
              <Target size={14} aria-hidden /> {t("valorantHub.missionsWeekly")}
            </h5>
            {openMissions.length === 0 && doneMissions.length === 0 ? (
              <p className="valorant-friends-empty">{t("valorantHub.missionsEmpty")}</p>
            ) : (
              <ul className="valorant-missions-list">
                {openMissions.map((m) => (
                  <li key={m.id || JSON.stringify(m.objectives)}>
                    <div className="valorant-missions-item-main">
                      <span className="valorant-missions-item-title">
                        {m.id ? String(m.id).slice(0, 8) : t("valorantHub.missionsMission")}
                      </span>
                      <span className="valorant-missions-item-meta">
                        {t("valorantHub.missionsProgress", {
                          progress: m.objectiveProgress ?? 0,
                          objectives: m.objectives?.length ?? 0,
                        })}
                        {m.expirationTime
                          ? ` · ${new Date(m.expirationTime).toLocaleDateString()}`
                          : ""}
                      </span>
                    </div>
                    <span className="valorant-auth-pill">{t("valorantHub.missionsOpen")}</span>
                  </li>
                ))}
                {doneMissions.slice(0, 6).map((m) => (
                  <li key={`done-${m.id}`} className="is-done">
                    <div className="valorant-missions-item-main">
                      <span className="valorant-missions-item-title">
                        {m.id ? String(m.id).slice(0, 8) : t("valorantHub.missionsMission")}
                      </span>
                      <span className="valorant-missions-item-meta">{t("valorantHub.missionsComplete")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="valorant-missions-section" aria-label={t("valorantHub.missionsContracts")}>
            <h5>
              <ScrollText size={14} aria-hidden /> {t("valorantHub.missionsContracts")}
            </h5>
            {activeSpecialContract ? (
              <p className="valorant-missions-active">
                {t("valorantHub.missionsActiveContract", {
                  name: activeSpecialContract.displayName || activeSpecialContract.contractDefinitionId || "—",
                })}
              </p>
            ) : null}
            {agentContracts.length === 0 ? (
              <p className="valorant-friends-empty">{t("valorantHub.missionsContractsEmpty")}</p>
            ) : (
              <ul className="valorant-missions-list">
                {agentContracts.slice(0, 12).map((c) => (
                  <li key={c.contractDefinitionId || c.displayName}>
                    <div className="valorant-missions-item-main">
                      <span className="valorant-missions-item-title">
                        {c.displayName || c.contractDefinitionId?.slice(0, 8) || "—"}
                      </span>
                      <span className="valorant-missions-item-meta">
                        {t("valorantHub.missionsContractLevel", {
                          level: c.level ?? 0,
                          xp: c.xpTowardsNext ?? 0,
                        })}
                        {c.kind ? ` · ${c.kind}` : ""}
                      </span>
                    </div>
                    {c.contractDefinitionId ? (
                      <button
                        type="button"
                        className="valorant-auth-btn ghost tiny"
                        disabled={busy}
                        onClick={() => activate(c.contractDefinitionId)}
                      >
                        {t("valorantHub.missionsActivate")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {error ? <div className="valorant-auth-error">{error}</div> : null}
      <p className="valorant-companion-note">{t("valorantHub.missionsFootnote")}</p>
    </div>
  );
}
