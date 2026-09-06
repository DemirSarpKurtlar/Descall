import { useCallback, useEffect, useRef, useState } from "react";
import {
  activateValorantContract,
  getValorantMissions,
  getValorantMissionsStatus,
  localMissionsTokens,
} from "../api/valorantMissions";

/**
 * Wire hook for Dima's Adım 5 Companion missions / contracts / BP panel.
 * Does not own full UI — polls status + missions when enabled + linked.
 *
 * @param {{ enabled?: boolean, region?: string, puuid?: string, pollMs?: number }} opts
 */
export default function useValorantMissions(opts = {}) {
  const { enabled = true, region = "eu", puuid = null, pollMs = 60000 } = opts;
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [capability, setCapability] = useState(null);
  const [bundle, setBundle] = useState(null);
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
      const cap = await getValorantMissionsStatus().catch(() => null);
      if (!mounted.current) return null;
      setCapability(cap);

      if (cap && cap.configured === false) {
        setBundle({
          configured: false,
          envNeeded: cap.envNeeded || ["RIOT_API_KEY"],
          missions: [],
          contracts: [],
          battlePass: null,
        });
        setError("");
        return cap;
      }

      const local = await localMissionsTokens();
      const tokens = {
        accessToken: local?.tokens?.accessToken,
        entitlementToken: local?.tokens?.entitlementToken,
        region: region || local?.session?.region || "eu",
        puuid: puuid || local?.session?.puuid || null,
      };

      const data = await getValorantMissions(tokens);
      if (!mounted.current) return null;
      setBundle(data);
      setError("");
      return data;
    } catch (err) {
      if (!mounted.current) return null;
      setError(err.message || "Failed to load missions");
      if (err.body?.configured === false) {
        setBundle(err.body);
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, region, puuid]);

  useEffect(() => {
    refresh();
    if (!enabled || !pollMs) return undefined;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, enabled, pollMs]);

  const activate = useCallback(
    async (contractId) => {
      if (!contractId || busy) return null;
      setBusy(true);
      setError("");
      try {
        const local = await localMissionsTokens();
        const tokens = {
          accessToken: local?.tokens?.accessToken,
          entitlementToken: local?.tokens?.entitlementToken,
          region: region || local?.session?.region || "eu",
          puuid: puuid || local?.session?.puuid || null,
        };
        const data = await activateValorantContract(contractId, tokens);
        if (mounted.current) setBundle(data);
        return data;
      } catch (err) {
        if (mounted.current) setError(err.message || "Activate failed");
        return null;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, region, puuid]
  );

  return {
    loading,
    busy,
    error,
    capability,
    configured: capability?.configured !== false && bundle?.configured !== false,
    envNeeded: bundle?.envNeeded || capability?.envNeeded || [],
    missions: bundle?.missions || [],
    missionCounts: bundle?.missionCounts || { total: 0, complete: 0, open: 0 },
    missionMetadata: bundle?.missionMetadata || null,
    contracts: bundle?.contracts || [],
    battlePass: bundle?.battlePass || null,
    activeSpecialContract: bundle?.activeSpecialContract || null,
    refresh,
    activate,
  };
}
