import { useMemo, useState } from "react";
import {
  Check,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import useValorantFriends from "../../hooks/useValorantFriends";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

function statusLabel(t, status) {
  switch (status) {
    case "ingame":
      return t("valorantHub.presenceIngame");
    case "pregame":
      return t("valorantHub.presencePregame");
    case "queue":
      return t("valorantHub.presenceQueue");
    case "menus":
      return t("valorantHub.presenceMenus");
    case "online":
      return t("valorantHub.presenceOnline");
    case "away":
      return t("valorantHub.presenceAway");
    case "dnd":
      return t("valorantHub.presenceDnd");
    default:
      return t("valorantHub.presenceOffline");
  }
}

function presenceMeta(friend) {
  const priv = friend?.presence?.private || null;
  const bits = [];
  if (priv?.queueLabel) bits.push(priv.queueLabel);
  if (priv?.rankTier) bits.push(priv.rankTier);
  if (priv?.score) bits.push(`${priv.score.ally}-${priv.score.enemy}`);
  if (friend?.note) bits.push(friend.note);
  return bits.join(" · ");
}

/**
 * Adım 4 — Companion friends / presence / requests / online party invite.
 * Wired exactly to Dimaru's useValorantFriends + /friends/party-invite contract.
 * No mock list — desktop + Riot Client required for live data.
 */
export default function CompanionFriendsPanel({ linked = false, identity = null }) {
  const t = useT();
  const [filter, setFilter] = useState("online"); // online | all | requests
  const [addInput, setAddInput] = useState("");

  const {
    loading,
    busy,
    error,
    capability,
    friends,
    counts,
    inbound,
    outbound,
    desktopReady,
    refresh,
    sendRequest,
    acceptRequest,
    removeRequest,
    inviteToParty,
  } = useValorantFriends({
    enabled: Boolean(linked),
    region: identity?.region || "eu",
    puuid: identity?.puuid || null,
  });

  const webNote =
    capability?.note ||
    t("valorantHub.friendsNeedDesktop");

  const visibleFriends = useMemo(() => {
    if (filter === "all") return friends;
    if (filter === "online") return friends.filter((f) => f.online);
    return [];
  }, [filter, friends]);

  const handleInvite = async (friend) => {
    if (!friend) return;
    try {
      await inviteToParty(friend);
    } catch {
      /* error surfaced on hook */
    }
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const riotId = addInput.trim();
    if (!riotId) return;
    try {
      await sendRequest(riotId);
      setAddInput("");
    } catch {
      /* error surfaced on hook */
    }
  };

  if (!linked) {
    return (
      <div className="valorant-friends valorant-party-locked" role="note">
        <Users size={18} aria-hidden />
        <p>{t("valorantHub.friendsNeedLink")}</p>
      </div>
    );
  }

  return (
    <div className="valorant-friends">
      <div className="valorant-party-header">
        <div>
          <h4>{t("valorantHub.friendsTitle")}</h4>
          <p className="valorant-party-sub">{t("valorantHub.friendsLead")}</p>
        </div>
        <button
          type="button"
          className="valorant-auth-btn ghost"
          onClick={() => refresh()}
          disabled={busy || loading || !desktopReady}
          title={t("valorantHub.refresh")}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {t("valorantHub.refresh")}
        </button>
      </div>

      {!desktopReady ? (
        <div className="valorant-party-hint" role="status">
          <Users size={14} aria-hidden />
          <p>{webNote}</p>
        </div>
      ) : null}

      {desktopReady ? (
        <>
          <div className="valorant-friends-counts" aria-live="polite">
            <span className="valorant-auth-pill rank">
              {counts.inGame} {t("valorantHub.friendsInGame")}
            </span>
            <span className="valorant-auth-pill">
              {counts.online} {t("valorantHub.friendsOnline")}
            </span>
            <span className="valorant-auth-pill muted">
              {counts.total} {t("valorantHub.friendsTotal")}
            </span>
            {inbound.length ? (
              <span className="valorant-auth-pill">
                {inbound.length} {t("valorantHub.friendsRequests")}
              </span>
            ) : null}
          </div>

          <div className="valorant-friends-filters" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "online"}
              className={`valorant-friends-filter${filter === "online" ? " is-active" : ""}`}
              onClick={() => setFilter("online")}
            >
              {t("valorantHub.friendsFilterOnline")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={`valorant-friends-filter${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              {t("valorantHub.friendsFilterAll")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "requests"}
              className={`valorant-friends-filter${filter === "requests" ? " is-active" : ""}`}
              onClick={() => setFilter("requests")}
            >
              {t("valorantHub.friendsFilterRequests")}
              {inbound.length + outbound.length
                ? ` (${inbound.length + outbound.length})`
                : ""}
            </button>
          </div>

          <form className="valorant-party-invite valorant-friends-add" onSubmit={handleAdd}>
            <label htmlFor="valorant-friend-add">{t("valorantHub.friendsAdd")}</label>
            <div className="valorant-party-invite-row">
              <input
                id="valorant-friend-add"
                type="text"
                placeholder="Name#TAG"
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
              <button
                type="submit"
                className="valorant-auth-btn primary"
                disabled={busy || !addInput.trim()}
              >
                <UserPlus size={14} /> {t("valorantHub.friendsSendRequest")}
              </button>
            </div>
          </form>

          {loading && !friends.length && filter !== "requests" ? (
            <div className="valorant-auth-skeleton" aria-busy="true">
              <SkeletonLine width="42%" height={14} />
              <div style={{ height: 10 }} />
              <SkeletonLine width="68%" height={12} />
              <div style={{ height: 8 }} />
              <SkeletonLine width="55%" height={12} />
            </div>
          ) : null}

          {error && !friends.length && filter !== "requests" ? (
            <div className="valorant-party-hint" role="status">
              <p>
                {/lockfile|Riot Client|not running/i.test(error)
                  ? t("valorantHub.friendsNeedClient")
                  : error}
              </p>
            </div>
          ) : null}

          {filter === "requests" ? (
            <div className="valorant-friends-requests">
              <h5>{t("valorantHub.friendsInbound")}</h5>
              {inbound.length === 0 ? (
                <p className="valorant-party-sub">{t("valorantHub.friendsNoInbound")}</p>
              ) : (
                <ul className="valorant-party-members">
                  {inbound.map((r) => (
                    <li key={r.puuid}>
                      <div className="valorant-party-member-main">
                        <span className="valorant-party-member-name">
                          {r.riotId || r.puuid?.slice(0, 8)}
                        </span>
                      </div>
                      <div className="valorant-friends-row-actions">
                        <button
                          type="button"
                          className="valorant-auth-btn ghost tiny"
                          disabled={busy}
                          onClick={() => acceptRequest(r.puuid).catch(() => {})}
                          title={t("valorantHub.friendsAccept")}
                        >
                          <Check size={14} /> {t("valorantHub.friendsAccept")}
                        </button>
                        <button
                          type="button"
                          className="valorant-auth-btn ghost tiny"
                          disabled={busy}
                          onClick={() => removeRequest(r.puuid).catch(() => {})}
                          title={t("valorantHub.friendsDecline")}
                        >
                          <X size={14} /> {t("valorantHub.friendsDecline")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h5>{t("valorantHub.friendsOutbound")}</h5>
              {outbound.length === 0 ? (
                <p className="valorant-party-sub">{t("valorantHub.friendsNoOutbound")}</p>
              ) : (
                <ul className="valorant-party-members">
                  {outbound.map((r) => (
                    <li key={r.puuid}>
                      <div className="valorant-party-member-main">
                        <span className="valorant-party-member-name">
                          {r.riotId || r.puuid?.slice(0, 8)}
                        </span>
                        <span className="valorant-party-member-meta">
                          {t("valorantHub.friendsPendingOut")}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="valorant-auth-btn ghost tiny"
                        disabled={busy}
                        onClick={() => removeRequest(r.puuid).catch(() => {})}
                      >
                        <X size={14} /> {t("valorantHub.friendsCancelRequest")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul
              className="valorant-party-members valorant-friends-list"
              aria-label={t("valorantHub.friendsTitle")}
            >
              {visibleFriends.map((f) => (
                <li
                  key={f.puuid}
                  className={f.inGame ? "is-ingame" : f.online ? "is-online" : ""}
                >
                  <div className="valorant-party-member-main">
                    <span className="valorant-party-member-name">
                      <span
                        className={`valorant-presence-dot status-${f.status || "offline"}`}
                        aria-hidden
                      />
                      {f.riotId || f.puuid?.slice(0, 8) || "—"}
                    </span>
                    <span className="valorant-party-member-meta">
                      {statusLabel(t, f.status)}
                      {presenceMeta(f) ? ` · ${presenceMeta(f)}` : ""}
                    </span>
                  </div>
                  {f.online ? (
                    <button
                      type="button"
                      className="valorant-auth-btn ghost tiny"
                      disabled={busy}
                      onClick={() => handleInvite(f)}
                    >
                      <UserPlus size={14} /> {t("valorantHub.invite")}
                    </button>
                  ) : null}
                </li>
              ))}
              {!loading && visibleFriends.length === 0 && !error ? (
                <li className="valorant-friends-empty">
                  <span className="valorant-party-member-meta">
                    {filter === "online"
                      ? t("valorantHub.friendsNoneOnline")
                      : t("valorantHub.friendsEmpty")}
                  </span>
                </li>
              ) : null}
            </ul>
          )}
        </>
      ) : null}

      {error && desktopReady && friends.length ? (
        <div className="valorant-auth-error">{error}</div>
      ) : null}
      {error && !desktopReady ? (
        <div className="valorant-auth-error">{error}</div>
      ) : null}
    </div>
  );
}
