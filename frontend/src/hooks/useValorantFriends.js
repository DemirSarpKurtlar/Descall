import { useCallback, useEffect, useRef, useState } from "react";
import {
  getValorantFriendsStatus,
  inviteValorantFriendToParty,
  localFriendRequestAccept,
  localFriendRequestRemove,
  localFriendRequestSend,
  localFriends,
  localGetTokens,
  localStatus,
  hasLocalFriendsApi,
} from "../api/valorantFriends";

const EMPTY_COUNTS = { total: 0, online: 0, inGame: 0, offline: 0 };

/**
 * Wire hook for Dima's Adım 4 Companion friends/presence panel.
 * Does not render UI — polls Electron local chat when available.
 *
 * @param {{ enabled?: boolean, pollMs?: number, region?: string, puuid?: string }} opts
 */
export default function useValorantFriends(opts = {}) {
  const { enabled = true, pollMs = 15000, region = "eu", puuid = null } = opts;
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [capability, setCapability] = useState(null);
  const [friends, setFriends] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [inbound, setInbound] = useState([]);
  const [outbound, setOutbound] = useState([]);
  const [requests, setRequests] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const [cap, bundle] = await Promise.all([
        getValorantFriendsStatus().catch(() => null),
        localFriends(),
      ]);
      if (!mounted.current) return null;
      setCapability(cap);
      if (!bundle?.ok) {
        setFriends([]);
        setCounts(EMPTY_COUNTS);
        setInbound([]);
        setOutbound([]);
        setRequests([]);
        setError(bundle?.error || "");
        return bundle;
      }
      setFriends(bundle.friends || []);
      setCounts(bundle.counts || EMPTY_COUNTS);
      setInbound(bundle.inbound || []);
      setOutbound(bundle.outbound || []);
      setRequests(bundle.requests || []);
      setError("");
      return bundle;
    } catch (err) {
      if (!mounted.current) return null;
      setError(err.message || "Failed to load friends");
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled || !hasLocalFriendsApi()) return undefined;
    const id = setInterval(() => {
      refresh();
    }, Math.max(5000, Number(pollMs) || 15000));
    return () => clearInterval(id);
  }, [enabled, pollMs, refresh]);

  const withBusy = useCallback(
    async (fn) => {
      if (busy) return null;
      setBusy(true);
      setError("");
      try {
        const result = await fn();
        await refresh();
        return result;
      } catch (err) {
        setError(err.message || "Friends action failed");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh]
  );

  const sendRequest = useCallback(
    (riotIdOrParts) =>
      withBusy(async () => {
        const payload =
          typeof riotIdOrParts === "string" ? { riotId: riotIdOrParts } : riotIdOrParts || {};
        const res = await localFriendRequestSend(payload);
        if (!res?.ok) throw new Error(res?.error || "Failed to send friend request");
        return res;
      }),
    [withBusy]
  );

  const acceptRequest = useCallback(
    (targetPuuid) =>
      withBusy(async () => {
        const res = await localFriendRequestAccept({ puuid: targetPuuid });
        if (!res?.ok) throw new Error(res?.error || "Failed to accept friend request");
        return res;
      }),
    [withBusy]
  );

  const removeRequest = useCallback(
    (targetPuuid) =>
      withBusy(async () => {
        const res = await localFriendRequestRemove({ puuid: targetPuuid });
        if (!res?.ok) throw new Error(res?.error || "Failed to remove friend request");
        return res;
      }),
    [withBusy]
  );

  const inviteToParty = useCallback(
    async (friendOrRiotId) =>
      withBusy(async () => {
        const loc = await localStatus();
        let tokens = null;
        if (loc?.hasTokens) {
          const tok = await localGetTokens();
          if (tok?.ok) tokens = tok.tokens;
        }
        const live = {
          accessToken: tokens?.accessToken || null,
          entitlementToken: tokens?.entitlementToken || null,
          region: region || loc?.session?.region || "eu",
          puuid: puuid || loc?.session?.puuid || null,
        };
        return inviteValorantFriendToParty(friendOrRiotId, live);
      }),
    [withBusy, region, puuid]
  );

  return {
    loading,
    busy,
    error,
    capability,
    friends,
    counts,
    inbound,
    outbound,
    requests,
    desktopReady: hasLocalFriendsApi(),
    refresh,
    sendRequest,
    acceptRequest,
    removeRequest,
    inviteToParty,
  };
}
