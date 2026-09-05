import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crown,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Square,
  UserPlus,
  Users,
} from "lucide-react";
import {
  generateValorantPartyCode,
  getValorantParty,
  inviteValorantParty,
  setValorantPartyReady,
  setValorantQueue,
  startValorantQueue,
  stopValorantQueue,
  transferValorantParty,
} from "../../api/valorant";
import { localGetTokens, localStatus } from "../../lib/valorantSecureStore";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

const QUEUE_OPTIONS = [
  { id: "competitive", labelKey: "valorantHub.queueCompetitive" },
  { id: "unrated", labelKey: "valorantHub.queueUnrated" },
  { id: "swiftplay", labelKey: "valorantHub.queueSwiftplay" },
  { id: "spikerush", labelKey: "valorantHub.queueSpikeRush" },
  { id: "deathmatch", labelKey: "valorantHub.queueDeathmatch" },
  { id: "hurm", labelKey: "valorantHub.queueTdm" },
];

/**
 * Adım 3 — live party + queue controls.
 * Adım 4 friends panel invites also call inviteValorantParty.
 * Requires live Riot Client entitlement tokens (Electron lockfile) for GLZ.
 */
export default function CompanionPartyPanel({ identity = null, linked = false }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [party, setParty] = useState(null);
  const [inviteInput, setInviteInput] = useState("");
  const [tokens, setTokens] = useState(null);

  const tokenArgs = useMemo(() => {
    const region = identity?.region || tokens?.region || "eu";
    const puuid = identity?.puuid || tokens?.puuid || null;
    return {
      accessToken: tokens?.accessToken || null,
      entitlementToken: tokens?.entitlementToken || null,
      region,
      puuid,
    };
  }, [identity, tokens]);

  const loadTokens = useCallback(async () => {
    const loc = await localStatus();
    if (!loc?.hasTokens) {
      setTokens((prev) => (prev ? null : prev));
      return null;
    }
    const tok = await localGetTokens();
    if (!tok?.ok) {
      setTokens((prev) => (prev ? null : prev));
      return null;
    }
    const next = {
      accessToken: tok.tokens?.accessToken || null,
      entitlementToken: tok.tokens?.entitlementToken || null,
      region: tok.session?.region || identity?.region || "eu",
      puuid: tok.session?.puuid || identity?.puuid || null,
    };
    setTokens((prev) => {
      if (
        prev &&
        prev.accessToken === next.accessToken &&
        prev.entitlementToken === next.entitlementToken &&
        prev.region === next.region &&
        prev.puuid === next.puuid
      ) {
        return prev;
      }
      return next;
    });
    return next;
  }, [identity?.region, identity?.puuid]);

  const refresh = useCallback(async () => {
    if (!linked) {
      setParty(null);
      setLoading(false);
      setHint("");
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    setHint("");
    try {
      const live = (await loadTokens()) || {
        accessToken: null,
        entitlementToken: null,
        region: identity?.region || "eu",
        puuid: identity?.puuid || null,
      };
      const res = await getValorantParty(live);
      setParty(res?.party || null);
      if (!res?.party && res?.message) setHint(res.message);
    } catch (err) {
      setParty(null);
      if (err.code === "TOKENS_REQUIRED" || err.status === 401) {
        setHint(t("valorantHub.partyTokensHint"));
        setError("");
      } else {
        setError(err.message || t("valorantHub.partyLoadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [linked, loadTokens, t, identity?.region, identity?.puuid]);

  useEffect(() => {
    refresh();
    if (!linked) return undefined;
    const id = setInterval(() => {
      refresh();
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while linked; refresh identity is stable enough
  }, [linked]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const live = (await loadTokens()) || tokenArgs;
      const res = await fn(live);
      if (res?.party) setParty(res.party);
      else await refresh();
    } catch (err) {
      setError(err.message || t("valorantHub.partyActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (e) => {
    e?.preventDefault?.();
    const riotId = inviteInput.trim();
    if (!riotId) return;
    await run((live) => inviteValorantParty(riotId, live));
    setInviteInput("");
  };

  if (!linked) {
    return (
      <div className="valorant-party valorant-party-locked" role="note">
        <Users size={18} aria-hidden />
        <p>{t("valorantHub.partyNeedLink")}</p>
      </div>
    );
  }

  return (
    <div className="valorant-party">
      <div className="valorant-party-header">
        <div>
          <h4>{t("valorantHub.partyTitle")}</h4>
          <p className="valorant-party-sub">{t("valorantHub.partyLead")}</p>
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

      {loading && !party ? (
        <div className="valorant-auth-skeleton" aria-busy="true">
          <SkeletonLine width="40%" height={14} />
          <div style={{ height: 10 }} />
          <SkeletonLine width="70%" height={12} />
          <div style={{ height: 8 }} />
          <SkeletonLine width="55%" height={12} />
        </div>
      ) : null}

      {hint && !party ? (
        <div className="valorant-party-hint" role="status">
          <Link2 size={14} aria-hidden />
          <p>{hint}</p>
        </div>
      ) : null}

      {party ? (
        <>
          <div className="valorant-party-meta">
            <span className="valorant-auth-pill">
              {(party.region || "eu").toUpperCase()}
            </span>
            {party.queueLabel || party.queueId ? (
              <span className="valorant-auth-pill">
                {party.queueLabel || party.queueId}
              </span>
            ) : null}
            {party.state ? (
              <span className={`valorant-auth-pill${party.queueing ? " rank" : " muted"}`}>
                {party.queueing ? t("valorantHub.queueing") : party.state}
              </span>
            ) : null}
            {party.accessibility ? (
              <span className="valorant-auth-pill muted">{party.accessibility}</span>
            ) : null}
          </div>

          <div className="valorant-party-code-row">
            <div>
              <div className="valorant-party-code-label">{t("valorantHub.partyCode")}</div>
              <code className="valorant-party-code">
                {party.partyCode || t("valorantHub.partyCodeNone")}
              </code>
            </div>
            <button
              type="button"
              className="valorant-auth-btn ghost"
              disabled={busy || !party.isOwner}
              onClick={() => run((live) => generateValorantPartyCode(live))}
            >
              {t("valorantHub.generateCode")}
            </button>
          </div>

          <ul className="valorant-party-members" aria-label={t("valorantHub.partyMembers")}>
            {(party.members || []).map((m) => (
              <li key={m.puuid} className={m.isSelf ? "is-self" : ""}>
                <div className="valorant-party-member-main">
                  <span className="valorant-party-member-name">
                    {m.riotId || m.puuid?.slice(0, 8) || "—"}
                    {m.isOwner ? <Crown size={12} aria-label={t("valorantHub.leader")} /> : null}
                  </span>
                  <span className="valorant-party-member-meta">
                    {m.rankTier || t("valorantHub.unranked")}
                    {m.isReady ? ` · ${t("valorantHub.ready")}` : ""}
                  </span>
                </div>
                {party.isOwner && !m.isSelf ? (
                  <button
                    type="button"
                    className="valorant-auth-btn ghost tiny"
                    disabled={busy}
                    onClick={() => run((live) => transferValorantParty(m.puuid, live))}
                  >
                    {t("valorantHub.makeLeader")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="valorant-party-queue">
            <label className="valorant-party-queue-label" htmlFor="valorant-queue-select">
              {t("valorantHub.gameMode")}
            </label>
            <select
              id="valorant-queue-select"
              className="valorant-party-select"
              disabled={busy || !party.isOwner || party.queueing}
              value={party.queueId || "competitive"}
              onChange={(e) => {
                const q = e.target.value;
                run((live) => setValorantQueue(q, live));
              }}
            >
              {QUEUE_OPTIONS.map((q) => (
                <option key={q.id} value={q.id}>
                  {t(q.labelKey)}
                </option>
              ))}
              {party.queueId && !QUEUE_OPTIONS.some((q) => q.id === party.queueId) ? (
                <option value={party.queueId}>{party.queueLabel || party.queueId}</option>
              ) : null}
            </select>

            <div className="valorant-party-queue-actions">
              {party.queueing ? (
                <button
                  type="button"
                  className="valorant-auth-btn danger"
                  disabled={busy || !party.isOwner}
                  onClick={() => run((live) => stopValorantQueue(live))}
                >
                  <Square size={14} /> {t("valorantHub.stopQueue")}
                </button>
              ) : (
                <button
                  type="button"
                  className="valorant-auth-btn primary"
                  disabled={busy || !party.isOwner}
                  onClick={() => run((live) => startValorantQueue(live))}
                >
                  <Play size={14} /> {t("valorantHub.startQueue")}
                </button>
              )}
              <button
                type="button"
                className="valorant-auth-btn ghost"
                disabled={busy}
                onClick={() => {
                  const self = (party.members || []).find((m) => m.isSelf);
                  run((live) => setValorantPartyReady(!(self?.isReady), live));
                }}
              >
                {t("valorantHub.toggleReady")}
              </button>
            </div>
          </div>

          <form className="valorant-party-invite" onSubmit={handleInvite}>
            <label htmlFor="valorant-invite-riotid">{t("valorantHub.inviteByRiotId")}</label>
            <div className="valorant-party-invite-row">
              <input
                id="valorant-invite-riotid"
                type="text"
                placeholder="Name#TAG"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
              <button
                type="submit"
                className="valorant-auth-btn primary"
                disabled={busy || !inviteInput.trim()}
              >
                <UserPlus size={14} /> {t("valorantHub.invite")}
              </button>
            </div>
            <p className="valorant-party-invite-note">{t("valorantHub.inviteFriendsNote")}</p>
          </form>
        </>
      ) : null}

      {error ? <div className="valorant-auth-error">{error}</div> : null}
    </div>
  );
}
